"""
QR Code Locator & Issuer Reference Detector (Guide §5.7).
Decodes QR codes from raster images or page 1 of PDFs.
Treats QR codes as locators, never trusted URLs.
Matches decoded text against configured issuer patterns; never performs outbound fetches.
"""
import io
import re
from typing import Any
import cv2
import numpy as np
from PIL import Image
import pymupdf

from backend.forensics.models import ForensicFlag, QRResult

DETECTOR_NAME = "qr_decode"
DETECTOR_VERSION = "1.0.0"

# Allowlisted issuer pattern registry (Guide §5.7 & Appendix B)
ISSUER_PATTERNS: dict[str, re.Pattern[str]] = {
    "MOCK_FIRE": re.compile(r"^https://verify\.mock-issuer\.example/fire/(?P<ref>[A-Z0-9/\-]{6,40})$"),
    "MOCK_AFFILIATION": re.compile(r"^https://verify\.mock-issuer\.example/univ/(?P<ref>[A-Z0-9/\-]{6,40})$"),
    "MOCK_ACCREDITATION": re.compile(r"^https://verify\.mock-issuer\.example/nba/(?P<ref>[A-Z0-9/\-]{6,40})$"),
}


def _decode_qr_from_cv_image(cv_img: np.ndarray) -> str | None:
    """Decode QR code string from OpenCV BGR image using cv2.QRCodeDetector."""
    try:
        detector = cv2.QRCodeDetector()
        data, bbox, _ = detector.detectAndDecode(cv_img)
        if data and str(data).strip():
            return str(data).strip()

        # Multi-detector fallback if single detect misses
        ok, decoded_info, _, _ = detector.detectAndDecodeMulti(cv_img)
        if ok and decoded_info:
            for item in decoded_info:
                if item and str(item).strip():
                    return str(item).strip()
    except Exception:
        pass
    return None


def detect_qr_code(
    raw_bytes: bytes,
    media_type: str,
    document_id: str,
) -> tuple[QRResult | None, list[ForensicFlag]]:
    """
    Locate and decode QR code from PDF page 1 or raster image.
    Extracts allowlisted issuer reference.
    Never issues network requests.
    """
    flags: list[ForensicFlag] = []
    decoded_text: str | None = None

    is_pdf = media_type == "application/pdf" or raw_bytes.startswith(b"%PDF")

    if is_pdf:
        # Decode on original raster at 150-200 DPI, then 300 DPI if nothing found (Guide §5.7)
        try:
            doc = pymupdf.open(stream=raw_bytes, filetype="pdf")
            if len(doc) > 0:
                page = doc[0]
                # Pass 1: 150 DPI
                pix150 = page.get_pixmap(dpi=150)
                img_array = np.frombuffer(pix150.samples, dtype=np.uint8).reshape(pix150.height, pix150.width, pix150.n)
                if pix150.n == 4:
                    cv_img = cv2.cvtColor(img_array, cv2.COLOR_RGBA2BGR)
                else:
                    cv_img = cv2.cvtColor(img_array, cv2.COLOR_RGB2BGR)
                decoded_text = _decode_qr_from_cv_image(cv_img)

                # Pass 2: 300 DPI fallback
                if not decoded_text:
                    pix300 = page.get_pixmap(dpi=300)
                    img_array300 = np.frombuffer(pix300.samples, dtype=np.uint8).reshape(pix300.height, pix300.width, pix300.n)
                    if pix300.n == 4:
                        cv_img300 = cv2.cvtColor(img_array300, cv2.COLOR_RGBA2BGR)
                    else:
                        cv_img300 = cv2.cvtColor(img_array300, cv2.COLOR_RGB2BGR)
                    decoded_text = _decode_qr_from_cv_image(cv_img300)
            doc.close()
        except Exception:
            pass
    else:
        # Direct raster image (PNG, JPEG)
        try:
            pil_img = Image.open(io.BytesIO(raw_bytes)).convert("RGB")
            cv_img = cv2.cvtColor(np.array(pil_img), cv2.COLOR_RGB2BGR)
            decoded_text = _decode_qr_from_cv_image(cv_img)
        except Exception:
            pass

    if not decoded_text:
        return None, flags

    # Pattern match decoded string against allowlisted issuer registries
    matched_issuer = None
    matched_ref = None

    for issuer_name, pattern in ISSUER_PATTERNS.items():
        if m := pattern.fullmatch(decoded_text):
            matched_issuer = issuer_name
            matched_ref = m.group("ref")
            break

    if matched_issuer and matched_ref:
        qr_result = QRResult(
            detected=True,
            issuer=matched_issuer,
            reference=matched_ref,
            raw_text_masked=decoded_text,
        )
        return qr_result, flags

    # Unrecognized QR destination -> flag QR_NOT_RECOGNISED (info); never fetch (Guide §5.7)
    flags.append(
        ForensicFlag(
            code="QR_NOT_RECOGNISED",
            severity="info",
            reason=(
                "QR code present but does not match any configured allowlisted issuer registry pattern. "
                "Egress gate prohibits outbound resolution of document-supplied URLs."
            ),
            evidence={
                "artifact_uri": f"forensics://documents/{document_id}/qr",
                "value": decoded_text[:40] + ("..." if len(decoded_text) > 40 else ""),
            },
            advisory=True,
            requires_human_review=True,
            detector={"name": DETECTOR_NAME, "version": DETECTOR_VERSION},
        )
    )

    qr_result = QRResult(
        detected=True,
        issuer=None,
        reference=None,
        raw_text_masked=decoded_text[:40] + ("..." if len(decoded_text) > 40 else ""),
    )
    return qr_result, flags
