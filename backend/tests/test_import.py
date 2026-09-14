CSV_TEXT = """Date,Label,Amount,Category
2026-01-15,Whole Foods,-42.50,Test Salary
2026-01-16,Unknown Shop,-10.00,Nonexistent Category
"""

PREVIEW_FORM = {
    "encoding": "utf-8",
    "delimiter": ",",
    "date_format": "%Y-%m-%d",
    "decimal_separator": ".",
    "date_col": "Date",
    "payee_col": "Label",
    "amount_col": "Amount",
    "category_col": "Category",
}


def _csv_file(text: str = CSV_TEXT, name: str = "transactions.csv", content_type: str = "text/csv"):
    return {"file": (name, text.encode("utf-8"), content_type)}


def _preview(client, account_id, **overrides):
    data = {**PREVIEW_FORM, "account_id": account_id, **overrides}
    return client.post("/api/import/preview", files=_csv_file(), data=data)


MULTI_ACCOUNT_CSV = """Date,Label,Amount,Category,Account
2026-01-15,Whole Foods,-42.50,Test Salary,Test Checking
2026-01-16,Book Store,-15.00,Test Salary,Test Savings
2026-01-17,Unknown Merchant,-5.00,Test Salary,Nonexistent Account
2026-01-18,Blank Account Row,-3.00,Test Salary,
"""


def test_import_detect_maps_columns_and_formats(client):
    response = client.post("/api/import/detect", files=_csv_file())
    assert response.status_code == 200
    body = response.json()
    assert body["encoding"] == "utf-8-sig"  # utf-8-sig also decodes plain (non-BOM) utf-8 text
    assert body["delimiter"] == ","
    assert body["date_format"] == "%Y-%m-%d"
    assert body["decimal_separator"] == "."
    assert body["column_mapping"] == {
        "date": "Date", "payee": "Label", "amount": "Amount",
        "memo": None, "category": "Category", "account": None,
    }
    assert body["headers"] == ["Date", "Label", "Amount", "Category"]
    assert len(body["sample_rows"]) == 2


def test_import_detect_handles_cp1252_encoding(client):
    text = "Date;Libelle;Montant\n2026-01-15;Café Central;-12,50\n"
    response = client.post(
        "/api/import/detect",
        files={"file": ("transactions.csv", text.encode("cp1252"), "text/csv")},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["encoding"] == "cp1252"
    assert body["delimiter"] == ";"
    assert body["decimal_separator"] == ","
    assert body["column_mapping"]["payee"] == "Libelle"
    assert body["sample_rows"][0]["Libelle"] == "Café Central"


def test_import_detect_handles_utf16_encoding(client):
    text = "Date\tLibellé\tCatégorie\tMontant\n15/09/2026\tAUX OURS\tRestaurants\t-25\n"
    response = client.post(
        "/api/import/detect",
        files={"file": ("transactions.csv", text.encode("utf-16"), "text/csv")},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["encoding"] == "utf-16"
    assert body["delimiter"] == "\t"
    assert body["column_mapping"]["payee"] == "Libellé"
    assert body["column_mapping"]["category"] == "Catégorie"
    assert body["sample_rows"][0]["Libellé"] == "AUX OURS"


def test_import_detect_maps_account_column(client):
    text = "Date,Label,Amount,Category,Nom du compte\n2026-01-15,Whole Foods,-42.50,Test Salary,Compte Courant\n"
    response = client.post("/api/import/detect", files=_csv_file(text))
    assert response.status_code == 200
    assert response.json()["column_mapping"]["account"] == "Nom du compte"


def test_import_detect_leaves_unknown_columns_unmapped(client):
    text = "Foo,Bar,Baz\n1,2,3\n"
    response = client.post("/api/import/detect", files=_csv_file(text))
    assert response.status_code == 200
    mapping = response.json()["column_mapping"]
    assert mapping == {"date": None, "payee": None, "amount": None, "memo": None, "category": None, "account": None}


def test_import_preview_resolves_category_and_flags_unknown(client, sample_account, sample_category):
    response = _preview(client, sample_account.id)
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

    response = _preview(client, sample_account.id)
    assert response.status_code == 200
    rows = response.json()
    assert rows[0]["status"] == "possible_duplicate"


def test_import_preview_resolves_account_by_name(client, sample_account, sample_account_2, sample_category):
    response = client.post(
        "/api/import/preview",
        files=_csv_file(MULTI_ACCOUNT_CSV),
        data={**PREVIEW_FORM, "account_id": sample_account.id, "account_col": "Account"},
    )
    assert response.status_code == 200
    rows = response.json()
    assert rows[0]["account_id"] == sample_account.id
    assert rows[0]["account_matched"] is True
    assert rows[1]["account_id"] == sample_account_2.id
    assert rows[1]["account_matched"] is True


def test_import_preview_falls_back_to_default_account_when_unmatched(client, sample_account, sample_account_2, sample_category):
    response = client.post(
        "/api/import/preview",
        files=_csv_file(MULTI_ACCOUNT_CSV),
        data={**PREVIEW_FORM, "account_id": sample_account.id, "account_col": "Account"},
    )
    assert response.status_code == 200
    rows = response.json()
    assert rows[2]["account_id"] == sample_account.id
    assert rows[2]["account_matched"] is False
    assert rows[2]["account_name"] == "Nonexistent Account"
    assert rows[3]["account_id"] == sample_account.id
    assert rows[3]["account_matched"] is False
    assert rows[3]["account_name"] is None


def test_import_preview_duplicate_detection_scoped_per_account(client, sample_account, sample_account_2, sample_category, db):
    from datetime import date
    from models import Transaction
    db.add(Transaction(
        date=date(2026, 1, 15), payee="Whole Foods", amount=-42.50,
        account_id=sample_account.id, category_id=sample_category.id,
    ))
    db.commit()

    text = (
        "Date,Label,Amount,Category,Account\n"
        "2026-01-15,Whole Foods,-42.50,Test Salary,Test Checking\n"
        "2026-01-15,Whole Foods,-42.50,Test Salary,Test Savings\n"
    )
    response = client.post(
        "/api/import/preview",
        files=_csv_file(text),
        data={**PREVIEW_FORM, "account_id": sample_account.id, "account_col": "Account"},
    )
    assert response.status_code == 200
    rows = response.json()
    assert rows[0]["status"] == "possible_duplicate"
    assert rows[1]["status"] == "ok"


def test_import_preview_european_number_format(client, sample_account, sample_category):
    text = "Date,Label,Amount,Category\n2026-01-15,Whole Foods,\"-1234,50\",Test Salary\n"
    response = client.post(
        "/api/import/preview",
        files=_csv_file(text),
        data={**PREVIEW_FORM, "account_id": sample_account.id, "decimal_separator": ","},
    )
    assert response.status_code == 200
    rows = response.json()
    assert rows[0]["amount"] == -1234.50


def test_import_preview_matches_commit_for_single_owner_account(client, sample_account, sample_category, sample_user):
    # sample_account has no AccountUser owners at all (a degenerate single/no-owner
    # account). The old single-owner skip no longer exists — global split weights
    # apply regardless of owner count, and preview/commit must resolve identically.
    response = client.put(
        "/api/split-weights",
        json=[{"user_id": sample_user.id, "weight": 100}],
    )
    assert response.status_code == 200

    response = _preview(client, sample_account.id)
    assert response.status_code == 200
    rows = response.json()
    assert rows[0]["status"] == "ok"
    preview_split = rows[0]["preview_split"]
    assert len(preview_split) == 1
    assert preview_split[0]["share_amount"] == -42.50
    assert preview_split[0]["source"] == "global"

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
    assert len(committed["splits"]) == 1
    assert committed["splits"][0]["share_amount"] == -42.50


def test_import_commit_allows_rows_without_category(client, sample_account, sample_user):
    # category_id is optional everywhere else post-categorization refactor
    # (transaction form, backend model); CSV import must match rather than
    # be the one place that still requires it.
    response = client.post(
        "/api/import/commit",
        json={"rows": [{
            "date": "2026-01-15", "payee": "Whole Foods", "amount": -42.50,
            "account_id": sample_account.id, "category_id": None,
            "split_weights": [{"user_id": sample_user.id, "weight": 1}],
        }]},
    )
    assert response.status_code == 200

    response = client.get("/api/transactions")
    data = response.json()
    assert len(data) == 1
    assert data[0]["category_id"] is None


def test_import_commit_rejects_negative_split_weight(client, sample_account, sample_category, sample_user):
    response = client.post(
        "/api/import/commit",
        json={"rows": [{
            "date": "2026-01-15", "payee": "Whole Foods", "amount": -42.50,
            "account_id": sample_account.id, "category_id": sample_category.id,
            "split_weights": [{"user_id": sample_user.id, "weight": -5}],
        }]},
    )
    assert response.status_code == 422

    response = client.get("/api/transactions")
    assert response.json() == []


def test_import_commit_creates_transactions(client, sample_account, sample_category, sample_user):
    response = client.post(
        "/api/import/commit",
        json={"rows": [
            {
                "date": "2026-01-15", "payee": "Whole Foods", "amount": -42.50,
                "account_id": sample_account.id, "category_id": sample_category.id,
                "split_weights": [{"user_id": sample_user.id, "weight": 1}],
            },
            {
                "date": "2026-01-16", "payee": "Trader Joe's", "amount": -20.00,
                "account_id": sample_account.id, "category_id": sample_category.id,
                "split_weights": [{"user_id": sample_user.id, "weight": 1}],
            },
        ]},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["created_count"] == 2
    assert len(data["transaction_ids"]) == 2

    response = client.get("/api/transactions")
    assert len(response.json()) == 2


def test_import_commit_creates_transactions_in_distinct_accounts(client, sample_account, sample_account_2, sample_category, sample_user):
    response = client.post(
        "/api/import/commit",
        json={"rows": [
            {
                "date": "2026-01-15", "payee": "Whole Foods", "amount": -42.50,
                "account_id": sample_account.id, "category_id": sample_category.id,
                "split_weights": [{"user_id": sample_user.id, "weight": 1}],
            },
            {
                "date": "2026-01-16", "payee": "Book Store", "amount": -15.00,
                "account_id": sample_account_2.id, "category_id": sample_category.id,
                "split_weights": [{"user_id": sample_user.id, "weight": 1}],
            },
        ]},
    )
    assert response.status_code == 200

    response = client.get("/api/transactions")
    by_payee = {t["payee"]: t for t in response.json()}
    assert by_payee["Whole Foods"]["account_id"] == sample_account.id
    assert by_payee["Book Store"]["account_id"] == sample_account_2.id


def test_import_commit_creates_unreconciled_transactions(client, sample_account, sample_category, sample_user):
    response = client.post(
        "/api/import/commit",
        json={"rows": [{
            "date": "2026-01-15", "payee": "Whole Foods", "amount": -42.50,
            "account_id": sample_account.id, "category_id": sample_category.id,
            "split_weights": [{"user_id": sample_user.id, "weight": 1}],
        }]},
    )
    assert response.status_code == 200

    response = client.get("/api/transactions")
    data = response.json()
    assert len(data) == 1
    assert data[0]["reconciled"] is False


def test_import_preview_rejects_oversized_file(client, sample_account):
    from import_csv import MAX_IMPORT_ROWS
    lines = ["Date,Label,Amount,Category"]
    lines += [f"2026-01-15,Payee {i},-1.00,Test Salary" for i in range(MAX_IMPORT_ROWS + 1)]
    text = "\n".join(lines) + "\n"

    response = client.post(
        "/api/import/preview",
        files=_csv_file(text),
        data={**PREVIEW_FORM, "account_id": sample_account.id},
    )
    assert response.status_code == 422
    assert str(MAX_IMPORT_ROWS) in response.json()["detail"]


def test_import_commit_rejects_oversized_payload(client, sample_account, sample_category, sample_user):
    from import_csv import MAX_IMPORT_ROWS
    rows = [
        {
            "date": "2026-01-15", "payee": f"Payee {i}", "amount": -1.00,
            "account_id": sample_account.id, "category_id": sample_category.id,
            "split_weights": [{"user_id": sample_user.id, "weight": 1}],
        }
        for i in range(MAX_IMPORT_ROWS + 1)
    ]

    response = client.post("/api/import/commit", json={"rows": rows})
    assert response.status_code == 422
    assert str(MAX_IMPORT_ROWS) in response.json()["detail"]

    response = client.get("/api/transactions")
    assert response.json() == []


def test_import_commit_batches_flush_across_partial_batch(client, sample_account, sample_category, sample_user, monkeypatch):
    import routers.imports as imports_router
    monkeypatch.setattr(imports_router, "_IMPORT_FLUSH_BATCH_SIZE", 2)

    rows = [
        {
            "date": "2026-01-15", "payee": f"Payee {i}", "amount": -1.00 * (i + 1),
            "account_id": sample_account.id, "category_id": sample_category.id,
            "split_weights": [{"user_id": sample_user.id, "weight": 1}],
        }
        for i in range(5)
    ]

    response = client.post("/api/import/commit", json={"rows": rows})
    assert response.status_code == 200
    data = response.json()
    assert data["created_count"] == 5
    assert len(set(data["transaction_ids"])) == 5

    response = client.get("/api/transactions")
    committed = response.json()
    assert len(committed) == 5
    for transaction in committed:
        assert len(transaction["splits"]) == 1
