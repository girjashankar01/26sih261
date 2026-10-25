"""
Finding Action & Lifecycle Management (Guide §1.3, §17, S12).

Manages human officer actions on automated findings:
- States: open -> acknowledged, rectification_requested, dismissed, escalated, resolved.
- Mandatory reason for dismiss, request rectification, and escalate.
- Stores officer override beside (never over) the automated finding.
- Appends immutable S13 audit event inside the transaction.
"""

from datetime import datetime, timezone
from typing import Any
import uuid

from fastapi import HTTPException

from backend.audit.chain import audit
from backend.db.connection import Database, db as default_db
from backend.db.repository import (
    insert_finding_action,
    get_finding_actions_by_finding,
    get_finding_actions_by_app,
)

VALID_ACTIONS = {
    "acknowledge": "acknowledged",
    "request_rectification": "rectification_requested",
    "dismiss": "dismissed",
    "escalate": "escalated",
    "resolve": "resolved",
}

ACTIONS_REQUIRING_REASON = {
    "request_rectification",
    "dismiss",
    "escalate",
    "resolve",
}


def record_finding_action(
    application_id: str,
    finding_id: str,
    action: str,
    actor: str,
    reason: str | None = None,
    notes: str | None = None,
    user_role: str = "officer",
    database: Database | None = None,
) -> dict[str, Any]:
    """
    Execute an officer action on an automated discrepancy finding (Guide §17.3).
    Stores override beside original and registers an S13 audit event.
    """
    d = database or default_db
    act = action.strip().lower()

    if act not in VALID_ACTIONS:
        raise HTTPException(
            status_code=400,
            detail={
                "error_code": "INVALID_ACTION",
                "message": f"Action '{action}' is invalid. Allowed: {list(VALID_ACTIONS.keys())}",
            },
        )

    new_state = VALID_ACTIONS[act]

    # Mandatory reason verification
    if act in ACTIONS_REQUIRING_REASON:
        if not reason or not reason.strip():
            raise HTTPException(
                status_code=422,
                detail={
                    "error_code": "MANDATORY_REASON_REQUIRED",
                    "message": f"Action '{action}' requires a mandatory human justification reason.",
                },
            )

    # Permission check for resolving escalated findings
    if act == "resolve":
        with d.connection() as conn:
            prior_actions = get_finding_actions_by_finding(conn, finding_id, database=d)
        if prior_actions and prior_actions[-1]["new_state"] == "escalated":
            if user_role not in ("senior_officer", "admin"):
                raise HTTPException(
                    status_code=403,
                    detail={
                        "error_code": "ESCALATION_RESOLUTION_UNAUTHORIZED",
                        "message": "Only senior officers can resolve escalated findings.",
                    },
                )

    # Fetch previous state
    with d.connection() as conn:
        prior_actions = get_finding_actions_by_finding(conn, finding_id, database=d)
    previous_state = prior_actions[-1]["new_state"] if prior_actions else "open"

    action_id = f"act-{uuid.uuid4().hex[:10]}"
    now_iso = datetime.now(timezone.utc).isoformat()
    clean_reason = (reason or "").strip()
    clean_notes = (notes or "").strip() if notes else None

    action_record = {
        "id": action_id,
        "application_id": application_id,
        "finding_id": finding_id,
        "action": act,
        "previous_state": previous_state,
        "new_state": new_state,
        "actor": actor,
        "reason": clean_reason,
        "notes": clean_notes,
        "created_at": now_iso,
    }

    # Execute insert and audit in a single transaction
    with d.transaction() as conn:
        insert_finding_action(conn, action_record, database=d)
        audit_res = audit(
            conn=conn,
            actor=actor,
            action=f"FINDING_{act.upper()}",
            subject=f"finding:{finding_id}",
            details={
                "application_id": application_id,
                "finding_id": finding_id,
                "previous_state": previous_state,
                "new_state": new_state,
                "reason": clean_reason,
                "notes": clean_notes,
            },
            database=d,
        )

    action_record["audit_event_id"] = audit_res["id"]
    action_record["audit_entry_hash"] = audit_res["entry_hash"]

    return action_record
