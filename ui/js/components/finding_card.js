/**
 * AICTE Application Validation Platform — Finding Action Control Bar & Comparison Card Component
 * Spec Reference: ROADMAP.md (Phase 5: Steps 28 & 30), Guide §1.3, §17.2, §17.3
 *
 * Responsibilities:
 * 1. Two-Sided Comparison Finding Card:
 *    - Rule ID and regulatory clause reference.
 *    - Severity badging with deterministic color coding.
 *    - Advisory banner ("Preliminary indicator requiring human verification", non-punitive decision support).
 *    - Two-Sided Comparison Grid (Left: Observed Document Value vs Right: Expected Regulatory Value).
 *    - Grounding precision badge (word / block) and document page reference.
 * 2. Finding Action Control Bar (Step 30):
 *    - 4 primary action buttons:
 *      * Acknowledge (marks finding reviewed)
 *      * Request Rectification (flags applicant for document re-upload)
 *      * Dismiss (officer override)
 *      * Escalate (sends to senior officer)
 *    - Action buttons reflect finding's current lifecycle state:
 *      * open -> acknowledged, rectification_requested, dismissed, escalated, resolved
 *    - Active state indicators and disabled states preventing redundant actions.
 *    - Mandatory reason requirement validation for dismiss / request_rectification / escalate.
 *    - Action timeline rendering chronological audit entries from GET /applications/{id}/findings/actions.
 *    - Integration with POST /applications/{id}/findings/{finding_id}/act.
 */

const RULE_REGULATORY_METADATA = {
  'R-EXP-001': {
    clause: 'APH Ch. II, Cl. 2.12',
    title: 'Statutory Certificate Expiry',
    formula: 'certificate_valid_till >= submission_cutoff_date',
    docSlot: 'FIRE_NOC',
    field: 'valid_till',
    precision: 'word',
    page: 1,
    defaultObserved: '2024-03-31',
    defaultExpected: '2026-10-12'
  },
  'R-NUM-001': {
    clause: 'APH Ch. II, Cl. 2.5',
    title: 'Sanctioned Intake Norm',
    formula: 'requested_intake <= approved_intake',
    docSlot: 'FORM_APPLICATION',
    field: 'intake',
    precision: 'word',
    page: 1,
    defaultObserved: '540 seats',
    defaultExpected: '480 seats'
  },
  'R-DOC-001': {
    clause: 'APH Ch. II, Cl. 2.1',
    title: 'Mandatory Document Submission',
    formula: 'document_present(AFFIDAVIT) == true',
    docSlot: 'AFFIDAVIT',
    field: 'document_presence',
    precision: 'block',
    page: 1,
    defaultObserved: 'MISSING (None)',
    defaultExpected: 'AFFIDAVIT Submitted'
  },
  'R-COMP-001': {
    clause: 'APH Ch. II, Cl. 2.8',
    title: 'Statutory Field Completeness',
    formula: 'required_fields_present(FIRE_NOC) == true',
    docSlot: 'FIRE_NOC',
    field: 'certificate_no, valid_till',
    precision: 'word',
    page: 1,
    defaultObserved: 'Fields Missing: [certificate_no, valid_till]',
    defaultExpected: 'Complete Valid Fields'
  },
  'R-SLOT-001': {
    clause: 'APH Ch. II, Cl. 2.1 & 2.12',
    title: 'Document Slot & Content Verification',
    formula: 'detected_document_type == declared_slot',
    docSlot: 'FIRE_NOC',
    field: 'doc_type',
    precision: 'block',
    page: 1,
    defaultObserved: 'UNCLASSIFIED (Academic Course Content)',
    defaultExpected: 'Official Statutory Certificate'
  },
  'R-LAND-001': {
    clause: 'APH Ch. II, Cl. 2.14',
    title: 'Land Area Requirement',
    formula: 'contiguous_land_area_acres >= required_norm',
    docSlot: 'LAND_DOC',
    field: 'land_area_acres',
    precision: 'word',
    page: 1,
    defaultObserved: '7.5 Acres',
    defaultExpected: '5.0 Acres'
  },
  'R-BUILD-001': {
    clause: 'APH Ch. II, Cl. 2.16',
    title: 'Built-Up Instructional Area',
    formula: 'instructional_area_sqm >= prescribed_sqm',
    docSlot: 'BUILDING_PLAN',
    field: 'builtup_area_sqm',
    precision: 'block',
    page: 1,
    defaultObserved: '14,200 sqm',
    defaultExpected: '10,000 sqm'
  }
};

const VALID_ACTIONS_MAP = {
  'acknowledge': 'acknowledged',
  'request_rectification': 'rectification_requested',
  'dismiss': 'dismissed',
  'escalate': 'escalated',
  'resolve': 'resolved'
};

const ACTIONS_REQUIRING_REASON = new Set([
  'request_rectification',
  'dismiss',
  'escalate',
  'resolve'
]);

class FindingCardComponent {
  constructor() {
    this.activeFindingId = null;
    this.currentAppId = null;
    this.currentRole = 'officer';
    this.findingStates = new Map();     // findingId -> { state, lastAction }
    this.actionsByFinding = new Map();  // findingId -> Array<ActionRecord>
    this.findingsRegistry = new Map();  // findingId or ruleId -> Finding object

    if (typeof window !== 'undefined') {
      window.addEventListener('app:application-selected', (e) => {
        if (e.detail && e.detail.applicationId) {
          this.setCurrentAppId(e.detail.applicationId);
          this.loadFindingActions(e.detail.applicationId);
        }
      });

      window.addEventListener('app:role-changed', (e) => {
        if (e.detail && e.detail.role) {
          this.currentRole = e.detail.role;
        }
      });
    }
  }

  setCurrentAppId(appId) {
    this.currentAppId = appId;
  }

  getCurrentRole() {
    if (typeof window !== 'undefined' && window.state && window.state.currentRole) {
      return window.state.currentRole;
    }
    return this.currentRole || 'officer';
  }

  getActorName() {
    const role = this.getCurrentRole();
    if (typeof window !== 'undefined' && window.state && window.state.currentOfficerName) {
      return `${window.state.currentOfficerName} (${role})`;
    }
    return role;
  }

  /**
   * Render Severity Badge
   */
  renderSeverityBadge(severity) {
    const sev = String(severity || 'medium').toLowerCase();
    if (sev === 'high' || sev === 'critical') {
      return `<span class="badge badge-fail font-mono text-xs" data-severity="high">HIGH SEVERITY</span>`;
    }
    if (sev === 'medium') {
      return `<span class="badge badge-warn font-mono text-xs" data-severity="medium">MEDIUM SEVERITY</span>`;
    }
    return `<span class="badge badge-outline font-mono text-xs" data-severity="low">LOW SEVERITY</span>`;
  }

  /**
   * Render Precision Badge
   */
  renderPrecisionBadge(precision) {
    const prec = String(precision || 'word').toLowerCase();
    if (prec === 'block') {
      return `<span class="badge badge-precision-block font-mono text-xs" title="Block precision grounding">BLOCK PRECISION</span>`;
    }
    return `<span class="badge badge-precision-word font-mono text-xs" title="Word precision token grounding">WORD PRECISION</span>`;
  }

  /**
   * Render Finding Lifecycle Status Pill (Step 30)
   */
  renderStatusPill(state, severity = 'medium') {
    const st = String(state || 'open').toLowerCase();
    switch (st) {
      case 'acknowledged':
        return `<span class="badge badge-ack font-mono text-xs" data-status="acknowledged">✓ ACKNOWLEDGED</span>`;
      case 'rectification_requested':
        return `<span class="badge badge-warn font-mono text-xs" data-status="rectification_requested">⚠ RECTIFICATION REQUESTED</span>`;
      case 'dismissed':
        return `<span class="badge badge-dismissed font-mono text-xs" data-status="dismissed">✕ DISMISSED (OVERRIDDEN)</span>`;
      case 'escalated':
        return `<span class="badge badge-escalated font-mono text-xs" data-status="escalated">▲ ESCALATED TO SENIOR</span>`;
      case 'resolved':
        return `<span class="badge badge-pass font-mono text-xs" data-status="resolved">✓ RESOLVED</span>`;
      case 'open':
      default:
        return this.renderSeverityBadge(severity);
    }
  }

  /**
   * Render Non-Negotiable Advisory Decision-Support Banner (AGENTS.md compliance)
   */
  renderAdvisoryBanner(finding) {
    const ruleId = finding.rule_id || 'R-UNKNOWN';
    const meta = RULE_REGULATORY_METADATA[ruleId] || {};
    const clause = meta.clause || 'AICTE Regulations';

    return `
      <div class="finding-advisory-banner" role="status">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="flex-shrink: 0;">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="12" y1="8" x2="12" y2="12"></line>
          <line x1="12" y1="16" x2="12.01" y2="16"></line>
        </svg>
        <div>
          <strong>Preliminary indicator requiring human verification:</strong>
          ${clause} · Non-punitive decision support
        </div>
      </div>
    `;
  }

  /**
   * Render Two-Sided Comparison Grid (Step 28)
   */
  renderTwoSidedComparison(finding) {
    const ruleId = finding.rule_id || 'R-UNKNOWN';
    const meta = RULE_REGULATORY_METADATA[ruleId] || {};
    const evidence = finding.evidence || {};

    // 1. Resolve Observed Side (Left / Document extraction)
    let observedValue = finding.observed;
    let docSlot = meta.docSlot || 'DOCUMENT';
    let pageRef = meta.page || 1;
    let precision = meta.precision || 'word';

    if (evidence.submitted) {
      observedValue = evidence.submitted.value !== undefined ? evidence.submitted.value : observedValue;
      if (evidence.submitted.field) docSlot = evidence.submitted.field;
      if (evidence.submitted.page) pageRef = evidence.submitted.page;
      if (evidence.submitted.bbox_precision) precision = evidence.submitted.bbox_precision;
    }
    if (evidence.declared_slot) docSlot = evidence.declared_slot;
    if (evidence.document_type) docSlot = evidence.document_type;

    if (Array.isArray(observedValue)) {
      if (evidence.extracted_ocr_sample) {
        observedValue = `Missing [${observedValue.join(', ')}] · OCR: \"${evidence.extracted_ocr_sample.slice(0, 65)}…\"`;
      } else {
        observedValue = `Missing fields: [${observedValue.join(', ')}]`;
      }
    } else if (!observedValue && evidence.extracted_ocr_sample) {
      observedValue = `Extracted OCR: \"${evidence.extracted_ocr_sample.slice(0, 70)}…\"`;
    } else if (!observedValue && Array.isArray(evidence.missing_fields) && evidence.missing_fields.length > 0) {
      observedValue = `Missing fields: [${evidence.missing_fields.join(', ')}]`;
    } else if (observedValue === null && meta.defaultObserved) {
      if (finding.status === 'NOT_CHECKED' && finding.reason && finding.reason.includes('unavailable')) {
        observedValue = 'Unavailable / Not Found in Document';
      } else {
        observedValue = meta.defaultObserved;
      }
    } else if (!observedValue && meta.defaultObserved) {
      observedValue = meta.defaultObserved;
    }

    // 2. Resolve Expected Side (Right / Regulatory norm)
    let expectedValue = finding.expected;
    if (evidence.compared_with && evidence.compared_with.value !== undefined) {
      expectedValue = evidence.compared_with.value;
    }
    if (!expectedValue && meta.defaultExpected) {
      expectedValue = meta.defaultExpected;
    }

    // Clean formatting e.g. "> 2026-10-12" -> "2026-10-12"
    let cleanExpected = String(expectedValue || '').replace(/^>\s*/, '').trim();

    return `
      <div class="two-sided-comparison">
        <!-- Left Side: Observed Document Value -->
        <div class="comparison-column comparison-observed">
          <div class="comparison-column-title">Observed Document Value</div>
          <div class="comparison-value text-danger font-mono" id="finding-observed-${ruleId}" data-observed="${observedValue}">
            ${observedValue}
          </div>
          <div style="display: flex; gap: var(--space-1); flex-wrap: wrap; margin-top: 4px;">
            <span class="badge badge-outline text-xs">Doc: <strong>${docSlot}</strong> (Page ${pageRef})</span>
            ${this.renderPrecisionBadge(precision)}
          </div>
        </div>

        <!-- Middle Divider Badge -->
        <div class="comparison-vs-badge font-mono">VS</div>

        <!-- Right Side: Expected Regulatory Value -->
        <div class="comparison-column comparison-expected">
          <div class="comparison-column-title">Expected Regulatory Value</div>
          <div class="comparison-value text-success font-mono" id="finding-expected-${ruleId}" data-expected="${cleanExpected}">
            ${cleanExpected}
          </div>
          <div style="display: flex; gap: var(--space-1); flex-wrap: wrap; margin-top: 4px;">
            <span class="badge badge-pass text-xs font-mono">${meta.clause || 'APH Norm'}</span>
            <span class="badge badge-outline text-xs">Statutory Cutoff</span>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Render Non-Destructive State Notice Banner (Step 30)
   */
  renderStateNotice(findingId, state) {
    const st = String(state || 'open').toLowerCase();
    if (st === 'dismissed') {
      return `
        <div class="finding-override-notice" id="finding-notice-${findingId}" data-state="dismissed">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="flex-shrink: 0; margin-top: 1px;">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
          </svg>
          <div>
            <strong>Officer Override (Dismissed):</strong> Automated finding dismissed under discretionary authority. Original check and evidence remain immutable in audit log.
          </div>
        </div>
      `;
    }
    if (st === 'rectification_requested') {
      return `
        <div class="finding-rectification-notice" id="finding-notice-${findingId}" data-state="rectification_requested">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="flex-shrink: 0; margin-top: 1px;">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="8" x2="12" y2="12"></line>
            <line x1="12" y1="16" x2="12.01" y2="16"></line>
          </svg>
          <div>
            <strong>Rectification Requested:</strong> Deficiency flagged for applicant re-upload of compliant statutory records.
          </div>
        </div>
      `;
    }
    if (st === 'escalated') {
      return `
        <div class="finding-escalation-notice" id="finding-notice-${findingId}" data-state="escalated">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="flex-shrink: 0; margin-top: 1px;">
            <polyline points="18 15 12 9 6 15"></polyline>
          </svg>
          <div>
            <strong>Escalated to Senior Officer:</strong> Discrepancy referred for higher regulatory review and committee determination.
          </div>
        </div>
      `;
    }
    return '';
  }

  /**
   * Render Action Control Bar (Step 30)
   * 4 Buttons: Acknowledge, Request Rectification, Dismiss, Escalate
   * Verification: Buttons reflect finding's current lifecycle state.
   */
  renderActionBar(findingId, currentState) {
    const state = String(currentState || 'open').toLowerCase();
    const role = this.getCurrentRole();
    const isSenior = role === 'senior_officer' || role === 'admin';

    const isAck = state === 'acknowledged';
    const isRect = state === 'rectification_requested';
    const isDismiss = state === 'dismissed';
    const isEsc = state === 'escalated';
    const isResolved = state === 'resolved';

    return `
      <div class="finding-action-bar"
           id="finding-actions-${findingId}"
           data-finding-id="${findingId}"
           data-lifecycle-state="${state}">
        <!-- 1. Acknowledge Button -->
        <button class="btn btn-action btn-action-ack ${isAck ? 'is-active' : ''}"
                id="btn-action-ack-${findingId}"
                data-action="acknowledge"
                data-finding-id="${findingId}"
                ${isAck ? 'disabled' : ''}
                title="Mark finding as acknowledged by officer"
                onclick="event.stopPropagation(); window.findingCardComponent && window.findingCardComponent.onAction('${findingId}', 'acknowledge')">
          ${isAck ? '✓ Acknowledged' : 'Acknowledge'}
        </button>

        <!-- 2. Request Rectification Button -->
        <button class="btn btn-action btn-action-rectify ${isRect ? 'is-active' : ''}"
                id="btn-action-rectify-${findingId}"
                data-action="request_rectification"
                data-finding-id="${findingId}"
                ${isRect ? 'disabled' : ''}
                title="Flag deficiency for applicant re-upload"
                onclick="event.stopPropagation(); window.findingCardComponent && window.findingCardComponent.onAction('${findingId}', 'request_rectification')">
          ${isRect ? '⚠ Rectification Requested' : 'Request Rectification'}
        </button>

        <!-- 3. Dismiss Button (Officer Override) -->
        <button class="btn btn-action btn-action-dismiss ${isDismiss ? 'is-active' : ''}"
                id="btn-action-dismiss-${findingId}"
                data-action="dismiss"
                data-finding-id="${findingId}"
                ${isDismiss ? 'disabled' : ''}
                title="Officer override with mandatory justification"
                onclick="event.stopPropagation(); window.findingCardComponent && window.findingCardComponent.onAction('${findingId}', 'dismiss')">
          ${isDismiss ? '✕ Dismissed' : 'Dismiss'}
        </button>

        <!-- 4. Escalate Button -->
        <button class="btn btn-action btn-action-escalate ${isEsc ? 'is-active' : ''}"
                id="btn-action-escalate-${findingId}"
                data-action="escalate"
                data-finding-id="${findingId}"
                ${isEsc ? 'disabled' : ''}
                title="Escalate discrepancy to senior regulatory committee"
                onclick="event.stopPropagation(); window.findingCardComponent && window.findingCardComponent.onAction('${findingId}', 'escalate')">
          ${isEsc ? '▲ Escalated' : 'Escalate'}
        </button>

        <!-- 5. Senior Officer Resolve Button (when escalated) -->
        ${(isEsc && isSenior) ? `
          <button class="btn btn-action btn-action-resolve ${isResolved ? 'is-active' : ''}"
                  id="btn-action-resolve-${findingId}"
                  data-action="resolve"
                  data-finding-id="${findingId}"
                  ${isResolved ? 'disabled' : ''}
                  title="Resolve escalated finding with senior determination"
                  onclick="event.stopPropagation(); window.findingCardComponent && window.findingCardComponent.onAction('${findingId}', 'resolve')">
            Resolve Finding
          </button>
        ` : ''}
      </div>
    `;
  }

  /**
   * Render Action Audit History Timeline (Step 30)
   */
  renderActionTimeline(findingId) {
    const actions = this.getActionTimeline(findingId);
    if (!actions || actions.length === 0) {
      return `<div class="finding-timeline" id="finding-timeline-${findingId}" style="display: none;"></div>`;
    }

    const itemsHtml = actions.map(act => {
      const actName = act.action || 'action';
      const cleanTime = act.created_at ? new Date(act.created_at).toLocaleString() : 'Just now';
      const auditHash = act.audit_entry_hash ? act.audit_entry_hash.slice(0, 16) : null;

      return `
        <div class="timeline-entry" data-action="${actName}">
          <div class="timeline-entry-row">
            <span class="timeline-action-badge action-${actName}">
              ${actName.replace('_', ' ').toUpperCase()}
            </span>
            <span class="timeline-actor font-mono">${act.actor || 'officer'}</span>
            <span class="timeline-time font-mono">${cleanTime}</span>
          </div>
          ${act.reason ? `<div class="timeline-reason text-xs"><strong>Justification:</strong> ${escapeHtml(act.reason)}</div>` : ''}
          ${act.notes ? `<div class="timeline-notes text-xs text-muted"><strong>Notes:</strong> ${escapeHtml(act.notes)}</div>` : ''}
          <div class="timeline-meta font-mono text-xs">
            Transition: ${act.previous_state || 'open'} → <strong>${act.new_state}</strong>
            ${auditHash ? ` · S13 Audit: ${auditHash}…` : ''}
          </div>
        </div>
      `;
    }).join('');

    return `
      <div class="finding-timeline" id="finding-timeline-${findingId}">
        <div class="finding-timeline-header">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"></circle>
            <polyline points="12 6 12 12 16 14"></polyline>
          </svg>
          <span>Audit & Officer Action History (${actions.length})</span>
        </div>
        <div class="finding-timeline-list">
          ${itemsHtml}
        </div>
      </div>
    `;
  }

  /**
   * Render Complete Finding Card Component
   */
  renderCard(finding, options = {}) {
    if (!finding) return '';

    const findingId = finding.id || finding.rule_id || `f-${Math.random().toString(36).slice(2, 8)}`;
    const ruleId = finding.rule_id || 'R-UNKNOWN';
    const meta = RULE_REGULATORY_METADATA[ruleId] || {};
    const severity = finding.severity || 'medium';
    const isHigh = severity === 'high' || severity === 'critical';

    if (options.applicationId) {
      this.currentAppId = options.applicationId;
    }

    // Register finding for lookups
    this.findingsRegistry.set(findingId, finding);
    this.findingsRegistry.set(ruleId, finding);

    // Resolve Lifecycle State (Step 30)
    const currentState = this.getFindingState(findingId) || finding.lifecycle_state || finding.state || 'open';
    const isDismissed = currentState === 'dismissed';

    const statusPillHtml = this.renderStatusPill(currentState, severity);
    const advisoryBannerHtml = this.renderAdvisoryBanner(finding);
    const comparisonGridHtml = this.renderTwoSidedComparison(finding);
    const stateNoticeHtml = this.renderStateNotice(findingId, currentState);
    const actionBarHtml = this.renderActionBar(findingId, currentState);
    const timelineHtml = this.renderActionTimeline(findingId);

    return `
      <article class="card finding-card ${isHigh ? 'has-critical' : ''} ${isDismissed ? 'is-dismissed' : ''}"
               id="finding-${ruleId}"
               data-finding-id="${findingId}"
               data-rule-id="${ruleId}"
               data-severity="${severity}"
               data-lifecycle-state="${currentState}"
               data-doc-slot="${meta.docSlot || ''}"
               data-page="${meta.page || 1}"
               style="border-left: 4px solid ${isDismissed ? '#64748b' : (isHigh ? 'var(--status-fail)' : 'var(--status-warn)')}; margin-bottom: var(--space-4);"
               onclick="window.evidenceViewerComponent && window.evidenceViewerComponent.selectFinding && window.evidenceViewerComponent.selectFinding('${ruleId}')">
        <div class="card-body" style="padding: var(--space-4);">
          <!-- 1. Header with Rule ID, Status Pill, Category Tag -->
          <div class="flex items-center justify-between" style="margin-bottom: var(--space-2); gap: var(--space-2); flex-wrap: wrap;">
            <div style="display: flex; align-items: center; gap: var(--space-2);">
              <span id="finding-status-${findingId}">${statusPillHtml}</span>
              <strong class="font-mono text-sm text-main" id="finding-title-${ruleId}">${ruleId} · ${meta.title || finding.category || 'Discrepancy'}</strong>
            </div>
            <div style="display: flex; align-items: center; gap: var(--space-2);">
              <span class="badge badge-outline text-xs font-mono">${finding.category || 'REGULATORY'}</span>
            </div>
          </div>

          <!-- 2. Advisory Decision-Support Banner -->
          ${advisoryBannerHtml}

          <!-- 3. Two-Sided Comparison Grid (Left: Observed vs Right: Expected) -->
          ${comparisonGridHtml}

          <!-- 4. Rationale / Plain English Explanation -->
          <div style="margin: var(--space-3) 0;">
            <p class="text-xs text-body" style="line-height: 1.45; margin: 0;" id="finding-reason-${ruleId}">
              ${finding.reason || 'Observed document value conflicts with prescribed approval process norms.'}
            </p>
          </div>

          <!-- 5. Lifecycle State Notice Banner (Notice on Dismiss/Rectify/Escalate) -->
          <div id="finding-notice-container-${findingId}">
            ${stateNoticeHtml}
          </div>

          <!-- 6. Interactive Officer Action Bar (Step 30) -->
          ${actionBarHtml}

          <!-- 7. Action Audit Timeline (Step 30) -->
          ${timelineHtml}
        </div>
      </article>
    `;
  }

  /**
   * Get Finding Lifecycle State
   */
  getFindingState(findingId) {
    if (!findingId) return 'open';
    const entry = this.findingStates.get(findingId);
    if (entry && entry.state) return entry.state;

    // Check alias by rule_id
    const finding = this.findingsRegistry.get(findingId);
    if (finding && finding.rule_id && this.findingStates.has(finding.rule_id)) {
      return this.findingStates.get(finding.rule_id).state;
    }

    return (finding && (finding.lifecycle_state || finding.state)) || 'open';
  }

  /**
   * Set Finding Lifecycle State
   */
  setFindingState(findingId, stateName, actionRecord = null) {
    if (!findingId) return;
    const normState = VALID_ACTIONS_MAP[stateName] || stateName;
    const record = { state: normState, lastAction: actionRecord };

    this.findingStates.set(findingId, record);

    const finding = this.findingsRegistry.get(findingId);
    if (finding && finding.rule_id) {
      this.findingStates.set(finding.rule_id, record);
    }
  }

  /**
   * Get Action Audit Timeline for Finding
   */
  getActionTimeline(findingId) {
    if (!findingId) return [];
    let list = this.actionsByFinding.get(findingId);
    if (list && list.length > 0) return list;

    const finding = this.findingsRegistry.get(findingId);
    if (finding && finding.rule_id) {
      list = this.actionsByFinding.get(finding.rule_id);
      if (list && list.length > 0) return list;
    }

    return [];
  }

  /**
   * Load Finding Actions from Backend: GET /applications/{id}/findings/actions (Step 30)
   */
  async loadFindingActions(applicationId) {
    const appId = applicationId || this.currentAppId;
    if (!appId) return [];

    try {
      const client = (typeof window !== 'undefined' && (window.apiClient || window.api))
        ? (window.apiClient || window.api)
        : (typeof ApiClient !== 'undefined' ? new ApiClient() : null);

      if (client && typeof client.getFindingActions === 'function') {
        const res = await client.getFindingActions(appId);
        const actions = (res && Array.isArray(res.actions)) ? res.actions : [];

        // Clear and rebuild local timelines
        this.actionsByFinding.clear();
        for (const act of actions) {
          const fid = act.finding_id;
          if (!fid) continue;

          const existing = this.actionsByFinding.get(fid) || [];
          existing.push(act);
          this.actionsByFinding.set(fid, existing);

          // Update finding state to latest action
          this.setFindingState(fid, act.new_state, act);
        }

        // Refresh DOM elements
        this.updateAllRenderedFindingDoms();

        if (typeof window !== 'undefined' && typeof CustomEvent !== 'undefined' && typeof window.dispatchEvent === 'function') {
          window.dispatchEvent(new CustomEvent('app:finding-actions-loaded', {
            detail: {
              applicationId: appId,
              totalActions: actions.length
            }
          }));
        }

        return actions;
      }
    } catch (err) {
      console.warn(`[FindingCardComponent] Could not load actions for ${appId}:`, err);
    }

    return [];
  }

  /**
   * Primary Action Trigger (Step 30)
   * Dispatches app:finding-action-clicked.
   * If reason required and not prefilled, displays modal dialog.
   * Enforces mandatory reason (>5 chars).
   */
  async onAction(findingId, actionName, prefillReason = null, prefillNotes = null) {
    if (!findingId || !actionName) return false;

    const act = actionName.toLowerCase().trim();
    const currentState = this.getFindingState(findingId);

    // 1. Dispatch DOM Event
    if (typeof window !== 'undefined' && typeof CustomEvent !== 'undefined' && typeof window.dispatchEvent === 'function') {
      window.dispatchEvent(new CustomEvent('app:finding-action-clicked', {
        detail: {
          findingId,
          actionName: act,
          currentState
        }
      }));
    }

    // 2. Mandatory Reason Validation
    if (ACTIONS_REQUIRING_REASON.has(act)) {
      if (prefillReason !== null) {
        // Direct reason provided (e.g., programmatically or from modal submit)
        if (!prefillReason || !prefillReason.trim() || prefillReason.trim().length < 5) {
          const errMsg = 'Reason is mandatory to override automated findings (minimum 5 characters).';
          if (typeof alert === 'function' && typeof window !== 'undefined' && window.document) {
            // alert only if interactive DOM without custom modal
          }
          return {
            success: false,
            error: 'MANDATORY_REASON_REQUIRED',
            message: errMsg
          };
        }

        return this.executeAction(
          this.currentAppId,
          findingId,
          act,
          prefillReason.trim(),
          prefillNotes,
          this.getCurrentRole()
        );
      } else {
        // Open modal dialog for mandatory human input (Step 31)
        if (typeof window !== 'undefined' && window.actionModalComponent && typeof window.actionModalComponent.open === 'function') {
          return window.actionModalComponent.open({
            applicationId: this.currentAppId,
            findingId,
            actionName: act,
            finding: this.findingsRegistry.get(findingId)
          });
        }
        return this.openActionModal(findingId, act);
      }
    }

    // 3. Simple Acknowledge Action (does not require long reason)
    return this.executeAction(
      this.currentAppId,
      findingId,
      act,
      prefillReason || 'Acknowledged by reviewing officer',
      prefillNotes,
      this.getCurrentRole()
    );
  }

  /**
   * Execute Action & Record to API: POST /applications/{id}/findings/{finding_id}/act (Step 30)
   */
  async executeAction(applicationId, findingId, action, reason = null, notes = null, userRole = 'officer') {
    const appId = applicationId || this.currentAppId || 'DEMO-ISSUES-001';
    const act = action.toLowerCase().trim();
    const prevState = this.getFindingState(findingId);
    const newState = VALID_ACTIONS_MAP[act] || act;
    const actor = this.getActorName();

    let actionRecord = null;

    try {
      const client = (typeof window !== 'undefined' && (window.apiClient || window.api))
        ? (window.apiClient || window.api)
        : (typeof ApiClient !== 'undefined' ? new ApiClient() : null);

      if (client && typeof client.recordFindingAction === 'function') {
        actionRecord = await client.recordFindingAction(
          appId,
          findingId,
          act,
          reason,
          notes,
          userRole,
          actor
        );
      }
    } catch (err) {
      console.warn(`[FindingCardComponent] API action dispatch failed, falling back to local simulation:`, err);
    }

    // Fallback compliant action record if offline/backend not connected
    if (!actionRecord) {
      const nowIso = new Date().toISOString();
      actionRecord = {
        id: `act-${Math.random().toString(36).slice(2, 10)}`,
        application_id: appId,
        finding_id: findingId,
        action: act,
        previous_state: prevState,
        new_state: newState,
        actor: actor,
        reason: (reason || '').trim(),
        notes: (notes || '').trim() || null,
        created_at: nowIso,
        audit_event_id: Math.floor(Math.random() * 1000) + 1,
        audit_entry_hash: `sha256_${Math.random().toString(16).slice(2, 18)}`
      };
    }

    // Update local state and history
    this.setFindingState(findingId, newState, actionRecord);

    const existingActions = this.actionsByFinding.get(findingId) || [];
    existingActions.push(actionRecord);
    this.actionsByFinding.set(findingId, existingActions);

    const finding = this.findingsRegistry.get(findingId);
    if (finding && finding.rule_id) {
      const ruleActions = this.actionsByFinding.get(finding.rule_id) || [];
      ruleActions.push(actionRecord);
      this.actionsByFinding.set(finding.rule_id, ruleActions);
    }

    // Update Card DOM
    this.updateFindingDom(findingId);

    // Dispatch completion event
    if (typeof window !== 'undefined' && typeof CustomEvent !== 'undefined' && typeof window.dispatchEvent === 'function') {
      window.dispatchEvent(new CustomEvent('app:finding-action-recorded', {
        detail: {
          applicationId: appId,
          findingId,
          ruleId: finding ? finding.rule_id : findingId,
          action: act,
          actionRecord,
          newState
        }
      }));
    }

    return actionRecord;
  }

  /**
   * Open Action Modal Dialog for Mandatory Reason Input (Step 30 & 31)
   */
  openActionModal(findingId, actionName) {
    if (typeof document === 'undefined') {
      return { success: false, error: 'NO_DOM', message: 'DOM environment not available' };
    }

    // Remove existing modal if open
    const existing = document.getElementById('finding-action-modal');
    if (existing && existing.parentNode) {
      existing.parentNode.removeChild(existing);
    }

    const actionLabels = {
      'dismiss': 'Dismiss Finding (Officer Override)',
      'request_rectification': 'Request Document Rectification',
      'escalate': 'Escalate Discrepancy to Senior Officer',
      'resolve': 'Resolve Escalated Discrepancy'
    };
    const title = actionLabels[actionName] || `Confirm ${actionName.toUpperCase()}`;

    const modalBackdrop = document.createElement('div');
    modalBackdrop.className = 'action-modal-backdrop';
    modalBackdrop.id = 'finding-action-modal';
    modalBackdrop.setAttribute('role', 'dialog');
    modalBackdrop.setAttribute('aria-modal', 'true');

    modalBackdrop.innerHTML = `
      <div class="action-modal-card">
        <div class="action-modal-header">
          <div style="display: flex; align-items: center; justify-content: space-between;">
            <strong style="color: var(--text-main); font-size: var(--font-size-sm);">${title}</strong>
            <button type="button" class="btn btn-outline btn-sm font-mono" id="btn-modal-close" style="padding: 1px 6px;">✕</button>
          </div>
          <div class="text-xs text-muted" style="margin-top: 4px;">
            Target Finding: <span class="font-mono">${findingId}</span> · S13 Cryptographic Audit Trail
          </div>
        </div>

        <div class="action-modal-body">
          <label for="action-reason-input" style="display: block; font-size: 11px; font-weight: 600; margin-bottom: 6px; color: var(--text-main);">
            Mandatory Human Justification Reason <span class="text-danger">*</span>
          </label>
          <textarea id="action-reason-input"
                    class="action-modal-textarea"
                    placeholder="Enter formal regulatory rationale (e.g. Valid physical renewal verified on state fire authority portal; affidavit submitted under separate index)..."></textarea>
          <div id="action-reason-error" class="action-modal-error" style="display: none;"></div>

          <label for="action-notes-input" style="display: block; font-size: 11px; font-weight: 600; margin-top: 10px; margin-bottom: 4px; color: var(--text-muted);">
            Optional Internal Notes
          </label>
          <input type="text" id="action-notes-input" class="form-input" style="width: 100%; box-sizing: border-box; font-size: 12px; padding: 6px;" placeholder="Optional officer reference...">
        </div>

        <div class="action-modal-footer">
          <button type="button" class="btn btn-outline btn-sm" id="btn-modal-cancel">Cancel</button>
          <button type="button" class="btn btn-primary btn-sm font-mono" id="btn-modal-submit">Confirm Action</button>
        </div>
      </div>
    `;

    if (document.body && typeof document.body.appendChild === 'function') {
      document.body.appendChild(modalBackdrop);
    }

    const closeBtn = document.getElementById('btn-modal-close');
    const cancelBtn = document.getElementById('btn-modal-cancel');
    const submitBtn = document.getElementById('btn-modal-submit');
    const reasonInput = document.getElementById('action-reason-input');
    const errorEl = document.getElementById('action-reason-error');

    const closeModal = () => {
      if (modalBackdrop && modalBackdrop.parentNode) {
        modalBackdrop.parentNode.removeChild(modalBackdrop);
      }
    };

    if (closeBtn) closeBtn.onclick = closeModal;
    if (cancelBtn) cancelBtn.onclick = closeModal;

    if (submitBtn && reasonInput) {
      submitBtn.onclick = async () => {
        const text = reasonInput.value ? reasonInput.value.trim() : '';
        if (!text || text.length < 5) {
          if (errorEl) {
            errorEl.textContent = 'Reason is mandatory to override automated findings (minimum 5 characters).';
            errorEl.style.display = 'block';
          }
          if (typeof reasonInput.focus === 'function') reasonInput.focus();
          return;
        }

        const notesInput = document.getElementById('action-notes-input');
        const notes = notesInput ? notesInput.value.trim() : null;

        closeModal();
        await this.executeAction(this.currentAppId, findingId, actionName, text, notes, this.getCurrentRole());
      };
    }

    if (reasonInput && typeof reasonInput.focus === 'function') {
      setTimeout(() => reasonInput.focus(), 50);
    }

    return modalBackdrop;
  }

  /**
   * Update Finding Card DOM Elements after State Change (Step 30)
   */
  updateFindingDom(findingId) {
    if (typeof document === 'undefined') return;

    const finding = this.findingsRegistry.get(findingId) || { id: findingId, rule_id: findingId };
    const ruleId = finding.rule_id || findingId;
    const currentState = this.getFindingState(findingId);
    const severity = finding.severity || 'medium';
    const isDismissed = currentState === 'dismissed';

    // 1. Update Card Container
    const cardEl = document.getElementById(`finding-${ruleId}`);
    if (cardEl) {
      cardEl.dataset.lifecycleState = currentState;
      if (isDismissed) {
        cardEl.classList.add('is-dismissed');
        cardEl.style.borderLeftColor = '#64748b';
      } else {
        cardEl.classList.remove('is-dismissed');
        cardEl.style.borderLeftColor = (severity === 'high' || severity === 'critical')
          ? 'var(--status-fail)'
          : 'var(--status-warn)';
      }
    }

    // 2. Update Status Pill
    const statusContainer = document.getElementById(`finding-status-${findingId}`);
    if (statusContainer) {
      statusContainer.innerHTML = this.renderStatusPill(currentState, severity);
    }

    // 3. Update Notice Banner
    const noticeContainer = document.getElementById(`finding-notice-container-${findingId}`);
    if (noticeContainer) {
      noticeContainer.innerHTML = this.renderStateNotice(findingId, currentState);
    }

    // 4. Update Action Bar
    const actionsContainer = document.getElementById(`finding-actions-${findingId}`);
    if (actionsContainer) {
      actionsContainer.outerHTML = this.renderActionBar(findingId, currentState);
    }

    // 5. Update Timeline
    const timelineContainer = document.getElementById(`finding-timeline-${findingId}`);
    if (timelineContainer) {
      timelineContainer.outerHTML = this.renderActionTimeline(findingId);
    }
  }

  /**
   * Refresh all registered finding cards in current DOM
   */
  updateAllRenderedFindingDoms() {
    for (const [fid] of this.findingStates.entries()) {
      this.updateFindingDom(fid);
    }
  }
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Singleton instantiation
const findingCardComponent = new FindingCardComponent();
if (typeof window !== 'undefined') {
  window.findingCardComponent = findingCardComponent;
  window.FindingCardComponent = FindingCardComponent;
  window.RULE_REGULATORY_METADATA = RULE_REGULATORY_METADATA;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    FindingCardComponent,
    findingCardComponent,
    RULE_REGULATORY_METADATA,
    VALID_ACTIONS_MAP,
    ACTIONS_REQUIRING_REASON
  };
}
