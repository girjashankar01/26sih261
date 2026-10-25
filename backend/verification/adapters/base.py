"""
Verification Adapters Base Protocol & Exceptions (Guide §13.2).
"""

from typing import Any, Protocol, runtime_checkable


class TransientSourceError(Exception):
    """Network timeout, 503 Service Unavailable, temporary rate limit."""
    pass


class PermanentSourceError(Exception):
    """401 Unauthorized, 404 Route Not Found, permanent certificate rejection."""
    pass


class InvalidResponse(Exception):
    """Malformed JSON, unparseable payload, truncated schema."""
    pass


@runtime_checkable
class VerificationAdapter(Protocol):
    name: str
    source: str
    simulated: bool
    local_only: bool

    def verify(
        self,
        doc_type: str,
        ident: str | None,
        submitted: dict[str, Any],
        raw_bytes: bytes | None = None,
        context: dict[str, Any] | None = None,
        timeout: float = 5.0,
    ) -> dict[str, Any]:
        ...
