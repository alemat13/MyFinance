CSV_TEXT = """Date,Label,Amount,Category
2026-01-15,Whole Foods,-42.50,Test Salary
2026-01-16,Unknown Shop,-10.00,Nonexistent Category
"""


def test_import_preview_resolves_category_and_flags_unknown(client, sample_account, sample_category):
    response = client.post(
        "/api/import/preview",
        json={
            "csv_text": CSV_TEXT,
            "account_id": sample_account.id,
            "date_col": "Date",
            "payee_col": "Label",
            "amount_col": "Amount",
            "category_col": "Category",
        },
    )
    assert response.status_code == 200
    rows = response.json()
    assert len(rows) == 2
    assert rows[0]["status"] == "ok"
    assert rows[0]["category_id"] == sample_category.id
    assert rows[1]["status"] == "needs_category"
    assert rows[1]["category_id"] is None


def test_import_preview_flags_possible_duplicate(client, sample_account, sample_category, db):
    from datetime import date
    from models import Transaction
    db.add(Transaction(
        date=date(2026, 1, 15), payee="Whole Foods", amount=-42.50,
        account_id=sample_account.id, category_id=sample_category.id,
    ))
    db.commit()

    response = client.post(
        "/api/import/preview",
        json={
            "csv_text": CSV_TEXT,
            "account_id": sample_account.id,
            "date_col": "Date",
            "payee_col": "Label",
            "amount_col": "Amount",
            "category_col": "Category",
        },
    )
    assert response.status_code == 200
    rows = response.json()
    assert rows[0]["status"] == "possible_duplicate"


def test_import_preview_matches_commit_for_single_owner_account(client, sample_account, sample_category, sample_user):
    # sample_account has no AccountUser owners at all (a degenerate single/no-owner
    # account), so global split weights must never be auto-applied to it - same rule
    # apply_split enforces on commit.
    response = client.put(
        "/api/split-weights",
        json=[{"user_id": sample_user.id, "weight": 100.0}],
    )
    assert response.status_code == 200

    response = client.post(
        "/api/import/preview",
        json={
            "csv_text": CSV_TEXT,
            "account_id": sample_account.id,
            "date_col": "Date",
            "payee_col": "Label",
            "amount_col": "Amount",
            "category_col": "Category",
        },
    )
    assert response.status_code == 200
    rows = response.json()
    assert rows[0]["status"] == "ok"
    assert rows[0]["preview_split"] == []

    response = client.post(
        "/api/import/commit",
        json={"rows": [{
            "date": "2026-01-15", "payee": "Whole Foods", "amount": -42.50,
            "account_id": sample_account.id, "category_id": sample_category.id,
        }]},
    )
    assert response.status_code == 200
    transaction_id = response.json()["transaction_ids"][0]

    response = client.get("/api/transactions")
    committed = next(t for t in response.json() if t["id"] == transaction_id)
    assert committed["splits"] == []


def test_import_commit_rejects_rows_without_category(client, sample_account, sample_category):
    response = client.post(
        "/api/import/commit",
        json={"rows": [{
            "date": "2026-01-15", "payee": "Whole Foods", "amount": -42.50,
            "account_id": sample_account.id, "category_id": None,
        }]},
    )
    assert response.status_code == 422


def test_import_commit_creates_transactions(client, sample_account, sample_category):
    response = client.post(
        "/api/import/commit",
        json={"rows": [
            {
                "date": "2026-01-15", "payee": "Whole Foods", "amount": -42.50,
                "account_id": sample_account.id, "category_id": sample_category.id,
            },
            {
                "date": "2026-01-16", "payee": "Trader Joe's", "amount": -20.00,
                "account_id": sample_account.id, "category_id": sample_category.id,
            },
        ]},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["created_count"] == 2
    assert len(data["transaction_ids"]) == 2

    response = client.get("/api/transactions")
    assert len(response.json()) == 2
