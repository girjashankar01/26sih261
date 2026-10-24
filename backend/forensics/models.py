from dataclasses import dataclass, field, asdict
from typing import Any


@dataclass
class ForensicFlag:
    """Advisory tamper/anomaly flag conforming to contract C2 (Guide §3.4 C2)."""
    code: str
    severity: str  # "info" | "low" | "medium" | "high"
    reason: str
    evidence: dict[str, Any]
    advisory: bool = True
    requires_human_review: bool = True
    detector: dict[str, str] = field(default_factory=lambda: {"name": "forensics", "version": "1.0.0"})
    simulated: bool = True

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class SignatureInfo:
    """Digital signature status conforming to Guide §5.2."""
    integrity: str  # "INTACT_FULL_COVERAGE" | "MODIFIED_AFTER_SIGNING" | "BROKEN" | "NONE"
    trust: str  # "production" | "demo" | "untrusted"
    source_verification: str  # "UNVERIFIED" | "SIMULATED_SUCCESS" | "NOT_SUPPORTED"
    name: str | None = None
    signing_time: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class ForensicsMeta:
    """Document metadata and structural forensic signals (Guide §5.1)."""
    producer: str | None = None
    creator: str | None = None
    title: str | None = None
    author: str | None = None
    subject: str | None = None
    creation_date: str | None = None
    mod_date: str | None = None
    incremental_updates_count: int = 1
    signatures: list[dict[str, Any]] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class GeoMeta:
    """Geospatial coordinates extracted from EXIF metadata (Guide §5.3)."""
    latitude: float | None = None
    longitude: float | None = None
    captured_at: str | None = None
    make: str | None = None
    model: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class QRResult:
    """Decoded QR code locator and reference matching Guide §5.7."""
    detected: bool = False
    issuer: str | None = None
    reference: str | None = None
    raw_text_masked: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class DetectorStatus:
    """Execution status for an individual detector."""
    name: str
    version: str
    status: str  # "COMPLETED" | "NOT_CHECKED" | "DEFERRED"
    reason: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class DocumentForensicsResult:
    """Complete S2 Forensics result conforming to Guide §2.2 and §5."""
    application_id: str
    document_id: str
    detected_media_type: str
    byte_size: int
    blake3: str
    sha256: str
    storage_key: str
    pipeline_stage: str = "S2_FORENSICS"
    flags: list[dict[str, Any]] = field(default_factory=list)
    meta: dict[str, Any] = field(default_factory=dict)
    geo: dict[str, Any] = field(default_factory=dict)
    qr: dict[str, Any] | None = None
    detectors: list[dict[str, Any]] = field(default_factory=list)
    doc_slot: str | None = None
    simulated: bool = True
    advisory: bool = True

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)
