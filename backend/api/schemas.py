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
    pipeline_stage: str = Field(default="S3_ROUTER", description="Architectural pipeline stage identifier; S3 Route per Guide §2.2")
    ocr_status: str = Field(default="NOT_RUN", description="OCR status; routing is not OCR")
    classification_status: str = Field(default="NOT_RUN", description="Document-type classification; routing is not document typing")
    simulated: bool = Field(default=True, description="Always true in demo prototype")
    advisory: bool = Field(default=True, description="Advisory decision-support indicator")

    model_config = ConfigDict(extra="allow")


class ForensicFlagModel(BaseModel):
    code: str = Field(..., description="Machine-readable indicator code")
    severity: str = Field(..., description="Risk tier: info, low, medium, high")
    reason: str = Field(..., description="Human-readable explanation")
    evidence: dict[str, Any] = Field(..., description="Evidence payload with artifact_uri")
    advisory: bool = Field(default=True, description="Always true; flags are preliminary indicators")
    requires_human_review: bool = Field(default=True)
    detector: dict[str, str] = Field(..., description="Detector name and version")
    simulated: bool = Field(default=True)


class SignatureInfoModel(BaseModel):
    integrity: str = Field(..., description="INTACT_FULL_COVERAGE, MODIFIED_AFTER_SIGNING, BROKEN, NONE")
    trust: str = Field(..., description="production, demo, untrusted")
    source_verification: str = Field(..., description="UNVERIFIED, SIMULATED_SUCCESS, NOT_SUPPORTED")
    name: str | None = Field(default=None)
    signing_time: str | None = Field(default=None)


class ForensicsMetaModel(BaseModel):
    producer: str | None = Field(default=None)
    creator: str | None = Field(default=None)
    title: str | None = Field(default=None)
    author: str | None = Field(default=None)
    subject: str | None = Field(default=None)
    creation_date: str | None = Field(default=None)
    mod_date: str | None = Field(default=None)
    incremental_updates_count: int = Field(default=1)
    signatures: list[SignatureInfoModel] = Field(default_factory=list)


class GeoMetaModel(BaseModel):
    latitude: float | None = Field(default=None)
    longitude: float | None = Field(default=None)
    captured_at: str | None = Field(default=None)
    make: str | None = Field(default=None)
    model: str | None = Field(default=None)


class QRResultModel(BaseModel):
    detected: bool = Field(default=False)
    issuer: str | None = Field(default=None)
    reference: str | None = Field(default=None)
    raw_text_masked: str | None = Field(default=None)


class DetectorStatusModel(BaseModel):
    name: str = Field(...)
    version: str = Field(...)
    status: str = Field(..., description="COMPLETED, NOT_CHECKED, DEFERRED")
    reason: str | None = Field(default=None)


class DocumentForensicsResponseModel(BaseModel):
    application_id: str = Field(..., description="Application identifier")
    document_id: str = Field(..., description="Document identifier")
    doc_slot: str | None = Field(default=None, description="Assigned document slot")
    detected_media_type: str = Field(..., description="MIME media type")
    byte_size: int = Field(..., description="File size in bytes")
    blake3: str = Field(..., description="BLAKE3 digest")
    sha256: str = Field(..., description="SHA-256 digest")
    storage_key: str = Field(..., description="Storage vault key")
    pipeline_stage: str = Field(default="S2_FORENSICS", description="Architectural pipeline stage identifier; S2 Forensics per Guide §2.2")
    flags: list[ForensicFlagModel] = Field(default_factory=list, description="Advisory forensic flags (Guide §3.4 C2)")
    meta: ForensicsMetaModel = Field(default_factory=ForensicsMetaModel)
    geo: GeoMetaModel = Field(default_factory=GeoMetaModel)
    qr: QRResultModel | None = Field(default=None)
    detectors: list[DetectorStatusModel] = Field(default_factory=list)
    simulated: bool = Field(default=True, description="Always true in demo prototype")
    advisory: bool = Field(default=True, description="Advisory decision-support indicator")

    model_config = ConfigDict(extra="allow")


class C1UnifiedPayloadModel(BaseModel):
    schema_version: str = Field(default="4.0", description="Schema version")
    pipeline_version: str = Field(default="4.0.0", description="Pipeline version")
    blake3: str = Field(..., description="BLAKE3 hash")
    sha256: str = Field(..., description="SHA-256 hash")
    kind: str = Field(..., description="pdf, image, office, or scanned")
    coordinate_space: str = Field(default="original_page_norm_topleft")
    pages: list[dict[str, Any]] = Field(default_factory=list)
    tables: list[dict[str, Any]] = Field(default_factory=list)
    blocks: list[dict[str, Any]] = Field(default_factory=list)
    markdown: str = Field(default="")
    flags: list[dict[str, Any]] = Field(default_factory=list)
    engines: list[str] = Field(default_factory=list)
    egress: list[str] = Field(default_factory=list)
    idempotent_cached: bool | None = Field(default=None)

    model_config = ConfigDict(extra="allow")


class ExtractionFailureModel(BaseModel):
    status: str = Field(..., description="NOT_CHECKED or NEEDS_REVIEW_OCR")
    error_code: str = Field(..., description="Machine-readable error code")
    reason: str = Field(..., description="Plain-language reason")
    pipeline_stage: str = Field(default="S4_BRANCH_B")
    page: int | None = Field(default=None)
    preprocess: dict[str, Any] | None = Field(default=None)

    model_config = ConfigDict(extra="allow")



class TypingEvidenceModel(BaseModel):
    phrase: str = Field(..., description="Matched keyword or pattern string")
    pattern: str = Field(..., description="Pattern identifier or regex")
    weight: float = Field(..., description="Pattern weight contributing to score")
    block_id: str | None = Field(default=None, description="Source block identifier")
    bbox_norm: list[float] | None = Field(default=None, description="Normalized bounding box [x0, y0, x1, y1]")


class DocumentTypeResponseModel(BaseModel):
    application_id: str = Field(..., description="Application identifier")
    document_id: str = Field(..., description="Document identifier")
    doc_slot: str | None = Field(default=None, description="Slot name declared during upload")
    doc_type: str = Field(..., description="Classified document type (e.g. FIRE_NOC, ACCREDITATION, EOA_LETTER, AFFIDAVIT) or UNCLASSIFIED")
    confidence: float = Field(..., description="Classification confidence score between 0.0 and 1.0")
    is_classified: bool = Field(..., description="True if accepted with high confidence; False if UNCLASSIFIED requiring manual typing")
    decision_reason: str = Field(..., description="Plain-language reason for classification or unclassified status")
    pipeline_stage: str = Field(default="S5_TYPING", description="Architectural pipeline stage identifier")
    evidence: list[TypingEvidenceModel] = Field(default_factory=list, description="Evidence items with matched phrases and bounding boxes")
    candidate_scores: dict[str, float] = Field(default_factory=dict, description="Normalized score per candidate type")
    flags: list[dict[str, Any]] = Field(default_factory=list, description="Advisory flags such as DOC_TYPE_SLOT_MISMATCH")
    idempotent_cached: bool | None = Field(default=None, description="True if served from database cache")
    simulated: bool = Field(default=True, description="Always true in demo prototype")
    advisory: bool = Field(default=True, description="Advisory decision-support indicator")

    model_config = ConfigDict(extra="allow")


class C3FactModel(BaseModel):
    id: str = Field(...)
    application_id: str = Field(...)
    document_id: str | None = Field(default=None)
    source: str = Field(default="doc")
    entity: str = Field(..., description="Document type or entity name (e.g. FIRE_NOC)")
    key: str = Field(..., description="Field key name")
    raw: str | None = Field(default=None)
    value_type: str = Field(...)
    value: Any | None = Field(default=None)
    parse_state: str = Field(..., description="ok, ambiguous, invalid, unavailable")
    conf: float | None = Field(default=None)
    conf_kind: str = Field(default="regex_exact")
    grounded: bool = Field(...)
    source_ref: str | None = Field(default=None)
    page: int | None = Field(default=None)
    bbox_norm: list[float] | None = Field(default=None)
    bbox_precision: str | None = Field(default=None)
    extractor: str = Field(...)
    extractor_version: str = Field(...)
    needs_confirmation: bool = Field(default=False)
    simulated: bool = Field(default=True)

    model_config = ConfigDict(extra="allow")


class DocumentFieldsResponseModel(BaseModel):
    application_id: str = Field(...)
    document_id: str = Field(...)
    doc_type: str = Field(...)
    completeness_status: str = Field(..., description="COMPLETE, INCOMPLETE, or NOT_CHECKED")
    missing_fields: list[str] = Field(default_factory=list)
    facts: list[C3FactModel] = Field(default_factory=list)
    pipeline_stage: str = Field(default="S6_EXTRACTION")
    idempotent_cached: bool | None = Field(default=None)
    reason: str | None = Field(default=None)
    simulated: bool = Field(default=True)
    advisory: bool = Field(default=True)

    model_config = ConfigDict(extra="allow")


class CanonicalInstituteModel(BaseModel):
    aicte_id: str = Field(..., description="AICTE permanent institute ID")
    name: str = Field(..., description="Canonical institution name from authorised record")
    source: str = Field(default="synthetic_record", description="Source of canonical record")
    address: str | None = Field(default=None, description="Institute registered address")
    state: str | None = Field(default=None, description="Registered state")
    simulated: bool = Field(default=True, description="Always true in demo prototype")

    model_config = ConfigDict(extra="allow")


class NameAliasModel(BaseModel):
    document_id: str | None = Field(default=None, description="Source document ID")
    doc_type: str = Field(..., description="Document type (e.g. FIRE_NOC, ACCREDITATION)")
    extracted_name: str = Field(..., description="Institution name extracted from document")
    canonical_name: str = Field(..., description="Canonical institution name from record")
    match_status: str = Field(..., description="MATCH, LEGAL_FORM_DIFFERS, PARTIAL, DIFFERENT")
    core_extracted: str = Field(..., description="Normalized core tokens of extracted name")
    core_canonical: str = Field(..., description="Normalized core tokens of canonical name")
    legal_forms_extracted: list[str] = Field(default_factory=list, description="Extracted legal form tokens")
    legal_forms_canonical: list[str] = Field(default_factory=list, description="Canonical legal form tokens")

    model_config = ConfigDict(extra="allow")


class ApplicationFactsResponseModel(BaseModel):
    application_id: str = Field(..., description="Application identifier")
    pipeline_stage: str = Field(default="S7_TYPED_FACTS", description="Architectural pipeline stage")
    simulated: bool = Field(default=True, description="Always true in demo prototype")
    decision_support_only: bool = Field(default=True, description="Decision-support advisory flag")
    canonical_institute: CanonicalInstituteModel | None = Field(default=None, description="Resolved canonical institute")
    aliases: list[NameAliasModel] = Field(default_factory=list, description="Document institution name aliases and comparison statuses")
    facts: list[C3FactModel] = Field(default_factory=list, description="All aggregated C3 typed facts across form, records, and docs")
    facts_count: int = Field(..., description="Total count of aggregated facts")

    model_config = ConfigDict(extra="allow")


class C6VerificationResultModel(BaseModel):
    document_id: str = Field(..., description="Identifier of verified document")
    document_type: str | None = Field(default=None, description="Document type")
    adapter: str = Field(..., description="Verification adapter used")
    source: str = Field(..., description="Registry source queried")
    simulated: bool = Field(default=True, description="Always true in demo slice")
    status: VerificationStatus | str = Field(..., description="Verification status dimension")
    request_digest: str | None = Field(default=None, description="Hash of query request payload")
    response_digest: str | None = Field(default=None, description="Hash of response received")
    checked_at: str = Field(..., description="ISO 8601 UTC timestamp of verification")
    integrity: dict[str, Any] | None = Field(default=None, description="Cryptographic integrity")
    trust: dict[str, Any] | None = Field(default=None, description="Trust class")
    compared: dict[str, Any] | None = Field(default=None, description="Field comparison results")
    reason: str = Field(..., description="Plain-language explanation of verification outcome")
    idempotent_cached: bool | None = Field(default=None, description="True if served from database cache")

    model_config = ConfigDict(extra="allow")


class InfraItemResultModel(BaseModel):
    item_key: str = Field(..., description="Checklist item key")
    label: str = Field(..., description="Human-readable label for facility")
    status: str = Field(..., description="EVIDENCE_COMPLETE_FOR_REVIEW, ADDITIONAL_EVIDENCE_REQUIRED, POSSIBLE_DUPLICATE_EVIDENCE, LOCATION_METADATA_INCONSISTENT, INSPECTION_SUGGESTED, NOT_CHECKED")
    reason: str = Field(..., description="Plain-language evaluation reason")
    severity: str = Field(default="info", description="Advisory severity")
    evidence_count: int = Field(..., description="Count of uploaded evidence files")
    flags: list[str] = Field(default_factory=list, description="Advisory flags")

    model_config = ConfigDict(extra="allow")


class InfraChecklistResponseModel(BaseModel):
    application_id: str = Field(..., description="Application identifier")
    pipeline_stage: str = Field(default="S10_INFRA_CHECKLIST", description="Architectural pipeline stage")
    category: str = Field(default="EOA_RENEWAL", description="Application category")
    simulated: bool = Field(default=True, description="Always true in demo slice")
    decision_support_only: bool = Field(default=True, description="Decision support advisory flag")
    overall_status: str = Field(..., description="Overall infra checklist state")
    campus_coordinates: dict[str, float] | None = Field(default=None, description="Campus reference coordinates")
    items: list[InfraItemResultModel] = Field(default_factory=list, description="Item evaluation results")
    total_items: int = Field(..., description="Total checklist items evaluated")

    model_config = ConfigDict(extra="allow")


class ReviewLane(str, Enum):
    NEEDS_SCRUTINY = "NEEDS_SCRUTINY"
    NEEDS_VERIFICATION = "NEEDS_VERIFICATION"
    NEEDS_EVIDENCE = "NEEDS_EVIDENCE"
    FAST_REVIEW = "FAST_REVIEW"


class PriorityBreakdownModel(BaseModel):
    high: int = Field(default=0, description="Count of high-severity findings and flags")
    medium: int = Field(default=0, description="Count of medium-severity findings and flags")
    low: int = Field(default=0, description="Count of low-severity findings and flags")
    age_days: int = Field(default=0, description="Elapsed days since application submission")
    deadline_pressure: int = Field(default=0, description="Bonus score points based on deadline proximity")

    model_config = ConfigDict(extra="allow")


class PriorityScoreModel(BaseModel):
    score: int = Field(..., description="Queue order priority score")
    formula: str = Field(
        default="100·high + 30·medium + 5·low + age_days + deadline_pressure",
        description="Priority formula tooltip"
    )
    breakdown: PriorityBreakdownModel = Field(..., description="Component breakdown of priority score")

    model_config = ConfigDict(extra="allow")


class AlertModel(BaseModel):
    id: str = Field(..., description="Unique alert identifier")
    application_id: str = Field(..., description="Application identifier")
    category: str = Field(..., description="Alert category classification")
    severity: str = Field(..., description="Alert severity level")
    title: str = Field(..., description="Human-readable alert title")
    message: str = Field(..., description="Detailed alert message")
    created_at: str = Field(..., description="ISO 8601 UTC timestamp")

    model_config = ConfigDict(extra="allow")


class AggregationSummaryModel(BaseModel):
    total_documents: int = Field(..., description="Total documents uploaded for application")
    total_checks: int = Field(..., description="Total rule checks evaluated")
    passed_checks: int = Field(..., description="Count of PASS checks")
    failed_checks: int = Field(..., description="Count of FAILED_CHECK checks")
    needs_review_checks: int = Field(..., description="Count of NEEDS_REVIEW or NOT_CHECKED checks")
    open_findings: int = Field(..., description="Count of unresolved open actionable findings")
    verifications_count: int = Field(..., description="Count of issuing authority verification checks")
    infra_items_count: int = Field(..., description="Count of physical infrastructure items evaluated")

    model_config = ConfigDict(extra="allow")


class AggregationResponseModel(BaseModel):
    application_id: str = Field(..., description="Application identifier")
    pipeline_stage: str = Field(default="S11_AGGREGATION", description="Architectural pipeline stage")
    category: str = Field(default="EOA_RENEWAL", description="Application category")
    workflow_status: str = Field(..., description="Application workflow state (NEEDS_RECTIFICATION, NEEDS_MANUAL_REVIEW, VALIDATED_NO_ISSUES)")
    review_lane: ReviewLane | str = Field(..., description="Assigned review lane for officer routing")
    priority: PriorityScoreModel = Field(..., description="Queue priority score and calculation breakdown")
    summary: AggregationSummaryModel = Field(..., description="High-level counts summary")
    checks: list[dict[str, Any]] = Field(default_factory=list, description="C4 check results")
    findings: list[dict[str, Any]] = Field(default_factory=list, description="C5 actionable findings")
    verifications: list[dict[str, Any]] = Field(default_factory=list, description="C6 verification outcomes")
    infra_checklist: list[dict[str, Any]] = Field(default_factory=list, description="S10 infrastructure item results")
    alerts: list[AlertModel] = Field(default_factory=list, description="Structured alerts for officer attention")
    simulated: bool = Field(default=True, description="Always true in demo prototype")
    decision_support_only: bool = Field(default=True, description="Always true. Prototype does not make approvals.")
    created_at: str = Field(..., description="ISO 8601 UTC timestamp of aggregation")

    model_config = ConfigDict(extra="allow")


# --- S12 Review & Officer Console Schemas ---

class FindingActionRequestModel(BaseModel):
    action: str = Field(..., description="Action to perform: acknowledge, request_rectification, dismiss, escalate, resolve")
    actor: str = Field(..., description="Officer identifier performing action")
    reason: str | None = Field(default=None, description="Mandatory justification reason for dismiss/escalate/rectify")
    notes: str | None = Field(default=None, description="Optional officer notes")
    user_role: str = Field(default="officer", description="Role of officer: officer, senior_officer")

    model_config = ConfigDict(extra="allow")


class FindingActionResponseModel(BaseModel):
    id: str = Field(..., description="Unique action event ID")
    application_id: str = Field(..., description="Application identifier")
    finding_id: str = Field(..., description="Target finding identifier")
    action: str = Field(..., description="Action performed")
    previous_state: str = Field(..., description="Previous finding lifecycle state")
    new_state: str = Field(..., description="New finding lifecycle state")
    actor: str = Field(..., description="Officer identifier")
    reason: str = Field(default="", description="Officer justification reason")
    notes: str | None = Field(default=None, description="Officer notes")
    created_at: str = Field(..., description="ISO 8601 UTC timestamp")
    audit_event_id: int | None = Field(default=None, description="Linked S13 audit event ID")
    audit_entry_hash: str | None = Field(default=None, description="Linked S13 audit entry hash")

    model_config = ConfigDict(extra="allow")


class DeficiencyItemModel(BaseModel):
    finding_id: str = Field(..., description="Finding identifier")
    rule_id: str | None = Field(default=None, description="Triggering rule ID")
    category: str | None = Field(default=None, description="Discrepancy category")
    observed: Any = Field(..., description="Observed value from submission")
    expected: Any = Field(..., description="Expected value from record or norm")
    action_required: str = Field(..., description="Clear instruction for rectification")
    handbook_reference: str = Field(..., description="AICTE Handbook clause reference")
    status: str = Field(default="OPEN", description="Deficiency status")

    model_config = ConfigDict(extra="allow")


class DeficiencyNoticeResponseModel(BaseModel):
    notice_id: str = Field(..., description="Unique deficiency notice draft ID")
    application_id: str = Field(..., description="Application identifier")
    document_type: str = Field(default="DEFICIENCY_NOTICE_DRAFT", description="Document type")
    status: str = Field(default="DRAFT", description="Notice lifecycle state")
    actor: str = Field(..., description="Officer or system generator")
    deficiencies_count: int = Field(..., description="Count of rectifiable deficiencies")
    deficiencies: list[DeficiencyItemModel] = Field(default_factory=list, description="Deficiency items with two-sided evidence")
    advisory_banner: str = Field(..., description="Advisory disclaimer")
    simulated: bool = Field(default=True, description="Always true in demo slice")
    decision_support_only: bool = Field(default=True, description="Decision support advisory flag")
    created_at: str = Field(..., description="ISO 8601 UTC timestamp")

    model_config = ConfigDict(extra="allow")


class InspectionBriefFacilityModel(BaseModel):
    item_key: str = Field(..., description="Facility item key")
    facility: str = Field(..., description="Facility name")
    reason: str = Field(..., description="Reason for ground verification")
    evidence_status: str = Field(..., description="Automated evidence checklist state")
    inspection_focus: str = Field(..., description="Instructions for physical inspection team")

    model_config = ConfigDict(extra="allow")


class InspectionBriefVerificationModel(BaseModel):
    document_id: str = Field(..., description="Document identifier")
    adapter: str = Field(..., description="Verification adapter used")
    status: str = Field(..., description="Verification status")
    reason: str = Field(..., description="Verification outcome explanation")
    inspection_focus: str = Field(..., description="Instructions for physical verification")

    model_config = ConfigDict(extra="allow")


class InspectionBriefResponseModel(BaseModel):
    brief_id: str = Field(..., description="Unique inspection brief ID")
    application_id: str = Field(..., description="Application identifier")
    document_type: str = Field(default="PHYSICAL_INSPECTION_BRIEF", description="Document type")
    status: str = Field(default="READY_FOR_INSPECTION_TEAM", description="Status")
    actor: str = Field(..., description="Officer or system generator")
    campus_coordinates: dict[str, float] | None = Field(default=None, description="Registered campus coordinates")
    facilities_to_inspect_count: int = Field(..., description="Count of facilities requiring ground check")
    facilities_to_inspect: list[InspectionBriefFacilityModel] = Field(default_factory=list, description="Facilities list")
    pending_verifications_count: int = Field(..., description="Count of document verifications requiring ground check")
    pending_verifications: list[InspectionBriefVerificationModel] = Field(default_factory=list, description="Verifications list")
    advisory_banner: str = Field(..., description="Advisory disclaimer")
    simulated: bool = Field(default=True, description="Always true in demo slice")
    decision_support_only: bool = Field(default=True, description="Decision support advisory flag")
    created_at: str = Field(..., description="ISO 8601 UTC timestamp")

    model_config = ConfigDict(extra="allow")


class ChecklistReportItemModel(BaseModel):
    rule_id: str = Field(..., description="Rule identifier or PLANNED")
    category: str | None = Field(default=None, description="Checklist item category")
    status: str = Field(..., description="Evaluation outcome: PASS, FAILED_CHECK, NEEDS_REVIEW, NOT_CHECKED, NOT_RUN")
    reason: str = Field(..., description="Explanation of evaluation")
    evaluated: bool = Field(..., description="True if evaluated in active demo rule set")

    model_config = ConfigDict(extra="allow")


class ApplicationReportResponseModel(BaseModel):
    report_id: str = Field(..., description="Unique evaluation report ID")
    application_id: str = Field(..., description="Application identifier")
    pipeline_stage: str = Field(default="S12_REPORT_VIEW", description="Architectural pipeline stage")
    category: str = Field(default="EOA_RENEWAL", description="Application category")
    rule_set_version: str = Field(..., description="Rule set version evaluated")
    data_snapshot_id: str = Field(..., description="Cryptographic snapshot digest of input facts")
    audit_chain_head: str = Field(..., description="SHA-256 head hash of audit trail chain")
    documents_count: int = Field(..., description="Count of uploaded documents")
    checklist: list[ChecklistReportItemModel] = Field(default_factory=list, description="Complete evaluation checklist table")
    findings: list[dict[str, Any]] = Field(default_factory=list, description="Findings with officer action history")
    verifications: list[dict[str, Any]] = Field(default_factory=list, description="Verification outcomes")
    infra_checklist: list[dict[str, Any]] = Field(default_factory=list, description="Physical infra evidence evaluations")
    advisory_banner: str = Field(..., description="Advisory disclaimer")
    simulated: bool = Field(default=True, description="Always true in demo slice")
    decision_support_only: bool = Field(default=True, description="Decision support advisory flag")
    created_at: str = Field(..., description="ISO 8601 UTC timestamp")

    model_config = ConfigDict(extra="allow")


# --- S13 Audit Trail & RBAC Schemas ---

class AuditEventModel(BaseModel):
    id: int = Field(..., description="Sequential audit event ID")
    ts: str = Field(..., description="ISO 8601 UTC timestamp")
    actor: str = Field(..., description="User or service actor")
    action: str = Field(..., description="Action name")
    subject: str = Field(..., description="Subject resource URI / ID")
    details: Any = Field(..., description="Event details payload")
    canonical: str = Field(..., description="Deterministic canonical JSON string")
    prev_hash: str = Field(..., description="SHA-256 hash of previous audit event")
    entry_hash: str = Field(..., description="SHA-256 hash of this canonical event")

    model_config = ConfigDict(extra="allow")


class AuditEventsListResponseModel(BaseModel):
    total_events: int = Field(..., description="Total audit events returned")
    events: list[AuditEventModel] = Field(default_factory=list, description="Audit events")

    model_config = ConfigDict(extra="allow")


class AuditChainVerificationResponseModel(BaseModel):
    ok: bool = Field(..., description="True if hash chain integrity is 100% verified")
    head: str = Field(..., description="Current head SHA-256 hash of audit chain")
    count: int = Field(..., description="Count of verified events in chain")
    first_bad_id: int | None = Field(default=None, description="First tampered or invalid event ID if ok=False")
    reason: str | None = Field(default=None, description="Integrity failure reason if ok=False")
    verified_at: str = Field(..., description="ISO 8601 UTC timestamp of verification")

    model_config = ConfigDict(extra="allow")


class CheckpointModel(BaseModel):
    id: str = Field(..., description="Unique checkpoint ID")
    upto_id: int = Field(..., description="Event ID up to which chain is anchored")
    head_hash: str = Field(..., description="Head SHA-256 hash at upto_id")
    signature: str = Field(..., description="Ed25519 signature of 'upto_id:head_hash'")
    key_id: str = Field(..., description="Identifier of trusted signing key")
    created_at: str = Field(..., description="ISO 8601 UTC timestamp")

    model_config = ConfigDict(extra="allow")


class CheckpointsListResponseModel(BaseModel):
    total_checkpoints: int = Field(..., description="Total checkpoints returned")
    checkpoints: list[CheckpointModel] = Field(default_factory=list, description="Checkpoints list")

    model_config = ConfigDict(extra="allow")





