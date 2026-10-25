/**
 * AICTE Application Validation Platform — Application Queue Card Component
 * Spec Reference: ROADMAP.md (Phase 3: Steps 15, 16 & 17), Guide §11.7, §17.1
 *
 * Responsibilities:
 * 1. Render triage board card item (Step 15):
 *    - Application ID and permanent AICTE ID
 *    - Institution Name with clear institutional typography
 *    - Regulatory Category (e.g. EOA_RENEWAL -> EoA Renewal)
 *    - Submission Date and calculated Age in Days
 *    - Counts of active findings and priority alerts
 *    - Preliminary workflow status pill
 * 2. Dynamic Priority Score Gauge & Breakdown Tooltip (Step 16):
 *    - Color gauge: >= 100 crimson, 30-99 amber, < 30 blue
 *    - Mathematical breakdown tooltip: Score = (100 × H) + (30 × M) + (5 × L) + Age + Deadline Pressure
 *    - Native title attribute and floating CSS tooltip with accessibility tags
 * 3. Statutory SLA Deadline Countdown Timer (Step 17):
 *    - Cutoff: 14 calendar days from submission
 *    - Progressive states: > 7 days gray (normal), 3-7 days yellow (warning), < 3 days pulsating red (critical)
 *    - Visual urgency tag for applications <= 7 days remaining
 * 4. Handle card selection click, updating reactive global state and navigating to #application/:id.
 */

class QueueCardComponent {
  constructor() {
    this.benchmarkDate = new Date('2026-10-24T00:00:00Z');
  }

  /**
   * Calculate statutory SLA deadline metrics from submission date (Step 17)
   * Cutoff: 14 calendar days from submission.
   * Warning states:
   *  - Normal (> 7 days): gray badge
   *  - Warning (3-7 days): yellow/amber badge with visual urgency tag
   *  - Critical (< 3 days): pulsating red badge
   */
  calculateSlaDeadline(submittedOn) {
    const totalSlaDays = 14;
    const ageDays = this.calculateAgeDays(submittedOn);
    const daysRemaining = totalSlaDays - ageDays;

    let state = 'NORMAL';
    let cssClass = 'badge-sla-normal';
    let isUrgent = false;
    let label = `SLA: ${daysRemaining}d left`;

    if (daysRemaining < 3) {
      state = 'CRITICAL';
      cssClass = 'badge-sla-critical';
      isUrgent = true;
      if (daysRemaining < 0) {
        label = `SLA: ${Math.abs(daysRemaining)}d Overdue`;
      } else if (daysRemaining === 0) {
        label = 'SLA: Due Today';
      } else {
        label = `SLA: ${daysRemaining}d left`;
      }
    } else if (daysRemaining <= 7) {
      state = 'WARNING';
      cssClass = 'badge-sla-warning';
      isUrgent = true;
      label = `SLA: ${daysRemaining}d left`;
    }

    let cutoffIso = '';
    try {
      if (submittedOn) {
        const subDate = new Date(submittedOn);
        const cutoffDate = new Date(subDate.getTime() + (totalSlaDays * 24 * 60 * 60 * 1000));
        cutoffIso = cutoffDate.toISOString().slice(0, 10);
      }
    } catch (_) {}

    return {
      totalSlaDays,
      ageDays,
      daysRemaining,
      cutoffIso,
      state,
      cssClass,
      isUrgent,
      label
    };
  }

  /**
   * Render statutory SLA deadline countdown timer badge (Step 17)
   */
  renderSlaBadge(appId, slaData) {
    if (!slaData) return '';

    const urgencyTag = slaData.isUrgent
      ? `<span class="sla-urgency-tag" title="Urgent SLA Attention Required" aria-label="Urgent">⚡</span>`
      : '';

    const titleText = `Statutory 14-day Review Cutoff: ${slaData.cutoffIso || '14 days'} (${slaData.daysRemaining} days remaining)`;

    return `
      <span class="badge ${slaData.cssClass} text-xs sla-countdown-badge"
            id="sla-badge-${appId}"
            title="${titleText}"
            data-sla-days="${slaData.daysRemaining}"
            data-sla-state="${slaData.state}"
            data-sla-urgent="${slaData.isUrgent}"
            style="font-size: 10px; font-family: var(--font-mono); display: inline-flex; align-items: center; gap: 3px; padding: 2px 6px;">
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="flex-shrink:0;">
          <circle cx="12" cy="12" r="10"/>
          <polyline points="12 6 12 12 16 14"/>
        </svg>
        <span>${slaData.label}</span>
        ${urgencyTag}
      </span>
    `;
  }

  /**
   * Calculate priority score, breakdown values, gauge class and tooltip text (Step 16)
   * Formula: Score = (100 × H) + (30 × M) + (5 × L) + Age + Deadline Pressure
   */
  getPriorityData(app, agg = null) {
    const submittedOn = (app && app.submitted_on) ? app.submitted_on : null;
    const ageDays = this.calculateAgeDays(submittedOn);

    let high = 0;
    let medium = 0;
    let low = 0;
    let age = ageDays;
    let deadline = 0;
    let score = null;

    if (agg && agg.priority) {
      if (typeof agg.priority.score === 'number') {
        score = agg.priority.score;
      }
      if (agg.priority.breakdown) {
        const b = agg.priority.breakdown;
        high = typeof b.high === 'number' ? b.high : high;
        medium = typeof b.medium === 'number' ? b.medium : (typeof b.med === 'number' ? b.med : medium);
        low = typeof b.low === 'number' ? b.low : low;
        age = typeof b.age_days === 'number' ? b.age_days : (typeof b.age === 'number' ? b.age : age);
        deadline = typeof b.deadline_pressure === 'number' ? b.deadline_pressure : (typeof b.deadline === 'number' ? b.deadline : deadline);
      }
    }

    // If breakdown wasn't explicitly populated in agg.priority, derive from findings
    if (!agg || !agg.priority || !agg.priority.breakdown) {
      const findings = (agg && agg.findings) ? agg.findings : [];
      const flags = (agg && agg.forensic_flags) ? agg.forensic_flags : [];
      for (const item of [...findings, ...flags]) {
        const sev = String(item.severity || '').toLowerCase();
        if (sev === 'high' || sev === 'critical') {
          high++;
        } else if (sev === 'medium' || sev === 'med') {
          medium++;
        } else if (sev === 'low') {
          low++;
        }
      }
    }

    if (score === null) {
      score = (100 * high) + (30 * medium) + (5 * low) + age + deadline;
    }

    // Gauge classification: >= 100 crimson, 30-99 amber, < 30 blue (Guide §11.7, ROADMAP Step 16)
    let gaugeClass = 'badge-priority-blue';
    if (score >= 100) {
      gaugeClass = 'badge-priority-crimson';
    } else if (score >= 30) {
      gaugeClass = 'badge-priority-amber';
    }

    const tooltipText = `(100 × ${high} High) + (30 × ${medium} Med) + (5 × ${low} Low) + ${age} Age + ${deadline} Deadline`;
    const formulaText = 'Score = (100 × H) + (30 × M) + (5 × L) + Age + Deadline Pressure';

    return {
      score,
      gaugeClass,
      tooltipText,
      formulaText,
      breakdown: {
        high,
        medium,
        low,
        age_days: age,
        deadline_pressure: deadline
      }
    };
  }

  /**
   * Render dynamic priority gauge badge with interactive breakdown tooltip (Step 16)
   */
  renderPriorityBadge(appId, priorityData) {
    if (!priorityData) return '';

    return `
      <div class="priority-score-container" onclick="event.stopPropagation()">
        <span class="badge priority-badge ${priorityData.gaugeClass}"
              id="priority-badge-${appId}"
              title="${priorityData.tooltipText}"
              data-score="${priorityData.score}"
              data-gauge="${priorityData.gaugeClass}"
              data-tooltip="${priorityData.tooltipText}"
              tabindex="0"
              aria-label="Priority Score: ${priorityData.score}, ${priorityData.tooltipText}">
          <span class="priority-gauge-indicator"></span>
          <span>Priority: ${priorityData.score}</span>
        </span>
        <div class="priority-tooltip" id="priority-tooltip-${appId}" role="tooltip">
          <div class="priority-tooltip-header">Priority Formula Breakdown</div>
          <div class="priority-tooltip-formula">${priorityData.tooltipText}</div>
        </div>
      </div>
    `;
  }

  /**
   * Render complete HTML for a triage queue card (Steps 15 & 16)
   */
  render(app, agg = null) {
    if (!app) return '';

    const appId = app.id || 'DEMO-APP';
    const institutionName = app.institution_name || 'Autonomous Engineering College';
    const aicteId = app.aicte_id || '1-10998877';
    const category = this.formatCategory(app.category || 'EOA_RENEWAL');
    const submittedOn = app.submitted_on || '2026-10-12';
    const ageDays = this.calculateAgeDays(submittedOn);
    const intake = app.requested_intake ? `${app.requested_intake} seats` : 'Standard Intake';

    // Extract metrics from S11 aggregate if available
    const findings = (agg && agg.findings) ? agg.findings : [];
    const findingsCount = findings.length;
    const highFindings = findings.filter(f => f.severity === 'high' || f.severity === 'critical').length;

    const alerts = (agg && agg.alerts) ? agg.alerts : [];
    const alertsCount = alerts.length;

    // Calculate Step 16 dynamic priority score gauge and tooltip data
    const priorityData = this.getPriorityData(app, agg);
    const priorityBadgeHtml = this.renderPriorityBadge(appId, priorityData);

    // Calculate Step 17 statutory SLA deadline countdown timer
    const slaData = this.calculateSlaDeadline(submittedOn);
    const slaBadgeHtml = this.renderSlaBadge(appId, slaData);

    const workflowStatus = (agg && agg.workflow_status)
      ? agg.workflow_status.replace(/_/g, ' ')
      : (findingsCount > 0 ? 'NEEDS RECTIFICATION' : 'VALIDATED NO ISSUES');

    // Findings Badge
    let findingsBadge = '';
    if (findingsCount === 0) {
      findingsBadge = `<span class="badge badge-pass text-xs" style="font-size: 10px;">0 Findings</span>`;
    } else if (highFindings > 0) {
      findingsBadge = `<span class="badge badge-fail text-xs" style="font-size: 10px;">${findingsCount} Findings (${highFindings} High)</span>`;
    } else {
      findingsBadge = `<span class="badge badge-warn text-xs" style="font-size: 10px;">${findingsCount} Findings</span>`;
    }

    // Alerts Badge
    const alertsBadge = alertsCount > 0
      ? `<span class="badge badge-warn text-xs" style="font-size: 10px; padding: 1px 5px;">${alertsCount} Alert${alertsCount > 1 ? 's' : ''}</span>`
      : '';

    return `
      <div class="card queue-app-card" id="card-${appId}" data-app-id="${appId}" onclick="window.queueCardComponent.handleCardClick('${appId}')" role="button" tabindex="0" aria-label="Application ${appId}">
        <!-- Top Row: App ID, Category & Findings Indicator -->
        <div class="queue-card-top">
          <div style="display: flex; align-items: center; gap: var(--space-2);">
            <strong class="queue-card-id">${appId}</strong>
            <span class="badge badge-outline text-xs" style="font-size: 10px; padding: 1px 6px;">${category}</span>
          </div>
          <div class="queue-card-badges">
            ${alertsBadge}
            ${findingsBadge}
          </div>
        </div>

        <!-- Middle Row: Institution Name & AICTE ID -->
        <div>
          <div class="queue-card-inst-name" title="${institutionName}">${institutionName}</div>
          <div class="text-xs text-muted" style="margin-top: 2px;">
            AICTE ID: <span class="font-mono text-main">${aicteId}</span> · Intake: <span class="font-mono">${intake}</span>
          </div>
        </div>

        <!-- Footer Row: Submission Date, Age in Days, SLA & Priority Gauge (Steps 15, 16 & 17) -->
        <div class="queue-card-footer">
          <div class="queue-card-age">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"/>
              <polyline points="12 6 12 12 16 14"/>
            </svg>
            <span>${submittedOn} · <strong>${ageDays}d</strong> elapsed</span>
          </div>
          <div style="display: flex; align-items: center; gap: var(--space-2);">
            ${slaBadgeHtml}
            ${priorityBadgeHtml}
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Calculate elapsed calendar days from submission date
   */
  calculateAgeDays(submittedOn) {
    if (!submittedOn) return 0;
    try {
      const subDate = new Date(submittedOn);
      const diffMs = this.benchmarkDate - subDate;
      const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
      return Math.max(0, days);
    } catch (_) {
      return 0;
    }
  }

  /**
   * Format regulatory category identifier into title case
   */
  formatCategory(category) {
    if (!category) return 'EoA Renewal';
    if (category === 'EOA_RENEWAL') return 'EoA Renewal';
    if (category === 'NEW_INSTITUTION') return 'New Institution';
    return category.replace(/_/g, ' ');
  }

  /**
   * Handle user click on application card (Step 15)
   */
  handleCardClick(appId) {
    if (!appId) return;

    let aggregate = null;
    if (typeof window !== 'undefined' && window.queueViewComponent && window.queueViewComponent.aggregates) {
      aggregate = window.queueViewComponent.aggregates.get(appId);
    }

    // 1. Update Reactive Global State
    if (typeof window !== 'undefined' && window.appState) {
      window.appState.setSelectedApp(appId, aggregate);
    }

    // 2. Programmatic Router Navigation to #application/:id
    if (typeof window !== 'undefined' && window.router && typeof window.router.navigate === 'function') {
      window.router.navigate(`#application/${appId}`);
    } else if (typeof window !== 'undefined') {
      window.location.hash = `#application/${appId}`;
    }

    // 3. Dispatch native DOM event
    if (typeof window !== 'undefined' && typeof CustomEvent !== 'undefined' && typeof window.dispatchEvent === 'function') {
      window.dispatchEvent(new CustomEvent('app:application-selected', {
        detail: {
          applicationId: appId,
          aggregate: aggregate
        }
      }));
    }
  }
}

// Singleton instantiation
const queueCardComponent = new QueueCardComponent();
if (typeof window !== 'undefined') {
  window.queueCardComponent = queueCardComponent;
  window.QueueCardComponent = QueueCardComponent;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { QueueCardComponent };
}
