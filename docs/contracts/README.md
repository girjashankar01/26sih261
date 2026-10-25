# Frozen API & Data Contracts

This directory contains the frozen JSON Schemas, representative examples, and OpenAPI specification for the AICTE application validation prototype (aligned with Prototype Guide §1.3, §1.5, §3.4, §12.2, and §16).

---

## 1. The Four Separate State Dimensions

To avoid ambiguity, the prototype strictly separates four independent state dimensions (Guide §1.3):

| Dimension | Allowed Values | Owner | Description |
|---|---|---|---|
| **Check result** (per rule evaluation) | `PASS`, `WARNING`, `FAILED_CHECK`, `NOT_CHECKED`, `NEEDS_REVIEW` | Rules Engine | Outcome of evaluating a single deterministic or comparison rule. |
| **Verification status** (per document / entity) | `VERIFIED`, `MISMATCH_DETECTED`, `EXPIRED`, `VERIFICATION_PENDING`, `SOURCE_UNAVAILABLE`, `MANUAL_REVIEW_REQUIRED`, `NOT_SUPPORTED`, `NOT_CHECKED` | Verification Gateway | Status of querying an issuing authority or registry adapter. |
| **Finding lifecycle** (per actionable finding) | `open`, `acknowledged`, `rectification_requested`, `dismissed`, `escalated`, `resolved` | Officer Console | State of human officer action on an identified discrepancy. |
| **Application workflow** (application level) | `DRAFT`, `SUBMITTED`, `VALIDATING`, `NO_FINDINGS_IN_ENABLED_DEMO_CHECKS`, `NEEDS_RECTIFICATION`, `NEEDS_MANUAL_REVIEW`, `VALIDATED_NO_ISSUES`, `UNDER_OFFICER_REVIEW`, `OFFICER_DECISION_RECORDED` | Aggregator + Officer | Overall lifecycle stage of the application package. |

> [!IMPORTANT]
> **Strict Workflow Condition for `VALIDATED_NO_ISSUES` (Guide §1.3):**
> `VALIDATED_NO_ISSUES` is emitted ONLY if ALL four conditions hold:
> 1. Every *mandatory* rule in the active rule set evaluates to `PASS` (`WARNING` or `NOT_CHECKED` blocks it);
> 2. Every document that has a supported verification adapter has status `VERIFIED`;
> 3. No open `medium` or `high` severity flags exist;
> 4. OCR quality gates are satisfied for every page used by a rule.
>
> In partial demo slices (such as Phase 0 / Phase A demo), the system emits `NO_FINDINGS_IN_ENABLED_DEMO_CHECKS` along with explicit rule set coverage metadata. Passing demo checks does not imply application approval or AICTE clearance.

---

## 2. Three-Valued Logic & Evidence Rules (Guide §12.2)

- **Unknown / Ambiguous Inputs:** If an input value is ungrounded, uncalibrated, ambiguous, or unavailable, the evaluation outcome MUST be `NEEDS_REVIEW` or `NOT_CHECKED`. It must **never** silently become `PASS` or trigger a hard `FAILED_CHECK`.
- **Comparison Findings:** Any comparison check/finding MUST present both sides' values and their respective source/provenance (e.g. `submitted` vs `compared_with`, or `left` vs `right`), along with rule ID, rule version, plain-language reason, and precision.
- **Simulation Labels:** Synthetic data and mock sources must always carry explicit simulation markers (`simulated: true`).

---

## 3. The Core Contracts

| Contract | Schema File | Description | Example File |
|---|---|---|---|
| **C1 Unified Payload** | [`c1_unified_payload.schema.json`](c1_unified_payload.schema.json) | Lossless document representation emitted by Branch B ingestion pipeline (§3.4 C1). | [`examples/c1_unified_payload_example.json`](examples/c1_unified_payload_example.json) |
| **C2 Flag** | [`c2_flag.schema.json`](c2_flag.schema.json) | Anomaly/forensics detector signal emitted by Branch A raw forensics (§1.5, §3.4 C2). | [`examples/c2_flag_example.json`](examples/c2_flag_example.json) |
| **C3 Fact** | [`c3_fact.schema.json`](c3_fact.schema.json) | Typed, grounded fact extracted from document, form, or authorized record (§3.4 C3, §12.2). | [`examples/c3_fact_example.json`](examples/c3_fact_example.json) |
| **C4 Check Result** | [`c4_check_result.schema.json`](c4_check_result.schema.json) | Deterministic rule evaluation result (§3.4 C4). | [`examples/c4_check_result_example.json`](examples/c4_check_result_example.json) |
| **C5 Finding** | [`c5_finding.schema.json`](c5_finding.schema.json) | Actionable non-pass discrepancy or indicator requiring human review (§3.4 C5). | [`examples/c5_finding_example.json`](examples/c5_finding_example.json) |
| **C6 Verification Result** | [`c6_verification_result.schema.json`](c6_verification_result.schema.json) | Result from issuing authority registry adapter or mock source (§3.4 C6). | [`examples/c6_verification_result_example.json`](examples/c6_verification_result_example.json) |
| **Validation Response** | [`validation_response.schema.json`](validation_response.schema.json) | Top-level validation report returned by `/api/demo/applications/{id}/validate`. | [`examples/clean_demo_validation.json`](examples/clean_demo_validation.json)<br>[`examples/seeded_defect_validation.json`](examples/seeded_defect_validation.json) |
| **Document Ingestion** | [`document_ingest_response.schema.json`](document_ingest_response.schema.json) | Ingestion response returned by `POST /applications/{id}/documents` (Guide §4 S1). | [`examples/document_ingest_response_example.json`](examples/document_ingest_response_example.json) |
| **Document Forensics** | [`document_forensics_response.schema.json`](document_forensics_response.schema.json) | Forensics analysis response returned by `POST /applications/{id}/documents/{doc_id}/forensics` (Guide §5 S2). | [`examples/document_forensics_response_example.json`](examples/document_forensics_response_example.json) |
| **Document Route** | [`document_route_response.schema.json`](document_route_response.schema.json) | Per-page and document routing response returned by `POST /applications/{id}/documents/{doc_id}/route` (Guide §6 S3). | [`examples/document_route_response_example.json`](examples/document_route_response_example.json) |
| **Document Typing** | [`document_type_response.schema.json`](document_type_response.schema.json) | Document classification and typing response returned by `POST /applications/{id}/documents/{doc_id}/type` (Guide §11.1 S5). | [`examples/document_type_response_example.json`](examples/document_type_response_example.json) |
| **Document Extraction** | [`document_extraction_response.schema.json`](document_extraction_response.schema.json) | Schema-driven field extraction and grounding response returned by `POST /applications/{id}/documents/{doc_id}/fields` (Guide §11.2 S6, §11.3 S6b). | [`examples/document_extraction_response_example.json`](examples/document_extraction_response_example.json) |
| **Application Aggregation** | [`aggregation_response.schema.json`](aggregation_response.schema.json) | Unified aggregation, status, review lanes, priority, and alerts response returned by `GET /applications/{id}/aggregate` (Guide §11.7 S11). | [`examples/aggregation_response_example.json`](examples/aggregation_response_example.json) |
| **Deficiency Notice** | [`deficiency_notice_response.schema.json`](deficiency_notice_response.schema.json) | Formal non-accusatory draft deficiency notice for institution returned by `GET /applications/{id}/exports/deficiency-notice` (Guide §11.8 S12). | [`examples/deficiency_notice_response_example.json`](examples/deficiency_notice_response_example.json) |
| **Inspection Brief** | [`inspection_brief_response.schema.json`](inspection_brief_response.schema.json) | Ground verification briefing for physical inspection team returned by `GET /applications/{id}/exports/inspection-brief` (Guide §11.8 S12). | [`examples/inspection_brief_response_example.json`](examples/inspection_brief_response_example.json) |
| **Application Report** | [`application_report_response.schema.json`](application_report_response.schema.json) | Comprehensive evaluation audit report returned by `GET /applications/{id}/report` (Guide §11.8 S12). | [`examples/application_report_response_example.json`](examples/application_report_response_example.json) |
| **Audit Verification** | [`audit_chain_verification_response.schema.json`](audit_chain_verification_response.schema.json) | Cryptographic hash chain verification report returned by `GET /audit/verify` (Guide §15.1 S13). | [`examples/audit_chain_verification_response_example.json`](examples/audit_chain_verification_response_example.json) |
| **Audit Checkpoint** | [`checkpoint.schema.json`](checkpoint.schema.json) | Signed Ed25519 external checkpoint returned by `POST /audit/checkpoint` (Guide §15.1 S13). | [`examples/checkpoint_example.json`](examples/checkpoint_example.json) |

---

## 4. OpenAPI Specification

The running FastAPI application generates and validates against [`openapi.json`](openapi.json). The API response models in `backend/api/schemas.py` are bound directly to these contracts.
