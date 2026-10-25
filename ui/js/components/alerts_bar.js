/**
 * AICTE Application Validation Platform — High-Severity Active Alerts Banner
 * Spec Reference: ROADMAP.md (Phase 4: Step 22), Guide §11.7, §17.1
 *
 * Responsibilities:
 * 1. Render collapsible alert drawer across top of workspace (#workspace-alerts-container).
 * 2. List emitted S11 active alerts:
 *    - CRITICAL_DISCREPANCY
 *    - EXPIRED_MANDATORY_DOCUMENT (DOCUMENT_EXPIRED)
 *    - INFRA_ANOMALY (INFRASTRUCTURE_ANOMALY)
 *    - MISSING_INFORMATION
 * 3. Provide one-click click-to-focus shortcuts that automatically transition workspace tabs
 *    (e.g., clicking 'Expired Mandatory Document: FIRE_NOC' opens Evidence tab and highlights the finding).
 * 4. Support collapsible drawer toggle state with animated layout transitions.
 */

class AlertsBarComponent {
  constructor() {
    this.currentAppId = null;
    this.alerts = [];
    this.isCollapsed = false;
  }

  /**
   * Determine target workspace tab and focus identifier for an alert (Step 22)
   */
  resolveAlertTarget(alert) {
    const cat = String(alert.category || '').toUpperCase();
    const title = String(alert.title || '').toUpperCase();
    const msg = String(alert.message || '').toUpperCase();

    let targetTab = 'evidence';
    let focusTarget = 'GENERAL';

    if (cat.includes('EXPIRED') || title.includes('EXPIRED') || title.includes('FIRE_NOC') || msg.includes('FIRE_NOC')) {
      targetTab = 'evidence';
      focusTarget = 'FIRE_NOC';
    } else if (cat.includes('CRITICAL_DISCREPANCY') || cat.includes('DISCREPANCY')) {
      targetTab = 'evidence';
      focusTarget = alert.rule_id || 'CRITICAL_DISCREPANCY';
    } else if (cat.includes('INFRA') || title.includes('INFRA') || cat.includes('LOCATION')) {
      targetTab = 'infra';
      focusTarget = alert.item_key || 'INFRA';
    } else if (cat.includes('VERIF') || title.includes('VERIFICATION')) {
      targetTab = 'verifications';
      focusTarget = alert.document_id || 'VERIFICATION';
    } else if (cat.includes('MISSING') || title.includes('MISSING') || cat.includes('TIER')) {
      targetTab = 'documents';
      focusTarget = 'DOCUMENTS';
    }

    return { targetTab, focusTarget };
  }

  /**
   * Click-to-focus shortcut action (Step 22)
   * Switches workspace tab and highlights the target finding
   */
  focusAlert(alertId) {
    const alert = this.alerts.find(a => a.id === alertId);
    if (!alert) return;

    const { targetTab, focusTarget } = this.resolveAlertTarget(alert);

    // 1. Programmatically switch workspace tab
    if (typeof window !== 'undefined' && window.workspaceComponent && typeof window.workspaceComponent.switchTab === 'function') {
      window.workspaceComponent.switchTab(targetTab);
    }

    // 2. Highlight target element in DOM
    if (typeof document !== 'undefined') {
      const targetEl = document.getElementById(`finding-${focusTarget}`)
        || document.querySelector(`[data-finding-type="${focusTarget}"]`)
        || document.getElementById(`workspace-pane-${targetTab}`);

      if (targetEl) {
        targetEl.classList.remove('highlight-pulse');
        if (typeof targetEl.offsetWidth !== 'undefined') void targetEl.offsetWidth; // force reflow
        targetEl.classList.add('highlight-pulse');
        if (typeof targetEl.scrollIntoView === 'function') {
          targetEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      }

      // Inject focused banner feedback into target tab content area
      const feedbackContainer = document.getElementById(`workspace-${targetTab}-content`);
      if (feedbackContainer && focusTarget === 'FIRE_NOC') {
        const existingBanner = document.getElementById('alert-focused-banner');
        if (!existingBanner) {
          const banner = document.createElement('div');
          banner.id = 'alert-focused-banner';
          banner.className = 'card highlight-pulse';
          if (banner.style) {
            banner.style.marginBottom = 'var(--space-4)';
            banner.style.borderLeft = '4px solid var(--status-fail)';
          }
          banner.innerHTML = `
            <div class="card-body">
              <div class="flex items-center justify-between">
                <strong style="color: var(--status-fail);">
                  ⚡ Focused Finding: ${alert.title}
                </strong>
                <span class="badge badge-fail text-xs">HIGH SEVERITY</span>
              </div>
              <p style="margin: var(--space-2) 0 0 0;" class="text-sm">
                ${alert.message}
              </p>
            </div>
          `;
          if (typeof feedbackContainer.prepend === 'function') {
            feedbackContainer.prepend(banner);
          }
        }
      }
    }

    // 3. Dispatch native DOM event
    if (typeof window !== 'undefined' && typeof CustomEvent !== 'undefined' && typeof window.dispatchEvent === 'function') {
      window.dispatchEvent(new CustomEvent('app:alert-focused', {
        detail: {
          alertId,
          alert,
          targetTab,
          focusTarget
        }
      }));
    }
  }

  /**
   * Toggle collapsible alert drawer
   */
  toggleCollapse() {
    this.isCollapsed = !this.isCollapsed;

    if (typeof document !== 'undefined') {
      const listEl = document.getElementById('alerts-drawer-list');
      const toggleBtn = document.getElementById('btn-toggle-alerts');
      if (listEl) {
        if (this.isCollapsed) {
          listEl.classList.add('hidden');
        } else {
          listEl.classList.remove('hidden');
        }
      }
      if (toggleBtn) {
        toggleBtn.textContent = this.isCollapsed
          ? `Show Alerts (${this.alerts.length}) ▼`
          : 'Collapse Alerts ▲';
      }
    }

    if (typeof window !== 'undefined' && typeof CustomEvent !== 'undefined' && typeof window.dispatchEvent === 'function') {
      window.dispatchEvent(new CustomEvent('app:alerts-toggled', {
        detail: { isCollapsed: this.isCollapsed }
      }));
    }
  }

  /**
   * Render Alerts Banner into DOM (Step 22)
   */
  render(applicationId, alerts = [], container = null) {
    this.currentAppId = applicationId;
    this.alerts = alerts || [];

    let targetEl = null;
    if (typeof document !== 'undefined') {
      targetEl = typeof container === 'string'
        ? document.getElementById(container)
        : (container || document.getElementById('workspace-alerts-container'));
    }

    // If no active alerts, render reassurance banner
    if (this.alerts.length === 0) {
      const cleanHtml = `
        <div class="alerts-banner-container" id="alerts-banner-widget">
          <div class="alerts-banner-header" style="background: var(--status-pass-bg); border-bottom: none;">
            <div class="alerts-banner-title" style="color: var(--status-pass);">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                <polyline points="22 4 12 14.01 9 11.01"/>
              </svg>
              <span>Zero Active Critical Discrepancies</span>
            </div>
            <span class="badge badge-pass text-xs">All Compliance Norms Satisfied</span>
          </div>
        </div>
      `;
      if (targetEl) targetEl.innerHTML = cleanHtml;
      return cleanHtml;
    }

    const highCount = this.alerts.filter(a => {
      const sev = String(a.severity || '').toLowerCase();
      return sev === 'high' || sev === 'critical';
    }).length;

    const hasCritical = highCount > 0;

    const itemsHtml = this.alerts.map(alert => {
      const sev = String(alert.severity || 'medium').toLowerCase();
      const cat = String(alert.category || 'CRITICAL_DISCREPANCY');
      const title = alert.title || 'Regulatory Alert';
      const msg = alert.message || '';
      const { targetTab } = this.resolveAlertTarget(alert);

      const sevBadgeClass = (sev === 'high' || sev === 'critical')
        ? 'badge-fail'
        : (sev === 'medium' ? 'badge-warn' : 'badge-outline');

      return `
        <div class="alert-item-card sev-${sev}" id="alert-card-${alert.id}" data-alert-id="${alert.id}">
          <div class="alert-item-content">
            <div class="alert-item-top">
              <span class="badge ${sevBadgeClass} text-xs font-mono" id="alert-badge-${alert.id}">${cat}</span>
              <strong class="alert-item-title">${title}</strong>
            </div>
            <p class="alert-item-msg">${msg}</p>
          </div>
          <button class="btn btn-outline btn-sm btn-focus-alert"
                  id="btn-focus-${alert.id}"
                  onclick="window.alertsBarComponent.focusAlert('${alert.id}')"
                  title="Focus finding in ${targetTab} tab">
            Focus ${targetTab.toUpperCase()} &rarr;
          </button>
        </div>
      `;
    }).join('');

    const html = `
      <div class="alerts-banner-container ${hasCritical ? 'has-critical' : ''}" id="alerts-banner-widget">
        <!-- Collapsible Header -->
        <div class="alerts-banner-header" onclick="window.alertsBarComponent.toggleCollapse()">
          <div class="alerts-banner-title">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color: ${hasCritical ? 'var(--status-fail)' : 'var(--status-warn)'};">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
              <line x1="12" y1="9" x2="12" y2="13"/>
              <line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
            <span>Active Officer Alerts (${this.alerts.length})</span>
            ${hasCritical ? `<span class="badge badge-fail text-xs">${highCount} High Severity</span>` : ''}
          </div>
          <div style="display: flex; align-items: center; gap: var(--space-2);">
            <button class="btn btn-outline btn-sm text-xs"
                    id="btn-toggle-alerts"
                    onclick="event.stopPropagation(); window.alertsBarComponent.toggleCollapse()">
              ${this.isCollapsed ? `Show Alerts (${this.alerts.length}) ▼` : 'Collapse Alerts ▲'}
            </button>
          </div>
        </div>

        <!-- Collapsible Alerts List -->
        <div class="alerts-list ${this.isCollapsed ? 'hidden' : ''}" id="alerts-drawer-list">
          ${itemsHtml}
        </div>
      </div>
    `;

    if (targetEl) {
      targetEl.innerHTML = html;
    }

    return html;
  }
}

// Singleton instantiation
const alertsBarComponent = new AlertsBarComponent();
if (typeof window !== 'undefined') {
  window.alertsBarComponent = alertsBarComponent;
  window.AlertsBarComponent = AlertsBarComponent;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { AlertsBarComponent };
}
