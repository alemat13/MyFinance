from datetime import date

from models import Account, Category, Transaction, TransactionSplit
import charts


def test_charts_requires_user_id(client):
    response = client.get("/api/charts")
    assert response.status_code == 422


def test_charts_empty_for_user_with_no_splits(client, sample_user):
    response = client.get(f"/api/charts?user_id={sample_user.id}")
    assert response.status_code == 200
    data = response.json()
    assert data["currencies"] == []
    assert data["by_category"] == []
    assert data["by_month"] == []
    assert data["net_by_month"] == []
    assert data["by_month_category"] == []
    assert data["chart_categories"] == []
    assert data["parent_category"] is None


def test_charts_only_counts_current_user_share(client, sample_account, sample_category, sample_user, sample_user2, db):
    t = Transaction(
        date=date(2026, 2, 1), payee="Split Salary", amount=100.0,
        account_id=sample_account.id, category_id=sample_category.id,
    )
    db.add(t)
    db.flush()
    db.add_all([
        TransactionSplit(transaction_id=t.id, user_id=sample_user.id, share_amount=60.0, source="manual"),
        TransactionSplit(transaction_id=t.id, user_id=sample_user2.id, share_amount=40.0, source="manual"),
    ])
    db.commit()

    response = client.get(f"/api/charts?user_id={sample_user.id}")
    assert response.status_code == 200
    by_category = response.json()["by_category"]
    assert len(by_category) == 1
    assert by_category[0]["amount"] == 60.0


def test_charts_excludes_transfer_category(client, sample_account, sample_user, db):
    transfer_cat = Category(name="Transfer Cat", type="Transfer")
    db.add(transfer_cat)
    db.commit()
    t = Transaction(
        date=date(2026, 2, 1), payee="Move money", amount=100.0,
        account_id=sample_account.id, category_id=transfer_cat.id,
    )
    db.add(t)
    db.flush()
    db.add(TransactionSplit(transaction_id=t.id, user_id=sample_user.id, share_amount=100.0, source="manual"))
    db.commit()

    response = client.get(f"/api/charts?user_id={sample_user.id}")
    assert response.status_code == 200
    data = response.json()
    assert data["by_category"] == []
    assert data["by_month"] == []
    assert data["net_by_month"] == []


def test_charts_respects_accounting_month_offset(client, sample_account, sample_category, sample_user, db):
    t = Transaction(
        date=date(2026, 1, 25), payee="Offset tx", amount=100.0,
        account_id=sample_account.id, category_id=sample_category.id,
        accounting_month_offset=1,
    )
    db.add(t)
    db.flush()
    db.add(TransactionSplit(transaction_id=t.id, user_id=sample_user.id, share_amount=100.0, source="manual"))
    db.commit()

    response = client.get(f"/api/charts?user_id={sample_user.id}")
    assert response.status_code == 200
    by_month = response.json()["by_month"]
    assert len(by_month) == 1
    assert by_month[0]["month"] == "2026-02"


def test_charts_income_vs_expense_by_month(client, sample_account, sample_user, db):
    income_cat = Category(name="Salary Cat", type="Income")
    expense_cat = Category(name="Rent Cat", type="Expense")
    db.add_all([income_cat, expense_cat])
    db.commit()

    t_income = Transaction(
        date=date(2026, 3, 5), payee="Salary", amount=1000.0,
        account_id=sample_account.id, category_id=income_cat.id,
    )
    t_expense = Transaction(
        date=date(2026, 3, 10), payee="Rent", amount=-300.0,
        account_id=sample_account.id, category_id=expense_cat.id,
    )
    db.add_all([t_income, t_expense])
    db.flush()
    db.add_all([
        TransactionSplit(transaction_id=t_income.id, user_id=sample_user.id, share_amount=1000.0, source="manual"),
        TransactionSplit(transaction_id=t_expense.id, user_id=sample_user.id, share_amount=-300.0, source="manual"),
    ])
    db.commit()

    response = client.get(f"/api/charts?user_id={sample_user.id}")
    assert response.status_code == 200
    data = response.json()
    by_month = data["by_month"]
    assert len(by_month) == 1
    assert by_month[0]["income"] == 1000.0
    assert by_month[0]["expense"] == 300.0

    net_by_month = data["net_by_month"]
    assert len(net_by_month) == 1
    assert net_by_month[0]["net"] == 700.0


def test_charts_category_amount_is_signed(client, sample_account, sample_user, db):
    expense_cat = Category(name="Rent Cat 2", type="Expense")
    db.add(expense_cat)
    db.commit()
    t = Transaction(
        date=date(2026, 3, 10), payee="Rent", amount=-300.0,
        account_id=sample_account.id, category_id=expense_cat.id,
    )
    db.add(t)
    db.flush()
    db.add(TransactionSplit(transaction_id=t.id, user_id=sample_user.id, share_amount=-300.0, source="manual"))
    db.commit()

    response = client.get(f"/api/charts?user_id={sample_user.id}")
    by_category = response.json()["by_category"]
    assert len(by_category) == 1
    assert by_category[0]["amount"] == -300.0
    assert by_category[0]["category_type"] == "Expense"


def test_charts_currency_grouping(client, sample_category, sample_user, db):
    eur_account = Account(name="EUR Acct", type="Checking", currency="EUR")
    usd_account = Account(name="USD Acct", type="Checking", currency="USD")
    db.add_all([eur_account, usd_account])
    db.commit()

    t_eur = Transaction(
        date=date(2026, 4, 1), payee="EUR tx", amount=100.0,
        account_id=eur_account.id, category_id=sample_category.id,
    )
    t_usd = Transaction(
        date=date(2026, 4, 1), payee="USD tx", amount=50.0,
        account_id=usd_account.id, category_id=sample_category.id,
    )
    db.add_all([t_eur, t_usd])
    db.flush()
    db.add_all([
        TransactionSplit(transaction_id=t_eur.id, user_id=sample_user.id, share_amount=100.0, source="manual"),
        TransactionSplit(transaction_id=t_usd.id, user_id=sample_user.id, share_amount=50.0, source="manual"),
    ])
    db.commit()

    response = client.get(f"/api/charts?user_id={sample_user.id}")
    data = response.json()
    assert data["currencies"] == ["EUR", "USD"]
    assert {item["currency"] for item in data["by_category"]} == {"EUR", "USD"}

    response_eur = client.get(f"/api/charts?user_id={sample_user.id}&currency=EUR")
    data_eur = response_eur.json()
    assert data_eur["currencies"] == ["EUR"]
    assert all(item["currency"] == "EUR" for item in data_eur["by_category"])


def test_charts_unsplit_transaction_not_counted(client, sample_account, sample_category, sample_user, db):
    t = Transaction(
        date=date(2026, 2, 1), payee="No split", amount=100.0,
        account_id=sample_account.id, category_id=sample_category.id,
    )
    db.add(t)
    db.commit()

    response = client.get(f"/api/charts?user_id={sample_user.id}")
    data = response.json()
    assert data["by_category"] == []


def test_charts_ignores_other_users_splits_entirely(client, sample_account, sample_category, sample_user, sample_user2, db):
    t = Transaction(
        date=date(2026, 2, 1), payee="Only user2", amount=100.0,
        account_id=sample_account.id, category_id=sample_category.id,
    )
    db.add(t)
    db.flush()
    db.add(TransactionSplit(transaction_id=t.id, user_id=sample_user2.id, share_amount=100.0, source="manual"))
    db.commit()

    response = client.get(f"/api/charts?user_id={sample_user.id}")
    data = response.json()
    assert data["by_category"] == []
    assert data["by_month"] == []


def test_charts_uncategorized_transaction_bucketed(client, sample_account, sample_user, db):
    t = Transaction(
        date=date(2026, 3, 10), payee="Mystery expense", amount=-42.0,
        account_id=sample_account.id, category_id=None,
    )
    db.add(t)
    db.flush()
    db.add(TransactionSplit(transaction_id=t.id, user_id=sample_user.id, share_amount=-42.0, source="manual"))
    db.commit()

    response = client.get(f"/api/charts?user_id={sample_user.id}")
    assert response.status_code == 200
    data = response.json()

    by_category = data["by_category"]
    assert len(by_category) == 1
    assert by_category[0]["category_id"] is None
    assert by_category[0]["category_name"] == "Uncategorized"
    assert by_category[0]["category_type"] == "Uncategorized"
    assert by_category[0]["amount"] == -42.0

    by_month = data["by_month"]
    assert len(by_month) == 1
    assert by_month[0]["income"] == 0.0
    assert by_month[0]["expense"] == 0.0
    assert by_month[0]["uncategorized"] == -42.0


def test_charts_uncategorized_transactions_not_mixed_into_income_or_expense_by_sign(client, sample_account, sample_user, db):
    """Regression test: uncategorized transactions used to be classified as
    income/expense by the sign of share_amount alone. A positive and a
    negative uncategorized transaction in the same month must not land in
    Income/Expense at all - they belong in their own bucket."""
    t_pos = Transaction(
        date=date(2026, 3, 5), payee="Mystery credit", amount=80.0,
        account_id=sample_account.id, category_id=None,
    )
    t_neg = Transaction(
        date=date(2026, 3, 10), payee="Mystery debit", amount=-30.0,
        account_id=sample_account.id, category_id=None,
    )
    db.add_all([t_pos, t_neg])
    db.flush()
    db.add_all([
        TransactionSplit(transaction_id=t_pos.id, user_id=sample_user.id, share_amount=80.0, source="manual"),
        TransactionSplit(transaction_id=t_neg.id, user_id=sample_user.id, share_amount=-30.0, source="manual"),
    ])
    db.commit()

    response = client.get(f"/api/charts?user_id={sample_user.id}")
    assert response.status_code == 200
    by_month = response.json()["by_month"]
    assert len(by_month) == 1
    assert by_month[0]["income"] == 0.0
    assert by_month[0]["expense"] == 0.0
    assert by_month[0]["uncategorized"] == 50.0

    net_by_month = response.json()["net_by_month"]
    assert net_by_month[0]["net"] == 50.0


def test_charts_cache_invalidated_by_new_transaction(client, sample_account, sample_category, sample_user):
    warm = client.get(f"/api/charts?user_id={sample_user.id}")
    assert warm.json()["by_category"] == []

    response = client.post(
        "/api/transactions",
        json={
            "account_id": sample_account.id,
            "category_id": sample_category.id,
            "date": "2026-02-01",
            "payee": "Groceries",
            "amount": -80.0,
            "split_weights": [{"user_id": sample_user.id, "weight": 1}],
        },
    )
    assert response.status_code == 201

    after = client.get(f"/api/charts?user_id={sample_user.id}")
    by_category = after.json()["by_category"]
    assert len(by_category) == 1
    assert by_category[0]["amount"] == -80.0


def test_charts_cache_invalidated_by_deleted_transaction(client, sample_account, sample_category, sample_user):
    create_response = client.post(
        "/api/transactions",
        json={
            "account_id": sample_account.id,
            "category_id": sample_category.id,
            "date": "2026-02-01",
            "payee": "Groceries",
            "amount": -80.0,
            "split_weights": [{"user_id": sample_user.id, "weight": 1}],
        },
    )
    transaction_id = create_response.json()["id"]

    warm = client.get(f"/api/charts?user_id={sample_user.id}")
    assert len(warm.json()["by_category"]) == 1

    delete_response = client.delete(f"/api/transactions/{transaction_id}")
    assert delete_response.status_code == 204

    after = client.get(f"/api/charts?user_id={sample_user.id}")
    assert after.json()["by_category"] == []


def test_compute_chart_data_signed_vs_magnitude(db, sample_account, sample_user):
    income_cat = Category(name="Freelance Cat", type="Income")
    expense_cat = Category(name="Groceries Cat", type="Expense")
    db.add_all([income_cat, expense_cat])
    db.commit()

    t_income = Transaction(
        date=date(2026, 5, 1), payee="Freelance", amount=500.0,
        account_id=sample_account.id, category_id=income_cat.id,
    )
    t_expense = Transaction(
        date=date(2026, 5, 2), payee="Groceries", amount=-120.0,
        account_id=sample_account.id, category_id=expense_cat.id,
    )
    db.add_all([t_income, t_expense])
    db.flush()
    db.add_all([
        TransactionSplit(transaction_id=t_income.id, user_id=sample_user.id, share_amount=500.0, source="manual"),
        TransactionSplit(transaction_id=t_expense.id, user_id=sample_user.id, share_amount=-120.0, source="manual"),
    ])
    db.commit()

    result = charts.compute_chart_data(db, sample_user.id)

    cat_amounts = {c.category_name: c.amount for c in result.by_category}
    assert cat_amounts["Freelance Cat"] == 500.0
    assert cat_amounts["Groceries Cat"] == -120.0

    assert len(result.by_month) == 1
    assert result.by_month[0].income == 500.0
    assert result.by_month[0].expense == -120.0

    assert len(result.net_by_month) == 1
    assert result.net_by_month[0].net == 380.0


def _make_parent_child(db, parent_name="Housing", child_name="Rent"):
    parent = Category(name=parent_name, type="Expense")
    db.add(parent)
    db.commit()
    child = Category(name=child_name, type="Expense", parent_id=parent.id)
    db.add(child)
    db.commit()
    return parent, child


def _add_split(db, account, category_id, amount, user, day=1, month=3, year=2026):
    t = Transaction(
        date=date(year, month, day), payee="Test", amount=amount,
        account_id=account.id, category_id=category_id,
    )
    db.add(t)
    db.flush()
    db.add(TransactionSplit(transaction_id=t.id, user_id=user.id, share_amount=amount, source="manual"))
    db.commit()
    return t


def test_charts_by_month_category_rolls_up_subcategory_to_parent(client, sample_account, sample_user, db):
    parent, child = _make_parent_child(db)
    _add_split(db, sample_account, child.id, -100.0, sample_user)

    response = client.get(f"/api/charts?user_id={sample_user.id}")
    data = response.json()

    assert data["by_month_category"] == [
        {"month": "2026-03", "category_id": parent.id, "amount": -100.0, "currency": "EUR"},
    ]
    assert data["chart_categories"] == [
        {"category_id": parent.id, "name": "Housing", "color": None, "icon": None},
    ]


def test_charts_by_month_category_no_rollup_for_top_level_category(client, sample_account, sample_user, db):
    top_level = Category(name="Groceries Cat", type="Expense")
    db.add(top_level)
    db.commit()
    _add_split(db, sample_account, top_level.id, -60.0, sample_user)

    response = client.get(f"/api/charts?user_id={sample_user.id}")
    data = response.json()

    assert data["by_month_category"] == [
        {"month": "2026-03", "category_id": top_level.id, "amount": -60.0, "currency": "EUR"},
    ]


def test_charts_by_month_category_uncategorized_bucket(client, sample_account, sample_user, db):
    _add_split(db, sample_account, None, -25.0, sample_user)

    response = client.get(f"/api/charts?user_id={sample_user.id}")
    data = response.json()

    assert data["by_month_category"] == [
        {"month": "2026-03", "category_id": None, "amount": -25.0, "currency": "EUR"},
    ]
    assert data["chart_categories"] == [
        {"category_id": None, "name": "Uncategorized", "color": None, "icon": None},
    ]


def test_charts_by_month_category_excludes_income(client, sample_account, sample_user, db):
    income_cat = Category(name="Salary Cat 2", type="Income")
    db.add(income_cat)
    db.commit()
    _add_split(db, sample_account, income_cat.id, 1000.0, sample_user)

    response = client.get(f"/api/charts?user_id={sample_user.id}")
    data = response.json()

    assert data["by_month_category"] == []
    assert data["chart_categories"] == []
    # Income still shows up in the by_month/net_by_month aggregations.
    assert data["by_month"][0]["income"] == 1000.0


def test_charts_by_month_category_excludes_transfer(client, sample_account, sample_user, db):
    transfer_cat = Category(name="Transfer Cat 2", type="Transfer")
    db.add(transfer_cat)
    db.commit()
    _add_split(db, sample_account, transfer_cat.id, -200.0, sample_user)

    response = client.get(f"/api/charts?user_id={sample_user.id}")
    data = response.json()
    assert data["by_month_category"] == []


def test_charts_drilldown_includes_children_and_excludes_siblings(client, sample_account, sample_user, db):
    parent, child_a = _make_parent_child(db, "Housing 2", "Rent 2")
    child_b = Category(name="Home Insurance 2", type="Expense", parent_id=parent.id)
    db.add(child_b)
    db.commit()
    sibling = Category(name="Groceries 2", type="Expense")
    db.add(sibling)
    db.commit()

    _add_split(db, sample_account, child_a.id, -100.0, sample_user)
    _add_split(db, sample_account, child_b.id, -30.0, sample_user)
    _add_split(db, sample_account, sibling.id, -40.0, sample_user)

    response = client.get(f"/api/charts?user_id={sample_user.id}&parent_category_id={parent.id}")
    data = response.json()

    by_cat_id = {item["category_id"]: item["amount"] for item in data["by_month_category"]}
    assert by_cat_id == {child_a.id: -100.0, child_b.id: -30.0}
    assert data["parent_category"] == {"id": parent.id, "name": "Housing 2"}
    assert None not in by_cat_id


def test_charts_drilldown_includes_direct_to_parent_transactions(client, sample_account, sample_user, db):
    """The one behavior the Linxo reference this chart is modeled on doesn't
    have: MyFinance allows a transaction to be categorized directly on a
    parent that also has subcategories, so a drilldown must show that as its
    own segment alongside each child."""
    parent, child = _make_parent_child(db, "Housing 3", "Rent 3")
    _add_split(db, sample_account, parent.id, -50.0, sample_user)
    _add_split(db, sample_account, child.id, -75.0, sample_user)

    response = client.get(f"/api/charts?user_id={sample_user.id}&parent_category_id={parent.id}")
    data = response.json()

    by_cat_id = {item["category_id"]: item["amount"] for item in data["by_month_category"]}
    assert by_cat_id == {parent.id: -50.0, child.id: -75.0}
    names = {c["category_id"]: c["name"] for c in data["chart_categories"]}
    assert names == {parent.id: "Housing 3", child.id: "Rent 3"}


def test_charts_parent_category_id_rejects_missing_category(client, sample_user):
    response = client.get(f"/api/charts?user_id={sample_user.id}&parent_category_id=999999")
    assert response.status_code == 400


def test_charts_parent_category_id_rejects_subcategory(client, sample_user, db):
    _, child = _make_parent_child(db, "Housing 4", "Rent 4")
    response = client.get(f"/api/charts?user_id={sample_user.id}&parent_category_id={child.id}")
    assert response.status_code == 400


def test_charts_parent_category_id_rejects_income_category(client, sample_user, db):
    income_cat = Category(name="Salary Cat 3", type="Income")
    db.add(income_cat)
    db.commit()
    response = client.get(f"/api/charts?user_id={sample_user.id}&parent_category_id={income_cat.id}")
    assert response.status_code == 400


def test_charts_date_range_start_month_boundary(client, sample_account, sample_category, sample_user, db):
    expense_cat = Category(name="Boundary Cat", type="Expense")
    db.add(expense_cat)
    db.commit()
    _add_split(db, sample_account, expense_cat.id, -10.0, sample_user, month=3, year=2026)
    _add_split(db, sample_account, expense_cat.id, -20.0, sample_user, month=2, year=2026)

    response = client.get(f"/api/charts?user_id={sample_user.id}&start_month=2026-03")
    data = response.json()
    assert [item["month"] for item in data["by_month_category"]] == ["2026-03"]
    assert data["by_month_category"][0]["amount"] == -10.0


def test_charts_date_range_end_month_boundary(client, sample_account, sample_user, db):
    expense_cat = Category(name="Boundary Cat 2", type="Expense")
    db.add(expense_cat)
    db.commit()
    _add_split(db, sample_account, expense_cat.id, -10.0, sample_user, month=3, year=2026)
    _add_split(db, sample_account, expense_cat.id, -20.0, sample_user, month=4, year=2026)

    response = client.get(f"/api/charts?user_id={sample_user.id}&end_month=2026-03")
    data = response.json()
    assert [item["month"] for item in data["by_month_category"]] == ["2026-03"]
    assert data["by_month_category"][0]["amount"] == -10.0


def test_charts_date_range_filters_by_shifted_accounting_month(client, sample_account, sample_user, db):
    """A transaction's raw date can fall outside the requested range while its
    accounting_month_offset shifts it in, or vice versa - filtering must use
    the computed accounting month, not Transaction.date."""
    expense_cat = Category(name="Shift Cat", type="Expense")
    db.add(expense_cat)
    db.commit()
    t = Transaction(
        date=date(2026, 2, 25), payee="Shifted", amount=-15.0,
        account_id=sample_account.id, category_id=expense_cat.id, accounting_month_offset=1,
    )
    db.add(t)
    db.flush()
    db.add(TransactionSplit(transaction_id=t.id, user_id=sample_user.id, share_amount=-15.0, source="manual"))
    db.commit()

    # Raw date (Feb) is outside this range, but the shifted accounting month
    # (March) is inside it - must be included.
    included = client.get(f"/api/charts?user_id={sample_user.id}&start_month=2026-03&end_month=2026-03")
    assert [item["amount"] for item in included.json()["by_month_category"]] == [-15.0]

    # The raw date itself (Feb) must NOT be used for filtering.
    excluded = client.get(f"/api/charts?user_id={sample_user.id}&start_month=2026-02&end_month=2026-02")
    assert excluded.json()["by_month_category"] == []


def test_charts_by_month_category_currency_grouping(client, sample_user, db):
    eur_account = Account(name="EUR Acct 2", type="Checking", currency="EUR")
    usd_account = Account(name="USD Acct 2", type="Checking", currency="USD")
    db.add_all([eur_account, usd_account])
    db.commit()
    expense_cat = Category(name="Multi-currency Cat", type="Expense")
    db.add(expense_cat)
    db.commit()

    _add_split(db, eur_account, expense_cat.id, -10.0, sample_user)
    _add_split(db, usd_account, expense_cat.id, -20.0, sample_user)

    response = client.get(f"/api/charts?user_id={sample_user.id}")
    data = response.json()
    by_currency = {item["currency"]: item["amount"] for item in data["by_month_category"]}
    assert by_currency == {"EUR": -10.0, "USD": -20.0}


def test_charts_by_month_category_zero_net_omitted(client, sample_account, sample_user, db):
    expense_cat = Category(name="Net Zero Cat", type="Expense")
    db.add(expense_cat)
    db.commit()
    _add_split(db, sample_account, expense_cat.id, -10.0, sample_user)
    _add_split(db, sample_account, expense_cat.id, 10.0, sample_user)

    response = client.get(f"/api/charts?user_id={sample_user.id}")
    assert response.json()["by_month_category"] == []


def test_charts_chart_categories_ordered_by_spend_uncategorized_last(client, sample_account, sample_user, db):
    small = Category(name="Small Cat", type="Expense")
    big = Category(name="Big Cat", type="Expense")
    db.add_all([small, big])
    db.commit()
    _add_split(db, sample_account, small.id, -10.0, sample_user)
    _add_split(db, sample_account, big.id, -100.0, sample_user)
    _add_split(db, sample_account, None, -1000.0, sample_user)

    response = client.get(f"/api/charts?user_id={sample_user.id}")
    ids = [c["category_id"] for c in response.json()["chart_categories"]]
    assert ids == [big.id, small.id, None]


def test_charts_cache_invalidated_by_new_transaction_by_month_category(client, sample_account, sample_user, db):
    expense_cat = Category(name="Cache Cat", type="Expense")
    db.add(expense_cat)
    db.commit()

    warm = client.get(f"/api/charts?user_id={sample_user.id}")
    assert warm.json()["by_month_category"] == []

    response = client.post(
        "/api/transactions",
        json={
            "account_id": sample_account.id,
            "category_id": expense_cat.id,
            "date": "2026-02-01",
            "payee": "Groceries",
            "amount": -80.0,
            "split_weights": [{"user_id": sample_user.id, "weight": 1}],
        },
    )
    assert response.status_code == 201

    after = client.get(f"/api/charts?user_id={sample_user.id}")
    by_month_category = after.json()["by_month_category"]
    assert len(by_month_category) == 1
    assert by_month_category[0]["amount"] == -80.0
