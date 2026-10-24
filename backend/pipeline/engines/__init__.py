"""
Extraction engines package (Guide §8).
"""

from backend.pipeline.engines.tabular import extract_csv, extract_xlsx
from backend.pipeline.engines.digital_pdf import extract_digital_page
from backend.pipeline.engines.docling_engine import (
    convert_with_docling,
    check_docling_available,
    DoclingModelsMissingError,
    DoclingUnavailableError,
)
from backend.pipeline.engines.ocr_ladder import run_scanned_ocr_ladder, compute_quality_score

__all__ = [
    "extract_csv",
    "extract_xlsx",
    "extract_digital_page",
    "convert_with_docling",
    "check_docling_available",
    "DoclingModelsMissingError",
    "DoclingUnavailableError",
    "run_scanned_ocr_ladder",
    "compute_quality_score",
]
