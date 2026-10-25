"""
Officer Exports & Application Reporting Module (Guide §11.8, S12).

Produces:
1. Deficiency Notice (Draft): Non-accusatory notice to institution with two-sided evidence for open rectifiable findings.
2. Inspection Brief (Internal): Ground verification briefing for physical inspection teams.
3. Application Report: Comprehensive evaluation audit report with checklist, findings, and cryptographic chain head.
"""

from datetime import datetime, timezone
from typing import Any
import uuid

from backend.audit.chain import get_last_audit_event, GENESIS
from backend.db.connection import Database, db as default_db
from backend.db.repository import (
    get_uploads_by_application,
    get_verifications_by_application,
    get_finding_actions_by_app,
)
from backend.rules.evaluate import validate_persisted_application
from backend.infra.service import evaluate_application_infra

RECTIFIABLE_CATEGORIES = {
    "MISSING",
    "INCOMPLETE",
    "EXPIRED",
    "INCONSISTENT",
    "COMPLIANCE_GAP",
    "MISSING_DOCUMENT",
    "EXPIRED_CERTIFICATE",
    "NAME_MISMATCH",
    "INTAKE_EXCEEDED",
    "INSUFFICIENT_AREA",
}

INTERNAL_OMISSION_PATTERNS = {
    "EDITING_TOOL",
    "METADATA",
    "INCREMENTAL_UPDATE",
    "FONT_CORRUPTION",
    "SIGNATURE_NOT_TRUSTED",
    "UNTRUSTED_ROOT",
    "C2_FORENSICS",
    "OCR_CONFIDENCE",
    "GEOTAG_METADATA_STRIPPED",
    "POSSIBLE_DUPLICATE_PHOTO",
    "POSSIBLE_DUPLICATE_EVIDENCE",
    "DUPLICATE_HASH",
    "PEER_MATCH",
    "HAMMING_DISTANCE",
    "PERCEPTUAL_HASH",
}


def generate_deficiency_notice(
    application_id: str,
    actor: str = "system",
    database: Database | None = None,
) -> dict[str, Any]:
    """
    Generate formal draft Deficiency Notice per Guide §11.8.
    Lists open rectifiable discrepancies with two-sided evidence.
    Strictly excludes internal anomaly flags, duplicate match identities, and mock source internals.
    """
    d = database or default_db
    now_iso = datetime.now(timezone.utc).isoformat()

    # 1. Run rules engine to extract current findings
    rule_report = validate_persisted_application(application_id, database=d)
    all_findings = rule_report.get("findings", [])

    # 2. Retrieve officer action overrides
    with d.connection() as conn:
        actions = get_finding_actions_by_app(conn, application_id, database=d)
    latest_states = {a["finding_id"]: a["new_state"] for a in actions}

    # 3. Filter open rectifiable findings (Step 44: Internal Tag Omission Filter)
    deficiencies = []
    for f in all_findings:
        f_id = f.get("id") or f.get("rule_id", "unknown")
        current_state = latest_states.get(f_id, f.get("lifecycle", "open"))

        # Skip dismissed or resolved findings (Step 44 Verification Requirement)
        if current_state in ("dismissed", "resolved"):
            continue

        # Skip internal forensic flags, duplicate identity hashes, or tamper signals (Guide §11.8)
        rule_str = str(f.get("rule_id", "")).upper()
        cat_str = str(f.get("category", "")).upper()
        flags_str = " ".join(str(fl).upper() for fl in f.get("flags", []))
        reason_str = str(f.get("reason", "")).upper()

        if any(pat in rule_str or pat in cat_str or pat in flags_str or pat in reason_str for pat in INTERNAL_OMISSION_PATTERNS):
            continue

        cat = str(f.get("category", "")).upper()
        if cat in RECTIFIABLE_CATEGORIES or any(rc in cat for rc in RECTIFIABLE_CATEGORIES):
            ev = f.get("evidence", {})
            observed = ev.get("observed") or ev.get("left") or f.get("reason", "N/A")
            expected = ev.get("expected") or ev.get("right") or "Regulatory compliance norm"

            clause = f.get("ref", {}).get("clause") if isinstance(f.get("ref"), dict) else None
            clause_ref = clause if clause else "Handbook reference to be reviewed by officer"

            action_required = f"Please upload valid or rectified documentation addressing: {f.get('reason')}"

            deficiencies.append({
                "finding_id": f_id,
                "rule_id": f.get("rule_id"),
                "category": f.get("category"),
                "observed": observed,
                "expected": expected,
                "action_required": action_required,
                "handbook_reference": clause_ref,
                "status": "OPEN",
            })

    notice_id = f"def-not-{application_id}-{uuid.uuid4().hex[:6]}"

    return {
        "notice_id": notice_id,
        "application_id": application_id,
        "document_type": "DEFICIENCY_NOTICE_DRAFT",
        "status": "DRAFT",
        "actor": actor,
        "deficiencies_count": len(deficiencies),
        "deficiencies": deficiencies,
        "advisory_banner": "Draft deficiency notice for officer verification. Not a regulatory rejection or sanction.",
        "simulated": True,
        "decision_support_only": True,
        "created_at": now_iso,
    }


def generate_inspection_brief(
    application_id: str,
    actor: str = "system",
    database: Database | None = None,
) -> dict[str, Any]:
    """
    Generate ground inspection brief per Guide §11.8.
    Compiles facility checklist items requiring physical confirmation,
    pending verifications, and advisory indicators under the advisory banner.
    """
    d = database or default_db
    now_iso = datetime.now(timezone.utc).isoformat()

    # 1. Evaluate infra evidence
    infra_report = evaluate_application_infra(application_id, database=d)
    infra_items = infra_report.get("items", [])

    # 2. Retrieve document verifications
    with d.connection() as conn:
        verifs = get_verifications_by_application(conn, application_id, database=d)

    # 3. Compile ground checklist items
    ground_items = []
    for item in infra_items:
        st = str(item.get("status", "")).upper()
        if st in ("INSPECTION_SUGGESTED", "ADDITIONAL_EVIDENCE_REQUIRED", "LOCATION_METADATA_INCONSISTENT"):
            ground_items.append({
                "item_key": item.get("item_key"),
                "facility": item.get("label"),
                "reason": item.get("reason"),
                "evidence_status": st,
                "inspection_focus": f"Physically verify dimensions, equipment, and actual location of {item.get('label')}.",
            })

    # 4. Compile verifications needing human follow-up
    pending_verifs = []
    for v in verifs:
        v_st = str(v.get("status", "")).upper()
        if v_st in ("MANUAL_REVIEW_REQUIRED", "SOURCE_UNAVAILABLE", "VERIFICATION_PENDING", "NOT_SUPPORTED"):
            pending_verifs.append({
                "document_id": v.get("document_id"),
                "adapter": v.get("adapter"),
                "status": v_st,
                "reason": v.get("reason"),
                "inspection_focus": f"Inspect original physical certificate on campus for {v.get('document_id')}.",
            })

    brief_id = f"insp-brief-{application_id}-{uuid.uuid4().hex[:6]}"

    return {
        "brief_id": brief_id,
        "application_id": application_id,
        "document_type": "PHYSICAL_INSPECTION_BRIEF",
        "status": "READY_FOR_INSPECTION_TEAM",
        "actor": actor,
        "campus_coordinates": infra_report.get("campus_coordinates"),
        "facilities_to_inspect_count": len(ground_items),
        "facilities_to_inspect": ground_items,
        "pending_verifications_count": len(pending_verifs),
        "pending_verifications": pending_verifs,
        "advisory_banner": "Preliminary indicators requiring physical human verification. Not conclusive evidence.",
        "simulated": True,
        "decision_support_only": True,
        "created_at": now_iso,
    }


def generate_application_report(
    application_id: str,
    rule_set_name: str = "EOA_RENEWAL",
    database: Database | None = None,
) -> dict[str, Any]:
    """
    Generate comprehensive application evaluation report per Guide §11.8.
    Combines application checklist, findings with officer actions, verifications,
    infra facilities evaluation, and cryptographic audit hash chain head.
    """
    d = database or default_db
    now_iso = datetime.now(timezone.utc).isoformat()

    with d.connection() as conn:
        uploads = get_uploads_by_application(conn, application_id, database=d)
        verifs = get_verifications_by_application(conn, application_id, database=d)
        finding_actions = get_finding_actions_by_app(conn, application_id, database=d)
        last_audit = get_last_audit_event(conn, database=d)

    audit_head = last_audit["entry_hash"] if last_audit else GENESIS

    # Rules engine evaluation
    rule_report = validate_persisted_application(application_id, rule_set_name=rule_set_name, database=d)
    checks = rule_report.get("checks", [])
    findings = rule_report.get("findings", [])

    # Infra evidence evaluation
    infra_report = evaluate_application_infra(application_id, database=d)
    infra_items = infra_report.get("items", [])

    # Group checks by state for transparency table (Guide §11.8)
    checklist_table = []
    for chk in checks:
        st = chk.get("status", "NOT_CHECKED")
        checklist_table.append({
            "rule_id": chk.get("rule_id"),
            "category": chk.get("category"),
            "status": st,
            "reason": chk.get("reason"),
            "evaluated": st not in ("NOT_CHECKED",),
        })

    # Append unevaluated checks
    for un_chk in rule_report.get("coverage", {}).get("checks_not_evaluated", []):
        checklist_table.append({
            "rule_id": "PLANNED",
            "category": un_chk,
            "status": "NOT_RUN",
            "reason": "Capability not evaluated in active demo rule set",
            "evaluated": False,
        })

    # Attach officer action history to findings
    actions_by_finding: dict[str, list[dict[str, Any]]] = {}
    for a in finding_actions:
        actions_by_finding.setdefault(a["finding_id"], []).append(a)

    findings_with_history = []
    for f in findings:
        f_id = f.get("id") or f.get("rule_id", "unknown")
        f_copy = dict(f)
        f_copy["officer_actions"] = actions_by_finding.get(f_id, [])
        if f_copy["officer_actions"]:
            f_copy["lifecycle"] = f_copy["officer_actions"][-1]["new_state"]
        findings_with_history.append(f_copy)

    report_id = f"rep-{application_id}-{uuid.uuid4().hex[:8]}"

    return {
        "report_id": report_id,
        "application_id": application_id,
        "pipeline_stage": "S12_REPORT_VIEW",
        "category": rule_set_name,
        "rule_set_version": rule_report.get("rule_set_version", "4"),
        "data_snapshot_id": rule_report.get("data_snapshot_id", "N/A"),
        "audit_chain_head": audit_head,
        "documents_count": len(uploads),
        "checklist": checklist_table,
        "findings": findings_with_history,
        "verifications": verifs,
        "infra_checklist": infra_items,
        "advisory_banner": "Preliminary automated findings for officer review. Not a regulatory decision.",
        "simulated": True,
        "decision_support_only": True,
        "created_at": now_iso,
    }
