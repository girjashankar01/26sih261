"""
PDF Digital Signature Verification Adapter (Guide §13.3).

Executes real cryptographic verification via pyHanko against configured demo root CAs.
Explicitly labels simulated demo root.
"""

from datetime import datetime, timezone
import hashlib
import json
from typing import Any

from backend.forensics.detectors.pdf_signatures import detect_pdf_signatures


class SignatureAdapter:
    def __init__(self):
        self.name = "pdf_signature_verifier"
        self.source = "Stand-in Authority Demo Root CA"
        self.simulated = True
        self.local_only = True

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
        req_digest = hashlib.sha256(b"sig_verify").hexdigest()

        if not raw_bytes:
            return {
                "adapter": self.name,
                "source": self.source,
                "simulated": True,
                "status": "NOT_CHECKED",
                "request_digest": req_digest,
                "response_digest": hashlib.sha256(b"no_bytes").hexdigest(),
                "checked_at": now_iso,
                "integrity": {"signature": "NOT_CHECKED"},
                "trust": {"class": "demo"},
                "reason": "Original document bytes unavailable for cryptographic verification.",
            }

        signatures, flags = detect_pdf_signatures(raw_bytes, document_id=ident or "doc")

        if not signatures:
            return {
                "adapter": self.name,
                "source": self.source,
                "simulated": True,
                "status": "NOT_SUPPORTED",
                "request_digest": req_digest,
                "response_digest": hashlib.sha256(b"zero_sigs").hexdigest(),
                "checked_at": now_iso,
                "integrity": {"signature": "NOT_SUPPORTED"},
                "trust": {"class": "demo"},
                "reason": "Document contains no digital signature dictionaries.",
            }

        first_sig = signatures[0]
        integrity_str = first_sig.integrity
        trust_str = first_sig.trust
        sig_name = first_sig.name

        if integrity_str == "INTACT_FULL_COVERAGE" and trust_str == "demo":
            status = "VERIFIED"
            sig_integrity = "VERIFIED"
            trust_class = "demo"
            reason = f"Cryptographic digital signature '{sig_name}' is intact and chained to configured demo root CA."
        elif integrity_str in ("BROKEN", "BROKEN_SUBSEQUENT_CHANGES"):
            status = "MISMATCH_DETECTED"
            sig_integrity = "INVALID"
            trust_class = "unknown"
            reason = f"Digital signature integrity check failed: document content was modified after signing."
        elif trust_str == "untrusted":
            status = "MANUAL_REVIEW_REQUIRED"
            sig_integrity = "VERIFIED" if integrity_str.startswith("INTACT") else "INVALID"
            trust_class = "unknown"
            reason = f"Digital signature intact but chained to an untrusted third party root CA: officer review required."
        else:
            status = "MANUAL_REVIEW_REQUIRED"
            sig_integrity = "INVALID"
            trust_class = "unknown"
            reason = f"Digital signature verification inconclusive: manual review required."

        resp_digest = hashlib.sha256(
            json.dumps({"name": sig_name, "integrity": integrity_str, "trust": trust_str}, sort_keys=True).encode("utf-8")
        ).hexdigest()

        return {
            "adapter": self.name,
            "source": self.source,
            "simulated": True,
            "status": status,
            "request_digest": req_digest,
            "response_digest": resp_digest,
            "checked_at": now_iso,
            "integrity": {"signature": sig_integrity},
            "trust": {"class": trust_class},
            "reason": reason,
        }
