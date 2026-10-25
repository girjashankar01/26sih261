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

CREATE TABLE IF NOT EXISTS extractions (
    id TEXT PRIMARY KEY,
    application_id TEXT NOT NULL,
    document_id TEXT NOT NULL,
    blake3 TEXT NOT NULL,
    pipeline_version TEXT NOT NULL,
    config_hash TEXT NOT NULL,
    payload_storage_key TEXT NOT NULL,
    status TEXT NOT NULL,
    quality_score REAL,
    created_at TEXT NOT NULL,
    UNIQUE(blake3, pipeline_version, config_hash)
);

CREATE INDEX IF NOT EXISTS idx_uploads_app_id ON uploads(application_id);
CREATE INDEX IF NOT EXISTS idx_uploads_blake3 ON uploads(blake3);
CREATE INDEX IF NOT EXISTS idx_extractions_app_doc ON extractions(application_id, document_id);
CREATE INDEX IF NOT EXISTS idx_extractions_lookup ON extractions(blake3, pipeline_version, config_hash);

CREATE TABLE IF NOT EXISTS document_types (
    id TEXT PRIMARY KEY,
    application_id TEXT NOT NULL,
    document_id TEXT NOT NULL,
    blake3 TEXT NOT NULL,
    doc_slot TEXT,
    doc_type TEXT NOT NULL,
    confidence REAL NOT NULL,
    is_classified BOOLEAN NOT NULL,
    decision_reason TEXT NOT NULL,
    evidence_json TEXT NOT NULL,
    candidate_scores_json TEXT NOT NULL,
    flags_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE(document_id)
);

CREATE INDEX IF NOT EXISTS idx_document_types_app_doc ON document_types(application_id, document_id);
CREATE INDEX IF NOT EXISTS idx_document_types_type ON document_types(doc_type);

CREATE TABLE IF NOT EXISTS facts (
    id TEXT PRIMARY KEY,
    application_id TEXT NOT NULL,
    document_id TEXT,
    source TEXT NOT NULL,
    entity TEXT NOT NULL,
    key TEXT NOT NULL,
    raw TEXT,
    value_type TEXT NOT NULL,
    value TEXT,
    parse_state TEXT NOT NULL,
    conf REAL NOT NULL,
    conf_kind TEXT NOT NULL,
    grounded BOOLEAN NOT NULL,
    source_ref TEXT,
    page INTEGER,
    bbox_norm_json TEXT,
    bbox_precision TEXT,
    extractor TEXT NOT NULL,
    extractor_version TEXT NOT NULL,
    needs_confirmation BOOLEAN NOT NULL,
    simulated BOOLEAN NOT NULL,
    created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_facts_app_entity ON facts(application_id, entity, key);
CREATE INDEX IF NOT EXISTS idx_facts_app_doc ON facts(application_id, document_id);

CREATE TABLE IF NOT EXISTS verifications (
    id TEXT PRIMARY KEY,
    application_id TEXT NOT NULL,
    document_id TEXT NOT NULL,
    adapter TEXT NOT NULL,
    source TEXT NOT NULL,
    status TEXT NOT NULL,
    request_digest TEXT NOT NULL,
    response_digest TEXT NOT NULL,
    simulated BOOLEAN NOT NULL,
    checked_at TEXT NOT NULL,
    integrity_json TEXT,
    trust_json TEXT,
    compared_json TEXT,
    reason TEXT NOT NULL,
    raw_response_json TEXT,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS verification_attempts (
    id TEXT PRIMARY KEY,
    adapter TEXT NOT NULL,
    request_digest TEXT NOT NULL,
    outcome TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_verifications_doc ON verifications(application_id, document_id);
CREATE INDEX IF NOT EXISTS idx_verifications_digest ON verifications(request_digest);
CREATE INDEX IF NOT EXISTS idx_verif_attempts ON verification_attempts(adapter, request_digest, created_at);

CREATE TABLE IF NOT EXISTS infra_evidence (
    id TEXT PRIMARY KEY,
    application_id TEXT NOT NULL,
    item_key TEXT NOT NULL,
    file_id TEXT NOT NULL,
    phash TEXT,
    latitude REAL,
    longitude REAL,
    capture_time TEXT,
    created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_infra_ev_app ON infra_evidence(application_id, item_key);
CREATE INDEX IF NOT EXISTS idx_infra_phash ON infra_evidence(phash);

CREATE TABLE IF NOT EXISTS alerts (
    id TEXT PRIMARY KEY,
    application_id TEXT NOT NULL,
    category TEXT NOT NULL,
    severity TEXT NOT NULL,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_alerts_app ON alerts(application_id);

CREATE TABLE IF NOT EXISTS audit_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts TEXT NOT NULL,
    actor TEXT NOT NULL,
    action TEXT NOT NULL,
    subject TEXT NOT NULL,
    details TEXT NOT NULL,
    canonical TEXT NOT NULL,
    prev_hash TEXT NOT NULL,
    entry_hash TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_subject ON audit_events(subject);
CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_events(action);
CREATE INDEX IF NOT EXISTS idx_audit_actor ON audit_events(actor);

CREATE TABLE IF NOT EXISTS audit_checkpoints (
    id TEXT PRIMARY KEY,
    upto_id INTEGER NOT NULL,
    head_hash TEXT NOT NULL,
    signature TEXT NOT NULL,
    key_id TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_checkpoints_upto ON audit_checkpoints(upto_id);

CREATE TABLE IF NOT EXISTS finding_actions (
    id TEXT PRIMARY KEY,
    application_id TEXT NOT NULL,
    finding_id TEXT NOT NULL,
    action TEXT NOT NULL,
    previous_state TEXT NOT NULL,
    new_state TEXT NOT NULL,
    actor TEXT NOT NULL,
    reason TEXT NOT NULL,
    notes TEXT,
    created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_finding_actions_app ON finding_actions(application_id, finding_id);
"""


def init_db(database: Database | None = None) -> None:
    """Initialize schema tables and indexes if they do not exist."""
    d = database or default_db
    with d.connection() as conn:
        if d.is_postgres:
            pg_sql = SCHEMA_SQL.replace("INTEGER PRIMARY KEY AUTOINCREMENT", "BIGSERIAL PRIMARY KEY")
            with conn.cursor() as cur:
                cur.execute(pg_sql)
            conn.commit()
        else:
            conn.executescript(SCHEMA_SQL)
            conn.commit()


def get_upload_by_idempotency_key(
    conn: Any,
    idempotency_key: str,
    database: Database | None = None,
) -> dict | None:
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


def get_uploads_by_application(
    conn: Any,
    application_id: str,
    database: Database | None = None,
) -> list[dict]:
    d = database or default_db
    sql = d.adapt_sql("""
        SELECT u.id, u.application_id, u.blake3, u.doc_slot, u.idempotency_key, u.created_at,
               b.sha256, b.byte_size, b.media_type, b.storage_key
        FROM uploads u
        JOIN blobs b ON u.blake3 = b.blake3
        WHERE u.application_id = ?
        ORDER BY u.created_at ASC;
    """)
    params = (application_id,)
    if d.is_postgres:
        with conn.cursor() as cur:
            cur.execute(sql, params)
            rows = cur.fetchall()
            desc = [col.name for col in cur.description]
            return [dict(zip(desc, r)) for r in rows]
    else:
        cur = conn.execute(sql, params)
        rows = cur.fetchall()
        return [dict(r) for r in rows]


def count_uploads_for_blob(
    conn: Any,
    blake3: str,
    database: Database | None = None,
) -> int:
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
    created_at: str | None = None,
    database: Database | None = None,
) -> None:
    d = database or default_db
    blob_created_at = created_at or datetime.now(timezone.utc).isoformat()
    sql = d.adapt_sql("""
        INSERT INTO blobs (blake3, sha256, byte_size, media_type, storage_key, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT (blake3) DO NOTHING;
    """)
    params = (blake3, sha256, byte_size, media_type, storage_key, blob_created_at)
    if d.is_postgres:
        with conn.cursor() as cur:
            cur.execute(sql, params)
    else:
        conn.execute(sql, params)


def insert_upload(
    conn: Any,
    upload_id: str | None = None,
    application_id: str = "",
    blake3: str = "",
    doc_slot: str | None = None,
    idempotency_key: str | None = None,
    created_at: str | None = None,
    id: str | None = None,
    database: Database | None = None,
) -> None:
    target_id = id or upload_id
    if not target_id:
        raise ValueError("upload_id or id is required")
    d = database or default_db
    upload_created_at = created_at or datetime.now(timezone.utc).isoformat()
    sql = d.adapt_sql("""
        INSERT INTO uploads (id, application_id, blake3, doc_slot, idempotency_key, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT (id) DO NOTHING;
    """)
    params = (target_id, application_id, blake3, doc_slot, idempotency_key, upload_created_at)
    if d.is_postgres:
        with conn.cursor() as cur:
            cur.execute(sql, params)
    else:
        conn.execute(sql, params)


def get_extraction_by_cache_key(
    conn: Any,
    blake3: str,
    pipeline_version: str,
    config_hash: str,
    database: Database | None = None,
) -> dict | None:
    d = database or default_db
    sql = d.adapt_sql("""
        SELECT id, application_id, document_id, blake3, pipeline_version, config_hash,
               payload_storage_key, status, quality_score, created_at
        FROM extractions
        WHERE blake3 = ? AND pipeline_version = ? AND config_hash = ?;
    """)
    params = (blake3, pipeline_version, config_hash)
    if d.is_postgres:
        with conn.cursor() as cur:
            cur.execute(sql, params)
            row = cur.fetchone()
            if not row:
                return None
            desc = [col.name for col in cur.description]
            return dict(zip(desc, row))
    else:
        cur = conn.execute(sql, params)
        row = cur.fetchone()
        return dict(row) if row else None


def insert_extraction(
    conn: Any,
    extraction_id: str | None = None,
    application_id: str = "",
    document_id: str = "",
    blake3: str = "",
    pipeline_version: str = "",
    config_hash: str = "",
    payload_storage_key: str = "",
    status: str = "",
    quality_score: float | None = None,
    created_at: str | None = None,
    id: str | None = None,
    database: Database | None = None,
) -> None:
    target_id = id or extraction_id
    if not target_id:
        raise ValueError("extraction_id or id is required")
    d = database or default_db
    now_iso = created_at or datetime.now(timezone.utc).isoformat()
    sql = d.adapt_sql("""
        INSERT INTO extractions (
            id, application_id, document_id, blake3, pipeline_version,
            config_hash, payload_storage_key, status, quality_score, created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT (blake3, pipeline_version, config_hash) DO NOTHING;
    """)
    params = (
        target_id, application_id, document_id, blake3, pipeline_version,
        config_hash, payload_storage_key, status, quality_score, now_iso
    )
    if d.is_postgres:
        with conn.cursor() as cur:
            cur.execute(sql, params)
    else:
        conn.execute(sql, params)


def get_extraction_by_doc(
    conn: Any,
    application_id: str,
    document_id: str,
    database: Database | None = None,
) -> dict | None:
    d = database or default_db
    sql = d.adapt_sql("""
        SELECT id, application_id, document_id, blake3, pipeline_version, config_hash,
               payload_storage_key, status, quality_score, created_at
        FROM extractions
        WHERE application_id = ? AND document_id = ?
        ORDER BY created_at DESC
        LIMIT 1;
    """)
    params = (application_id, document_id)
    if d.is_postgres:
        with conn.cursor() as cur:
            cur.execute(sql, params)
            row = cur.fetchone()
            if not row:
                return None
            desc = [col.name for col in cur.description]
            return dict(zip(desc, row))
    else:
        cur = conn.execute(sql, params)
        row = cur.fetchone()
        return dict(row) if row else None


def get_document_type(
    conn: Any,
    application_id_or_doc_id: str,
    document_id: str | None = None,
    database: Database | None = None,
) -> dict | None:
    d = database or default_db
    if document_id is not None:
        sql = d.adapt_sql("""
            SELECT id, application_id, document_id, blake3, doc_slot, doc_type,
                   confidence, is_classified, decision_reason, evidence_json,
                   candidate_scores_json, flags_json, created_at
            FROM document_types
            WHERE application_id = ? AND document_id = ?;
        """)
        params = (application_id_or_doc_id, document_id)
    else:
        sql = d.adapt_sql("""
            SELECT id, application_id, document_id, blake3, doc_slot, doc_type,
                   confidence, is_classified, decision_reason, evidence_json,
                   candidate_scores_json, flags_json, created_at
            FROM document_types
            WHERE document_id = ?;
        """)
        params = (application_id_or_doc_id,)
    if d.is_postgres:
        with conn.cursor() as cur:
            cur.execute(sql, params)
            row = cur.fetchone()
            if not row:
                return None
            desc = [col.name for col in cur.description]
            return dict(zip(desc, row))
    else:
        cur = conn.execute(sql, params)
        row = cur.fetchone()
        return dict(row) if row else None


def insert_document_type(
    conn: Any,
    record: dict[str, Any] | None = None,
    database: Database | None = None,
    **kwargs: Any,
) -> None:
    d = database or default_db
    rec = dict(record) if record else dict(kwargs)
    if "database" in rec:
        d = rec.pop("database") or d
    sql = d.adapt_sql("""
        INSERT INTO document_types (
            id, application_id, document_id, blake3, doc_slot, doc_type,
            confidence, is_classified, decision_reason, evidence_json,
            candidate_scores_json, flags_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT (document_id) DO UPDATE SET
            doc_type = excluded.doc_type,
            confidence = excluded.confidence,
            is_classified = excluded.is_classified,
            decision_reason = excluded.decision_reason,
            evidence_json = excluded.evidence_json,
            candidate_scores_json = excluded.candidate_scores_json,
            flags_json = excluded.flags_json;
    """)
    params = (
        rec["id"], rec["application_id"], rec["document_id"], rec["blake3"],
        rec.get("doc_slot"), rec["doc_type"], rec["confidence"],
        rec["is_classified"], rec["decision_reason"], rec["evidence_json"],
        rec["candidate_scores_json"], rec["flags_json"], rec["created_at"]
    )
    if d.is_postgres:
        with conn.cursor() as cur:
            cur.execute(sql, params)
    else:
        conn.execute(sql, params)


def get_facts_by_application(
    conn: Any,
    application_id: str,
    database: Database | None = None,
) -> list[dict]:
    d = database or default_db
    sql = d.adapt_sql("""
        SELECT id, application_id, document_id, source, entity, key, raw,
               value_type, value, parse_state, conf, conf_kind, grounded,
               source_ref, page, bbox_norm_json, bbox_precision, extractor,
               extractor_version, needs_confirmation, simulated, created_at
        FROM facts
        WHERE application_id = ?
        ORDER BY entity ASC, key ASC;
    """)
    params = (application_id,)
    if d.is_postgres:
        with conn.cursor() as cur:
            cur.execute(sql, params)
            rows = cur.fetchall()
            desc = [col.name for col in cur.description]
            return [dict(zip(desc, r)) for r in rows]
    else:
        cur = conn.execute(sql, params)
        rows = cur.fetchall()
        return [dict(r) for r in rows]


def get_facts_by_doc(
    conn: Any,
    application_id: str,
    document_id: str,
    database: Database | None = None,
) -> list[dict]:
    d = database or default_db
    sql = d.adapt_sql("""
        SELECT id, application_id, document_id, source, entity, key, raw,
               value_type, value, parse_state, conf, conf_kind, grounded,
               source_ref, page, bbox_norm_json, bbox_precision, extractor,
               extractor_version, needs_confirmation, simulated, created_at
        FROM facts
        WHERE application_id = ? AND document_id = ?
        ORDER BY page ASC, key ASC;
    """)
    params = (application_id, document_id)
    if d.is_postgres:
        with conn.cursor() as cur:
            cur.execute(sql, params)
            rows = cur.fetchall()
            desc = [col.name for col in cur.description]
            return [dict(zip(desc, r)) for r in rows]
    else:
        cur = conn.execute(sql, params)
        rows = cur.fetchall()
        return [dict(r) for r in rows]


def insert_facts_batch(
    conn: Any,
    facts_list: list[dict[str, Any]],
    database: Database | None = None,
) -> None:
    d = database or default_db
    sql = d.adapt_sql("""
        INSERT INTO facts (
            id, application_id, document_id, source, entity, key, raw,
            value_type, value, parse_state, conf, conf_kind, grounded,
            source_ref, page, bbox_norm_json, bbox_precision, extractor,
            extractor_version, needs_confirmation, simulated, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT (id) DO NOTHING;
    """)
    for f in facts_list:
        params = (
            f["id"], f["application_id"], f.get("document_id"), f["source"],
            f["entity"], f["key"], f.get("raw"), f["value_type"],
            f.get("value"), f.get("parse_state", "ok"), f["conf"],
            f["conf_kind"], f["grounded"], f.get("source_ref"),
            f.get("page"), f.get("bbox_norm_json"), f.get("bbox_precision"),
            f["extractor"], f.get("extractor_version", "1.0.0"),
            f.get("needs_confirmation", False), f.get("simulated", True),
            f.get("created_at", datetime.now(timezone.utc).isoformat())
        )
        if d.is_postgres:
            with conn.cursor() as cur:
                cur.execute(sql, params)
        else:
            conn.execute(sql, params)


def insert_verification(
    conn: Any,
    rec: dict[str, Any],
    database: Database | None = None,
) -> None:
    d = database or default_db
    sql = d.adapt_sql("""
        INSERT INTO verifications (
            id, application_id, document_id, adapter, source, status,
            request_digest, response_digest, simulated, checked_at,
            integrity_json, trust_json, compared_json, reason, raw_response_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT (id) DO UPDATE SET
            status = excluded.status,
            request_digest = excluded.request_digest,
            response_digest = excluded.response_digest,
            checked_at = excluded.checked_at,
            integrity_json = excluded.integrity_json,
            trust_json = excluded.trust_json,
            compared_json = excluded.compared_json,
            reason = excluded.reason,
            raw_response_json = excluded.raw_response_json;
    """)
    params = (
        rec["id"], rec["application_id"], rec["document_id"], rec["adapter"],
        rec["source"], rec["status"], rec["request_digest"], rec["response_digest"],
        rec["simulated"], rec["checked_at"], rec.get("integrity_json"),
        rec.get("trust_json"), rec.get("compared_json"), rec["reason"],
        rec.get("raw_response_json"), rec.get("created_at", datetime.now(timezone.utc).isoformat())
    )
    if d.is_postgres:
        with conn.cursor() as cur:
            cur.execute(sql, params)
    else:
        conn.execute(sql, params)


def get_verifications_by_doc(
    conn: Any,
    application_id: str,
    document_id: str,
    database: Database | None = None,
) -> list[dict]:
    d = database or default_db
    sql = d.adapt_sql("""
        SELECT id, application_id, document_id, adapter, source, status,
               request_digest, response_digest, simulated, checked_at,
               integrity_json, trust_json, compared_json, reason, raw_response_json, created_at
        FROM verifications
        WHERE application_id = ? AND document_id = ?
        ORDER BY checked_at DESC;
    """)
    params = (application_id, document_id)
    if d.is_postgres:
        with conn.cursor() as cur:
            cur.execute(sql, params)
            rows = cur.fetchall()
            desc = [col.name for col in cur.description]
            return [dict(zip(desc, r)) for r in rows]
    else:
        cur = conn.execute(sql, params)
        rows = cur.fetchall()
        return [dict(r) for r in rows]


def get_verifications_by_application(
    conn: Any,
    application_id: str,
    database: Database | None = None,
) -> list[dict]:
    d = database or default_db
    sql = d.adapt_sql("""
        SELECT id, application_id, document_id, adapter, source, status,
               request_digest, response_digest, simulated, checked_at,
               integrity_json, trust_json, compared_json, reason, raw_response_json, created_at
        FROM verifications
        WHERE application_id = ?
        ORDER BY checked_at ASC;
    """)
    params = (application_id,)
    if d.is_postgres:
        with conn.cursor() as cur:
            cur.execute(sql, params)
            rows = cur.fetchall()
            desc = [col.name for col in cur.description]
            return [dict(zip(desc, r)) for r in rows]
    else:
        cur = conn.execute(sql, params)
        rows = cur.fetchall()
        return [dict(r) for r in rows]


def insert_infra_evidence(
    conn: Any,
    rec: dict[str, Any],
    database: Database | None = None,
) -> None:
    d = database or default_db
    sql = d.adapt_sql("""
        INSERT INTO infra_evidence (
            id, application_id, item_key, file_id, phash,
            latitude, longitude, capture_time, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT (id) DO UPDATE SET
            phash = excluded.phash,
            latitude = excluded.latitude,
            longitude = excluded.longitude,
            capture_time = excluded.capture_time;
    """)
    params = (
        rec["id"], rec["application_id"], rec["item_key"], rec["file_id"],
        rec.get("phash"), rec.get("latitude"), rec.get("longitude"),
        rec.get("capture_time"), rec.get("created_at", datetime.now(timezone.utc).isoformat())
    )
    if d.is_postgres:
        with conn.cursor() as cur:
            cur.execute(sql, params)
    else:
        conn.execute(sql, params)


def get_infra_evidence_by_app(
    conn: Any,
    application_id: str,
    database: Database | None = None,
) -> list[dict]:
    d = database or default_db
    sql = d.adapt_sql("""
        SELECT id, application_id, item_key, file_id, phash,
               latitude, longitude, capture_time, created_at
        FROM infra_evidence
        WHERE application_id = ?
        ORDER BY item_key ASC, created_at ASC;
    """)
    params = (application_id,)
    if d.is_postgres:
        with conn.cursor() as cur:
            cur.execute(sql, params)
            rows = cur.fetchall()
            desc = [col.name for col in cur.description]
            return [dict(zip(desc, r)) for r in rows]
    else:
        cur = conn.execute(sql, params)
        rows = cur.fetchall()
        return [dict(r) for r in rows]


def get_all_infra_evidence(
    conn: Any,
    database: Database | None = None,
) -> list[dict]:
    d = database or default_db
    sql = d.adapt_sql("""
        SELECT id, application_id, item_key, file_id, phash,
               latitude, longitude, capture_time, created_at
        FROM infra_evidence
        WHERE phash IS NOT NULL;
    """)
    if d.is_postgres:
        with conn.cursor() as cur:
            cur.execute(sql)
            rows = cur.fetchall()
            desc = [col.name for col in cur.description]
            return [dict(zip(desc, r)) for r in rows]
    else:
        cur = conn.execute(sql)
        rows = cur.fetchall()
        return [dict(r) for r in rows]


def insert_alert(
    conn: Any,
    alert_id: str,
    application_id: str,
    category: str,
    severity: str,
    title: str,
    message: str,
    created_at: str | None = None,
    database: Database | None = None,
) -> None:
    d = database or default_db
    now_iso = created_at or datetime.now(timezone.utc).isoformat()
    sql = d.adapt_sql("""
        INSERT INTO alerts (id, application_id, category, severity, title, message, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT (id) DO UPDATE SET
            severity = excluded.severity,
            title = excluded.title,
            message = excluded.message;
    """)
    params = (alert_id, application_id, category, severity, title, message, now_iso)
    if d.is_postgres:
        with conn.cursor() as cur:
            cur.execute(sql, params)
    else:
        conn.execute(sql, params)


def get_alerts_by_app(
    conn: Any,
    application_id: str,
    database: Database | None = None,
) -> list[dict]:
    d = database or default_db
    sql = d.adapt_sql("""
        SELECT id, application_id, category, severity, title, message, created_at
        FROM alerts
        WHERE application_id = ?
        ORDER BY created_at DESC;
    """)
    params = (application_id,)
    if d.is_postgres:
        with conn.cursor() as cur:
            cur.execute(sql, params)
            rows = cur.fetchall()
            desc = [col.name for col in cur.description]
            return [dict(zip(desc, r)) for r in rows]
    else:
        cur = conn.execute(sql, params)
        rows = cur.fetchall()
        return [dict(r) for r in rows]


def insert_audit_event(
    conn: Any,
    ts: str,
    actor: str,
    action: str,
    subject: str,
    details_json: str,
    canonical: str,
    prev_hash: str,
    entry_hash: str,
    database: Database | None = None,
) -> int:
    d = database or default_db
    if d.is_postgres:
        sql = """
            INSERT INTO audit_events (ts, actor, action, subject, details, canonical, prev_hash, entry_hash)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING id;
        """
        with conn.cursor() as cur:
            cur.execute(sql, (ts, actor, action, subject, details_json, canonical, prev_hash, entry_hash))
            row = cur.fetchone()
            return row[0] if row else 0
    else:
        sql = """
            INSERT INTO audit_events (ts, actor, action, subject, details, canonical, prev_hash, entry_hash)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?);
        """
        cur = conn.execute(sql, (ts, actor, action, subject, details_json, canonical, prev_hash, entry_hash))
        return cur.lastrowid


def get_last_audit_event(
    conn: Any,
    database: Database | None = None,
) -> dict | None:
    d = database or default_db
    sql = d.adapt_sql("""
        SELECT id, ts, actor, action, subject, details, canonical, prev_hash, entry_hash
        FROM audit_events
        ORDER BY id DESC
        LIMIT 1;
    """)
    if d.is_postgres:
        with conn.cursor() as cur:
            cur.execute(sql)
            row = cur.fetchone()
            if not row:
                return None
            desc = [col.name for col in cur.description]
            return dict(zip(desc, row))
    else:
        cur = conn.execute(sql)
        row = cur.fetchone()
        return dict(row) if row else None


def get_all_audit_events_in_order(
    conn: Any,
    database: Database | None = None,
) -> list[dict]:
    d = database or default_db
    sql = d.adapt_sql("""
        SELECT id, ts, actor, action, subject, details, canonical, prev_hash, entry_hash
        FROM audit_events
        ORDER BY id ASC;
    """)
    if d.is_postgres:
        with conn.cursor() as cur:
            cur.execute(sql)
            rows = cur.fetchall()
            desc = [col.name for col in cur.description]
            return [dict(zip(desc, r)) for r in rows]
    else:
        cur = conn.execute(sql)
        rows = cur.fetchall()
        return [dict(r) for r in rows]


def get_audit_events(
    conn: Any,
    limit: int = 100,
    subject: str | None = None,
    database: Database | None = None,
) -> list[dict]:
    d = database or default_db
    if subject:
        sql = d.adapt_sql("""
            SELECT id, ts, actor, action, subject, details, canonical, prev_hash, entry_hash
            FROM audit_events
            WHERE subject = ?
            ORDER BY id DESC
            LIMIT ?;
        """)
        params: tuple = (subject, limit)
    else:
        sql = d.adapt_sql("""
            SELECT id, ts, actor, action, subject, details, canonical, prev_hash, entry_hash
            FROM audit_events
            ORDER BY id DESC
            LIMIT ?;
        """)
        params = (limit,)

    if d.is_postgres:
        with conn.cursor() as cur:
            cur.execute(sql, params)
            rows = cur.fetchall()
            desc = [col.name for col in cur.description]
            return [dict(zip(desc, r)) for r in rows]
    else:
        cur = conn.execute(sql, params)
        rows = cur.fetchall()
        return [dict(r) for r in rows]


def insert_checkpoint(
    conn: Any,
    checkpoint_id: str,
    upto_id: int,
    head_hash: str,
    signature: str,
    key_id: str,
    created_at: str | None = None,
    database: Database | None = None,
) -> None:
    d = database or default_db
    now_iso = created_at or datetime.now(timezone.utc).isoformat()
    sql = d.adapt_sql("""
        INSERT INTO audit_checkpoints (id, upto_id, head_hash, signature, key_id, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT (id) DO NOTHING;
    """)
    params = (checkpoint_id, upto_id, head_hash, signature, key_id, now_iso)
    if d.is_postgres:
        with conn.cursor() as cur:
            cur.execute(sql, params)
    else:
        conn.execute(sql, params)


def get_checkpoints(
    conn: Any,
    limit: int = 50,
    database: Database | None = None,
) -> list[dict]:
    d = database or default_db
    sql = d.adapt_sql("""
        SELECT id, upto_id, head_hash, signature, key_id, created_at
        FROM audit_checkpoints
        ORDER BY upto_id DESC
        LIMIT ?;
    """)
    params = (limit,)
    if d.is_postgres:
        with conn.cursor() as cur:
            cur.execute(sql, params)
            rows = cur.fetchall()
            desc = [col.name for col in cur.description]
            return [dict(zip(desc, r)) for r in rows]
    else:
        cur = conn.execute(sql, params)
        rows = cur.fetchall()
        return [dict(r) for r in rows]


def insert_finding_action(
    conn: Any,
    rec: dict[str, Any],
    database: Database | None = None,
) -> None:
    d = database or default_db
    now_iso = rec.get("created_at") or datetime.now(timezone.utc).isoformat()
    sql = d.adapt_sql("""
        INSERT INTO finding_actions (
            id, application_id, finding_id, action, previous_state,
            new_state, actor, reason, notes, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT (id) DO UPDATE SET
            action = excluded.action,
            new_state = excluded.new_state,
            reason = excluded.reason,
            notes = excluded.notes;
    """)
    params = (
        rec["id"], rec["application_id"], rec["finding_id"], rec["action"],
        rec.get("previous_state", "open"), rec["new_state"], rec["actor"],
        rec["reason"], rec.get("notes"), now_iso
    )
    if d.is_postgres:
        with conn.cursor() as cur:
            cur.execute(sql, params)
    else:
        conn.execute(sql, params)


def get_finding_actions_by_app(
    conn: Any,
    application_id: str,
    database: Database | None = None,
) -> list[dict]:
    d = database or default_db
    sql = d.adapt_sql("""
        SELECT id, application_id, finding_id, action, previous_state,
               new_state, actor, reason, notes, created_at
        FROM finding_actions
        WHERE application_id = ?
        ORDER BY created_at ASC;
    """)
    params = (application_id,)
    if d.is_postgres:
        with conn.cursor() as cur:
            cur.execute(sql, params)
            rows = cur.fetchall()
            desc = [col.name for col in cur.description]
            return [dict(zip(desc, r)) for r in rows]
    else:
        cur = conn.execute(sql, params)
        rows = cur.fetchall()
        return [dict(r) for r in rows]


def get_finding_actions_by_finding(
    conn: Any,
    finding_id: str,
    database: Database | None = None,
) -> list[dict]:
    d = database or default_db
    sql = d.adapt_sql("""
        SELECT id, application_id, finding_id, action, previous_state,
               new_state, actor, reason, notes, created_at
        FROM finding_actions
        WHERE finding_id = ?
        ORDER BY created_at ASC;
    """)
    params = (finding_id,)
    if d.is_postgres:
        with conn.cursor() as cur:
            cur.execute(sql, params)
            rows = cur.fetchall()
            desc = [col.name for col in cur.description]
            return [dict(zip(desc, r)) for r in rows]
    else:
        cur = conn.execute(sql, params)
        rows = cur.fetchall()
        return [dict(r) for r in rows]
