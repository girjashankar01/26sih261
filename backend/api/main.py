from pathlib import Path

from fastapi import FastAPI, File, Form, Header, HTTPException, UploadFile
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from backend.api.schemas import (
    DemoApplicationsListModel,
    DocumentIngestResponseModel,
    HealthResponseModel,
    ValidationResponseModel,
)
from backend.ingest.service import process_upload_stream
from backend.records.demo import APPLICATIONS
from backend.rules.evaluate import validate_application

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
    summary="Upload, persist, and register an application document (Guide §4 S1)",
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
