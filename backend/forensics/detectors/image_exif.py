"""
Image Metadata, EXIF, and Geospatial Detector (Guide §5.3).
Extracts camera make/model, timestamps, and GPS coordinates from JPEG/PNG images.
Detects editing software signatures in EXIF fields.
Absence of EXIF is not evidence of tampering.
"""
import io
from typing import Any
from PIL import Image, ExifTags

from backend.forensics.models import ForensicFlag, GeoMeta

DETECTOR_NAME = "image_metadata_exif"
DETECTOR_VERSION = "1.0.0"

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


def _convert_dms_to_degrees(dms_tuple: tuple[Any, Any, Any], ref: str) -> float | None:
    """Convert degrees, minutes, seconds tuple to decimal degrees."""
    try:
        deg = float(dms_tuple[0])
        minutes = float(dms_tuple[1])
        seconds = float(dms_tuple[2])
        decimal = deg + (minutes / 60.0) + (seconds / 3600.0)
        if ref.upper() in ("S", "W"):
            decimal = -decimal
        return round(decimal, 6)
    except Exception:
        return None


def detect_image_exif(
    raw_bytes: bytes,
    document_id: str,
) -> tuple[GeoMeta, list[ForensicFlag]]:
    """
    Parse EXIF metadata and GPS tags from image bytes.
    Returns (geo, flags).
    """
    geo = GeoMeta()
    flags: list[ForensicFlag] = []

    try:
        img = Image.open(io.BytesIO(raw_bytes))
    except Exception:
        # Not a valid image or unparseable raster
        return geo, flags

    exif = None
    try:
        exif = img.getexif()
    except Exception:
        pass

    if not exif:
        return geo, flags

    # Human-readable tag dictionary
    named_tags: dict[str, Any] = {}
    for tag_id, value in exif.items():
        tag_name = ExifTags.TAGS.get(tag_id, str(tag_id))
        named_tags[tag_name] = value

    # Extract Camera Make & Model
    geo.make = str(named_tags.get("Make") or "").strip() or None
    geo.model = str(named_tags.get("Model") or "").strip() or None
    geo.captured_at = str(named_tags.get("DateTimeOriginal") or named_tags.get("DateTime") or "").strip() or None

    # Check for Editing Software signature in EXIF
    software_val = str(named_tags.get("Software") or named_tags.get("ProcessingSoftware") or "").lower()
    matched_editor = None
    for token in IMAGE_EDITOR_TOKENS:
        if token in software_val:
            matched_editor = token
            break

    if matched_editor:
        flags.append(
            ForensicFlag(
                code="EDITING_SOFTWARE_SIGNATURE",
                severity="medium",
                reason=(
                    f"EXIF Software metadata declares '{matched_editor}'. "
                    "Preliminary indicator requiring officer verification (no declared AI/editing metadata found otherwise)."
                ),
                evidence={
                    "artifact_uri": f"forensics://documents/{document_id}/exif",
                    "value": f"software='{named_tags.get('Software')}'",
                },
                advisory=True,
                requires_human_review=True,
                detector={"name": DETECTOR_NAME, "version": DETECTOR_VERSION},
            )
        )

    # Extract GPS Info
    # GPS IFD tag ID in EXIF standard is 34853 (0x8825)
    gps_ifd = exif.get_ifd(ExifTags.IFD.GPSInfo) if hasattr(exif, "get_ifd") else None
    if gps_ifd:
        gps_tags: dict[str, Any] = {}
        for tag_id, value in gps_ifd.items():
            tag_name = ExifTags.GPSTAGS.get(tag_id, str(tag_id))
            gps_tags[tag_name] = value

        lat_dms = gps_tags.get("GPSLatitude")
        lat_ref = gps_tags.get("GPSLatitudeRef", "N")
        lon_dms = gps_tags.get("GPSLongitude")
        lon_ref = gps_tags.get("GPSLongitudeRef", "E")

        if lat_dms and lon_dms:
            geo.latitude = _convert_dms_to_degrees(lat_dms, lat_ref)
            geo.longitude = _convert_dms_to_degrees(lon_dms, lon_ref)

    return geo, flags
