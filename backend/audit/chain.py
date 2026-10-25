"""
Audit Trail Module (Guide §15.1, S13).

Implements tamper-evident cryptographic hash chain with signed Ed25519 checkpoints.
Strictly sequential: no forks, fail-visible verification, and canonical serialization.
"""

from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
from typing import Any
import uuid

from cryptography.hazmat.primitives.asymmetric import ed25519
from cryptography.hazmat.primitives import serialization

from backend.db.connection import Database, db as default_db
from backend.db.repository import (
    insert_audit_event,
    get_last_audit_event,
    get_all_audit_events_in_order,
    insert_checkpoint,
    get_checkpoints,
)

GENESIS = "0" * 64

# Demo Ed25519 Keys directory
KEYS_DIR = Path(__file__).resolve().parents[2] / "keys"
PUBKEYS_DIR = KEYS_DIR / "trusted_pubkeys"

# Persistent demo Ed25519 key for demo environment
_DEMO_KEY_ID = "aicte-ed25519-2026-demo"
_demo_private_key: ed25519.Ed25519PrivateKey | None = None


def get_demo_signing_keys() -> tuple[ed25519.Ed25519PrivateKey, bytes]:
    """Retrieve or initialize standard demo Ed25519 keypair for checkpoints."""
    global _demo_private_key
    PUBKEYS_DIR.mkdir(parents=True, exist_ok=True)
    pub_file = PUBKEYS_DIR / f"{_DEMO_KEY_ID}.pub"

    if _demo_private_key is None:
        _demo_private_key = ed25519.Ed25519PrivateKey.generate()
        pub_bytes = _demo_private_key.public_key().public_bytes(
            encoding=serialization.Encoding.OpenSSH,
            format=serialization.PublicFormat.OpenSSH,
        )
        pub_file.write_bytes(pub_bytes)

    pub_bytes = pub_file.read_bytes()
    return _demo_private_key, pub_bytes


def canon(obj: Any) -> str:
    """Canonical deterministic JSON serialization with sorted keys and tight separators."""
    return json.dumps(obj, sort_keys=True, separators=(",", ":"), ensure_ascii=True)


def sha256_hex(data: str | bytes) -> str:
    """Compute SHA-256 hex digest of string or bytes."""
    if isinstance(data, str):
        data = data.encode("utf-8")
    return hashlib.sha256(data).hexdigest()


def audit(
    conn: Any,
    actor: str,
    action: str,
    subject: str,
    details: dict[str, Any],
    database: Database | None = None,
) -> dict[str, Any]:
    """
    Append an immutable event to the hash chain inside the caller's transaction (Guide §15.1).
    Must be called LAST before commit to minimize lock duration.
    """
    d = database or default_db

    # Advisory lock on PostgreSQL for single writer serialization
    if d.is_postgres:
        with conn.cursor() as cur:
            cur.execute("SET LOCAL lock_timeout = '3s';")
            cur.execute("SELECT pg_advisory_xact_lock(424242);")

    # Fetch previous entry hash
    last_event = get_last_audit_event(conn, database=d)
    prev_hash = last_event["entry_hash"] if last_event else GENESIS

    ts = datetime.now(timezone.utc).isoformat()
    canonical_dict = {
        "ts": ts,
        "actor": actor,
        "action": action,
        "subject": subject,
        "details": details,
        "prev": prev_hash,
    }
    canonical_str = canon(canonical_dict)
    entry_hash = sha256_hex(canonical_str)

    details_json = canon(details)

    row_id = insert_audit_event(
        conn=conn,
        ts=ts,
        actor=actor,
        action=action,
        subject=subject,
        details_json=details_json,
        canonical=canonical_str,
        prev_hash=prev_hash,
        entry_hash=entry_hash,
        database=d,
    )

    return {
        "id": row_id,
        "ts": ts,
        "actor": actor,
        "action": action,
        "subject": subject,
        "details": details,
        "prev_hash": prev_hash,
        "entry_hash": entry_hash,
    }


def verify_chain(
    conn: Any,
    database: Database | None = None,
) -> dict[str, Any]:
    """
    Verify tamper-evidence of entire audit trail hash chain (Guide §15.1).
    Walks sequentially from genesis to head and verifies all links and content.
    """
    d = database or default_db
    rows = get_all_audit_events_in_order(conn, database=d)

    prev = GENESIS
    for r in rows:
        id_ = r["id"]
        ts_str = r["ts"]
        actor = r["actor"]
        action = r["action"]
        subject = r["subject"]
        raw_details = r["details"]
        canonical = r["canonical"]
        p = r["prev_hash"]
        h = r["entry_hash"]

        try:
            c = json.loads(canonical)
        except Exception:
            return {"ok": False, "first_bad_id": id_, "reason": "Malformed canonical JSON", "count": len(rows), "head": prev}

        # Check required schema keys
        if set(c.keys()) != {"ts", "actor", "action", "subject", "details", "prev"}:
            return {"ok": False, "first_bad_id": id_, "reason": "Canonical schema key mismatch", "count": len(rows), "head": prev}

        # Check hash linkage
        if p != prev or c.get("prev") != prev:
            return {"ok": False, "first_bad_id": id_, "reason": "Broken prev_hash link", "count": len(rows), "head": prev}

        # Check entry hash calculation
        if sha256_hex(canonical) != h:
            return {"ok": False, "first_bad_id": id_, "reason": "Invalid entry_hash checksum", "count": len(rows), "head": prev}

        # Check standalone columns match canonical payload (P1-7)
        if c.get("actor") != actor or c.get("action") != action or c.get("subject") != subject or c.get("ts") != ts_str:
            return {"ok": False, "first_bad_id": id_, "reason": "Column data differs from canonical record", "count": len(rows), "head": prev}

        # Check details match canonical details
        det_parsed = json.loads(raw_details) if isinstance(raw_details, str) else raw_details
        if canon(c.get("details")) != canon(det_parsed):
            return {"ok": False, "first_bad_id": id_, "reason": "Details payload differs from canonical record", "count": len(rows), "head": prev}

        prev = h

    return {"ok": True, "head": prev, "count": len(rows)}


def create_checkpoint(
    upto_id: int,
    head_hash: str,
    key_id: str = _DEMO_KEY_ID,
    private_key: ed25519.Ed25519PrivateKey | None = None,
    database: Database | None = None,
) -> dict[str, Any]:
    """
    Create and cryptographically sign an external checkpoint for (upto_id, head_hash) (Guide §15.1).
    """
    d = database or default_db
    priv, _ = get_demo_signing_keys()
    signer = private_key or priv

    message = f"{upto_id}:{head_hash}".encode("utf-8")
    signature_bytes = signer.sign(message)
    signature_hex = signature_bytes.hex()

    checkpoint_id = f"chk-{upto_id}-{uuid.uuid4().hex[:8]}"
    now_iso = datetime.now(timezone.utc).isoformat()

    with d.transaction() as conn:
        insert_checkpoint(
            conn=conn,
            checkpoint_id=checkpoint_id,
            upto_id=upto_id,
            head_hash=head_hash,
            signature=signature_hex,
            key_id=key_id,
            created_at=now_iso,
            database=d,
        )

    return {
        "id": checkpoint_id,
        "upto_id": upto_id,
        "head_hash": head_hash,
        "signature": signature_hex,
        "key_id": key_id,
        "created_at": now_iso,
    }


def verify_checkpoint(
    checkpoint: dict[str, Any],
    public_key: ed25519.Ed25519PublicKey | None = None,
) -> dict[str, Any]:
    """
    Verify Ed25519 cryptographic signature of a checkpoint against trusted public key (Guide §15.1).
    """
    upto_id = checkpoint["upto_id"]
    head_hash = checkpoint["head_hash"]
    sig_hex = checkpoint["signature"]
    message = f"{upto_id}:{head_hash}".encode("utf-8")

    if public_key is None:
        priv, _ = get_demo_signing_keys()
        pub = priv.public_key()
    else:
        pub = public_key

    try:
        sig_bytes = bytes.fromhex(sig_hex)
        pub.verify(sig_bytes, message)
        return {"valid": True, "reason": "Cryptographic signature matches trusted key"}
    except Exception as e:
        return {"valid": False, "reason": f"Signature verification failed: {e}"}
