"""
S5 Document Typing and Checklist Selection Engine (Guide §11.1).

Scores page 1 text and layout blocks against deterministic rules per document type.
Incorporate bounded slot prior, evidence grounding with bounding boxes,
and flags DOC_TYPE_SLOT_MISMATCH when detected type differs from declared slot.
"""

from dataclasses import dataclass, field
import re
from typing import Any


TAU_MIN = 0.50
DELTA = 0.10
SLOT_BONUS = 0.20

SLOT_MAP = {
    "fire_noc": "FIRE_NOC",
    "fire_safety": "FIRE_NOC",
    "noc": "FIRE_NOC",
    "accreditation": "ACCREDITATION",
    "nba": "ACCREDITATION",
    "naac": "ACCREDITATION",
    "eoa_letter": "EOA_LETTER",
    "eoa": "EOA_LETTER",
    "approval_letter": "EOA_LETTER",
    "affidavit": "AFFIDAVIT",
    "affidavit_1": "AFFIDAVIT",
    "affidavit_2": "AFFIDAVIT",
    "building_plan": "BUILDING_PLAN",
    "site_plan": "BUILDING_PLAN",
    "floor_plan": "BUILDING_PLAN",
    "building_completion": "BUILDING_COMPLETION",
    "occupancy_certificate": "BUILDING_COMPLETION",
    "land_documents": "LAND_DOCUMENTS",
    "sale_deed": "LAND_DOCUMENTS",
    "land_doc": "LAND_DOCUMENTS",
    "faculty_list": "FACULTY_LIST",
    "faculty": "FACULTY_LIST",
}

TYPE_PATTERNS: dict[str, list[dict[str, Any]]] = {
    "FIRE_NOC": [
        {"pattern": "fire safety certificate", "weight": 0.45, "type": "phrase"},
        {"pattern": "no objection certificate", "weight": 0.40, "type": "phrase"},
        {"pattern": "fire and rescue", "weight": 0.35, "type": "phrase"},
        {"pattern": "fire services department", "weight": 0.35, "type": "phrase"},
        {"pattern": "fire prevention", "weight": 0.30, "type": "phrase"},
        {"pattern": "fire fighting", "weight": 0.30, "type": "phrase"},
        {"pattern": "fire noc", "weight": 0.35, "type": "phrase"},
        {"pattern": "validity of fire", "weight": 0.25, "type": "phrase"},
        {"pattern": "station fire officer", "weight": 0.25, "type": "phrase"},
        {"pattern": "chief fire officer", "weight": 0.25, "type": "phrase"},
        {"pattern": r"(?i)fire\s*safety", "weight": 0.35, "type": "regex"},
        {"pattern": r"(?i)no\s*objection\s*certificate", "weight": 0.35, "type": "regex"},
        {"pattern": r"(?i)certificate\s*no\.?[:\s]*[A-Z0-9/\-]{4,30}", "weight": 0.25, "type": "regex"},
    ],
    "ACCREDITATION": [
        {"pattern": "national board of accreditation", "weight": 0.50, "type": "phrase"},
        {"pattern": "nba", "weight": 0.30, "type": "phrase"},
        {"pattern": "accreditation status", "weight": 0.40, "type": "phrase"},
        {"pattern": "tier-i", "weight": 0.30, "type": "phrase"},
        {"pattern": "tier-ii", "weight": 0.30, "type": "phrase"},
        {"pattern": "accredited programmes", "weight": 0.35, "type": "phrase"},
        {"pattern": "valid up to", "weight": 0.25, "type": "phrase"},
        {"pattern": "national assessment and accreditation council", "weight": 0.45, "type": "phrase"},
        {"pattern": "naac", "weight": 0.30, "type": "phrase"},
        {"pattern": r"(?i)national\s*board\s*of\s*accreditation", "weight": 0.45, "type": "regex"},
        {"pattern": r"(?i)accreditation\s*status", "weight": 0.35, "type": "regex"},
        {"pattern": r"(?i)file\s*no\.?[:\s]*[A-Z0-9/\-]{4,30}", "weight": 0.20, "type": "regex"},
    ],
    "EOA_LETTER": [
        {"pattern": "extension of approval", "weight": 0.50, "type": "phrase"},
        {"pattern": "all india council for technical education", "weight": 0.45, "type": "phrase"},
        {"pattern": "aicte", "weight": 0.35, "type": "phrase"},
        {"pattern": "approved intake", "weight": 0.40, "type": "phrase"},
        {"pattern": "academic year", "weight": 0.25, "type": "phrase"},
        {"pattern": "sub: extension of approval", "weight": 0.50, "type": "phrase"},
        {"pattern": r"(?i)extension\s*of\s*approval", "weight": 0.45, "type": "regex"},
        {"pattern": r"(?i)f\.?\s*no\.?[:\s]*[A-Z0-9/\-\.]{4,35}", "weight": 0.30, "type": "regex"},
        {"pattern": r"(?i)approved\s*intake", "weight": 0.30, "type": "regex"},
    ],
    "AFFIDAVIT": [
        {"pattern": "affidavit", "weight": 0.50, "type": "phrase"},
        {"pattern": "solemnly affirm", "weight": 0.45, "type": "phrase"},
        {"pattern": "non-judicial", "weight": 0.40, "type": "phrase"},
        {"pattern": "deponent", "weight": 0.35, "type": "phrase"},
        {"pattern": "oath commissioner", "weight": 0.35, "type": "phrase"},
        {"pattern": "notary public", "weight": 0.30, "type": "phrase"},
        {"pattern": "sworn before me", "weight": 0.30, "type": "phrase"},
        {"pattern": "verified at", "weight": 0.25, "type": "phrase"},
        {"pattern": r"(?i)solemnly\s*affirm", "weight": 0.40, "type": "regex"},
        {"pattern": r"(?i)i,\s*[^,\n]+,\s*(?:son|daughter|wife)\s*of", "weight": 0.35, "type": "regex"},
    ],
    "BUILDING_PLAN": [
        {"pattern": "building plan", "weight": 0.45, "type": "phrase"},
        {"pattern": "site plan", "weight": 0.45, "type": "phrase"},
        {"pattern": "floor plan", "weight": 0.40, "type": "phrase"},
        {"pattern": "carpet area", "weight": 0.30, "type": "phrase"},
        {"pattern": "built up area", "weight": 0.30, "type": "phrase"},
        {"pattern": "registered architect", "weight": 0.35, "type": "phrase"},
    ],
    "BUILDING_COMPLETION": [
        {"pattern": "building completion certificate", "weight": 0.50, "type": "phrase"},
        {"pattern": "occupancy certificate", "weight": 0.45, "type": "phrase"},
        {"pattern": "completion certificate", "weight": 0.40, "type": "phrase"},
        {"pattern": "structural stability certificate", "weight": 0.40, "type": "phrase"},
    ],
    "LAND_DOCUMENTS": [
        {"pattern": "sale deed", "weight": 0.45, "type": "phrase"},
        {"pattern": "gift deed", "weight": 0.40, "type": "phrase"},
        {"pattern": "khasra", "weight": 0.40, "type": "phrase"},
        {"pattern": "khata", "weight": 0.40, "type": "phrase"},
        {"pattern": "sub-registrar", "weight": 0.35, "type": "phrase"},
        {"pattern": "patta", "weight": 0.30, "type": "phrase"},
        {"pattern": "land conversion", "weight": 0.35, "type": "phrase"},
    ],
    "FACULTY_LIST": [
        {"pattern": "faculty list", "weight": 0.50, "type": "phrase"},
        {"pattern": "cadre ratio", "weight": 0.40, "type": "phrase"},
        {"pattern": "assistant professor", "weight": 0.35, "type": "phrase"},
        {"pattern": "associate professor", "weight": 0.35, "type": "phrase"},
        {"pattern": "professor", "weight": 0.30, "type": "phrase"},
        {"pattern": "date of joining", "weight": 0.25, "type": "phrase"},
    ],
}


@dataclass
class TypingEvidence:
    phrase: str
    pattern: str
    weight: float
    block_id: str | None = None
    bbox_norm: list[float] | None = None


@dataclass
class DocumentTypeResult:
    application_id: str
    document_id: str
    doc_type: str
    confidence: float
    is_classified: bool
    decision_reason: str
    doc_slot: str | None = None
    pipeline_stage: str = "S5_TYPING"
    evidence: list[TypingEvidence] = field(default_factory=list)
    candidate_scores: dict[str, float] = field(default_factory=dict)
    flags: list[dict[str, Any]] = field(default_factory=list)
    simulated: bool = True
    advisory: bool = True

    def to_dict(self) -> dict[str, Any]:
        return {
            "application_id": self.application_id,
            "document_id": self.document_id,
            "doc_slot": self.doc_slot,
            "doc_type": self.doc_type,
            "confidence": self.confidence,
            "is_classified": self.is_classified,
            "decision_reason": self.decision_reason,
            "pipeline_stage": self.pipeline_stage,
            "evidence": [
                {
                    "phrase": e.phrase,
                    "pattern": e.pattern,
                    "weight": e.weight,
                    "block_id": e.block_id,
                    "bbox_norm": e.bbox_norm,
                }
                for e in self.evidence
            ],
            "candidate_scores": self.candidate_scores,
            "flags": self.flags,
            "simulated": self.simulated,
            "advisory": self.advisory,
        }


def classify_document(
    application_id: str,
    document_id: str,
    page_1_text: str,
    page_1_blocks: list[dict[str, Any]] | None = None,
    doc_slot: str | None = None,
) -> DocumentTypeResult:
    """
    Classify document type using page 1 text, layout blocks, and bounded slot prior.
    Follows Guide §11.1 decision criteria.
    """
    blocks = page_1_blocks or []
    normalized_slot = SLOT_MAP.get(doc_slot.strip().lower()) if doc_slot else None
    
    scores: dict[str, float] = {}
    evidence_by_type: dict[str, list[TypingEvidence]] = {}

    lower_text = page_1_text.lower()

    for dtype, rules in TYPE_PATTERNS.items():
        type_score = 0.0
        ev_list: list[TypingEvidence] = []
        
        # Bounded slot prior (Guide §11.1 #2)
        if normalized_slot and dtype == normalized_slot:
            type_score += SLOT_BONUS

        for rule in rules:
            pat = rule["pattern"]
            weight = rule["weight"]
            p_type = rule["type"]

            matched = False
            matched_phrase = ""

            if p_type == "phrase":
                if pat.lower() in lower_text:
                    matched = True
                    matched_phrase = pat
            elif p_type == "regex":
                m = re.search(pat, page_1_text)
                if m:
                    matched = True
                    matched_phrase = m.group(0)

            if matched:
                type_score += weight
                
                # Ground to block if available
                matched_block_id = None
                matched_bbox = None
                for b in blocks:
                    b_text = b.get("text", "")
                    if matched_phrase.lower() in b_text.lower():
                        matched_block_id = b.get("id")
                        matched_bbox = b.get("bbox_norm")
                        break

                ev_list.append(TypingEvidence(
                    phrase=matched_phrase,
                    pattern=pat,
                    weight=weight,
                    block_id=matched_block_id,
                    bbox_norm=matched_bbox
                ))

        scores[dtype] = round(type_score, 3)
        evidence_by_type[dtype] = ev_list

    # Sort candidate scores descending
    sorted_candidates = sorted(scores.items(), key=lambda x: x[1], reverse=True)
    top_type, top_score = sorted_candidates[0]
    second_score = sorted_candidates[1][1] if len(sorted_candidates) > 1 else 0.0

    # Guide §11.1 #4: Decision rule: top >= tau_min and top - second >= delta
    if top_score >= TAU_MIN and (top_score - second_score) >= DELTA:
        accepted_type = top_type
        is_classified = True
        
        # Normalised confidence calibration matching Guide §11.1 & Appendix B
        raw_ratio = top_score / (top_score + max(0.05, second_score))
        confidence = min(0.98, max(0.65, round(raw_ratio, 2)))
        reason = (
            f"Classified as '{accepted_type}' with score {top_score:.2f} "
            f"(margin {top_score - second_score:.2f} over second candidate)."
        )
    else:
        accepted_type = "UNCLASSIFIED"
        is_classified = False
        confidence = min(0.49, max(0.0, round(top_score / 2.0, 2)))
        reason = (
            f"Document unclassified: top score {top_score:.2f} did not meet acceptance threshold "
            f"(tau_min={TAU_MIN}, delta={DELTA}); manual typing task required."
        )

    # Check for slot mismatch (Guide §11.1 #5)
    flags: list[dict[str, Any]] = []
    if normalized_slot and is_classified and accepted_type != normalized_slot:
        if confidence >= 0.70:
            flags.append({
                "code": "DOC_TYPE_SLOT_MISMATCH",
                "severity": "medium",
                "advisory": True,
                "requires_human_review": True,
                "message": (
                    f"Preliminary indicator requiring human verification: Document content appears to be "
                    f"'{accepted_type}' (confidence {confidence}), which does not match declared slot '{doc_slot}'."
                ),
                "evidence": {
                    "detected_type": accepted_type,
                    "declared_slot": doc_slot,
                    "confidence": confidence,
                    "top_evidence_phrases": [e.phrase for e in evidence_by_type.get(accepted_type, [])[:3]],
                }
            })

    return DocumentTypeResult(
        application_id=application_id,
        document_id=document_id,
        doc_slot=doc_slot,
        doc_type=accepted_type,
        confidence=confidence,
        is_classified=is_classified,
        decision_reason=reason,
        evidence=evidence_by_type.get(accepted_type, []) if is_classified else [],
        candidate_scores=scores,
        flags=flags,
        simulated=True,
        advisory=True
    )
