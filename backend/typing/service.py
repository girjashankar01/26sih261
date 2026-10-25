"""
S5 Document Typing Service Orchestrator (Guide §11.1).

Connects storage, C1 extraction payload, classifier engine, and database persistence.
"""

from datetime import datetime, timezone
import json
import uuid
from typing import Any

from backend.db.connection import Database, db as default_db
from backend.db.repository import (
    get_upload_by_id,
    get_document_type,
    insert_document_type,
    get_extraction_by_doc
)
from backend.storage.vault import VaultBackend, default_vault
from backend.pipeline.branch_b import execute_branch_b
from backend.typing.classifier import classify_document, DocumentTypeResult


def process_document_typing(
    application_id: str,
    document_id: str,
    database: Database | None = None,
    vault_backend: VaultBackend | None = None,
    force_recompute: bool = False,
) -> dict[str, Any]:
    """
    Classify a document's type using its S4 C1 extraction payload.
    Persists result to database and returns structured classification result.
    """
    d = database or default_db
    v = vault_backend or default_vault

    # 1. Fetch document upload record
    with d.connection() as conn:
        upload = get_upload_by_id(conn, document_id, database=d)
    if not upload or upload.get("application_id") != application_id:
        return {
            "status": "NOT_FOUND",
            "error_code": "DOCUMENT_NOT_FOUND",
            "reason": f"Document '{document_id}' not found for application '{application_id}'"
        }

    # 2. Check cached classification
    if not force_recompute:
        with d.connection() as conn:
            cached = get_document_type(conn, application_id, document_id, database=d)
        if cached:
            return {
                "application_id": cached["application_id"],
                "document_id": cached["document_id"],
                "doc_slot": cached.get("doc_slot"),
                "doc_type": cached["doc_type"],
                "confidence": cached["confidence"],
                "is_classified": bool(cached["is_classified"]),
                "decision_reason": cached["decision_reason"],
                "pipeline_stage": "S5_TYPING",
                "evidence": json.loads(cached["evidence_json"]) if cached.get("evidence_json") else [],
                "candidate_scores": json.loads(cached["candidate_scores_json"]) if cached.get("candidate_scores_json") else {},
                "flags": json.loads(cached["flags_json"]) if cached.get("flags_json") else [],
                "idempotent_cached": True,
                "simulated": True,
                "advisory": True,
            }

    # 3. Retrieve or execute S4 extraction payload
    with d.connection() as conn:
        ext_rec = get_extraction_by_doc(conn, application_id, document_id, database=d)

    payload_data: dict[str, Any] | None = None
    if ext_rec and ext_rec.get("status") == "SUCCESS":
        try:
            cached_bytes = v.get_bytes(ext_rec["payload_storage_key"])
            payload_data = json.loads(cached_bytes.decode("utf-8"))
        except Exception:
            payload_data = None

    if not payload_data:
        # Run S4 extraction if not yet generated
        extract_res = execute_branch_b(
            application_id=application_id,
            document_id=document_id,
            database=d,
            vault_backend=v,
        )
        if isinstance(extract_res, dict) and extract_res.get("status") in ("NOT_CHECKED", "NOT_FOUND"):
            return {
                "status": "NOT_CHECKED",
                "error_code": "EXTRACTION_UNAVAILABLE",
                "reason": f"Cannot classify document without valid extraction: {extract_res.get('reason')}",
                "pipeline_stage": "S5_TYPING"
            }
        payload_data = extract_res

    # 4. Extract page 1 text and blocks from C1 payload
    all_blocks = payload_data.get("blocks", [])
    page_1_blocks = [b for b in all_blocks if b.get("page") == 1]
    
    if page_1_blocks:
        page_1_text = " ".join(b.get("text", "") for b in page_1_blocks)
    else:
        # Fallback to markdown header/initial text
        page_1_text = payload_data.get("markdown", "")[:2000]

    # 5. Run classifier engine
    result: DocumentTypeResult = classify_document(
        application_id=application_id,
        document_id=document_id,
        page_1_text=page_1_text,
        page_1_blocks=page_1_blocks,
        doc_slot=upload.get("doc_slot")
    )

    res_dict = result.to_dict()
    res_dict["idempotent_cached"] = False

    # 6. Persist to database
    rec_id = f"typ_{uuid.uuid4().hex[:12]}"
    now_iso = datetime.now(timezone.utc).isoformat()

    with d.transaction() as conn:
        insert_document_type(
            conn=conn,
            id=rec_id,
            application_id=application_id,
            document_id=document_id,
            blake3=upload["blake3"],
            doc_slot=upload.get("doc_slot"),
            doc_type=result.doc_type,
            confidence=result.confidence,
            is_classified=result.is_classified,
            decision_reason=result.decision_reason,
            evidence_json=json.dumps(res_dict["evidence"]),
            candidate_scores_json=json.dumps(res_dict["candidate_scores"]),
            flags_json=json.dumps(res_dict["flags"]),
            created_at=now_iso,
            database=d
        )

    return res_dict
