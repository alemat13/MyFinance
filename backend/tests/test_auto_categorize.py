"""The write side of automatic categorisation: a sync filing its own rows.

The suggestion itself is tested in test_categorizer.py; what matters here is
what gets written, what is left alone, and what happens when there is no
usable model — which is the normal state of a fresh install.
"""

from datetime import date

import pytest

import auto_categorize
import categorizer
import enable_banking
from models import Category, CategorizerModel, Transaction, TransactionHistory

# The bank-sync fixtures live with the bank-sync tests; pytest collects them
# from here because they are imported into this module's namespace.
from tests.test_bank_sync import _booked, global_weights, linked_connection  # noqa: F401


@pytest.fixture()
def categories(db):
    groceries = Category(name="Groceries", type="Expense")
    transport = Category(name="Transport", type="Expense")
    db.add_all([groceries, transport])
    db.commit()
    return groceries, transport


@pytest.fixture()
def active_model(db, sample_account, categories):
    """A model fitted on two unmistakable merchants, stored and activated.

    Fitted through `categorizer.train` rather than through the endpoint, so
    these tests describe what the sync does with a model rather than how one
    is obtained.
    """
    groceries, transport = categories
    rows = []
    for i in range(30):
        for label, category, payee in (
            ("CARTE 0%d/03 SUPERMARCHE DU COIN" % (i % 9 + 1), groceries, "SUPERMARCHE DU COIN"),
            ("CARTE 0%d/04 METRO TICKET BUREAU" % (i % 9 + 1), transport, "METRO TICKET BUREAU"),
        ):
            row = Transaction(date=date(2026, 3, i % 28 + 1), payee=payee, amount=-10.0,
                              account_id=sample_account.id, category_id=category.id,
                              raw_label=label, raw_source="linxo_export")
            db.add(row)
            rows.append(row)
    db.commit()

    model, params = categorizer.train(rows)
    record = CategorizerModel(status="ready", is_active=True, trained_rows=len(rows),
                              params=params, metrics={}, blob=categorizer.dumps(model))
    db.add(record)
    db.commit()
    return record


def _uncategorised(db, account_id, label, payee=None):
    row = Transaction(date=date(2026, 8, 1), payee=payee if payee is not None else label,
                      amount=-12.0, account_id=account_id, category_id=None,
                      raw_label=label, raw_source="enable_banking")
    db.add(row)
    db.commit()
    return row


# ── file_rows ────────────────────────────────────────────────────

def test_file_rows_categorises_and_leaves_the_row_for_review(db, sample_account, active_model, categories):
    groceries, _ = categories
    row = _uncategorised(db, sample_account.id, "CARTE 02/08 SUPERMARCHE DU COIN", payee="whatever")
    row.reconciled = True
    db.commit()

    assert auto_categorize.file_rows(db, [row]) == 1
    db.commit()

    assert row.category_id == groceries.id
    # The review queue: an empty category hides a row, an unreconciled one shows it.
    assert row.reconciled is False


def test_file_rows_renames_a_remembered_merchant(db, sample_account, active_model):
    row = _uncategorised(db, sample_account.id, "CARTE 09/08 SUPERMARCHE DU COIN")
    assert auto_categorize.file_rows(db, [row]) == 1
    db.commit()
    assert row.payee == "SUPERMARCHE DU COIN"
    # The bank's own wording is never touched, whatever the payee becomes.
    assert row.raw_label == "CARTE 09/08 SUPERMARCHE DU COIN"


def test_file_rows_never_overrules_a_category_somebody_set(db, sample_account, active_model, categories):
    _, transport = categories
    row = _uncategorised(db, sample_account.id, "CARTE 02/08 SUPERMARCHE DU COIN")
    row.category_id = transport.id
    db.commit()

    assert auto_categorize.file_rows(db, [row]) == 0
    assert row.category_id == transport.id


def test_file_rows_records_what_it_changed(db, sample_account, active_model, categories):
    groceries, _ = categories
    row = _uncategorised(db, sample_account.id, "CARTE 02/08 SUPERMARCHE DU COIN", payee="whatever")
    auto_categorize.file_rows(db, [row])
    db.commit()

    entry = db.query(TransactionHistory).filter(TransactionHistory.transaction_id == row.id).one()
    assert entry.action == "updated"
    assert entry.source == "categorizer"
    assert entry.changes["category_id"] == {"old": None, "new": groceries.id}


def test_file_rows_does_nothing_without_an_active_model(db, sample_account, categories):
    row = _uncategorised(db, sample_account.id, "CARTE 02/08 SUPERMARCHE DU COIN")
    assert auto_categorize.file_rows(db, [row]) == 0
    assert row.category_id is None
    assert db.query(TransactionHistory).count() == 0


def test_file_rows_ignores_an_inactive_model(db, sample_account, active_model, categories):
    active_model.is_active = False
    db.commit()
    row = _uncategorised(db, sample_account.id, "CARTE 02/08 SUPERMARCHE DU COIN")
    assert auto_categorize.file_rows(db, [row]) == 0


def test_file_rows_quietly_survives_a_broken_model(db, sample_account, active_model):
    """A sync has already imported its rows by the time this runs, so a model
    that cannot be loaded must cost the categories and nothing else."""
    active_model.blob = b"not a pickle"
    db.commit()
    row = _uncategorised(db, sample_account.id, "CARTE 02/08 SUPERMARCHE DU COIN")

    assert auto_categorize.file_rows_quietly(db, [row]) == 0
    assert row.category_id is None


# ── through a bank sync ──────────────────────────────────────────

def test_a_sync_files_the_rows_it_imports(db, linked_connection, global_weights, active_model, categories):
    groceries, _ = categories
    rows = enable_banking.normalize_transactions([
        _booked("12.00", "DBIT", "2026-08-02", remittance_information=["CARTE 02/08 SUPERMARCHE DU COIN"]),
    ])
    created = enable_banking.import_transactions(db, linked_connection, rows,
                                                 date(2026, 8, 1), date(2026, 8, 31))

    assert created == 1
    imported = db.query(Transaction).filter(Transaction.external_id.isnot(None)).one()
    assert imported.category_id == groceries.id
    assert imported.payee == "SUPERMARCHE DU COIN"
    assert imported.reconciled is False
    # Both steps are on the record: the sync created the row, the model filed it.
    sources = {h.source for h in db.query(TransactionHistory)
               .filter(TransactionHistory.transaction_id == imported.id).all()}
    assert sources == {"bank_sync", "categorizer"}


def test_a_sync_with_no_active_model_imports_uncategorised_as_before(db, linked_connection, global_weights):
    rows = enable_banking.normalize_transactions([
        _booked("12.00", "DBIT", "2026-08-02", remittance_information=["CARTE 02/08 SUPERMARCHE DU COIN"]),
    ])
    assert enable_banking.import_transactions(db, linked_connection, rows,
                                              date(2026, 8, 1), date(2026, 8, 31)) == 1
    assert db.query(Transaction).filter(Transaction.external_id.isnot(None)).one().category_id is None


def test_a_sync_still_imports_when_the_model_cannot_be_loaded(db, linked_connection, global_weights, active_model):
    active_model.blob = b"not a pickle"
    db.commit()
    rows = enable_banking.normalize_transactions([
        _booked("12.00", "DBIT", "2026-08-02", remittance_information=["CARTE 02/08 SUPERMARCHE DU COIN"]),
    ])
    assert enable_banking.import_transactions(db, linked_connection, rows,
                                              date(2026, 8, 1), date(2026, 8, 31)) == 1
    assert db.query(Transaction).filter(Transaction.external_id.isnot(None)).one().category_id is None


# ── in the import preview ────────────────────────────────────────

_CSV = """Date,Label,Amount
2026-08-02,CARTE 02/08 SUPERMARCHE DU COIN,-42.50
2026-08-03,CARTE 03/08 METRO TICKET BUREAU,-2.10
"""

_PREVIEW_FORM = {
    "encoding": "utf-8", "delimiter": ",", "date_format": "%Y-%m-%d",
    "decimal_separator": ".", "date_col": "Date", "payee_col": "Label", "amount_col": "Amount",
}


def _preview(client, account_id):
    return client.post("/api/import/preview",
                       files={"file": ("rows.csv", _CSV.encode("utf-8"), "text/csv")},
                       data={**_PREVIEW_FORM, "account_id": account_id}).json()


def test_the_preview_offers_the_models_category(client, db, sample_account, active_model, categories):
    groceries, transport = categories
    rows = _preview(client, sample_account.id)

    assert [r["suggested_category_id"] for r in rows] == [groceries.id, transport.id]
    assert [r["suggested_category_name"] for r in rows] == ["Groceries", "Transport"]
    assert all(0.0 < r["suggested_confidence"] <= 1.0 for r in rows)
    # Offered, never applied: the file said nothing, so the row still needs one.
    assert [r["category_id"] for r in rows] == [None, None]
    assert [r["status"] for r in rows] == ["needs_category", "needs_category"]


def test_the_preview_says_nothing_without_an_active_model(client, sample_account):
    rows = _preview(client, sample_account.id)
    assert [r["suggested_category_id"] for r in rows] == [None, None]
    assert [r["suggested_confidence"] for r in rows] == [None, None]


def test_the_preview_still_works_when_the_model_cannot_be_loaded(client, db, sample_account, active_model):
    active_model.blob = b"not a pickle"
    db.commit()
    rows = _preview(client, sample_account.id)
    assert len(rows) == 2
    assert [r["suggested_category_id"] for r in rows] == [None, None]
