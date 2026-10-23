from pathlib import Path

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
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
    summary="Upload and ingest a document for an application (Guide §4 S1)",
    description="Streams multipart upload to scratch storage, computes BLAKE3 and SHA-256 in one pass, enforces size limits, sniffs magic bytes (PDF, PNG, JPEG), rejects encrypted PDFs, and returns ingestion metadata.",
)
async def upload_document(
    application_id: str,
    file: UploadFile = File(..., description="Document file to upload (PDF, PNG, JPEG)"),
    doc_slot: str | None = Form(default=None, description="Optional document slot (e.g. fire_noc, affidavit)"),
):
    if not application_id or not application_id.strip():
        raise HTTPException(status_code=400, detail="Invalid application_id")

    result = await process_upload_stream(
        upload_file=file,
        application_id=application_id.strip(),
        doc_slot=doc_slot,
    )
    return result
