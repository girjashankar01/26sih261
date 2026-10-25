"""
QR Code Verification Adapter (Guide §13.3).

Decodes QR reference from document and queries simulated authority registry.
Never claims live portal connection. Labeled simulated: true.
"""

from datetime import datetime, timezone
import hashlib
import json
import re
from typing import Any

from backend.verification.adapters.base import VerificationAdapter
from backend.verification.decide import decide, default_normaliser


# Synthetic fire department registry fixtures
MOCK_FIRE_REGISTRY: dict[str, dict[str, Any]] = {
    "FIRE/KA/2024/00123": {
        "certificate_no": "FIRE/KA/2024/00123",
        "institution_name": "Apex Institute of Technology Private Limited",
        "valid_till": "2026-03-31",
        "validity_ended": True,
        "issued_date": "2024-04-01",
        "issuing_authority": "Karnataka State Fire and Emergency Services",
    },
    "FIRE/KA/2024/00999": {
        "certificate_no": "FIRE/KA/2024/00999",
        "institution_name": "Apex Institute of Technology Private Limited",
        "valid_till": "2027-03-31",
        "validity_ended": False,
        "issued_date": "2025-04-01",
        "issuing_authority": "Karnataka State Fire and Emergency Services",
    },
    "FIRE/KA/2024/00456": {
        "certificate_no": "FIRE/KA/2024/00456",
        "institution_name": "Different College of Engineering",
        "valid_till": "2027-03-31",
        "validity_ended": False,
        "issued_date": "2024-04-01",
        "issuing_authority": "Karnataka State Fire and Emergency Services",
    },
}


class QRAdapter:
    def __init__(self):
        self.name = "qr_registry_sim"
        self.source = "Simulated State Fire Service Registry"
        self.simulated = True
        self.local_only = True

    def _extract_id(self, qr_text: str | None, ident: str | None) -> str | None:
        if ident and ident.strip():
            return ident.strip()
        if not qr_text:
            return None

        # Check for URL query param e.g. ?id=FIRE/... or direct pattern
        m = re.search(r"(?:id=|ref=)?(FIRE/[A-Z]{2}/\d{4}/\d+|NOC-\d{4}-\d+)", qr_text, re.IGNORECASE)
        if m:
            return m.group(1).upper()
        return qr_text.strip()

    def verify(
        self,
        doc_type: str,
        ident: str | None,
        submitted: dict[str, Any],
        raw_bytes: bytes | None = None,
        context: dict[str, Any] | None = None,
        timeout: float = 5.0,
    ) -> dict[str, Any]:
        ctx = context or {}
        qr_text = ctx.get("qr_payload") or ctx.get("qr_text")
        cert_id = self._extract_id(qr_text, ident)

        now_iso = datetime.now(timezone.utc).isoformat()
        req_payload = {"adapter": self.name, "doc_type": doc_type, "ident": cert_id, "submitted": submitted}
        req_digest = hashlib.sha256(json.dumps(req_payload, sort_keys=True).encode("utf-8")).hexdigest()

        if not cert_id:
            return {
                "adapter": self.name,
                "source": self.source,
                "simulated": True,
                "status": "NOT_CHECKED",
                "request_digest": req_digest,
                "response_digest": hashlib.sha256(b"no_qr").hexdigest(),
                "checked_at": now_iso,
                "integrity": {"signature": "NOT_CHECKED"},
                "trust": {"class": "demo"},
                "reason": "No verifiable QR code or certificate identifier found in document.",
            }

        returned = MOCK_FIRE_REGISTRY.get(cert_id)
        resp_digest = hashlib.sha256(json.dumps(returned or {}, sort_keys=True).encode("utf-8")).hexdigest()

        # Fields to compare
        compare_fields = {}
        if "certificate_no" in submitted:
            compare_fields["certificate_no"] = default_normaliser
        if "institution_name" in submitted:
            compare_fields["institution_name"] = default_normaliser

        status, comp_or_reason = decide(returned, submitted, compare_fields)

        if status == "VERIFIED":
            reason = f"Document QR reference '{cert_id}' verified against simulated state fire service registry."
            compared = comp_or_reason
        elif status == "EXPIRED":
            reason = f"Simulated state fire service registry confirms certificate '{cert_id}' validity has expired."
            compared = comp_or_reason
        elif status == "MISMATCH_DETECTED":
            mismatches = [k for k, v in comp_or_reason.items() if not v.get("match")]
            reason = f"Registry fields mismatch for certificate '{cert_id}': {mismatches} differ from submitted document."
            compared = comp_or_reason
        else:
            reason = f"Verification inconclusive for '{cert_id}': {comp_or_reason.get('reason', 'REFERENCE_NOT_FOUND')}."
            compared = comp_or_reason if isinstance(comp_or_reason, dict) and "reason" not in comp_or_reason else {}

        return {
            "adapter": self.name,
            "source": self.source,
            "simulated": True,
            "status": status,
            "request_digest": req_digest,
            "response_digest": resp_digest,
            "checked_at": now_iso,
            "integrity": {"signature": "NOT_CHECKED"},
            "trust": {"class": "demo"},
            "compared": compared,
            "reason": reason,
        }
