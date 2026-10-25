# SIH 2026 · PS 26261 · AICTE Application Validation Platform — MASTER (replaces `sih26261-prototype-guide-v4_2.md` + `SIH26261_Proposal_and_Theory_Pack.md`)

Decision-support prototype: AI extracts, deterministic rules decide, officers approve. Synthetic data only. Not an AICTE system. Org: AICTE Regulation Bureau · Software · Smart Automation.
Pitch sentence (only defensible wording): *"A decision-support prototype designed for integration with the AICTE portal, using synthetic institutional records and simulated issuing-authority adapters where live access is unavailable. It demonstrates traceable extraction, configurable checks, preliminary anomaly indicators, a verification workflow and officer review. It does not make regulatory decisions."* Never say "integrated with AICTE" without real authorised access + a passing real-source test.

## 0. Precedence and clash register

**Order of truth:** (1) guide **v4 core** → (2) v4.1/4.2 **bug fixes** → (3) v4.1 **additions** (marked `+`) → (4) Proposal Pack (pitch/theory/impact only; its engineering choices are superseded).
Where v4.1 *changed a v4 design choice*, **v4 wins** (below). Where v4.1 *fixed a v4 defect*, the fix is kept and tagged `fix`. Flip any row if you disagree.

| Topic | v4 | v4.1/4.2 | Used here |
|---|---|---|---|
| Encryption at rest | Envelope (AES-GCM, KEK/DEK) on Phase A path | `storage.encryption: none\|envelope`; envelope = Phase B | **v4**: envelope in Phase A. Keep the `none` flag as emergency fallback (say "volume encryption" if used) |
| ExifTool | Persistent `-stay_open` helper | One-shot per file | **v4** stay_open. One-shot is the fallback if sentinel/deadlock bugs appear (needed anyway for MP4/MOV tags) |
| Phase B length | ≈2–3 days | ≈3–4 days (more scope) | **v4** 2–3 days for the v4 scope; the `+` items are best-effort and first to cut |
| Cut order | v4 order (no `+` items) | `+` items cut first | v4 order, with `+` items prepended (§6) |
| Verification cache + breaker | Process-local | Postgres-backed | **fix kept**: Postgres-backed (`--scale worker=4` makes process-local wrong) |
| Grounding | First/best substring | Provenance first, `AMBIGUOUS_MATCH` | **fix kept** |
| Audit lock | Held for caller's txn | `audit()` last before commit + `lock_timeout` | **fix kept** |
| Activation validator | Rejects unknown types even for `planned` | Skips `planned` | **fix kept** |
| Router | CAD plan with labels → `digital` | dense-vector rule → `vector_drawing` | **fix kept** |
| Modes | all three | Phases A/B ship `offline` only; hybrid/online = C | Same (v4 describes all; v4.1 narrows) |
| Proposal Pack stack (SQLite, Tesseract backup, Azure primary, FastAPI background tasks, Tier 1–3) | — | — | **Superseded** by guide (Postgres lease queue, Docling+RapidOCR offline, Azure = Phase C, phases 0/A/B/C) |

## 1. Problem, solution, requirements

**Problem:** officers hand-verify large document bundles (EoA, Handbook APH 2024-25→2026-27 plus yearly amendments; rules change → must be configurable). Pains: volume; late discovery of missing/expired/inconsistent items; tamper/duplicate suspicion; slow ad-hoc issuer confirmation; infra evidence by eye; no traceability.
**Stakeholders:** officers (prepared evidence-linked list), institutions (specific early deficiency feedback, rectification), supervisors (dashboard/ageing), auditors (reconstructable trail).
**USPs:** evidence-linked findings (click → both compared sides highlighted); rules-as-data (versioned YAML, live edit→result changes); grounded extraction; 8 honest verification statuses; advisory anomaly layer (no forgery score); hash-chained audit with tamper demo; offline/sovereign mode with proof.

### Requirement trace (PS → module → output → test)
| # | PS requirement | Where | Output | Test |
|---|---|---|---|---|
| R1 | Identify category; apply checklist | §11.1/12 | category = portal input, never changed; `rule_set = select(category, submitted_on)`; `CATEGORY_DOCUMENT_MISMATCH` advisory `+` | `test_rule_set_selection`, `test_category_cross_check` |
| R2 | Use authorised records | records adapter | `{data, source_version, fetched_at, simulated}`; no record → `NOT_CHECKED` | `test_records_missing_is_not_checked` |
| R3 | Missing/incomplete/expired/inconsistent | rules | per-item `PASS·WARNING·FAILED_CHECK·NOT_CHECKED·NEEDS_REVIEW` + category `MISSING·INCOMPLETE·EXPIRED·INCONSISTENT` | per-rule `tests:` |
| R4 | Structured report; rectification | report | JSON with `evaluation_run_id`, `rule_set_version`, `data_snapshot_id`; re-upload = version+1 | `test_rectification_keeps_history` |
| R5 | Anomaly indicators w/ evidence, preliminary | forensics | flag contract; tier by fixed rule; no score | `test_flag_contract`, FP rate on clean controls |
| R6 | Verify via issuers; named statuses; manual fallback | verification | 8 statuses, `simulated` flag | all 8 reachable |
| R7 | Configurable checklists | rules | versioned YAML + tests + approver + dates | `test_activation_validator` |
| R8 | Infra evidence, advisory | infra | checklist + EXIF/dup leads (+video, floor plan `+`) → `ADDITIONAL_EVIDENCE_REQUIRED`/`INSPECTION_SUGGESTED` | `test_infra_baseline` |
| R9 | Dashboard, alerts, audit | console/audit | queue lanes, SSE alerts, signed hash chain | `test_alert_latency`, `test_audit_chain` |
| R10 | RBAC, secure, human before adverse | RBAC | resource-level guards; no "rejected" state anywhere | cross-tenant negative tests |
| R11 | Demo on synthetic; evaluation | eval | `aicte eval run` → `metrics.json` | §9 table |

### Ground rules (non-negotiable)
1. AI proposes, rules decide, officers approve. 2. Every finding = rule + version + evidence for **both** compared sides + reason, with `bbox_precision` (`word|line|block|page`). 3. Absence of a flag ≠ clean; a check that could not run is `NOT_CHECKED`. 4. Raw is sacred: forensics/signatures/QR use original bytes; derived rasters feed OCR only. 5. Nothing leaves the machine unless `egress_gate()` allows; every decision audited. 6. Vocabulary: "preliminary indicator requiring human verification" — never forged/fraud/fake. 7. No claim without a passing test (README/slides say only what `aicte eval run` shows). 8. Real vs simulated visible (`simulated: true`, UI badge).

### Four state dimensions (never overload one `status`)
| Dimension | Values |
|---|---|
| Check result | `PASS · WARNING · FAILED_CHECK · NOT_CHECKED · NEEDS_REVIEW` |
| Verification (per doc) | `VERIFIED · MISMATCH_DETECTED · EXPIRED · VERIFICATION_PENDING · SOURCE_UNAVAILABLE · MANUAL_REVIEW_REQUIRED · NOT_SUPPORTED · NOT_CHECKED` |
| Finding lifecycle | `open · acknowledged · rectification_requested · dismissed(reason) · escalated · resolved` |
| Workflow | `DRAFT → SUBMITTED → VALIDATING → {VALIDATED_NO_ISSUES · NEEDS_RECTIFICATION · NEEDS_MANUAL_REVIEW} → UNDER_OFFICER_REVIEW → OFFICER_DECISION_RECORDED` |

`VALIDATED_NO_ISSUES` only if: every mandatory rule `PASS` (WARNING/NOT_CHECKED block it); every doc with a supported adapter is `VERIFIED`; no open medium/high flag; OCR quality gates met on every page a rule used. It is **not** approval. `FAST_REVIEW` is a queue lane only.

### Real vs simulated (say aloud in demo; `/about/realness`)
Real: intake, routing, OCR/extraction, rules, cross-doc checks, metadata/duplicate/signature crypto, EXIF, audit chain. Simulated: AICTE records, issuer/QR registry sources, trust root (demo CA). Designed (not live): portal integration (OpenAPI, mock portal shell, token interface, webhook). DigiLocker/API Setu need issuer/requester registration → no live claim.

## 2. Architecture

### Pipeline (stages S1–S13)
`Upload → S1 Ingest (stream, BLAKE3+SHA-256, sniff, limits, AV hook, envelope-encrypt, vault) → dup check → fork: S2 Branch A raw forensics ‖ S3 Router (per page) → S4 Branch B (prep→engine→post→UnifiedDoc) → S5 typing → S6 extraction + S6b grounding → S7 typed facts → S8 rules ‖ S9 verification ‖ S10 infra → S11 aggregate (dimensions, lane, priority, alerts, report) → S12 officer console → S13 signed hash-chain audit; re-upload loops to S1.`
Every stage: idempotent, cacheable by `(blake3, pipeline_version, config_hash)`, observable (audit event with tool/version/duration), fail-visible (`NOT_CHECKED`).

| Stage | Output | Deterministic | Failure |
|---|---|---|---|
| S1 | `blobs`,`uploads` rows, audit, jobs | yes | `Reject(msg)` to applicant |
| S2 | `flags[]`, `geo`, `meta` | yes | detector → `NOT_CHECKED` |
| S3 | `PageVerdict[]` (`digital·hybrid·scanned·vector_drawing·blank`; +`video`) | yes | ambiguous → `scanned` |
| S4 | `UnifiedDoc` JSON | pinned engine+config | page `NOT_CHECKED` + request better scan |
| S5 | doc_type, confidence, evidence | rules; LLM optional | `UNCLASSIFIED` → manual task |
| S6/S6b | fields `{value, raw, quote, block_id}` + grounding | regex first; LLM quote-checked | `NOT_EXTRACTED`; `grounded=false` |
| S7 | typed facts | yes | missing → `NOT_CHECKED` |
| S8 | `check_results` | yes | `NOT_CHECKED`/`NEEDS_REVIEW` |
| S9 | `VerificationResult` | compare is; source answer isn't | any of 8 |
| S10 | infra results | yes | `NOT_CHECKED` |
| S11–S13 | status, lane, priority, alerts, report, audit | yes | — |

### Modes (`mode:` in config.yaml; never overrides confidentiality)
| Capability | offline | hybrid | online |
|---|---|---|---|
| Digital PDF/DOCX/PPTX/CSV/XLSX | local | local | local |
| Scanned OCR | Docling+TableFormer+RapidOCR | local first; Azure only if quality below threshold **and** gate allows | Azure first if gate allows, else local |
| LLM/VLM | off or local (Ollama on host) | local first; cloud if gate allows | cloud only if gate allows |
| Verification | simulated + local signature | allow-listed hosts via egress proxy | same |
| Network | **no route out** | egress-proxy only | egress-proxy only |

### Egress gate (every provider call, every mode)
`allow = mode_allows AND provider approved AND document explicitly authorised AND payload minimised`. `egress_gate(mode, provider, approved, doc_authorised) → {allowed, reason: mode_offline|provider_not_approved|doc_not_authorised|ok}`. Audit `EGRESS_DECISION` before, `EGRESS_SENT` after. `uploads.is_confidential` default true; `egress_authorised` default false. `+` One `SafeHttpClient` (`backend/policy/http.py`): gate/allow-list, https only, no redirects, timeouts; `test_http_client_funnel` AST-bans `requests/httpx/urllib.request/aiohttp` imports in `backend/` except that file (scoped to `backend/` because `TestClient` uses httpx). Vendor SDK call sites (Azure, Ollama; Phase C) call `egress_gate()` right before the SDK call and are explicitly allow-listed in the test. Topology, not this, is the proof of "offline".

## 3. File structures

### Repository
```
aicte-validator/
  CLAUDE.md                  # ≤150 lines: ground rules, commands, definition of done
  docs/spec/                 # guide split by section
  docs/contracts/            # 6 JSON Schemas + openapi.yaml  (FROZEN after Phase 0)
  docs/decisions.md          # calibrated thresholds, pinned versions, smoke results
  backend/{ingest,forensics,pipeline,extract,facts,rules,verify,infra,records,audit,jobs,api,policy}/  cli.py
  rules/                     # EOA_RENEWAL.yaml (+INCREASE_INTAKE B), categories.yaml, infra/<category>.yaml, schemas/<DOC_TYPE>.yaml
  scripts/{gen_data.py, smoke/}
  tests/<module>/            # fixtures from synthetic corpus
  ui/    docker/{compose.yml, compose.online.yml, nginx.conf, squid.conf}
  config.yaml  .env  keys/ (gitignored)  models/ (host volume)  data/ (host volume)
```
### Modules (responsibility → I/O)
| Path | Does | I/O |
|---|---|---|
| `ingest/gateway.py` | stream, hash, sniff, encrypt, vault, DB commit, cleanup | upload id → `{blake3, sha256, kind, prior_uploads}` |
| `ingest/{sniff,hashing,crypto,fingerprints,dedup}.py` | type/limits, dual hash, envelope crypto, pHash/text hash, dup flags | bytes → verdict/digests/flags |
| `store.py` | `BlobStore` (`LocalStore`, optional `S3Store`) | key,bytes → bool |
| `forensics/*` + `runner.py` | detectors `(ctx)->list[Flag]`; exceptions → `NOT_CHECKED` | original bytes → flags, geo |
| `pipeline/pdf_pages.py` | per-page classifier | PDF → `PageVerdict[]` |
| `pipeline/prep.py` | raster prep with `M`/`M_inv` | raster → gray + meta |
| `pipeline/{tabular,docling_engine,azure_engine,ocr_ladder}.py` | engines + escalation | pages → blocks/tables/md/quality |
| `pipeline/{numbers,table_checks,payload}.py` | ₹/Indian numbers, sum checks, payload | cells → normalised cells, `UnifiedDoc` |
| `extract/{typing,schema,llm,ground}.py` | typing, extraction, grounding | payload → typed fields + boxes |
| `facts/{normalise,store,entities}.py` | typed facts, entity resolution | → facts |
| `records/{base,mock}.py` | authorised-records adapter (simulated) | institute id → records |
| `rules/{engine,validate,loader}.py` | 3-valued eval, activation validator | facts+rule set → `check_results` |
| `verify/{base,gateway,adapters/*}.py` | contract, retries/breaker, adapters | ids → `VerificationResult` |
| `infra/{checklist,geo,dup,video,floorplan}.py` | evidence inventory, leads, keyframes, area schedule | evidence → infra results |
| `jobs/{queue,worker,reaper}.py` | Postgres lease queue | job → handler → terminal |
| `audit/{chain,checkpoint}.py` | append, verify, sign | event → chained row |
| `policy/{egress,http}.py` | gate, SafeHttpClient | — |
| `api/*` | FastAPI, auth, RBAC | HTTP → JSON |
| CLI | `serve, worker, keys init, models pull, db migrate, db seed-demo, rules test, rules diff, eval run, audit verify` | — |

### Storage
| Store | Content | Key | Rule |
|---|---|---|---|
| `quarantine/` | raw upload while checked | `uploads/<upload_id>` | private, TTL 24h; rejected deleted + audited |
| `vault/` | encrypted originals | `b3/<aa>/<bb>/<blake3>` | never overwritten; deleted only by audited retention job |
| `derived/` | rasters, crops, payload JSON | `derived/<blake3>/<pipeline_version>/…` | reproducible, deletable |
| `/models` | Docling/RapidOCR weights | — | `aicte models pull`; not in image |
| `/keys` | KEK keyring, audit signing key, `trusted_pubkeys/` | — | host-permissioned, never in image/git/logs |

`BlobStore`: `put(key,data,if_absent=True)->bool, get, exists, open, delete`. Default `LocalStore`; MinIO CE is in maintenance mode → use SeaweedFS/Garage if S3 wanted; don't assume Object Lock. Path safety: reject absolute/`..` keys, `is_relative_to` (not `startswith`). Atomic create via `os.link(tmp, final)`; `fix`/`+` fallback on EPERM/ENOTSUP/EXDEV (Docker Desktop/WSL): exclusive-create lock file → recheck → `os.replace`. S3: conditional write (`If-None-Match: *`), not HEAD-then-PUT.

### Postgres tables
`blobs, uploads(+egress_authorised, idempotency_key UNIQUE), fingerprints, hash_allowlist, extractions, azure_quota(+reserved_month), users, applications(+category NOT NULL, portal-supplied), documents, verifications, alerts, rules, audit_events, audit_checkpoints, refresh_tokens(jti_hash,user_id,expires_at,revoked_at)`, plus:
- `jobs(id, kind, stage, payload, state queued|running|done|dead, priority, attempts, max_attempts, run_after, locked_by, lease_expires_at, finished_at, parent_id, pending_children, dedupe_key UNIQUE, last_error_class, last_error)`; index `(state, run_after, priority DESC)`.
- `facts(id, application_id, document_id, source doc|form|record|human, entity, key, raw, value_type date|money|int|decimal|text|id|name|bool, value_json, conf, conf_kind engine_score|engine_score_calibrated|regex_exact|human|uncalibrated, grounded, page, bbox_norm, bbox_precision, source_ref, extractor, extractor_version, record_version, fetched_at)`; dates = ISO strings, money = decimal strings.
- `verification_attempts(id, adapter, request_digest, outcome ok|transient_failure|permanent_failure, at)` + indexes `(adapter, at DESC)`, `(request_digest)`.
- `evaluation_runs(id, application_id, rule_set, rule_set_version, data_snapshot_id, started_at)`; `check_results` (immutable; PASS & NOT_CHECKED stored; `fingerprint`).
- `findings(id, application_id, document_id, source_kind rule|flag|verification|infra, category MISSING|INCOMPLETE|EXPIRED|INCONSISTENT|COMPLIANCE_GAP|ANOMALY|VERIFICATION|INFRASTRUCTURE, severity, lifecycle, check_result_id, fingerprint, superseded_by, created_run_id, closed_run_id, created_at)`; `UNIQUE INDEX (application_id, fingerprint) WHERE superseded_by IS NULL` (a table-level UNIQUE can't hold expressions).
- `fingerprint = sha256(rule_id|rule_version|document_id-or-"app"|canonical_json(observed))` in app code. Rule stops firing → finding closed (`resolved`), never deleted. Dismissed + same fingerprint again → not reopened.
- Audit grants: owner role migrates; `aicte_app` has only `SELECT, INSERT` on `audit_events, audit_checkpoints`; `REVOKE UPDATE, DELETE, TRUNCATE`. Test with the runtime credential.

### Six frozen contracts (`docs/contracts/`)
- **C1 UnifiedDoc**: `{schema_version, pipeline_version, blake3, sha256, kind, coordinate_space:"original_page_norm_topleft", pages[{page, label, reasons, engine, level, quality{score, method, calibrated}, preprocess{steps, deskew_deg, pre_px, out_px, M, M_inv}}], tables[{table_id, page, bbox_norm, bbox_precision, n_rows, n_cols, cells[{r,c,raw,value,kind,currency,repaired}], markdown, engine}], blocks[{id,page,label,text,bbox_norm,bbox_precision,engine}], markdown, flags, engines, egress}`. Invariants: `0≤x0<x1≤1`, `0≤y0<y1≤1`; `page` = original 1-based; cells keep `raw`; money = decimal string; `calibrated=false` unless calibrated. Invalid payload → `NOT_CHECKED` + `PAYLOAD_INVALID`.
- **C2 Flag**: `{code, severity info|low|medium|high, reason, evidence{page,bbox_norm,bbox_precision,artifact_uri,value}, advisory, requires_human_review, detector{name,version}}`. Detector raising → `NOT_CHECKED`.
- **C3 Fact**: `{application_id, document_id, source, entity, key, raw, value_type, value, conf, conf_kind, grounded, source_ref, page, bbox_norm, bbox_precision, extractor, extractor_version}`. Adapter parses `value_json` back by type; rules never see raw JSON.
- **C4 CheckResult**: `{rule_id, rule_version, state, category, severity, observed, expected, advisory, evidence[{side left|right|record|form, doc_id, page, bbox_norm, bbox_precision, text}], reason}`. Comparison with a side lacking evidence cannot be `FAILED_CHECK` → `NEEDS_REVIEW`.
- **C5 Finding** = `findings` row + its check_result/flag evidence.
- **C6 VerificationResult**: `{document_id, adapter, source, simulated, status, request_digest, response_digest, checked_at, integrity{signature}, trust{class}, compared{field{submitted,returned,match}}, reason}`.

## 4. Pipeline specifics (key logic only)

**Ingest steps:** stream quarantine→tmpfs scratch hashing BLAKE3+SHA-256 in one pass with size cap → sniff by magic bytes (ext must agree), page/entry/expansion/ratio limits, reject encrypted PDF/macros/legacy OLE → AV hook → if vault object exists validate header (unwrap DEK) and reuse its `kek_id`, else encrypt + `put(if_absent)`; lost race → re-read winner header → one DB txn (`blobs ON CONFLICT DO NOTHING`, prior-upload lookup, `uploads` with unique idempotency key, audit) → delete quarantine → enqueue fork → `finally` secure-unlink scratch. Orphan vault object is acceptable; hourly **reconcile job**: vault objects with no row >1h → delete; rows with missing object → `integrity_error` + alert; sampled full decrypt+rehash.
**Sniffing:** `%PDF-`→pdf (>300 pages reject); PNG/JPEG/TIFF ok; `D0CF11E0` reject ("save as docx/xlsx/pptx/PDF"); `PK` needs `[Content_Types].xml` + main part (`word/document.xml|xl/workbook.xml|ppt/presentation.xml`), reject `vbaProject.bin`, >2000 entries, >500MB expansion, ratio>200; plain ZIP rejected ("upload individually"; safe expansion Phase C); `ftyp` MP4/MOV → `video` only for infra slots (≤200MB, ≤3min, one video stream); CSV only if `.csv` and decodes via **incremental** decoder (`utf-8-sig`) on first 4KB.
**Envelope encryption:** per-file random DEK, AES-GCM, AAD = content id; KEK from `keys/keyring.json` (made once by `aicte keys init`, never at process start) wraps DEK with AAD = kid; rotation re-wraps header only. Tests: wrong AAD, flipped bit, rewrap keeps plaintext, missing kid error, restore from backup. Say "FIPS-approved hash", not "FIPS-compliant".
**Duplicates (skip reprocessing, never skip the record):** reuse payload+flags if `(blake3, pipeline_version, config_hash)` exists; always write upload row; flag from this upload's context: same app+slot → `SAME_FILE_REUPLOADED` info; same institute other app → `SAME_FILE_REUSED_ACROSS_APPLICATIONS` medium; other institute → `SAME_FILE_SUBMITTED_BY_OTHER_INSTITUTE` high (other identity officer-only). `hash_allowlist` suppresses only this flag. Fuzzy: page-1 pHash 8×8 (signed BIGINT), Hamming ≤6; same text hash + different BLAKE3 → medium; pHash close + text differs only in digits → high ("same certificate, numbers changed"). Calibrate; allowlist templates.

### Branch A forensics (raw bytes; all advisory)
| Detector | Applies | Severity | FP source |
|---|---|---|---|
| `pdf_metadata` | pdf | low–med | re-saves, print-to-PDF |
| `pdf_incremental_update` | pdf | low (high if signed+modified) | signing/annotation |
| `pdf_signature` | pdf | high on broken | missing trust roots |
| `font_inconsistency` | digital pdf | medium | mixed template fonts |
| `image_metadata_xmp_exif` | jpeg/png/tiff | low–med | legit edit/crop |
| `c2pa_provenance` | images | info–med | absence proves nothing |
| `ela_jpeg` | jpeg | low | sharp text |
| `ooxml_structure` | docx/xlsx/pptx | low–med | legit hidden sheets |
| `qr_decode`, `visual_marks` | raster | info | weak |
| `mark_reuse` `+` | pdf embedded images | medium across issuers, info within | shared seal/logo |
| `exact_dup`/`near_dup` | all | info–high | shared legit docs |
| `text_layer_ocr_mismatch` | scanned w/ hidden layer | med–high | OCR errors |

- Metadata: `EDITING_TOOL_IN_METADATA` (medium; tokens photoshop, gimp, canva, ilovepdf, sejda, smallpdf, pixlr, corel, foxit phantom, nitro, pdfescape, pdf-xchange editor, acrobat pro) = a lead, not honesty finding. `PRODUCER_NOT_TYPICAL_FOR_ISSUER` only with an issuer fingerprint table. `INCREMENTAL_UPDATE_PRESENT` (>1 `%%EOF`) low; high only if signature modified after signing. Never flag `CreationDate != ModDate` alone.
- Signatures (pyHanko, `ValidationContext(trust_roots=[...], allow_fetching=False)`): three separate fields — `integrity` (`INTACT_FULL_COVERAGE|MODIFIED_AFTER_SIGNING|BROKEN`), `trust` (`production|demo|untrusted`), `source_verification` (8 statuses). Flags `SIG_BROKEN`(high), `SIG_MODIFIED_AFTER_SIGNING`(high), `SIG_LATER_REVISIONS_BENIGN`(low), `SIG_UNTRUSTED_ROOT`(medium), `SIG_INTACT`(info). Unsigned is not a flag. Demo-root intact = "valid under the demo CA", never "issuer verified".
- Image: ExifTool fixed argv (`-json -n -G1 --`, `shell=False`, timeout 20s, no document-controlled args). Flags `EDITING_SOFTWARE_SIGNATURE`(med), `XMP_REVISION_HISTORY_PRESENT`(low), `AI_GENERATION_DECLARED`(med), `EXIF_MODIFIED_AFTER_CAPTURE`(info). UI: "no *declared* AI/editing metadata found".
- Font: numeric/date span whose `(font, size)` differs from line majority → `FONT_MISMATCH_IN_FIELD` (medium, word box); calibrate on controls.
- ELA: JPEG only, re-save q90, 32px block means, robust z > 6, severity low, `requires_human_review:false`; report FP rate + misses.
- Visual marks: seal candidates (saturated, closed morphology, 0.2–8% page, aspect 0.6–1.7), signature candidates (lower 45%, aspect>2); surface via rule `visual_mark_present` (low, advisory) — presence, not validity.
- `mark_reuse` `+`: hash decoded pixels of small embedded images (hash base **and** decoded `smask`; skip single-colour, pixel std<2.0; <15% of page; seal/signature region or repeated); different issuers → `MARK_IMAGE_REUSED_ACROSS_ISSUERS`; same issuer info; allow-list institution logo/emblems; scanned-crop ORB/NCC = Phase C.
- QR: locator only. Decode on original raster (150–200 DPI, then 300). Match against per-issuer regex, extract only `ref`; adapter builds URL from its own configured base; unrecognised → `QR_NOT_RECOGNISED` info, never fetch. Egress proxy allow-list, https/443, redirects off.
- `TEXT_LAYER_OCR_MISMATCH` (at `merge_payload`): `token_set_ratio(hidden, ocr) < 60` with ≥30 OCR tokens → medium; words agree but digit sequences differ → high; low OCR quality → `NOT_CHECKED`.
- OOXML: `docProps/core.xml`, tracked changes, comments, hidden sheets/rows, `externalLinks`, hidden slides, PPTX notes → `HIDDEN_SHEET, TRACKED_CHANGES_PRESENT, EXTERNAL_LINKS, HIDDEN_SLIDE, OOXML_MODIFIER_DIFFERS_FROM_CREATOR`.
- Consolidation: dedupe (same code/page/IoU>0.5); doc tier `HIGH` = any high or ≥3 medium from distinct detectors; `ELEVATED` = any medium; else `LOW`. Show indicators, never a percentage. `ISSUER_TEMPLATE_DEVIATION` (low–med) from per-issuer fingerprints.

### Router (per page; first match wins; ambiguous → `scanned`)
Metrics: `visible/invisible` chars (`get_texttrace`, span `type==3` = invisible — **smoke-test**), `sanity = text_sanity()`, `cover_max/cover_sum`, `paths`. Thresholds (tune on 30–50 real PDFs): `MIN_VISIBLE=80, COVER_SCAN=0.60, COVER_HYBRID=0.25, DRAWING_MIN=40, DRAWING_DENSE=400, DRAWING_TEXT_RATIO=0.25`.
Order: blank (no text/images/paths) → scanned (full-page image + hidden/no text) → scanned (sanity<0.6) → `vector_drawing` (paths≥400 and visible/paths<0.25) `fix` → hybrid (real text + cover_sum≥0.25) → digital (real text) → vector_drawing (paths≥40, little image) → scanned.
File routing: `.csv/.xlsx` tabular (pandas `dtype=str, keep_default_na=False` / openpyxl twice for formulas+cached; flags `HIDDEN_SHEET`, `HIDDEN_ROWS`, `FORMULAS_PRESENT`); `.docx/.pptx` office (Docling native, never cloud); images `scanned`; `.mp4/.mov` video (metadata + keyframes → infra only, no OCR). Mixed PDFs: group by verdict, merge in original order, keep `page_map[i]`. Keep `get_text("words")` on `vector_drawing` pages as word-precision blocks for the floor-plan reader.
Router test vectors: born-digital→digital; image-only→scanned; scan+invisible OCR→scanned; text+photo≥25%→hybrid; empty→blank; vector floor plan→vector_drawing; CAD plan (thousands of paths + ~150 label chars)→vector_drawing; decorative-border certificate→digital; garbled `(cid:123)`→scanned; **mixed digital/scanned/hybrid PDF→`digital, scanned, hybrid` + valid merged payload**.

### Branch B preprocessing (derived copy, OCR only)
Order: DPI(300, long edge ≤4200) → gray 8-bit → [colour-ink→white, background division, light-ink LUT: only L1/when overlay/uneven bg] → bilateral (L1, d=5) → CLAHE (L1, low contrast only, after flattening) → estimate skew on cleaned image (projection profile, ±12° coarse 1°, ±1° fine 0.1°; at ±max → skip) → one rotation (if |angle|≥0.5°) → 90/180° orientation. No binarisation (Sauvola last-resort retry). Azure `L0` = minimal (gray, deskew, orientation; fit ≤4MB). Phone photos: EXIF orient, long edge ~3300. **Every geometric transform composes into one 3×3 matrix from the original raster; engines' boxes are mapped back once via `M_inv`**; evidence viewer shows the original raster. `test_inverse_map`: rotations −7/−3/+3/+7°, EXIF orientations 6 & 8, mixed PDF → mean IoU ≥ 0.9, coords in [0,1]. Watermarks: default `detect_only`; `clean_copy` (redaction on a copy) only after a preservation test (no title/letterhead/seal/signature/footer loss on defined fixtures — never claim "100% recall").

### Engines
Digital: Docling TableFormer ON, `do_ocr=False`. Hybrid: OCR on bitmap regions only (`bitmap_area_threshold` 5%). Scanned: Docling+TableFormer+RapidOCR (offline) / Azure `prebuilt-layout` (Phase C). Docling options (verified): `PdfPipelineOptions(artifacts_path="/models/docling")`, `do_ocr`, `do_table_structure`, `table_structure_options.mode=ACCURATE`, `ocr_options` (`RapidOcrOptions|EasyOcrOptions` with `force_full_page_ocr`), `document_timeout=120`, `enable_remote_services=False`; never download at request time; `HF_HUB_OFFLINE=1`. Languages: RapidOCR = English; Hindi/Kannada/Marathi/Tamil out of scope unless `indic` image or Azure **and** a passing test page. `norm()` maps boxes to original page; `metas[i]` is `None` for digital/hybrid pages → map only when not None (v4 P0-1).
Azure (Phase C): one page/request (F0: first 2 pages per request, 4MB; every analysed page counts monthly); atomic quota reserve (`INSERT … ON CONFLICT DO UPDATE … WHERE used+n<=cap RETURNING`); reserve before call; refund only if request provably never left; **never refund on timeout/ambiguous error**; cache per page by `blake3(raster)+engine+level+config_hash`; never send digital pages; SDK arg `body=` vs `analyze_request=` → smoke-test.
OCR ladder (one `ocr_page` job per page): `start_level = L1 if overlay/uneven else L0`; engine order offline `[local]`, hybrid `[local, azure]`, online `[azure, local]`; cloud engines skipped if gate denies (audited); escalate L0→L1 within the same engine; accept only if `calibrated and score ≥ threshold[engine]`; else first engine's best result, page `NEEDS_REVIEW_OCR` → "upload a clearer scan". Quality is engine-specific, never compared across engines; store raw sub-scores; fallback `text_sanity × word density`, `calibrated=false`; thresholds per engine in config, calibrated in Phase B, logged.
₹/numbers: normalise `` ` ``/`Rs`/`Rs.`/`INR`→`₹`; OCR `?TZE27` misreads; digit confusions are the dangerous ones → defence = arithmetic + cross-engine A/B, never overwrite `raw`. `parse_indian_number` handles `1,45,000.50`, lakh/lac/crore/cr, Indic digits (Devanagari…Malayalam). Cell normalisation precedence: (1) money column + leading `?TtZzE` → `₹` (repaired); (2) numeric column with `O o l I |` → digit (repaired); (3) parse success → decimal string; (4) text. Numeric normalisation only on schema-marked numeric columns. **Repaired cell in date/ID/fee/intake column ⇒ `needs_confirmation` ⇒ cannot `FAILED_CHECK`.** Table sums: first `^\s*(grand\s+)?total\b` row at index ≥2; `Decimal` (tolerance 0.5 only rupee columns with paise); mismatch → `TABLE_SUM_MISMATCH` (medium); repaired summand → `OCR_REPAIRED_VALUES_IN_SUM` + `NEEDS_REVIEW`; evidence = total cell + each summand.

### Orchestration (Postgres lease queue; no Redis)
DAG: `ingest → {forensics_raw, route_extract → {tabular, office, digital_group, hybrid_group, ocr_page×N}} → merge_payload → classify → extract → facts → {rules, verify, infra} → join → aggregate → alerts`.
Claim: `UPDATE jobs SET state='running', attempts+1, locked_by, lease_expires_at=now()+120s WHERE id=(SELECT … FOR UPDATE SKIP LOCKED LIMIT 1)`. Heartbeat extends lease every lease/3. **Terminal child (`done|dead`) decrements parent's `pending_children` in the same transaction**, guarded by `state='running'`; reaching 0 enqueues join with `dedupe_key=join:<parent>`. Handler exception → `conn.rollback()` **mandatory**, classify transient|permanent|bug; non-transient or attempts exhausted → `dead`; else requeue with `run_after = now()+10s·attempts²`. `fork()` sets counter in one txn. Reaper (30s): expired leases → dead (if attempts≥max) or requeue. Dead child downstream: join lists dead children, emits payload for succeeded pages, failed pages `NOT_CHECKED` with stage+error class, alert raised, aggregation still finishes; never show stack traces. **Recovery tests (all required):** normal handler error; DB error; worker killed (lease expiry); double delivery; dead child still fires join; full re-run → same findings. **Fallback if fork/join fails recovery tests by end of Phase A day 2:** one job per document, bounded in-process page pool, checkpoint to `extractions`, aggregate when `bool_and(state IN ('done','dead'))`.
Caching: document `(blake3, pipeline_version, config_hash)`; raster page `blake3(raster)+engine+level+config_hash`; LLM `(blake3, prompt_version, model)`.

## 5. Downstream (typing → rules → verification → infra)

**Typing (S5):** category is a portal input; officer confirm button. `+` cross-check for `COVERING_LETTER/AFFIDAVIT/MANDATE`: phrase scores from `rules/categories.yaml`; different category ≥0.7 → `CATEGORY_DOCUMENT_MISMATCH` (medium, advisory), category never switched. Slot prior capped (cannot reach threshold alone). Score = Σ weight·pattern match + layout cues; accept if `top ≥ θ_min` and `top−second ≥ δ`; `confidence = top/(top+second)`; escalate → TF-IDF+LogReg (synthetic-trained) → LLM (first 1,500 chars + labels only, if allowed) → `UNCLASSIFIED` (manual). `DOC_TYPE_SLOT_MISMATCH` (medium) if detected≠slot ≥0.7. While any doc is `UNCLASSIFIED`, `required_doc` cannot `FAILED_CHECK`.
**Extraction (S6):** schema per doc type (`rules/schemas/<TYPE>.yaml`: key,type name|id|date|text|money,required,pattern). **Complete = every required field extracted and valid**; "uploaded" ≠ complete. Ladder: layout/regex → LLM with JSON schema (temp 0, pydantic + 1 retry, **reject any field whose `quote` isn't a verbatim substring**, document is data not instructions, no tools, cached) → human correction (`extractor="human"`). Provenance `fix`: extractor returns `block_id` or `cell=(table,r,c)`; LLM quote in several blocks → ungrounded `AMBIGUOUS_MATCH`. Tabular rosters (`FACULTY_LIST`) use `rows:` schema; derived `regular_count` is `regex_exact` only if all cells exact (CSV/XLSX), else `uncalibrated` → `NEEDS_REVIEW`; de-dup rows by `HMAC-SHA256(key, norm_id(pan_or_faculty_id))` → `DUPLICATE_ROW_IN_ROSTER` (medium, rectifiable).
**Grounding (S6b):** pool = exact cell / matched block / page-hinted blocks; one hit → grounded; many hits w/o provenance → `AMBIGUOUS_MATCH` (do not guess); fuzzy (`partial_ratio ≥85`) only for strings ≥6 chars inside the pool; short numerics/dates exact only. Digital/hybrid: refine with `page.search_for(raw, clip=block_bbox)` on the original page → word precision. Ungrounded cannot be sole basis of a hard verdict.
**Typed facts:** dates day-first India, 4-digit years only; 2-digit year or no-year → `ambiguous` → `NEEDS_REVIEW` (never guess). Names: compare core and legal form separately (`LEGAL` map pvt/private, ltd/limited, trust, society, llp, foundation; `ABBR` map); `token_sort_ratio` (not `token_set`), subset → `PARTIAL`; `MATCH→PASS`, `DIFFERENT→FAILED_CHECK` (both sides grounded+calibrated), `LEGAL_FORM_DIFFERS/PARTIAL→NEEDS_REVIEW`. "Pvt. Ltd." vs "Private Limited" = MATCH; Trust vs Society ≠. `norm_id = re.sub(r"[\s\-/]","",s.upper().translate(DIGITS))`.
**Records adapter (simulated):** `institute, approved_programmes, previous_eoa, deficiencies, ter_payment, faculty, application_history`, + `faculty_listed_elsewhere(id_hmac)` (Phase C, officer-only). Record = `{data, source_version, fetched_at, simulated}`; `None` → `NOT_CHECKED`. Role-gated, audited, SIMULATED badge. **TER = Technical Education Regulatory fee** (application charge); record `{status, amount_due, amount_paid, paid_on, receipt_no}`; check status only, don't recompute fees/exemptions.
**Aggregation:** workflow: any open rectifiable finding in `{MISSING, INCOMPLETE, EXPIRED, INCONSISTENT, COMPLIANCE_GAP}` → `NEEDS_RECTIFICATION`; elif mandatory `NOT_CHECKED/NEEDS_REVIEW`, verification in `{MANUAL_REVIEW_REQUIRED, SOURCE_UNAVAILABLE, VERIFICATION_PENDING, NOT_SUPPORTED(mandatory)}`, HIGH tier, or dead job → `NEEDS_MANUAL_REVIEW`; else `VALIDATED_NO_ISSUES`. Lanes (first match): `NEEDS_SCRUTINY` (HIGH tier / high inconsistency) → `NEEDS_VERIFICATION` → `NEEDS_EVIDENCE` → `FAST_REVIEW` (only if validated). Priority = `100·high + 30·medium + 5·low + age_days + deadline_pressure` (queue order, not probability). Alerts: missing info; expiry ≤30/60 days; verification beyond SLA; HIGH tier; unresolved discrepancy; dead job (SSE + local SMTP sink); store `finding.created_at`/`alert.created_at`.
**Report/rectification:** report lists run/not-run/unsupported/failed/passed with evidence; institution sees only its own rectifiable findings; re-upload = new `documents` row (version+1, `supersedes`), re-evaluate every rule whose input facts changed (dependency map from declared `inputs`, incl. cross-document); closed findings keep history; `REVISION_DIGITS_ONLY_CHANGE` (info, officer-only). `+` Deficiency notice draft (rectifiable findings with two-sided evidence only; no anomalies/dup identities/verification internals; `DRAFT` until a named officer sends with reason) and inspection brief (internal; INSPECTION_SUGGESTED/ADDITIONAL_EVIDENCE items, pending verifications, advisory anomalies). Neither is a decision.

### Rules engine
Rule file: `rule_set, version, demo, effective_from (by submission date/academic year, not run date), effective_to, approved_by, params, rules[]`; each rule `{id, type, status enabled|planned|synthetic_demo, mandatory, doc_type, field, params, inputs[fact keys], severity, rectifiable, message, ref{handbook, clause, amendment}, tests[]}`. `synthetic_demo` = illustration, not an AICTE requirement; only reviewer-referenced rules may be `enabled`; never invent clauses; title the handbook "APH 2024-25 to 2026-27" + amendments.
Evaluator template: gather facts → `precheck` each (missing→`NOT_CHECKED`; parse not ok→`NEEDS_REVIEW`; ungrounded→`NEEDS_REVIEW`; conf<0.6 (None-safe)→`NEEDS_REVIEW`; `needs_confirmation`→may PASS, may not FAIL; hard-capable only if `conf_kind ∈ {regex_exact, human, engine_score_calibrated}`) → compute → `harden` (would-be FAIL with any non-hard input → `NEEDS_REVIEW`) → two-sided evidence → category → result.

| Type | Cat | PASS | WARNING | FAILED_CHECK | NEEDS_REVIEW | NOT_CHECKED |
|---|---|---|---|---|---|---|
| `required_doc` | MISSING | type present | — | absent **and** no UNCLASSIFIED | absent but UNCLASSIFIED exists | classification didn't run |
| `required_field` | INCOMPLETE | all required valid | — | required field missing/invalid | ungrounded/low-conf | doc absent |
| `not_expired` | EXPIRED | `valid_till−as_of > warn_days` | `0≤…≤warn_days` (last valid day inclusive) | `valid_till < as_of` | ambiguous/ungrounded | no value |
| `date_order` | INCONSISTENT | `issued_on ≤ valid_till` | — | `>` | unreliable date | missing date |
| `fuzzy_match` | INCONSISTENT | `MATCH` | — | `DIFFERENT` (grounded, calibrated) | `LEGAL_FORM_DIFFERS`, `PARTIAL` | side unavailable |
| `field_lte_record` | INCONSISTENT | form ≤ record | — | form > record | form repaired | record/form unavailable |
| `table_sums_consistent` | INCONSISTENT | sums hold | — | mismatch, no repaired cell | mismatch w/ repaired cell | no table/total |
| `id_format` | INCONSISTENT | matches pattern | — | grounded value fails | repaired | no value |
| `visual_mark_present` (B) | ANOMALY | candidate found | — | n/a (advisory) | none found → "needs a human look" | no raster |
| `record_flag` (B) | INCONSISTENT | no open deficiency/unpaid TER | — | open/unpaid | record stale | no record |
| `id_match` (B) | INCONSISTENT | `norm_id` equal | — | differ, both hard-capable | repaired/ungrounded | missing |
| `faculty_ratio` (B) | COMPLIANCE_GAP | regular count ≥ `ceil(S/ratio)` | — | below, hard inputs | OCR'd roster/repaired/stale | roster/intake unavailable |

`as_of` is a parameter (default `submission_date`); a reviewer decides valid-on-submission vs academic-year start vs through approval period. Candidate norms only (confirm vs APH Appendix 7): faculty:student **1:20** on `S = sum of approved intake over all years of the programme`; cadre **1:2:6** (cadre check = Phase C). Count regular/full-time only. Cross-doc `date_order` orderings are `synthetic_demo` until a reviewer supplies the clause.
Run loop: skip `planned`; evaluator exception → `NOT_CHECKED` (error class only in UI). `data_snapshot_id = sha256(sorted fact ids+versions+record versions)`. Persist every result. **Activation validator (fails closed):** named approver; unknown rule type rejected (not for `planned` `fix`); enabled rule with placeholder `ref.clause` rejected; `synthetic_demo` only in `demo:true` sets; non-planned rules need tests and known fact keys. Activation also requires all tests pass + valid dates. LLM never authors thresholds. `aicte rules test`; `aicte rules diff --from 3 --to 4 --corpus corpus/` = shadow mode / amendment impact. Add a legitimate-variant control and a hard negative to every comparison rule. Two rule sets from Phase B (`EOA_RENEWAL` + e.g. `INCREASE_INTAKE`).

### Verification gateway
`decide()` order: returned None → `MANUAL_REVIEW_REQUIRED` (`REFERENCE_NOT_FOUND`, not proof of absence); a whitelisted field missing → `MANUAL_REVIEW_REQUIRED` (`PARTIAL_RESPONSE`); any mismatch → `MISMATCH_DETECTED`; `validity_ended` or `valid_till < today` → `EXPIRED`; else `VERIFIED`. Other statuses: accepted-answer-later → `VERIFICATION_PENDING` (poll w/ bounded backoff, SLA alert); timeout/5xx/retries/circuit open → `SOURCE_UNAVAILABLE`; no adapter → `NOT_SUPPORTED`; invalid response → `MANUAL_REVIEW_REQUIRED`; not attempted → `NOT_CHECKED`. Nothing is `VERIFIED` by default. Adapters normalise to `TransientSourceError | PermanentSourceError | InvalidResponse`. Cache key = adapter + identifier + **canonical submitted fields** `fix` (rectified re-upload must not reuse stale result). Cache and circuit breaker in **Postgres** `fix`: `breaker_open` = ≥5 `transient_failure` in 2 min, half-open after 30s with one probe. Store minimum: digests, response code, source txn id, timestamp, compared fields.
Adapters: `SignatureAdapter` real crypto vs demo root; `QRAdapter` decode real, registry simulated; `RefNoAdapter` simulated; `MockPortalAdapter` simulated (latency, injected 503, async callback). A mock 503 shows fallback logic, not authority reliability. Production routes: DigiLocker/API Setu (issuer–requester, needs approval), National Academic Depository, issuer-signed PDFs/QR, state APIs — one adapter file each, role-gated credentials.

### Infra evidence (mandatory baseline; never says "compliant")
Item states: `EVIDENCE_COMPLETE_FOR_REVIEW, ADDITIONAL_EVIDENCE_REQUIRED, POSSIBLE_DUPLICATE_EVIDENCE, LOCATION_METADATA_INCONSISTENT, INSPECTION_SUGGESTED, NOT_CHECKED`. Checklist file `rules/infra/<category>.yaml` (`key,label,min_files,geo_required,radius_km,claimed_value,min_value,if_missing_severity`; `synthetic_demo` until confirmed).
| # | Check | Rule → output | Phase |
|---|---|---|---|
| 1 | Evidence inventory | `count<min_files` → `ADDITIONAL_EVIDENCE_REQUIRED` | A/B (mandatory) |
| 2 | Missing EXIF | none + `geo_required` → ADDITIONAL…; else info `INFRA_NO_GEO_EVIDENCE` | B |
| 3 | GPS vs campus | haversine > `radius_km` → `LOCATION_METADATA_INCONSISTENT` (low) | B |
| 4 | Capture time | outside claim window → info/low | B |
| 5 | Reused photo | pHash Hamming ≤6 across institutions → `POSSIBLE_DUPLICATE_EVIDENCE` (medium) | B |
| 6 | Claim vs minimum | claim < `min_value` → `INSPECTION_SUGGESTED` | B |
| 7 | Officer action | `request_more_evidence` / `suggest_inspection`, reason mandatory, audited, alert | B (mandatory) |
| 8 `+` | Video | ExifTool QuickTime tags feed 2–4; OpenCV samples every 2s (max 30), sharpest per 5s window (Laplacian variance); keyframes feed 5 & 9; never OCR/cloud | B |
| 9 `+` | Usability | blur / exposure / min long edge → ADDITIONAL…("unusable for review", a request not accusation) | B |
| 10 `+` | Floor-plan schedule | text-layer plans: cluster `get_text("words")` into visual rows (vertical centres ≤4pt, sort by `x0`; never group by block/line), match `<room label> … <number> <unit>` (sq.m/sqm/m²/sq.ft ×0.09290304, `Decimal`); architect reg. no. → `RefNoAdapter` (simulated). None found → ADDITIONAL…; area below claim/min or room-count differs → `INSPECTION_SUGGESTED`. Labels = architect's claim, not measurement | B |
Phase C only: VLM scene labels/object counts (COCO/YOLO has no desk/extinguisher class, YOLO is AGPL; CLIP/SigLIP can answer "looks like a lab?" as info/low advisory, cannot count), scanned-plan parsing, image freshness. VLM = checklist question → JSON + confidence, never "compliant"; photos are egress.

## 6. PHASES (build plan, exit gates, scope, cut order)

Hours are planning estimates, not measured; re-baseline after Phase 0 smoke tests. Claude Code removes scaffolding time, not verification time. Build one module per session: spec → tests first → implement → `make test-<module>` → log in `docs/decisions.md`.

### Phase 0 — Setup (≈½ day)
**Contents:** repo + `CLAUDE.md`; six contracts + `openapi.yaml` (freeze; UI builds against fixtures until backend live); migrations (§3); offline compose stack; CLI skeleton; **12 Day-1 smoke tests** (below).
**Exit gate:** `docker compose up` works; migration creates every table/index; smoke results in `docs/decisions.md`.

### Phase A — One reliable case (≈2–3 days, 3–4 people)
**Scope:** end-to-end for **one category (EoA renewal)**, 4–5 doc types; `mode: offline` only.
**Build:** synthetic generator (one institute, one application) → jobs queue (leases/reaper/recovery) → ingest (hash, sniff, vault, **envelope encryption per v4**, cleanup) → per-page router → Docling offline + coordinate mapping → typing/extraction/grounding for 4–5 types → typed facts → **5–8 rules** (`synthetic_demo` unless reviewer-referenced) → verification: **one simulated success + one simulated unavailable fallback** (+QR decode, text-layer mismatch, metadata/signature core per build order) → evidence viewer with `NOT_CHECKED` handling → officer action + audit verify → `aicte eval run` on small corpus.
**Exit gate:** Appendix-B run reproduces exactly; all DoD items tagged A pass.
**Suggested defects/tests (guide doesn't assign; this is my split):** D01, D01b, D02, D03, D03b, D04, D04c, D04d, D04e, D05, D09, D10, D11, D16, D17, D17b, D20, D21; unit tests `test_router` (mixed PDF), `test_skew`, `test_inverse_map`, `test_numbers`, `test_sum_checks`, `test_ground`, `test_rules`, `test_activation_validator`, `test_precheck_harden`, `test_name_compare`, `test_parse_date`, `test_audit_chain` (edit a row **and** `ts` → fail), `test_envelope`, `test_dedup_policy`, `test_qr_reference`, `test_egress_gate`.
**Definition of Done (A):** clean-clone setup works, all tables/indexes migrate, UI loads · upload limits enforced; rejected inputs leave no plaintext temp file; failed DB commit recoverable · exact re-upload reuses extraction, writes new upload event, context-aware dup result · mixed PDF → valid merged payload, original page numbers, IoU ≥0.9 after ±3°/±7° · every field keeps raw, normalised value, provenance, confidence method, grounded quote/box or explicit "ungrounded" · unknown rule types fail activation; enabled rules have tests + reference or are `synthetic_demo` · missing/expired/inconsistent/unsupported/low-confidence/not-checked give **distinct** outputs · all 8 verification statuses reachable; mocks carry `simulated:true` in API+UI · evidence viewer opens any finding with both sides highlighted · audit verify passes, canonical-field or `ts` edit fails it · `aicte eval run` produces metrics from saved ground truth, lists known misses, separates simulated vs real verification.

### Phase B — Strengthen (≈2–3 days for v4 scope; `+` items best-effort)
**Contents:** job recovery tests · offline egress proof · `egress_gate` + `SafeHttpClient` everywhere `+` · auth + RBAC negative tests · fuzzy duplicates · selected forensics (metadata, signature, QR, text-layer mismatch, `mark_reuse` `+`) · **infra checklist + escalation (mandatory)**, plus video keyframes `+` and floor-plan area schedule `+` · envelope encryption hardening (rotation/rewrap/restore tests; flag fallback `none` only if behind) · second rule set + category cross-check `+` · `id_match`, cross-document `date_order`, `faculty_ratio` (+ `record_flag`, `visual_mark_present`) · rule diff/shadow mode · report export + two officer drafts `+` · calibrate thresholds (OCR per engine, pHash, ELA z, router, typing θ/δ).
**Exit gate:** DoD items tagged B pass; thresholds logged.
**Suggested defects:** D06, D06c, D07, D08, D11b, D12, D13, D14, D14b, D14c, D18, D19, D22, D23, D24, D25; `+` D26–D34 (D26 category mismatch; D27/D27b id_match; D28 date_order; D29/D29b/D29c faculty ratio; D30 repeated-value grounding; D31/D31c/D31d mark reuse; D32/D32b floor plan; D33/D33b usability + video dup; D34 shared breaker).
**Tests:** `test_jobs_recovery`, `test_checkpoint_trust_pin`, `test_rbac_matrix`, `test_watermark_preservation`, `+` `test_ground_repeated_value`, `test_category_cross_check`, `test_rule_set_selection_two_categories`, `test_id_match`, `test_faculty_ratio`, `test_floorplan_schedule`, `test_video_keyframes`, `test_mark_reuse`, `test_http_client_funnel`, `test_verification_breaker_shared`.
**Definition of Done (B):** worker exception/kill/retry exhaustion/duplicate delivery/fork-join complete with no stranded application · offline mode has no outbound route from any service (command output recorded) · confidential docs blocked from cloud egress unless explicitly authorised; `online` can't bypass · cross-institution tests cover document, page, payload, facts, finding, verification, report; role negatives pass · QR/issuer requests can't reach unapproved hosts (no doc-supplied host, redirects off) · ≥1 infra workflow can request evidence/suggest inspection with mandatory reason + audit · second rule set selected by category+date; `CATEGORY_DOCUMENT_MISMATCH` beside confirm button, never changes category `+` · `id_match`, cross-doc `date_order`, `faculty_ratio` return distinct PASS/FAILED_CHECK/NEEDS_REVIEW/NOT_CHECKED on fixtures `+` · video and floor plan each produce an infra result with evidence, never "compliant" `+` · deficiency-notice draft has no advisory-only content and can't be sent without named officer + reason `+` · runtime DB role can't UPDATE/DELETE audit tables; checkpoints verify against trust-pinned key · UI/report state: decision support only; not proof of forgery; not a regulatory decision; actual source verification may be unavailable · README: architecture, modes, limits, safeguards→PS mapping, licences, realness table.

### Phase C — Stretch (each feature behind a flag with its own tests)
Azure fallback + `hybrid`/`online` modes (Squid override, quota table, after smoke tests) · Indic route (EasyOCR image) · VLM/object counts · raster (scanned) floor-plan parsing · cadre ratio 1:2:6 + `faculty_duplicate` (cross-institute, advisory, officer-only) · ORB/NCC seal-crop comparison · ZIP bundle expansion · further categories · C2PA/ELA extras · S3 adapter · live connectors only if authorised · D15 (lab photo with fewer computers than rule; advisory only).

### Cut order if behind
`+` items first: raster floor-plan automation → VLM/object counts → officer export drafts → `mark_reuse` → video keyframes → extra forensic detectors (ELA, visual marks, C2PA) → `faculty_ratio` → second category + cross-check (keep CLI selection test) → hybrid route → rule-diff UI (keep CLI) → envelope encryption (fall back to `storage.encryption: none` + volume encryption, and say so).
**Never cut:** evidence-linked findings; explicit `NOT_CHECKED`/`NEEDS_REVIEW`; infra checklist + escalation; audit events + verify; tenant isolation; measured evaluation; real-vs-simulated labelling.

### Build order for Claude Code
0 contracts+migrations+CLI+compose → 1 synthetic generator → 2 jobs (queue, leases, reaper, recovery tests) → 3 ingest → 4 router+prep (+inverse-map tests) → 5 engines+post-process+payload → 6 Branch A core (metadata, signature, QR, text-layer mismatch) → 7 typing, extraction, grounding, facts → 8 rules+records → 9 verification → 10 audit+RBAC → 11 API+console (evidence viewer first; wire to live API now, build UI against fixtures earlier) → 12 infra baseline (+video, floor plan) → 13 eval harness, landing page, offline proof.

### Team split
A: ingestion, router, preprocessing, engines · B: Branch A, extraction, rules, verification, audit · C: console, landing page · D: synthetic data, eval, docs, video. A teammate who did **not** write the detectors builds the tampered set.

### Day-1 smoke tests (`scripts/smoke/`; results → `docs/decisions.md`)
| # | Test | If fails |
|---|---|---|
| 1 | Docling on digital/scanned/mixed PDF: blocks+tables, `doc.pages[...]` keys, `prov.page_no` 1-based, `to_top_left_origin` | adjust `norm()`; pin another version |
| 2 | `result.confidence`: which raw scores exist | `text_sanity_density`, `calibrated=false` |
| 3 | PyMuPDF searchable-scan: `get_texttrace()` `type==3`, `get_image_info(xrefs=True)`, redaction/image-removal API | change classifier signal; keep watermark `detect_only` |
| 4 | RapidOCR/Azure on `rupee_table`: is `₹` emitted, which confusions | extend §9 confusion list; rely on sum checks |
| 5 | Azure SDK `body=` vs `analyze_request=`, F0 limits, Indic coverage | adapt wrapper; declare languages out of scope |
| 6 | pyHanko on valid/broken/modified/unsigned: enum names, stand-in root loads | adapt `signature_flag()` |
| 7 | ExifTool + c2pa versions/keys/API | skip C2PA (Phase C) |
| 8 | Postgres: migration, `findings_one_live_per_fp`, runtime role `permission denied` on `UPDATE audit_events` | fix grants |
| 9 | Docker: offline socket commands fail from `app` and `worker`; gateway publishes; `models pull` writes `/models` | adjust topology; explicit output dir |
| 10 | Storage: `os.link` works on the volume | lock-file fallback |
| 11 | OpenCV opens H.264 MP4 in image; ExifTool returns `CreateDate`; ≤30 frames | add ffmpeg/codec libs; else videos `NOT_CHECKED` + request stills |
| 12 | CAD plan (~150 label chars, thousands of paths) → `vector_drawing`; bordered certificate stays `digital`; `get_text("words")` returns labels | tune `drawing_dense_paths`/`drawing_text_ratio` |
Not confirmed in the guide: PyMuPDF `get_texttrace type==3` and `delete_image`; Docling page indexing and confidence field names; RapidOCR/Azure `₹`; built-up/lab area norms; cadre formula beyond 1:2:6; architect reg-no format; OpenCV video codecs; CAD routing thresholds.

### Deployment/rollout stages (proposal pack; separate from build phases)
Shadow mode (anonymised/test bundles, no effect on decisions; exit: agreed per-rule precision/recall + FP patterns) → Pilot (one category/region, live but advisory; exit: time-to-review + deficiency-detection measured) → Portal integration (API/SSO, institution pre-check; exit: security review) → Issuer integrations (authorised adapters one by one) → Scale (more categories, multilingual OCR, analytics). Production stack: PostgreSQL, queue + workers, private object storage, malware scanning, OIDC/SSO, on-prem/India-region OCR, observability, sandboxed workers, retention jobs.

## 7. Security, RBAC, audit, API

**Audit:** hash chain `entry_hash = sha256(canonical{ts, actor, action, subject, details, prev})`; never "blockchain". `audit()` is the **last statement before commit**, `SET LOCAL lock_timeout='3s'`, `pg_advisory_xact_lock`; worker/pipeline events use own short txn; failure aborts the action (fail closed); never release lock early (chain forks). `verify_chain` checks schema, `prev`, hash, every column vs canonical, and `ts`. Signed Ed25519 checkpoints every N events/minutes, exported **outside the DB**; `/audit/verify` checks each checkpoint against trust-pinned pubkeys in `keys/trusted_pubkeys/` (not from DB) **and** recomputed head at `upto_id`. Limits: DB + key control can rewrite history; anchoring strengthens it. Log events about documents, not contents/PII. Events: upload, hashes, forensics (detector versions), routing, engine+level, `EGRESS_*`, rule set/version, records checked, verification calls, alerts, officer actions with reasons, rule activation+approver, document reads, logins, role changes.
**RBAC (server-side; every endpoint runs scope + ownership guard; 404 hides foreign IDs; vault reads audited):**
| Role | Scopes | Cannot |
|---|---|---|
| `institution` | `app:create, doc:upload, finding:read_own, doc:rectify` | see other institutes, officer notes, dup-match identities |
| `officer` | `app:read, doc:read, finding:act, verify:run, alert:read, infra:request` | edit rules |
| `senior_officer` | officer + `finding:resolve_escalation` | edit rules |
| `rules_admin` | `rules:read, rules:write` | read documents |
| `auditor` | `audit:read, app:read_meta` | modify; read document bodies |
Negative tests: A→B access to app/doc/page/payload/facts/finding/verification; officer edits rules; rules_admin reads docs; auditor reads bodies; expired/revoked tokens; guessed IDs; direct storage keys.
**Auth:** two issuers — `local` HS256 (prototype) and `portal` RS256/JWKS (design-only); unverified decode only to pick the verifier; algorithm pinned per issuer; role/active flag from DB, never token. Access 15 min; refresh rotates, stored hashed with `jti`, revocation table.
**Security checklist:** sniff by bytes, caps, reject macros/OLE/encrypted; parse untrusted files only in non-root, read-only-FS, resource-limited worker containers with no route out in offline; TLS in transit; keys only in `/keys`; retention covers originals/derived/exports/backups with audited purge; logs = IDs/hashes only; LLM text untrusted (delimited, no tools, validated, injection fixture; OWASP ASVS + LLM Top 10); person identifiers stored only as `HMAC-SHA256` (faculty PAN/ID); **never extract/store Aadhaar** (mask; legal restriction); DPDP Act 2023 applies (rules notified Nov 2025, phased — verify dates); licences: PyMuPDF AGPL (plan `pypdfium2`+`pikepdf` if needed), Docling MIT, YOLO AGPL; never send real documents to cloud because `mode: online`.
**Threats → controls:** malicious upload → limits+sandbox+current ExifTool/PyMuPDF; prompt injection → controls+fixture; QR SSRF/DNS rebinding/redirect → QR never supplies host + egress allow-list + redirects off; cloud leak → gate in every mode + audit; insider DB edit → role split + signed checkpoints + external anchor; cross-tenant → guard + 404; orphan vault → reconcile; key loss → separate `/keys` backup + `rewrap` + recovery doc.
**API (FastAPI, OpenAPI `/docs`):** `POST /auth/login|refresh|logout` · `POST /applications` · `POST /applications/{id}/uploads/presign` · `POST /applications/{id}/documents` (Idempotency-Key) · `POST /applications/{id}/submit` · `GET /applications` · `GET /applications/{id}` · `GET /applications/{id}/runs/{run_id}` · `GET /applications/{id}/report` · `POST /applications/{id}/exports/deficiency_notice|inspection_brief` `+` · `GET /documents/{id}/pages/{n}.png` · `GET /documents/{id}/payload|facts` (officer/auditor) · `POST /facts/{id}/correct` · `POST /findings/{id}/action` (ack|dismiss|manual_verified|request_rectification|escalate; reason mandatory for high) · `POST /applications/{id}/decision` (only path to `OFFICER_DECISION_RECORDED`) · `POST /documents/{id}/reupload` · `POST /verifications/{id}/manual` · `POST /applications/{id}/infra/{item}/evidence|request_evidence|suggest_inspection` · `GET /alerts`, `GET /stream` (SSE) · `GET /audit`, `/audit/verify`, `/audit/checkpoints` · `GET/POST /rules`, `POST /rules/{id}/activate` · `GET /metrics`, `GET /about/realness` · `GET /healthz|readyz` (readyz fails clearly if models missing offline) · `POST /webhooks/portal`.
**UI:** screens — Queue (lanes, priority formula tooltip, SLA, KPIs); Application detail (Checklist | Documents | Findings | Verifications | Infra | Timeline — shows run/not-run/unsupported/failed/passed); **Evidence viewer** (original raster + overlay, `left=x0·w, top=y0·h, width=(x1−x0)·w`; word boxes solid, block dashed, precision badge; click finding → both sides); Verification panel (3 separate fields, SIMULATED badge, manual form); Institution view (own findings, re-upload, "clearer scan requested"); Rules page (YAML editor, validate, test, diff, activate with approver, `synthetic_demo` badge); Audit page (timeline, Verify chain, checkpoints, tamper demo); Metrics (table with known misses); Realness page. Rules: advisory banner on every anomaly/infra finding ("Preliminary indicator requiring human verification; not proof of forgery; not a regulatory decision"); no numeric risk/forgery scores; mandatory reason to dismiss/override high-severity (stored beside, never over, the original); keyboard triage J/K/A/D/E/R/V//. Stack (prototype): React+TS+Vite+Tailwind+shadcn/ui, TanStack Query; FastAPI.
**Integration story:** OpenAPI contract + mock portal shell embedding institution/officer views via same API + portal-issuer token interface (design-only) + status-change webhook. Say restricted AICTE systems are simulated.

## 8. Docker, config, CLI

**Why Docker:** no always-on cloud cost, privacy (offline provable), `--scale worker=4`, reproducibility, air-gap (image tarball + pre-filled models volume). Honest cost: large images → keep hosted demo (synthetic only) or recorded run.
**Image:** in = Python deps, app, built UI, `exiftool`, OpenCV libs, `aicte` CLI; **not in** = Docling/RapidOCR weights or any LLM (mapped volume via `aicte models pull`, wraps `docling-tools models download -o /models/docling` — pass explicit dir). Multi-stage, pinned base digest + `uv.lock`, CPU torch, non-root, `HEALTHCHECK /healthz`. `models pull` needs network once (run with online override or on host), then start offline.
**Offline topology (`docker/compose.yml`):** `gateway` (nginx:1.27-alpine, publishes 8080, on `edge`+`internal`) → `app`, `worker` (limits 4 CPU/8g), `postgres:16` all on `internal` only; `networks: {internal: {internal: true}, edge: {}}`; volumes `../config.yaml`, `../data:/data`, `../models:/models`, `../keys:/keys`, `pg`. A container on internal+normal network still reaches the internet, so `app` is never on `edge`; verify published-port behaviour on your Docker version. **Online override:** `compose.online.yml` adds `egress-proxy` (`ubuntu/squid`, on `internal`+`egress`, allow-listed hostnames, CONNECT 443, logging); app/worker get `HTTPS_PROXY=http://egress-proxy:3128`, `NO_PROXY=postgres,localhost`. **Proof (record real output):** `docker compose exec worker|app python -c "import socket; socket.create_connection(('1.1.1.1',443),3)"` MUST raise. Production also needs host-level egress enforcement.
**`config.yaml`:**
```yaml
mode: offline                       # offline|hybrid|online (A/B ship offline only)
confidential_default: true
egress: {approved_providers: [], require_doc_authorisation: true}
ocr:
  start_engine: docling_rapidocr
  thresholds: {docling_rapidocr: {value: 0.80, provisional: true}, azure: {value: 0.85, provisional: true}}
  languages: [en]
  azure: {endpoint: ${AZURE_DI_ENDPOINT}, key: ${AZURE_DI_KEY}, monthly_cap: 480}
watermark: {mode: detect_only}
llm: {provider: none, model: "", ollama_url: "http://host.docker.internal:11434"}
storage: {backend: local, root: /data, encryption: envelope}      # none|envelope (v4 default envelope)
verification: {allow_hosts: ["verify.mock-issuer.example"], simulated_only: true, timeout_s: 10}
audit: {checkpoint_every_events: 50, checkpoint_export: /data/checkpoints.jsonl}
retention_days: 365
thresholds: {min_visible_chars: 80, img_cover_scan: 0.60, phash_hamming: 6, ela_z: 6.0, drawing_dense_paths: 400, drawing_text_ratio: 0.25}
infra: {video_max_mb: 200, video_max_s: 180, keyframe_every_s: 2, blur_min_laplacian_var: 60.0, min_long_edge_px: 1024}
```
**Quickstart:** `cp .env.example .env && cp config.example.yaml config.yaml` → `aicte keys init` → `aicte models pull` (once, networked) → `docker compose -f docker/compose.yml up -d` → `aicte db migrate` → `aicte db seed-demo` (prints logins). GitHub Actions builds on tag → `ghcr.io/<org>/aicte-validator:<tag>|latest` (+`:indic`,`:gpu`), release assets `docker save | zstd -19` + `SHA256SUMS`. Landing page: hero + GIF of evidence viewer, measured min requirements, screenshots, SBOM/licence, `docker load` steps, modes matrix, realness table, eval table with misses, safety statement, FAQ.
**`CLAUDE.md` (≤150 lines):** project + spec pointers; non-negotiables (no "rejected/forged/fraud/fake"; NOT_CHECKED; two-sided evidence; raw bytes immutable; `egress_gate()` always + no network in tests; no invented clauses; don't change `docs/contracts/*` without asking; pin versions; synthetic data only); workflow (read module contract → tests first → smoke test for uncertain library calls → log to decisions.md); commands `make test-<module> | make test | aicte db migrate | aicte rules test | aicte eval run | aicte audit verify`; done = tests pass, schema validation passes, audit events emitted, NOT_CHECKED paths covered, decisions.md updated. **Per-module prompt:** "Read CLAUDE.md and docs/spec/<NN>-<n>.md. Implement <path> per its Module contract. Tests first (spec I/O + vectors), show them failing, then implement. Don't change contracts. List unverifiable library calls → smoke test. Stop when `make test-<module>` passes. Report files changed, thresholds (why), open questions."

## 9. Synthetic data and evaluation

**Generator** (`scripts/gen_data.py`, fixed seed, all stamped SYNTHETIC): `Faker('en_IN')`; several fictional issuer templates/layouts; 8 institutes, 14–16 applications, ~80 documents (proposal pack suggested ~12 bundles/~60 docs minimum); reportlab + qrcode; pyHanko stand-in root (2 valid, 1 broken, 1 modified-after-signing). Variants: `clean_digital, searchable_scan, scan_300dpi, scan_skew_±3/±7, scan_noisy, phone_photo, watermark_diag_faint, watermark_horizontal_faint, watermark_colour, stamp_over_text, hybrid_annexure, legacy_font_garbled, rupee_table, merged_cell_table, injection_doc` + legitimately-edited controls (scanned, cropped, compressed, re-saved, signed, photographed); `hindi_page/kannada_page` only if implemented+tested. `+` fixtures: `EOA_LETTER` (programme, course, affiliating body, previous/current intake, NRI/international columns), `FACULTY_LIST` (XLSX + scanned PDF), `floorplan_cad_vector`, `floorplan_scanned`, `infra_photo_blur_dark`, `walkthrough_video`, `covering_letter` (one purpose phrase per category), table with same number in three cells. `ground_truth.json`: per-page class, per-field values+boxes, expected findings per application, issuer template id. **Hold out whole templates/issuers**; hard set (rotated, noisy, stamped, legit re-saved); publish seed, schema, commands, exact results, known misses.

**Seeded defects (expected outputs)**
| ID | Defect | Expected |
|---|---|---|
| D01 / D01b | missing affidavit / + an UNCLASSIFIED doc | `FAILED_CHECK` MISSING / `NEEDS_REVIEW` |
| D02 / D03 / D03b | NOC expired / expires in 20 days / date `31/03/26` | `FAILED_CHECK` EXPIRED / `WARNING` / `NEEDS_REVIEW` (never EXPIRED) |
| D04 / D04c / D04d / D04e | truly different name / "Pvt. Ltd." vs "Private Limited" / Trust vs Society / two colleges sharing founder's name | FAILED / PASS / NEEDS_REVIEW / FAILED |
| D05 | requested intake > approved | `FAILED_CHECK` |
| D06 / D06c | re-saved via image editor / legit re-save | `EDITING_TOOL_IN_METADATA` / no medium+ flag |
| D07 | pasted digits in image | `ELA_LOCAL_ANOMALY` (weak; misses reported) |
| D08 | same certificate reused by two institutes, name edited | `SAME_FILE…`/near-duplicate |
| D09 | QR reference ≠ printed details | `MISMATCH_DETECTED` |
| D10 | invalid ID format | `id_format` FAILED |
| D11 / D11b | issuer 503 / partial response | `SOURCE_UNAVAILABLE`→manual / `MANUAL_REVIEW_REQUIRED` |
| D12 | signature broken / modified after signing | `SIG_BROKEN` / `SIG_MODIFIED_AFTER_SIGNING` |
| D13 | TER unpaid / open deficiency | `record_flag` FAILED |
| D14 / D14b / D14c | GPS 40 km off / no evidence / claimed lab area below minimum | `LOCATION_METADATA_INCONSISTENT` / `ADDITIONAL_EVIDENCE_REQUIRED` / `INSPECTION_SUGGESTED` |
| D15 | fewer computers than rule | Phase C, advisory |
| D16 | two clean applications | `VALIDATED_NO_ISSUES`, no findings |
| D17 / D17b | table total ≠ sum / one summand OCR-repaired | `TABLE_SUM_MISMATCH` FAILED / `NEEDS_REVIEW` |
| D18 | hidden OCR text ≠ visible image | `TEXT_LAYER_OCR_MISMATCH` |
| D19 | prompt-injection document | no effect on any finding |
| D20 | doc in wrong slot | `DOC_TYPE_SLOT_MISMATCH` |
| D21 | uncalibrated OCR value would hard-fail | `NEEDS_REVIEW` |
| D22 | worker killed; one child `dead` | application aggregates; pages `NOT_CHECKED` |
| D23 | institution A requests B's data | 404 on every endpoint |
| D24 | `mode: offline` outbound attempt | connection fails from every container |
| D25 | `online` + confidential doc | `egress_gate` denies; local path or `NOT_CHECKED` |
| D26 `+` | covering letter says "increase in intake" vs EoA renewal | `CATEGORY_DOCUMENT_MISMATCH`, category unchanged |
| D27 / D27b `+` | plot number differs between docs / `12/3A` vs `12-3-A` | `id_match` FAILED (NEEDS_REVIEW if repaired) / PASS |
| D28 `+` | completion cert dated after fire NOC (synthetic rule) | `date_order` FAILED |
| D29 / D29b / D29c `+` | roster below ratio / same but OCR'd / same id listed twice | `faculty_ratio` FAILED (COMPLIANCE_GAP) / NEEDS_REVIEW / counted once + `DUPLICATE_ROW_IN_ROSTER` |
| D30 `+` | same number in 3 cells | box on the extracted cell; no provenance → `AMBIGUOUS_MATCH` |
| D31 / D31c / D31d `+` | identical signature image across issuers / same seal one issuer / transparent RGB+mask signature | `MARK_IMAGE_REUSED_ACROSS_ISSUERS` / no medium+ / flagged; solid-colour bases don't match |
| D32 / D32b `+` | CAD plan lab area below claim / no area schedule | `INSPECTION_SUGGESTED` / `ADDITIONAL_EVIDENCE_REQUIRED` |
| D33 / D33b `+` | blurred/dark photo / video keyframe duplicates other institute's photo | ADDITIONAL… / `POSSIBLE_DUPLICATE_EVIDENCE` |
| D34 `+` | issuer outage seen by two workers | both open breaker from shared DB state |

**Metrics (compute, don't assert) — PS item ↔ measured**
| PS item | Metric | How |
|---|---|---|
| Extraction accuracy | CER `(S+D+I)/N`; field exact/fuzzy; grounded rate; bbox IoU by precision | same pages Docling vs Azure A/B |
| Validation accuracy | precision/recall/F1 per rule incl. controls; NOT_CHECKED/NEEDS_REVIEW correctness | D01–D05, D13, D17, D20, D21 |
| Anomaly detection | per-detector P/R; **FP rate on untouched originals**; misses; never one "fraud accuracy" | D06–D08, D10, D12, D18 |
| Source-verification rate | share reaching `VERIFIED/MISMATCH/EXPIRED`, excluding injected outages; simulated vs real separate | D09, D11, D12 |
| Discrepancy reliability | re-run determinism; stability across variants; % findings with two-sided evidence | repeat runs |
| Verification time | mean/p95 request→terminal, per adapter | gateway timestamps |
| Alert timeliness | p50/p95 `alert.created_at − finding.created_at` | stored timestamps |
| Manual effort reduction | hypothesis: share of items auto-evaluated with evidence; time saved only after officer study (`ΔT = T_manual − T_assist` — assumption; e.g. 15 docs × 6 min = 90 min vs 30 min is illustrative only, never present as fact) | interview a real officer |
Also: router per-page confusion matrix; table cell F1 + span accuracy; currency-symbol recall; **silent amount-changing errors counted separately**; watermark residue/collateral loss; IoU after ±3°/±7°; typing confusion matrix; ops p50/p95 per page by route, cache hit rate, retries, dead-letters, stranded jobs, **p95 audit-write wait**; security pass/fail (cross-tenant, offline egress, upload bomb, audit tamper, injection). Say "on our synthetic test set"; never extrapolate. Proposal-pack eval table also expects: classification accuracy, determinism pass/fail, injection safety pass/fail. Azure A/B: record page hash, engine/API version, config, time, quality, pages used; reconcile quota vs provider metrics.

## 10. Theory essentials (judge Q&A fuel)
- **OCR:** born-digital PDFs have a text layer (exact boxes) → always try it first; scans need OCR (preprocess→layout→detect→recognise→post-process, with confidence). Normalise every engine's boxes to 0–1 so evidence highlighting works. Low resolution, skew, stamps, handwriting, locked PDFs degrade accuracy → show confidence, never trust one read blindly.
- **Extraction controls:** schema validation, grounding vs OCR text, temp 0 + caching, model has no authority; prompt injection = document text is untrusted data.
- **Rules:** rule = `(applies_to, check, params, severity, message, source_ref, version, effective_from)`; versioned, testable, rollback-able. Fuzzy matching thresholds tested on legitimate variants and true mismatches. Failed checksum = entry/alteration error, not fraud. Three-valued logic prevents "no flag = all clear".
- **Anomalies:** weak independent signals; **base-rate caution**: 1% tampered, 90% TPR, 5% FPR → per 1,000 docs TP=9, FP=49.5, precision ≈15% → flags stay advisory, explained, precision-tuned, never trigger adverse action.
- **Signatures/PKI:** valid signature proves only that some key signed these exact bytes; trust needs a chain to a root you chose + validity + revocation; pyHanko needs you to supply trust roots. **QR decode ≠ verification**; authentication happens at the issuer's service.
- **Issuer model:** adapter pattern `verify(doc_type, identifiers) → result`; data minimisation; a student prototype can't be live on DigiLocker/API Setu.
- **Infra:** EXIF is editable/strippable → missing EXIF = request more evidence; VLM counts approximate/advisory; photos can't prove dimensions, location/date, or compliance.
- **Audit:** hash chain + signed checkpoints + external anchor (Merkle log as in Certificate Transparency is the production idea).
- **LLM risks:** hallucination → grounding; injection → delimiters/no tools/validation; non-determinism → temp 0/cache/pinned model; data exposure → `egress_gate`; inventing regulations → rules only from reviewed YAML.
- **Likely questions:** why Azure+Docling (sovereignty/cost vs hard scans; A/B numbers); why BLAKE3+SHA-256 (BLAKE3 content addressing/dedup, SHA-256 digests/chain; no FIPS claim); blockchain? no; docs leave machine? only via gate+proxy, offline has no route (show live); avoid false accusations (advisory, two-sided evidence, 3-valued rules, controls, human reason); preprocessing destroys evidence? no (forensics on raw, steps recorded, watermark removal off); Handbook changes (new rule version + diff/shadow); what's simulated (records, issuers, trust root; crypto is real); accuracy (measured table + misses); are rules AICTE's (`synthetic_demo` unless reviewer-referenced).

## 11. Pitch/PPT, risks, claims, open items

**Slide map:** 1 Title/team/PS ID · 2 Problem · 3 Solution diagram · 4 PS-requirement matrix · 5 Innovation/USP · 6 Pipeline diagram · 7 Stages + stack · 8 Trust/safeguards · 9 Prototype/demo screens · 10 Evaluation plan · 11 Feasibility · 12 Viability/rollout · 13 Impact · 14 Risks · 15 References.
**Demo (6–7 min):** 1 landing → stack running → mock portal → **realness page first**; 2 clean bundle → `VALIDATED_NO_ISSUES` → FAST_REVIEW; 3 defective bundle (missing affidavit, expired NOC, intake over approved, table total mismatch; legit-variant name passes) → click finding → both sides highlighted; 4 tilted watermarked scan with ₹ table: preprocessing steps, repaired amount **cannot** hard-fail, boxes right after deskew; 5 advisory leads (re-saved PDF, reused certificate, digits-only revision diff); 6 verification panel: valid signature (real crypto, demo root), QR mismatch, simulated outage → manual queue, SIMULATED labels; 7 infra checklist → request more evidence/suggest inspection with reason; 8 officer action with mandatory reason → institution re-uploads → finding closes, history kept; 9 edit rule → tests → validator rejects unknown type → fix → activate → result changes; 10 audit: Verify chain passes; edit a row **and** a `ts` in psql → fails; checkpoint check; 11 offline proof: two socket commands fail while pipeline completes; 12 metrics slide with misses; roadmap. Record a fallback video once golden path works.
**Appendix-B reference run (Phase A must reproduce):** `APP-2026-0007`, category `EOA_RENEWAL`, submitted 2026-10-12, requested intake 540, record approved intake 480, institute "Sri Venkateshwara Institute of Technology Private Limited". Files: `fire_noc.pdf` (born-digital, QR), `accreditation.pdf` (scanned, ~2° skew), `eoa_letter.pdf` (rows 180+120+60+60, Total says 480); **no affidavit**. Results: R-DOC-001 FAILED (MISSING, high); R-EXP-001 FAILED (EXPIRED, high; 2026-03-31 < 2026-10-12); R-CROSS-001 PASS (legal forms equal); R-NUM-001 FAILED (540>480, high); R-TBL-001 FAILED (420≠480, medium); R-ID-001/R-COMP-001 PASS. Verification: fire_noc QR (sim) → `EXPIRED`; others `NOT_SUPPORTED`→manual. Infra: `computer_lab_photos` → `ADDITIONAL_EVIDENCE_REQUIRED` (medium). Aggregate: high ×4 (R-DOC-001, R-EXP-001, R-NUM-001, verification EXPIRED), medium ×2 (R-TBL-001, infra), low ×2 (NOT_SUPPORTED) → `NEEDS_RECTIFICATION`, lane `NEEDS_SCRUTINY`, priority `100·4+30·2+5·2 = 470`. Perturbations: unreadable accreditation scan → R-CROSS-001 `NEEDS_REVIEW` + clearer-scan request; "…Society" → `NEEDS_REVIEW`; `31/03/26` → `NEEDS_REVIEW` not EXPIRED; one repaired summand → `NEEDS_REVIEW` (+`OCR_REPAIRED_VALUES_IN_SUM`); child OCR job dies → still aggregates, page `NOT_CHECKED`, alert; re-run same snapshot → identical results.
**Impact:** officers start from prepared evidence-linked list; institutions get early specific deficiency feedback; supervisors get ageing/backlog; auditors a reconstructable trail. KPIs: review time/share needing no manual look; detection recall by defect type + time to first deficiency notice; % findings with evidence/source + audit verifies; determinism across runs; time-to-triage; audit completeness/override reasons. Second-order: Handbook change = config change; consistency across offices; institution pre-check cuts deficiency cycles; standardised issuer-verification records. Negatives to manage: automation bias, unfair flags on poor scans from under-resourced institutions (low quality → request better scan, not a flag), privacy exposure, vendor lock-in.
**Feasibility:** proven — intake/hash/encrypt/RBAC/audit, text-layer + OCR with boxes, rules + cross-doc, duplicate/metadata (weak), signature validation (config-dependent); proven-with-controls — classification/extraction; research-grade — pixel tamper (keep optional); authorisation-gated — issuer verification, portal integration (design-level); approximate — vision infra. Economics: cost/application ≈ pages to OCR × price + tokens × price + hosting share; levers: skip OCR when text layer, cache by hash, rules before LLM, local OCR for non-sensitive; check vendor pricing before quoting. Legal: advisory only; rules need source ref + approval; DPDP check with counsel. Maintainability: rule ownership with AICTE domain experts; provider interfaces; monitor confidence, override/dismiss rate (rising = bad rule/drift), latency; requirements→rules→tests matrix. Scale: stateless API, horizontal workers, queue for deadline windows, caching, Postgres + object storage.
**Risk register:** API drift (pin + smoke) · ₹ misread (money-column-only repair, sum checks, repaired can't hard-fail) · watermark removal (detect_only) · preprocessing hurts an engine (level per engine, A/B) · missing model weights (`readyz` message, offline tarball) · large image (hosted demo + recording) · false anomaly flags (advisory, controls, report FP) · rules ≠ Handbook (`synthetic_demo`, reviewer fills `ref`) · AGPL · overclaiming integration (SIMULATED, "designed for") · key loss (separate backup, rewrap) · scope creep (phase gates, cut order) · identity data (HMAC, no Aadhaar, officer-only) · automation bias (evidence, no scores, mandatory reasons) · cloud/Wi-Fi demo failure (offline default, recorded video).
**Claim register:** APH 2024-27 launched Dec 2023, three years (PIB) OK · 2026-27 amendment (secondary — confirm on AICTE site) · portal windows (2024-25 cycle; confirm current) · Azure layout returns polygons/confidence/Markdown, F0 limits (recheck before presenting) · pyHanko needs trust roots OK · DigiLocker needs registration/approval OK · DPDP phased (check dates) · scale figures (5,099 institutions / ~7.5 lakh seats from a secondary source) **do not show until verified against the AICTE Annual Report** · any time/cost-saved number = assumption · clause references must come from the Handbook.
**Open items (humans):** 1 read Handbook; encode 5–8 real EoA-renewal rules with clauses + effective dates (check 2026-27 addendum); 2 decide `as_of` meaning per validity rule; 3 interview one officer/administrator for minutes/document and common deficiencies; 4 verify scale figures; 5 check Azure limits/pricing/data terms and hosted-model data-use terms; 6 DPDP commencement + applicability; 7 who builds the independent tampered set; 8 confirm SIH PPT template/limits; 9 record fallback demo video; 10 legal/policy for production (vault location, retention, cloud OCR on real data); 11 any live connector needs authorisation + real response test; 12 numeric norms (built-up/lab areas, cadre beyond 1:2:6, architect reg-no format) enter rules only as reviewer-confirmed params; 13 calibrate & log `MIN_VISIBLE`, cover ratios, per-engine OCR thresholds, pHash distance, ELA z, watermark LUT bounds, typing θ_min/δ.
**Change management:** freeze contracts (finding, verification enum, OCR page schema with normalised boxes, adapter interface, rule YAML keys, audit record shape/hash rule); swap points — OCR engine (`ocr/` provider), LLM (`LLM_MODEL`), category (new YAML+schemas), issuer (new adapter), anomaly indicator (new module), thresholds (config + re-run eval), SQLite/Postgres/queue, UI framework. Keep a decision log `date | decision | reason | affected sections/slides | owner`. If a USP changes, update slides 3–5 and 15 and the matrix together.

## 12. Sources (status)
Verified in guide session (23 Oct 2026): Docling `PdfPipelineOptions` fields; pyHanko `validate_pdf_signature` usage; TER = Technical Education Regulatory fee (AICTE FAQ 2024-25; exemptions vary by year/institution, encode none). Secondary/to-confirm: faculty norms 1:20 and 1:2:6 (APH Appendix 7 excerpts — confirm in official Handbook); MinIO maintenance status; Azure limits; Docker published-port behaviour; Postgres table-UNIQUE (columns only); PyMuPDF `get_texttrace`; OWASP SSRF/ASVS/LLM Top 10; BLAKE3 not FIPS-approved. Key URLs: APH `https://www.aicte.gov.in/sites/default/files/APH%20Final.pdf` · PIB `https://www.pib.gov.in/PressReleasePage.aspx?PRID=1983013` · AICTE FAQ `https://aicte.gov.in/sites/default/files/FAQ%20Updated.pdf` · Docling `https://ds4sd.github.io/docling/reference/pipeline_options` · pyHanko `https://pyhanko.readthedocs.io/` · Azure limits `https://learn.microsoft.com/en-us/azure/ai-services/document-intelligence/service-limits` · DigiLocker onboarding FAQ `https://www.digilocker.gov.in/assets/FAQ%20DL%20EL_onboarding.pdf` · OWASP ASVS/LLM Top 10 · RFC 5280, RFC 6962, NIST FIPS 180-4 · c2pa-python. Further reading: DocTamper, CASIA v2, FUNSD, RVL-CDIP. The Handbook PDF itself was never opened by the authors — **a teammate must read it.**
