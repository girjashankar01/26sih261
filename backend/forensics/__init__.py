"""
S2 Forensics package (Guide §2.2, §5).
Raw-byte forensics: PDF metadata, digital signatures, image EXIF/geo, and QR locator.
"""
from backend.forensics.runner import run_forensics
from backend.forensics.models import (
    DocumentForensicsResult,
    ForensicFlag,
    ForensicsMeta,
    GeoMeta,
    QRResult,
    SignatureInfo,
    DetectorStatus,
)

__all__ = [
    "run_forensics",
    "DocumentForensicsResult",
    "ForensicFlag",
    "ForensicsMeta",
    "GeoMeta",
    "QRResult",
    "SignatureInfo",
    "DetectorStatus",
]
