"""
S6 Schema-Driven Extraction and S6b Grounding Module (Guide §11.2, §11.3).
"""

from backend.extraction.date_parser import parse_date
from backend.extraction.grounding import ground
from backend.extraction.extractor import extract_document_fields, load_doc_schema
from backend.extraction.service import process_document_extraction

__all__ = [
    "parse_date",
    "ground",
    "extract_document_fields",
    "load_doc_schema",
    "process_document_extraction",
]
