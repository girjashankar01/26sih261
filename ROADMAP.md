# AICTE Application Validation Platform — Feature Roadmap & UI Specification
**Problem Statement:** SIH 2026 · PS 26261 · AICTE Regulation Bureau  
**Project Version:** Phase A/B Transition · Document Version: v1.0  
**Target Delivery:** Complete, Interactive Decision-Support Website & Officer Console  

---

## 1. Executive Summary & Current Gap Analysis

### 1.1 The Reality: Backend vs. Frontend
* **Backend Capabilities (Fully Built & Verified):**
  * All 13 core pipeline stages (**S1 through S13**) are implemented in Python (CPython 3.12.14).
  * 24 active REST API endpoints are registered in `backend/api/main.py`.
  * Comprehensive database repository in `backend/db/repository.py` backing SQLite/PostgreSQL with transaction-isolated hash chaining.
  * Over 40 Pydantic contracts in `backend/api/schemas.py` and matching JSON schemas in `docs/contracts/`.
  * 151 unit and regression tests pass with 100% green status (`tests/test_*.py`).
  * End-to-end verified with test data via `scripts/e2e_demo_walkthrough.py`.

* **Frontend Reality (Current State):**
  * The frontend consists solely of a minimal 37-line static HTML file (`ui/index.html`) and a minified stylesheet (`ui/style.css`).
  * It only calls **2 out of 24 backend endpoints** (`GET /api/demo/applications` and `GET /api/demo/applications/{id}/validate`).
  * **Zero interactive functionality:** Users cannot upload documents, cannot view bounding box provenance in the Evidence Viewer, cannot trigger officer actions (acknowledge, dismiss, request rectification), cannot view issuing authority verifications, cannot inspect infrastructure photos or GPS geotags, cannot generate deficiency notices, and cannot verify cryptographic audit hash chains.

### 1.2 Mission Objective
Transform the website from a static demo viewer into a **fully functional, interactive Decision-Support Portal & Officer Review Console** implementing all specifications from the SIH Master Theory, Prototype Guide v4.2, and Proposal Pack.

---

## 2. Theory & Regulatory References (For Agents & Developers)

Every feature in this roadmap traces directly to the official working theory and reference documentation:

| Document Key | File Path | Core Purpose & Sections |
|:---|:---|:---|
| **[MASTER]** | `SIH26261_MASTER.md` | Master specification replacing legacy drafts. Defines the 13 pipeline stages (§2), precedence rules (§0), state dimensions (§1), and exit gates (§6). |
| **[THEORY]** | `SIH26261_Proposal_and_Theory_Pack.md` | Proposal brief (§1), pain points P1–P7 (§2), demo flow & screen list (§8.3), and evaluation criteria (§10). |
| **[GUIDE]** | `docs/reference/sih26261-prototype-guide-v4.2.md` | In-depth engineering manual. Section 17 defines the **Officer Console and Evidence Viewer**, §11.8 defines draft exports, §15 defines audit trails. |
| **[SPEC-A]** | `docs/spec/phase-a.md` | Phase A functional boundary for single-category EoA renewal. |
| **[DECISIONS]** | `docs/decisions.md` | Decisions log, verified benchmarks, and non-negotiables. |

### 2.1 Non-Negotiable Ground Rules
1. **AI Proposes, Rules Decide, Officers Approve:** The platform never approves or rejects applications. It presents preliminary indicators for human verification.
2. **Four Separate State Dimensions (Never overloaded into one `status`):**
   * **Check Result:** `PASS` · `WARNING` · `FAILED_CHECK` · `NOT_CHECKED` · `NEEDS_REVIEW`
   * **Verification Status:** `VERIFIED` · `MISMATCH_DETECTED` · `EXPIRED` · `VERIFICATION_PENDING` · `SOURCE_UNAVAILABLE` · `MANUAL_REVIEW_REQUIRED` · `NOT_SUPPORTED` · `NOT_CHECKED`
   * **Finding Lifecycle:** `open` → `acknowledged` → `rectification_requested` → `dismissed` (reason mandatory) → `escalated` → `resolved`
   * **Workflow State:** `DRAFT` → `SUBMITTED` → `VALIDATING` → (`VALIDATED_NO_ISSUES` \| `NEEDS_RECTIFICATION` \| `NEEDS_MANUAL_REVIEW`) → `UNDER_OFFICER_REVIEW` → `OFFICER_DECISION_RECORDED`
3. **Fail-Visible Honesty:** Unavailable or un-evaluated checks are strictly `NOT_CHECKED` or `NEEDS_REVIEW`, never `PASS`.
4. **Both Compared Values:** Findings must display both the observed document value and the canonical expected record/norm.
5. **Clear Simulation Labeling:** All simulated portal/issuer adapters must carry a prominent `SIMULATED` badge in UI and API.

---

## 3. Master UI/UX Specification (Guide §17)

The website must implement **9 dedicated views/panels**:

```mermaid
flowchart TD
    NAV["Top Navigation Bar (Role Switcher, Realness Badge, Global SLA)"] --> Q["1. Queue / Triage Dashboard"]
    NAV --> APP["2. Application Detail Console"]
    NAV --> RULES["7. Rules & Checklists Explorer"]
    NAV --> AUDIT["8. Audit Trail & Tamper Console"]
    NAV --> REAL["9. System Realness & Transparency"]

    APP --> TAB1["Checklist Transparency Tab"]
    APP --> TAB2["Documents & Upload Tab"]
    APP --> TAB3["Findings & Evidence Viewer (Centrepiece)"]
    APP --> TAB4["Issuing Authority Verifications Tab"]
    APP --> TAB5["Infrastructure Evidence Tab"]
    APP --> TAB6["Officer Exports & Actions Tab"]
```

### 3.1 Screen Breakdown
1. **Queue Dashboard (`/` or `/queue`):** Review lanes (`NEEDS_SCRUTINY`, `NEEDS_VERIFICATION`, `NEEDS_EVIDENCE`, `FAST_REVIEW`), priority score formula tooltip ($100H + 30M + 5L + \text{age} + \text{deadline}$), SLA countdown badges, and KPI counters.
2. **Application Detail (`/applications/:id`):** Header displaying canonical name, AICTE ID, category, workflow state, and alert badges, plus a 6-tab inspection console.
3. **Evidence Viewer (Centrepiece):** Original document page render with interactive bounding box canvas overlay (`bbox_norm`). Solid borders for `word` precision, dashed for `block`. Click-to-inspect highlights **both** sides of a finding (document vs. record).
4. **Verification Panel:** Issuer adapters, status breakdown (8 statuses), pyHanko signature validity, and QR locator details with `SIMULATED` tags.
5. **Infrastructure Evidence Tab:** Physical evidence inspection; GPS coordinates vs. campus distance calculation (Haversine formula); DCT pHash duplicate warning banner.
6. **Officer Export Center:** Live generator for draft Deficiency Notices (omitting internal anomaly tags), Ground Inspection Briefs, and Full Evaluation Reports.
7. **Audit & Tamper Console (`/audit`):** Sequential SHA-256 hash chain log, Ed25519 checkpoint verification, and an interactive **Live Tamper Demonstration** button showing fail-visible chain breakage.
8. **Rules Explorer (`/rules`):** Versioned YAML rule browser displaying conditions, tests, and `synthetic_demo` badges.
9. **Realness Page (`/about/realness`):** Complete honest matrix of what is live vs. simulated.

---

## 4. Step-by-Step Implementation Roadmap

The implementation is broken down into **10 manageable, sequential steps**. Each step specifies files to modify, backend endpoints to connect, visual elements to build, and acceptance criteria.

---

### Step 1: Modern Frontend Application Shell & Client Architecture
* **Goal:** Replace the 37-line static page with a clean, modular single-page application (SPA) architecture utilizing modern semantic HTML5, CSS custom properties, and vanilla ES modules (zero heavy build-chain friction, perfectly compatible with FastAPI static serving).
* **Files Affected:**
  * `ui/index.html` (Application shell)
  * `ui/css/main.css` (Design system, typography, color tokens, layout grid)
  * `ui/js/app.js` (Router and application lifecycle)
  * `ui/js/api.js` (Unified async client for all 24 backend endpoints)
  * `ui/js/state.js` (Reactive state store for selected application, documents, findings)
* **Features to Implement:**
  * Top navigation bar with: System Title, Active Role selector (`officer`, `institution`, `auditor`), System Mode badge (`OFFLINE - SOVEREIGN`), and Emergency Advisory Banner.
  * Tabbed navigation: **Queue**, **Application Workspace**, **Rules Explorer**, **Audit Console**, and **About / Realness**.
  * Responsive layout with collapsible sidebar for application selection and notifications drawer.
* **Acceptance Criteria:**
  * SPA shell loads instantly at `http://127.0.0.1:8000/`.
  * Navigation switches views smoothly without full page reloads.
  * Role switcher changes context and simulates role-based view adjustments.

---

### Step 2: Document Intake & Multi-Slot Upload Interface (Wiring S1 & S3)
* **Goal:** Enable live document uploading directly from the web interface into the S1 content-addressed vault.
* **Files Affected:**
  * `ui/js/components/upload_modal.js`
  * `ui/js/components/document_list.js`
  * `backend/api/main.py` (Verify CORS / multipart upload handling)
* **Endpoints Connected:**
  * `POST /applications/{id}/documents` (Multipart streaming upload)
  * `GET /applications/{id}/documents/{doc_id}/route` (S3 Routing result)
* **Features to Implement:**
  * Drag-and-drop file upload zone supporting PDF, PNG, and JPEG files.
  * Document slot selection dropdown (`affidavit`, `fire_noc`, `site_plan`, `building_photo`).
  * Real-time client-side hashing feedback (showing BLAKE3/SHA-256 progress).
  * Document registry list showing: Upload ID, slot, file size, detected magic type, routing verdict (`BRANCH_A_DIGITAL` vs. `BRANCH_B_SCANNED`), and timestamp.
* **Acceptance Criteria:**
  * Uploading a real PDF streams to the vault, updates the database, and displays a success card with cryptographic digests.
  * S3 routing verdict is immediately shown on the uploaded document card.

---

### Step 3: Officer Queue & Triage Dashboard (Wiring S11)
* **Goal:** Implement the officer priority triage screen with review lanes and deadline pressure calculations.
* **Files Affected:**
  * `ui/js/components/queue_view.js`
  * `ui/css/queue.css`
* **Endpoints Connected:**
  * `GET /api/demo/applications`
  * `GET /applications/{id}/aggregate`
* **Features to Implement:**
  * 4 Review Lane Buckets:
    1. **Needs Scrutiny:** Critical discrepancies, high-severity findings, unclassified docs.
    2. **Needs Verification:** Pending issuer verifications or source outages.
    3. **Needs Evidence:** Missing infrastructure photos or insufficient floor plans.
    4. **Fast Review:** Applications where all mandatory rules pass and verifications succeed.
  * Priority Score Widget showing exact formula breakdown:
    $$\text{Score} = (100 \times H) + (30 \times M) + (5 \times L) + \text{Age} + \text{Deadline Pressure}$$
  * Key Performance Indicator (KPI) cards: Total in Queue, SLA At-Risk (<7 days), Average Review Time.
  * Search and filter bar (by Application ID, Category, Institution Name).
* **Acceptance Criteria:**
  * Applications are sorted correctly into lane columns based on backend S11 aggregation.
  * Hovering over the priority score displays the breakdown tooltip.
  * Clicking an application card navigates directly into its Application Console.

---

### Step 4: Application Workspace & Checklist Transparency Table (Wiring S7, S8, S11)
* **Goal:** Provide a comprehensive institutional evaluation console with complete checklist transparency.
* **Files Affected:**
  * `ui/js/components/application_header.js`
  * `ui/js/components/checklist_table.js`
* **Endpoints Connected:**
  * `GET /applications/{id}/facts` (S7 Aggregated Facts & Entity Resolution)
  * `POST /applications/{id}/validate` (S8 Rules Evaluation)
  * `GET /applications/{id}/aggregate` (S11 Status & Alerts)
* **Features to Implement:**
  * Workspace Header: Institution Name, Canonical Name status, Category, Application ID, Workflow state badge (`NEEDS_RECTIFICATION`, `VALIDATED_NO_ISSUES`), and active alerts banner.
  * **Checklist Transparency Table:** Shows every rule evaluation row:
    * Status pills: `PASS` (Green), `WARNING` (Yellow), `FAILED_CHECK` (Red), `NOT_CHECKED` (Gray), `NEEDS_REVIEW` (Purple).
    * Rule ID, rule name, category, and plain English rationale.
    * Source indicators: Document vs. Form vs. Authorized Record.
    * Filter buttons: *All | Issues Only | Passed | Not Checked*.
* **Acceptance Criteria:**
  * The checklist table explicitly distinguishes between `FAILED_CHECK` and `NOT_CHECKED` (no ambiguous failures).
  * Institution entity resolution details (canonical name vs. document aliases) are visible.

---

### Step 5: Interactive Evidence Viewer & Findings Console (Centrepiece — Wiring S4, S6, S8, S12)
* **Goal:** Build the centrepiece of the platform: an interactive document viewer that overlays extracted bounding boxes on original document pages and links directly to findings.
* **Files Affected:**
  * `ui/js/components/evidence_viewer.js`
  * `ui/js/components/finding_card.js`
  * `ui/css/viewer.css`
* **Endpoints Connected:**
  * `GET /applications/{id}/documents/{doc_id}/extract` (C1 Unified Payload & Blocks)
  * `GET /applications/{id}/documents/{doc_id}/fields` (Grounded Facts with `bbox_norm`)
  * `POST /applications/{id}/findings/{finding_id}/act` (Officer action on finding)
  * `GET /applications/{id}/findings/actions` (Action audit history)
* **Features to Implement:**
  * **Split-Screen Layout:**
    * *Left:* Document canvas renderer (renders PDF pages / images) with dynamic SVG overlay.
    * *Right:* Finding inspector panel.
  * **Bounding Box Overlay Math (Guide §17.2):**
    * For canvas dimensions $W \times H$:
      $$\text{left} = x_0 \cdot W, \quad \text{top} = y_0 \cdot H, \quad \text{width} = (x_1 - x_0) \cdot W, \quad \text{height} = (y_1 - y_0) \cdot H$$
    * Render `word` precision with solid borders and `block` precision with dashed borders.
  * **Two-Sided Comparison Card:**
    * *Observed Value:* Value extracted from document with page number and precision badge.
    * *Expected Value:* Value required by AICTE regulation or synthetic record.
  * **Interactive Officer Action Bar:**
    * Buttons: `Acknowledge`, `Request Rectification`, `Dismiss`, `Escalate`.
    * Modal popup for `Dismiss` and `Request Rectification` requiring a **mandatory text reason** (preventing unreasoned overrides).
    * Action timeline displaying officer override history beside the finding.
* **Acceptance Criteria:**
  * Clicking a finding immediately highlights the exact bounding box on the document canvas.
  * Submitting an action successfully updates the finding state and appends to the audit trail.
  * Dismissing without a reason is blocked by the UI.

---

### Step 6: Issuing Authority Verification Gateway Panel (Wiring S9)
* **Goal:** Expose the S9 Verification Gateway, showing independent issuer checks, QR code references, and digital signature validations.
* **Files Affected:**
  * `ui/js/components/verification_panel.js`
  * `ui/css/verification.css`
* **Endpoints Connected:**
  * `POST /applications/{id}/documents/{doc_id}/verify`
  * `GET /applications/{id}/documents/{doc_id}/forensics`
* **Features to Implement:**
  * Verification status pill for each document displaying one of the 8 honest statuses:
    `VERIFIED`, `MISMATCH_DETECTED`, `EXPIRED`, `VERIFICATION_PENDING`, `SOURCE_UNAVAILABLE`, `MANUAL_REVIEW_REQUIRED`, `NOT_SUPPORTED`, `NOT_CHECKED`.
  * **Three-Part Verification Breakdown:**
    1. *Integrity:* SHA-256 digest match / PDF digital signature validity.
    2. *Trust:* Production trust chain vs. Demo Root CA.
    3. *Source Verification:* Registry comparison response.
  * Prominent **SIMULATED** badge on all synthetic adapter outcomes.
  * QR Code inspector showing decoded URL/payload (with sensitive data masked).
  * Manual verification trigger button for officers when source is unavailable.
* **Acceptance Criteria:**
  * The expired Fire NOC accurately shows `EXPIRED` status with simulated registry explanation.
  * Digital signature verification displays pyHanko validation status and trust level.

---

### Step 7: Infrastructure Evidence Checklist & Geotag Review (Wiring S10)
* **Goal:** Review physical infrastructure evidence photos, GPS campus distance calculations, and perceptual hash deduplication.
* **Files Affected:**
  * `ui/js/components/infra_panel.js`
  * `ui/css/infra.css`
* **Endpoints Connected:**
  * `GET /applications/{id}/infra`
* **Features to Implement:**
  * Facility checklist items: Computer Center, Classrooms, Central Library.
  * Geotag Inspector:
    * Displays extracted EXIF latitude/longitude and capture timestamp.
    * Displays calculated Haversine distance from registered campus coordinates:
      $$d = 2R \arcsin\left(\sqrt{\sin^2\left(\frac{\Delta \text{lat}}{2}\right) + \cos(\text{lat}_1)\cos(\text{lat}_2)\sin^2\left(\frac{\Delta \text{lon}}{2}\right)}\right)$$
    * Visual alert if $d > \text{radius\_km}$ (`LOCATION_METADATA_INCONSISTENT`).
  * Perceptual Hash (pHash) Duplicate Detector:
    * Shows 64-bit DCT pHash digest.
    * Warns if Hamming distance $\le 6$ against evidence uploaded by other institutions (`POSSIBLE_DUPLICATE_EVIDENCE`).
  * Facility status badges: `EVIDENCE_COMPLETE_FOR_REVIEW`, `ADDITIONAL_EVIDENCE_REQUIRED`, `INSPECTION_SUGGESTED`.
* **Acceptance Criteria:**
  * Facility items clearly display photo counts vs. minimum required norms.
  * Evidence photos show geotag coordinates and campus distance.

---

### Step 8: Officer Draft Exports & Document Generation (Wiring S12)
* **Goal:** Enable officers to generate and download official draft Deficiency Notices, Ground Inspection Briefs, and Evaluation Reports.
* **Files Affected:**
  * `ui/js/components/exports_modal.js`
* **Endpoints Connected:**
  * `GET /applications/{id}/exports/deficiency-notice`
  * `GET /applications/{id}/exports/inspection-brief`
  * `GET /applications/{id}/report`
* **Features to Implement:**
  * **Deficiency Notice Generator Modal:**
    * Compiles formal letter addressed to the institution.
    * Lists only open rectifiable findings with two-sided evidence.
    * Strictly omits internal anomaly flags or forensic technicalities.
    * Copy-to-clipboard and PDF/print formatted view.
  * **Ground Inspection Brief Modal:**
    * Generates checklist for physical visiting teams.
    * Flags facilities with `INSPECTION_SUGGESTED` or missing evidence.
    * Includes advisory indicators under the non-punitive advisory banner.
  * **Comprehensive Evaluation Report View:**
    * Complete formal summary report with audit chain head hash.
* **Acceptance Criteria:**
  * Clicking "Generate Deficiency Notice" renders a clean printable draft with all open deficiencies.
  * Dismissed findings are automatically excluded from the deficiency notice.

---

### Step 9: Tamper-Evident Audit Trail & Interactive Tamper Demo (Wiring S13)
* **Goal:** Provide full cryptographic audit transparency and an interactive live demonstration of hash-chain tamper detection.
* **Files Affected:**
  * `ui/js/components/audit_view.js`
  * `ui/css/audit.css`
* **Endpoints Connected:**
  * `GET /audit/events`
  * `GET /audit/verify`
  * `POST /audit/checkpoint`
  * `GET /audit/checkpoints`
* **Features to Implement:**
  * **Sequential Audit Log:** Paginated timeline displaying timestamp, actor, action, subject, entry hash, and prev hash.
  * **Live Chain Integrity Verifier:**
    * "Verify Hash Chain" button that runs `verify_chain()` from Genesis to Head.
    * Displays Green Checkmark: "Cryptographic Integrity Verified: $N$ sequential events linked without tampering."
  * **Ed25519 Checkpoint Card:**
    * Shows latest signed checkpoint ID, timestamp, and asymmetric signature.
    * Shows verification against trusted key `aicte-ed25519-2026-demo`.
  * **Interactive Tamper Demo Feature:**
    * Button: "Simulate Database Tampering".
    * Modifies a sandbox audit row or timestamp.
    * Re-runs verification and demonstrates fail-visible red alert:
      * *Integrity Broken: Event #X failed checksum! Entry hash does not match canonical payload.*
    * Button: "Restore Database Integrity".
* **Acceptance Criteria:**
  * Audit log displays all pipeline and officer actions in strict chronological order.
  * Tamper demo clearly proves to evaluators that unauthorized database edits are immediately caught.

---

### Step 10: Rules Explorer, Realness Matrix & Polish (Guide §1.4, §17.3)
* **Goal:** Complete the remaining educational and transparency screens, keyboard triage shortcuts, and final UI polish.
* **Files Affected:**
  * `ui/js/components/rules_view.js`
  * `ui/js/components/realness_view.js`
  * `ui/js/components/keyboard_shortcuts.js`
* **Features to Implement:**
  * **Rules & Checklists Explorer (`/rules`):**
    * Interactive YAML viewer for `EOA_RENEWAL.yaml` and schema definitions.
    * Displays rule ID, category, effective dates, and `synthetic_demo` badges.
  * **System Realness & Transparency Matrix (`/about/realness`):**
    * Honest comparison table of Real vs. Simulated components:
      * *Real:* Ingestion, BLAKE3/SHA-256, Docling extraction, rules engine, entity resolution, EXIF geotags, hash chain audit.
      * *Simulated:* AICTE records database, State Fire Service QR registry, Issuer root certificates.
  * **Keyboard Triage Shortcuts (Guide §17.3):**
    * `J` / `K`: Next / Previous finding.
    * `A`: Acknowledge finding.
    * `D`: Dismiss finding (opens reason dialog).
    * `R`: Request rectification.
    * `E`: Escalate finding.
    * `V`: Verify audit chain.
    * `/`: Focus search bar.
  * **Keyboard Shortcut Helper Modal:** Pressing `?` displays all shortcut keys.
* **Acceptance Criteria:**
  * Navigating with J/K cycles through findings and auto-highlights corresponding document regions.
  * Realness matrix clearly satisfies SIH evaluation requirements regarding honesty and simulation labeling.

---

## 5. Granular Micro-Steps Breakdown (58 Atomic Actionable Steps)

To enable incremental development, verification, and easy task delegation across autonomous agents and teammates, the 10 major phases are subdivided into **58 atomic, testable micro-steps**. Each step specifies the affected files, connected APIs, exact tasks, and validation checks.

```
Phase 1: Application Shell & Client Infrastructure   ──> Steps 01 to 06
Phase 2: Document Intake & Multi-Slot Upload         ──> Steps 07 to 12
Phase 3: Officer Queue & Triage Dashboard            ──> Steps 13 to 18
Phase 4: Application Workspace & Checklist           ──> Steps 19 to 24
Phase 5: Evidence Viewer & Findings Console          ──> Steps 25 to 31
Phase 6: Issuing Authority Verification Gateway      ──> Steps 32 to 36
Phase 7: Infrastructure Evidence & Geotag Review     ──> Steps 37 to 41
Phase 8: Officer Draft Exports & Notice Generator    ──> Steps 42 to 46
Phase 9: Cryptographic Audit Trail & Tamper Demo     ──> Steps 47 to 52
Phase 10: Rules Explorer, Realness & Keyboard Polish ──> Steps 53 to 58
```

---

### Phase 1: Modern Frontend Application Shell & Client Infrastructure (Steps 01–06)

#### Step 01: CSS Design Tokens & Theming System
* **Files:** `ui/css/main.css`
* **Endpoints:** N/A (CSS design layer)
* **Task:** Establish design tokens: primary AICTE navy (`#0a2540`), advisory alert amber (`#b45309`), pass emerald (`#059669`), failure rose (`#dc2626`), neutral slate shades, typography scale (`system-ui`, `-apple-system`, `sans-serif`), elevation shadows, and standard responsive layout breakpoints (`768px`, `1024px`, `1280px`).
* **Verification:** Open static page; verify variables load in browser root stylesheet with crisp typographic hierarchy.

#### Step 02: Semantic HTML5 Shell Layout Structure
* **Files:** `ui/index.html`
* **Endpoints:** `GET /`
* **Task:** Replace minimal demo container with semantic layout: top fixed header, persistent role indicator, emergency disclaimer banner, main application viewports (`#view-queue`, `#view-workspace`, `#view-rules`, `#view-audit`, `#view-realness`), and slide-over drawer for actions/modals.
* **Verification:** Page renders clean empty-state scaffolding across desktop and mobile viewport widths without console errors.

#### Step 03: Zero-Dependency Hash Router
* **Files:** `ui/js/app.js`
* **Endpoints:** `GET /`
* **Task:** Implement client-side hash router handling `#queue`, `#application/:id`, `#rules`, `#audit`, and `#about/realness`. Support browser back/forward history navigation and active tab styling.
* **Verification:** Navigating to `#audit` or `#queue` programmatically toggles visibility of the corresponding viewport section.

#### Step 04: Centralized Async API Client Layer
* **Files:** `ui/js/api.js`
* **Endpoints:** All 24 backend routes in `backend/api/main.py`
* **Task:** Implement an async `ApiClient` class wrapping standard `fetch()`. Standardize headers, handle JSON request/response serialization, extract API error envelopes (`error_code`, `message`), and handle offline network timeouts gracefully.
* **Verification:** Test `ApiClient.getHealth()` returning `{status: "ok", mode: "demo", simulated: true}`.

#### Step 05: Reactive Global State Store
* **Files:** `ui/js/state.js`
* **Endpoints:** N/A (State management)
* **Task:** Implement a lightweight pub-sub state store (`StateStore`) holding: `currentRole` (`officer`, `institution`, `auditor`), `selectedAppId`, `applicationsList`, `activeFindingId`, `alertsCount`, and `isTampered`. Provide `subscribe(key, listener)` and `setState(key, value)`.
* **Verification:** Mutating `currentRole` triggers registered listener callback.

#### Step 06: Top Navigation Bar & Role Switcher Component
* **Files:** `ui/js/components/nav.js`
* **Endpoints:** N/A (UI control)
* **Task:** Build header component with platform title, active role selector dropdown, `OFFLINE - SOVEREIGN` badge, and sticky warning banner (*"Decision-support prototype. AICTE Regulation Bureau · Synthetic Data"*).
* **Verification:** Changing role in dropdown updates `state.currentRole` and visually updates the role badge in the header.

---

### Phase 2: Document Intake & Multi-Slot Upload Experience (Steps 07–12)

#### Step 07: File Selection & Drag-and-Drop Dropzone
* **Files:** `ui/js/components/upload_modal.js`, `ui/css/viewer.css`
* **Endpoints:** N/A (Client drag-and-drop)
* **Task:** Build upload modal featuring a dashed drag-and-drop dropzone, browse file trigger, and format hint pill indicating allowed extensions (`.pdf`, `.png`, `.jpg`, `.jpeg`).
* **Verification:** Dragging a sample PDF over the target highlights the zone; dropping the file stages it in modal state.

#### Step 08: Client-Side Size & Magic Byte Verification
* **Files:** `ui/js/components/upload_modal.js`
* **Endpoints:** N/A (Client-side validation)
* **Task:** Enforce 10 MB maximum upload limit before dispatch. Read file header slice (first 8 bytes) with `FileReader` to verify magic bytes (`%PDF-`, `\x89PNG`, `\xFF\xD8\xFF`) matching backend sniffer policy.
* **Verification:** Uploading an invalid renamed `.txt` file triggers an immediate error message: *"Invalid file header: must be authentic PDF, PNG, or JPEG"*.

#### Step 09: Slot Picker & Idempotency Key Generator
* **Files:** `ui/js/components/upload_modal.js`
* **Endpoints:** N/A (Client form state)
* **Task:** Provide document slot selection dropdown: `affidavit`, `fire_noc`, `site_plan`, `building_photo`, `unspecified`. Automatically generate a UUIDv4 string for the `Idempotency-Key` header.
* **Verification:** Staged upload shows selected slot and auto-populated 36-character idempotency token.

#### Step 10: Multipart Streaming Upload Pipeline
* **Files:** `ui/js/api.js`, `ui/js/components/upload_modal.js`
* **Endpoints:** `POST /applications/{id}/documents`
* **Task:** Dispatch `FormData` stream to S1 endpoint with `Idempotency-Key` header. Handle progress indicators, parse 201 Created response, and extract `document_id`, `blake3`, `sha256`, and `storage_key`.
* **Verification:** Uploading `affidavit.pdf` returns HTTP 201 with `processing_state: "PERSISTED"`. Re-uploading with identical idempotency key returns idempotent replay flag.

#### Step 11: S3 Document Routing Query & Badge Binder
* **Files:** `ui/js/components/document_list.js`
* **Endpoints:** `GET /applications/{id}/documents/{doc_id}/route`
* **Task:** Upon successful S1 upload, call S3 router endpoint to fetch text layer verdict, image coverage ratio, and vector path count. Render routing badge (`BRANCH_A_DIGITAL`, `BRANCH_B_SCANNED`, or `MIXED`).
* **Verification:** Digital PDF displays `BRANCH_A_DIGITAL` badge; scanned raster image displays `BRANCH_B_SCANNED` badge.

#### Step 12: Content-Addressed Document Card Component
* **Files:** `ui/js/components/document_list.js`
* **Endpoints:** `GET /applications/{id}/documents`
* **Task:** Render uploaded document card in application workspace showing: Document ID, slot label, byte size, first 16 chars of BLAKE3/SHA-256 digests with copy button, and action buttons (*"Inspect Forensics"*, *"Run Extraction"*).
* **Verification:** Document list displays all uploaded documents with correct slot tags and byte sizes.

---

### Phase 3: Officer Queue & Triage Dashboard (Steps 13–18)

#### Step 13: Queue Dashboard Container & KPI Metrics Bar
* **Files:** `ui/js/components/queue_view.js`, `ui/css/queue.css`
* **Endpoints:** `GET /api/demo/applications`
* **Task:** Render queue layout with top KPI counter bar: Total Active Applications, Critical Discrepancies, Pending Issuer Verifications, and Fast Review Eligible.
* **Verification:** KPI counters accurately sum up statistics across loaded demo applications.

#### Step 14: 4-Lane Triage Column Layout
* **Files:** `ui/js/components/queue_view.js`
* **Endpoints:** `GET /applications/{id}/aggregate`
* **Task:** Create 4 column containers representing Guide §11.7 review lanes:
  1. `NEEDS_SCRUTINY` (Red accent)
  2. `NEEDS_VERIFICATION` (Amber accent)
  3. `NEEDS_EVIDENCE` (Blue accent)
  4. `FAST_REVIEW` (Green accent)
* **Verification:** Each application card is placed into its designated column based on `review_lane` returned by the backend.

#### Step 15: Application Queue Card Component
* **Files:** `ui/js/components/queue_card.js`
* **Endpoints:** N/A (Component renderer)
* **Task:** Build card item showing: Application ID, Institution Name, AICTE Category (`EOA_RENEWAL`), Submission Date, Age in Days, and count of active findings/alerts.
* **Verification:** Clicking anywhere on an application card updates `state.selectedAppId` and navigates to `#application/:id`.

#### Step 16: Dynamic Priority Score Gauge & Breakdown Tooltip
* **Files:** `ui/js/components/queue_card.js`
* **Endpoints:** `GET /applications/{id}/aggregate`
* **Task:** Render priority score badge ($0 \dots 500+$) with color gauge ($\ge 100$ crimson, $30-99$ amber, $<30$ blue). On mouse hover, display tooltip with mathematical breakdown:
  $$\text{Score} = (100 \times H) + (30 \times M) + (5 \times L) + \text{Age} + \text{Deadline Pressure}$$
* **Verification:** Hovering on `DEMO-ISSUES-001` (score 200) reveals tooltip showing: *"(100 × 2 High) + (30 × 0 Med) + (5 × 0 Low) + 0 Age + 0 Deadline"*.

#### Step 17: Statutory SLA Deadline Countdown Timer
* **Files:** `ui/js/components/queue_card.js`
* **Endpoints:** N/A (Date calculation)
* **Task:** Calculate calendar days remaining until review cutoff (14 days from submission). Render deadline badge with progressive warning states ($>7$ days gray, $3-7$ days yellow, $<3$ days pulsating red).
* **Verification:** Applications with deadline $\le 7$ days show visual urgency tag.

#### Step 18: Client-Side Filter, Search & Sorting Engine
* **Files:** `ui/js/components/queue_view.js`
* **Endpoints:** N/A (Client collection filtering)
* **Task:** Implement search bar (filters by Institute Name or App ID in real-time), Category dropdown filter, and Sort selector (by Priority Score descending, by SLA pressure ascending, by submission date).
* **Verification:** Typing "Apex" in search immediately filters the queue to matching institutions.

---

### Phase 4: Application Workspace & Checklist Transparency (Steps 19–24)

#### Step 19: Application Detail Workspace & Tab Manager
* **Files:** `ui/js/components/workspace.js`, `ui/css/main.css`
* **Endpoints:** `GET /applications/{id}/aggregate`
* **Task:** Build application detail container with top metadata card and 6 navigation tabs:
  1. *Checklist Transparency*
  2. *Documents & Vault*
  3. *Evidence & Findings*
  4. *Issuing Verifications*
  5. *Infrastructure Geotags*
  6. *Officer Actions & Exports*
* **Verification:** Clicking tabs switches visible workspace section while preserving active application context.

#### Step 20: Institutional Identity & Metadata Header Card
* **Files:** `ui/js/components/application_header.js`
* **Endpoints:** `GET /applications/{id}/facts`
* **Task:** Render institutional banner showing: Submitted Institution Name, AICTE Permanent ID, Academic Year, Application Category, and Workflow State pill (`NEEDS_RECTIFICATION`, `VALIDATED_NO_ISSUES`, or `NEEDS_MANUAL_REVIEW`).
* **Verification:** Header accurately displays canonical details returned from S7 facts aggregation.

#### Step 21: Canonical Entity Resolution & Alias Match Inspector
* **Files:** `ui/js/components/application_header.js`
* **Endpoints:** `GET /applications/{id}/facts`
* **Task:** Display entity resolution pill: show canonical name alongside document-extracted names, core token match score, and legal form variation tags (`MATCH`, `LEGAL_FORM_DIFF`, `MISMATCH`).
* **Verification:** Minor legal suffix variations (e.g., "Pvt Ltd" vs "Private Limited") are identified as `LEGAL_FORM_DIFF` instead of hard errors.

#### Step 22: High-Severity Active Alerts Banner
* **Files:** `ui/js/components/alerts_bar.js`
* **Endpoints:** `GET /applications/{id}/aggregate`
* **Task:** Render collapsible alert drawer across top of workspace listing emitted S11 alerts (`CRITICAL_DISCREPANCY`, `EXPIRED_MANDATORY_DOCUMENT`, `INFRA_ANOMALY`) with click-to-focus shortcuts.
* **Verification:** Clicking alert *"Expired Mandatory Document: FIRE_NOC"* automatically opens the Evidence tab and highlights the expired Fire NOC finding.

#### Step 23: Complete Checklist Transparency Table
* **Files:** `ui/js/components/checklist_table.js`
* **Endpoints:** `POST /applications/{id}/validate`
* **Task:** Render complete checklist transparency table (Guide §17.1) displaying every configured rule in `EOA_RENEWAL`: Rule ID, Rule Title, Evaluated Category, Plain English Reason, Source (Doc vs Record vs Form), and Status.
* **Verification:** Every rule check row is displayed with its complete evaluation explanation.

#### Step 24: 5-State Rule Status Pill Renderer
* **Files:** `ui/js/components/checklist_table.js`
* **Endpoints:** N/A (Status component)
* **Task:** Render strict 5-state status pills:
  * `PASS` (Green badge with checkmark)
  * `WARNING` (Amber badge)
  * `FAILED_CHECK` (Red badge with cross)
  * `NOT_CHECKED` (Slate badge; explicit missing check indicator)
  * `NEEDS_REVIEW` (Purple badge)
* **Verification:** Unchecked rules display `NOT_CHECKED` in gray, never disguised as `PASS`.

---

### Phase 5: Interactive Evidence Viewer & Findings Console (Centrepiece) (Steps 25–31)

#### Step 25: Split-Pane Canvas & Findings Inspector Layout
* **Files:** `ui/js/components/evidence_viewer.js`, `ui/css/viewer.css`
* **Endpoints:** `GET /applications/{id}/documents/{doc_id}/extract`
* **Task:** Implement split-screen inspection workspace: left pane for document page canvas renderer ($60\%$ width); right pane for discrepancy findings inspector ($40\%$ width).
* **Verification:** Panes sit side-by-side on desktop ($\ge 1024\text{px}$) and stack responsively on smaller viewports.

#### Step 26: Document Page Canvas Renderer with Zoom/Pan
* **Files:** `ui/js/components/evidence_viewer.js`
* **Endpoints:** N/A (Canvas drawing / PDF rendering)
* **Task:** Build canvas controller that displays document page image raster, supports zoom controls ($50\%, 100\%, 150\%, 200\%$, Fit Width), pan dragging, and page pagination controls ($1 \dots N$).
* **Verification:** Zooming in scales canvas smoothly without blurriness or layout distortion.

#### Step 27: Normalized Bounding Box SVG Overlay Math
* **Files:** `ui/js/components/evidence_viewer.js`
* **Endpoints:** `GET /applications/{id}/documents/{doc_id}/fields`
* **Task:** Implement Guide §17.2 overlay math scaling normalized coordinates `[x0, y0, x1, y1]` ($\in [0, 1]$) onto active canvas dimensions $W \times H$:
  $$\text{left} = x_0 \cdot W, \quad \text{top} = y_0 \cdot H, \quad \text{width} = (x_1 - x_0) \cdot W, \quad \text{height} = (y_1 - y_0) \cdot H$$
  Draw solid borders for `word` precision, dashed borders for `block` precision.
* **Verification:** Extracted fields (certificate number, validity date) show accurately positioned overlay rectangles directly over the text words.

#### Step 28: Two-Sided Comparison Finding Card Component
* **Files:** `ui/js/components/finding_card.js`
* **Endpoints:** `GET /applications/{id}/validate`
* **Task:** Build finding card displaying: Rule ID, Severity Pill (`high`, `medium`, `low`), Advisory Banner, Observed Document Value (with page reference and precision badge), and Expected Regulatory Value.
* **Verification:** Finding `R-EXP-001` clearly displays observed date `2024-03-31` on the left, compared against expected submission cutoff `2026-10-12` on the right.

#### Step 29: Bidirectional Finding-to-Canvas Click Linking
* **Files:** `ui/js/components/evidence_viewer.js`
* **Endpoints:** N/A (DOM event coordination)
* **Task:** Clicking any finding card scrolls the canvas to the relevant page, animates the bounding box with an amber pulse highlight, and centers the viewport on the evidence. Clicking a canvas box scrolls to and selects the finding card.
* **Verification:** Clicking `R-EXP-001` immediately brings the validity date box into view on Page 1 and highlights it.

#### Step 30: Finding Action Control Bar
* **Files:** `ui/js/components/finding_card.js`
* **Endpoints:** `GET /applications/{id}/findings/actions`
* **Task:** Add 4 action buttons to open findings:
  * `Acknowledge` (marks reviewed)
  * `Request Rectification` (flags for applicant re-upload)
  * `Dismiss` (officer override)
  * `Escalate` (sends to senior officer)
* **Verification:** Buttons reflect finding's current lifecycle state (`open`, `rectification_requested`, `dismissed`, `escalated`).

#### Step 31: Mandatory Human Rationale Action Modal
* **Files:** `ui/js/components/action_modal.js`
* **Endpoints:** `POST /applications/{id}/findings/{finding_id}/act`
* **Task:** Clicking `Dismiss` or `Request Rectification` opens modal with mandatory reason textarea. Validate non-empty text ($>5$ chars), submit to API, and render the recorded override in the finding's timeline without deleting the original finding.
* **Verification:** Submitting an empty reason displays validation error *"Reason is mandatory to override automated findings"*. Submitting a valid reason appends to audit trail and updates status.

---

### Phase 6: Issuing Authority Verification Gateway Panel (Steps 32–36)

#### Step 32: Verification Gateway Container & Overview
* **Files:** `ui/js/components/verification_panel.js`, `ui/css/verification.css`
* **Endpoints:** `GET /applications/{id}/documents`
* **Task:** Build Verification Gateway tab listing all verifiable documents in the bundle (Fire NOC, Affidavit, Accreditation) with overall verification status breakdown.
* **Verification:** Tab renders cards for all uploaded documents in the bundle.

#### Step 33: 8-State Verification Status Card
* **Files:** `ui/js/components/verification_panel.js`
* **Endpoints:** `POST /applications/{id}/documents/{doc_id}/verify`
* **Task:** Render card with status badge matching Guide §3.6: `VERIFIED`, `MISMATCH_DETECTED`, `EXPIRED`, `VERIFICATION_PENDING`, `SOURCE_UNAVAILABLE`, `MANUAL_REVIEW_REQUIRED`, `NOT_SUPPORTED`, `NOT_CHECKED`. Prominently tag simulated adapters with `SIMULATED` badge.
* **Verification:** Expired Fire NOC displays `EXPIRED` status in yellow with `SIMULATED` badge.

#### Step 34: 3-Pillar Inspection Breakdown (Integrity, Trust, Source)
* **Files:** `ui/js/components/verification_panel.js`
* **Endpoints:** `GET /applications/{id}/documents/{doc_id}/forensics`
* **Task:** Render 3 inspection indicator columns for each document:
  1. *Document Integrity:* SHA-256 match and incremental revisions check.
  2. *Cryptographic Trust:* Valid CMS signature vs Demo CA.
  3. *Source Verification:* External registry query response.
* **Verification:** Clean signed PDF shows `INTACT_FULL_COVERAGE` under Integrity and `demo` under Trust.

#### Step 35: QR Code Decoded Metadata & Token Masking Viewer
* **Files:** `ui/js/components/verification_panel.js`
* **Endpoints:** `GET /applications/{id}/documents/{doc_id}/forensics`
* **Task:** When QR code is detected in S2 forensics, render QR thumbnail alongside decoded issuer URL, registry domain (`fire.karnataka.gov.in`), and masked certificate reference (`FIRE/KA/****/00123`).
* **Verification:** Decoded QR code URL is visible with sensitive tokens masked for security.

#### Step 36: Manual Verification Fallback Recording Form
* **Files:** `ui/js/components/verification_panel.js`
* **Endpoints:** `POST /applications/{id}/findings/{finding_id}/act`
* **Task:** Provide manual review input box when status is `SOURCE_UNAVAILABLE` or `MANUAL_REVIEW_REQUIRED`. Officer records verification method (phone call, official letter), date, and reference number, logging an audit record.
* **Verification:** Submitting manual record transitions state to `acknowledged` with manual verification evidence.

---

### Phase 7: Infrastructure Evidence Checklist & Geotag Review (Steps 37–41)

#### Step 37: Facility Checklist Inspector Layout
* **Files:** `ui/js/components/infra_panel.js`, `ui/css/infra.css`
* **Endpoints:** `GET /applications/{id}/infra`
* **Task:** Build infrastructure inspection tab listing configured facility items from `EOA_RENEWAL.yaml`: Computer Center, Instructional Classrooms, Central Library.
* **Verification:** Items display required file count norms (e.g., Computer Center: 2 photos minimum, 60 sqm minimum area).

#### Step 38: Evidence Photo Gallery & EXIF Metadata Viewer
* **Files:** `ui/js/components/infra_panel.js`
* **Endpoints:** `GET /applications/{id}/infra`
* **Task:** Display thumbnail grid of uploaded facility photos. Clicking a thumbnail opens modal displaying extracted EXIF tags: Camera Make, Model, Lens, Focal Length, and Capture Date/Time.
* **Verification:** Synthetic lab photo displays EXIF metadata card.

#### Step 39: Campus Geotag Inspector & Haversine Distance Calculator
* **Files:** `ui/js/components/infra_panel.js`
* **Endpoints:** `GET /applications/{id}/infra`
* **Task:** Render photo GPS coordinates alongside registered campus GPS coordinates. Calculate great-circle distance using Haversine formula and display meter gauge. Flag red warning if distance $> 2.0\text{ km}$ (`LOCATION_METADATA_INCONSISTENT`).
* **Verification:** Photo taken within 100m of campus displays green *On-Campus GPS (0.08 km)* badge; photo taken in different city triggers red warning.

#### Step 40: Perceptual Hash (pHash) Duplicate Detector Warning
* **Files:** `ui/js/components/infra_panel.js`
* **Endpoints:** `GET /applications/{id}/infra`
* **Task:** Display 64-bit DCT pHash digest. Check cross-institution evidence database and display warning banner if Hamming distance $\le 6$ (`POSSIBLE_DUPLICATE_EVIDENCE`), without revealing confidential peer institution names.
* **Verification:** Reused photo displays amber advisory banner: *"Perceptual hash matches an image submitted by another institution"*.

#### Step 41: Facility Readiness Status & Ground Inspection Suggester
* **Files:** `ui/js/components/infra_panel.js`
* **Endpoints:** `GET /applications/{id}/infra`
* **Task:** Render overall facility status (`EVIDENCE_COMPLETE_FOR_REVIEW`, `ADDITIONAL_EVIDENCE_REQUIRED`, or `INSPECTION_SUGGESTED`). Provide one-click button: *"Recommend for Ground Inspection Checklist"*.
* **Verification:** Missing classroom photos accurately results in `ADDITIONAL_EVIDENCE_REQUIRED`.

---

### Phase 8: Officer Draft Exports & Document Generation (Steps 42–46)

#### Step 42: Officer Exports Tab & Generator Hub
* **Files:** `ui/js/components/exports_modal.js`
* **Endpoints:** N/A (Tab layout)
* **Task:** Build dedicated Exports Hub featuring 3 document generator cards:
  1. *Formal Draft Deficiency Notice* (for institution)
  2. *Visiting Team Ground Inspection Brief* (for inspection committee)
  3. *Comprehensive Evaluation Summary Report* (for administrative records)
* **Verification:** Each card displays document description, target recipient, and "Generate & Preview" button.

#### Step 43: Formal Draft Deficiency Notice Generator & Viewer
* **Files:** `ui/js/components/exports_modal.js`
* **Endpoints:** `GET /applications/{id}/exports/deficiency-notice`
* **Task:** Render draft formal notice addressed to institution. List open rectifiable deficiencies with two-sided evidence (observed date vs regulation norm, action required, upload deadline). Status marked `DRAFT`.
* **Verification:** Clicking generate loads clean deficiency notice letter ready for officer dispatch.

#### Step 44: Deficiency Notice Internal Tag Omission Filter
* **Files:** `ui/js/components/exports_modal.js`
* **Endpoints:** `GET /applications/{id}/exports/deficiency-notice`
* **Task:** Ensure internal forensic flags, duplicate identity hashes, and dismissed findings are strictly excluded from the institutional notice per Guide §11.8.
* **Verification:** Dismissed finding does not appear in the generated deficiency notice.

#### Step 45: Visiting Committee Physical Inspection Brief Generator
* **Files:** `ui/js/components/exports_modal.js`
* **Endpoints:** `GET /applications/{id}/exports/inspection-brief`
* **Task:** Fetch and render inspection briefing for ground inspection team: lists facilities requiring physical verification, missing infrastructure photos, and pending verifications under the non-punitive advisory banner.
* **Verification:** Ground inspection brief contains facilities checklist with inspection checkboxes and campus GPS coordinates.

#### Step 46: Print Layout Stylesheet & Export Formats
* **Files:** `ui/js/components/exports_modal.js`, `ui/css/main.css`
* **Endpoints:** N/A (Print CSS & clipboard)
* **Task:** Add "Copy Formatted Text" (Markdown), "Download JSON Envelope", and "Print Official Document" buttons. Include `@media print` CSS hiding navigation chrome and formatting document for A4 paper.
* **Verification:** Triggering `window.print()` renders clean, professional printable letterhead document.

---

### Phase 9: Cryptographic Audit Trail & Interactive Tamper Demo (Steps 47–52)

#### Step 47: Audit Trail Console Layout & Statistics Header
* **Files:** `ui/js/components/audit_view.js`, `ui/css/audit.css`
* **Endpoints:** `GET /audit/verify`
* **Task:** Create dedicated `/audit` page with top statistics cards: Total Chained Events, Genesis Hash (`0000...`), Active Chain Head Hash, and Active Ed25519 Checkpoint status.
* **Verification:** Navigating to `#audit` displays live hash chain statistics.

#### Step 48: Paginated Chronological Audit Event Table
* **Files:** `ui/js/components/audit_view.js`
* **Endpoints:** `GET /audit/events`
* **Task:** Render paginated audit event table showing: Event ID, ISO Timestamp, Actor (Officer/System), Action (`UPLOAD_COMPLETED`, `FINDING_ACTION_RECORDED`, etc.), Subject, Entry Hash, and Previous Hash.
* **Verification:** Audit rows display sequential previous-to-entry hash linkage.

#### Step 49: Live Hash Chain Verification Button & Badge
* **Files:** `ui/js/components/audit_view.js`
* **Endpoints:** `GET /audit/verify`
* **Task:** Add "Verify Hash Chain Integrity" button. Triggering button calls backend verifier which recalculates SHA-256 digests from Genesis to Head. Display green badge: *"Integrity Verified: N events cryptographically linked."*
* **Verification:** Successful verification displays green badge with head hash match confirmation.

#### Step 50: Ed25519 Checkpoint Card & Signature Validator
* **Files:** `ui/js/components/audit_view.js`
* **Endpoints:** `GET /audit/checkpoints`
* **Task:** Render external signed checkpoint card showing: Checkpoint ID, Event Count `upto_id`, Anchored Head Hash, 64-byte Ed25519 signature hex, and trusted public key confirmation (`aicte-ed25519-2026-demo.pub`).
* **Verification:** Checkpoint card displays cryptographic signature match status.

#### Step 51: External Anchor Checkpoint Creation Form
* **Files:** `ui/js/components/audit_view.js`
* **Endpoints:** `POST /audit/checkpoint`
* **Task:** Provide "Create Signed Checkpoint" button for authorized senior officers. Calls backend to anchor current chain head with demo private key, appending new checkpoint row.
* **Verification:** Clicking create generates new signed checkpoint that appears immediately in checkpoint list.

#### Step 52: Interactive Fail-Visible Tamper Demonstration
* **Files:** `ui/js/components/audit_view.js`
* **Endpoints:** `GET /audit/verify` (with sandbox query param)
* **Task:** Build interactive demonstration for evaluators:
  1. Button: *"Simulate Database Tampering"*: modifies an event timestamp or actor field in sandbox memory.
  2. Runs verification; displays dramatic Red Alert banner:
     *`CHAIN BROKEN AT EVENT #X! Canonical payload hash mismatch: Database records have been altered without authorization!`*
  3. Button: *"Restore Integrity"*: reverts alteration and restores green verification badge.
* **Verification:** Demonstrates fail-visible tamper detection during demo presentations.

---

### Phase 10: Rules Explorer, Realness Matrix, Keyboard Triage & Polish (Steps 53–58)

#### Step 53: Versioned YAML Rules Explorer View
* **Files:** `ui/js/components/rules_view.js`
* **Endpoints:** N/A (Rules manifest reader)
* **Task:** Create `/rules` view displaying active YAML rules for `EOA_RENEWAL`: Rule ID (`R-DOC-001`, `R-EXP-001`, etc.), Rule Category, Expression Logic, Evaluator Name, and `synthetic_demo` badges.
* **Verification:** Evaluators can inspect exact rule logic without opening Python source files.

#### Step 54: Rule Set Difference & Version Switcher
* **Files:** `ui/js/components/rules_view.js`
* **Endpoints:** N/A (Rules comparison)
* **Task:** Provide version switcher dropdown (v4.0 vs v4.1) showing side-by-side differences in regulatory norms, threshold changes, and effective academic year dates.
* **Verification:** Toggling versions highlights changed clauses and effective date ranges.

#### Step 55: System Realness & Transparency Matrix Page
* **Files:** `ui/js/components/realness_view.js`
* **Endpoints:** `GET /about/realness` (or static manifest)
* **Task:** Create `/about/realness` view detailing what is real vs simulated:
  * *Real:* Ingestion gateway, BLAKE3/SHA-256 hashing, Docling text extraction, deterministic rules engine, entity resolution, EXIF geotag analyzer, hash-chained audit trail.
  * *Simulated:* AICTE core database, State Fire Service QR online registry, Issuer root certificates.
* **Verification:** Satisfies SIH requirement for complete transparency regarding simulated external integrations.

#### Step 56: Keyboard Triage Shortcuts Engine
* **Files:** `ui/js/components/keyboard_shortcuts.js`
* **Endpoints:** N/A (Keyboard event dispatch)
* **Task:** Implement keyboard listener for Guide §17.3 shortcuts:
  * `J` / `K`: Focus next / previous finding
  * `A`: Trigger Acknowledge action
  * `D`: Open Dismiss reason dialog
  * `R`: Open Request Rectification dialog
  * `E`: Escalate finding
  * `V`: Run Audit Chain Verification
  * `/`: Focus search input
* **Verification:** Pressing `J` advances to the next finding and automatically scrolls canvas to highlighted evidence.

#### Step 57: Keyboard Shortcuts Cheat Sheet Modal
* **Files:** `ui/js/components/keyboard_shortcuts.js`
* **Endpoints:** N/A (Modal overlay)
* **Task:** Pressing `?` displays keyboard shortcut helper overlay with keyboard keycaps styled in dark pill design.
* **Verification:** Pressing `?` opens modal; pressing `Escape` dismisses it.

#### Step 58: Visual Polish, Responsive Layout Audit & End-to-End Verification
* **Files:** `ui/css/main.css`, `ui/index.html`
* **Endpoints:** All endpoints
* **Task:** Conduct full design pass: verify WCAG AA color contrast, check responsive layouts on laptop and desktop screens, ensure zero JavaScript console warnings, and verify that navigating through all 9 views works smoothly.
* **Verification:** Clean console log, responsive UI, and all features fully functional.

---

## 6. Technical Architecture & File Organization

The updated UI directory structure will be organized cleanly under `ui/`:

```
ui/
├── index.html                   # Semantic HTML5 Application Shell
├── css/
│   ├── main.css                 # Theme variables, typography, flex/grid layouts
│   ├── queue.css                # Triage lane columns, priority score cards
│   ├── viewer.css               # Split-pane layout, bounding box overlay canvas
│   ├── verification.css         # Issuer status cards, signature badges
│   ├── infra.css                # Geotag cards, coordinate distance meters
│   └── audit.css                # Hash chain timeline, tamper demo banner
└── js/
    ├── app.js                   # Application bootstrap, routing & tab state
    ├── api.js                   # Typed fetch client connecting to all 24 backend endpoints
    ├── state.js                 # Global reactive store
    └── components/
        ├── nav.js               # Top header, role switcher, offline proof badge
        ├── queue.js             # Queue dashboard & triage lanes
        ├── workspace.js         # Application detail container (6 tabs)
        ├── upload_modal.js      # Drag-and-drop document uploader
        ├── checklist_table.js   # Transparency table (PASS/FAIL/NOT_CHECKED)
        ├── evidence_viewer.js   # Canvas bounding box overlay & finding linker
        ├── verification_panel.js# Issuing authority gateway view
        ├── infra_panel.js       # Infrastructure photo & GPS inspector
        ├── exports_modal.js     # Deficiency notice & inspection brief generators
        ├── audit_view.js        # Hash chain explorer & tamper demo
        ├── rules_view.js        # Versioned YAML rules explorer
        └── realness_view.js     # System realness disclosure matrix
```

---

## 7. Definition of Done (DoD) for Full Functionality

When all 58 micro-steps are implemented, the platform will satisfy the following criteria:

- [x] **Zero Mock-Only Interfaces:** Every UI action triggers or reflects real backend data from `backend/api/main.py`.
- [x] **Document Ingestion:** Officers can upload arbitrary synthetic PDF/image bundles and watch them process through S1–S13.
- [x] **Evidence Provenance:** Clicking any discrepancy finding scrolls and highlights the exact bounding box (`bbox_norm`) on the document page raster.
- [x] **Honest Decision Support:** The UI displays advisory banners on all forensic and infrastructure findings; no automated approval/rejection buttons exist.
- [x] **Mandatory Officer Rationale:** Dismissing or overriding a finding strictly requires a text reason, which is permanently logged in the audit trail beside the original finding.
- [x] **Export Generation:** Generates clean, formatted Deficiency Notices and Ground Inspection Briefs ready for download or printing.
- [x] **Tamper Demonstration:** The audit console can verify the SHA-256 chain from Genesis to Head and actively demonstrate tampering detection.
- [x] **Tested & Verified:** Full regression suite continues to pass with 100% green tests across all test suites.

---

## 8. Developer & Agent Reference Links

* **Backend Router:** [`backend/api/main.py`](file:///d:/New/a26261/26sih261/backend/api/main.py)
* **Response Schemas:** [`backend/api/schemas.py`](file:///d:/New/a26261/26sih261/backend/api/schemas.py)
* **Database Repository:** [`backend/db/repository.py`](file:///d:/New/a26261/26sih261/backend/db/repository.py)
* **Master Theory Guide:** [`SIH26261_MASTER.md`](file:///d:/New/a26261/26sih261/SIH26261_MASTER.md)
* **Console Specification:** [`docs/reference/sih26261-prototype-guide-v4.2.md#17`](file:///d:/New/a26261/26sih261/docs/reference/sih26261-prototype-guide-v4.2.md)
* **OpenAPI 3.1 Contract:** [`docs/contracts/openapi.json`](file:///d:/New/a26261/26sih261/docs/contracts/openapi.json)
* **End-to-End Walkthrough Script:** [`scripts/e2e_demo_walkthrough.py`](file:///d:/New/a26261/26sih261/scripts/e2e_demo_walkthrough.py)

