"""
Image Metadata, EXIF, and Geospatial Detector (Guide §5.3).
Executes ExifTool one-shot per file with a fixed argument list, shell=False, timeout=20.
No network access, safe temporary scratch handling.
Never logs document content. Absence of EXIF is not evidence of tampering.
If ExifTool binary is unavailable, raises RuntimeError so runner records NOT_CHECKED.
"""
import json
import logging
import os
import shutil
import subprocess
import tempfile
from typing import Any

from backend.forensics.models import ForensicFlag, GeoMeta

logger = logging.getLogger("aicte.forensics.exif")

DETECTOR_NAME = "image_metadata_exif"
DETECTOR_VERSION = "2.0.0"

# Known image editor tokens (Guide §5.3)
IMAGE_EDITOR_TOKENS = [
    "photoshop",
    "gimp",
    "canva",
    "pixlr",
    "lightroom",
    "snapseed",
    "corel",
    "facetune",
]


def detect_image_exif(
    raw_bytes: bytes,
    document_id: str,
) -> tuple[GeoMeta, list[ForensicFlag]]:
    """
    Extract EXIF and geospatial metadata from image bytes using one-shot ExifTool execution.
    Conforms strictly to Guide §5.3:
      exiftool -json -n -G1 -- <path>
      shell=False, timeout=20, fixed argument list.
    """
    geo = GeoMeta()
    flags: list[ForensicFlag] = []

    # Verify ExifTool binary presence in environment
    exiftool_bin = shutil.which("exiftool")
    if not exiftool_bin:
        raise RuntimeError(
            "ExifTool binary not found in PATH; pure-Python fallbacks avoided per Guide §5.3"
        )

    # Write raw bytes to temporary scratch file for one-shot inspection
    with tempfile.NamedTemporaryFile(suffix=".tmp", delete=False) as tmp_file:
        tmp_file.write(raw_bytes)
        tmp_file.flush()
        scratch_path = tmp_file.name

    try:
        cmd = [exiftool_bin, "-json", "-n", "-G1", "--", scratch_path]
        proc = subprocess.run(
            cmd,
            shell=False,
            timeout=20,
            capture_output=True,
            check=True,
        )
        parsed = json.loads(proc.stdout.decode("utf-8", errors="replace"))
        if not parsed or not isinstance(parsed, list):
            return geo, flags
        data: dict[str, Any] = parsed[0]

    except subprocess.TimeoutExpired:
        logger.warning(f"ExifTool inspection timed out for doc {document_id}")
        return geo, flags
    except Exception as err:
        logger.warning(f"ExifTool execution error for doc {document_id}: {type(err).__name__}")
        return geo, flags
    finally:
        try:
            os.remove(scratch_path)
        except OSError:
            pass

    # Group-agnostic / Composite tag extraction (Guide §5.3)
    # 1. Camera Make & Model
    geo.make = (
        data.get("IFD0:Make")
        or data.get("ExifIFD:Make")
        or data.get("Make")
        or None
    )
    if geo.make:
        geo.make = str(geo.make).strip()

    geo.model = (
        data.get("IFD0:Model")
        or data.get("ExifIFD:Model")
        or data.get("Model")
        or None
    )
    if geo.model:
        geo.model = str(geo.model).strip()

    # 2. Capture timestamp
    captured_at = (
        data.get("ExifIFD:DateTimeOriginal")
        or data.get("Composite:SubSecDateTimeOriginal")
        or data.get("IFD0:CreateDate")
        or data.get("CreateDate")
        or None
    )
    if captured_at:
        geo.captured_at = str(captured_at).strip()

    # 3. GPS Coordinates (prefer Composite decimal degrees from -n flag)
    lat = data.get("Composite:GPSLatitude") or data.get("GPS:GPSLatitude")
    lon = data.get("Composite:GPSLongitude") or data.get("GPS:GPSLongitude")

    if lat is not None:
        try:
            geo.latitude = round(float(lat), 6)
        except (ValueError, TypeError):
            pass

    if lon is not None:
        try:
            geo.longitude = round(float(lon), 6)
        except (ValueError, TypeError):
            pass

    # 4. Check for Editing Software signature (Guide §5.3)
    software_field = str(
        data.get("IFD0:Software")
        or data.get("XMP:Software")
        or data.get("Software")
        or ""
    ).lower()

    history_agent = str(data.get("XMP:HistorySoftwareAgent") or "").lower()

    matched_editor = None
    for token in IMAGE_EDITOR_TOKENS:
        if token in software_field or token in history_agent:
            matched_editor = token
            break

    if matched_editor:
        flags.append(
            ForensicFlag(
                code="EDITING_SOFTWARE_SIGNATURE",
                severity="medium",
                reason=(
                    f"Metadata declares editing software '{matched_editor}'. "
                    "Preliminary indicator requiring officer verification (no declared AI/editing metadata found otherwise)."
                ),
                evidence={
                    "artifact_uri": f"forensics://documents/{document_id}/exif",
                    "value": f"software='{data.get('IFD0:Software') or data.get('XMP:HistorySoftwareAgent')}'",
                },
                advisory=True,
                requires_human_review=True,
                detector={"name": DETECTOR_NAME, "version": DETECTOR_VERSION},
            )
        )

    # 5. XMP Revision History check (Guide §5.3: XMP_REVISION_HISTORY_PRESENT)
    has_xmp_history = bool(data.get("XMP:HistoryAction") or data.get("XMP:HistorySoftwareAgent"))
    if has_xmp_history and not matched_editor:
        flags.append(
            ForensicFlag(
                code="XMP_REVISION_HISTORY_PRESENT",
                severity="low",
                reason="XMP metadata contains editing revision history entries.",
                evidence={
                    "artifact_uri": f"forensics://documents/{document_id}/xmp_history",
                    "value": str(data.get("XMP:HistoryAction")),
                },
                advisory=True,
                requires_human_review=True,
                detector={"name": DETECTOR_NAME, "version": DETECTOR_VERSION},
            )
        )

    # 6. Declared AI generation check (Guide §5.3: AI_GENERATION_DECLARED)
    digital_source = str(data.get("XMP:DigitalSourceType") or "").lower()
    if any(k in digital_source for k in ("trainedalgorithmicmedia", "compositealgorithmicmedia", "virtualrecording")):
        flags.append(
            ForensicFlag(
                code="AI_GENERATION_DECLARED",
                severity="medium",
                reason=f"XMP DigitalSourceType declares algorithmic/generative media: '{data.get('XMP:DigitalSourceType')}'.",
                evidence={
                    "artifact_uri": f"forensics://documents/{document_id}/ai_declared",
                    "value": str(data.get("XMP:DigitalSourceType")),
                },
                advisory=True,
                requires_human_review=True,
                detector={"name": DETECTOR_NAME, "version": DETECTOR_VERSION},
            )
        )

    return geo, flags
