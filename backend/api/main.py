from datetime import date
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from backend.records.demo import APPLICATIONS
from backend.rules.evaluate import validate_application

app = FastAPI(
    title="AICTE Application Validation Prototype",
    description="Synthetic decision-support demo. Not an AICTE-integrated service.",
    version="0.1.0",
)
ROOT = Path(__file__).resolve().parents[2]
UI_DIR = ROOT / "ui"
app.mount("/static", StaticFiles(directory=UI_DIR), name="static")


@app.get("/", include_in_schema=False)
def home():
    return FileResponse(UI_DIR / "index.html")


@app.get("/health")
def health():
    return {"status": "ok", "mode": "demo", "simulated": True}


@app.get("/api/demo/applications")
def list_applications():
    return {"items": list(APPLICATIONS.values()), "simulated": True}


@app.get("/api/demo/applications/{application_id}/validate")
def validate(application_id: str):
    case = APPLICATIONS.get(application_id)
    if case is None:
        raise HTTPException(status_code=404, detail="Synthetic demo application not found")
    return validate_application(case)
