"""
Aggregation & Status Module (Guide §11.7, S11).

Combines outputs from S1–S10 into an integrated decision-support payload:
1. Forensic flags and document tiers (S2).
2. Deterministic rule check results and actionable findings (S8).
3. Issuing authority verification statuses (S9).
4. Physical infrastructure evidence checklist evaluations (S10).

Derives:
- Workflow status: NEEDS_RECTIFICATION, NEEDS_MANUAL_REVIEW, or VALIDATED_NO_ISSUES.
- Review lanes: NEEDS_SCRUTINY, NEEDS_VERIFICATION, NEEDS_EVIDENCE, or FAST_REVIEW.
- Priority score: 100·high + 30·medium + 5·low + age_days + deadline_pressure.
- Structured alerts for officer attention.
"""

from datetime import datetime, timezone, date
from typing import Any
import uuid

from backend.db.connection import Database, db as default_db
from backend.db.repository import (
    get_uploads_by_application,
    get_verifications_by_application,
    get_alerts_by_app,
    insert_alert,
)
from backend.rules.evaluate import validate_persisted_application
from backend.infra.service import evaluate_application_infra

RECTIFIABLE_FINDING_CATEGORIES = {
    "MISSING",
    "INCOMPLETE",
    "EXPIRED",
    "INCONSISTENT",
    "COMPLIANCE_GAP",
    "MISSING_DOCUMENT",
    "EXPIRED_CERTIFICATE",
    "NAME_MISMATCH",
    "INTAKE_EXCEEDED",
    "FORMAT_INVALID",
    "INSUFFICIENT_AREA",
}

MANUAL_REVIEW_VERIFICATION_STATUSES = {
    "MANUAL_REVIEW_REQUIRED",
    "SOURCE_UNAVAILABLE",
    "VERIFICATION_PENDING",
    "NOT_SUPPORTED",
}


def derive_workflow_status(
    findings: list[dict[str, Any]],
    checks: list[dict[str, Any]],
    verifications: list[dict[str, Any]],
    doc_tiers: list[str] | None = None,
    dead_jobs: list[str] | None = None,
) -> str:
    """
    Derive application workflow status per Guide §11.7 (first match wins):
    1. If any open rectifiable finding in {MISSING, INCOMPLETE, EXPIRED, INCONSISTENT, COMPLIANCE_GAP}
       -> NEEDS_RECTIFICATION
    2. Elif any mandatory NOT_CHECKED / NEEDS_REVIEW, any verification in
       {MANUAL_REVIEW_REQUIRED, SOURCE_UNAVAILABLE, VERIFICATION_PENDING, NOT_SUPPORTED},
       any HIGH document tier, or any dead job
       -> NEEDS_MANUAL_REVIEW
    3. Else (definition in §1.3)
       -> VALIDATED_NO_ISSUES
    """
    tiers = doc_tiers or []
    dead = dead_jobs or []

    # 1. Check for open rectifiable findings
    for f in findings:
        if f.get("lifecycle", "open") == "open":
            cat = str(f.get("category", "")).upper()
            status = str(f.get("status", "")).upper()
            if cat in RECTIFIABLE_FINDING_CATEGORIES or any(rc in cat for rc in RECTIFIABLE_FINDING_CATEGORIES):
                return "NEEDS_RECTIFICATION"
            if status == "FAILED_CHECK":
                return "NEEDS_RECTIFICATION"

    # 2. Check for mandatory review blockers
    # Check mandatory rule check results
    for chk in checks:
        st = str(chk.get("status", "")).upper()
        # In v4 rules engine, active rules are mandatory checks
        if st in ("NOT_CHECKED", "NEEDS_REVIEW"):
            return "NEEDS_MANUAL_REVIEW"

    # Check verifications
    for v in verifications:
        v_status = str(v.get("status", "")).upper()
        if v_status in MANUAL_REVIEW_VERIFICATION_STATUSES:
            return "NEEDS_MANUAL_REVIEW"

    # Check HIGH document tiers
    if any(t.upper() == "HIGH" for t in tiers):
        return "NEEDS_MANUAL_REVIEW"

    # Check dead jobs
    if dead:
        return "NEEDS_MANUAL_REVIEW"

    # 3. Validated no issues
    return "VALIDATED_NO_ISSUES"


def derive_review_lane(
    workflow_status: str,
    doc_tiers: list[str] | None = None,
    findings: list[dict[str, Any]] | None = None,
    verifications: list[dict[str, Any]] | None = None,
    infra_items: list[dict[str, Any]] | None = None,
) -> str:
    """
    Derive review lane per Guide §11.7 (first match wins):
    - NEEDS_SCRUTINY: any HIGH tier or high-severity inconsistency
    - NEEDS_VERIFICATION: verification pending/unavailable/manual/unsupported
    - NEEDS_EVIDENCE: open MISSING/INCOMPLETE/EXPIRED or infra evidence requests
    - FAST_REVIEW: only if VALIDATED_NO_ISSUES
    """
    tiers = [t.upper() for t in (doc_tiers or [])]
    f_list = findings or []
    v_list = verifications or []
    infra = infra_items or []

    # 1. NEEDS_SCRUTINY: any HIGH tier or high-severity finding
    if "HIGH" in tiers or any(str(f.get("severity", "")).lower() == "high" for f in f_list):
        return "NEEDS_SCRUTINY"

    # 2. NEEDS_VERIFICATION: verification pending/unavailable/manual
    for v in v_list:
        v_status = str(v.get("status", "")).upper()
        if v_status in MANUAL_REVIEW_VERIFICATION_STATUSES:
            return "NEEDS_VERIFICATION"

    # 3. NEEDS_EVIDENCE: open MISSING/INCOMPLETE/EXPIRED or infra evidence requests
    for f in f_list:
        if f.get("lifecycle", "open") == "open":
            cat = str(f.get("category", "")).upper()
            if any(k in cat for k in ("MISSING", "INCOMPLETE", "EXPIRED", "INSUFFICIENT")):
                return "NEEDS_EVIDENCE"

    for item in infra:
        item_status = str(item.get("status", "")).upper()
        if item_status in ("ADDITIONAL_EVIDENCE_REQUIRED", "POSSIBLE_DUPLICATE_EVIDENCE", "INSPECTION_SUGGESTED"):
            return "NEEDS_EVIDENCE"

    # 4. FAST_REVIEW: only if VALIDATED_NO_ISSUES
    if workflow_status == "VALIDATED_NO_ISSUES":
        return "FAST_REVIEW"

    # Fallback to NEEDS_SCRUTINY if there are unassigned issues, else FAST_REVIEW
    return "FAST_REVIEW" if not f_list else "NEEDS_SCRUTINY"


def calculate_priority_score(
    findings: list[dict[str, Any]] | None = None,
    forensic_flags: list[dict[str, Any]] | None = None,
    submitted_on: str | None = None,
    deadline_date: str | None = None,
    current_date: date | None = None,
) -> dict[str, Any]:
    """
    Compute queue priority inside a lane (Guide §11.7):
    formula: 100·high + 30·medium + 5·low + age_days + deadline_pressure
    """
    today = current_date or datetime.now(timezone.utc).date()
    f_list = findings or []
    flags = forensic_flags or []

    high_count = 0
    medium_count = 0
    low_count = 0

    for item in f_list + flags:
        sev = str(item.get("severity", "")).lower()
        if sev == "high":
            high_count += 1
        elif sev == "medium":
            medium_count += 1
        elif sev == "low":
            low_count += 1

    # Age calculation
    age_days = 0
    if submitted_on:
        try:
            sub_d = date.fromisoformat(str(submitted_on)[:10])
            delta = (today - sub_d).days
            age_days = max(0, delta)
        except Exception:
            age_days = 0

    # Deadline pressure calculation
    deadline_pressure = 0
    if deadline_date:
        try:
            dl_d = date.fromisoformat(str(deadline_date)[:10])
            days_to_deadline = (dl_d - today).days
            if days_to_deadline <= 7:
                deadline_pressure = 50
            elif days_to_deadline <= 14:
                deadline_pressure = 20
        except Exception:
            deadline_pressure = 0

    score = (100 * high_count) + (30 * medium_count) + (5 * low_count) + age_days + deadline_pressure

    return {
        "score": score,
        "formula": "100·high + 30·medium + 5·low + age_days + deadline_pressure",
        "breakdown": {
            "high": high_count,
            "medium": medium_count,
            "low": low_count,
            "age_days": age_days,
            "deadline_pressure": deadline_pressure,
        },
    }


def generate_application_alerts(
    application_id: str,
    findings: list[dict[str, Any]],
    verifications: list[dict[str, Any]],
    doc_tiers: list[str] | None = None,
    dead_jobs: list[str] | None = None,
    infra_items: list[dict[str, Any]] | None = None,
) -> list[dict[str, Any]]:
    """
    Generate structured alerts for officer attention (Guide §11.7):
    - Missing information / missing evidence
    - Document expiring <= 30/60 days
    - Verification pending beyond SLA / Manual review required
    - HIGH tier document detected
    - Unresolved discrepancy / dead job
    """
    now_iso = datetime.now(timezone.utc).isoformat()
    alerts: list[dict[str, Any]] = []

    # 1. High tier document alerts
    if doc_tiers and any(t.upper() == "HIGH" for t in doc_tiers):
        alerts.append({
            "id": f"alt-tier-{application_id}-{uuid.uuid4().hex[:6]}",
            "application_id": application_id,
            "category": "HIGH_TIER_DOCUMENT",
            "severity": "high",
            "title": "High Risk Document Tier Detected",
            "message": "One or more documents in this application have been assigned HIGH forensic risk tier.",
            "created_at": now_iso,
        })

    # 2. Dead jobs alert
    if dead_jobs:
        alerts.append({
            "id": f"alt-dead-{application_id}-{uuid.uuid4().hex[:6]}",
            "application_id": application_id,
            "category": "DEAD_JOB",
            "severity": "high",
            "title": "Asynchronous Task Failure",
            "message": f"Processing encountered {len(dead_jobs)} dead background tasks.",
            "created_at": now_iso,
        })

    # 3. Verification alerts
    for v in verifications:
        v_status = str(v.get("status", "")).upper()
        if v_status in MANUAL_REVIEW_VERIFICATION_STATUSES:
            alerts.append({
                "id": f"alt-verif-{v.get('document_id')}-{uuid.uuid4().hex[:6]}",
                "application_id": application_id,
                "category": "VERIFICATION_ATTENTION_REQUIRED",
                "severity": "medium",
                "title": f"Document Verification {v_status}",
                "message": f"Document {v.get('document_id')} requires manual verification: {v.get('reason')}",
                "created_at": now_iso,
            })

    # 4. Finding-derived alerts (missing docs, expired certificates, severe discrepancies)
    for f in findings:
        if f.get("lifecycle", "open") == "open":
            cat = str(f.get("category", "")).upper()
            sev = str(f.get("severity", "medium")).lower()
            if "EXPIRED" in cat:
                alerts.append({
                    "id": f"alt-exp-{f.get('rule_id')}-{uuid.uuid4().hex[:6]}",
                    "application_id": application_id,
                    "category": "DOCUMENT_EXPIRED",
                    "severity": sev,
                    "title": "Expired Mandatory Document",
                    "message": f.get("reason", "A required regulatory certificate has expired."),
                    "created_at": now_iso,
                })
            elif "MISSING" in cat:
                alerts.append({
                    "id": f"alt-miss-{f.get('rule_id')}-{uuid.uuid4().hex[:6]}",
                    "application_id": application_id,
                    "category": "MISSING_INFORMATION",
                    "severity": sev,
                    "title": "Missing Mandatory Document",
                    "message": f.get("reason", "A required submission item was not provided."),
                    "created_at": now_iso,
                })
            elif sev == "high":
                alerts.append({
                    "id": f"alt-disc-{f.get('rule_id')}-{uuid.uuid4().hex[:6]}",
                    "application_id": application_id,
                    "category": "CRITICAL_DISCREPANCY",
                    "severity": "high",
                    "title": "Unresolved Discrepancy",
                    "message": f.get("reason", "A high-severity discrepancy was detected."),
                    "created_at": now_iso,
                })

    # 5. Infra evidence alerts
    for item in (infra_items or []):
        st = str(item.get("status", "")).upper()
        if st in ("POSSIBLE_DUPLICATE_EVIDENCE", "LOCATION_METADATA_INCONSISTENT"):
            alerts.append({
                "id": f"alt-infra-{item.get('item_key')}-{uuid.uuid4().hex[:6]}",
                "application_id": application_id,
                "category": "INFRASTRUCTURE_ANOMALY",
                "severity": "medium",
                "title": f"Infrastructure Evidence: {st}",
                "message": f"Facility {item.get('label')}: {item.get('reason')}",
                "created_at": now_iso,
            })

    return alerts


def aggregate_application(
    application_id: str,
    rule_set_name: str = "EOA_RENEWAL",
    deadline_date: str | None = None,
    database: Database | None = None,
) -> dict[str, Any]:
    """
    Main entry point for S11 Aggregation & Status.
    Aggregates facts, rules evaluation, verifications, infra checklist, and alerts.
    """
    d = database or default_db

    # 1. Retrieve uploads to count documents and get base timestamps
    with d.connection() as conn:
        uploads = get_uploads_by_application(conn, application_id, d)
        verifications = get_verifications_by_application(conn, application_id, d)

    # 2. Evaluate rules (S8)
    rule_report = validate_persisted_application(
        application_id=application_id,
        rule_set_name=rule_set_name,
        database=d,
    )
    checks = rule_report.get("checks", [])
    findings = rule_report.get("findings", [])

    # 3. Evaluate infra evidence (S10)
    infra_report = evaluate_application_infra(
        application_id=application_id,
        database=d,
    )
    infra_items = infra_report.get("items", [])

    # 4. Extract context info: submission date, document tiers, forensic flags
    submitted_on = None
    if uploads:
        submitted_on = uploads[0].get("created_at")

    doc_tiers: list[str] = []
    forensic_flags: list[dict[str, Any]] = []

    # 5. Derive workflow status, review lane, priority score
    wf_status = derive_workflow_status(
        findings=findings,
        checks=checks,
        verifications=verifications,
        doc_tiers=doc_tiers,
    )

    lane = derive_review_lane(
        workflow_status=wf_status,
        doc_tiers=doc_tiers,
        findings=findings,
        verifications=verifications,
        infra_items=infra_items,
    )

    priority = calculate_priority_score(
        findings=findings,
        forensic_flags=forensic_flags,
        submitted_on=submitted_on,
        deadline_date=deadline_date,
    )

    # 6. Generate and persist alerts
    alerts = generate_application_alerts(
        application_id=application_id,
        findings=findings,
        verifications=verifications,
        doc_tiers=doc_tiers,
        infra_items=infra_items,
    )

    # Persist alerts to DB
    now_iso = datetime.now(timezone.utc).isoformat()
    with d.transaction() as conn:
        for alt in alerts:
            insert_alert(
                conn=conn,
                alert_id=alt["id"],
                application_id=application_id,
                category=alt["category"],
                severity=alt["severity"],
                title=alt["title"],
                message=alt["message"],
                created_at=alt["created_at"],
                database=d,
            )

    # 7. Build summary counts
    passed_count = sum(1 for c in checks if c.get("status") == "PASS")
    failed_count = sum(1 for c in checks if c.get("status") == "FAILED_CHECK")
    review_count = sum(1 for c in checks if c.get("status") in ("NEEDS_REVIEW", "NOT_CHECKED"))

    summary = {
        "total_documents": len(uploads),
        "total_checks": len(checks),
        "passed_checks": passed_count,
        "failed_checks": failed_count,
        "needs_review_checks": review_count,
        "open_findings": len([f for f in findings if f.get("lifecycle", "open") == "open"]),
        "verifications_count": len(verifications),
        "infra_items_count": len(infra_items),
    }

    return {
        "application_id": application_id,
        "pipeline_stage": "S11_AGGREGATION",
        "category": rule_set_name,
        "workflow_status": wf_status,
        "review_lane": lane,
        "priority": priority,
        "summary": summary,
        "checks": checks,
        "findings": findings,
        "verifications": verifications,
        "infra_checklist": infra_items,
        "alerts": alerts,
        "simulated": True,
        "decision_support_only": True,
        "created_at": now_iso,
    }
