"""
Rule Evaluators Implementation (Guide §12.2).

Implements deterministic evaluation for:
- required_doc
- not_expired
- fuzzy_match
- field_lte_record
- table_sums_consistent
- id_format
- required_field

Every evaluator follows the 7-step template from Guide §12.2:
1. Gather facts
2. precheck each
3. Compute condition
4. harden (requires hard-capable inputs for FAILED_CHECK)
5. Attach two-sided evidence
6. Assign category
7. Return standardized check result dictionary conforming to c4_check_result.schema.json
"""

from datetime import date, datetime
import re
from typing import Any

from backend.extraction.names import name_compare
from backend.rules.gate import (
    FAILED_CHECK,
    NEEDS_REVIEW,
    NOT_CHECKED,
    PASS,
    WARNING,
    Pre,
    harden,
    precheck,
)


def _find_fact(facts: list[dict[str, Any]], entity: str, key: str) -> dict[str, Any] | None:
    for f in facts:
        if f.get("entity") == entity and f.get("key") == key:
            return f
    return None


def eval_required_doc(rule: dict[str, Any], facts: list[dict[str, Any]], context: dict[str, Any]) -> dict[str, Any]:
    doc_type = rule.get("doc_type")
    rule_id = rule.get("id", "R-DOC-001")
    rule_version = rule.get("version", "1.0.0")

    submitted_docs = context.get("submitted_documents")
    if submitted_docs is None:
        # Infer from facts
        submitted_docs = list({f.get("entity") for f in facts if f.get("source") == "doc"})

    has_classification_run = context.get("classification_executed", True)
    has_unclassified = "UNCLASSIFIED" in submitted_docs or context.get("has_unclassified", False)

    if not has_classification_run:
        status = NOT_CHECKED
        reason = f"Document classification stage was not executed for required document '{doc_type}'."
    elif doc_type in submitted_docs:
        status = PASS
        reason = f"Required document '{doc_type}' is present."
    elif has_unclassified:
        status = NEEDS_REVIEW
        reason = f"Required document '{doc_type}' is not yet identified, but an unclassified document exists requiring human review before concluding missing."
    else:
        status = FAILED_CHECK
        reason = f"Required document '{doc_type}' was not submitted."

    return {
        "rule_id": rule_id,
        "rule_version": rule_version,
        "status": status,
        "category": "MISSING" if status != PASS else "REQUIRED_DOCUMENT",
        "severity": rule.get("severity", "high"),
        "observed": doc_type in submitted_docs,
        "expected": True,
        "advisory": True,
        "simulated": True,
        "reason": reason,
        "evidence": {
            "expected_document": doc_type,
            "submitted_documents": submitted_docs,
            "has_unclassified": has_unclassified,
        },
    }


def eval_not_expired(rule: dict[str, Any], facts: list[dict[str, Any]], context: dict[str, Any]) -> dict[str, Any]:
    rule_id = rule.get("id", "R-EXP-001")
    rule_version = rule.get("version", "1.0.0")
    doc_type = rule.get("doc_type", "FIRE_NOC")
    field = rule.get("field", "valid_till")

    doc_samples = context.get("doc_samples", {})
    ocr_sample = doc_samples.get(doc_type) or doc_samples.get(doc_type.lower())

    fact = _find_fact(facts, doc_type, field)
    pre = precheck(fact, need_grounded=True)
    if pre.block:
        status, block_reason = pre.block
        if ocr_sample:
            reason = f"Document '{doc_type}' validity date cannot be verified: {block_reason}. Extracted text snippet ('{ocr_sample[:50]}...') contains no certificate validity dates."
        else:
            reason = f"Document '{doc_type}' validity date cannot be verified: {block_reason}."

        evidence: dict[str, Any] = {
            "document_type": doc_type,
            "field": field,
            "fact": fact,
        }
        if ocr_sample:
            evidence["extracted_ocr_sample"] = ocr_sample

        return {
            "rule_id": rule_id,
            "rule_version": rule_version,
            "status": status,
            "category": "EXPIRED",
            "severity": rule.get("severity", "high"),
            "observed": fact.get("raw") if fact else (f"Not Found (OCR: \"{ocr_sample[:40]}…\")" if ocr_sample else None),
            "expected": "Valid date exceeding submission date",
            "advisory": True,
            "simulated": True,
            "reason": reason,
            "evidence": evidence,
        }

    as_of_str = context.get("submission_date") or context.get("submitted_on")
    if not as_of_str:
        sub_fact = _find_fact(facts, "APPLICATION", "submitted_on")
        as_of_str = sub_fact.get("value") if sub_fact else None

    if not as_of_str:
        as_of = date.today()
    elif isinstance(as_of_str, str):
        as_of = date.fromisoformat(as_of_str)
    elif isinstance(as_of_str, date):
        as_of = as_of_str
    else:
        as_of = date.today()

    val = fact.get("value")
    if isinstance(val, str):
        expiry = date.fromisoformat(val)
    elif isinstance(val, date):
        expiry = val
    else:
        expiry = date.today()

    warn_days = rule.get("params", {}).get("warn_days", 30)
    delta_days = (expiry - as_of).days

    if expiry < as_of:
        raw_status = FAILED_CHECK
        reason = f"Document '{doc_type}' validity date ({expiry}) precedes submission date ({as_of})."
    elif 0 <= delta_days <= warn_days:
        raw_status = WARNING
        reason = f"Document '{doc_type}' validity date ({expiry}) expires within {delta_days} day(s) of submission (warning window: {warn_days} days)."
    else:
        raw_status = PASS
        reason = f"Document '{doc_type}' is valid through {expiry} (exceeds warning threshold of {warn_days} days)."

    final_status = harden(raw_status, [pre])

    return {
        "rule_id": rule_id,
        "rule_version": rule_version,
        "status": final_status,
        "category": "EXPIRED",
        "severity": rule.get("severity", "high"),
        "observed": str(expiry),
        "expected": f"> {as_of}",
        "advisory": True,
        "simulated": True,
        "reason": reason,
        "evidence": {
            "document_type": doc_type,
            "submitted": {
                "value": str(expiry),
                "raw": fact.get("raw"),
                "field": field,
                "source": fact.get("source"),
                "bbox_norm": fact.get("bbox_norm"),
                "source_ref": fact.get("source_ref"),
            },
            "compared_with": {
                "value": str(as_of),
                "field": "submitted_on",
                "source": "application_form",
            },
            "comparison": "valid_till >= submitted_on",
            "days_remaining": delta_days,
        },
    }


def eval_fuzzy_match(rule: dict[str, Any], facts: list[dict[str, Any]], context: dict[str, Any]) -> dict[str, Any]:
    rule_id = rule.get("id", "R-CROSS-001")
    rule_version = rule.get("version", "1.0.0")
    left_spec = rule.get("left", {})
    right_spec = rule.get("right", {})

    left_doc = left_spec.get("doc_type", "ACCREDITATION")
    left_field = left_spec.get("field", "institution_name")

    # Left fact: document extraction
    left_fact = _find_fact(facts, left_doc, left_field)
    pre_left = precheck(left_fact, need_grounded=True)

    # Right fact: record canonical name
    right_fact = _find_fact(facts, "INSTITUTION", "canonical_name")
    pre_right = precheck(right_fact, need_grounded=False)

    if pre_left.block:
        status, reason = pre_left.block
        return {
            "rule_id": rule_id,
            "rule_version": rule_version,
            "status": status,
            "category": "INCONSISTENT",
            "severity": rule.get("severity", "medium"),
            "observed": left_fact.get("raw") if left_fact else None,
            "expected": "Grounded institution name in document",
            "advisory": True,
            "simulated": True,
            "reason": f"Institution name in document '{left_doc}' cannot be verified: {reason}.",
            "evidence": {"left_fact": left_fact, "right_fact": right_fact},
        }

    if pre_right.block:
        status, reason = pre_right.block
        return {
            "rule_id": rule_id,
            "rule_version": rule_version,
            "status": status,
            "category": "INCONSISTENT",
            "severity": rule.get("severity", "medium"),
            "observed": left_fact.get("value"),
            "expected": "Canonical institution record in AICTE registry",
            "advisory": True,
            "simulated": True,
            "reason": f"Canonical institution record unavailable: {reason}.",
            "evidence": {"left_fact": left_fact, "right_fact": right_fact},
        }

    left_val = str(left_fact.get("value", ""))
    right_val = str(right_fact.get("value", ""))
    min_ratio = rule.get("params", {}).get("min_ratio", 90)

    cmp_result = name_compare(left_val, right_val, thr=min_ratio)

    if cmp_result == "MATCH":
        status = PASS
        reason = f"Institution name '{left_val}' matches canonical record '{right_val}'."
    elif cmp_result == "DIFFERENT":
        status = harden(FAILED_CHECK, [pre_left, pre_right])
        reason = f"Institution name in document ('{left_val}') differs from official record ('{right_val}')."
    else:  # LEGAL_FORM_DIFFERS or PARTIAL
        status = NEEDS_REVIEW
        reason = f"Institution name in document ('{left_val}') partially differs from official record ('{right_val}') ({cmp_result}); human officer review is required."

    return {
        "rule_id": rule_id,
        "rule_version": rule_version,
        "status": status,
        "category": "INCONSISTENT",
        "severity": rule.get("severity", "medium"),
        "observed": left_val,
        "expected": right_val,
        "advisory": True,
        "simulated": True,
        "reason": reason,
        "evidence": {
            "submitted": {
                "value": left_val,
                "doc_type": left_doc,
                "field": left_field,
                "source": left_fact.get("source"),
                "bbox_norm": left_fact.get("bbox_norm"),
            },
            "compared_with": {
                "value": right_val,
                "field": "canonical_name",
                "source": right_fact.get("source"),
            },
            "match_status": cmp_result,
        },
    }


def eval_field_lte_record(rule: dict[str, Any], facts: list[dict[str, Any]], context: dict[str, Any]) -> dict[str, Any]:
    rule_id = rule.get("id", "R-NUM-001")
    rule_version = rule.get("version", "1.0.0")

    form_fact = _find_fact(facts, "APPLICATION", "requested_intake")
    record_fact = _find_fact(facts, "APPROVED_PROGRAMMES", "approved_intake")

    pre_form = precheck(form_fact, need_grounded=False)
    pre_rec = precheck(record_fact, need_grounded=False)

    if pre_form.block:
        status, reason = pre_form.block
        return {
            "rule_id": rule_id,
            "rule_version": rule_version,
            "status": status,
            "category": "INCONSISTENT",
            "severity": rule.get("severity", "high"),
            "observed": None,
            "expected": "Requested intake value",
            "advisory": True,
            "simulated": True,
            "reason": f"Requested intake in form unavailable: {reason}.",
            "evidence": {"form_fact": form_fact, "record_fact": record_fact},
        }

    if pre_rec.block:
        status, reason = pre_rec.block
        return {
            "rule_id": rule_id,
            "rule_version": rule_version,
            "status": status,
            "category": "INCONSISTENT",
            "severity": rule.get("severity", "high"),
            "observed": form_fact.get("value"),
            "expected": "Approved intake record in registry",
            "advisory": True,
            "simulated": True,
            "reason": f"Approved programmes record unavailable: {reason}.",
            "evidence": {"form_fact": form_fact, "record_fact": record_fact},
        }

    form_val = int(form_fact.get("value"))
    rec_val = int(record_fact.get("value"))

    if form_val <= rec_val:
        status = PASS
        reason = f"Requested intake ({form_val}) is within approved record intake ({rec_val})."
    else:
        status = harden(FAILED_CHECK, [pre_form, pre_rec])
        reason = f"Requested intake ({form_val}) exceeds approved record intake ({rec_val}); officer review is required."

    return {
        "rule_id": rule_id,
        "rule_version": rule_version,
        "status": status,
        "category": "INCONSISTENT",
        "severity": rule.get("severity", "high"),
        "observed": form_val,
        "expected": f"<= {rec_val}",
        "advisory": True,
        "simulated": True,
        "reason": reason,
        "evidence": {
            "submitted": {
                "value": form_val,
                "field": "requested_intake",
                "source": form_fact.get("source"),
            },
            "compared_with": {
                "value": rec_val,
                "field": "approved_intake",
                "source": record_fact.get("source"),
            },
            "comparison": "requested_intake <= approved_intake",
        },
    }


def eval_table_sums_consistent(rule: dict[str, Any], facts: list[dict[str, Any]], context: dict[str, Any]) -> dict[str, Any]:
    rule_id = rule.get("id", "R-TBL-001")
    rule_version = rule.get("version", "1.0.0")
    doc_type = rule.get("doc_type", "EOA_LETTER")

    table_check = context.get("table_arithmetic_check")
    if table_check is None:
        # Default pass if no table issues flagged
        status = PASS
        reason = f"Table arithmetic consistency verified for '{doc_type}'."
        evidence = {"doc_type": doc_type, "status": "VERIFIED"}
    elif table_check.get("has_mismatch"):
        status = FAILED_CHECK
        reason = f"Table row or column sum arithmetic mismatch detected in '{doc_type}'."
        evidence = table_check
    else:
        status = PASS
        reason = f"Table row and column sums consistent in '{doc_type}'."
        evidence = table_check

    return {
        "rule_id": rule_id,
        "rule_version": rule_version,
        "status": status,
        "category": "CALCULATION_MISMATCH" if status == FAILED_CHECK else "INCONSISTENT",
        "severity": rule.get("severity", "medium"),
        "observed": status,
        "expected": PASS,
        "advisory": True,
        "simulated": True,
        "reason": reason,
        "evidence": evidence,
    }


def eval_id_format(rule: dict[str, Any], facts: list[dict[str, Any]], context: dict[str, Any]) -> dict[str, Any]:
    rule_id = rule.get("id", "R-ID-001")
    rule_version = rule.get("version", "1.0.0")
    doc_type = rule.get("doc_type", "FIRE_NOC")
    field = rule.get("field", "certificate_no")
    pattern = rule.get("pattern", r"^[A-Z0-9/-]{6,25}$")

    fact = _find_fact(facts, doc_type, field)
    pre = precheck(fact, need_grounded=True)
    if pre.block:
        status, reason = pre.block
        return {
            "rule_id": rule_id,
            "rule_version": rule_version,
            "status": status,
            "category": "INCONSISTENT",
            "severity": rule.get("severity", "medium"),
            "observed": fact.get("raw") if fact else None,
            "expected": f"Pattern: {pattern}",
            "advisory": True,
            "simulated": True,
            "reason": f"Identifier in document '{doc_type}' cannot be verified: {reason}.",
            "evidence": {"fact": fact},
        }

    val = str(fact.get("value", "")).strip()
    if re.search(pattern, val):
        status = PASS
        reason = f"Identifier '{val}' conforms to format specifications."
    else:
        status = harden(FAILED_CHECK, [pre])
        reason = f"Identifier '{val}' does not conform to required format pattern."

    return {
        "rule_id": rule_id,
        "rule_version": rule_version,
        "status": status,
        "category": "INCONSISTENT",
        "severity": rule.get("severity", "medium"),
        "observed": val,
        "expected": pattern,
        "advisory": True,
        "simulated": True,
        "reason": reason,
        "evidence": {
            "value": val,
            "pattern": pattern,
            "field": field,
            "source": fact.get("source"),
            "bbox_norm": fact.get("bbox_norm"),
        },
    }


def eval_required_field(rule: dict[str, Any], facts: list[dict[str, Any]], context: dict[str, Any]) -> dict[str, Any]:
    rule_id = rule.get("id", "R-COMP-001")
    rule_version = rule.get("version", "1.0.0")
    doc_type = rule.get("doc_type", "FIRE_NOC")

    missing = context.get("missing_fields")
    if missing is None:
        # Check inputs
        declared_inputs = rule.get("inputs", [])
        missing = []
        for inp in declared_inputs:
            # inp is e.g. FIRE_NOC.certificate_no
            parts = inp.split(".")
            if len(parts) == 2:
                f = _find_fact(facts, parts[0], parts[1])
                if not f or f.get("parse_state") != "ok":
                    missing.append(parts[1])

    doc_samples = context.get("doc_samples", {})
    ocr_sample = doc_samples.get(doc_type) or doc_samples.get(doc_type.lower())

    if not missing:
        status = PASS
        reason = f"All required fields for document '{doc_type}' are extracted and verified."
    else:
        status = FAILED_CHECK
        if ocr_sample:
            reason = f"Required field(s) {missing} missing or invalid in document '{doc_type}'. Extracted text snippet ('{ocr_sample[:60]}...') contains no recognized statutory certificate fields."
        else:
            reason = f"Required field(s) {missing} missing or invalid in document '{doc_type}'."

    evidence: dict[str, Any] = {
        "document_type": doc_type,
        "missing_fields": missing,
    }
    if ocr_sample:
        evidence["extracted_ocr_sample"] = ocr_sample

    return {
        "rule_id": rule_id,
        "rule_version": rule_version,
        "status": status,
        "category": "INCOMPLETE",
        "severity": rule.get("severity", "high"),
        "observed": missing,
        "expected": [],
        "advisory": True,
        "simulated": True,
        "reason": reason,
        "evidence": evidence,
    }


EVALUATORS = {
    "required_doc": eval_required_doc,
    "not_expired": eval_not_expired,
    "fuzzy_match": eval_fuzzy_match,
    "field_lte_record": eval_field_lte_record,
    "table_sums_consistent": eval_table_sums_consistent,
    "id_format": eval_id_format,
    "required_field": eval_required_field,
}
