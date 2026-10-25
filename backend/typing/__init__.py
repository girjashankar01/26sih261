"""
S5 Document Typing and Checklist Selection Module (Guide §11.1).
"""

from backend.typing.classifier import (
    classify_document,
    DocumentTypeResult,
    TypingEvidence,
    TAU_MIN,
    DELTA,
    SLOT_BONUS,
    TYPE_PATTERNS
)
from backend.typing.service import process_document_typing

__all__ = [
    "classify_document",
    "DocumentTypeResult",
    "TypingEvidence",
    "TAU_MIN",
    "DELTA",
    "SLOT_BONUS",
    "TYPE_PATTERNS",
    "process_document_typing",
]
