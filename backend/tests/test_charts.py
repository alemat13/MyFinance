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

    by_category, by_month, net_by_month = charts.compute_chart_data(db, sample_user.id)

    cat_amounts = {c.category_name: c.amount for c in by_category}
    assert cat_amounts["Freelance Cat"] == 500.0
    assert cat_amounts["Groceries Cat"] == -120.0

    assert len(by_month) == 1
    assert by_month[0].income == 500.0
    assert by_month[0].expense == -120.0

    assert len(net_by_month) == 1
    assert net_by_month[0].net == 380.0
