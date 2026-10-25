"""
S6 Document Field Extraction Service Orchestrator (Guide §11.2, §11.3).

Coordinates document typing (S5), extraction payload (S4), schema field extraction,
bounding-box grounding (S6b), and database persistence of C3 typed facts.
"""

from datetime import datetime, timezone
import json
from typing import Any

from backend.db.connection import Database, db as default_db
from backend.db.repository import (
    get_upload_by_id,
    get_document_type,
    get_extraction_by_doc,
    get_facts_by_doc,
    insert_facts_batch
)
from backend.storage.vault import VaultBackend, default_vault
from backend.pipeline.branch_b import execute_branch_b
from backend.typing.service import process_document_typing
from backend.extraction.extractor import extract_document_fields


def process_document_extraction(
    application_id: str,
    document_id: str,
    database: Database | None = None,
    vault_backend: VaultBackend | None = None,
    force_recompute: bool = False,
) -> dict[str, Any]:
    """
    Extract grounded fields for a classified document according to its YAML schema.
    Persists C3 typed facts and returns structured extraction response.
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

    # 2. Check S5 document typing
    with d.connection() as conn:
        type_rec = get_document_type(conn, application_id, document_id, database=d)

    if not type_rec:
        type_res = process_document_typing(
            application_id=application_id,
            document_id=document_id,
            database=d,
            vault_backend=v
        )
        doc_type = type_res.get("doc_type", "UNCLASSIFIED")
    else:
        doc_type = type_rec["doc_type"]

    if doc_type == "UNCLASSIFIED":
        return {
            "application_id": application_id,
            "document_id": document_id,
            "doc_type": "UNCLASSIFIED",
            "completeness_status": "NOT_CHECKED",
            "reason": "Document is UNCLASSIFIED. Human classification required before schema-driven extraction.",
            "missing_fields": [],
            "facts": [],
            "pipeline_stage": "S6_EXTRACTION",
            "simulated": True,
            "advisory": True
        }

    # 3. Check existing cached facts
    if not force_recompute:
        with d.connection() as conn:
            cached_facts = get_facts_by_doc(conn, application_id, document_id, database=d)
        if cached_facts:
            # Reconstruct response from DB
            missing_req = [
                f["key"] for f in cached_facts
                if f["parse_state"] != "ok" or f.get("value") is None
            ]
            comp_status = "COMPLETE" if not missing_req else "INCOMPLETE"
            # Format facts for response
            formatted_facts = []
            for f in cached_facts:
                bbox = json.loads(f["bbox_norm_json"]) if f.get("bbox_norm_json") else None
                formatted_facts.append({
                    "id": f["id"],
                    "application_id": f["application_id"],
                    "document_id": f["document_id"],
                    "source": f["source"],
                    "entity": f["entity"],
                    "key": f["key"],
                    "raw": f["raw"],
                    "value_type": f["value_type"],
                    "value": f["value"],
                    "parse_state": f["parse_state"],
                    "conf": f["conf"],
                    "conf_kind": f["conf_kind"],
                    "grounded": bool(f["grounded"]),
                    "source_ref": f["source_ref"],
                    "page": f["page"],
                    "bbox_norm": bbox,
                    "bbox_precision": f["bbox_precision"],
                    "extractor": f["extractor"],
                    "extractor_version": f["extractor_version"],
                    "needs_confirmation": bool(f["needs_confirmation"]),
                    "simulated": bool(f["simulated"]),
                })

            return {
                "application_id": application_id,
                "document_id": document_id,
                "doc_type": doc_type,
                "completeness_status": comp_status,
                "missing_fields": missing_req,
                "facts": formatted_facts,
                "idempotent_cached": True,
                "pipeline_stage": "S6_EXTRACTION",
                "simulated": True,
                "advisory": True
            }

    # 4. Fetch S4 extraction payload
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
                "reason": f"S4 extraction failed: {extract_res.get('reason')}",
                "pipeline_stage": "S6_EXTRACTION"
            }
        payload_data = extract_res

    # 5. Read original bytes for word-precision search
    try:
        orig_bytes = v.get_bytes(upload["storage_key"])
    except Exception:
        orig_bytes = None

    # 6. Run schema-driven extraction
    res = extract_document_fields(
        application_id=application_id,
        document_id=document_id,
        doc_type=doc_type,
        c1_payload=payload_data,
        original_pdf_bytes=orig_bytes
    )

    # 7. Persist facts to database
    now_iso = datetime.now(timezone.utc).isoformat()
    db_facts = []
    for f in res.get("facts", []):
        f_copy = dict(f)
        f_copy["bbox_norm_json"] = json.dumps(f.get("bbox_norm")) if f.get("bbox_norm") else None
        f_copy["created_at"] = now_iso
        db_facts.append(f_copy)

    with d.transaction() as conn:
        insert_facts_batch(conn, db_facts, database=d)

    res["idempotent_cached"] = False
    return res
