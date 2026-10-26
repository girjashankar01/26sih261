/**
 * AICTE Application Validation Platform — Application Detail Workspace & Tab Manager
 * Spec Reference: ROADMAP.md (Phase 4: Step 19), Guide §11.7, §17.1
 *
 * Responsibilities:
 * 1. Build and manage application detail container with top metadata card and 6 navigation tabs:
 *    - Checklist Transparency (#tab-checklist)
 *    - Documents & Vault (#tab-documents)
 *    - Evidence & Findings (#tab-evidence)
 *    - Issuing Verifications (#tab-verifications)
 *    - Infrastructure Geotags (#tab-infra)
 *    - Officer Actions & Exports (#tab-exports)
 * 2. Handle switching tabs while strictly preserving active application context and loaded aggregates.
 * 3. Synchronize with router (#application/:id) and reactive appState.
 */

const WORKSPACE_TABS = [
  {
    id: 'checklist',
    label: 'Checklist Transparency',
    icon: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>`,
    badgeKey: 'checks'
  },
  {
    id: 'documents',
    label: 'Documents & Vault',
    icon: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>`,
    badgeKey: 'documents'
  },
  {
    id: 'evidence',
    label: 'Evidence & Findings',
    icon: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`,
    badgeKey: 'findings'
  },
  {
    id: 'verifications',
    label: 'Issuing Verifications',
    icon: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`,
    badgeKey: 'verifications'
  },
  {
    id: 'infra',
    label: 'Infrastructure Geotags',
    icon: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>`,
    badgeKey: 'infra'
  },
  {
    id: 'exports',
    label: 'Officer Actions & Exports',
    icon: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`,
    badgeKey: null
  }
];

class WorkspaceComponent {
  constructor() {
    this.tabs = WORKSPACE_TABS;
    this.currentAppId = null;
    this.currentAggregate = null;
    this.activeTab = 'checklist';
    this.isInitialized = false;

    if (typeof window !== 'undefined' && typeof document !== 'undefined') {
      if (document.readyState === 'loading' && typeof document.addEventListener === 'function') {
        document.addEventListener('DOMContentLoaded', () => this.init());
      } else {
        this.init();
      }
    }
  }

  /**
   * Initialize workspace component and event subscribers
   */
  init() {
    if (this.isInitialized) return;

    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      // 1. Listen for card selection from Queue View
      window.addEventListener('app:application-selected', (e) => {
        if (e.detail && e.detail.applicationId) {
          this.loadApplication(e.detail.applicationId, e.detail.aggregate);
        }
      });

      // 2. Listen for route transitions (#application/:id or #workspace)
      window.addEventListener('app:route-change', (e) => {
        if (e.detail) {
          const { route, params, viewId } = e.detail;
          if (params && params.id) {
            const requestedTab = params.tab || this.activeTab;
            this.loadApplication(params.id, null, requestedTab);
          } else if (viewId === 'view-workspace' && !this.currentAppId) {
            const stateAppId = (window.appState && typeof window.appState.get === 'function')
              ? window.appState.get('selectedAppId')
              : null;
            if (stateAppId) {
              this.loadApplication(stateAppId);
            } else {
              this.renderEmptyState();
            }
          }
        }
      });
    }

    this.isInitialized = true;
  }

  /**
   * Load an application into workspace, fetching its aggregate and rendering tabs (Step 19)
   */
  async loadApplication(appId, agg = null, initialTab = null) {
    if (!appId) return null;

    this.currentAppId = appId;
    if (initialTab && this.tabs.some(t => t.id === initialTab)) {
      this.activeTab = initialTab;
    }

    // Set aggregate if provided, otherwise fetch via ApiClient
    if (agg) {
      this.currentAggregate = agg;
    } else {
      try {
        const client = (typeof window !== 'undefined' && window.apiClient)
          ? window.apiClient
          : (typeof ApiClient !== 'undefined' ? new ApiClient() : null);

        if (client && typeof client.getApplicationAggregate === 'function') {
          this.currentAggregate = await client.getApplicationAggregate(appId);
        } else if (client && typeof client.getDemoValidation === 'function') {
          const val = await client.getDemoValidation(appId);
          this.currentAggregate = {
            application_id: appId,
            workflow_status: val.workflow || 'NEEDS_RECTIFICATION',
            review_lane: val.findings && val.findings.length > 0 ? 'NEEDS_SCRUTINY' : 'FAST_REVIEW',
            findings: val.findings || [],
            checks: val.checks || [],
            priority: { score: val.findings ? val.findings.length * 100 : 0 }
          };
        }
      } catch (err) {
        console.warn(`[Workspace] Could not fetch aggregate for ${appId}:`, err);
      }
    }

    // Fetch S7 facts for header card if available
    try {
      const client = (typeof window !== 'undefined' && (window.apiClient || window.api)) ? (window.apiClient || window.api) : null;
      if (client && typeof client.getApplicationFacts === 'function') {
        this.currentFacts = await client.getApplicationFacts(appId);
      }
      if (client && typeof client.getDocuments === 'function') {
        const docsRes = await client.getDocuments(appId);
        if (docsRes && Array.isArray(docsRes.documents)) {
          this.currentDocuments = docsRes.documents;
        }
      }
    } catch (_) {}

    // Synchronize global reactive state
    if (typeof window !== 'undefined' && window.appState && typeof window.appState.setSelectedApp === 'function') {
      window.appState.setSelectedApp(appId, this.currentAggregate);
    }

    // Render workspace shell into DOM
    this.renderWorkspace();

    // Trigger tab-specific loaders
    if (this.activeTab === 'documents' && typeof window !== 'undefined' && window.documentListComponent) {
      if (typeof window.documentListComponent.loadDocuments === 'function') {
        window.documentListComponent.loadDocuments(appId);
      } else if (typeof window.documentListComponent.loadApplicationDocuments === 'function') {
        window.documentListComponent.loadApplicationDocuments(appId);
      }
    }
    if (this.activeTab === 'checklist' && typeof window !== 'undefined' && window.checklistTableComponent) {
      window.checklistTableComponent.loadAndRender(appId, 'workspace-checklist-content');
    }
    if (this.activeTab === 'evidence' && typeof window !== 'undefined' && window.evidenceViewerComponent) {
      window.evidenceViewerComponent.loadAndRender(appId, 'workspace-evidence-content');
    }
    if (this.activeTab === 'verifications' && typeof window !== 'undefined' && window.verificationPanelComponent) {
      window.verificationPanelComponent.loadAndRender(appId, 'workspace-verifications-content');
    }
    if (this.activeTab === 'infra' && typeof window !== 'undefined' && window.infraPanelComponent) {
      window.infraPanelComponent.loadAndRender(appId, 'workspace-infra-content');
    }

    // Dispatch custom DOM event
    if (typeof window !== 'undefined' && typeof CustomEvent !== 'undefined' && typeof window.dispatchEvent === 'function') {
      window.dispatchEvent(new CustomEvent('app:workspace-loaded', {
        detail: {
          applicationId: appId,
          activeTab: this.activeTab,
          aggregate: this.currentAggregate
        }
      }));
    }

    return this.currentAggregate;
  }

  /**
   * Switch visible tab while strictly preserving active application context (Step 19)
   */
  switchTab(tabId) {
    if (!this.tabs.some(t => t.id === tabId)) return;

    this.activeTab = tabId;

    if (typeof document !== 'undefined') {
      // 1. Update tab navigation buttons active state
      const tabButtons = document.querySelectorAll('.workspace-tab-btn');
      tabButtons.forEach(btn => {
        if (btn.dataset.tab === tabId) {
          btn.classList.add('active');
          btn.setAttribute('aria-selected', 'true');
        } else {
          btn.classList.remove('active');
          btn.setAttribute('aria-selected', 'false');
        }
      });

      // 2. Toggle visibility of workspace tab panels
      const tabPanes = document.querySelectorAll('.workspace-tab-pane');
      tabPanes.forEach(pane => {
        if (pane.id === `workspace-pane-${tabId}`) {
          pane.classList.remove('hidden');
        } else {
          pane.classList.add('hidden');
        }
      });
    }

    // 3. Trigger tab-specific loader
    if (tabId === 'documents' && this.currentAppId && typeof window !== 'undefined' && window.documentListComponent) {
      if (typeof window.documentListComponent.loadDocuments === 'function') {
        window.documentListComponent.loadDocuments(this.currentAppId);
      } else if (typeof window.documentListComponent.loadApplicationDocuments === 'function') {
        window.documentListComponent.loadApplicationDocuments(this.currentAppId);
      }
    }
    if (tabId === 'checklist' && this.currentAppId && typeof window !== 'undefined' && window.checklistTableComponent) {
      window.checklistTableComponent.loadAndRender(this.currentAppId, 'workspace-checklist-content');
    }
    if (tabId === 'evidence' && this.currentAppId && typeof window !== 'undefined' && window.evidenceViewerComponent) {
      window.evidenceViewerComponent.loadAndRender(this.currentAppId, 'workspace-evidence-content');
    }
    if (tabId === 'verifications' && this.currentAppId && typeof window !== 'undefined' && window.verificationPanelComponent) {
      window.verificationPanelComponent.loadAndRender(this.currentAppId, 'workspace-verifications-content');
    }
    if (tabId === 'infra' && this.currentAppId && typeof window !== 'undefined' && window.infraPanelComponent) {
      window.infraPanelComponent.loadAndRender(this.currentAppId, 'workspace-infra-content');
    }
    if (tabId === 'exports' && this.currentAppId && typeof window !== 'undefined' && window.exportsHubComponent) {
      window.exportsHubComponent.loadAndRender(this.currentAppId, 'workspace-exports-content');
    }

    // 4. Dispatch custom DOM event
    if (typeof window !== 'undefined' && typeof CustomEvent !== 'undefined' && typeof window.dispatchEvent === 'function') {
      window.dispatchEvent(new CustomEvent('app:workspace-tab-changed', {
        detail: {
          applicationId: this.currentAppId,
          tabId: tabId
        }
      }));
    }
  }

  /**
   * Extract tab count badges from aggregate data
   */
  getTabCounts() {
    const agg = this.currentAggregate || {};
    return {
      checks: (agg.checks || []).length,
      documents: (agg.documents || []).length || 2,
      findings: (agg.findings || []).length,
      verifications: (agg.verifications || []).length,
      infra: (agg.infra_checklist || []).length
    };
  }

  /**
   * Render complete workspace DOM structure (Step 19)
   */
  renderWorkspace(container = null) {
    let targetEl = null;
    if (typeof document !== 'undefined') {
      targetEl = typeof container === 'string'
        ? document.getElementById(container)
        : (container || document.getElementById('workspace-root'));
    }

    const appId = this.currentAppId || 'DEMO-APP';
    const agg = this.currentAggregate || {};
    const counts = this.getTabCounts();

    const workflowStatus = agg.workflow_status
      ? String(agg.workflow_status).replace(/_/g, ' ')
      : 'EVALUATION IN PROGRESS';

    // 1. Top Metadata Header Container (Step 19 & Step 20)
    let headerHtml = '';
    if (typeof window !== 'undefined' && window.applicationHeaderComponent && typeof window.applicationHeaderComponent.render === 'function') {
      headerHtml = `<div id="workspace-header-container" style="margin-bottom: var(--space-4);">${window.applicationHeaderComponent.render(appId, this.currentFacts, agg)}</div>`;
    } else {
      headerHtml = `
        <div id="workspace-header-container" class="workspace-metadata-card" style="margin-bottom: var(--space-4);">
          <div class="flex items-center justify-between" style="gap: var(--space-3); flex-wrap: wrap;">
            <div>
              <div style="display: flex; align-items: center; gap: var(--space-2); margin-bottom: 4px;">
                <span class="badge badge-outline text-xs" style="font-family: var(--font-mono);">${appId}</span>
                <span class="badge ${agg.findings && agg.findings.length > 0 ? 'badge-fail' : 'badge-pass'} text-xs">
                  ${workflowStatus}
                </span>
              </div>
              <h2 id="workspace-app-title" style="margin: 0; font-size: var(--font-size-xl); color: var(--text-main);">
                ${agg.institution_name || (appId === 'DEMO-ISSUES-001' ? 'Apex Institute of Technology & Management' : 'Autonomous Technical Institution')}
              </h2>
              <p id="workspace-app-subtitle" class="text-muted text-xs" style="margin: 4px 0 0 0;">
                AICTE ID: <span class="font-mono text-main">${agg.aicte_id || '1-10998877'}</span> ·
                Category: <span class="font-mono">${agg.category || 'EOA_RENEWAL'}</span> ·
                Academic Year: <span class="font-mono">2026-2027</span>
              </p>
            </div>
            <div style="display: flex; align-items: center; gap: var(--space-2);">
              <a href="#queue" class="btn btn-outline btn-sm">
                &larr; Return to Queue
              </a>
              <button class="btn btn-primary btn-sm" onclick="window.workspaceComponent && window.workspaceComponent.switchTab('exports')">
                Officer Actions
              </button>
            </div>
          </div>
        </div>
      `;
    }

    // 2. High-Severity Alerts Container (Step 19 & Step 22)
    let alertsHtml = '<div id="workspace-alerts-container" style="margin-bottom: var(--space-4);">';
    if (typeof window !== 'undefined' && window.alertsBarComponent && typeof window.alertsBarComponent.render === 'function') {
      alertsHtml += window.alertsBarComponent.render(appId, agg.alerts || []);
    }
    alertsHtml += '</div>';

    // 3. 6 Navigation Tabs Bar (Step 19)
    const tabsNavHtml = `
      <nav class="workspace-tabs-bar" role="tablist" aria-label="Application Workspace Sections">
        ${this.tabs.map(tab => {
          const isActive = tab.id === this.activeTab;
          const count = tab.badgeKey ? counts[tab.badgeKey] : null;
          const countBadge = (count !== null && count !== undefined)
            ? `<span class="workspace-tab-count">${count}</span>`
            : '';

          return `
            <button class="workspace-tab-btn ${isActive ? 'active' : ''}"
                    id="tab-btn-${tab.id}"
                    data-tab="${tab.id}"
                    onclick="window.workspaceComponent.switchTab('${tab.id}')"
                    role="tab"
                    aria-selected="${isActive ? 'true' : 'false'}"
                    aria-controls="workspace-pane-${tab.id}">
              ${tab.icon}
              <span>${tab.label}</span>
              ${countBadge}
            </button>
          `;
        }).join('')}
      </nav>
    `;

    // 4. Six Tab Panes (Step 19)
    const panesHtml = `
      <!-- Tab Pane 1: Checklist Transparency (Step 23 & 24) -->
      <section class="workspace-tab-pane ${this.activeTab === 'checklist' ? '' : 'hidden'}"
               id="workspace-pane-checklist"
               role="tabpanel"
               aria-labelledby="tab-btn-checklist">
        <div class="card">
          <div class="card-header">
            <div>
              <h3>Checklist Transparency Table</h3>
              <p class="text-muted text-xs">Deterministic 3-valued regulatory evaluation vs. synthetic AI extractions</p>
            </div>
            <span class="badge badge-pass text-xs">3-Valued Gate Enabled</span>
          </div>
          <div class="card-body" id="workspace-checklist-content">
            ${(typeof window !== 'undefined' && window.checklistTableComponent && (agg.findings || agg.checks))
              ? window.checklistTableComponent.render(appId, agg)
              : '<p class="text-muted text-sm">Regulatory checklist evaluation initialized. Ready for Step 23 interactive matrix.</p>'}
          </div>
        </div>
      </section>

      <!-- Tab Pane 2: Documents & Vault (Step 11 & Step 12) -->
      <section class="workspace-tab-pane ${this.activeTab === 'documents' ? '' : 'hidden'}"
               id="workspace-pane-documents"
               role="tabpanel"
               aria-labelledby="tab-btn-documents">
        <div class="card">
          <div class="card-header">
            <div>
              <h3>Content-Addressed Document Vault (S1 Ingest)</h3>
              <p class="text-muted text-xs">Cryptographic verification with dual BLAKE3 + SHA-256 digests and S3 routing analysis</p>
            </div>
            <button class="btn btn-primary btn-sm" onclick="window.uploadModalComponent && window.uploadModalComponent.open()">
              + Upload Document
            </button>
          </div>
          <div class="card-body">
            <div id="workspace-documents-container">
              <p class="text-muted text-sm">Loading vault documents…</p>
            </div>
          </div>
        </div>
      </section>

      <!-- Tab Pane 3: Evidence & Findings (Phase 5) -->
      <section class="workspace-tab-pane ${this.activeTab === 'evidence' ? '' : 'hidden'}"
               id="workspace-pane-evidence"
               role="tabpanel"
               aria-labelledby="tab-btn-evidence">
        <div class="card">
          <div class="card-header">
            <div>
              <h3>Evidence Viewer & Findings Console</h3>
              <p class="text-muted text-xs">Two-sided discrepancy viewer with side-by-side coordinate bounding box overlays</p>
            </div>
          </div>
          <div class="card-body" id="workspace-evidence-content" style="padding: 0;">
            ${(typeof window !== 'undefined' && window.evidenceViewerComponent)
              ? window.evidenceViewerComponent.render(appId, this.currentAggregate, this.currentDocuments || [])
              : '<p class="text-muted text-sm" style="padding: var(--space-4);">Findings viewer container initialized. Ready for Phase 5 coordinate inspection.</p>'}
          </div>
        </div>
      </section>

      <!-- Tab Pane 4: Issuing Verifications (Phase 6) -->
      <section class="workspace-tab-pane ${this.activeTab === 'verifications' ? '' : 'hidden'}"
               id="workspace-pane-verifications"
               role="tabpanel"
               aria-labelledby="tab-btn-verifications">
        <div class="card">
          <div class="card-header">
            <div>
              <h3>Issuing Authority Verification Gateway (S9)</h3>
              <p class="text-muted text-xs">Real X.509 signatures, Fire NOC QR verification, and simulated authority adapters</p>
            </div>
          </div>
          <div class="card-body" id="workspace-verifications-content" style="padding: 0;">
            ${(typeof window !== 'undefined' && window.verificationPanelComponent)
              ? window.verificationPanelComponent.render(appId, this.currentAggregate)
              : '<p class="text-muted text-sm" style="padding: var(--space-4);">Verification gateway initialized. Ready for Phase 6 issuer status inspection.</p>'}
          </div>
        </div>
      </section>

      <!-- Tab Pane 5: Infrastructure Geotags (Phase 7) -->
      <section class="workspace-tab-pane ${this.activeTab === 'infra' ? '' : 'hidden'}"
               id="workspace-pane-infra"
               role="tabpanel"
               aria-labelledby="tab-btn-infra">
        <div class="card">
          <div class="card-header">
            <div>
              <h3>Infrastructure Evidence & Land Geotags (S10)</h3>
              <p class="text-muted text-xs">Geodesic distance checks, EXIF coordinate verification, and reverse geocoding</p>
            </div>
          </div>
          <div class="card-body" id="workspace-infra-content" style="padding: 0;">
            ${(typeof window !== 'undefined' && window.infraPanelComponent)
              ? window.infraPanelComponent.render(appId)
              : '<p class="text-muted text-sm" style="padding: var(--space-4);">Infrastructure geotags console initialized. Ready for Phase 7 mapping.</p>'}
          </div>
        </div>
      </section>

      <!-- Tab Pane 6: Officer Actions & Exports (Phase 8) -->
      <section class="workspace-tab-pane ${this.activeTab === 'exports' ? '' : 'hidden'}"
               id="workspace-pane-exports"
               role="tabpanel"
               aria-labelledby="tab-btn-exports">
        <div class="card">
          <div class="card-header">
            <div>
              <h3>Officer Decision Support & Export Center</h3>
              <p class="text-muted text-xs">Deficiency notice generator, ground inspection briefs, and evaluation reports</p>
            </div>
          </div>
          <div class="card-body" id="workspace-exports-content" style="padding: 0;">
            ${(typeof window !== 'undefined' && window.exportsHubComponent)
              ? window.exportsHubComponent.render(appId)
              : '<p class="text-muted text-sm" style="padding: var(--space-4);">Export generator initialized. Ready for Phase 8 notice templates.</p>'}
          </div>
        </div>
      </section>
    `;

    const fullWorkspaceHtml = `
      <div class="workspace-layout">
        ${headerHtml}
        ${alertsHtml}
        ${tabsNavHtml}
        <div class="workspace-tab-content">
          ${panesHtml}
        </div>
      </div>
    `;

    if (targetEl) {
      targetEl.innerHTML = fullWorkspaceHtml;
    }

    return fullWorkspaceHtml;
  }

  /**
   * Render friendly empty state when no application has been selected
   */
  renderEmptyState(container = null) {
    let targetEl = null;
    if (typeof document !== 'undefined') {
      targetEl = typeof container === 'string'
        ? document.getElementById(container)
        : (container || document.getElementById('workspace-root'));
    }

    const html = `
      <div class="workspace-empty-state">
        <svg class="workspace-empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14 2 14 8 20 8"/>
          <line x1="16" y1="13" x2="8" y2="13"/>
          <line x1="16" y1="17" x2="8" y2="17"/>
        </svg>
        <h3 style="margin: 0; color: var(--text-main);">No Application Selected</h3>
        <p class="text-muted text-sm" style="max-width: 440px; margin: var(--space-1) 0 var(--space-4) 0;">
          Select an application bundle from the Priority Queue Dashboard to inspect its evaluation checklists, evidence documents, and issuing authority verifications.
        </p>
        <a href="#queue" class="btn btn-primary btn-sm">
          Go to Queue Dashboard
        </a>
      </div>
    `;

    if (targetEl) {
      targetEl.innerHTML = html;
    }

    return html;
  }
}

// Singleton instantiation
const workspaceComponent = new WorkspaceComponent();
if (typeof window !== 'undefined') {
  window.workspaceComponent = workspaceComponent;
  window.WorkspaceComponent = WorkspaceComponent;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { WorkspaceComponent, WORKSPACE_TABS };
}
