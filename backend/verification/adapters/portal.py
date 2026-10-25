"""
Mock Issuer Portal Adapter (Guide §13.3).

Demonstrates fallback logic:
- Configurable latency & injected 503 (SOURCE_UNAVAILABLE)
- Asynchronous response (VERIFICATION_PENDING)
- Permanent errors (MANUAL_REVIEW_REQUIRED)
"""

from datetime import datetime, timezone
import hashlib
from typing import Any

from backend.verification.adapters.base import (
    InvalidResponse,
    PermanentSourceError,
    TransientSourceError,
)


class MockPortalAdapter:
    def __init__(self, mode: str = "ok"):
        self.name = "mock_portal_adapter"
        self.source = "Simulated AICTE Portal API Gateway"
        self.simulated = True
        self.local_only = True
        self.mode = mode

    def verify(
        self,
        doc_type: str,
        ident: str | None,
        submitted: dict[str, Any],
        raw_bytes: bytes | None = None,
        context: dict[str, Any] | None = None,
        timeout: float = 5.0,
    ) -> dict[str, Any]:
        now_iso = datetime.now(timezone.utc).isoformat()
        req_digest = hashlib.sha256(f"portal_{doc_type}_{ident}".encode("utf-8")).hexdigest()

        if self.mode == "503":
            raise TransientSourceError("503 Service Unavailable: Registry Gateway connection timeout")
        elif self.mode == "permanent_err":
            raise PermanentSourceError("401 Unauthorized: Invalid institution requester credentials")
        elif self.mode == "invalid_resp":
            raise InvalidResponse("Malformed response payload from upstream issuer API")
        elif self.mode == "pending":
            return {
                "adapter": self.name,
                "source": self.source,
                "simulated": True,
                "status": "VERIFICATION_PENDING",
                "request_digest": req_digest,
                "response_digest": hashlib.sha256(b"pending_ticket").hexdigest(),
                "checked_at": now_iso,
                "integrity": {"signature": "NOT_CHECKED"},
                "trust": {"class": "demo"},
                "reason": "Verification ticket accepted by upstream portal; asynchronous response pending.",
            }
        else:
            return {
                "adapter": self.name,
                "source": self.source,
                "simulated": True,
                "status": "VERIFIED",
                "request_digest": req_digest,
                "response_digest": hashlib.sha256(b"verified").hexdigest(),
                "checked_at": now_iso,
                "integrity": {"signature": "NOT_CHECKED"},
                "trust": {"class": "demo"},
                "reason": f"Document '{doc_type}' successfully verified against simulated portal registry.",
            }
