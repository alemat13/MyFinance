from sqlalchemy import create_engine, inspect, text

from database import sync_schema
from models import Transaction  # noqa: F401 - registers Transaction on Base.metadata


def test_sync_schema_adds_missing_column_to_existing_table():
    """Reproduces the production outage: a table created before a column
    existed on its model must get that column added on the next startup,
    instead of every query touching it crashing with "no such column"."""
    engine = create_engine("sqlite://")
    with engine.begin() as conn:
        conn.execute(text("""
            CREATE TABLE transactions (
                id INTEGER PRIMARY KEY,
                date DATE NOT NULL,
                payee VARCHAR(200) NOT NULL,
                memo TEXT,
                amount FLOAT NOT NULL,
                account_id INTEGER,
                category_id INTEGER,
                created_at DATETIME
            )
        """))

    inspector = inspect(engine)
    columns_before = {c["name"] for c in inspector.get_columns("transactions")}
    assert "accounting_month_offset" not in columns_before

    sync_schema(engine)

    inspector = inspect(engine)
    columns_after = {c["name"] for c in inspector.get_columns("transactions")}
    assert "accounting_month_offset" in columns_after

    with engine.begin() as conn:
        conn.execute(text(
            "INSERT INTO transactions (date, payee, amount) VALUES ('2026-01-01', 'Test', 10.0)"
        ))
        offset = conn.execute(text("SELECT accounting_month_offset FROM transactions")).scalar()
    assert offset == 0


def test_sync_schema_is_idempotent():
    engine = create_engine("sqlite://")
    with engine.begin() as conn:
        conn.execute(text("CREATE TABLE transactions (id INTEGER PRIMARY KEY)"))

    sync_schema(engine)
    sync_schema(engine)  # second run must not error on already-present columns

    inspector = inspect(engine)
    columns = {c["name"] for c in inspector.get_columns("transactions")}
    assert "accounting_month_offset" in columns
    assert "payee" in columns
