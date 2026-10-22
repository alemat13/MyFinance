from datetime import date, datetime

import pytest

import enable_banking
import transaction_rules
from models import (
    BankAccountLink, BankConnection, Category, CategorySplit, GlobalSplitWeight,
    Transaction, TransactionHistory, TransactionRule, TransactionSplit,
)
from tests.test_import import PREVIEW_FORM, _csv_file


@pytest.fixture()
def groceries(db):
    category = Category(name="Groceries", type="Expense")
    db.add(category)
    db.commit()
    return category


@pytest.fixture()
def phone(db):
    category = Category(name="Phone", type="Expense")
    db.add(category)
    db.commit()
    return category


def _txn(db, account_id, payee, amount=-10.0, raw_label=None, category_id=None, reconciled=False,
         user_id=None, day=date(2026, 8, 1)):
    t = Transaction(date=day, payee=payee, amount=amount, account_id=account_id,
                    category_id=category_id, raw_label=raw_label, reconciled=reconciled)
    db.add(t)
    db.flush()
    if user_id is not None:
        db.add(TransactionSplit(transaction_id=t.id, user_id=user_id, weight=1,
                                share_amount=amount, source="global"))
    db.commit()
    return t


def _rule(db, name, conditions, actions, position=0, enabled=True, match_mode="all"):
    rule = TransactionRule(name=name, conditions=conditions, actions=actions, position=position,
                           enabled=enabled, match_mode=match_mode)
    db.add(rule)
    db.commit()
    return rule


def _contains(field, value):
    return {"field": field, "operator": "contains", "value": value}


# ── CRUD ─────────────────────────────────────────────────────────

def test_create_list_update_delete(client, groceries):
    body = {
        "name": "SFR",
        "conditions": [_contains("raw_label", "sfr")],
        "actions": {"payee": "SFR", "category_id": groceries.id},
    }
    created = client.post("/api/rules", json=body)
    assert created.status_code == 201, created.text
    rule = created.json()
    assert rule["position"] == 0 and rule["enabled"] is True
    assert rule["actions"]["payee"] == "SFR"

    second = client.post("/api/rules", json={**body, "name": "Second"}).json()
    assert second["position"] == 1

    updated = client.put(f"/api/rules/{rule['id']}", json={**body, "name": "Renamed", "enabled": False})
    assert updated.status_code == 200
    assert updated.json()["name"] == "Renamed" and updated.json()["enabled"] is False

    assert [r["name"] for r in client.get("/api/rules").json()] == ["Renamed", "Second"]
    assert client.delete(f"/api/rules/{rule['id']}").status_code == 204
    assert [r["name"] for r in client.get("/api/rules").json()] == ["Second"]


def test_reorder(client, db):
    a = _rule(db, "A", [_contains("payee", "a")], {"reconciled": True}, position=0)
    b = _rule(db, "B", [_contains("payee", "b")], {"reconciled": True}, position=1)
    response = client.put("/api/rules/order", json={"rule_ids": [b.id, a.id]})
    assert response.status_code == 200
    assert [r["name"] for r in response.json()] == ["B", "A"]
    assert client.put("/api/rules/order", json={"rule_ids": [a.id]}).status_code == 422


@pytest.mark.parametrize("body", [
    {"name": "No condition", "conditions": [], "actions": {"payee": "X"}},
    {"name": "No action", "conditions": [_contains("payee", "x")], "actions": {}},
    {"name": "Blank value", "conditions": [_contains("payee", " ")], "actions": {"payee": "X"}},
    {"name": "Bad date", "conditions": [{"field": "date", "operator": "on", "value": "nope"}],
     "actions": {"payee": "X"}},
    {"name": "Half between", "conditions": [{"field": "amount", "operator": "between", "value": 1}],
     "actions": {"payee": "X"}},
    {"name": "Empty split", "conditions": [_contains("payee", "x")], "actions": {"split_weights": []}},
    {"name": "Per-user share", "conditions": [{"field": "split_share", "user_id": 1, "operator": "gt", "value": 0}],
     "actions": {"payee": "X"}},
    {"name": "Added on", "conditions": [{"field": "created_at", "operator": "on", "value": "2026-10-18"}],
     "actions": {"payee": "X"}},
])
def test_create_refuses_an_unusable_rule(client, body):
    assert client.post("/api/rules", json=body).status_code == 422


def test_create_refuses_an_unknown_category_or_user(client):
    base = {"name": "R", "conditions": [_contains("payee", "x")]}
    assert client.post("/api/rules", json={**base, "actions": {"category_id": 999}}).status_code == 404
    assert client.post("/api/rules", json={
        **base, "actions": {"split_weights": [{"user_id": 999, "weight": 1}]},
    }).status_code == 404


def test_create_has_no_move_or_delete_action(client, db, sample_account):
    """Moving to another account and deleting stay hand-only: a rule that
    names either simply does not carry it."""
    response = client.post("/api/rules", json={
        "name": "R", "conditions": [_contains("payee", "x")],
        "actions": {"reconciled": True, "account_id": sample_account.id, "delete": True},
    })
    assert response.status_code == 201
    assert set(db.query(TransactionRule).one().actions) == {"reconciled"}


# ── evaluation ───────────────────────────────────────────────────

def _evaluate(db, rules, row):
    return transaction_rules.evaluate_many(db, rules, [row])[0]


def test_operators_mirror_the_filter(db, sample_account):
    row = _txn(db, sample_account.id, "Carrefour Market", amount=-42.0, raw_label="CARTE 01/08 CARREFOUR")
    state = {f: getattr(row, f, None) for f in transaction_rules._STATE_FIELDS}
    match = lambda **c: transaction_rules._matches(transaction_rules.FilterCondition(**c), state)  # noqa: E731

    assert match(field="payee", operator="contains", value="MARKET")
    assert match(field="payee", operator="starts_with", value="carre")
    assert match(field="payee", operator="ends_with", value="market")
    assert match(field="payee", operator="equals", value="carrefour market")
    assert not match(field="payee", operator="not_equals", value="Carrefour Market")
    assert match(field="raw_label", operator="contains", value="carte")
    assert match(field="amount", operator="lt", value=0)
    assert match(field="amount", operator="between", value=-50, value2=-40)
    month = f"{row.date.year:04d}-{row.date.month:02d}"
    assert match(field="accounting_month", operator="on", value=month)
    assert not match(field="accounting_month", operator="before", value=month)
    # "Amount (abs)": the amount without its sign.
    assert match(field="amount_abs", operator="eq", value=42)
    assert match(field="amount_abs", operator="between", value=40, value2=50)
    assert not match(field="amount_abs", operator="lt", value=0)
    # "is in / is not in" a list, a null in a category list being "Uncategorized".
    assert match(field="account_id", operator="in", value=[sample_account.id, 999])
    assert not match(field="account_id", operator="not_in", value=[sample_account.id])
    assert match(field="category_id", operator="in", value=[None, 999])
    assert not match(field="category_id", operator="in", value=[999])
    assert not match(field="category_id", operator="not_in", value=[999])
    assert match(field="date", operator="after", value="2026-07-31")
    assert match(field="date", operator="between", value="2026-08-31", value2="2026-08-01")
    assert match(field="account_id", operator="eq", value=sample_account.id)
    # As in SQL, a condition on an empty field never matches, not even "is not".
    assert not match(field="memo", operator="not_equals", value="x")
    assert not match(field="category_id", operator="ne", value=1)
    # No category named: "is" matches an uncategorized row, "is not" a filed one.
    assert match(field="category_id", operator="eq", value=None)
    assert not match(field="category_id", operator="ne", value=None)
    assert match(field="reconciled", operator="eq", value=False)
    assert not match(field="reconciled", operator="eq", value="true")
    assert match(field="accounting_month_offset", operator="eq", value=0)
    assert not match(field="raw_counterparty", operator="not_equals", value="x")


def test_bank_fields_and_reconciled_conditions(db, sample_account):
    from datetime import date
    row = _txn(db, sample_account.id, "SNCF")
    row.raw_merchant_category_code = "4112"
    row.raw_booking_date = date(2026, 8, 3)
    row.reconciled = True
    db.commit()
    rule = _rule(db, "train", [
        {"field": "raw_merchant_category_code", "operator": "equals", "value": "4112"},
        {"field": "raw_booking_date", "operator": "after", "value": "2026-08-01"},
        {"field": "reconciled", "operator": "eq", "value": True},
    ], {"payee": "Train"})
    assert _evaluate(db, [rule], row).fields == {"payee": "Train"}


def test_match_mode_any_and_all(db, sample_account):
    row = _txn(db, sample_account.id, "SFR")
    conditions = [_contains("payee", "sfr"), _contains("payee", "orange")]
    any_rule = _rule(db, "any", conditions, {"reconciled": True}, match_mode="any")
    all_rule = _rule(db, "all", conditions, {"reconciled": True}, match_mode="all")
    assert _evaluate(db, [any_rule], row).fields == {"reconciled": True}
    assert _evaluate(db, [all_rule], row).fields == {}


def test_later_rules_see_earlier_changes_and_win(db, sample_account, groceries, phone):
    row = _txn(db, sample_account.id, "PRLV SEPA SFR", raw_label="PRLV SEPA SFR")
    rename = _rule(db, "rename", [_contains("raw_label", "sfr")], {"payee": "SFR", "category_id": groceries.id}, 0)
    refile = _rule(db, "refile", [{"field": "payee", "operator": "equals", "value": "sfr"}],
                   {"category_id": phone.id}, 1)
    outcome = _evaluate(db, transaction_rules.load_rules(db), row)
    assert outcome.fields == {"payee": "SFR", "category_id": phone.id}
    assert outcome.rule_names == ["rename", "refile"]
    assert rename.id in outcome.rule_ids and refile.id in outcome.rule_ids


def test_disabled_rules_only_run_when_picked(db, sample_account):
    row = _txn(db, sample_account.id, "SFR")
    rule = _rule(db, "off", [_contains("payee", "sfr")], {"payee": "Phone"}, enabled=False)
    assert transaction_rules.load_rules(db) == []
    assert _evaluate(db, transaction_rules.load_rules(db, [rule.id]), row).fields == {"payee": "Phone"}


def test_a_deleted_category_in_a_rule_is_skipped(db, sample_account):
    row = _txn(db, sample_account.id, "SFR")
    rule = _rule(db, "stale", [_contains("payee", "sfr")], {"category_id": 999, "payee": "Phone"})
    assert _evaluate(db, [rule], row).fields == {"payee": "Phone"}


# ── selection: preview and apply ─────────────────────────────────

def test_preview_shows_the_before_and_after(client, db, sample_account, groceries):
    hit = _txn(db, sample_account.id, "CARREFOUR", reconciled=True)
    miss = _txn(db, sample_account.id, "SNCF")
    _rule(db, "Shop", [_contains("payee", "carrefour")], {"payee": "Carrefour", "category_id": groceries.id})

    body = client.post("/api/rules/preview", json={"transaction_ids": [hit.id, miss.id]}).json()
    assert body["changed_count"] == 1
    items = {i["transaction_id"]: i for i in body["items"]}
    assert items[miss.id]["outcome"] is None
    outcome = items[hit.id]["outcome"]
    assert outcome["payee"] == "Carrefour"
    assert outcome["category_name"] == "Groceries"
    assert outcome["rule_names"] == ["Shop"]
    assert items[hit.id]["current_reconciled"] is True
    # Previewing writes nothing.
    db.refresh(hit)
    assert hit.payee == "CARREFOUR"


def test_apply_writes_and_records_without_touching_reconciled(client, db, sample_account, sample_user, groceries):
    t = _txn(db, sample_account.id, "CARREFOUR", raw_label="CARTE CARREFOUR", reconciled=True,
             user_id=sample_user.id)
    _rule(db, "Shop", [_contains("payee", "carrefour")], {"payee": "Carrefour", "category_id": groceries.id})

    response = client.post("/api/rules/apply", json={"transaction_ids": [t.id]})
    assert response.status_code == 200
    assert response.json()["updated_count"] == 1
    db.refresh(t)
    # A rename must not send an already-reconciled row back to review.
    assert (t.payee, t.category_id, t.reconciled) == ("Carrefour", groceries.id, True)
    assert t.raw_label == "CARTE CARREFOUR"
    entry = db.query(TransactionHistory).filter(TransactionHistory.transaction_id == t.id).one()
    assert entry.source == "rule"
    assert entry.changes["payee"] == {"old": "CARREFOUR", "new": "Carrefour"}
    assert "reconciled" not in entry.changes
    # An existing row keeps its split when a rule only changes its category.
    split = db.query(TransactionSplit).filter(TransactionSplit.transaction_id == t.id).one()
    assert split.source == "global"


def test_a_rule_may_keep_a_row_reconciled_and_set_its_split(client, db, sample_account, sample_user, sample_user2):
    t = _txn(db, sample_account.id, "LOYER", amount=-1000.0, user_id=sample_user.id)
    _rule(db, "Rent", [_contains("payee", "loyer")], {
        "reconciled": True, "accounting_month_offset": 1,
        "split_weights": [{"user_id": sample_user.id, "weight": 1}, {"user_id": sample_user2.id, "weight": 1}],
        "split_source": "custom",
    })
    client.post("/api/rules/apply", json={"transaction_ids": [t.id]})
    db.refresh(t)
    assert t.reconciled is True
    assert t.accounting_month_offset == 1
    shares = {s.user_id: s.share_amount for s in db.query(TransactionSplit)
              .filter(TransactionSplit.transaction_id == t.id)}
    assert shares == {sample_user.id: -500.0, sample_user2.id: -500.0}


def test_a_split_tier_follows_the_tier_as_it_is_today(client, db, sample_account, sample_user, sample_user2):
    t = _txn(db, sample_account.id, "LOYER", amount=-900.0, user_id=sample_user.id)
    _rule(db, "Rent", [_contains("payee", "loyer")], {"split_tier": "global"})
    db.add_all([GlobalSplitWeight(user_id=sample_user.id, weight=1),
                GlobalSplitWeight(user_id=sample_user2.id, weight=2)])
    db.commit()
    client.post("/api/rules/apply", json={"transaction_ids": [t.id]})
    splits = {s.user_id: (s.share_amount, s.source) for s in db.query(TransactionSplit)
              .filter(TransactionSplit.transaction_id == t.id)}
    assert splits == {sample_user.id: (-300.0, "global"), sample_user2.id: (-600.0, "global")}

    # The global split changes: the same rule now applies the new one.
    db.query(GlobalSplitWeight).filter(GlobalSplitWeight.user_id == sample_user2.id).update({"weight": 1})
    db.commit()
    client.post("/api/rules/apply", json={"transaction_ids": [t.id]})
    shares = {s.user_id: s.share_amount for s in db.query(TransactionSplit)
              .filter(TransactionSplit.transaction_id == t.id)}
    assert shares == {sample_user.id: -450.0, sample_user2.id: -450.0}


def test_a_category_tier_reads_the_category_a_rule_set(db, sample_account, sample_user, sample_user2, phone):
    row = _txn(db, sample_account.id, "SFR")
    db.add_all([CategorySplit(category_id=phone.id, user_id=sample_user2.id, weight=1),
                GlobalSplitWeight(user_id=sample_user.id, weight=1)])
    db.commit()
    split = _rule(db, "Split", [_contains("payee", "sfr")], {"split_tier": "category"}, position=0)
    file = _rule(db, "File", [_contains("payee", "sfr")], {"category_id": phone.id}, position=1)
    outcome = _evaluate(db, [split, file], row)
    assert (outcome.split_weights, outcome.split_source) == ({sample_user2.id: 1}, "category")

    # The default tier cascades: no account or category weights → global.
    default = _rule(db, "Default", [_contains("payee", "sfr")], {"split_tier": "default"}, position=2)
    outcome = _evaluate(db, [default], row)
    assert (outcome.split_weights, outcome.split_source) == ({sample_user.id: 1}, "global")


def test_an_unconfigured_tier_leaves_the_split_alone(db, sample_account, sample_user):
    row = _txn(db, sample_account.id, "SFR", user_id=sample_user.id)
    rule = _rule(db, "Split", [_contains("payee", "sfr")], {"split_tier": "account"})
    assert not _evaluate(db, [rule], row).changes_anything


def test_a_rule_cannot_set_both_weights_and_a_tier(client, sample_user):
    res = client.post("/api/rules", json={
        "name": "x", "conditions": [_contains("payee", "a")],
        "actions": {"split_tier": "global", "split_weights": [{"user_id": sample_user.id, "weight": 1}]},
    })
    assert res.status_code == 422
    res = client.post("/api/rules", json={
        "name": "x", "conditions": [_contains("payee", "a")], "actions": {"split_tier": "global"},
    })
    assert res.status_code == 201
    assert res.json()["actions"]["split_tier"] == "global"


def test_apply_with_picked_rules(client, db, sample_account):
    t = _txn(db, sample_account.id, "SFR")
    _rule(db, "on", [_contains("payee", "sfr")], {"payee": "On"}, position=0)
    off = _rule(db, "off", [_contains("payee", "sfr")], {"memo": "x", "payee": "Off"}, position=1, enabled=False)
    client.post("/api/rules/apply", json={"transaction_ids": [t.id], "rule_ids": [off.id]})
    db.refresh(t)
    assert t.payee == "Off"


def test_apply_404s_on_an_unknown_transaction_or_rule(client, db, sample_account):
    t = _txn(db, sample_account.id, "SFR")
    assert client.post("/api/rules/apply", json={"transaction_ids": [999]}).status_code == 404
    assert client.post("/api/rules/apply", json={"transaction_ids": [t.id], "rule_ids": [999]}).status_code == 404


# ── bank sync ────────────────────────────────────────────────────

@pytest.fixture()
def linked(db, sample_account, sample_user):
    db.add(GlobalSplitWeight(user_id=sample_user.id, weight=1))
    connection = BankConnection(aspsp_name="Bank", aspsp_country="FR", state="s", session_id="x",
                                status="linked", access_valid_until=datetime(2026, 12, 1))
    db.add(connection)
    db.flush()
    link = BankAccountLink(connection_id=connection.id, remote_account_uid="u", account_id=sample_account.id,
                           sync_enabled=True, sync_from_date=date(2026, 1, 1))
    db.add(link)
    db.commit()
    return link


def _sync(db, link, label):
    rows = enable_banking.normalize_transactions([{
        "transaction_amount": {"amount": "30.00", "currency": "EUR"},
        "credit_debit_indicator": "DBIT", "status": "BOOK", "booking_date": "2026-03-04",
        "entry_reference": label, "creditor": {"name": label},
    }])
    enable_banking.import_transactions(db, link, rows, date(2026, 3, 1), date(2026, 3, 31))
    return db.query(Transaction).filter(Transaction.external_id == label).one()


def test_sync_applies_enabled_rules_and_resolves_the_split_again(db, linked, sample_user, sample_user2, phone):
    db.add(CategorySplit(category_id=phone.id, user_id=sample_user2.id, weight=1))
    db.commit()
    _rule(db, "SFR", [_contains("payee", "sfr")], {"payee": "SFR", "category_id": phone.id})
    _rule(db, "off", [_contains("payee", "sfr")], {"payee": "Never"}, position=1, enabled=False)

    t = _sync(db, linked, "PRLV SFR")
    assert (t.payee, t.category_id, t.reconciled) == ("SFR", phone.id, False)
    # Filed under Phone by the rule, the new row takes Phone's split, as one
    # created with that category would have.
    split = db.query(TransactionSplit).filter(TransactionSplit.transaction_id == t.id).one()
    assert (split.user_id, split.source) == (sample_user2.id, "category")
    sources = [h.source for h in db.query(TransactionHistory).filter(TransactionHistory.transaction_id == t.id)]
    assert sources == ["bank_sync", "rule"]


def test_sync_survives_a_broken_rule(db, linked):
    _rule(db, "broken", [{"field": "date", "operator": "on", "value": "not a date"}], {"payee": "X"})
    t = _sync(db, linked, "SHOP")
    assert t.payee == "SHOP"


# ── CSV import ───────────────────────────────────────────────────

def test_import_preview_reports_the_rules_and_commit_keeps_the_file_label(client, db, sample_account,
                                                                          sample_category, sample_user):
    db.add(GlobalSplitWeight(user_id=sample_user.id, weight=1))
    db.commit()
    _rule(db, "Whole", [_contains("payee", "whole")], {"payee": "Whole Foods Market", "reconciled": True})

    rows = client.post("/api/import/preview", files=_csv_file(),
                       data={**PREVIEW_FORM, "account_id": sample_account.id}).json()
    assert rows[0]["rules"]["payee"] == "Whole Foods Market"
    assert rows[0]["rules"]["rule_names"] == ["Whole"]
    assert rows[0]["payee"] == "Whole Foods"
    assert rows[1]["rules"] is None

    response = client.post("/api/import/commit", json={"rows": [{
        "date": "2026-01-15", "payee": "Whole Foods Market", "raw_label": "Whole Foods",
        "amount": -42.5, "account_id": sample_account.id, "category_id": sample_category.id,
        "reconciled": True,
    }]})
    assert response.status_code == 200, response.text
    t = db.query(Transaction).one()
    assert (t.payee, t.raw_label, t.reconciled) == ("Whole Foods Market", "Whole Foods", True)


# ── backup ───────────────────────────────────────────────────────

def test_rules_round_trip_through_an_overwrite_restore(client, db):
    _rule(db, "SFR", [_contains("payee", "sfr")], {"payee": "SFR"})
    archive = client.get("/api/backup/export").content
    db.query(TransactionRule).delete()
    db.commit()

    response = client.post("/api/backup/import", data={"mode": "overwrite"},
                           files={"file": ("backup.zip", archive, "application/zip")})
    assert response.status_code == 200, response.text
    assert response.json()["transaction_rules"] == 1
    assert [r["name"] for r in client.get("/api/rules").json()] == ["SFR"]
