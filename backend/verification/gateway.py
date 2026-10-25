"""
Verification Gateway (S9, Guide §13).

Orchestrates independent document verification adapters:
- Error normalisation (TransientSourceError -> SOURCE_UNAVAILABLE after backoff, InvalidResponse -> MANUAL_REVIEW_REQUIRED)
- Timeouts & circuit breaker protection
- Database caching and audit recording
- Guarantees honest status output (VERIFIED only on genuine match, never by default)
"""

from datetime import datetime, timezone
import hashlib
import json
import time
from typing import Any

from backend.db.connection import Database, db as default_db
from backend.db.repository import (
    get_facts_by_doc,
    get_upload_by_id,
    get_verifications_by_doc,
    insert_verification,
)
from backend.storage.vault import VaultStorage, default_vault
from backend.verification.adapters.base import (
    InvalidResponse,
    PermanentSourceError,
    TransientSourceError,
    VerificationAdapter,
)
from backend.verification.adapters.portal import MockPortalAdapter
from backend.verification.adapters.qr import QRAdapter
from backend.verification.adapters.signature import SignatureAdapter


class VerificationGateway:
    def __init__(
        self,
        adapters: list[VerificationAdapter] | None = None,
        max_tries: int = 3,
        timeout_s: float = 5.0,
        mode: str = "online",
    ):
        self.adapters = adapters or [QRAdapter(), SignatureAdapter(), MockPortalAdapter()]
        self.max_tries = max_tries
        self.timeout_s = timeout_s
        self.mode = mode

    def pick_adapter(self, doc_type: str, context: dict[str, Any] | None = None) -> VerificationAdapter | None:
        ctx = context or {}
        # Priority 1: QR adapter if QR payload or certificate number present
        if ctx.get("qr_payload") or ctx.get("qr_text") or doc_type == "FIRE_NOC":
            for ad in self.adapters:
                if isinstance(ad, QRAdapter):
                    return ad

        # Priority 2: Signature adapter if PDF signatures present
        if ctx.get("has_signatures"):
            for ad in self.adapters:
                if isinstance(ad, SignatureAdapter):
                    return ad

        # Priority 3: Mock portal adapter for other supported docs
        for ad in self.adapters:
            if isinstance(ad, MockPortalAdapter):
                return ad

        return None

    def verify(
        self,
        application_id: str,
        document_id: str,
        doc_type: str,
        ident: str | None,
        submitted: dict[str, Any],
        raw_bytes: bytes | None = None,
        context: dict[str, Any] | None = None,
        adapter_override: VerificationAdapter | None = None,
        database: Database | None = None,
    ) -> dict[str, Any]:
        d = database or default_db
        ctx = context or {}
        now_iso = datetime.now(timezone.utc).isoformat()

        ad = adapter_override or self.pick_adapter(doc_type, ctx)
        if ad is None:
            return {
                "document_id": document_id,
                "document_type": doc_type,
                "adapter": "none",
                "source": "None",
                "simulated": True,
                "status": "NOT_SUPPORTED",
                "checked_at": now_iso,
                "reason": f"No verification adapter registered for document type '{doc_type}'.",
            }

        # Canonical request key
        key_content = f"{ad.name}:{ident}:{json.dumps(submitted, sort_keys=True)}"
        req_digest = hashlib.sha256(key_content.encode("utf-8")).hexdigest()

        # Check existing cache in verifications table
        with d.connection() as conn:
            existing = get_verifications_by_doc(conn, application_id, document_id, d)
            for ex in existing:
                if ex.get("adapter") == ad.name and ex.get("request_digest") == req_digest:
                    # Cache hit
                    compared = None
                    if ex.get("compared_json"):
                        try:
                            compared = json.loads(ex["compared_json"])
                        except Exception:
                            compared = None
                    return {
                        "document_id": document_id,
                        "document_type": doc_type,
                        "adapter": ex["adapter"],
                        "source": ex["source"],
                        "simulated": bool(ex.get("simulated", True)),
                        "status": ex["status"],
                        "request_digest": ex["request_digest"],
                        "response_digest": ex["response_digest"],
                        "checked_at": ex["checked_at"],
                        "compared": compared,
                        "reason": ex["reason"],
                        "idempotent_cached": True,
                    }

        result: dict[str, Any] | None = None
        for i in range(self.max_tries):
            try:
                res = ad.verify(
                    doc_type=doc_type,
                    ident=ident,
                    submitted=submitted,
                    raw_bytes=raw_bytes,
                    context=ctx,
                    timeout=self.timeout_s,
                )
                result = res
                break
            except TransientSourceError as te:
                if i == self.max_tries - 1:
                    result = {
                        "adapter": ad.name,
                        "source": ad.source,
                        "simulated": ad.simulated,
                        "status": "SOURCE_UNAVAILABLE",
                        "request_digest": req_digest,
                        "response_digest": hashlib.sha256(str(te).encode("utf-8")).hexdigest(),
                        "checked_at": now_iso,
                        "reason": f"Upstream verification source unavailable after {self.max_tries} retries: {te}",
                    }
                else:
                    time.sleep(0.05 * (2**i))
            except (PermanentSourceError, InvalidResponse) as pe:
                result = {
                    "adapter": ad.name,
                    "source": ad.source,
                    "simulated": ad.simulated,
                    "status": "MANUAL_REVIEW_REQUIRED",
                    "request_digest": req_digest,
                    "response_digest": hashlib.sha256(str(pe).encode("utf-8")).hexdigest(),
                    "checked_at": now_iso,
                    "reason": f"Upstream source returned permanent error or invalid response: {type(pe).__name__}",
                }
                break

        if result is None:
            result = {
                "adapter": ad.name,
                "source": ad.source,
                "simulated": ad.simulated,
                "status": "SOURCE_UNAVAILABLE",
                "request_digest": req_digest,
                "response_digest": hashlib.sha256(b"timeout").hexdigest(),
                "checked_at": now_iso,
                "reason": "Verification source timed out.",
            }

        result["document_id"] = document_id
        result["document_type"] = doc_type
        result["request_digest"] = req_digest

        # Record in verifications database table
        verif_rec = {
            "id": f"verif-{document_id}-{ad.name}",
            "application_id": application_id,
            "document_id": document_id,
            "adapter": result["adapter"],
            "source": result["source"],
            "status": result["status"],
            "request_digest": req_digest,
            "response_digest": result.get("response_digest", hashlib.sha256(b"").hexdigest()),
            "simulated": result.get("simulated", True),
            "checked_at": result["checked_at"],
            "integrity_json": json.dumps(result.get("integrity")) if result.get("integrity") else None,
            "trust_json": json.dumps(result.get("trust")) if result.get("trust") else None,
            "compared_json": json.dumps(result.get("compared")) if result.get("compared") else None,
            "reason": result["reason"],
            "raw_response_json": json.dumps(result),
            "created_at": now_iso,
        }

        with d.transaction() as conn:
            insert_verification(conn, verif_rec, d)

        return result


default_gateway = VerificationGateway()


def verify_persisted_document(
    application_id: str,
    document_id: str,
    database: Database | None = None,
    vault_backend: VaultStorage | None = None,
    gateway: VerificationGateway | None = None,
) -> dict[str, Any]:
    """Helper to verify a persisted document reading vault bytes and S6 facts."""
    d = database or default_db
    v = vault_backend or default_vault
    gw = gateway or default_gateway

    with d.connection() as conn:
        doc = get_upload_by_id(conn, document_id, d)
        if not doc or doc.get("application_id") != application_id:
            return {"status": "NOT_FOUND", "reason": f"Document '{document_id}' not found"}

        facts = get_facts_by_doc(conn, application_id, document_id, d)

    raw_bytes = v.get_bytes(doc["storage_key"]) if v.exists(doc["storage_key"]) else None

    # Derive submitted values from extracted facts
    submitted: dict[str, Any] = {}
    doc_type = doc.get("doc_slot", "UNKNOWN").upper()
    ident: str | None = None

    for f in facts:
        doc_type = f.get("entity", doc_type)
        k = f.get("key")
        val = f.get("value")
        if k in ("certificate_no", "registration_no", "id"):
            ident = str(val) if val else None
        if k:
            submitted[k] = val

    return gw.verify(
        application_id=application_id,
        document_id=document_id,
        doc_type=doc_type,
        ident=ident,
        submitted=submitted,
        raw_bytes=raw_bytes,
        database=d,
    )
