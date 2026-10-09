from datetime import date, datetime, timedelta

import pytest

import categorizer
from models import Category, CategorizerModel, Transaction, TransactionHistory


# Two merchants with distinct wording and distinct categories, repeated often
# enough that a linear model has something to fit. Dates are split either side
# of 2026-06-01 so the training and test selections can be expressed as date
# ranges, like the real screen will.
TRAIN_UNTIL = date(2026, 5, 31)


@pytest.fixture()
def categories(db):
    groceries = Category(name="Groceries", type="Expense")
    transport = Category(name="Transport", type="Expense")
    db.add_all([groceries, transport])
    db.commit()
    return groceries, transport


def _add(db, account_id, label, category_id, day, payee=None, amount=-10.0):
    t = Transaction(
        date=day,
        payee=payee if payee is not None else label,
        amount=amount,
        account_id=account_id,
        category_id=category_id,
        raw_label=label,
        raw_source="linxo_export",
    )
    db.add(t)
    return t


@pytest.fixture()
def history(db, sample_account, categories):
    """60 training rows and 10 test rows over two unmistakable merchants."""
    groceries, transport = categories
    for i in range(30):
        _add(db, sample_account.id, f"CARTE 0{i % 9 + 1}/03 SUPERMARCHE DU COIN", groceries.id,
             date(2026, 3, i % 28 + 1), payee="SUPERMARCHE DU COIN")
        _add(db, sample_account.id, f"CARTE 0{i % 9 + 1}/04 METRO TICKET BUREAU", transport.id,
             date(2026, 4, i % 28 + 1), payee="METRO TICKET BUREAU")
    for i in range(5):
        _add(db, sample_account.id, f"CARTE 1{i}/07 SUPERMARCHE DU COIN", groceries.id,
             date(2026, 7, i + 1), payee="SUPERMARCHE DU COIN")
        _add(db, sample_account.id, f"CARTE 1{i}/07 METRO TICKET BUREAU", transport.id,
             date(2026, 7, i + 1), payee="METRO TICKET BUREAU")
    db.commit()
    return groceries, transport


def _train_body(**overrides):
    body = {
        "train": {"date_to": TRAIN_UNTIL.isoformat()},
        "test": {"date_from": "2026-06-01"},
    }
    body.update(overrides)
    return body


# ── the engine itself ────────────────────────────────────────────

def test_label_text_prefers_the_raw_label_and_falls_back_to_payee(db, sample_account):
    with_raw = Transaction(date=date(2026, 1, 1), payee="Renamed", amount=-1.0,
                           account_id=sample_account.id, raw_label="CARTE 01/01 SHOP")
    without = Transaction(date=date(2026, 1, 1), payee="Renamed", amount=-1.0,
                          account_id=sample_account.id)
    assert categorizer.label_text(with_raw) == "CARTE 01/01 SHOP"
    assert categorizer.label_text(without) == "Renamed"


def test_merchant_key_ignores_dates_and_reference_numbers():
    assert (categorizer.merchant_key("CARTE 06/10/26 DECATHLON 1375 CB*4325")
            == categorizer.merchant_key("CARTE 11/02 DECATHLON 1375 CB*9999"))


def test_payee_memory_keeps_a_stable_name_and_drops_an_unstable_one(db, sample_account):
    rows = []
    # Seen four times under one name: stable.
    for i in range(4):
        rows.append(_add(db, sample_account.id, "PRLV SEPA SFR", None, date(2026, 1, i + 1), payee="SFR"))
    # Seen four times under four names: nothing to propose.
    for i in range(4):
        rows.append(_add(db, sample_account.id, "VIR SEPA CASH", None, date(2026, 2, i + 1),
                         payee=f"Cash trip {i}"))
    db.commit()

    memory = categorizer.build_payee_memory(rows, min_occurrences=2, min_stability=0.9)
    assert memory.suggest(rows[0]) == "SFR"
    assert memory.suggest(rows[-1]) is None


def test_payee_memory_respects_the_occurrence_gate(db, sample_account):
    rows = [_add(db, sample_account.id, "PRLV SEPA SFR", None, date(2026, 1, 1), payee="SFR")]
    db.commit()
    assert categorizer.build_payee_memory(rows, 2, 0.9).suggest(rows[0]) is None
    assert categorizer.build_payee_memory(rows, 1, 0.9).suggest(rows[0]) == "SFR"


def test_trainable_drops_rows_with_no_category_or_no_text(db, sample_account, categories):
    groceries, _ = categories
    good = _add(db, sample_account.id, "CARTE 01/01 SHOP", groceries.id, date(2026, 1, 1))
    no_category = _add(db, sample_account.id, "CARTE 01/01 SHOP", None, date(2026, 1, 2))
    no_text = Transaction(date=date(2026, 1, 3), payee="", amount=-1.0,
                          account_id=sample_account.id, category_id=groceries.id)
    db.add(no_text)
    db.commit()
    assert categorizer.trainable([good, no_category, no_text]) == [good]


def test_a_trained_model_round_trips_through_its_blob(db, history):
    rows = db.query(Transaction).filter(Transaction.date <= TRAIN_UNTIL).all()
    model, params = categorizer.train(rows)
    assert params["classes"] == 2
    restored = categorizer.loads(categorizer.dumps(model))
    target = db.query(Transaction).filter(Transaction.date > TRAIN_UNTIL).first()
    assert restored.predict([target]) == model.predict([target])


# ── POST /train ──────────────────────────────────────────────────

def test_train_stores_a_model_with_metrics_and_leaves_it_inactive(client, db, history):
    groceries, transport = history
    response = client.post("/api/categorizer/train", json=_train_body(note="first"))
    assert response.status_code == 200, response.text
    body = response.json()

    assert body["status"] == "ready"
    # Inactive on purpose: the user reads the metrics, then activates.
    assert body["is_active"] is False
    assert body["trained_rows"] == 60
    assert body["tested_rows"] == 10
    assert body["note"] == "first"
    assert body["metrics"]["accuracy"] == pytest.approx(1.0)
    assert body["metrics"]["parent_accuracy"] == pytest.approx(1.0)
    assert "baseline" in body["metrics"]
    assert body["metrics"]["payee"]["merchants"] >= 2
    assert [t["threshold"] for t in body["metrics"]["thresholds"]] == list(categorizer.REPORT_THRESHOLDS)

    stored = db.query(CategorizerModel).one()
    assert stored.blob is not None


def test_train_rejects_overlapping_selections(client, history):
    response = client.post("/api/categorizer/train", json={
        "train": {"date_to": TRAIN_UNTIL.isoformat()},
        "test": {},  # everything, so it swallows the training rows
    })
    assert response.status_code == 422
    assert "overlap" in response.json()["detail"]


def test_train_rejects_a_selection_too_small_to_learn_from(client, db, sample_account, categories):
    groceries, _ = categories
    _add(db, sample_account.id, "CARTE 01/01 SHOP", groceries.id, date(2026, 1, 1))
    db.commit()
    response = client.post("/api/categorizer/train", json=_train_body())
    assert response.status_code == 422
    assert str(categorizer.MIN_TRAINING_ROWS) in response.json()["detail"]


def test_train_rejects_a_single_category(client, db, sample_account, categories):
    groceries, _ = categories
    for i in range(60):
        _add(db, sample_account.id, f"CARTE 01/01 SHOP {i}", groceries.id, date(2026, 1, 1))
    db.commit()
    response = client.post("/api/categorizer/train", json=_train_body())
    assert response.status_code == 422
    assert "single category" in response.json()["detail"]


def test_train_refuses_while_another_run_is_in_flight(client, db, history):
    db.add(CategorizerModel(status="training"))
    db.commit()
    response = client.post("/api/categorizer/train", json=_train_body())
    assert response.status_code == 409


def test_a_stale_training_row_does_not_block_forever(client, db, history):
    db.add(CategorizerModel(status="training",
                            created_at=datetime.utcnow() - timedelta(hours=2)))
    db.commit()
    assert client.post("/api/categorizer/train", json=_train_body()).status_code == 200


def test_train_keeps_only_the_most_recent_models(client, db, history):
    for i in range(7):
        db.add(CategorizerModel(status="ready", blob=b"x", created_at=datetime(2020, 1, i + 1)))
    db.commit()
    client.post("/api/categorizer/train", json=_train_body())
    from routers.categorizer import KEEP_MODELS
    assert db.query(CategorizerModel).filter(CategorizerModel.status == "ready").count() == KEEP_MODELS


def test_pruning_never_drops_the_active_model(client, db, history):
    active = CategorizerModel(status="ready", blob=b"x", is_active=True, created_at=datetime(2019, 1, 1))
    db.add(active)
    for i in range(6):
        db.add(CategorizerModel(status="ready", blob=b"x", created_at=datetime(2020, 1, i + 1)))
    db.commit()
    client.post("/api/categorizer/train", json=_train_body())
    db.refresh(active)
    assert active.is_active is True


# ── models list / activate / delete ──────────────────────────────

def test_activate_moves_the_active_flag(client, db, history):
    first = client.post("/api/categorizer/train", json=_train_body()).json()
    assert client.post(f"/api/categorizer/models/{first['id']}/activate").json()["is_active"] is True
    second = client.post("/api/categorizer/train", json=_train_body()).json()
    client.post(f"/api/categorizer/models/{second['id']}/activate")

    models = {m["id"]: m for m in client.get("/api/categorizer/models").json()}
    assert models[first["id"]]["is_active"] is False
    assert models[second["id"]]["is_active"] is True


def test_activate_refuses_a_model_that_never_finished(client, db):
    row = CategorizerModel(status="failed", error="boom")
    db.add(row)
    db.commit()
    assert client.post(f"/api/categorizer/models/{row.id}/activate").status_code == 422


def test_delete_refuses_the_active_model(client, history):
    model = client.post("/api/categorizer/train", json=_train_body()).json()
    client.post(f"/api/categorizer/models/{model['id']}/activate")
    assert client.delete(f"/api/categorizer/models/{model['id']}").status_code == 409


def test_delete_removes_an_inactive_model(client, db, history):
    model = client.post("/api/categorizer/train", json=_train_body()).json()
    assert client.delete(f"/api/categorizer/models/{model['id']}").status_code == 204
    assert db.query(CategorizerModel).count() == 0


# ── POST /suggest ────────────────────────────────────────────────

@pytest.fixture()
def active_model(client, history):
    model = client.post("/api/categorizer/train", json=_train_body()).json()
    client.post(f"/api/categorizer/models/{model['id']}/activate")
    return model


def test_suggest_needs_an_active_model(client, db, history):
    client.post("/api/categorizer/train", json=_train_body())
    response = client.post("/api/categorizer/suggest", json={"selection": {"date_from": "2026-06-01"}})
    assert response.status_code == 409


def test_suggest_reports_a_category_and_its_confidence(client, db, active_model, sample_account, history):
    groceries, _ = history
    target = _add(db, sample_account.id, "CARTE 02/08 SUPERMARCHE DU COIN", None, date(2026, 8, 1),
                  payee="whatever")
    db.commit()

    body = client.post("/api/categorizer/suggest", json={"transaction_ids": [target.id]}).json()
    assert body["model_id"] == active_model["id"]
    item = body["items"][0]
    assert item["suggested_category_id"] == groceries.id
    assert item["suggested_category_name"] == "Groceries"
    assert 0.0 < item["confidence"] <= 1.0
    assert item["current_category_id"] is None
    assert item["category_changed"] is True
    assert body["category_changes"] == 1


def test_suggest_proposes_the_remembered_payee(client, db, active_model, sample_account):
    target = _add(db, sample_account.id, "CARTE 09/08 SUPERMARCHE DU COIN", None, date(2026, 8, 9),
                  payee="CARTE 09/08 SUPERMARCHE DU COIN")
    db.commit()
    item = client.post("/api/categorizer/suggest", json={"transaction_ids": [target.id]}).json()["items"][0]
    assert item["suggested_payee"] == "SUPERMARCHE DU COIN"
    assert item["payee_changed"] is True


def test_suggest_accepts_a_selection_and_honours_its_limit(client, active_model):
    body = client.post("/api/categorizer/suggest",
                       json={"selection": {"date_from": "2026-06-01"}, "limit": 3}).json()
    assert len(body["items"]) == 3


def test_suggest_404s_on_an_unknown_transaction(client, active_model):
    assert client.post("/api/categorizer/suggest", json={"transaction_ids": [999999]}).status_code == 404


def test_suggest_needs_something_to_work_on(client, active_model):
    assert client.post("/api/categorizer/suggest", json={}).status_code == 422


# ── POST /apply ──────────────────────────────────────────────────

def test_apply_writes_a_category_per_row_and_leaves_it_unreconciled(client, db, sample_account, categories):
    groceries, transport = categories
    a = _add(db, sample_account.id, "A", None, date(2026, 1, 1))
    b = _add(db, sample_account.id, "B", None, date(2026, 1, 2))
    a.reconciled = True
    db.commit()

    response = client.post("/api/categorizer/apply", json={"items": [
        {"transaction_id": a.id, "category_id": groceries.id},
        {"transaction_id": b.id, "category_id": transport.id},
    ]})
    assert response.status_code == 200
    assert response.json()["updated_count"] == 2

    db.refresh(a), db.refresh(b)
    # Different categories in one call: the whole point of not reusing
    # /api/transactions/bulk-update.
    assert a.category_id == groceries.id
    assert b.category_id == transport.id
    assert a.reconciled is False


def test_apply_leaves_a_hand_set_category_alone_by_default(client, db, sample_account, categories):
    groceries, transport = categories
    t = _add(db, sample_account.id, "A", groceries.id, date(2026, 1, 1))
    db.commit()

    body = client.post("/api/categorizer/apply", json={
        "items": [{"transaction_id": t.id, "category_id": transport.id}],
    }).json()
    assert body["updated_count"] == 0
    assert body["skipped_transaction_ids"] == [t.id]
    db.refresh(t)
    assert t.category_id == groceries.id


def test_apply_overwrites_when_explicitly_asked(client, db, sample_account, categories):
    groceries, transport = categories
    t = _add(db, sample_account.id, "A", groceries.id, date(2026, 1, 1))
    db.commit()
    client.post("/api/categorizer/apply", json={
        "items": [{"transaction_id": t.id, "category_id": transport.id}],
        "overwrite_category": True,
    })
    db.refresh(t)
    assert t.category_id == transport.id


def test_apply_can_rename_without_touching_the_category(client, db, sample_account, categories):
    groceries, _ = categories
    t = _add(db, sample_account.id, "CARTE 01/01 SFR", groceries.id, date(2026, 1, 1),
             payee="CARTE 01/01 SFR")
    db.commit()
    body = client.post("/api/categorizer/apply", json={
        "items": [{"transaction_id": t.id, "payee": "SFR"}],
    }).json()
    assert body["updated_count"] == 1
    db.refresh(t)
    assert t.payee == "SFR"
    assert t.category_id == groceries.id
    # The frozen copy is what makes an automatic rename reversible.
    assert t.raw_label == "CARTE 01/01 SFR"


def test_apply_records_history_tagged_as_the_categorizer(client, db, sample_account, categories):
    groceries, _ = categories
    t = _add(db, sample_account.id, "A", None, date(2026, 1, 1))
    db.commit()
    client.post("/api/categorizer/apply",
                json={"items": [{"transaction_id": t.id, "category_id": groceries.id}]})
    row = db.query(TransactionHistory).filter(TransactionHistory.transaction_id == t.id).one()
    assert row.source == "categorizer"
    assert row.changes["category_id"]["new"] == groceries.id


def test_apply_rejects_an_item_that_changes_nothing(client, db, sample_account):
    t = _add(db, sample_account.id, "A", None, date(2026, 1, 1))
    db.commit()
    response = client.post("/api/categorizer/apply", json={"items": [{"transaction_id": t.id}]})
    assert response.status_code == 422


def test_apply_rejects_the_same_transaction_twice(client, db, sample_account, categories):
    groceries, transport = categories
    t = _add(db, sample_account.id, "A", None, date(2026, 1, 1))
    db.commit()
    response = client.post("/api/categorizer/apply", json={"items": [
        {"transaction_id": t.id, "category_id": groceries.id},
        {"transaction_id": t.id, "category_id": transport.id},
    ]})
    assert response.status_code == 422


def test_apply_404s_on_an_unknown_category(client, db, sample_account):
    t = _add(db, sample_account.id, "A", None, date(2026, 1, 1))
    db.commit()
    response = client.post("/api/categorizer/apply",
                           json={"items": [{"transaction_id": t.id, "category_id": 999999}]})
    assert response.status_code == 404


def test_apply_invalidates_the_aggregate_caches(client, db, sample_account, categories):
    import cache_service
    groceries, _ = categories
    t = _add(db, sample_account.id, "A", None, date(2026, 1, 1))
    db.commit()
    cache_service.get_or_compute(db, "charts", {"user_id": 1}, lambda: {"stale": True})

    client.post("/api/categorizer/apply",
                json={"items": [{"transaction_id": t.id, "category_id": groceries.id}]})
    assert cache_service.get_or_compute(db, "charts", {"user_id": 1}, lambda: {"fresh": True}) == {"fresh": True}


def test_a_trained_model_survives_an_overwrite_restore(client, db, history):
    """The blob is derived data, so it is not in an archive — which is exactly
    why the restore must not drop the table along with everything else."""
    model = client.post("/api/categorizer/train", json=_train_body()).json()
    client.post(f"/api/categorizer/models/{model['id']}/activate")
    archive = client.get("/api/backup/export").content

    response = client.post(
        "/api/backup/import?mode=overwrite",
        files={"file": ("backup.zip", archive, "application/zip")},
    )
    assert response.status_code == 200, response.text

    restored = db.query(CategorizerModel).filter(CategorizerModel.id == model["id"]).one()
    assert restored.is_active is True
    assert restored.blob is not None


def test_train_refuses_a_test_selection_it_cannot_score(client, history):
    response = client.post("/api/categorizer/train", json={
        "train": {"date_to": TRAIN_UNTIL.isoformat()},
        "test": {"date_from": "2030-01-01"},
    })
    assert response.status_code == 422
    assert "could not be scored" in response.json()["detail"]


def test_apply_still_renames_when_the_category_is_refused(client, db, sample_account, categories):
    """The two halves of an item are independent: a category the user already
    set by hand blocks the category, not the rename."""
    groceries, transport = categories
    t = _add(db, sample_account.id, "CARTE 01/01 SFR", groceries.id, date(2026, 1, 1),
             payee="CARTE 01/01 SFR")
    db.commit()

    body = client.post("/api/categorizer/apply", json={"items": [
        {"transaction_id": t.id, "category_id": transport.id, "payee": "SFR"},
    ]}).json()

    assert body["skipped_transaction_ids"] == [t.id]
    assert body["updated_count"] == 1
    db.refresh(t)
    assert t.category_id == groceries.id
    assert t.payee == "SFR"
