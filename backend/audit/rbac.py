"""
Role-Based Access Control & Resource-Level Authorization (Guide §15.2, S13).

Enforces strict separation of scopes across:
- institution: own applications, upload, view own findings, rectify. Cannot see other institutes or officer notes.
- officer: view applications, inspect evidence, record finding actions, verify, alert, request infra.
- senior_officer: officer + resolve escalations.
- rules_admin: rules read/write. Cannot read documents.
- auditor: audit read, metadata read. Cannot modify or read document bodies.
"""

from typing import Any
from fastapi import HTTPException

ROLE_SCOPES: dict[str, set[str]] = {
    "institution": {
        "app:create",
        "doc:upload",
        "finding:read_own",
        "doc:rectify",
        "app:read_own",
    },
    "officer": {
        "app:read",
        "doc:read",
        "finding:act",
        "verify:run",
        "alert:read",
        "infra:request",
        "finding:read",
        "audit:read",
        "report:read",
    },
    "senior_officer": {
        "app:read",
        "doc:read",
        "finding:act",
        "verify:run",
        "alert:read",
        "infra:request",
        "finding:read",
        "finding:resolve_escalation",
        "audit:read",
        "report:read",
    },
    "rules_admin": {
        "rules:read",
        "rules:write",
    },
    "auditor": {
        "audit:read",
        "app:read_meta",
    },
}


def authorize_action(
    user_role: str,
    scope: str,
    user_institute_id: str | None = None,
    resource_institute_id: str | None = None,
) -> bool:
    """
    Guard checking user role scope and resource-level institute ownership (Guide §15.2).
    - If user lacks required scope -> HTTP 403 Forbidden.
    - If user is institution and requests another institute's resource -> HTTP 404 Not Found (hiding existence).
    """
    allowed_scopes = ROLE_SCOPES.get(user_role, set())
    if scope not in allowed_scopes:
        raise HTTPException(
            status_code=403,
            detail={
                "error_code": "FORBIDDEN_SCOPE",
                "message": f"Role '{user_role}' is not authorized for scope '{scope}'",
            },
        )

    # Resource-level tenancy boundary check
    if user_role == "institution" and resource_institute_id is not None:
        if user_institute_id is None or user_institute_id != resource_institute_id:
            # Per Guide §15.2: return 404 to hide resource existence
            raise HTTPException(
                status_code=404,
                detail={
                    "error_code": "RESOURCE_NOT_FOUND",
                    "message": "The requested application or document does not exist.",
                },
            )

    return True
