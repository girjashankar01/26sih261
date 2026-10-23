from enum import Enum
from typing import Any
from pydantic import BaseModel, ConfigDict, Field


class CheckStatus(str, Enum):
    PASS = "PASS"
    WARNING = "WARNING"
    FAILED_CHECK = "FAILED_CHECK"
    NOT_CHECKED = "NOT_CHECKED"
    NEEDS_REVIEW = "NEEDS_REVIEW"


class VerificationStatus(str, Enum):
    VERIFIED = "VERIFIED"
    MISMATCH_DETECTED = "MISMATCH_DETECTED"
    EXPIRED = "EXPIRED"
    VERIFICATION_PENDING = "VERIFICATION_PENDING"
    SOURCE_UNAVAILABLE = "SOURCE_UNAVAILABLE"
    MANUAL_REVIEW_REQUIRED = "MANUAL_REVIEW_REQUIRED"
    NOT_SUPPORTED = "NOT_SUPPORTED"
    NOT_CHECKED = "NOT_CHECKED"


class FindingLifecycle(str, Enum):
    open = "open"
    acknowledged = "acknowledged"
    rectification_requested = "rectification_requested"
    dismissed = "dismissed"
    escalated = "escalated"
    resolved = "resolved"


class ApplicationWorkflow(str, Enum):
    NO_FINDINGS_IN_ENABLED_DEMO_CHECKS = "NO_FINDINGS_IN_ENABLED_DEMO_CHECKS"
    NEEDS_RECTIFICATION = "NEEDS_RECTIFICATION"
    NEEDS_MANUAL_REVIEW = "NEEDS_MANUAL_REVIEW"
    VALIDATED_NO_ISSUES = "VALIDATED_NO_ISSUES"
    DRAFT = "DRAFT"
    SUBMITTED = "SUBMITTED"
    VALIDATING = "VALIDATING"
    UNDER_OFFICER_REVIEW = "UNDER_OFFICER_REVIEW"
    OFFICER_DECISION_RECORDED = "OFFICER_DECISION_RECORDED"


class FindingSeverity(str, Enum):
    info = "info"
    low = "low"
    medium = "medium"
    high = "high"


class FindingCategory(str, Enum):
    REQUIRED_DOCUMENT = "REQUIRED_DOCUMENT"
    MISSING = "MISSING"
    EXPIRED = "EXPIRED"
    INCONSISTENT = "INCONSISTENT"
    INCOMPLETE = "INCOMPLETE"
    CALCULATION_MISMATCH = "CALCULATION_MISMATCH"
    UNVERIFIED = "UNVERIFIED"
    TAMPER_INDICATOR = "TAMPER_INDICATOR"


class CheckResultModel(BaseModel):
    rule_id: str = Field(..., description="Unique rule identifier")
    rule_version: str | int | None = Field(default="1.0.0", description="Rule definition version")
    status: CheckStatus = Field(..., description="Rule evaluation result")
    category: FindingCategory | str | None = Field(default=None, description="Check category")
    severity: FindingSeverity | str | None = Field(default=None, description="Advisory severity tier")
    observed: Any | None = Field(default=None, description="Observed value")
    expected: Any | None = Field(default=None, description="Expected condition")
    advisory: bool = Field(default=True, description="Advisory input for officer review")
    reason: str = Field(..., description="Plain-language explanation of check outcome")
    evidence: Any | None = Field(default=None, description="Supporting evidence data")
    simulated: bool | None = Field(default=None, description="True if check ran against synthetic record")

    model_config = ConfigDict(extra="allow")


class FindingModel(BaseModel):
    id: str | None = Field(default=None, description="Finding identifier")
    rule_id: str = Field(..., description="Rule or detector identifier")
    rule_version: str | int | None = Field(default="1.0.0", description="Rule version")
    status: CheckStatus = Field(default=CheckStatus.FAILED_CHECK, description="Rule-result status")
    category: FindingCategory | str = Field(..., description="Finding category")
    severity: FindingSeverity | str = Field(default=FindingSeverity.medium, description="Advisory severity")
    lifecycle: FindingLifecycle = Field(default=FindingLifecycle.open, description="Officer review state")
    advisory: bool = Field(default=True, description="Preliminary indicator requiring human verification")
    reason: str = Field(..., description="Plain-language explanation")
    evidence: Any = Field(..., description="Comparison evidence presenting both sides' values and provenance")
    dismissal_reason: str | None = Field(default=None, description="Officer reason if dismissed")

    model_config = ConfigDict(extra="allow")


class CoverageModel(BaseModel):
    mode: str = Field(default="demo_partial_checks", description="Coverage mode")
    summary: str = Field(..., description="Summary of covered checks")
    rules_evaluated: int = Field(..., description="Number of rules evaluated in this run")
    checks_not_evaluated: list[str] = Field(..., description="Checks not evaluated in this slice")


class ValidationResponseModel(BaseModel):
    application_id: str = Field(..., description="Application identifier")
    category: str = Field(..., description="Application category (e.g. EOA_RENEWAL)")
    workflow: ApplicationWorkflow = Field(..., description="Application workflow state")
    decision_support_only: bool = Field(default=True, description="Decision-support indicator")
    simulated: bool = Field(default=True, description="Synthetic data indicator")
    rule_set: str = Field(..., description="Rule set applied")
    rule_set_version: str = Field(default="1.0.0", description="Rule set version")
    coverage: CoverageModel = Field(..., description="Evaluation coverage details")
    checks: list[CheckResultModel] = Field(..., description="Passed or non-actionable check results")
    findings: list[FindingModel] = Field(..., description="Actionable findings requiring human review")

    model_config = ConfigDict(extra="allow")


class HealthResponseModel(BaseModel):
    status: str = Field(default="ok")
    mode: str = Field(default="demo")
    simulated: bool = Field(default=True)


class DemoApplicationItemModel(BaseModel):
    id: str
    category: str
    submitted_on: str
    requested_intake: int
    required_documents: list[str]
    documents: list[dict[str, Any]]
    record: dict[str, Any]

    model_config = ConfigDict(extra="allow")


class DemoApplicationsListModel(BaseModel):
    items: list[DemoApplicationItemModel]
    simulated: bool = Field(default=True)


class DocumentIngestResponseModel(BaseModel):
    application_id: str = Field(..., description="Application identifier")
    document_id: str = Field(..., description="Unique generated document identifier")
    doc_slot: str | None = Field(default=None, description="Assigned document slot (e.g. fire_noc, affidavit)")
    detected_kind: str = Field(..., description="Detected format kind (pdf, png, jpeg)")
    detected_media_type: str = Field(..., description="MIME media type detected via magic bytes")
    byte_size: int = Field(..., description="Exact file size in bytes")
    blake3: str = Field(..., description="BLAKE3 cryptographic digest (hex)")
    sha256: str = Field(..., description="SHA-256 cryptographic digest (hex)")
    storage_key: str = Field(..., description="Content-addressed key in vault storage")
    processing_state: str = Field(default="PERSISTED", description="Current pipeline processing state")
    pipeline_stage: str = Field(default="S1_INGESTION_GATEWAY", description="Current architectural stage")
    ocr_status: str = Field(default="NOT_RUN", description="OCR pipeline status; not run during raw ingestion")
    persistence_status: str = Field(default="VAULT_LOCAL", description="Storage status: persisted in local content-addressed vault")
    is_new_blob: bool = Field(default=True, description="True if blob was newly added; False if deduplicated")
    idempotent_replay: bool = Field(default=False, description="True if request replayed an existing idempotency key")
    simulated: bool = Field(default=True, description="Always true in demo slice")
    advisory: bool = Field(default=True, description="Advisory decision-support indicator")
    created_at: str = Field(..., description="ISO 8601 UTC creation timestamp")
    message: str = Field(..., description="Processing summary message")

    model_config = ConfigDict(extra="allow")


class PageVerdictModel(BaseModel):
    page_index: int = Field(..., description="1-indexed page number")
    label: str = Field(..., description="Page classification label (digital, hybrid, scanned, vector_drawing, blank)")
    reason: str = Field(..., description="Deterministic decision rationale")
    metrics: dict[str, Any] = Field(default_factory=dict, description="Extracted metrics (visible, invisible, sanity, cover_max, cover_sum, paths)")

    model_config = ConfigDict(extra="allow")


class DocumentRouteResponseModel(BaseModel):
    application_id: str = Field(..., description="Application identifier")
    document_id: str = Field(..., description="Document identifier")
    doc_slot: str | None = Field(default=None, description="Assigned document slot")
    detected_kind: str = Field(..., description="Detected format kind (pdf, png, jpeg)")
    detected_media_type: str = Field(..., description="MIME media type")
    byte_size: int = Field(..., description="Exact file size in bytes")
    blake3: str = Field(..., description="BLAKE3 cryptographic digest (hex)")
    sha256: str = Field(..., description="SHA-256 cryptographic digest (hex)")
    storage_key: str = Field(..., description="Storage key in vault")
    routing_outcome: str = Field(..., description="Document-level routing outcome: BRANCH_A_DIGITAL, BRANCH_B_SCANNED, MIXED, VECTOR_DRAWING, BLANK_DOCUMENT, CORRUPT_DOCUMENT, ENCRYPTED_PDF, EMPTY_DOCUMENT, UNSUPPORTED_FORMAT")
    reason: str = Field(..., description="Explanatory decision summary")
    total_pages: int = Field(..., description="Total inspected pages")
    page_counts: dict[str, int] = Field(..., description="Count of pages per label")
    page_verdicts: list[PageVerdictModel] = Field(default_factory=list, description="Per-page routing verdicts")
    processing_state: str = Field(default="ROUTED", description="Pipeline state")
    pipeline_stage: str = Field(default="S2_ROUTER", description="Architectural pipeline stage (Guide §2.1)")
    ocr_status: str = Field(default="NOT_RUN", description="OCR status; routing is not OCR")
    classification_status: str = Field(default="NOT_RUN", description="Document-type classification; routing is not document typing")
    simulated: bool = Field(default=True, description="Always true in demo prototype")
    advisory: bool = Field(default=True, description="Advisory decision-support indicator")

    model_config = ConfigDict(extra="allow")
