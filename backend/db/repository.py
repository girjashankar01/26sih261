from datetime import datetime, timezone
from typing import Any
from backend.db.connection import Database, db as default_db

SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS blobs (
    blake3 TEXT PRIMARY KEY,
    sha256 TEXT NOT NULL,
    byte_size BIGINT NOT NULL,
    media_type TEXT NOT NULL,
    storage_key TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS uploads (
    id TEXT PRIMARY KEY,
    application_id TEXT NOT NULL,
    blake3 TEXT NOT NULL,
    doc_slot TEXT,
    idempotency_key TEXT UNIQUE,
    created_at TEXT NOT NULL,
    FOREIGN KEY (blake3) REFERENCES blobs(blake3)
);

CREATE INDEX IF NOT EXISTS idx_uploads_app_id ON uploads(application_id);
CREATE INDEX IF NOT EXISTS idx_uploads_blake3 ON uploads(blake3);
"""


def init_db(database: Database | None = None) -> None:
    """Initialize schema tables and indexes if they do not exist."""
    d = database or default_db
    with d.connection() as conn:
        if d.is_postgres:
            with conn.cursor() as cur:
                cur.execute(SCHEMA_SQL)
            conn.commit()
        else:
            conn.executescript(SCHEMA_SQL)
            conn.commit()


def get_upload_by_idempotency_key(
    conn: Any,
    idempotency_key: str,
    database: Database | None = None,
) -> dict | None:
    """Lookup an upload by unique idempotency key, joining blob metadata."""
    d = database or default_db
    sql = d.adapt_sql("""
        SELECT u.id, u.application_id, u.blake3, u.doc_slot, u.idempotency_key, u.created_at,
               b.sha256, b.byte_size, b.media_type, b.storage_key
        FROM uploads u
        JOIN blobs b ON u.blake3 = b.blake3
        WHERE u.idempotency_key = ?;
    """)
    if d.is_postgres:
        with conn.cursor() as cur:
            cur.execute(sql, (idempotency_key,))
            row = cur.fetchone()
            if not row:
                return None
            desc = [col.name for col in cur.description]
            return dict(zip(desc, row))
    else:
        cur = conn.execute(sql, (idempotency_key,))
        row = cur.fetchone()
        return dict(row) if row else None


def get_upload_by_id(
    conn: Any,
    upload_id: str,
    database: Database | None = None,
) -> dict | None:
    """Lookup an upload by document ID, joining blob metadata."""
    d = database or default_db
    sql = d.adapt_sql("""
        SELECT u.id, u.application_id, u.blake3, u.doc_slot, u.idempotency_key, u.created_at,
               b.sha256, b.byte_size, b.media_type, b.storage_key
        FROM uploads u
        JOIN blobs b ON u.blake3 = b.blake3
        WHERE u.id = ?;
    """)
    if d.is_postgres:
        with conn.cursor() as cur:
            cur.execute(sql, (upload_id,))
            row = cur.fetchone()
            if not row:
                return None
            desc = [col.name for col in cur.description]
            return dict(zip(desc, row))
    else:
        cur = conn.execute(sql, (upload_id,))
        row = cur.fetchone()
        return dict(row) if row else None


def count_uploads_for_blob(
    conn: Any,
    blake3: str,
    database: Database | None = None,
) -> int:
    """Count how many uploads reference the specified BLAKE3 digest."""
    d = database or default_db
    sql = d.adapt_sql("SELECT COUNT(*) FROM uploads WHERE blake3 = ?;")
    if d.is_postgres:
        with conn.cursor() as cur:
            cur.execute(sql, (blake3,))
            row = cur.fetchone()
            return row[0] if row else 0
    else:
        cur = conn.execute(sql, (blake3,))
        row = cur.fetchone()
        return row[0] if row else 0


def insert_blob(
    conn: Any,
    blake3: str,
    sha256: str,
    byte_size: int,
    media_type: str,
    storage_key: str,
    created_at: str,
    database: Database | None = None,
) -> None:
    """Insert blob record with idempotent ON CONFLICT DO NOTHING semantics."""
    d = database or default_db
    sql = d.adapt_sql("""
        INSERT INTO blobs (blake3, sha256, byte_size, media_type, storage_key, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT (blake3) DO NOTHING;
    """)
    params = (blake3, sha256, byte_size, media_type, storage_key, created_at)
    if d.is_postgres:
        with conn.cursor() as cur:
            cur.execute(sql, params)
    else:
        conn.execute(sql, params)


def insert_upload(
    conn: Any,
    id: str,
    application_id: str,
    blake3: str,
    doc_slot: str | None,
    idempotency_key: str | None,
    created_at: str,
    database: Database | None = None,
) -> None:
    """Insert upload record linked to blob."""
    d = database or default_db
    sql = d.adapt_sql("""
        INSERT INTO uploads (id, application_id, blake3, doc_slot, idempotency_key, created_at)
        VALUES (?, ?, ?, ?, ?, ?);
    """)
    params = (id, application_id, blake3, doc_slot, idempotency_key, created_at)
    if d.is_postgres:
        with conn.cursor() as cur:
            cur.execute(sql, params)
    else:
        conn.execute(sql, params)
