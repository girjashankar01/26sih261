import asyncio
from pathlib import Path

from fastapi import FastAPI, File, Form, Header, HTTPException, UploadFile
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from backend.api.schemas import (
    DemoApplicationsListModel,
    DocumentForensicsResponseModel,
    DocumentIngestResponseModel,
    DocumentRouteResponseModel,
    HealthResponseModel,
    ValidationResponseModel,
    C1UnifiedPayloadModel,
)
from backend.db.connection import db as default_db
from backend.db.repository import get_upload_by_id
from backend.forensics import run_forensics
from backend.ingest.service import process_upload_stream
from backend.pipeline.router import route_document
from backend.pipeline.branch_b import execute_branch_b
from backend.records.demo import APPLICATIONS
from backend.rules.evaluate import validate_application
from backend.storage.vault import default_vault

app = FastAPI(
    title="AICTE Application Validation Prototype",
    description="Synthetic decision-support demo for SIH 2026 PS 26261. Not an AICTE-integrated service.",
    version="0.1.0",
)
ROOT = Path(__file__).resolve().parents[2]
UI_DIR = ROOT / "ui"
app.mount("/static", StaticFiles(directory=UI_DIR), name="static")


@app.get("/", include_in_schema=False)
def home():
    return FileResponse(UI_DIR / "index.html")


@app.get("/health", response_model=HealthResponseModel)
def health():
    return {"status": "ok", "mode": "demo", "simulated": True}


@app.get("/api/demo/applications", response_model=DemoApplicationsListModel)
def list_applications():
    return {"items": list(APPLICATIONS.values()), "simulated": True}


@app.get(
    "/api/demo/applications/{application_id}/validate",
    response_model=ValidationResponseModel,
)
def validate(application_id: str):
    case = APPLICATIONS.get(application_id)
    if case is None:
        raise HTTPException(status_code=404, detail="Synthetic demo application not found")
    return validate_application(case)


@app.post(
    "/applications/{application_id}/documents",
    response_model=DocumentIngestResponseModel,
    status_code=201,
    summary="Upload, persist, and register an application document (S1 Ingest, Guide §4)",
    description="Streams multipart upload, computes BLAKE3 and SHA-256 in one pass, enforces size limits, sniffs magic bytes (PDF, PNG, JPEG), rejects encrypted PDFs, stores in content-addressed vault with deduplication, records blob and upload metadata in a database transaction, and supports idempotent replays via Idempotency-Key header.",
)
async def upload_document(
    application_id: str,
    file: UploadFile = File(..., description="Document file to upload (PDF, PNG, JPEG)"),
    doc_slot: str | None = Form(default=None, description="Optional document slot (e.g. fire_noc, affidavit)"),
    idempotency_key_form: str | None = Form(default=None, alias="idempotency_key", description="Optional idempotency key in form"),
    idempotency_key_header: str | None = Header(default=None, alias="Idempotency-Key", description="Optional idempotency key in header"),
):
    if not application_id or not application_id.strip():
        raise HTTPException(status_code=400, detail="Invalid application_id")

    id_header = idempotency_key_header if isinstance(idempotency_key_header, str) else None
    id_form = idempotency_key_form if isinstance(idempotency_key_form, str) else None
    idempotency_key = (id_header or id_form or "").strip() or None

    slot = doc_slot.strip() if isinstance(doc_slot, str) and doc_slot.strip() else None

    result = await process_upload_stream(
        upload_file=file,
        application_id=application_id.strip(),
        doc_slot=slot,
        idempotency_key=idempotency_key,
    )
    return result


@app.post(
    "/applications/{application_id}/documents/{document_id}/route",
    response_model=DocumentRouteResponseModel,
    summary="Route and classify a persisted document (S3 Route, Guide §6)",
    description="Inspects extractable text, image coverage, and vector drawings using deterministic thresholds. Routes to Branch A (digital), Branch B (scanned raster), or Mixed. Does not perform forensics (S2), OCR, or document typing.",
)
@app.get(
    "/applications/{application_id}/documents/{document_id}/route",
    response_model=DocumentRouteResponseModel,
    summary="Retrieve routing and classification result for a persisted document",
)
async def route_document_endpoint(
    application_id: str,
    document_id: str,
):
    if not application_id or not application_id.strip():
        raise HTTPException(status_code=400, detail="Invalid application_id")
    if not document_id or not document_id.strip():
        raise HTTPException(status_code=400, detail="Invalid document_id")

    with default_db.connection() as conn:
        record = get_upload_by_id(conn, document_id.strip(), default_db)

    if not record or record.get("application_id") != application_id.strip():
        raise HTTPException(
            status_code=404,
            detail={"error_code": "DOCUMENT_NOT_FOUND", "message": f"Document '{document_id}' not found for application '{application_id}'"},
        )

    storage_key = record["storage_key"]
    if not default_vault.exists(storage_key):
        raise HTTPException(
            status_code=404,
            detail={"error_code": "VAULT_OBJECT_NOT_FOUND", "message": f"Vault storage object '{storage_key}' not found"},
        )

    raw_bytes = default_vault.get_bytes(storage_key)

    result = route_document(
        raw_bytes=raw_bytes,
        media_type=record["media_type"],
        document_id=record["id"],
        application_id=record["application_id"],
        doc_slot=record.get("doc_slot"),
        blake3=record["blake3"],
        sha256=record["sha256"],
        storage_key=storage_key,
    )
    from dataclasses import asdict
    return asdict(result) if hasattr(result, "__dataclass_fields__") else result


@app.post(
    "/applications/{application_id}/documents/{document_id}/forensics",
    response_model=DocumentForensicsResponseModel,
    summary="Execute raw-byte forensic analysis on a persisted document (S2 Forensics, Guide §5)",
    description="Inspects PDF metadata, incremental updates, digital signatures, image EXIF/geo, and QR locators on immutable original bytes through vault storage. All flags are advisory preliminary indicators.",
)
@app.get(
    "/applications/{application_id}/documents/{document_id}/forensics",
    response_model=DocumentForensicsResponseModel,
    summary="Retrieve raw-byte forensic analysis result for a persisted document",
)
async def forensics_document_endpoint(
    application_id: str,
    document_id: str,
):
    if not application_id or not application_id.strip():
        raise HTTPException(status_code=400, detail="Invalid application_id")
    if not document_id or not document_id.strip():
        raise HTTPException(status_code=400, detail="Invalid document_id")

    with default_db.connection() as conn:
        record = get_upload_by_id(conn, document_id.strip(), default_db)

    if not record or record.get("application_id") != application_id.strip():
        raise HTTPException(
            status_code=404,
            detail={"error_code": "DOCUMENT_NOT_FOUND", "message": f"Document '{document_id}' not found for application '{application_id}'"},
        )

    storage_key = record["storage_key"]
    if not default_vault.exists(storage_key):
        raise HTTPException(
            status_code=404,
            detail={"error_code": "VAULT_OBJECT_NOT_FOUND", "message": f"Vault storage object '{storage_key}' not found"},
        )

    raw_bytes = default_vault.get_bytes(storage_key)

    result = await asyncio.to_thread(
        run_forensics,
        raw_bytes=raw_bytes,
        media_type=record["media_type"],
        document_id=record["id"],
        application_id=record["application_id"],
        blake3=record["blake3"],
        sha256=record["sha256"],
        storage_key=storage_key,
        doc_slot=record.get("doc_slot"),
    )
    return result.to_dict() if hasattr(result, "to_dict") else result


@app.post(
    "/applications/{application_id}/documents/{document_id}/extract",
    summary="Execute S4 Branch B extraction pipeline (Guide §7–§9)",
    description="Consumes S3 routes and persisted originals through storage abstraction. Runs raster preprocessing, single composed 3x3 coordinate transform, offline extraction engines, table cell normalisation, arithmetic verification, and produces C1 Unified Document Payload. Processing is cache-aware and idempotent.",
)
@app.get(
    "/applications/{application_id}/documents/{document_id}/extract",
    summary="Retrieve S4 Branch B extraction result for a document",
)
async def extract_document_endpoint(
    application_id: str,
    document_id: str,
):
    if not application_id or not application_id.strip():
        raise HTTPException(status_code=400, detail="Invalid application_id")
    if not document_id or not document_id.strip():
        raise HTTPException(status_code=400, detail="Invalid document_id")

    result = await asyncio.to_thread(
        execute_branch_b,
        application_id=application_id.strip(),
        document_id=document_id.strip(),
        database=default_db,
        vault_backend=default_vault,
    )

    if isinstance(result, dict) and result.get("status") == "NOT_FOUND":
        raise HTTPException(
            status_code=404,
            detail={"error_code": "DOCUMENT_NOT_FOUND", "message": result.get("reason")},
        )

    return result


