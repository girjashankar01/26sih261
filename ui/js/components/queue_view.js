/**
 * AICTE Application Validation Platform — Officer Queue & Triage Dashboard Component
 * Spec Reference: ROADMAP.md (Phase 3: Steps 13–18), Guide §11.7, §17.1
 *
 * Responsibilities:
 * 1. Load application bundles and aggregated review lanes (GET /api/demo/applications, S11 aggregate).
 * 2. Calculate and render top KPI metrics bar:
 *    - Total Active Applications in Queue
 *    - Critical Discrepancies (NEEDS_SCRUTINY)
 *    - Pending Issuer Verifications (NEEDS_VERIFICATION)
 *    - Fast Review Eligible (FAST_REVIEW)
 * 3. Keep global state synchronized with active queue metrics.
 */

const REVIEW_LANES = {
  NEEDS_SCRUTINY: {
    id: 'NEEDS_SCRUTINY',
    title: 'Needs Scrutiny',
    cssClass: 'lane-scrutiny-col',
    accentColor: 'var(--lane-scrutiny)',
    badgeClass: 'badge-fail',
    description: 'Critical discrepancies, high-severity findings, unclassified docs, or policy violations.'
  },
  NEEDS_VERIFICATION: {
    id: 'NEEDS_VERIFICATION',
    title: 'Needs Verification',
    cssClass: 'lane-verification-col',
    accentColor: 'var(--lane-verification)',
    badgeClass: 'badge-warn',
    description: 'Pending issuing authority verifications, source outage, or QR code mismatch.'
  },
  NEEDS_EVIDENCE: {
    id: 'NEEDS_EVIDENCE',
    title: 'Needs Evidence',
    cssClass: 'lane-evidence-col',
    accentColor: 'var(--lane-evidence)',
    badgeClass: 'badge-outline',
    description: 'Missing infrastructure photos, insufficient floor plans, or unverified physical norms.'
  },
  FAST_REVIEW: {
    id: 'FAST_REVIEW',
    title: 'Fast Review',
    cssClass: 'lane-fast-col',
    accentColor: 'var(--lane-fast)',
    badgeClass: 'badge-pass',
    description: 'All mandatory checks pass and verifications confirmed. Eligible for expedited signoff.'
  }
};

class QueueViewComponent {
  constructor() {
    this.lanes = REVIEW_LANES;
    this.applications = [];
    this.aggregates = new Map(); // appId -> aggregate payload
    this.kpi = {
      total: 0,
      critical: 0,
      verification: 0,
      fastReview: 0
    };
    this.filters = {
      searchQuery: '',
      category: 'ALL',
      sortBy: 'priority_desc'
    };
    this.isLoading = false;
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
   * Initialize queue view and bind route changes
   */
  init() {
    if (this.isInitialized) return;

    // Load initial queue data
    this.loadQueueData().catch(err => {
      console.warn('[QueueView] Error in initial queue load:', err);
    });

    // Re-sync on route change to #queue
    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      window.addEventListener('app:route-change', (e) => {
        if (e.detail && (e.detail.route === '#queue' || e.detail.viewId === 'view-queue')) {
          this.loadQueueData().catch(() => {});
        }
      });
    }

    this.isInitialized = true;
  }

  /**
   * Fetch applications list and calculate KPI metrics (Step 13)
   */
  async loadQueueData() {
    this.isLoading = true;

    try {
      const client = (typeof window !== 'undefined' && window.apiClient) ? window.apiClient : new ApiClient();
      const res = await client.getDemoApplications();
      this.applications = res.items || [];

      // Fetch or compute aggregation for each application
      for (const app of this.applications) {
        try {
          let agg = null;
          if (typeof client.getApplicationAggregate === 'function') {
            try {
              agg = await client.getApplicationAggregate(app.id);
            } catch (_) {}
          }
          if (!agg && typeof client.getDemoValidation === 'function') {
            const val = await client.getDemoValidation(app.id);
            // Map validation response to aggregate shape
            agg = {
              application_id: app.id,
              workflow_status: val.workflow,
              review_lane: val.findings && val.findings.length > 0 ? 'NEEDS_SCRUTINY' : 'FAST_REVIEW',
              findings: val.findings || [],
              checks: val.checks || [],
              priority: { score: val.findings ? val.findings.length * 100 : 0 }
            };
          }
          if (agg) {
            this.aggregates.set(app.id, agg);
          }
        } catch (aggErr) {
          console.warn(`Could not load aggregate for ${app.id}:`, aggErr);
        }
      }

      // Calculate KPI metrics across applications
      this.calculateKpiMetrics();

      // Render KPI Counter Bar into DOM
      this.renderKpiBar();

      // Render Filter, Search & Sort Toolbar (Step 18)
      this.renderFilterToolbar();

      // Render 4-Lane Triage Board into DOM (Step 14)
      this.renderTriageBoard();

      // Synchronize applications into global reactive state
      if (typeof window !== 'undefined' && window.appState) {
        window.appState.setState('applications', this.applications);
      }

      // Dispatch custom DOM event
      if (typeof window !== 'undefined' && typeof CustomEvent !== 'undefined' && typeof window.dispatchEvent === 'function') {
        window.dispatchEvent(new CustomEvent('app:queue-loaded', {
          detail: {
            applications: this.applications,
            kpi: this.kpi,
            aggregates: Array.from(this.aggregates.values())
          }
        }));
      }

      return {
        applications: this.applications,
        kpi: this.kpi
      };
    } catch (err) {
      console.error('[QueueView] Failed to load applications:', err);
      return null;
    } finally {
      this.isLoading = false;
    }
  }

  /**
   * Compute KPI counters from applications and aggregates (Step 13)
   */
  calculateKpiMetrics() {
    let total = this.applications.length;
    let critical = 0;
    let verification = 0;
    let fastReview = 0;

    for (const app of this.applications) {
      const agg = this.aggregates.get(app.id);
      if (!agg) {
        // Fallback heuristic based on required docs
        fastReview++;
        continue;
      }

      const lane = agg.review_lane;
      const findings = agg.findings || [];
      const hasHighFindings = findings.some(f => f.severity === 'high' || f.severity === 'critical');
      const hasPendingVerif = (agg.verifications || []).some(v => v.status === 'VERIFICATION_PENDING' || v.status === 'SOURCE_UNAVAILABLE');

      if (lane === 'NEEDS_SCRUTINY' || hasHighFindings) {
        critical++;
      } else if (lane === 'NEEDS_VERIFICATION' || hasPendingVerif) {
        verification++;
      } else if (lane === 'FAST_REVIEW' || agg.workflow_status === 'VALIDATED_NO_ISSUES' || findings.length === 0) {
        fastReview++;
      } else {
        critical++;
      }
    }

    this.kpi = {
      total,
      critical,
      verification,
      fastReview
    };

    return this.kpi;
  }

  /**
   * Render top KPI Metrics Counter Bar into DOM (Step 13)
   */
  renderKpiBar(container = null) {
    let targetEl = null;
    if (typeof document !== 'undefined') {
      targetEl = typeof container === 'string'
        ? document.getElementById(container)
        : (container || document.getElementById('queue-kpi-bar'));
    }

    const html = `
      <div class="queue-kpi-grid" style="margin-bottom: var(--space-4);">
        <!-- KPI 1: Total Active Applications -->
        <div class="kpi-card kpi-total">
          <div class="kpi-header">
            <span class="kpi-label">Total Active Queue</span>
            <span class="badge badge-outline kpi-badge">SLA Monitored</span>
          </div>
          <div class="kpi-value" id="kpi-val-total">${this.kpi.total}</div>
          <div class="kpi-subtext">
            <span>EOA Renewal Priority Queue</span>
          </div>
        </div>

        <!-- KPI 2: Critical Discrepancies -->
        <div class="kpi-card kpi-critical">
          <div class="kpi-header">
            <span class="kpi-label">Needs Scrutiny</span>
            <span class="badge badge-fail kpi-badge">Urgent</span>
          </div>
          <div class="kpi-value" id="kpi-val-critical">${this.kpi.critical}</div>
          <div class="kpi-subtext">
            <span>High-severity findings & norm blockers</span>
          </div>
        </div>

        <!-- KPI 3: Pending Issuer Verifications -->
        <div class="kpi-card kpi-verification">
          <div class="kpi-header">
            <span class="kpi-label">Needs Verification</span>
            <span class="badge badge-warn kpi-badge">Gate Blocked</span>
          </div>
          <div class="kpi-value" id="kpi-val-verification">${this.kpi.verification}</div>
          <div class="kpi-subtext">
            <span>Third-party authority verification pending</span>
          </div>
        </div>

        <!-- KPI 4: Fast Review Eligible -->
        <div class="kpi-card kpi-fast">
          <div class="kpi-header">
            <span class="kpi-label">Fast Review Eligible</span>
            <span class="badge badge-pass kpi-badge">Ready</span>
          </div>
          <div class="kpi-value" id="kpi-val-fast">${this.kpi.fastReview}</div>
          <div class="kpi-subtext">
            <span>Clean documentation ready for signoff</span>
          </div>
        </div>
      </div>
    `;

    if (targetEl) {
      targetEl.innerHTML = html;
    }

    return html;
  }

  /**
   * Determine review lane for an application (Step 14, Guide §11.7)
   */
  getLaneForApplication(app) {
    const agg = this.aggregates.get(app.id);
    if (agg && agg.review_lane && this.lanes[agg.review_lane]) {
      return agg.review_lane;
    }

    // Deterministic fallback based on aggregate findings/status
    if (agg) {
      const findings = agg.findings || [];
      const hasHighFindings = findings.some(f => f.severity === 'high' || f.severity === 'critical');
      const hasPendingVerif = (agg.verifications || []).some(v => v.status === 'VERIFICATION_PENDING' || v.status === 'SOURCE_UNAVAILABLE');
      const hasMissingInfra = (agg.infra_checklist || []).some(i => i.status === 'ADDITIONAL_EVIDENCE_REQUIRED');

      if (hasHighFindings || (agg.checks && agg.checks.some(c => c.result === 'FAILED_CHECK'))) {
        return 'NEEDS_SCRUTINY';
      }
      if (hasPendingVerif) {
        return 'NEEDS_VERIFICATION';
      }
      if (hasMissingInfra) {
        return 'NEEDS_EVIDENCE';
      }
      if (agg.workflow_status === 'VALIDATED_NO_ISSUES' || findings.length === 0) {
        return 'FAST_REVIEW';
      }
    }

    return 'NEEDS_SCRUTINY';
  }

  /**
   * Filter and sort applications based on active filter state (Step 18)
   */
  getFilteredAndSortedApplications() {
    let list = [...this.applications];

    // 1. Text Search Filter (matches Institute Name, AICTE ID, or Application ID)
    const query = (this.filters.searchQuery || '').trim().toLowerCase();
    if (query) {
      list = list.filter(app => {
        const idMatch = (app.id || '').toLowerCase().includes(query);
        const nameMatch = (app.institution_name || '').toLowerCase().includes(query);
        const aicteIdMatch = (app.aicte_id || '').toLowerCase().includes(query);
        return idMatch || nameMatch || aicteIdMatch;
      });
    }

    // 2. Regulatory Category Dropdown Filter
    if (this.filters.category && this.filters.category !== 'ALL') {
      const catFilter = this.filters.category.toUpperCase();
      list = list.filter(app => {
        const cat = (app.category || '').toUpperCase();
        return cat === catFilter;
      });
    }

    // 3. Sorting Engine
    const sortBy = this.filters.sortBy || 'priority_desc';
    list.sort((a, b) => {
      const aggA = this.aggregates.get(a.id);
      const aggB = this.aggregates.get(b.id);

      if (sortBy === 'priority_desc') {
        const scoreA = (aggA && aggA.priority && typeof aggA.priority.score === 'number')
          ? aggA.priority.score
          : (aggA && aggA.findings ? aggA.findings.length * 100 : 0);
        const scoreB = (aggB && aggB.priority && typeof aggB.priority.score === 'number')
          ? aggB.priority.score
          : (aggB && aggB.findings ? aggB.findings.length * 100 : 0);
        return scoreB - scoreA; // descending
      }

      if (sortBy === 'sla_asc') {
        // SLA pressure ascending: fewest days remaining (most urgent cutoff) first
        const cardComp = (typeof window !== 'undefined' && window.queueCardComponent)
          ? window.queueCardComponent
          : (typeof QueueCardComponent !== 'undefined' ? new QueueCardComponent() : null);
        const daysA = cardComp ? cardComp.calculateSlaDeadline(a.submitted_on).daysRemaining : 14;
        const daysB = cardComp ? cardComp.calculateSlaDeadline(b.submitted_on).daysRemaining : 14;
        return daysA - daysB; // ascending
      }

      if (sortBy === 'date_desc') {
        const dateA = new Date(a.submitted_on || '1970-01-01');
        const dateB = new Date(b.submitted_on || '1970-01-01');
        return dateB - dateA; // newest first
      }

      if (sortBy === 'date_asc') {
        const dateA = new Date(a.submitted_on || '1970-01-01');
        const dateB = new Date(b.submitted_on || '1970-01-01');
        return dateA - dateB; // oldest first
      }

      return 0;
    });

    return list;
  }

  /**
   * Set text search query filter (Step 18)
   */
  setSearchQuery(query) {
    this.filters.searchQuery = query || '';
    return this.applyFiltersAndSort();
  }

  /**
   * Set category dropdown filter (Step 18)
   */
  setCategoryFilter(category) {
    this.filters.category = category || 'ALL';
    return this.applyFiltersAndSort();
  }

  /**
   * Set sort criteria (Step 18)
   */
  setSortBy(sortBy) {
    this.filters.sortBy = sortBy || 'priority_desc';
    return this.applyFiltersAndSort();
  }

  /**
   * Reset all search, category, and sort filters to defaults (Step 18)
   */
  resetFilters() {
    this.filters.searchQuery = '';
    this.filters.category = 'ALL';
    this.filters.sortBy = 'priority_desc';

    if (typeof document !== 'undefined') {
      const searchInput = document.getElementById('queue-search-input');
      if (searchInput) searchInput.value = '';
      const catSelect = document.getElementById('queue-category-select');
      if (catSelect) catSelect.value = 'ALL';
      const sortSelect = document.getElementById('queue-sort-select');
      if (sortSelect) sortSelect.value = 'priority_desc';
    }

    return this.applyFiltersAndSort();
  }

  /**
   * Apply current filters, update triage board, and notify DOM (Step 18)
   */
  applyFiltersAndSort() {
    const filteredApps = this.getFilteredAndSortedApplications();

    // Re-render triage board with filtered results
    this.renderTriageBoard();

    // Update filter count badge if in browser
    if (typeof document !== 'undefined') {
      const countEl = document.getElementById('queue-filter-count');
      if (countEl) {
        const total = this.applications.length;
        const filtered = filteredApps.length;
        countEl.textContent = filtered === total
          ? `Showing ${total} of ${total}`
          : `Showing ${filtered} of ${total} (Filtered)`;
      }
    }

    // Dispatch DOM event for reactive notification & test assertions
    if (typeof window !== 'undefined' && typeof CustomEvent !== 'undefined' && typeof window.dispatchEvent === 'function') {
      window.dispatchEvent(new CustomEvent('app:queue-filtered', {
        detail: {
          filters: { ...this.filters },
          filteredCount: filteredApps.length,
          totalCount: this.applications.length,
          applications: filteredApps
        }
      }));
    }

    return filteredApps;
  }

  /**
   * Render Filter, Search & Sorting Toolbar Widget into DOM (Step 18)
   */
  renderFilterToolbar(container = null) {
    let targetEl = null;
    if (typeof document !== 'undefined') {
      targetEl = typeof container === 'string'
        ? document.getElementById(container)
        : (container || document.getElementById('queue-filter-toolbar'));
    }

    const total = this.applications.length;
    const filtered = this.getFilteredAndSortedApplications().length;
    const countText = filtered === total ? `Showing ${total} of ${total}` : `Showing ${filtered} of ${total} (Filtered)`;

    const html = `
      <div class="queue-toolbar" id="queue-toolbar-widget">
        <!-- Search Input -->
        <div class="queue-search-box">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="queue-search-icon">
            <circle cx="11" cy="11" r="8"/>
            <line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input type="text"
                 id="queue-search-input"
                 class="input queue-search-input"
                 placeholder="Search by Institution Name or Application ID (e.g. Apex, DEMO)..."
                 value="${this.filters.searchQuery}"
                 aria-label="Search Applications">
        </div>

        <!-- Filter & Sort Controls -->
        <div class="queue-filter-controls">
          <!-- Category Filter -->
          <div class="queue-filter-group">
            <label for="queue-category-select" class="text-xs text-muted">Category:</label>
            <select id="queue-category-select" class="select select-sm" aria-label="Filter by Category">
              <option value="ALL" ${this.filters.category === 'ALL' ? 'selected' : ''}>All Categories</option>
              <option value="EOA_RENEWAL" ${this.filters.category === 'EOA_RENEWAL' ? 'selected' : ''}>EoA Renewal</option>
              <option value="NEW_INSTITUTION" ${this.filters.category === 'NEW_INSTITUTION' ? 'selected' : ''}>New Institution</option>
            </select>
          </div>

          <!-- Sort By Selector -->
          <div class="queue-filter-group">
            <label for="queue-sort-select" class="text-xs text-muted">Sort By:</label>
            <select id="queue-sort-select" class="select select-sm" aria-label="Sort Applications">
              <option value="priority_desc" ${this.filters.sortBy === 'priority_desc' ? 'selected' : ''}>Priority Score (Highest First)</option>
              <option value="sla_asc" ${this.filters.sortBy === 'sla_asc' ? 'selected' : ''}>SLA Pressure (Urgent First)</option>
              <option value="date_desc" ${this.filters.sortBy === 'date_desc' ? 'selected' : ''}>Submission Date (Newest First)</option>
              <option value="date_asc" ${this.filters.sortBy === 'date_asc' ? 'selected' : ''}>Submission Date (Oldest First)</option>
            </select>
          </div>

          <!-- Reset / Clear Button -->
          <button id="queue-filter-reset-btn" class="btn btn-outline btn-sm" title="Reset all filters">
            Reset
          </button>
        </div>

        <!-- Filtered Count Badge -->
        <div class="queue-filter-count" id="queue-filter-count">
          ${countText}
        </div>
      </div>
    `;

    if (targetEl) {
      targetEl.innerHTML = html;
      this.attachToolbarEventListeners(targetEl);
    }

    return html;
  }

  /**
   * Bind DOM event listeners to toolbar controls (Step 18)
   */
  attachToolbarEventListeners(container) {
    if (!container || typeof container.querySelector !== 'function') return;

    const searchInput = container.querySelector('#queue-search-input');
    if (searchInput && typeof searchInput.addEventListener === 'function') {
      searchInput.addEventListener('input', (e) => {
        this.setSearchQuery(e.target.value);
      });
    }

    const catSelect = container.querySelector('#queue-category-select');
    if (catSelect && typeof catSelect.addEventListener === 'function') {
      catSelect.addEventListener('change', (e) => {
        this.setCategoryFilter(e.target.value);
      });
    }

    const sortSelect = container.querySelector('#queue-sort-select');
    if (sortSelect && typeof sortSelect.addEventListener === 'function') {
      sortSelect.addEventListener('change', (e) => {
        this.setSortBy(e.target.value);
      });
    }

    const resetBtn = container.querySelector('#queue-filter-reset-btn');
    if (resetBtn && typeof resetBtn.addEventListener === 'function') {
      resetBtn.addEventListener('click', () => {
        this.resetFilters();
      });
    }
  }

  /**
   * Partition all loaded applications into the 4 review lanes (Step 14 & Step 18)
   */
  partitionApplicationsByLane(appsList = null) {
    const partitions = {
      NEEDS_SCRUTINY: [],
      NEEDS_VERIFICATION: [],
      NEEDS_EVIDENCE: [],
      FAST_REVIEW: []
    };

    const targetList = appsList || this.getFilteredAndSortedApplications();

    for (const app of targetList) {
      const lane = this.getLaneForApplication(app);
      if (partitions[lane]) {
        partitions[lane].push(app);
      } else {
        partitions.NEEDS_SCRUTINY.push(app);
      }
    }

    return partitions;
  }

  /**
   * Render 4-Lane Triage Board Grid Layout into DOM (Step 14)
   */
  renderTriageBoard(container = null) {
    let targetEl = null;
    if (typeof document !== 'undefined') {
      targetEl = typeof container === 'string'
        ? document.getElementById(container)
        : (container || document.getElementById('queue-triage-board'));
    }

    const partitions = this.partitionApplicationsByLane();
    const laneKeys = ['NEEDS_SCRUTINY', 'NEEDS_VERIFICATION', 'NEEDS_EVIDENCE', 'FAST_REVIEW'];

    const lanesHtml = laneKeys.map(laneKey => {
      const laneMeta = this.lanes[laneKey];
      const appsInLane = partitions[laneKey] || [];
      const count = appsInLane.length;

      let cardsHtml = '';
      if (count === 0) {
        cardsHtml = `
          <div class="triage-lane-empty">
            No applications in this lane
          </div>
        `;
      } else {
        cardsHtml = appsInLane.map(app => {
          const agg = this.aggregates.get(app.id);
          return this.renderQueueCard(app, agg);
        }).join('');
      }

      return `
        <div class="triage-lane-column ${laneMeta.cssClass}" id="lane-col-${laneKey}" data-lane="${laneKey}">
          <div class="triage-lane-header">
            <div>
              <div class="triage-lane-title">
                <span>${laneMeta.title}</span>
                <span class="triage-lane-count">${count}</span>
              </div>
              <div class="triage-lane-desc" style="margin-top: 4px;">${laneMeta.description}</div>
            </div>
          </div>
          <div class="triage-lane-cards" id="lane-cards-${laneKey}">
            ${cardsHtml}
          </div>
        </div>
      `;
    }).join('');

    const boardHtml = `
      <div class="triage-lanes-grid" id="triage-lanes-grid">
        ${lanesHtml}
      </div>
    `;

    if (targetEl) {
      targetEl.innerHTML = boardHtml;
    }

    // Dispatch DOM event for test inspection
    if (typeof window !== 'undefined' && typeof CustomEvent !== 'undefined' && typeof window.dispatchEvent === 'function') {
      window.dispatchEvent(new CustomEvent('app:lanes-rendered', {
        detail: { partitions }
      }));
    }

    return boardHtml;
  }

  /**
   * Card rendering helper for triage columns (delegates to Step 15 QueueCardComponent)
   */
  renderQueueCard(app, agg = null) {
    if (typeof window !== 'undefined' && window.queueCardComponent && typeof window.queueCardComponent.render === 'function') {
      return window.queueCardComponent.render(app, agg);
    }

    const appId = app.id;
    const institutionName = app.institution_name || 'Autonomous Technical Institution';
    const category = (app.category || 'EOA_RENEWAL').replace(/_/g, ' ');
    const submittedOn = app.submitted_on || '2026-10-12';
    const intake = app.requested_intake ? `${app.requested_intake} seats` : 'Standard Intake';

    const score = agg && agg.priority ? agg.priority.score : 0;
    const findingsCount = agg && agg.findings ? agg.findings.length : 0;

    return `
      <div class="card queue-app-card" id="card-${appId}" data-app-id="${appId}" onclick="window.queueViewComponent.selectApplication('${appId}')" style="cursor: pointer; padding: var(--space-4); border: 1px solid var(--border-default); background: var(--bg-surface); transition: all var(--transition-fast);">
        <div class="flex items-center justify-between" style="margin-bottom: var(--space-1);">
          <strong class="font-mono text-sm" style="color: var(--color-primary);">${appId}</strong>
          <span class="badge ${findingsCount > 0 ? 'badge-fail' : 'badge-pass'} text-xs" style="font-size: 10px;">
            ${findingsCount > 0 ? `${findingsCount} findings` : 'Clean'}
          </span>
        </div>
        <div style="font-size: var(--font-size-xs); font-weight: 600; color: var(--text-main); margin-bottom: var(--space-2); line-height: 1.3;">
          ${institutionName}
        </div>
        <div class="text-xs text-muted" style="display: flex; flex-direction: column; gap: 2px;">
          <div class="flex items-center justify-between">
            <span>${category}</span>
            <span class="font-mono">${intake}</span>
          </div>
          <div class="flex items-center justify-between" style="margin-top: 4px; padding-top: 4px; border-top: 1px solid var(--border-subtle);">
            <span>Submitted: ${submittedOn}</span>
            <span class="badge badge-outline text-xs" style="font-size: 10px;">Priority: ${score}</span>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Action trigger when an officer clicks an application card
   */
  selectApplication(appId) {
    if (typeof window !== 'undefined' && window.appState) {
      window.appState.setSelectedApp(appId, this.aggregates.get(appId));
    }
    if (typeof window !== 'undefined' && window.router) {
      window.router.navigate(`#application/${appId}`);
    } else if (typeof window !== 'undefined') {
      window.location.hash = `#application/${appId}`;
    }
    if (typeof window !== 'undefined' && typeof CustomEvent !== 'undefined' && typeof window.dispatchEvent === 'function') {
      window.dispatchEvent(new CustomEvent('app:application-selected', {
        detail: {
          applicationId: appId,
          aggregate: this.aggregates.get(appId)
        }
      }));
    }
  }
}

// Singleton instantiation
const queueViewComponent = new QueueViewComponent();
if (typeof window !== 'undefined') {
  window.queueViewComponent = queueViewComponent;
  window.QueueViewComponent = QueueViewComponent;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { QueueViewComponent };
}
