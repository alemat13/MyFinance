import os

from sqlalchemy import Column, create_engine, event, inspect, text
from sqlalchemy.engine import Engine
from sqlalchemy.orm import sessionmaker, declarative_base

SQLALCHEMY_DATABASE_URL = os.environ.get("DATABASE_URL", "sqlite:///./finance.db")
if SQLALCHEMY_DATABASE_URL.startswith("postgresql://"):
    SQLALCHEMY_DATABASE_URL = "postgresql+psycopg://" + SQLALCHEMY_DATABASE_URL[len("postgresql://"):]

connect_args = (
    {"check_same_thread": False}
    if SQLALCHEMY_DATABASE_URL.startswith("sqlite")
    else {}
)

engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args=connect_args)


@event.listens_for(engine, "connect")
def _enable_sqlite_fk(dbapi_connection, connection_record):
    if SQLALCHEMY_DATABASE_URL.startswith("sqlite"):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def _server_default_literal(column: Column) -> str | None:
    """A SQL literal for column's Python-side default, if it's a plain
    scalar (not a callable like `datetime.utcnow`) — needed so ADD COLUMN
    can backfill existing rows instead of leaving nulls in a NOT NULL column."""
    default = column.default
    if default is None or not getattr(default, "is_scalar", False):
        return None
    value = default.arg
    if isinstance(value, bool):
        return "1" if value else "0"
    if isinstance(value, (int, float)):
        return str(value)
    if isinstance(value, str):
        return "'" + value.replace("'", "''") + "'"
    return None


def sync_schema(bind: Engine, base=None) -> None:
    """Idempotently add any model column missing from an already-existing
    table (additive only — never drops, renames, or retypes a column).

    `Base.metadata.create_all()` only issues CREATE TABLE IF NOT EXISTS; it
    never alters a table that already exists. That's fine for local/dev
    databases (schema changes there go through drop_all/create_all per
    seed.py), but production holds persistent real data and is never
    reseeded — so a column added to a model would otherwise crash every
    query touching it in production the next time this code deploys.
    """
    base = base or Base
    inspector = inspect(bind)
    existing_tables = set(inspector.get_table_names())

    with bind.begin() as conn:
        preparer = conn.dialect.identifier_preparer
        for table in base.metadata.tables.values():
            if table.name not in existing_tables:
                continue  # create_all() just created it fresh with every column
            existing_columns = {c["name"] for c in inspector.get_columns(table.name)}
            for column in table.columns:
                if column.name in existing_columns:
                    continue
                col_type = column.type.compile(dialect=conn.dialect)
                ddl = (
                    f"ALTER TABLE {preparer.quote(table.name)} "
                    f"ADD COLUMN {preparer.quote(column.name)} {col_type}"
                )
                default_literal = _server_default_literal(column)
                if default_literal is not None:
                    ddl += f" DEFAULT {default_literal}"
                    if not column.nullable:
                        ddl += " NOT NULL"
                conn.execute(text(ddl))
