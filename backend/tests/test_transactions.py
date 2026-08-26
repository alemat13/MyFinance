def test_create_transaction(client, sample_account, sample_category):
    response = client.post(
        "/api/transactions",
        json={
            "account_id": sample_account.id,
            "category_id": sample_category.id,
            "date": "2026-01-15",
            "payee": "Test",
            "amount": 100.0,
        },
    )
    assert response.status_code == 201


def test_get_transactions(client, sample_transaction):
    response = client.get("/api/transactions")
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1


def test_get_transaction_has_names(client, sample_transaction):
    response = client.get("/api/transactions")
    data = response.json()
    assert len(data) == 1
    assert data[0]["account_name"] is not None
    assert data[0]["category_name"] is not None


def test_transaction_currency_reflects_account(client, db, sample_category):
    from models import Account
    account = Account(name="USD Checking", type="Checking", balance=0.0, currency="USD")
    db.add(account)
    db.commit()

    response = client.post(
        "/api/transactions",
        json={
            "account_id": account.id,
            "category_id": sample_category.id,
            "date": "2026-01-15",
            "payee": "Test",
            "amount": 100.0,
        },
    )
    assert response.status_code == 201
    assert response.json()["currency"] == "USD"


def test_update_transaction(client, sample_transaction):
    response = client.put(
        f"/api/transactions/{sample_transaction.id}",
        json={"amount": 999.0},
    )
    assert response.status_code == 200
    assert response.json()["amount"] == 999.0


def test_delete_transaction(client, sample_transaction):
    response = client.delete(f"/api/transactions/{sample_transaction.id}")
    assert response.status_code == 204
    response = client.get("/api/transactions")
    assert response.json() == []


def test_update_transaction_404(client):
    response = client.put("/api/transactions/999", json={"amount": 100.0})
    assert response.status_code == 404


def test_delete_transaction_404(client):
    response = client.delete("/api/transactions/999")
    assert response.status_code == 404


def test_get_transactions_filtered_by_user(client, sample_account_with_user, sample_user, sample_category, db):
    from datetime import date
    from models import Transaction
    t = Transaction(
        date=date(2026, 1, 15),
        payee="User Specific",
        amount=100.0,
        account_id=sample_account_with_user.id,
        category_id=sample_category.id,
    )
    db.add(t)
    db.commit()

    response = client.get(f"/api/transactions?user_id={sample_user.id}")
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert data[0]["payee"] == "User Specific"


def test_get_transactions_filtered_by_user_no_match(client, sample_user):
    response = client.get(f"/api/transactions?user_id={sample_user.id}")
    assert response.status_code == 200
    assert response.json() == []


def test_create_transaction_no_split_config_has_no_splits(client, sample_account, sample_category):
    response = client.post(
        "/api/transactions",
        json={
            "account_id": sample_account.id,
            "category_id": sample_category.id,
            "date": "2026-01-15",
            "payee": "Test",
            "amount": 100.0,
        },
    )
    assert response.status_code == 201
    assert response.json()["splits"] == []


def test_create_transaction_uses_global_default_weight(client, sample_account, sample_category, sample_user, db):
    from models import GlobalSplitWeight, User
    other_user = User(name="Other User")
    db.add(other_user)
    db.flush()
    other_user_id = other_user.id
    db.add_all([
        GlobalSplitWeight(user_id=sample_user.id, weight=60.0),
        GlobalSplitWeight(user_id=other_user_id, weight=40.0),
    ])
    db.commit()

    response = client.post(
        "/api/transactions",
        json={
            "account_id": sample_account.id,
            "category_id": sample_category.id,
            "date": "2026-01-15",
            "payee": "Test",
            "amount": 100.0,
        },
    )
    assert response.status_code == 201
    splits = {s["user_id"]: s for s in response.json()["splits"]}
    assert splits[sample_user.id]["share_amount"] == 60.0
    assert splits[sample_user.id]["source"] == "global_default"
    assert splits[other_user_id]["share_amount"] == 40.0


def test_create_transaction_with_manual_split_override(client, sample_account, sample_category, sample_user):
    response = client.post(
        "/api/transactions",
        json={
            "account_id": sample_account.id,
            "category_id": sample_category.id,
            "date": "2026-01-15",
            "payee": "Test",
            "amount": 100.0,
            "split_overrides": [{"user_id": sample_user.id, "share_amount": 100.0}],
        },
    )
    assert response.status_code == 201
    splits = response.json()["splits"]
    assert len(splits) == 1
    assert splits[0]["share_amount"] == 100.0
    assert splits[0]["source"] == "manual"


def test_create_transaction_manual_override_sum_mismatch_422(client, sample_account, sample_category, sample_user):
    response = client.post(
        "/api/transactions",
        json={
            "account_id": sample_account.id,
            "category_id": sample_category.id,
            "date": "2026-01-15",
            "payee": "Test",
            "amount": 100.0,
            "split_overrides": [{"user_id": sample_user.id, "share_amount": 40.0}],
        },
    )
    assert response.status_code == 422


def test_update_transaction_amount_on_manual_split_requires_new_override(client, sample_account, sample_category, sample_user):
    create_response = client.post(
        "/api/transactions",
        json={
            "account_id": sample_account.id,
            "category_id": sample_category.id,
            "date": "2026-01-15",
            "payee": "Test",
            "amount": 100.0,
            "split_overrides": [{"user_id": sample_user.id, "share_amount": 100.0}],
        },
    )
    transaction_id = create_response.json()["id"]

    # Changing the amount without a matching override should fail...
    response = client.put(f"/api/transactions/{transaction_id}", json={"amount": 200.0})
    assert response.status_code == 422

    # ...but succeeds once a matching override is supplied.
    response = client.put(
        f"/api/transactions/{transaction_id}",
        json={"amount": 200.0, "split_overrides": [{"user_id": sample_user.id, "share_amount": 200.0}]},
    )
    assert response.status_code == 200
    assert response.json()["splits"][0]["share_amount"] == 200.0


def test_update_transaction_amount_on_auto_split_recomputes(client, sample_account, sample_category, sample_user, db):
    from models import GlobalSplitWeight
    db.add(GlobalSplitWeight(user_id=sample_user.id, weight=100.0))
    db.commit()

    create_response = client.post(
        "/api/transactions",
        json={
            "account_id": sample_account.id,
            "category_id": sample_category.id,
            "date": "2026-01-15",
            "payee": "Test",
            "amount": 100.0,
        },
    )
    transaction_id = create_response.json()["id"]
    assert create_response.json()["splits"][0]["share_amount"] == 100.0

    response = client.put(f"/api/transactions/{transaction_id}", json={"amount": 200.0})
    assert response.status_code == 200
    assert response.json()["splits"][0]["share_amount"] == 200.0


def test_split_preview_endpoint(client, sample_category, sample_user):
    client.put("/api/split-weights", json=[{"user_id": sample_user.id, "weight": 100.0}])

    response = client.post(
        "/api/split-preview",
        json={"amount": 50.0, "category_id": sample_category.id},
    )
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert data[0]["share_amount"] == 50.0


def test_split_preview_no_config_returns_422(client, sample_category):
    response = client.post(
        "/api/split-preview",
        json={"amount": 50.0, "category_id": sample_category.id},
    )
    assert response.status_code == 422


# ── Transaction search ────────────────────────────────────────────

def _make_transaction(db, account, category, **overrides):
    from datetime import date
    from models import Transaction
    defaults = dict(date=date(2026, 1, 15), payee="Payee", amount=100.0,
                     account_id=account.id, category_id=category.id)
    defaults.update(overrides)
    t = Transaction(**defaults)
    db.add(t)
    db.commit()
    db.refresh(t)
    return t


def test_search_simple_payee_contains(client, db, sample_account, sample_category):
    _make_transaction(db, sample_account, sample_category, payee="Amazon Prime")
    _make_transaction(db, sample_account, sample_category, payee="Grocery Store")

    response = client.post("/api/transactions/search", json={"search": "amazon"})
    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 1
    assert data["items"][0]["payee"] == "Amazon Prime"


def test_search_simple_memo_contains(client, db, sample_account, sample_category):
    _make_transaction(db, sample_account, sample_category, payee="A", memo="refund for order")
    _make_transaction(db, sample_account, sample_category, payee="B", memo="monthly bill")

    response = client.post("/api/transactions/search", json={"search": "refund"})
    data = response.json()
    assert data["total"] == 1
    assert data["items"][0]["payee"] == "A"


def test_search_simple_date_range(client, db, sample_account, sample_category):
    from datetime import date
    _make_transaction(db, sample_account, sample_category, date=date(2026, 1, 1))
    _make_transaction(db, sample_account, sample_category, date=date(2026, 6, 1))
    _make_transaction(db, sample_account, sample_category, date=date(2026, 12, 1))

    response = client.post("/api/transactions/search", json={
        "date_from": "2026-02-01", "date_to": "2026-07-01",
    })
    data = response.json()
    assert data["total"] == 1
    assert data["items"][0]["date"] == "2026-06-01"


def test_search_simple_account_and_category(client, db, sample_account, sample_category):
    from models import Account, Category
    other_account = Account(name="Other", type="Checking")
    other_category = Category(name="Other Cat", type="Expense")
    db.add_all([other_account, other_category])
    db.commit()

    _make_transaction(db, sample_account, sample_category)
    _make_transaction(db, other_account, other_category)

    response = client.post("/api/transactions/search", json={"account_id": sample_account.id})
    assert response.json()["total"] == 1

    response = client.post("/api/transactions/search", json={"category_id": other_category.id})
    assert response.json()["total"] == 1


def test_search_simple_amount_range(client, db, sample_account, sample_category):
    _make_transaction(db, sample_account, sample_category, amount=10.0)
    _make_transaction(db, sample_account, sample_category, amount=50.0)
    _make_transaction(db, sample_account, sample_category, amount=100.0)

    response = client.post("/api/transactions/search", json={"amount_min": 20.0, "amount_max": 80.0})
    data = response.json()
    assert data["total"] == 1
    assert data["items"][0]["amount"] == 50.0


def test_search_simple_filters_combine_with_and(client, db, sample_account, sample_category):
    _make_transaction(db, sample_account, sample_category, payee="Amazon", amount=10.0)
    _make_transaction(db, sample_account, sample_category, payee="Amazon", amount=100.0)

    response = client.post("/api/transactions/search", json={"search": "amazon", "amount_min": 50.0})
    assert response.json()["total"] == 1


def test_search_advanced_text_operators(client, db, sample_account, sample_category):
    _make_transaction(db, sample_account, sample_category, payee="Amazon Prime")

    cases = [
        ("contains", "mazon", True),
        ("contains", "xyz", False),
        ("equals", "amazon prime", True),
        ("equals", "amazon", False),
        ("not_equals", "amazon", True),
        ("starts_with", "amazon", True),
        ("starts_with", "prime", False),
        ("ends_with", "prime", True),
        ("ends_with", "amazon", False),
    ]
    for operator, value, should_match in cases:
        response = client.post("/api/transactions/search", json={
            "conditions": [{"field": "payee", "operator": operator, "value": value}],
        })
        assert response.status_code == 200
        total = response.json()["total"]
        assert (total == 1) == should_match, f"{operator} {value!r} expected match={should_match}"


def test_search_advanced_numeric_operators(client, db, sample_account, sample_category):
    _make_transaction(db, sample_account, sample_category, amount=50.0)

    cases = [
        ("eq", 50.0, None, True),
        ("eq", 40.0, None, False),
        ("ne", 40.0, None, True),
        ("gt", 40.0, None, True),
        ("gt", 50.0, None, False),
        ("gte", 50.0, None, True),
        ("lt", 60.0, None, True),
        ("lte", 50.0, None, True),
        ("between", 40.0, 60.0, True),
        ("between", 60.0, 70.0, False),
    ]
    for operator, value, value2, should_match in cases:
        body = {"conditions": [{"field": "amount", "operator": operator, "value": value}]}
        if value2 is not None:
            body["conditions"][0]["value2"] = value2
        response = client.post("/api/transactions/search", json=body)
        assert response.status_code == 200
        total = response.json()["total"]
        assert (total == 1) == should_match, f"{operator} {value} expected match={should_match}"


def test_search_advanced_date_operators(client, db, sample_account, sample_category):
    from datetime import date
    _make_transaction(db, sample_account, sample_category, date=date(2026, 6, 15))

    cases = [
        ("on", "2026-06-15", None, True),
        ("on", "2026-06-16", None, False),
        ("before", "2026-06-16", None, True),
        ("before", "2026-06-15", None, False),
        ("after", "2026-06-14", None, True),
        ("between", "2026-06-01", "2026-06-30", True),
        ("between", "2026-07-01", "2026-07-31", False),
    ]
    for operator, value, value2, should_match in cases:
        body = {"conditions": [{"field": "date", "operator": operator, "value": value}]}
        if value2 is not None:
            body["conditions"][0]["value2"] = value2
        response = client.post("/api/transactions/search", json=body)
        assert response.status_code == 200
        total = response.json()["total"]
        assert (total == 1) == should_match, f"{operator} {value} expected match={should_match}"


def test_search_match_mode_all_vs_any(client, db, sample_account, sample_category):
    t1 = _make_transaction(db, sample_account, sample_category, payee="Alpha", amount=10.0)
    t2 = _make_transaction(db, sample_account, sample_category, payee="Beta", amount=999.0)
    _make_transaction(db, sample_account, sample_category, payee="Gamma", amount=500.0)

    conditions = [
        {"field": "payee", "operator": "equals", "value": "alpha"},
        {"field": "amount", "operator": "eq", "value": 999.0},
    ]

    response = client.post("/api/transactions/search", json={"conditions": conditions, "match_mode": "all"})
    assert response.json()["total"] == 0

    response = client.post("/api/transactions/search", json={"conditions": conditions, "match_mode": "any"})
    data = response.json()
    assert data["total"] == 2
    payees = {item["payee"] for item in data["items"]}
    assert payees == {"Alpha", "Beta"}


def test_search_invalid_operator_for_field_422(client):
    response = client.post("/api/transactions/search", json={
        "conditions": [{"field": "payee", "operator": "gt", "value": "x"}],
    })
    assert response.status_code == 422


def test_search_malformed_amount_value_422(client, db, sample_account, sample_category):
    _make_transaction(db, sample_account, sample_category)
    response = client.post("/api/transactions/search", json={
        "conditions": [{"field": "amount", "operator": "eq", "value": "not-a-number"}],
    })
    assert response.status_code == 422


def test_search_malformed_date_value_422(client, db, sample_account, sample_category):
    _make_transaction(db, sample_account, sample_category)
    response = client.post("/api/transactions/search", json={
        "conditions": [{"field": "date", "operator": "on", "value": "not-a-date"}],
    })
    assert response.status_code == 422


def test_search_pagination(client, db, sample_account, sample_category):
    for i in range(5):
        _make_transaction(db, sample_account, sample_category, payee=f"Payee {i}", amount=float(i))

    response = client.post("/api/transactions/search", json={"page": 1, "page_size": 2, "sort_by": "amount", "sort_dir": "asc"})
    data = response.json()
    assert data["total"] == 5
    assert data["total_pages"] == 3
    assert [item["amount"] for item in data["items"]] == [0.0, 1.0]

    response = client.post("/api/transactions/search", json={"page": 2, "page_size": 2, "sort_by": "amount", "sort_dir": "asc"})
    data = response.json()
    assert [item["amount"] for item in data["items"]] == [2.0, 3.0]

    response = client.post("/api/transactions/search", json={"page": 10, "page_size": 2})
    data = response.json()
    assert data["items"] == []
    assert data["total"] == 5


def test_search_page_size_clamped_to_max(client, db, sample_account, sample_category):
    _make_transaction(db, sample_account, sample_category)
    response = client.post("/api/transactions/search", json={"page_size": 500})
    assert response.json()["page_size"] == 200


def test_search_default_sort_matches_get_transactions(client, db, sample_account, sample_category):
    from datetime import date
    _make_transaction(db, sample_account, sample_category, payee="Old", date=date(2026, 1, 1))
    _make_transaction(db, sample_account, sample_category, payee="New", date=date(2026, 6, 1))

    get_response = client.get("/api/transactions")
    search_response = client.post("/api/transactions/search", json={})
    assert [t["id"] for t in get_response.json()] == [t["id"] for t in search_response.json()["items"]]


def test_search_sort_by_amount_asc(client, db, sample_account, sample_category):
    _make_transaction(db, sample_account, sample_category, payee="High", amount=100.0)
    _make_transaction(db, sample_account, sample_category, payee="Low", amount=1.0)

    response = client.post("/api/transactions/search", json={"sort_by": "amount", "sort_dir": "asc"})
    data = response.json()
    assert [item["payee"] for item in data["items"]] == ["Low", "High"]


def test_search_filtered_by_user(client, sample_account_with_user, sample_user, sample_category, db):
    _make_transaction(db, sample_account_with_user, sample_category, payee="User Specific")

    response = client.post("/api/transactions/search", json={"user_id": sample_user.id})
    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 1
    assert data["items"][0]["payee"] == "User Specific"


def test_search_filtered_by_user_no_match(client, sample_user):
    response = client.post("/api/transactions/search", json={"user_id": sample_user.id})
    assert response.status_code == 200
    assert response.json()["total"] == 0
