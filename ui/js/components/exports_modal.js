/**
 * AICTE Decision Support Platform — Officer Exports & Generator Hub Component
 * Spec Reference: ROADMAP.md (Phase 8: Steps 42–46), Guide §11.8
 *
 * Implements:
 * - Step 42: Officer Exports Tab & Generator Hub
 * - Dedicated Exports Hub layout featuring 3 document generator cards:
 *   1. Formal Draft Deficiency Notice (for institution)
 *   2. Visiting Team Ground Inspection Brief (for inspection committee)
 *   3. Comprehensive Evaluation Summary Report (for administrative records)
 * - Each card displays document description, target recipient, and "Generate & Preview" button.
 */

const EXPORT_GENERATORS = [
  {
    id: 'deficiency-notice',
    cardId: 'export-card-deficiency-notice',
    title: 'Formal Draft Deficiency Notice',
    recipient: 'Institution / Applying Trust',
    recipientBadgeClass: 'badge-recipient-institution',
    description: 'Formally enumerates rectifiable deficiencies with two-sided evidence comparisons (submitted claims vs verified norms), required corrective actions, and statutory upload deadlines. Status marked as DRAFT.',
    formats: ['Official Letter', 'PDF Layout', 'Markdown Draft', 'JSON Envelope'],
    buttonId: 'btn-gen-deficiency-notice',
    icon: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>`,
    apiPath: '/applications/{id}/exports/deficiency-notice'
  },
  {
    id: 'inspection-brief',
    cardId: 'export-card-inspection-brief',
    title: 'Visiting Team Ground Inspection Brief',
    recipient: 'Visiting Expert Inspection Committee',
    recipientBadgeClass: 'badge-recipient-committee',
    description: 'Generates concise physical verification checklist for visiting committee members: facilities requiring ground check, missing infrastructure photos, unverified regulatory claims, registered campus GPS coordinates, and observation checkboxes.',
    formats: ['Inspection Dossier', 'Checklist Table', 'Geotag Matrix', 'Printable A4'],
    buttonId: 'btn-gen-inspection-brief',
    icon: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/><path d="M9 14l2 2 4-4"/></svg>`,
    apiPath: '/applications/{id}/exports/inspection-brief'
  },
  {
    id: 'summary-report',
    cardId: 'export-card-summary-report',
    title: 'Comprehensive Evaluation Summary Report',
    recipient: 'AICTE Regional Office / Administrative Records',
    recipientBadgeClass: 'badge-recipient-admin',
    description: 'Complete multi-stage audit summary compiling ingest hash digests, C4 checklist evaluations, C5 findings ledger, C6 issuing authority checks, S10 infrastructure verification, and cryptographic chain head hash for institutional archive.',
    formats: ['Evaluation Dossier', 'S13 Audit Chain', 'Archive JSON'],
    buttonId: 'btn-gen-summary-report',
    icon: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>`,
    apiPath: '/applications/{id}/report'
  }
];

/**
 * Internal Diagnostic & Anomaly Tags to Strictly Omit from Institutional Notices (Guide §11.8, Step 44)
 */
const INTERNAL_OMISSION_PATTERNS = [
  // Internal forensic detection signals (Guide §5, §11.8)
  'EDITING_TOOL',
  'METADATA',
  'INCREMENTAL_UPDATE',
  'FONT_CORRUPTION',
  'SIGNATURE_NOT_TRUSTED',
  'UNTRUSTED_ROOT',
  'C2_FORENSICS',
  'OCR_CONFIDENCE',
  'GEOTAG_METADATA_STRIPPED',
  // Cross-institution duplicate pHash identity signals (Guide §14, §11.8)
  'POSSIBLE_DUPLICATE_PHOTO',
  'POSSIBLE_DUPLICATE_EVIDENCE',
  'DUPLICATE_HASH',
  'PEER_MATCH',
  'HAMMING_DISTANCE',
  'PERCEPTUAL_HASH',
  'FORENSIC_SIGNAL'
];

class ExportsHubComponent {
  constructor() {
    this.currentAppId = null;
    this.currentData = null;
    this.currentInspectionBrief = null;
    this.activePreviewType = null;
    this.generators = EXPORT_GENERATORS;
    this.dismissedFindingIds = new Set();
    this.omissionPatterns = INTERNAL_OMISSION_PATTERNS;

    // Attach listeners for officer overrides
    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      window.addEventListener('app:action-modal-submitted', (e) => {
        if (e.detail && (e.detail.actionName === 'dismiss' || e.detail.actionName === 'resolve')) {
          this.dismissFinding(e.detail.findingId);
        }
      });
      window.addEventListener('app:finding-action-recorded', (e) => {
        if (e.detail && (e.detail.action === 'dismiss' || e.detail.action === 'resolve')) {
          this.dismissFinding(e.detail.findingId);
        }
      });
    }
  }

  /**
   * Filter Deficiencies for Institutional Notice (Step 44 Core Implementation)
   * Strictly excludes:
   * 1. Dismissed or resolved findings (Step 44 Verification Requirement)
   * 2. Internal forensic tags (e.g., EDITING_TOOL_IN_METADATA, INCREMENTAL_UPDATE)
   * 3. Cross-institution duplicate pHash identity tags (POSSIBLE_DUPLICATE_PHOTO)
   */
  filterDeficiencies(deficiencies = [], extraDismissedIds = null) {
    if (!deficiencies || !Array.isArray(deficiencies)) return [];

    const dismissedSet = new Set(this.dismissedFindingIds);
    if (extraDismissedIds && Array.isArray(extraDismissedIds)) {
      for (const id of extraDismissedIds) dismissedSet.add(id);
    }

    return deficiencies.filter(item => {
      if (!item) return false;

      // 1. Omit dismissed or resolved findings
      const fId = item.finding_id || item.rule_id;
      if (fId && dismissedSet.has(fId)) {
        return false;
      }
      const st = String(item.status || item.lifecycle || '').toLowerCase();
      if (st === 'dismissed' || st === 'resolved') {
        return false;
      }

      // 2. Omit internal forensic flags, duplicate identity hashes, and mock source internals
      const ruleUpper = String(item.rule_id || '').toUpperCase();
      const catUpper = String(item.category || '').toUpperCase();
      const flagsUpper = (item.flags && Array.isArray(item.flags))
        ? item.flags.map(f => String(f).toUpperCase()).join(' ')
        : '';
      const reasonUpper = String(item.reason || item.observed || '').toUpperCase();

      for (const pattern of INTERNAL_OMISSION_PATTERNS) {
        if (
          ruleUpper.includes(pattern) ||
          catUpper.includes(pattern) ||
          flagsUpper.includes(pattern) ||
          reasonUpper.includes(pattern)
        ) {
          return false;
        }
      }

      return true;
    });
  }

  /**
   * Dismiss a Finding and Apply Filter to Active Notice (Step 44)
   */
  dismissFinding(findingId) {
    if (!findingId) return;
    this.dismissedFindingIds.add(findingId);

    // Filter current data if loaded
    if (this.currentData && this.currentData.deficiencies) {
      this.currentData.deficiencies = this.filterDeficiencies(this.currentData.deficiencies);
      this.currentData.deficiencies_count = this.currentData.deficiencies.length;
    }

    // Refresh modal DOM if preview is open
    if (this.activePreviewType === 'deficiency-notice' && typeof document !== 'undefined') {
      const bodyEl = document.getElementById('export-modal-body');
      if (bodyEl && this.currentData) {
        bodyEl.innerHTML = this.renderDeficiencyNoticeLetter(this.currentData);
      }
    }

    // Dispatch omission applied event
    if (typeof window !== 'undefined' && typeof CustomEvent !== 'undefined' && typeof window.dispatchEvent === 'function') {
      window.dispatchEvent(new CustomEvent('app:deficiency-omission-applied', {
        detail: {
          applicationId: this.currentAppId,
          dismissedFindingId: findingId,
          remainingDeficienciesCount: this.currentData ? this.currentData.deficiencies_count : 0
        }
      }));
    }
  }

  /**
   * Render Non-Negotiable Simulation Advisory Banner (AGENTS.md Compliance)
   */
  renderAdvisoryBanner() {
    return `
      <div class="exports-advisory-banner" role="status">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
          <path d="M12 8v4"></path>
          <path d="M12 16h.01"></path>
        </svg>
        <div>
          <div style="display: flex; align-items: center; gap: var(--space-2); margin-bottom: 2px;">
            <strong style="color: var(--text-main);">AICTE Decision Support Export Hub (S12, Guide §11.8)</strong>
            <span class="badge-simulated-tag">ADVISORY DRAFTS ONLY</span>
          </div>
          <p style="margin: 0; color: var(--text-muted);">
            All generated notices and inspection briefs are preliminary decision-support drafts prepared for officer review. The prototype does not dispatch automated institutional notices or make autonomous approval determinations.
          </p>
        </div>
      </div>
    `;
  }

  /**
   * Render Individual Document Generator Card (Step 42 Core Requirement)
   * Verification Requirement: Each card displays document description, target recipient, and "Generate & Preview" button.
   */
  renderGeneratorCard(gen, appId) {
    return `
      <article class="export-generator-card"
               id="${gen.cardId}"
               data-export-type="${gen.id}"
               role="region"
               aria-labelledby="title-${gen.id}">
        <!-- 1. Header with Icon, Title & Recipient Badge -->
        <div class="export-card-header">
          <div class="export-card-title-group">
            <div class="export-card-icon" aria-hidden="true">
              ${gen.icon}
            </div>
            <div>
              <h4 class="export-card-title" id="title-${gen.id}">${gen.title}</h4>
            </div>
          </div>
          <span class="export-recipient-badge ${gen.recipientBadgeClass}" id="recipient-${gen.id}">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
              <circle cx="12" cy="7" r="4"></circle>
            </svg>
            Recipient: ${gen.recipient}
          </span>
        </div>

        <!-- 2. Document Description (Step 42 Requirement) -->
        <p class="export-card-desc" id="desc-${gen.id}">
          ${gen.description}
        </p>

        <!-- 3. Available Formats Tags -->
        <div class="export-features-list" aria-label="Available Export Formats">
          ${gen.formats.map(fmt => `<span class="export-format-badge">${fmt}</span>`).join('')}
        </div>

        <!-- 4. Footer with Action Button (Step 42 Requirement) -->
        <div class="export-card-footer">
          <span class="text-muted font-mono text-xs" style="font-size: 10px;">
            Target App: ${appId || 'DEMO-APP'}
          </span>
          <button class="btn-generate-preview font-mono"
                  id="${gen.buttonId}"
                  data-export-type="${gen.id}"
                  onclick="window.exportsHubComponent && window.exportsHubComponent.openPreview('${gen.id}')">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
              <circle cx="12" cy="12" r="3"></circle>
            </svg>
            Generate & Preview
          </button>
        </div>
      </article>
    `;
  }

  /**
   * Render Complete Officer Exports Tab Layout (Step 42)
   */
  render(applicationId = null) {
    const appId = applicationId || this.currentAppId || 'DEMO-ISSUES-001';
    this.currentAppId = appId;

    return `
      <div class="exports-hub-panel" id="exports-hub-panel">
        <!-- 1. Advisory Simulation Banner -->
        ${this.renderAdvisoryBanner()}

        <!-- 2. Hub Header Overview -->
        <div class="exports-hub-header">
          <div>
            <h3 class="exports-hub-title" id="exports-hub-title">Official Document Exports & Generator Hub</h3>
            <p class="exports-hub-desc">
              Generate standardized AICTE regulatory drafts, inspection dossiers, and executive audit summaries with two-sided factual evidence.
            </p>
          </div>
          <div style="display: flex; align-items: center; gap: 6px;">
            <span class="badge badge-outline font-mono text-xs">S12_EXPORTS</span>
            <span class="badge badge-simulated-tag font-mono text-xs">OFFLINE DRAFTS</span>
          </div>
        </div>

        <!-- 3. Three Document Generator Cards (Step 42 Core Deliverable) -->
        <div class="exports-cards-grid" id="exports-cards-grid" role="group" aria-label="Official Document Generators">
          ${this.generators.map(gen => this.renderGeneratorCard(gen, appId)).join('')}
        </div>

        <!-- 4. Modal Container for Preview & Print Dialogs (Steps 43–46) -->
        <div id="export-preview-modal-host"></div>
      </div>
    `;
  }

  /**
   * Load and Render into DOM Container (Step 42)
   */
  loadAndRender(applicationId, containerId = 'workspace-exports-content') {
    const appId = applicationId || this.currentAppId || 'DEMO-ISSUES-001';
    this.currentAppId = appId;

    if (typeof document !== 'undefined') {
      const container = document.getElementById(containerId);
      if (container) {
        container.innerHTML = this.render(appId);
      }
    }

    // Dispatch completion event
    if (typeof window !== 'undefined' && typeof CustomEvent !== 'undefined' && typeof window.dispatchEvent === 'function') {
      window.dispatchEvent(new CustomEvent('app:exports-hub-rendered', {
        detail: {
          applicationId: appId,
          generatorCount: this.generators.length,
          generators: this.generators.map(g => g.id)
        }
      }));
    }

    return this.render(appId);
  }

  /**
   * Resolve default synthetic deficiency notice for demo applications (Step 43)
   */
  getDefaultDeficiencyNotice(applicationId) {
    const appId = applicationId || this.currentAppId || 'DEMO-ISSUES-001';
    const isClean = appId === 'DEMO-CLEAN-001';
    const now = new Date();
    const deadlineDate = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const deadlineStr = deadlineDate.toISOString().split('T')[0];

    const instName = (appId === 'DEMO-ISSUES-001')
      ? 'Apex Institute of Engineering & Technology'
      : (appId === 'DEMO-CLEAN-001' ? 'National Institute of Technical Studies' : 'Technical Campus Institute');

    if (isClean) {
      return {
        notice_id: `DEF-NOT-${appId}-CLEAN`,
        application_id: appId,
        institution_name: instName,
        document_type: 'DEFICIENCY_NOTICE_DRAFT',
        status: 'DRAFT',
        actor: 'officer',
        deficiencies_count: 0,
        upload_deadline: deadlineDate.toISOString(),
        deadline_formatted: `${deadlineStr} (7 calendar days)`,
        deficiencies: [],
        advisory_banner: 'Draft deficiency notice for officer verification. Not a regulatory rejection or sanction.',
        simulated: true,
        decision_support_only: true,
        created_at: now.toISOString()
      };
    }

    const rawDeficiencies = [
      {
        finding_id: 'FIND-ISSUE-001',
        rule_id: 'FIRE_SAFETY_VALIDITY',
        category: 'EXPIRED_CERTIFICATE',
        observed: 'Certificate expired on 2026-01-15 (observed in Fire Safety Certificate doc_fire_01)',
        expected: 'Valid unexpired Fire Safety NOC through current academic tenure',
        action_required: 'Please upload a valid, unexpired Fire Safety Certificate / NOC issued by competent Fire Authority.',
        handbook_reference: 'AICTE Handbook 2026-27 Chapter II Clause 4.3 (Mandatory Safety Clearances)',
        status: 'OPEN'
      },
      {
        finding_id: 'FIND-ISSUE-002',
        rule_id: 'LAND_AREA_NORMS',
        category: 'INSUFFICIENT_AREA',
        observed: 'Claimed campus land area: 1.85 Acres',
        expected: 'Minimum 2.50 Acres for Urban/Rural Technical Campus',
        action_required: 'Please provide registered land deed or competent authority conversion certificate evidencing minimum required acreage.',
        handbook_reference: 'AICTE Handbook 2026-27 Appendix 4 Clause 4.1 (Land Norms)',
        status: 'OPEN'
      }
    ];

    const filtered = this.filterDeficiencies(rawDeficiencies);

    return {
      notice_id: `DEF-NOT-${appId}-7A3B21`,
      application_id: appId,
      institution_name: instName,
      document_type: 'DEFICIENCY_NOTICE_DRAFT',
      status: 'DRAFT',
      actor: 'officer',
      deficiencies_count: filtered.length,
      upload_deadline: deadlineDate.toISOString(),
      deadline_formatted: `${deadlineStr} (7 calendar days)`,
      deficiencies: filtered,
      advisory_banner: 'Draft deficiency notice for officer verification. Not a regulatory rejection or sanction.',
      simulated: true,
      decision_support_only: true,
      created_at: now.toISOString()
    };
  }

  /**
   * Fetch Deficiency Notice: GET /applications/{id}/exports/deficiency-notice (Step 43)
   */
  async fetchDeficiencyNotice(applicationId) {
    const appId = applicationId || this.currentAppId || 'DEMO-ISSUES-001';
    let data = null;

    try {
      if (typeof window !== 'undefined' && window.apiClient && typeof window.apiClient.getDeficiencyNotice === 'function') {
        data = await window.apiClient.getDeficiencyNotice(appId);
      } else if (typeof window !== 'undefined' && typeof window.location !== 'undefined' && typeof fetch === 'function') {
        const res = await fetch(`/applications/${encodeURIComponent(appId)}/exports/deficiency-notice`);
        if (res.ok) {
          data = await res.json();
        }
      }
    } catch (e) {
      console.warn('[ExportsHub] API fetch failed, falling back to deterministic template:', e);
    }

    if (!data || !data.deficiencies) {
      data = this.getDefaultDeficiencyNotice(appId);
    }

    this.currentData = data;
    return data;
  }

  /**
   * Resolve default synthetic inspection brief for visiting committee (Step 45)
   */
  getDefaultInspectionBrief(applicationId) {
    const appId = applicationId || this.currentAppId || 'DEMO-ISSUES-001';
    const isClean = appId === 'DEMO-CLEAN-001';
    const now = new Date();

    const instName = (appId === 'DEMO-ISSUES-001')
      ? 'Apex Institute of Engineering & Technology'
      : (appId === 'DEMO-CLEAN-001' ? 'National Institute of Technical Studies' : 'Technical Campus Institute');

    // Default registered campus coordinates (Knowledge Park III Greater Noida: 28.4728, 77.4891)
    const campusCoords = {
      latitude: 28.4728,
      longitude: 77.4891,
      address: 'Plot 4, Knowledge Park III, Greater Noida, Uttar Pradesh 201310'
    };

    const facilities = isClean ? [] : [
      {
        item_key: 'classrooms',
        facility: 'Classrooms & Smart Teaching Areas',
        reason: 'No photos provided for Classrooms (0 uploaded, minimum 1 required)',
        evidence_status: 'ADDITIONAL_EVIDENCE_REQUIRED',
        inspection_focus: 'Physically verify classroom count (minimum 12 rooms), carpet area, natural ventilation, acoustic treatment, and multimedia projectors.'
      },
      {
        item_key: 'computer_center',
        facility: 'Central Computer Center & Server Room',
        reason: 'Photo GPS location is 5.2 km from registered campus coordinates',
        evidence_status: 'LOCATION_METADATA_INCONSISTENT',
        inspection_focus: 'Physically verify terminal count (minimum 150 PCs), active LAN drops, high-speed leased line router, licensed legal software, and uninterrupted power supply (UPS).'
      }
    ];

    const pendingVerifs = isClean ? [] : [
      {
        document_id: 'doc_fire_01',
        adapter: 'mock_fire_service',
        status: 'MANUAL_REVIEW_REQUIRED',
        reason: 'Fire Safety Certificate registry unavailable for automated verification',
        inspection_focus: 'Inspect original physical Fire Safety Certificate / NOC issued by Chief Fire Officer on campus with official watermarks and validity seal.'
      }
    ];

    return {
      brief_id: `INSP-BRF-${appId}-6C4D21`,
      application_id: appId,
      institution_name: instName,
      document_type: 'PHYSICAL_INSPECTION_BRIEF',
      status: 'READY_FOR_INSPECTION_TEAM',
      actor: 'officer',
      campus_coordinates: campusCoords,
      facilities_to_inspect_count: facilities.length,
      facilities_to_inspect: facilities,
      pending_verifications_count: pendingVerifs.length,
      pending_verifications: pendingVerifs,
      advisory_banner: 'Preliminary indicators requiring physical human verification. Not conclusive evidence.',
      simulated: true,
      decision_support_only: true,
      created_at: now.toISOString()
    };
  }

  /**
   * Fetch Ground Inspection Brief: GET /applications/{id}/exports/inspection-brief (Step 45)
   */
  async fetchInspectionBrief(applicationId) {
    const appId = applicationId || this.currentAppId || 'DEMO-ISSUES-001';
    let data = null;

    try {
      if (typeof window !== 'undefined' && window.apiClient && typeof window.apiClient.getInspectionBrief === 'function') {
        data = await window.apiClient.getInspectionBrief(appId);
      } else if (typeof window !== 'undefined' && typeof window.location !== 'undefined' && typeof fetch === 'function') {
        const res = await fetch(`/applications/${encodeURIComponent(appId)}/exports/inspection-brief`);
        if (res.ok) {
          data = await res.json();
        }
      }
    } catch (e) {
      console.warn('[ExportsHub] Inspection brief API fetch failed, falling back to deterministic template:', e);
    }

    if (!data || !data.facilities_to_inspect) {
      data = this.getDefaultInspectionBrief(appId);
    }

    this.currentInspectionBrief = data;
    return data;
  }

  /**
   * Render Clean Formal Draft Deficiency Notice Letterhead (Step 43 Verification Requirement)
   * Verification Requirement: Clicking generate loads clean deficiency notice letter ready for officer dispatch.
   */
  renderDeficiencyNoticeLetter(notice) {
    if (!notice) return '';
    const appId = notice.application_id || this.currentAppId || 'DEMO-APP';
    const instName = notice.institution_name || 'Apex Institute of Engineering & Technology';
    const noticeId = notice.notice_id || `DEF-NOT-${appId}-DRAFT`;
    const rawDeficiencies = notice.deficiencies || [];
    const deficiencies = this.filterDeficiencies(rawDeficiencies);
    const count = deficiencies.length;
    const deadline = notice.deadline_formatted || 'Within 7 calendar days of notice receipt';

    const dateStr = notice.created_at
      ? new Date(notice.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
      : new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

    return `
      <div class="notice-letter" id="deficiency-notice-letter">
        <!-- 1. Official AICTE Letterhead Header -->
        <header class="notice-letterhead">
          <div class="notice-letterhead-brand">
            <div class="notice-emblem" aria-hidden="true">AICTE</div>
            <div class="notice-authority-titles">
              <h2>All India Council for Technical Education</h2>
              <p>(A Statutory Body of the Government of India) · Regional Approvals Bureau</p>
              <p style="color: var(--text-muted); font-size: 10px;">Nelson Mandela Marg, Vasant Kunj, New Delhi-110070</p>
            </div>
          </div>
          <div style="text-align: right;">
            <span class="badge-draft-notice" id="badge-notice-status">DRAFT — FOR OFFICER REVIEW</span>
            <div style="font-size: 10px; font-family: var(--font-mono); color: var(--text-muted); margin-top: 4px;">
              Document: DEFICIENCY_NOTICE_DRAFT
            </div>
          </div>
        </header>

        <!-- 2. Reference & Date Line -->
        <div class="notice-meta-grid">
          <div>
            <strong>Ref:</strong> <code class="font-mono" id="notice-ref-no">AICTE/RO-NR/DEF/${noticeId}</code>
          </div>
          <div>
            <strong>Date:</strong> <span id="notice-date">${dateStr}</span>
          </div>
        </div>

        <!-- 3. Addressed Institution Block -->
        <div class="notice-recipient-block" id="notice-recipient-block">
          <div>To,</div>
          <div><strong>The Chairman / Principal / Authorized Secretary,</strong></div>
          <div id="notice-inst-name" style="font-size: 13px; font-weight: 700; color: var(--color-accent);">${instName}</div>
          <div>Application Reference ID: <code class="font-mono font-bold" id="notice-app-id">${appId}</code></div>
          <div>Approval Category: <strong>Extension of Approval (EOA_RENEWAL) · AY 2026–2027</strong></div>
        </div>

        <!-- 4. Formal Subject Line -->
        <div class="notice-subject" id="notice-subject">
          <strong>SUBJECT:</strong> Opportunity for Rectification of Identified Discrepancies — Scrutiny of Application ${appId} for Grant of Extension of Approval (EOA).
        </div>

        <!-- 5. Formal Salutation & Regulatory Body Paragraph -->
        <div class="notice-intro">
          <p style="margin-bottom: 8px;"><strong>Sir / Madam,</strong></p>
          <p style="margin-bottom: 8px;">
            This is with reference to your online application bearing reference number <code>${appId}</code> submitted for Extension of Approval (EOA) for the Academic Year 2026–2027.
          </p>
          <p style="margin-bottom: 8px;">
            During the preliminary evaluation conducted pursuant to the provisions of the <strong>AICTE Approval Process Handbook (APH)</strong>, the scrutinizing committee has noted the following discrepancies/deficiencies in the documents uploaded by your institution:
          </p>
        </div>

        <!-- 6. Two-Sided Deficiency Evidence Table (Step 43 Core Deliverable) -->
        <div class="notice-table-container">
          <table class="notice-table" id="deficiency-table" aria-label="Rectifiable Deficiencies Table">
            <thead>
              <tr>
                <th style="width: 50px;">#</th>
                <th style="width: 220px;">Discrepancy Category & Regulation</th>
                <th style="width: 220px;">Submitted Claim / Observed Value</th>
                <th style="width: 220px;">Prescribed Regulatory Norm</th>
                <th>Required Rectification Action</th>
                <th style="width: 130px;">Upload Cutoff</th>
              </tr>
            </thead>
            <tbody>
              ${deficiencies.length > 0 ? deficiencies.map((item, idx) => `
                <tr id="row-def-${item.finding_id}">
                  <td class="font-mono text-center">${idx + 1}</td>
                  <td>
                    <strong style="color: var(--text-main);">${item.category || 'DEFICIENCY'}</strong>
                    <div style="font-size: 10px; color: var(--text-muted); margin-top: 3px;">
                      Rule: <code>${item.rule_id}</code><br>
                      ${item.handbook_reference}
                    </div>
                  </td>
                  <td class="notice-observed-val" id="val-observed-${item.finding_id}">
                    <span style="display: block; font-size: 10px; color: var(--text-muted); text-transform: uppercase;">Observed in Submission:</span>
                    ${item.observed}
                  </td>
                  <td class="notice-expected-val" id="val-expected-${item.finding_id}">
                    <span style="display: block; font-size: 10px; color: var(--text-muted); text-transform: uppercase;">Handbook Mandatory Norm:</span>
                    ${item.expected}
                  </td>
                  <td id="val-action-${item.finding_id}">
                    ${item.action_required}
                  </td>
                  <td class="font-mono text-danger font-bold" id="val-deadline-${item.finding_id}" style="font-size: 10px;">
                    ${deadline}
                  </td>
                </tr>
              `).join('') : `
                <tr>
                  <td colspan="6" style="text-align: center; padding: var(--space-4); color: var(--text-muted);">
                    ✓ No open rectifiable discrepancies identified. All evaluated regulatory requirements are verified complete.
                  </td>
                </tr>
              `}
            </tbody>
          </table>
        </div>

        <!-- 7. Statutory Upload Deadline Callout Box -->
        <div class="notice-deadline-box" id="notice-deadline-box">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"></circle>
            <polyline points="12 6 12 12 16 14"></polyline>
          </svg>
          <div>
            <strong>Mandatory Rectification Deadline:</strong> You are requested to rectify the deficiencies stated above and upload the authenticated supporting documents through the AICTE Web Portal strictly within <strong>${deadline}</strong>. Failure to submit required rectifications within the statutory period may lead to recommendation for physical inspection or appropriate administrative action under Chapter II of the Approval Process Handbook.
          </div>
        </div>

        <!-- 8. Non-Punitive Advisory Disclaimer -->
        <div class="exports-advisory-banner" style="margin-top: 16px;">
          <div>
            <strong>Officer Advisory Note:</strong> This communication is an official preliminary draft generated for verification by the designated Scrutiny Officer. It affords statutory opportunity to be heard (Audi Alteram Partem) and does not constitute a punitive order or final sanction.
          </div>
        </div>

        <!-- 9. Formal Officer Dispatch Sign-off -->
        <footer class="notice-signoff">
          <div class="notice-signoff-box">
            <span>Yours faithfully,</span>
            <strong style="margin-top: 24px;">For All India Council for Technical Education</strong>
            <span>Scrutiny Officer / Regional Approval Committee</span>
            <span>Northern Regional Office, Kanpur / New Delhi</span>
            <div class="notice-stamp" id="notice-stamp">
              ✓ DRAFT APPROVED FOR OFFICER DISPATCH
            </div>
          </div>
        </footer>
      </div>
    `;
  }

  /**
   * Toggle Inspection Checkbox and Dispatch Event (Step 45)
   */
  toggleBriefCheckbox(checkboxId) {
    if (typeof document !== 'undefined') {
      const chk = document.getElementById(checkboxId);
      if (chk) {
        const isChecked = chk.checked;
        if (typeof window !== 'undefined' && typeof CustomEvent !== 'undefined' && typeof window.dispatchEvent === 'function') {
          window.dispatchEvent(new CustomEvent('app:inspection-checkbox-toggled', {
            detail: {
              checkboxId: checkboxId,
              checked: isChecked,
              itemKey: chk.getAttribute('data-item-key'),
              docId: chk.getAttribute('data-doc-id')
            }
          }));
        }
      }
    }
  }

  /**
   * Render Visiting Committee Physical Inspection Brief Dossier (Step 45 Core Deliverable)
   * Verification Requirement: Ground inspection brief contains facilities checklist with inspection checkboxes and campus GPS coordinates.
   */
  renderInspectionBrief(brief) {
    if (!brief) return '';
    const appId = brief.application_id || this.currentAppId || 'DEMO-APP';
    const instName = brief.institution_name || 'Apex Institute of Engineering & Technology';
    const briefId = brief.brief_id || `INSP-BRF-${appId}-6C4D`;
    const facilities = brief.facilities_to_inspect || [];
    const pendingVerifs = brief.pending_verifications || [];
    const coords = brief.campus_coordinates || { latitude: 28.4728, longitude: 77.4891 };
    const latFormatted = (coords && typeof coords.latitude === 'number') ? `${coords.latitude.toFixed(4)}° N` : '28.4728° N';
    const lonFormatted = (coords && typeof coords.longitude === 'number') ? `${coords.longitude.toFixed(4)}° E` : '77.4891° E';
    const coordsDisplay = `${latFormatted}, ${lonFormatted}`;
    const addressStr = (coords && coords.address) ? coords.address : 'AICTE Registered Institutional Campus Perimeter';

    const dateStr = brief.created_at
      ? new Date(brief.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
      : new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

    return `
      <div class="brief-dossier" id="inspection-brief-dossier">
        <!-- 1. Committee Header & Letterhead -->
        <header class="brief-header" id="brief-letterhead">
          <div class="brief-header-brand">
            <div class="brief-emblem" aria-hidden="true">EVC</div>
            <div class="brief-authority-titles">
              <h2>Expert Visiting Committee (EVC) — Physical Inspection Brief</h2>
              <p>All India Council for Technical Education · Bureau of Approvals & Scrutiny</p>
              <p style="color: var(--text-muted); font-size: 10px;">Mandated under Section 10 of AICTE Act, 1987 & Approval Process Handbook 2026–2027</p>
            </div>
          </div>
          <div style="text-align: right;">
            <span class="badge-brief-status" id="badge-brief-status">${brief.status || 'READY_FOR_INSPECTION_TEAM'}</span>
            <div style="font-size: 10px; font-family: var(--font-mono); color: var(--text-muted); margin-top: 4px;">
              Document: PHYSICAL_INSPECTION_BRIEF
            </div>
          </div>
        </header>

        <!-- 2. Reference & Date Line -->
        <div class="brief-meta-grid">
          <div>
            <strong>Brief ID:</strong> <code class="font-mono" id="brief-ref-no">${briefId}</code>
          </div>
          <div>
            <strong>Date Generated:</strong> <span id="brief-date">${dateStr}</span>
          </div>
        </div>

        <!-- 3. Target Institution Block -->
        <div class="brief-inst-block" id="brief-inst-block">
          <div>Inspection Subject: <strong style="font-size: 13px; color: var(--color-accent);" id="brief-inst-name">${instName}</strong></div>
          <div>Application Reference: <code class="font-mono font-bold" id="brief-app-id">${appId}</code> · Workflow Category: <strong>Extension of Approval (EOA_RENEWAL)</strong></div>
          <div>Designated Committee: <strong>AICTE Regional Expert Visiting Panel (Northern Region)</strong></div>
        </div>

        <!-- 4. Non-Punitive Advisory Banner (Guide §11.8) -->
        <div class="exports-advisory-banner" id="brief-advisory-banner" role="status">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
            <path d="M12 8v4"></path>
            <path d="M12 16h.01"></path>
          </svg>
          <div>
            <strong style="color: var(--text-main);">Notice to Visiting Inspection Committee Members:</strong>
            <p style="margin: 2px 0 0 0; color: var(--text-muted);">
              ${brief.advisory_banner || 'Preliminary indicators requiring physical human verification. Not conclusive evidence.'}
              This brief targets high-priority physical verification areas flagged during automated document and geotag analysis.
            </p>
          </div>
        </div>

        <!-- 5. Registered Campus GPS Coordinates Box (Step 45 Verification Requirement) -->
        <div class="brief-gps-box" id="brief-gps-box">
          <div class="brief-gps-info">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color: #38bdf8; flex-shrink: 0;">
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
              <circle cx="12" cy="10" r="3"></circle>
            </svg>
            <div>
              <div style="display: flex; align-items: center; gap: 8px;">
                <strong style="font-size: 12px; color: var(--text-main);">AICTE Registered Campus Coordinates (S10 Geotag Anchor):</strong>
                <span class="badge-gps-anchor" id="badge-gps-anchor">GEO_VERIFIED_ANCHOR</span>
              </div>
              <div class="brief-campus-coords" id="brief-campus-coords">
                ${coordsDisplay}
              </div>
              <div style="font-size: 11px; color: var(--text-muted); margin-top: 2px;">
                ${addressStr} · Permissible ground tolerance radius: <strong>2.0 km</strong>
              </div>
            </div>
          </div>
          <div style="text-align: right;">
            <span class="font-mono text-xs" style="color: var(--text-muted); font-size: 10px;">
              Verify GPS reading on mobile device upon arrival
            </span>
          </div>
        </div>

        <!-- 6. Facilities Physical Verification Checklist (Step 45 Verification Requirement) -->
        <section class="brief-section" id="inspection-facilities-section">
          <h4 class="brief-section-title" id="title-facilities-checklist">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
              <polyline points="9 11 12 14 22 4"></polyline>
            </svg>
            Facilities Checklist for Ground Verification (${facilities.length} items flagged)
          </h4>
          <p style="font-size: 11px; color: var(--text-muted); margin: 0 0 8px 0;">
            Check the box upon physical inspection on campus, note actual measurements, and verify missing or inconsistent evidence claims.
          </p>

          <div class="brief-table-container">
            <table class="brief-table" id="inspection-facilities-table" aria-label="Facilities Verification Checklist Table">
              <thead>
                <tr>
                  <th style="width: 48px; text-align: center;">Verify</th>
                  <th style="width: 200px;">Facility & Subsystem</th>
                  <th style="width: 130px;">Evidence Status</th>
                  <th style="width: 220px;">Reason Flagged by System</th>
                  <th>Visiting Team Inspection Focus & Required Checks</th>
                  <th style="width: 180px;">Committee Observation / Notes</th>
                </tr>
              </thead>
              <tbody>
                ${facilities.length > 0 ? facilities.map((item, idx) => {
                  const statusClass = item.evidence_status === 'ADDITIONAL_EVIDENCE_REQUIRED'
                    ? 'badge-status-additional'
                    : (item.evidence_status === 'LOCATION_METADATA_INCONSISTENT' ? 'badge-status-inconsistent' : 'badge-status-suggested');
                  return `
                    <tr id="row-facility-${item.item_key}">
                      <td style="text-align: center; vertical-align: middle;">
                        <input type="checkbox"
                               class="brief-checkbox"
                               id="chk-facility-${item.item_key}"
                               data-item-key="${item.item_key}"
                               aria-label="Verify ${item.facility}"
                               onclick="window.exportsHubComponent && window.exportsHubComponent.toggleBriefCheckbox('chk-facility-${item.item_key}')" />
                      </td>
                      <td>
                        <strong style="color: var(--text-main);" id="facility-name-${item.item_key}">${item.facility}</strong>
                        <div style="font-size: 10px; font-family: var(--font-mono); color: var(--text-muted); margin-top: 2px;">
                          Key: <code>${item.item_key}</code>
                        </div>
                      </td>
                      <td>
                        <span class="${statusClass}" id="status-badge-${item.item_key}">
                          ${item.evidence_status}
                        </span>
                      </td>
                      <td style="color: var(--text-body); font-size: 11px;" id="reason-${item.item_key}">
                        ${item.reason}
                      </td>
                      <td style="color: var(--text-main); font-size: 11px;" id="focus-${item.item_key}">
                        <div style="display: flex; align-items: flex-start; gap: 4px;">
                          <span style="color: #a78bfa; font-weight: bold;">▸</span>
                          <span>${item.inspection_focus}</span>
                        </div>
                      </td>
                      <td>
                        <input type="text"
                               class="brief-obs-input"
                               id="obs-${item.item_key}"
                               placeholder="Ground remarks..."
                               aria-label="Notes for ${item.facility}" />
                      </td>
                    </tr>
                  `;
                }).join('') : `
                  <tr>
                    <td colspan="6" style="text-align: center; padding: var(--space-4); color: var(--text-muted);">
                      ✓ All infrastructure evidence verified complete. No facilities flagged for mandatory physical inspection.
                    </td>
                  </tr>
                `}
              </tbody>
            </table>
          </div>
        </section>

        <!-- 7. Pending Document Verifications Needing Physical Certificate Check -->
        <section class="brief-section" id="inspection-verifications-section">
          <h4 class="brief-section-title" id="title-verifications-checklist">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
              <polyline points="14 2 14 8 20 8"></polyline>
              <line x1="16" y1="13" x2="8" y2="13"></line>
              <line x1="16" y1="17" x2="8" y2="17"></line>
            </svg>
            Pending Statutory Documents Requiring On-Site Physical Verification (${pendingVerifs.length} items)
          </h4>
          <p style="font-size: 11px; color: var(--text-muted); margin: 0 0 8px 0;">
            Verify original hardcopy certificates with official embossing stamps, government seals, and watermarks in institution custody.
          </p>

          <div class="brief-table-container">
            <table class="brief-table" id="inspection-verifications-table" aria-label="Statutory Certificates Physical Verification Table">
              <thead>
                <tr>
                  <th style="width: 48px; text-align: center;">Verify</th>
                  <th style="width: 150px;">Document ID</th>
                  <th style="width: 150px;">Issuing Authority / Adapter</th>
                  <th style="width: 140px;">System Status</th>
                  <th style="width: 220px;">Scrutiny Reason</th>
                  <th>On-Site Hardcopy Verification Instruction</th>
                </tr>
              </thead>
              <tbody>
                ${pendingVerifs.length > 0 ? pendingVerifs.map((v, idx) => `
                  <tr id="row-verif-${v.document_id}">
                    <td style="text-align: center; vertical-align: middle;">
                      <input type="checkbox"
                             class="brief-checkbox"
                             id="chk-verif-${v.document_id}"
                             data-doc-id="${v.document_id}"
                             aria-label="Verify ${v.document_id}"
                             onclick="window.exportsHubComponent && window.exportsHubComponent.toggleBriefCheckbox('chk-verif-${v.document_id}')" />
                    </td>
                    <td>
                      <code class="font-mono font-bold" id="verif-doc-${v.document_id}">${v.document_id}</code>
                    </td>
                    <td id="verif-adapter-${v.document_id}">
                      <span class="badge badge-outline font-mono text-xs">${v.adapter}</span>
                    </td>
                    <td>
                      <span class="badge-status-additional" id="verif-status-${v.document_id}">${v.status}</span>
                    </td>
                    <td style="font-size: 11px; color: var(--text-body);" id="verif-reason-${v.document_id}">
                      ${v.reason}
                    </td>
                    <td style="font-size: 11px; color: var(--text-main);" id="verif-focus-${v.document_id}">
                      <div style="display: flex; align-items: flex-start; gap: 4px;">
                        <span style="color: #38bdf8; font-weight: bold;">▸</span>
                        <span>${v.inspection_focus}</span>
                      </div>
                    </td>
                  </tr>
                `).join('') : `
                  <tr>
                    <td colspan="6" style="text-align: center; padding: var(--space-4); color: var(--text-muted);">
                      ✓ No pending statutory document verifications requiring on-site hardcopy inspection.
                    </td>
                  </tr>
                `}
              </tbody>
            </table>
          </div>
        </section>

        <!-- 8. Visiting Committee Attestation & Sign-off Block -->
        <footer class="brief-committee-signatures" id="brief-committee-signatures">
          <div style="font-size: 12px; font-weight: 700; color: var(--text-main); margin-bottom: 8px;">
            Expert Visiting Committee Attestation & Recommendation:
          </div>
          <div style="font-size: 11px; color: var(--text-muted); line-height: 1.5; margin-bottom: 14px;">
            We, the undersigned members of the AICTE Expert Visiting Committee, have physically visited the campus at registered coordinates <code>${coordsDisplay}</code>, inspected the facilities listed above, and verified original records presented by the institution.
          </div>

          <div style="margin: 12px 0; display: flex; flex-direction: column; gap: 6px; font-size: 11px;">
            <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
              <input type="checkbox" class="brief-checkbox" id="chk-outcome-compliant" />
              <span><strong>Recommendation A:</strong> Physical verification confirms compliance with prescribed minimum infrastructure and safety norms.</span>
            </label>
            <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
              <input type="checkbox" class="brief-checkbox" id="chk-outcome-discrepancies" />
              <span><strong>Recommendation B:</strong> Deficiencies observed on ground. Detailed annexure with photographs attached for Scrutiny Committee review.</span>
            </label>
          </div>

          <div class="brief-signatures-grid">
            <div class="brief-signature-cell">
              <div class="brief-sign-line"></div>
              <strong>Dr. / Prof. ______________________</strong>
              <span class="text-muted">Convener / Senior Technical Expert</span>
              <span class="font-mono text-muted text-xs">AICTE Expert ID: EVC-CONV-261</span>
            </div>
            <div class="brief-signature-cell">
              <div class="brief-sign-line"></div>
              <strong>Dr. / Prof. ______________________</strong>
              <span class="text-muted">Member / Domain Subject Expert</span>
              <span class="font-mono text-muted text-xs">AICTE Expert ID: EVC-SUBJ-108</span>
            </div>
            <div class="brief-signature-cell">
              <div class="brief-sign-line"></div>
              <strong>Er. / Ar. ______________________</strong>
              <span class="text-muted">Member / Architect or Regional Officer</span>
              <span class="font-mono text-muted text-xs">AICTE Expert ID: EVC-RO-NR-44</span>
            </div>
          </div>

          <div style="margin-top: 20px; display: flex; justify-content: space-between; align-items: center; font-size: 10px; font-family: var(--font-mono); color: var(--text-muted);">
            <div>Ground Inspection Date: ____________________</div>
            <div class="notice-stamp" id="brief-stamp">✓ EVC GROUND BRIEFING VERIFIED</div>
          </div>
        </footer>
      </div>
    `;
  }

  /**
   * Open Document Preview Dialog (Step 43 & 45 Core Implementation)
   */
  openPreview(exportType, applicationId = null) {
    const gen = this.generators.find(g => g.id === exportType);
    if (!gen) return;

    if (applicationId) {
      this.currentAppId = applicationId;
    }
    this.activePreviewType = exportType;
    const appId = this.currentAppId || applicationId || 'DEMO-ISSUES-001';

    // Dispatch custom event for preview open
    if (typeof window !== 'undefined' && typeof CustomEvent !== 'undefined' && typeof window.dispatchEvent === 'function') {
      window.dispatchEvent(new CustomEvent('app:export-preview-opened', {
        detail: {
          applicationId: appId,
          exportType: exportType,
          title: gen.title,
          recipient: gen.recipient
        }
      }));
    }

    let previewContentHtml = '';
    const statusText = (exportType === 'inspection-brief')
      ? 'STATUS: READY_FOR_INSPECTION_TEAM'
      : (exportType === 'deficiency-notice' ? 'STATUS: DRAFT' : 'STATUS: DRAFT');

    if (exportType === 'deficiency-notice') {
      const notice = (this.currentData && this.currentData.application_id === appId && this.currentData.document_type === 'DEFICIENCY_NOTICE_DRAFT')
        ? this.currentData
        : this.getDefaultDeficiencyNotice(appId);
      this.currentData = notice;
      previewContentHtml = this.renderDeficiencyNoticeLetter(notice);

      // Dispatch specific deficiency notice generated event
      if (typeof window !== 'undefined' && typeof CustomEvent !== 'undefined' && typeof window.dispatchEvent === 'function') {
        window.dispatchEvent(new CustomEvent('app:deficiency-notice-generated', {
          detail: {
            applicationId: appId,
            noticeId: notice.notice_id,
            deficienciesCount: notice.deficiencies_count,
            status: notice.status
          }
        }));
      }

      // Asynchronously fetch fresh data from API if in browser with fetch
      if (typeof window !== 'undefined' && typeof fetch === 'function') {
        this.fetchDeficiencyNotice(appId).then(freshNotice => {
          if (freshNotice && this.activePreviewType === 'deficiency-notice') {
            const bodyEl = document.getElementById('export-modal-body');
            if (bodyEl) bodyEl.innerHTML = this.renderDeficiencyNoticeLetter(freshNotice);
          }
        }).catch(() => {});
      }
    } else if (exportType === 'inspection-brief') {
      const brief = (this.currentInspectionBrief && this.currentInspectionBrief.application_id === appId)
        ? this.currentInspectionBrief
        : this.getDefaultInspectionBrief(appId);
      this.currentInspectionBrief = brief;
      this.currentData = brief;
      previewContentHtml = this.renderInspectionBrief(brief);

      // Dispatch specific inspection brief generated event (Step 45)
      if (typeof window !== 'undefined' && typeof CustomEvent !== 'undefined' && typeof window.dispatchEvent === 'function') {
        window.dispatchEvent(new CustomEvent('app:inspection-brief-generated', {
          detail: {
            applicationId: appId,
            briefId: brief.brief_id,
            facilitiesCount: brief.facilities_to_inspect_count || (brief.facilities_to_inspect ? brief.facilities_to_inspect.length : 0),
            pendingVerificationsCount: brief.pending_verifications_count || (brief.pending_verifications ? brief.pending_verifications.length : 0),
            status: brief.status
          }
        }));
      }

      // Asynchronously fetch fresh data from API if in browser with fetch
      if (typeof window !== 'undefined' && typeof fetch === 'function') {
        this.fetchInspectionBrief(appId).then(freshBrief => {
          if (freshBrief && this.activePreviewType === 'inspection-brief') {
            const bodyEl = document.getElementById('export-modal-body');
            if (bodyEl) bodyEl.innerHTML = this.renderInspectionBrief(freshBrief);
          }
        }).catch(() => {});
      }
    } else {
      // Placeholder for summary-report
      previewContentHtml = `
        <div style="background: var(--bg-surface-elevated, #0f172a); padding: var(--space-4); border-radius: var(--radius-sm); border: 1px solid var(--border-default);">
          <div class="exports-advisory-banner" style="margin-bottom: var(--space-3);">
            <div><strong>Preliminary Draft:</strong> ${gen.title} for ${appId}. Status: <code>DRAFT</code>.</div>
          </div>
          <h4 style="margin: 0 0 8px 0; font-size: 14px;">${gen.title}</h4>
          <p class="text-muted text-xs" style="margin: 0 0 12px 0;">${gen.description}</p>
          <div class="font-mono text-xs text-accent">Target Application: ${appId} · Target Recipient: ${gen.recipient}</div>
        </div>
      `;
    }

    if (typeof document !== 'undefined') {
      let host = document.getElementById('export-preview-modal-host');
      if (!host) {
        host = document.createElement('div');
        host.id = 'export-preview-modal-host';
        document.body.appendChild(host);
      }

      host.innerHTML = `
        <div class="export-modal-backdrop" id="export-preview-modal" role="dialog" aria-modal="true" aria-labelledby="modal-preview-title">
          <div class="export-modal-content">
            <!-- Modal Header -->
            <div class="export-modal-header">
              <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                <span class="badge ${gen.recipientBadgeClass} font-mono text-xs">RECIPIENT: ${gen.recipient}</span>
                <h3 id="modal-preview-title" style="margin: 0; font-size: 15px; font-weight: 700;">${gen.title}</h3>
                <span class="badge badge-draft-notice font-mono text-xs">${statusText}</span>
              </div>
              <button class="btn btn-outline btn-sm font-mono" id="btn-close-export-modal" onclick="window.exportsHubComponent && window.exportsHubComponent.closeModal()" aria-label="Close Preview">✕</button>
            </div>

            <!-- Modal Body (Letterhead Content) -->
            <div class="export-modal-body" id="export-modal-body">
              ${previewContentHtml}
            </div>

            <!-- Modal Footer Actions Toolbar (Step 46 Export Formats & Print) -->
            <div class="export-modal-footer">
              <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                <button class="btn btn-outline btn-sm font-mono text-xs" id="btn-copy-notice" onclick="window.exportsHubComponent && window.exportsHubComponent.copyNoticeText()">
                  📋 Copy Formatted Text
                </button>
                <button class="btn btn-outline btn-sm font-mono text-xs" id="btn-download-notice" onclick="window.exportsHubComponent && window.exportsHubComponent.downloadNoticeJson()">
                  💾 Download JSON Envelope
                </button>
                <button class="btn btn-outline btn-sm font-mono text-xs" id="btn-print-notice" onclick="window.exportsHubComponent ? window.exportsHubComponent.printDocument() : window.print()">
                  🖨 Print Official Document
                </button>
              </div>
              <button class="btn btn-primary btn-sm font-mono text-xs" id="btn-close-footer" onclick="window.exportsHubComponent && window.exportsHubComponent.closeModal()">
                Close Preview
              </button>
            </div>
          </div>
        </div>
      `;

      // Backdrop click listener
      const modalEl = document.getElementById('export-preview-modal');
      if (modalEl) {
        modalEl.addEventListener('click', (e) => {
          if (e.target === modalEl) this.closeModal();
        });
      }
    }

    return previewContentHtml;
  }

  /**
   * Generate Clean Standard Markdown Draft (Step 46)
   */
  generateMarkdownExport(type = null, data = null) {
    const exportType = type || this.activePreviewType || 'deficiency-notice';
    let d = data;
    if (!d) {
      if (exportType === 'inspection-brief') {
        d = (this.currentData && this.currentData.document_type === 'PHYSICAL_INSPECTION_BRIEF')
          ? this.currentData
          : (this.currentInspectionBrief || this.getDefaultInspectionBrief(this.currentAppId));
      } else if (exportType === 'deficiency-notice') {
        d = (this.currentData && this.currentData.document_type === 'DEFICIENCY_NOTICE_DRAFT')
          ? this.currentData
          : this.getDefaultDeficiencyNotice(this.currentAppId);
      } else {
        d = this.currentData || this.getDefaultDeficiencyNotice(this.currentAppId);
      }
    }

    const appId = (d && d.application_id) || this.currentAppId || 'DEMO-APP';
    const instName = (d && d.institution_name) || 'Apex Institute of Engineering & Technology';
    const nowIso = (d && d.created_at) || new Date().toISOString();
    const dateStr = new Date(nowIso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

    if (exportType === 'deficiency-notice') {
      const noticeId = (d && d.notice_id) || `DEF-NOT-${appId}`;
      const deficiencies = this.filterDeficiencies ? this.filterDeficiencies(d.deficiencies || []) : (d.deficiencies || []);
      const deadline = (d && d.deadline_formatted) || 'Within 7 calendar days';

      let md = `# ALL INDIA COUNCIL FOR TECHNICAL EDUCATION\n`;
      md += `*(A Statutory Body of the Government of India) · Regional Approvals Bureau*\n\n`;
      md += `> **STATUS: DRAFT — FOR OFFICER REVIEW**  \n`;
      md += `> Document Type: \`DEFICIENCY_NOTICE_DRAFT\` · Decision Support Draft Only\n\n`;
      md += `**Ref:** \`AICTE/RO-NR/DEF/${noticeId}\`  \n`;
      md += `**Date:** ${dateStr}  \n\n`;
      md += `**To:**  \n`;
      md += `The Chairman / Principal / Authorized Secretary  \n`;
      md += `**${instName}**  \n`;
      md += `Application Reference ID: \`${appId}\`  \n`;
      md += `Approval Category: **Extension of Approval (EOA_RENEWAL) · AY 2026–2027**  \n\n`;
      md += `---\n\n`;
      md += `### SUBJECT: Opportunity for Rectification of Identified Discrepancies — Scrutiny of Application ${appId}\n\n`;
      md += `**Sir / Madam,**\n\n`;
      md += `This is with reference to your online application bearing reference number \`${appId}\` submitted for Extension of Approval (EOA) for the Academic Year 2026–2027. During preliminary evaluation conducted pursuant to the provisions of the AICTE Approval Process Handbook (APH), the scrutinizing committee has noted the following discrepancies/deficiencies:\n\n`;

      if (deficiencies.length > 0) {
        md += `| # | Discrepancy Category & Rule | Submitted / Observed Value | Prescribed Mandatory Norm | Required Rectification Action | Upload Cutoff |\n`;
        md += `|---|---|---|---|---|---|\n`;
        deficiencies.forEach((item, idx) => {
          const cat = item.category || 'DEFICIENCY';
          const rule = item.rule_id || '';
          const obs = (item.observed || '').replace(/\|/g, '\\|');
          const exp = (item.expected || '').replace(/\|/g, '\\|');
          const act = (item.action_required || '').replace(/\|/g, '\\|');
          md += `| ${idx + 1} | **${cat}**<br>\`${rule}\` | ${obs} | ${exp} | ${act} | ${deadline} |\n`;
        });
        md += `\n`;
      } else {
        md += `> ✓ **No open rectifiable discrepancies identified.** All evaluated regulatory requirements are verified complete.\n\n`;
      }

      md += `> **Mandatory Rectification Deadline:** You are requested to rectify the deficiencies stated above and upload authenticated supporting documents through the AICTE Web Portal strictly within **${deadline}**.\n\n`;
      md += `> **Officer Advisory Note:** This communication is an official preliminary draft generated for verification by the designated Scrutiny Officer (Audi Alteram Partem). It does not constitute a punitive order or final sanction.\n\n`;
      md += `**Yours faithfully,**  \n`;
      md += `**For All India Council for Technical Education**  \n`;
      md += `Scrutiny Officer / Regional Approval Committee  \n`;
      md += `Northern Regional Office, Kanpur / New Delhi  \n`;
      md += `\`[✓ DRAFT APPROVED FOR OFFICER DISPATCH]\`\n`;
      return md;
    }

    if (exportType === 'inspection-brief') {
      const briefId = (d && d.brief_id) || `INSP-BRF-${appId}`;
      const coords = (d && d.campus_coordinates) || { latitude: 28.4728, longitude: 77.4891 };
      const latFmt = (coords && typeof coords.latitude === 'number') ? `${coords.latitude.toFixed(4)}° N` : '28.4728° N';
      const lonFmt = (coords && typeof coords.longitude === 'number') ? `${coords.longitude.toFixed(4)}° E` : '77.4891° E';
      const facilities = (d && d.facilities_to_inspect) || [];
      const verifs = (d && d.pending_verifications) || [];

      let md = `# EXPERT VISITING COMMITTEE (EVC) — PHYSICAL INSPECTION BRIEF\n`;
      md += `*All India Council for Technical Education · Bureau of Approvals & Scrutiny*\n\n`;
      md += `> **STATUS: READY_FOR_INSPECTION_TEAM**  \n`;
      md += `> Mandated under Section 10 of AICTE Act, 1987 & Approval Process Handbook 2026–2027\n\n`;
      md += `**Brief ID:** \`${briefId}\`  \n`;
      md += `**Date Generated:** ${dateStr}  \n`;
      md += `**Inspection Subject:** **${instName}**  \n`;
      md += `**Application Reference:** \`${appId}\` · Category: **Extension of Approval (EOA_RENEWAL)**  \n\n`;
      md += `> **Notice to Visiting Inspection Committee Members:**  \n`;
      md += `> ${(d && d.advisory_banner) || 'Preliminary indicators requiring physical human verification. Not conclusive evidence.'}\n\n`;
      md += `### AICTE Registered Campus Geotag Coordinates\n`;
      md += `- **Registered GPS Coordinates:** \`${latFmt}, ${lonFmt}\` (\`GEO_VERIFIED_ANCHOR\`)\n`;
      md += `- **Perimeter Address:** ${coords.address || 'Knowledge Park III, Greater Noida, UP'}\n`;
      md += `- **Permissible Ground Tolerance Radius:** 2.0 km\n\n`;

      md += `### Facilities Checklist for Ground Verification (${facilities.length} items flagged)\n\n`;
      if (facilities.length > 0) {
        md += `| Verify | Facility & Key | Evidence Status | Reason Flagged | Visiting Team Inspection Focus |\n`;
        md += `|---|---|---|---|---|\n`;
        facilities.forEach((f) => {
          const facName = f.facility || '';
          const key = f.item_key || '';
          const st = f.evidence_status || '';
          const rsn = (f.reason || '').replace(/\|/g, '\\|');
          const foc = (f.inspection_focus || '').replace(/\|/g, '\\|');
          md += `| [ ] | **${facName}** (\`${key}\`) | \`${st}\` | ${rsn} | ${foc} |\n`;
        });
        md += `\n`;
      } else {
        md += `> ✓ All infrastructure evidence verified complete. No facilities flagged for mandatory physical inspection.\n\n`;
      }

      md += `### Pending Statutory Documents Requiring On-Site Physical Verification (${verifs.length} items)\n\n`;
      if (verifs.length > 0) {
        md += `| Verify | Document ID | Issuing Authority | Status | On-Site Physical Check Instruction |\n`;
        md += `|---|---|---|---|---|\n`;
        verifs.forEach((v) => {
          const docId = v.document_id || '';
          const adapter = v.adapter || '';
          const st = v.status || '';
          const foc = (v.inspection_focus || '').replace(/\|/g, '\\|');
          md += `| [ ] | \`${docId}\` | \`${adapter}\` | \`${st}\` | ${foc} |\n`;
        });
        md += `\n`;
      } else {
        md += `> ✓ No pending statutory document verifications requiring on-site hardcopy inspection.\n\n`;
      }

      md += `### Expert Visiting Committee Attestation & Recommendation\n`;
      md += `- [ ] **Recommendation A:** Physical verification confirms compliance with prescribed minimum infrastructure and safety norms.\n`;
      md += `- [ ] **Recommendation B:** Deficiencies observed on ground. Detailed annexure with photographs attached for Scrutiny Committee review.\n\n`;
      md += `**Committee Signatures:**  \n`;
      md += `1. Convener / Senior Technical Expert (AICTE ID: EVC-CONV-261)  \n`;
      md += `2. Member / Domain Subject Expert (AICTE ID: EVC-SUBJ-108)  \n`;
      md += `3. Member / Architect or Regional Officer (AICTE ID: EVC-RO-NR-44)  \n`;
      md += `\`[✓ EVC GROUND BRIEFING VERIFIED]\`\n`;
      return md;
    }

    return `# AICTE Document Export\n\nTarget Application: \`${appId}\`\nGenerated: ${dateStr}\n`;
  }

  /**
   * Generate Standard JSON Envelope (Step 46)
   */
  generateJsonEnvelope(type = null, data = null) {
    const exportType = type || this.activePreviewType || 'deficiency-notice';
    let d = data;
    if (!d) {
      if (exportType === 'inspection-brief') {
        d = (this.currentData && this.currentData.document_type === 'PHYSICAL_INSPECTION_BRIEF')
          ? this.currentData
          : (this.currentInspectionBrief || this.getDefaultInspectionBrief(this.currentAppId));
      } else if (exportType === 'deficiency-notice') {
        d = (this.currentData && this.currentData.document_type === 'DEFICIENCY_NOTICE_DRAFT')
          ? this.currentData
          : this.getDefaultDeficiencyNotice(this.currentAppId);
      } else {
        d = this.currentData || this.getDefaultDeficiencyNotice(this.currentAppId);
      }
    }

    const appId = (d && d.application_id) || this.currentAppId || 'DEMO-APP';
    const docId = (d && (d.brief_id || d.notice_id || d.report_id)) || `EXP-${appId}`;
    const docType = exportType === 'inspection-brief'
      ? 'PHYSICAL_INSPECTION_BRIEF'
      : (exportType === 'deficiency-notice' ? 'DEFICIENCY_NOTICE_DRAFT' : 'APPLICATION_EVALUATION_REPORT');

    return {
      $schema: 'https://aicte.gov.in/schemas/v4/envelope.schema.json',
      envelope_version: '1.0.0',
      export_type: exportType,
      document_type: docType,
      document_id: docId,
      application_id: appId,
      generated_at: new Date().toISOString(),
      actor: (d && d.actor) || 'officer',
      environment: 'OFFLINE_SOVEREIGN',
      simulated: true,
      decision_support_only: true,
      export_format: 'JSON_ENVELOPE',
      payload: d
    };
  }

  /**
   * Copy Formatted Document Content to Clipboard as Markdown (Step 46)
   */
  copyNoticeText() {
    const markdownText = this.generateMarkdownExport(this.activePreviewType, this.currentData);
    if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      navigator.clipboard.writeText(markdownText);
    }
    if (typeof window !== 'undefined' && typeof CustomEvent !== 'undefined' && typeof window.dispatchEvent === 'function') {
      window.dispatchEvent(new CustomEvent('app:export-copied', {
        detail: {
          exportType: this.activePreviewType,
          applicationId: this.currentAppId,
          format: 'markdown',
          charCount: markdownText.length
        }
      }));
    }
    return markdownText;
  }

  // Semantic alias
  copyFormattedMarkdown() {
    return this.copyNoticeText();
  }

  /**
   * Download Document as JSON Envelope (Step 46)
   */
  downloadNoticeJson() {
    const envelope = this.generateJsonEnvelope(this.activePreviewType, this.currentData);
    const filename = `${envelope.document_id || 'aicte_export'}_envelope.json`;

    if (typeof document !== 'undefined') {
      const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(envelope, null, 2));
      const downloadAnchor = document.createElement('a');
      downloadAnchor.setAttribute('href', dataStr);
      downloadAnchor.setAttribute('download', filename);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
    }

    if (typeof window !== 'undefined' && typeof CustomEvent !== 'undefined' && typeof window.dispatchEvent === 'function') {
      window.dispatchEvent(new CustomEvent('app:export-downloaded', {
        detail: {
          exportType: this.activePreviewType,
          applicationId: this.currentAppId,
          filename: filename,
          format: 'json-envelope'
        }
      }));
    }

    return envelope;
  }

  // Semantic alias
  downloadJsonEnvelope() {
    return this.downloadNoticeJson();
  }

  /**
   * Trigger Print Official Document (Step 46 Verification Requirement)
   */
  printDocument() {
    const exportType = this.activePreviewType || 'deficiency-notice';
    if (typeof window !== 'undefined' && typeof CustomEvent !== 'undefined' && typeof window.dispatchEvent === 'function') {
      window.dispatchEvent(new CustomEvent('app:export-print-triggered', {
        detail: {
          exportType: exportType,
          applicationId: this.currentAppId,
          targetFormat: 'A4'
        }
      }));
    }
    if (typeof window !== 'undefined' && typeof window.print === 'function') {
      window.print();
    }
  }

  /**
   * Close Any Open Export Preview Modal
   */
  closeModal() {
    this.activePreviewType = null;
    if (typeof document !== 'undefined') {
      const host = document.getElementById('export-preview-modal-host');
      if (host) {
        host.innerHTML = '';
      }
      const modal = document.getElementById('export-preview-modal');
      if (modal && modal.parentNode) {
        modal.parentNode.removeChild(modal);
      }
    }
  }
}

// Singleton instantiation
const exportsHubComponent = new ExportsHubComponent();

if (typeof window !== 'undefined') {
  window.exportsHubComponent = exportsHubComponent;
  window.exportsModalComponent = exportsHubComponent; // Dual alias
  window.ExportsHubComponent = ExportsHubComponent;
  window.ExportsModalComponent = ExportsHubComponent;
  window.EXPORT_GENERATORS = EXPORT_GENERATORS;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    ExportsHubComponent,
    ExportsModalComponent: ExportsHubComponent,
    exportsHubComponent,
    exportsModalComponent: exportsHubComponent,
    EXPORT_GENERATORS
  };
}
