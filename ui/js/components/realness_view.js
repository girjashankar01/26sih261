/**
 * AICTE Decision Support Prototype - System Realness & Transparency Matrix
 * Step 55: System Realness & Transparency Matrix Page (ui/js/components/realness_view.js)
 * 
 * Honest, audit-ready disclosure of production-grade sovereign engines vs. simulated external integrations
 * conforming to SIH PS 26261 and AGENTS.md non-negotiable transparency directives.
 */

(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.RealnessViewComponent = factory();
    root.realnessViewComponent = new root.RealnessViewComponent();
  }
}(typeof self !== 'undefined' ? self : this, function () {

  // Built-in deterministic manifest matching Prototype Guide §1.4 & backend/api/main.py
  const DEFAULT_REALNESS_MANIFEST = {
    title: "System Realness & Transparency Matrix",
    spec_reference: "SIH PS 26261 & Prototype Guide §1.4",
    air_gapped_sovereign: true,
    external_network_calls: 0,
    summary: {
      total_components: 15,
      real_components: 11,
      simulated_components: 4,
      realness_percentage: 73.3,
      status_label: "AUDIT-READY / 100% TRANSPARENT"
    },
    components: [
      {
        id: "S1",
        name: "Ingestion Gateway & Storage Vault",
        stage: "S1 Ingest",
        category: "DATA_PIPELINE",
        status: "REAL",
        technologies: ["BLAKE3", "SHA-256", "python-multipart", "Content-Addressed Vault"],
        description: "Multi-algorithm cryptographic hashing (BLAKE3 + SHA-256) computed in a single streaming pass. Content-addressed storage preserves immutable raw original files.",
        operational_mode: "Production-grade, deterministic, air-gapped.",
        file_reference: "backend/ingest/service.py, backend/storage/vault.py"
      },
      {
        id: "S2",
        name: "Document Forensics & Signature Verification",
        stage: "S2 Forensics",
        category: "EVIDENCE_FORENSICS",
        status: "REAL",
        technologies: ["pyHanko", "OpenCV", "qreader", "imagehash (DCT pHash)"],
        description: "Validates CMS/PKCS#7 digital signatures, parses PDF structural cross-references, extracts EXIF metadata, and computes 64-bit DCT perceptual hashes.",
        operational_mode: "Production-grade, pure-python & local cryptographic libraries.",
        file_reference: "backend/forensics/signatures.py, backend/forensics/qr.py"
      },
      {
        id: "S3_S4",
        name: "Document Routing & Dual-Tier Text Extraction",
        stage: "S3/S4 Extraction",
        category: "DATA_PIPELINE",
        status: "REAL",
        technologies: ["Docling", "PyMuPDF (fitz)", "Tesseract OCR"],
        description: "Dual-tier Branch A/B routing: digital PDF extraction via Docling with normalized bounding boxes, with graceful local OCR fallback.",
        operational_mode: "Production-grade local extraction models; zero external cloud API calls.",
        file_reference: "backend/pipeline/router.py, backend/extraction/service.py"
      },
      {
        id: "S5",
        name: "Document Typing & Checklist Prior Classifier",
        stage: "S5 Typing",
        category: "REGULATORY_ENGINE",
        status: "REAL",
        technologies: ["Deterministic Keyword Anchoring", "Slot Prior Matrix", "Normalized Bounding Boxes"],
        description: "Classifies document type by anchoring keywords to layout coordinates. Evaluates bounded slot priors and raises DOC_TYPE_SLOT_MISMATCH.",
        operational_mode: "Production-grade deterministic classifier.",
        file_reference: "backend/typing/service.py, backend/typing/rules.py"
      },
      {
        id: "S6",
        name: "Structured Field Extraction & Date Policy",
        stage: "S6 Extraction",
        category: "DATA_PIPELINE",
        status: "REAL",
        technologies: ["Word-Precision Regex", "ISO-8601 Normalization", "Century Ambiguity Rejection"],
        description: "Extracts certificate numbers, dates, and names. Enforces strict 4-digit date policy (YYYY-MM-DD); flags 2-digit ambiguous years as NEEDS_REVIEW.",
        operational_mode: "Production-grade deterministic parsing.",
        file_reference: "backend/extraction/dates.py, backend/extraction/service.py"
      },
      {
        id: "S7",
        name: "Typed Facts & Entity Resolution Engine",
        stage: "S7 Facts",
        category: "REGULATORY_ENGINE",
        status: "REAL",
        technologies: ["RapidFuzz", "Legal Form Normalization", "Indic Numeral Transliteration"],
        description: "Two-sided comparison engine distinguishing core institution names from legal forms. Translates Indic scripts (Devanagari, Bengali, etc.) to ASCII.",
        operational_mode: "Production-grade fuzzy comparison library.",
        file_reference: "backend/extraction/names.py, backend/facts/service.py"
      },
      {
        id: "S8",
        name: "Deterministic Rules Engine v4 & Three-Valued Gate",
        stage: "S8 Rules",
        category: "REGULATORY_ENGINE",
        status: "REAL",
        technologies: ["Three-Valued Gate Logic", "YAML Rule Set Loader", "Two-Sided Evidence Binding"],
        description: "Evaluates mandatory and advisory rules across facts through a strict Three-Valued Logic gate (PASS, WARNING, FAILED_CHECK, NOT_CHECKED, NEEDS_REVIEW).",
        operational_mode: "Production-grade deterministic rules engine.",
        file_reference: "backend/rules/engine.py, backend/rules/gate.py, backend/rules/evaluators.py"
      },
      {
        id: "S10",
        name: "Physical Infrastructure Evidence & Geotag Engine",
        stage: "S10 Infra",
        category: "EVIDENCE_FORENSICS",
        status: "REAL",
        technologies: ["WGS84 Haversine Formula", "EXIF Geolocation Extraction", "DCT pHash Duplicate Detection"],
        description: "Computes geodesic distance between institution campus coordinates and photo EXIF GPS tags using Haversine formula; detects duplicate photo reuse.",
        operational_mode: "Production-grade geodesic and image forensic algorithms.",
        file_reference: "backend/infra/service.py, backend/infra/geotag.py"
      },
      {
        id: "S11",
        name: "Application Triage & Dynamic Priority Engine",
        stage: "S11 Triage",
        category: "REGULATORY_ENGINE",
        status: "REAL",
        technologies: ["Multi-Factor Priority Scoring Formula", "SLA 4-Lane Triage", "Deterministic Status Derivation"],
        description: "Calculates unified priority score: (100*H) + (30*M) + (5*L) + Age + Deadline Pressure. Routes to 4 assignable SLA review lanes.",
        operational_mode: "Production-grade triage algorithm.",
        file_reference: "backend/aggregation/service.py"
      },
      {
        id: "S12",
        name: "Officer Draft Export & Notice Generator",
        stage: "S12 Exports",
        category: "REGULATORY_ENGINE",
        status: "REAL",
        technologies: ["Statutory Deficiency Notice Compiler", "Ground Inspection Brief Generator", "Markdown & HTML Engine"],
        description: "Generates formal draft Deficiency Notices omitting internal anomaly tags per Guide §17.4; produces Ground Inspection Briefs and Full Evaluation Reports.",
        operational_mode: "Production-grade report compilation.",
        file_reference: "backend/review/exports.py"
      },
      {
        id: "S13",
        name: "Cryptographic Hash Chain & Signed Checkpoints",
        stage: "S13 Audit",
        category: "AUDIT_SECURITY",
        status: "REAL",
        technologies: ["Sequential SHA-256 Hash Chain", "Ed25519 Digital Signatures", "Fail-Visible Tamper Tripwire"],
        description: "Strict chronological event log linked via SHA-256 hash chaining (Genesis to Head). Signed with Ed25519 keys; trips instant red alert on database mutation.",
        operational_mode: "Production-grade cryptographic audit log.",
        file_reference: "backend/audit/chain.py, backend/audit/checkpoint.py"
      },
      {
        id: "SIM_AICTE_DB",
        name: "AICTE Core Institutional Database",
        stage: "External Records",
        category: "EXTERNAL_INTEGRATIONS",
        status: "SIMULATED",
        technologies: ["MockRecordsAdapter", "Immutable Synthetic Envelopes"],
        description: "Official AICTE institutional records, approved programme intakes, and deficiency records simulated via MockRecordsAdapter with explicit simulation flags.",
        operational_mode: "Simulated in-memory demo adapter. Real integration requires authorized access to live AICTE enterprise database.",
        file_reference: "backend/records/adapter.py, backend/records/demo.py"
      },
      {
        id: "SIM_FIRE_REGISTRY",
        name: "State Fire Service Online QR Portal",
        stage: "S9 Verification",
        category: "EXTERNAL_INTEGRATIONS",
        status: "SIMULATED",
        technologies: ["Simulated Issuer Gateway", "State QR Payload Parser"],
        description: "Online issuer verification portal responding to decoded Fire NOC QR parameters. Simulates external responses without transmitting data to live external portals.",
        operational_mode: "Simulated local verification adapter per AGENTS.md confidentiality gate.",
        file_reference: "backend/verification/gateway.py, backend/verification/fire_noc.py"
      },
      {
        id: "SIM_PKI_ROOTS",
        name: "Government PKI Root Certificate Authority",
        stage: "S2 Forensics",
        category: "EXTERNAL_INTEGRATIONS",
        status: "SIMULATED",
        technologies: ["X.509 Demonstration Certificates", "Local Trust Store Fixture"],
        description: "Official government trust list (e.g. CCA India) and live Online Certificate Status Protocol (OCSP) queries simulated using local sovereign X.509 fixtures.",
        operational_mode: "Simulated sovereign trust fixture avoiding live CRL network fetches.",
        file_reference: "backend/forensics/signatures.py"
      },
      {
        id: "SIM_TER_PAYMENT",
        name: "TER Processing Fee Banking Gateway",
        stage: "External Records",
        category: "EXTERNAL_INTEGRATIONS",
        status: "SIMULATED",
        technologies: ["Transaction Envelope Fixture", "Payment Status Stub"],
        description: "Bank transaction settlement and AICTE payment reconciliation records simulated using synthetic payment fixtures.",
        operational_mode: "Simulated payment envelope for prototype testing.",
        file_reference: "backend/records/adapter.py"
      }
    ]
  };

  class RealnessViewComponent {
    constructor(options = {}) {
      this.containerId = options.containerId || 'view-realness';
      this.manifest = DEFAULT_REALNESS_MANIFEST;
      this.statusFilter = 'ALL'; // ALL | REAL | SIMULATED
      this.categoryFilter = 'ALL';
      this.searchQuery = '';
      this.selectedComponentId = null;
      this.isLoading = false;
    }

    /**
     * Fetch realness matrix from API (with fallback) and render
     */
    async loadAndRender() {
      const container = document.getElementById(this.containerId);
      if (!container) return;

      this.isLoading = true;
      try {
        if (typeof window !== 'undefined' && window.api && typeof window.api.getRealnessMatrix === 'function') {
          const res = await window.api.getRealnessMatrix();
          if (res && res.components && res.components.length > 0) {
            this.manifest = res;
          }
        }
      } catch (err) {
        console.warn('API getRealnessMatrix unavailable, using deterministic manifest fallback:', err);
        this.manifest = DEFAULT_REALNESS_MANIFEST;
      } finally {
        this.isLoading = false;
        this.render();
      }
    }

    /**
     * Render the Realness Matrix view
     */
    render() {
      const container = document.getElementById(this.containerId);
      if (!container) return;

      const m = this.manifest;
      const s = m.summary || {
        total_components: 15,
        real_components: 11,
        simulated_components: 4,
        realness_percentage: 73.3,
        status_label: "AUDIT-READY / 100% TRANSPARENT"
      };

      const filteredComponents = this.getFilteredComponents();

      container.innerHTML = `
        <div class="realness-container" id="realness-matrix-host">
          <!-- 1. Header Card with Sovereign Badge -->
          <div class="realness-header-card" id="realness-header">
            <div class="realness-header-top">
              <div class="realness-header-title">
                <h2>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="10"/>
                    <line x1="12" y1="16" x2="12" y2="12"/>
                    <line x1="12" y1="8" x2="12.01" y2="8"/>
                  </svg>
                  System Realness & Transparency Matrix
                </h2>
                <p class="text-muted text-xs" style="margin: 0;">
                  Honest disclosure of production-grade sovereign engines vs. simulated external integrations per SIH PS 26261 and Prototype Guide §1.4
                </p>
              </div>
              <div class="realness-meta-badges">
                <span class="badge-sovereign-airgap" id="badge-airgap-status" title="Air-Gapped Sovereign Perimeter">
                  100% AIR-GAPPED SOVEREIGN
                </span>
                <span class="badge badge-pass" id="badge-realness-audit">
                  ${escapeHtml(s.status_label)}
                </span>
              </div>
            </div>

            <!-- Non-negotiable Sovereignty & Confidentiality Declaration per AGENTS.md -->
            <div class="realness-sovereignty-banner" id="banner-sovereignty-declaration">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#2563eb" stroke-width="2" style="flex-shrink:0;">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
              </svg>
              <div>
                <strong>Zero External Transmission Guarantee (AGENTS.md & Guide §1.4):</strong>
                This system runs strictly sovereign and air-gapped. Zero bytes of institutional applications or identity documents leave the local host boundary.
                External third-party issuer verifications (State Fire Service QR online registry, AICTE core database) are explicitly simulated via deterministic local adapters and labeled accordingly.
              </div>
            </div>
          </div>

          <!-- 2. KPI Metrics Ribbon -->
          <div class="realness-kpi-grid" id="realness-kpi-ribbon">
            <div class="realness-kpi-card" id="card-kpi-total">
              <span class="realness-kpi-label">Total Pipelines</span>
              <span class="realness-kpi-value" id="kpi-val-total">${s.total_components}</span>
              <span class="realness-kpi-subtext">Subsystems Evaluated</span>
            </div>
            <div class="realness-kpi-card" id="card-kpi-real">
              <span class="realness-kpi-label">Production Engines</span>
              <span class="realness-kpi-value" style="color: #059669;" id="kpi-val-real">${s.real_components}</span>
              <span class="realness-kpi-subtext">Real Local Code (${s.realness_percentage}%)</span>
            </div>
            <div class="realness-kpi-card" id="card-kpi-simulated">
              <span class="realness-kpi-label">Simulated Mocks</span>
              <span class="realness-kpi-value" style="color: #d97706;" id="kpi-val-simulated">${s.simulated_components}</span>
              <span class="realness-kpi-subtext">Honest Mock Disclosures</span>
            </div>
            <div class="realness-kpi-card" id="card-kpi-outbound">
              <span class="realness-kpi-label">Outbound Calls</span>
              <span class="realness-kpi-value" style="color: #2563eb;" id="kpi-val-outbound">0</span>
              <span class="realness-kpi-subtext">Zero External Data Leaks</span>
            </div>
            <div class="realness-kpi-card" id="card-kpi-ratio">
              <span class="realness-kpi-label">Sovereignty Score</span>
              <span class="realness-kpi-value" style="color: #7c3aed;" id="kpi-val-ratio">100%</span>
              <span class="realness-kpi-subtext">Local Execution Proof</span>
            </div>
          </div>

          <!-- 3. Toolbar: Search, Status Toggle & Category Filters -->
          <div class="realness-toolbar" id="realness-controls-bar">
            <div class="realness-toolbar-top">
              <div class="realness-search-box">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="11" cy="11" r="8"/>
                  <line x1="21" y1="21" x2="16.65" y2="16.65"/>
                </svg>
                <input 
                  type="text" 
                  id="realness-search-input" 
                  class="realness-search-input" 
                  placeholder="Search transparency matrix by component, library (Docling, BLAKE3, pyHanko), or status..."
                  value="${escapeHtml(this.searchQuery)}"
                />
              </div>

              <!-- Status Toggle: ALL | REAL ONLY | SIMULATED ONLY -->
              <div class="realness-status-filters" id="realness-status-filters">
                <button class="btn-realness-filter ${this.statusFilter === 'ALL' ? 'active' : ''}" data-status="ALL">
                  All (${m.components.length})
                </button>
                <button class="btn-realness-filter ${this.statusFilter === 'REAL' ? 'active' : ''}" data-status="REAL">
                  Real Engines (${s.real_components})
                </button>
                <button class="btn-realness-filter ${this.statusFilter === 'SIMULATED' ? 'active' : ''}" data-status="SIMULATED">
                  Simulations (${s.simulated_components})
                </button>
              </div>
            </div>

            <!-- Category Filter Row -->
            <div class="realness-categories-row" id="realness-category-filters">
              ${this.renderCategoryPills()}
            </div>
          </div>

          <!-- 4. Realness Data Table -->
          <div class="realness-table-wrapper" id="realness-table-container">
            ${this.renderTable(filteredComponents)}
          </div>

          <!-- 5. Component Inspection Modal Host -->
          <div id="realness-modal-host"></div>
        </div>
      `;

      this.bindEvents(container);
    }

    /**
     * Render category pills with dynamic counts
     */
    renderCategoryPills() {
      const all = this.manifest.components || [];
      const categories = ['ALL', ...Array.from(new Set(all.map(c => c.category))).sort()];

      return categories.map(cat => {
        const count = cat === 'ALL' ? all.length : all.filter(c => c.category === cat).length;
        const isActive = this.categoryFilter === cat;
        return `
          <button class="btn-realness-cat ${isActive ? 'active' : ''}" data-category="${escapeHtml(cat)}">
            ${escapeHtml(this.formatCategory(cat))}
            <span class="cat-count">${count}</span>
          </button>
        `;
      }).join('');
    }

    /**
     * Friendly category label formatting
     */
    formatCategory(cat) {
      if (cat === 'ALL') return 'All Domains';
      return cat.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
    }

    /**
     * Render transparency data table
     */
    renderTable(components) {
      if (!components || components.length === 0) {
        return `
          <div style="padding: 3rem; text-align: center; color: var(--text-muted, #64748b);">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="margin-bottom:0.75rem; opacity:0.6;">
              <circle cx="11" cy="11" r="8"/>
              <line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <div style="font-weight:600; font-size:1rem; margin-bottom:0.25rem;">No matching subsystems found</div>
            <div style="font-size:0.8rem;">Try clearing your search query or selecting "All Domains".</div>
          </div>
        `;
      }

      return `
        <table class="realness-table" id="realness-matrix-table">
          <thead>
            <tr>
              <th id="th-realness-subsystem" style="width: 220px;">Subsystem & Stage</th>
              <th id="th-realness-status" style="width: 140px;">Status</th>
              <th id="th-realness-tech" style="width: 240px;">Underlying Technology</th>
              <th id="th-realness-desc">Operational Implementation & Disclosure</th>
              <th id="th-realness-code" style="width: 220px;">Source Link</th>
              <th id="th-realness-action" style="width: 80px; text-align: right;">Inspect</th>
            </tr>
          </thead>
          <tbody>
            ${components.map(c => this.renderTableRow(c)).join('')}
          </tbody>
        </table>
      `;
    }

    /**
     * Render single row in transparency matrix table
     */
    renderTableRow(comp) {
      const isReal = comp.status === 'REAL';
      const statusBadge = isReal ?
        `<span class="badge-status-real" id="badge-status-${escapeHtml(comp.id)}">REAL</span>` :
        `<span class="badge-status-simulated" id="badge-status-${escapeHtml(comp.id)}">SIMULATED</span>`;

      return `
        <tr id="row-component-${escapeHtml(comp.id)}">
          <td>
            <div style="display:flex; flex-direction:column; gap:0.25rem;">
              <strong style="color:#0f172a; font-size:0.9rem;">${escapeHtml(comp.name)}</strong>
              <span class="text-xs text-muted font-mono">${escapeHtml(comp.stage)} · ${escapeHtml(comp.category)}</span>
            </div>
          </td>
          <td>
            ${statusBadge}
          </td>
          <td>
            <div class="tech-tags-list">
              ${(comp.technologies || []).map(t => `<span class="tech-tag">${escapeHtml(t)}</span>`).join('')}
            </div>
          </td>
          <td>
            <div style="color:#334155; line-height:1.45; font-size:0.825rem; margin-bottom:0.35rem;">
              ${escapeHtml(comp.description)}
            </div>
            <div style="font-size:0.75rem; color:${isReal ? '#047857' : '#b45309'}; font-weight:600;">
              ${escapeHtml(comp.operational_mode)}
            </div>
          </td>
          <td>
            <span class="file-link-pill" title="Code Reference">
              ${escapeHtml(comp.file_reference)}
            </span>
          </td>
          <td style="text-align: right;">
            <button class="btn btn-outline btn-sm btn-inspect-component" data-id="${escapeHtml(comp.id)}" style="padding:0.25rem 0.5rem; font-size:0.75rem;">
              Inspect
            </button>
          </td>
        </tr>
      `;
    }

    /**
     * Filter components by status, category, and search query
     */
    getFilteredComponents() {
      const all = this.manifest.components || [];
      let list = all;

      // Status filter
      if (this.statusFilter === 'REAL') {
        list = list.filter(c => c.status === 'REAL');
      } else if (this.statusFilter === 'SIMULATED') {
        list = list.filter(c => c.status === 'SIMULATED');
      }

      // Category filter
      if (this.categoryFilter !== 'ALL') {
        list = list.filter(c => c.category === this.categoryFilter);
      }

      // Search query
      if (this.searchQuery && this.searchQuery.trim().length > 0) {
        const q = this.searchQuery.trim().toLowerCase();
        list = list.filter(c => {
          const name = (c.name || '').toLowerCase();
          const desc = (c.description || '').toLowerCase();
          const stage = (c.stage || '').toLowerCase();
          const status = (c.status || '').toLowerCase();
          const tech = (c.technologies || []).join(' ').toLowerCase();
          const file = (c.file_reference || '').toLowerCase();
          return name.includes(q) || desc.includes(q) || stage.includes(q) || status.includes(q) || tech.includes(q) || file.includes(q);
        });
      }

      return list;
    }

    /**
     * Set status filter (ALL, REAL, SIMULATED)
     */
    setStatusFilter(status) {
      this.statusFilter = status;
      this.render();
    }

    /**
     * Set category filter
     */
    setCategoryFilter(category) {
      this.categoryFilter = category;
      this.render();
    }

    /**
     * Set search query
     */
    setSearchQuery(query) {
      this.searchQuery = query;
      this.render();
    }

    /**
     * Open component transparency disclosure modal
     */
    openComponentModal(componentId) {
      const all = this.manifest.components || [];
      const comp = all.find(c => c.id === componentId);
      if (!comp) return;

      this.selectedComponentId = componentId;
      const host = document.getElementById('realness-modal-host');
      if (!host) return;

      const isReal = comp.status === 'REAL';

      host.innerHTML = `
        <div class="realness-modal-backdrop" id="modal-backdrop-realness">
          <div class="realness-modal-container" id="modal-container-realness">
            <div class="realness-modal-header">
              <div style="display:flex; align-items:center; gap:0.75rem;">
                <h3 style="margin:0; font-size:1.15rem; color:#0f172a;">${escapeHtml(comp.name)}</h3>
                <span class="${isReal ? 'badge-status-real' : 'badge-status-simulated'}">
                  ${escapeHtml(comp.status)}
                </span>
              </div>
              <button id="btn-close-realness-modal" class="btn btn-secondary btn-sm" style="padding:0.25rem 0.5rem;">✕</button>
            </div>

            <div class="realness-modal-body">
              <div>
                <span class="text-xs text-muted font-mono" style="text-transform:uppercase; font-weight:700;">Subsystem ID & Stage:</span>
                <div style="font-size:0.95rem; font-weight:600; color:#1e293b; margin-top:0.2rem;">
                  ${escapeHtml(comp.id)} · ${escapeHtml(comp.stage)} (${escapeHtml(comp.category)})
                </div>
              </div>

              <div>
                <span class="text-xs text-muted font-mono" style="text-transform:uppercase; font-weight:700;">Detailed Implementation:</span>
                <p style="font-size:0.875rem; color:#334155; line-height:1.5; margin:0.35rem 0 0 0;">
                  ${escapeHtml(comp.description)}
                </p>
              </div>

              <div>
                <span class="text-xs text-muted font-mono" style="text-transform:uppercase; font-weight:700;">Technological Stack:</span>
                <div class="tech-tags-list" style="margin-top:0.35rem;">
                  ${(comp.technologies || []).map(t => `<span class="tech-tag" style="font-size:0.8rem; padding:0.25rem 0.55rem;">${escapeHtml(t)}</span>`).join('')}
                </div>
              </div>

              <div>
                <span class="text-xs text-muted font-mono" style="text-transform:uppercase; font-weight:700;">Operational Architecture:</span>
                <div style="font-size:0.85rem; padding:0.75rem 1rem; border-radius:0.375rem; background:${isReal ? '#ecfdf5' : '#fffbeb'}; border:1px solid ${isReal ? '#a7f3d0' : '#fde68a'}; color:${isReal ? '#065f46' : '#92400e'}; margin-top:0.35rem;">
                  <strong>${isReal ? 'Live Production Engine' : 'Controlled Simulation Disclosure'}:</strong>
                  ${escapeHtml(comp.operational_mode)}
                </div>
              </div>

              <div>
                <span class="text-xs text-muted font-mono" style="text-transform:uppercase; font-weight:700;">Codebase Implementation Path:</span>
                <div style="margin-top:0.35rem;">
                  <code style="background:#f1f5f9; padding:0.35rem 0.65rem; border-radius:0.25rem; font-size:0.8rem; border:1px solid #cbd5e1; display:inline-block;">
                    ${escapeHtml(comp.file_reference)}
                  </code>
                </div>
              </div>
            </div>

            <div class="realness-modal-footer">
              <button id="btn-dismiss-realness-modal" class="btn btn-primary btn-sm">Close Disclosure</button>
            </div>
          </div>
        </div>
      `;

      // Wire close handlers
      const closeModal = () => this.closeModal();
      const btnClose = document.getElementById('btn-close-realness-modal');
      const btnDismiss = document.getElementById('btn-dismiss-realness-modal');
      const backdrop = document.getElementById('modal-backdrop-realness');

      if (btnClose) btnClose.addEventListener('click', closeModal);
      if (btnDismiss) btnDismiss.addEventListener('click', closeModal);
      if (backdrop) {
        backdrop.addEventListener('click', (e) => {
          if (e.target === backdrop) closeModal();
        });
      }
    }

    /**
     * Close modal
     */
    closeModal() {
      this.selectedComponentId = null;
      const host = document.getElementById('realness-modal-host');
      if (host) host.innerHTML = '';
    }

    /**
     * Bind DOM event listeners
     */
    bindEvents(container) {
      // Search input
      const searchInput = container.querySelector('#realness-search-input');
      if (searchInput) {
        searchInput.addEventListener('input', (e) => {
          this.searchQuery = e.target.value;
          this.render();
          const updatedInput = container.querySelector('#realness-search-input');
          if (updatedInput) {
            updatedInput.focus();
            updatedInput.setSelectionRange(updatedInput.value.length, updatedInput.value.length);
          }
        });
      }

      // Status buttons
      const statusBtns = container.querySelectorAll('.btn-realness-filter');
      statusBtns.forEach(btn => {
        btn.addEventListener('click', () => {
          const status = btn.getAttribute('data-status');
          this.setStatusFilter(status);
        });
      });

      // Category buttons
      const catBtns = container.querySelectorAll('.btn-realness-cat');
      catBtns.forEach(btn => {
        btn.addEventListener('click', () => {
          const cat = btn.getAttribute('data-category');
          this.setCategoryFilter(cat);
        });
      });

      // Inspect buttons
      const inspectBtns = container.querySelectorAll('.btn-inspect-component');
      inspectBtns.forEach(btn => {
        btn.addEventListener('click', () => {
          const id = btn.getAttribute('data-id');
          this.openComponentModal(id);
        });
      });
    }
  }

  // Helper function to safely escape HTML
  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  return RealnessViewComponent;
}));
