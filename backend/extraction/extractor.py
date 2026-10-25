"""
S6 Schema-Driven Field Extractor and Completeness Engine (Guide §11.2).

Loads YAML field schemas from rules/schemas/<DOC_TYPE>.yaml.
Executes regex and layout-based field extraction on C1 unified payload blocks.
Enforces explicit date policy, ID patterns, and completeness requirements.
Grounds every field to block and word coordinates via S6b grounding.
"""

from datetime import date
import os
import re
from typing import Any
import yaml

from backend.extraction.date_parser import parse_date
from backend.extraction.grounding import ground


SCHEMA_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../rules/schemas"))
EXTRACTOR_VERSION = "4.0.0"


def load_doc_schema(doc_type: str) -> dict[str, Any] | None:
    """Load schema YAML for a given document type."""
    path = os.path.join(SCHEMA_DIR, f"{doc_type.upper()}.yaml")
    if not os.path.exists(path):
        return None
    try:
        with open(path, "r", encoding="utf-8") as f:
            return yaml.safe_load(f)
    except Exception:
        return None


def extract_field_by_patterns(
    key: str,
    f_type: str,
    pattern_regex: str | None,
    blocks: list[dict[str, Any]],
    raw_text: str,
) -> tuple[str | None, str | None, str | None]:
    """
    Search blocks and raw text for a field.
    Returns: (raw_value, matched_block_id, matched_quote).
    """
    # 1. Custom extractors by field key
    field_patterns: dict[str, list[str]] = {
        "valid_till": [
            r"(?i)(?:valid\s*till|valid\s*up\s*to|validity\s*period|date\s*of\s*expiry|expiry\s*date)[:\s]+([^\n,;]{4,30})",
            r"(?i)(?:valid\s*upto|validity)[:\s]+([^\n,;]{4,30})",
            r"(?i)(?:period\s*of\s*validity\s*is\s*up\s*to)[:\s]+([^\n,;]{4,30})",
        ],
        "issued_on": [
            r"(?i)(?:issued\s*on|date\s*of\s*issue|dated)[:\s]+([^\n,;]{4,30})",
            r"(?i)(?:date)[:\s]+(\d{1,2}[./-]\d{1,2}[./-]\d{4})",
        ],
        "sworn_date": [
            r"(?i)(?:sworn|verified|affirmed|dated)[:\s]+(?:on\s+)?([^\n,;]{4,30})",
        ],
        "certificate_no": [
            r"(?i)(?:certificate\s*no\.?|cert\s*no\.?|reference\s*no\.?|ref\s*no\.?)[:\s.]+([A-Z0-9/\-]{4,35})",
            r"(?i)(?:noc\s*no\.?)[:\s.]+([A-Z0-9/\-]{4,35})",
        ],
        "file_no": [
            r"(?i)(?:file\s*no\.?|f\.?\s*no\.?)[:\s.]+([A-Z0-9/\-\.]{4,35})",
        ],
        "application_id": [
            r"(?i)(?:application\s*(?:id|no\.?)|app\s*id)[:\s.]+([A-Z0-9/\-\.]{4,35})",
            r"(?i)(?:f\.?\s*no\.?)[:\s.]+([A-Z0-9/\-\.]{4,35})",
        ],
        "institution_name": [
            r"(?i)(?:name\s*of\s*(?:the\s*)?institution|institute\s*name|college\s*name|issued\s*to|granted\s*to)[:\s]+([^\n,;]+)",
            r"(?i)(?:premises\s*of)[:\s]+([^\n,;]+)",
        ],
        "deponent_name": [
            r"(?i)(?:i,\s*([A-Za-z\s.]+?),\s*(?:son|daughter|wife|aged|deponent))",
            r"(?i)(?:deponent)[:\s]+([A-Za-z\s.]+)",
        ],
        "approved_intake": [
            r"(?i)(?:approved\s*intake|total\s*intake|sanctioned\s*intake)[:\s]+(\d+)",
        ],
        "academic_year": [
            r"(?i)(?:academic\s*year)[:\s]+([0-9]{4}[-\s/][0-9]{2,4})",
            r"(?i)(?:for\s*the\s*year)[:\s]+([0-9]{4}[-\s/][0-9]{2,4})",
        ],
        "accreditation_status": [
            r"(?i)(?:accreditation\s*status|status)[:\s]+([A-Za-z0-9\s\-]+)",
            r"(?i)(tier-[iI]+(?:\s*accredited)?)",
            r"(?i)(accredited|provisionally\s*accredited)",
        ],
        "issuing_authority": [
            r"(?i)(?:issuing\s*authority|issued\s*by)[:\s]+([^\n,]+)",
            r"(?i)(chief\s*fire\s*officer|station\s*fire\s*officer|director\s*of\s*fire\s*services)",
        ],
    }

    pats = field_patterns.get(key, [])
    if pattern_regex:
        pats.append(pattern_regex)

    # Search block by block first for accurate provenance
    for b in blocks:
        b_text = b.get("text", "")
        for pat in pats:
            m = re.search(pat, b_text)
            if m:
                raw_val = m.group(1).strip() if m.lastindex and m.lastindex >= 1 else m.group(0).strip()
                # Clean trailing punctuation
                raw_val = raw_val.strip(".,;: ")
                if raw_val:
                    return raw_val, b.get("id"), m.group(0).strip()

    # Fallback search across full text
    for pat in pats:
        m = re.search(pat, raw_text)
        if m:
            raw_val = m.group(1).strip() if m.lastindex and m.lastindex >= 1 else m.group(0).strip()
            raw_val = raw_val.strip(".,;: ")
            if raw_val:
                # Find matching block
                matched_bid = None
                for b in blocks:
                    if raw_val.lower() in b.get("text", "").lower():
                        matched_bid = b.get("id")
                        break
                return raw_val, matched_bid, m.group(0).strip()

    # Specialized fallback for institution_name: look for prominent institute words
    if key == "institution_name":
        inst_pat = r"([A-Z][A-Za-z0-9\s&.,'-]+(?:Institute|College|University|Academy|Polytechnic)[A-Za-z0-9\s&.,'-]*)"
        for b in blocks:
            m = re.search(inst_pat, b.get("text", ""))
            if m:
                val = m.group(1).strip().strip(".,;: ")
                if len(val) >= 10:
                    return val, b.get("id"), m.group(0).strip()

    return None, None, None


def extract_document_fields(
    application_id: str,
    document_id: str,
    doc_type: str,
    c1_payload: dict[str, Any],
    original_pdf_bytes: bytes | None = None,
) -> dict[str, Any]:
    """
    Extract fields according to doc_type schema and ground each field (Guide §11.2, §11.3).
    Returns dictionary with extracted facts, completeness status, and missing fields.
    """
    schema = load_doc_schema(doc_type)
    if not schema:
        return {
            "application_id": application_id,
            "document_id": document_id,
            "doc_type": doc_type,
            "completeness_status": "NOT_CHECKED",
            "reason": f"No field schema found for document type '{doc_type}'",
            "missing_fields": [],
            "facts": [],
            "pipeline_stage": "S6_EXTRACTION"
        }

    schema_fields = schema.get("fields", [])
    blocks = c1_payload.get("blocks", [])
    raw_text = c1_payload.get("markdown", "")

    facts: list[dict[str, Any]] = []
    missing_required: list[str] = []

    for f_spec in schema_fields:
        f_key = f_spec["key"]
        f_type = f_spec.get("type", "text")
        f_req = f_spec.get("required", False)
        f_pattern = f_spec.get("pattern")

        raw_val, block_id, quote = extract_field_by_patterns(
            key=f_key,
            f_type=f_type,
            pattern_regex=f_pattern,
            blocks=blocks,
            raw_text=raw_text
        )

        typed_val: Any = None
        parse_state = "ok"

        if raw_val is not None:
            # 1. Type normalization
            if f_type == "date":
                dt, d_state = parse_date(raw_val)
                if d_state == "ok" and dt is not None:
                    typed_val = dt.isoformat()
                    parse_state = "ok"
                elif d_state == "ambiguous":
                    typed_val = None
                    parse_state = "ambiguous"
                else:
                    typed_val = None
                    parse_state = "invalid"

            elif f_type == "id":
                typed_val = raw_val.strip()
                if f_pattern:
                    if not re.fullmatch(f_pattern, typed_val):
                        parse_state = "invalid"

            elif f_type == "number":
                try:
                    num_match = re.search(r"\d+", raw_val)
                    if num_match:
                        typed_val = int(num_match.group(0))
                        parse_state = "ok"
                    else:
                        typed_val = None
                        parse_state = "invalid"
                except Exception:
                    typed_val = None
                    parse_state = "invalid"

            else:
                typed_val = raw_val.strip()
                parse_state = "ok"

            # 2. S6b Grounding (provenance first)
            ground_res = ground(
                raw=quote or raw_val,
                blocks=blocks,
                block_id=block_id,
                pdf_bytes=original_pdf_bytes
            )

            fact_id = f"fact_{document_id}_{f_key}"
            facts.append({
                "id": fact_id,
                "application_id": application_id,
                "document_id": document_id,
                "source": "doc",
                "entity": doc_type,
                "key": f_key,
                "raw": raw_val,
                "value_type": f_type if f_type != "id" and f_type != "name" and f_type != "text" else "string",
                "value": typed_val,
                "parse_state": parse_state,
                "conf": 1.0 if parse_state == "ok" else 0.5,
                "conf_kind": "regex_exact",
                "grounded": ground_res["grounded"],
                "source_ref": ground_res.get("source_ref"),
                "page": ground_res.get("page"),
                "bbox_norm": ground_res.get("bbox_norm"),
                "bbox_norm_json": ground_res.get("bbox_norm"),
                "bbox_precision": ground_res.get("bbox_precision"),
                "extractor": f"regex:{f_key}",
                "extractor_version": EXTRACTOR_VERSION,
                "needs_confirmation": parse_state != "ok",
                "simulated": True,
            })

            if f_req and (parse_state != "ok" or typed_val is None):
                missing_required.append(f_key)

        else:
            # Field was not extracted
            if f_req:
                missing_required.append(f_key)
            facts.append({
                "id": f"fact_{document_id}_{f_key}",
                "application_id": application_id,
                "document_id": document_id,
                "source": "doc",
                "entity": doc_type,
                "key": f_key,
                "raw": None,
                "value_type": f_type if f_type != "id" and f_type != "name" and f_type != "text" else "string",
                "value": None,
                "parse_state": "unavailable",
                "conf": 0.0,
                "conf_kind": "regex_exact",
                "grounded": False,
                "source_ref": None,
                "page": None,
                "bbox_norm": None,
                "bbox_norm_json": None,
                "bbox_precision": None,
                "extractor": f"regex:{f_key}",
                "extractor_version": EXTRACTOR_VERSION,
                "needs_confirmation": True,
                "simulated": True,
            })

    completeness_status = "COMPLETE" if not missing_required else "INCOMPLETE"

    return {
        "application_id": application_id,
        "document_id": document_id,
        "doc_type": doc_type,
        "completeness_status": completeness_status,
        "missing_fields": missing_required,
        "facts": facts,
        "pipeline_stage": "S6_EXTRACTION",
        "simulated": True,
        "advisory": True
    }
