import os
import sqlite3
from contextlib import contextmanager
from pathlib import Path
from urllib.parse import urlparse

try:
    import psycopg
except ImportError:
    psycopg = None

DEFAULT_DB_URL = "sqlite:///data/prototype.db"


class Database:
    def __init__(self, db_url: str | None = None):
        self.db_url = db_url or os.environ.get("DATABASE_URL", DEFAULT_DB_URL)
        self.is_postgres = self.db_url.startswith(("postgresql://", "postgres://"))

        if not self.is_postgres:
            # Handle sqlite URL
            raw_path = self.db_url.replace("sqlite:///", "").replace("sqlite://", "")
            if raw_path == ":memory:":
                self.sqlite_path = ":memory:"
            else:
                p = Path(raw_path)
                p.parent.mkdir(parents=True, exist_ok=True)
                self.sqlite_path = str(p)

    def _get_raw_conn(self):
        if self.is_postgres:
            if psycopg is None:
                raise RuntimeError("psycopg is required for PostgreSQL connections.")
            return psycopg.connect(self.db_url)
        else:
            conn = sqlite3.connect(self.sqlite_path)
            conn.execute("PRAGMA foreign_keys = ON;")
            conn.row_factory = sqlite3.Row
            return conn

    def adapt_sql(self, sql: str) -> str:
        """Translate '?' parameter placeholders to '%s' when running on PostgreSQL."""
        return sql.replace("?", "%s") if self.is_postgres else sql

    @contextmanager
    def connection(self):
        """Yield a database connection for read or manual queries."""
        conn = self._get_raw_conn()
        try:
            yield conn
        finally:
            conn.close()

    @contextmanager
    def transaction(self):
        """
        Execute in an ACID transaction: commits on clean exit, rolls back on exception.
        """
        conn = self._get_raw_conn()
        try:
            yield conn
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()


# Default singleton database instance
db = Database()
