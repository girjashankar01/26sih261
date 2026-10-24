"""
S4 Branch B Extraction Engine and Pipeline Orchestrator (Guide §7–§9).

Consumes S3 per-page routes and reads persisted originals via the storage abstraction.
Maintains single-rotation coordinate transform and maps bounding boxes back once to
original page top-left normalized coordinates [0, 1].
Stores derived C1 unified payloads under derived/<blake3>/<version>/payload.json.
Idempotent and cache-aware via (blake3, pipeline_version, config_hash).
"""

from datetime import datetime, timezone
import hashlib
import json
import os
from typing import Any
import blake3 as b3
import cv2
import jsonschema
import numpy as np
import pymupdf

from backend.db.connection import Database, db as default_db
from backend.db.repository import (
    get_upload_by_id,
    get_extraction_by_cache_key,
    get_extraction_by_doc,
    insert_extraction
)
from backend.storage.vault import VaultBackend, default_vault
from backend.pipeline.router import route_document, DocumentRouteResult
from backend.pipeline.engines.tabular import extract_csv, extract_xlsx
from backend.pipeline.engines.digital_pdf import extract_digital_page
from backend.pipeline.engines.ocr_ladder import run_scanned_ocr_ladder
from backend.pipeline.postprocess import normalise_table_cells, check_table_arithmetic

PIPELINE_VERSION = "4.0.0"
CONFIG_TAG = "offline_phase_a"

# Load C1 Schema once
SCHEMA_PATH = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "../../docs/contracts/c1_unified_payload.schema.json")
)
try:
    with open(SCHEMA_PATH, "r", encoding="utf-8") as f:
        C1_SCHEMA = json.load(f)
except Exception:
    C1_SCHEMA = None


def compute_config_hash() -> str:
    """Compute 16-hex deterministic hash of active extraction config."""
    h = b3.blake3(f"{PIPELINE_VERSION}:{CONFIG_TAG}".encode("utf-8")).hexdigest()
    return h[:16]


def validate_c1_payload(payload: dict[str, Any]) -> tuple[bool, str | None]:
    """Validate payload against official C1 Unified Document Payload schema."""
    if C1_SCHEMA is None:
        return True, None
    try:
        jsonschema.validate(instance=payload, schema=C1_SCHEMA)
        return True, None
    except jsonschema.ValidationError as e:
        return False, f"PAYLOAD_INVALID: {e.message}"


def execute_branch_b(
    application_id: str,
    document_id: str,
    database: Database | None = None,
    vault_backend: VaultBackend | None = None,
    synthetic_ocr_fn: Any | None = None,
    force_recompute: bool = False,
) -> dict[str, Any]:
    """
    Execute S4 Branch B extraction on a persisted document.
    Returns C1 Unified Document Payload or structured failure dictionary.
    """
    d = database or default_db
    v = vault_backend or default_vault
    cfg_hash = compute_config_hash()

    # 1. Fetch document and blob records from DB
    with d.connection() as conn:
        upload = get_upload_by_id(conn, document_id, database=d)
    if not upload or upload.get("application_id") != application_id:
        return {
            "status": "NOT_FOUND",
            "error_code": "DOCUMENT_NOT_FOUND",
            "reason": f"Document '{document_id}' not found for application '{application_id}'"
        }

    blake3_digest = upload["blake3"]
    sha256_digest = upload["sha256"]
    storage_key = upload["storage_key"]

    # 2. Check cache
    if not force_recompute:
        with d.connection() as conn:
            cached_record = get_extraction_by_cache_key(conn, blake3_digest, PIPELINE_VERSION, cfg_hash, database=d)
        if cached_record and cached_record.get("status") == "SUCCESS":
            derived_key = cached_record["payload_storage_key"]
            try:
                cached_bytes = v.get_bytes(derived_key)
                payload_data = json.loads(cached_bytes.decode("utf-8"))
                payload_data["idempotent_cached"] = True
                return payload_data
            except Exception:
                # If cached file was removed, recompute
                pass

    # 3. Read original bytes through storage abstraction (immutable read)
    original_bytes = v.get_bytes(storage_key)
    if not original_bytes:
        return {
            "status": "NOT_CHECKED",
            "error_code": "STORAGE_READ_FAILED",
            "reason": f"Unable to read blob storage key '{storage_key}' from vault"
        }

    # 4. Route document to determine per-page verdicts
    route_res: DocumentRouteResult = route_document(
        raw_bytes=original_bytes,
        media_type=upload.get("media_type") or "application/pdf",
        document_id=document_id,
        application_id=application_id,
        doc_slot=upload.get("doc_slot"),
        blake3=blake3_digest,
        sha256=sha256_digest,
        storage_key=storage_key,
    )

    detected_kind = route_res.detected_kind
    pages_out: list[dict[str, Any]] = []
    tables_out: list[dict[str, Any]] = []
    blocks_out: list[dict[str, Any]] = []
    flags_out: list[dict[str, Any]] = []
    engines_used: set[str] = set()
    md_sections: list[str] = []

    # 5. Route handling per Guide §8.1
    if detected_kind == "csv":
        tables, blocks, f_list, md_str = extract_csv(original_bytes)
        tables_out.extend(tables)
        blocks_out.extend(blocks)
        flags_out.extend(f_list)
        md_sections.append(md_str)
        engines_used.add("pandas_tabular")
        pages_out.append({
            "page": 1,
            "label": "office",
            "reasons": ["csv_tabular_file"],
            "engine": "pandas_tabular"
        })
        c1_kind = "office"

    elif detected_kind in ("xlsx", "xls"):
        tables, blocks, f_list, md_str = extract_xlsx(original_bytes)
        tables_out.extend(tables)
        blocks_out.extend(blocks)
        flags_out.extend(f_list)
        md_sections.append(md_str)
        engines_used.add("openpyxl_tabular")
        pages_out.append({
            "page": 1,
            "label": "office",
            "reasons": ["xlsx_spreadsheet"],
            "engine": "openpyxl_tabular"
        })
        c1_kind = "office"

    elif detected_kind in ("png", "jpeg"):
        c1_kind = "image"
        # Single raster page
        nparr = np.frombuffer(original_bytes, np.uint8)
        img_bgr = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        if img_bgr is None:
            return {
                "status": "NOT_CHECKED",
                "error_code": "IMAGE_DECODE_FAILED",
                "reason": "Failed to decode raster image bytes"
            }

        ocr_res = run_scanned_ocr_ladder(
            img_bgr,
            page_index=1,
            synthetic_ocr_fn=synthetic_ocr_fn
        )
        if ocr_res["status"] == "NOT_CHECKED":
            return {
                "status": "NOT_CHECKED",
                "error_code": ocr_res.get("error_class", "OCR_UNAVAILABLE"),
                "reason": ocr_res.get("reason", "Scanned OCR engine failed or models missing"),
                "page": 1,
                "preprocess": ocr_res.get("preprocess")
            }

        tables_out.extend(ocr_res.get("tables", []))
        blocks_out.extend(ocr_res.get("blocks", []))
        if ocr_res.get("markdown"):
            md_sections.append(ocr_res["markdown"])
        engines_used.add("docling_rapidocr")

        pages_out.append({
            "page": 1,
            "label": "scanned",
            "reasons": ["raster_image_file"],
            "engine": "docling_rapidocr",
            "level": ocr_res["level"],
            "quality": ocr_res["quality"],
            "preprocess": ocr_res["preprocess"]
        })

    elif detected_kind == "pdf":
        c1_kind = "pdf"
        try:
            doc = pymupdf.open(stream=original_bytes, filetype="pdf")
        except Exception as e:
            return {
                "status": "NOT_CHECKED",
                "error_code": "CORRUPT_DOCUMENT",
                "reason": f"Failed to parse PDF document structure: {str(e)}"
            }

        for p_idx in range(1, doc.page_count + 1):
            verdict = route_res.page_verdicts[p_idx - 1]
            label = verdict.get("label", "digital")

            if label == "digital":
                t, b, page_md = extract_digital_page(doc, p_idx)
                tables_out.extend(t)
                blocks_out.extend(b)
                md_sections.append(page_md)
                engines_used.add("docling_no_ocr")
                pages_out.append({
                    "page": p_idx,
                    "label": "digital",
                    "reasons": ["visible, sane text layer"],
                    "engine": "docling_no_ocr"
                })

            elif label == "hybrid":
                # Digital text layer plus bitmap region
                t, b, page_md = extract_digital_page(doc, p_idx)
                tables_out.extend(t)
                blocks_out.extend(b)
                md_sections.append(page_md)
                engines_used.add("docling_no_ocr")
                pages_out.append({
                    "page": p_idx,
                    "label": "hybrid",
                    "reasons": ["digital text with embedded bitmap overlay"],
                    "engine": "docling_no_ocr"
                })

            elif label == "scanned":
                # Render derived copy at 300 DPI (Guide §7.1)
                page_obj = doc[p_idx - 1]
                pix = page_obj.get_pixmap(dpi=300)
                img = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.width, pix.n)
                if pix.n == 4:
                    img_bgr = cv2.cvtColor(img, cv2.COLOR_RGBA2BGR)
                elif pix.n == 3:
                    img_bgr = cv2.cvtColor(img, cv2.COLOR_RGB2BGR)
                else:
                    img_bgr = cv2.cvtColor(img, cv2.COLOR_GRAY2BGR)

                ocr_res = run_scanned_ocr_ladder(
                    img_bgr,
                    page_index=p_idx,
                    synthetic_ocr_fn=synthetic_ocr_fn
                )

                if ocr_res["status"] == "NOT_CHECKED":
                    return {
                        "status": "NOT_CHECKED",
                        "error_code": ocr_res.get("error_class", "OCR_UNAVAILABLE"),
                        "reason": ocr_res.get("reason", f"OCR failed or models missing on page {p_idx}"),
                        "page": p_idx,
                        "preprocess": ocr_res.get("preprocess")
                    }

                tables_out.extend(ocr_res.get("tables", []))
                blocks_out.extend(ocr_res.get("blocks", []))
                if ocr_res.get("markdown"):
                    md_sections.append(ocr_res["markdown"])
                engines_used.add("docling_rapidocr")

                pages_out.append({
                    "page": p_idx,
                    "label": "scanned",
                    "reasons": ["raster page"],
                    "engine": "docling_rapidocr",
                    "level": ocr_res["level"],
                    "quality": ocr_res["quality"],
                    "preprocess": ocr_res["preprocess"]
                })

            elif label == "blank":
                pages_out.append({
                    "page": p_idx,
                    "label": "blank",
                    "reasons": ["blank page"],
                    "engine": "none"
                })

            else:
                pages_out.append({
                    "page": p_idx,
                    "label": label,
                    "reasons": [verdict.get("reason", "specialized_drawing")],
                    "engine": "none"
                })

    else:
        return {
            "status": "NOT_CHECKED",
            "error_code": "UNSUPPORTED_MEDIA_TYPE",
            "reason": f"Branch B does not support extraction for media type: {detected_kind}"
        }

    # 6. Post-processing: normalise table cells and run arithmetic check (§9)
    for table in tables_out:
        normalise_table_cells(
            cells=table.get("cells", []),
            n_rows=table.get("n_rows", 0),
            n_cols=table.get("n_cols", 0)
        )
        arith_flags = check_table_arithmetic(table)
        flags_out.extend(arith_flags)

    # 7. Assemble Unified Document Payload (C1 contract)
    unified_md = "\n\n".join(md_sections) if md_sections else "# Empty Document"
    
    payload = {
        "schema_version": "4.0",
        "pipeline_version": PIPELINE_VERSION,
        "blake3": blake3_digest,
        "sha256": sha256_digest,
        "kind": c1_kind,
        "coordinate_space": "original_page_norm_topleft",
        "pages": pages_out,
        "tables": tables_out,
        "blocks": blocks_out,
        "markdown": unified_md,
        "flags": flags_out,
        "engines": sorted(list(engines_used)),
        "egress": []
    }

    # 8. Validate against C1 schema (§9.4)
    valid, validation_err = validate_c1_payload(payload)
    if not valid:
        return {
            "status": "NOT_CHECKED",
            "error_code": "PAYLOAD_INVALID",
            "reason": validation_err or "Emitted payload violates C1 schema specification"
        }

    # 9. Store derived copy in vault under derived/<blake3>/<version>/payload.json
    derived_storage_key = f"derived/{blake3_digest}/{PIPELINE_VERSION}/payload.json"
    payload_json_bytes = json.dumps(payload, indent=2).encode("utf-8")
    try:
        v.put_bytes(derived_storage_key, payload_json_bytes, if_absent=False)
    except Exception as e:
        return {
            "status": "NOT_CHECKED",
            "error_code": "DERIVED_STORAGE_FAILED",
            "reason": f"Failed to persist derived extraction payload: {str(e)}"
        }

    # 10. Record extraction in database
    mean_quality = None
    scores = [
        p["quality"]["score"]
        for p in pages_out
        if "quality" in p and isinstance(p["quality"], dict) and "score" in p["quality"]
    ]
    if scores:
        mean_quality = round(sum(scores) / len(scores), 3)

    extraction_id = f"ext_{b3.blake3(f'{blake3_digest}:{derived_storage_key}'.encode()).hexdigest()[:12]}"
    now_iso = datetime.now(timezone.utc).isoformat()
    
    with d.transaction() as conn:
        insert_extraction(
            conn=conn,
            id=extraction_id,
            application_id=application_id,
            document_id=document_id,
            blake3=blake3_digest,
            pipeline_version=PIPELINE_VERSION,
            config_hash=cfg_hash,
            payload_storage_key=derived_storage_key,
            status="SUCCESS",
            quality_score=mean_quality,
            created_at=now_iso,
            database=d
        )

    payload["idempotent_cached"] = False
    return payload
