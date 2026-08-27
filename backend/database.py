import os

from sqlalchemy import create_engine, event
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
