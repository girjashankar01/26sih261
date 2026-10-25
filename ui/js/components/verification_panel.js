/**
 * AICTE Application Validation Platform — Issuing Authority Verification Gateway Panel
 * Spec Reference: ROADMAP.md (Phase 6: Steps 32–36), Guide §3.6, §13
 *
 * Responsibilities:
 * 1. Verification Gateway Overview Container (Step 32):
 *    - Listing all verifiable documents in the bundle (Fire NOC, Affidavit, Building Plan, Accreditation).
 *    - Summary KPI breakdown (Total, Verifiable, Verified, Issues/Expired, Pending Review).
 *    - Prominent simulation advisory banner per AGENTS.md (all adapter outcomes explicitly labeled SIMULATED).
 * 2. 8-State Verification Status Badging (Step 33, Guide §3.6):
 *    - VERIFIED, MISMATCH_DETECTED, EXPIRED, VERIFICATION_PENDING,
 *      SOURCE_UNAVAILABLE, MANUAL_REVIEW_REQUIRED, NOT_SUPPORTED, NOT_CHECKED.
 *    - Specific Verification Requirement: Expired Fire NOC displays EXPIRED status in yellow with SIMULATED badge.
 * 3. Gateway Verification Action Wiring:
 *    - POST /applications/{id}/documents/{doc_id}/verify execution.
 *    - Dynamic card DOM updates (status, left border accent, outcome explanation, cache tag).
 *    - Real-time KPI counter recalculation.
 * 4. Content-Addressed Cryptographic Fingerprints:
 *    - Displays SHA-256 and BLAKE3 digests matching vault records.
 */

const VERIFICATION_STATUSES = [
  'VERIFIED',
  'MISMATCH_DETECTED',
  'EXPIRED',
  'VERIFICATION_PENDING',
  'SOURCE_UNAVAILABLE',
  'MANUAL_REVIEW_REQUIRED',
  'NOT_SUPPORTED',
  'NOT_CHECKED'
];

const STATUS_CONFIG = {
  'VERIFIED': {
    label: '✓ VERIFIED',
    class: 'badge-status-verified',
    color: '#16a34a',
    desc: 'Official registry confirmation matches document evidence.'
  },
  'MISMATCH_DETECTED': {
    label: '⚠ MISMATCH DETECTED',
    class: 'badge-status-mismatch_detected',
    color: '#ea580c',
    desc: 'Authority record deviates from submitted document values.'
  },
  'EXPIRED': {
    label: '✕ EXPIRED',
    class: 'badge-status-expired',
    color: '#d97706',
    desc: 'Certificate validity period has ended according to issuing registry.'
  },
  'VERIFICATION_PENDING': {
    label: '⏳ PENDING QUERY',
    class: 'badge-status-verification_pending',
    color: '#0284c7',
    desc: 'Asynchronous query dispatched to issuing authority gateway.'
  },
  'SOURCE_UNAVAILABLE': {
    label: '⚠ SOURCE UNAVAILABLE',
    class: 'badge-status-source_unavailable',
    color: '#64748b',
    desc: 'External authority endpoint timed out or is temporarily unreachable.'
  },
  'MANUAL_REVIEW_REQUIRED': {
    label: '🔍 MANUAL REVIEW REQ',
    class: 'badge-status-manual_review_required',
    color: '#8b5cf6',
    desc: 'Ambiguous result, self-signed certificate, or unindexed reference requires human review.'
  },
  'NOT_SUPPORTED': {
    label: '— NOT SUPPORTED',
    class: 'badge-status-not_supported',
    color: '#475569',
    desc: 'No automated issuing authority verification adapter exists for this document type.'
  },
  'NOT_CHECKED': {
    label: '— NOT CHECKED',
    class: 'badge-status-not_checked',
    color: '#94a3b8',
    desc: 'Verification check has not yet been executed.'
  },
  'ACKNOWLEDGED': {
    label: '✓ ACKNOWLEDGED',
    class: 'badge-status-verified',
    color: '#8b5cf6',
    desc: 'Manual verification audit recorded by reviewing officer (Guide §17).'
  }
};

class VerificationPanelComponent {
  constructor() {
    this.currentAppId = null;
    this.documents = [];
    this.verifications = new Map();
    this.forensicsCache = new Map();
    this.activeFilter = 'all'; // 'all' | 'verifiable' | 'issues' | 'verified'
    this.searchQuery = '';
    this.isLoaded = false;
  }

  /**
   * Resolve default documents bundle for demo applications (Step 32)
   */
  getDefaultDocuments(appId) {
    if (appId === 'DEMO-ISSUES-001' || !appId) {
      return [
        {
          id: 'doc_qr_fire',
          document_id: 'doc_qr_fire',
          name: 'State Fire Service Certificate (Fire NOC)',
          slot: 'FIRE_NOC',
          document_type: 'FIRE_NOC',
          byte_size: 245760,
          blake3: 'b3_78a1bc4028df198001a4e5218d6c8109',
          sha256: 'a94f5c31768829efb0a701d81e976a47a13d81b49048a1',
          adapter: 'QR State Registry Adapter',
          authority: 'Karnataka State Fire & Emergency Services',
          status: 'EXPIRED',
          is_verifiable: true,
          simulated: true,
          reason: 'Certificate FS/HQ/2023/NOC-4491 expired on 2024-03-31',
          integrity: 'SHA256_MATCH',
          trust: 'unsigned',
          source_verification: 'EXPIRED_ON_REGISTRY'
        },
        {
          id: 'doc_digital_1',
          document_id: 'doc_digital_1',
          name: 'AICTE Form 1 Affidavit & Land Possession Deed',
          slot: 'AFFIDAVIT',
          document_type: 'AFFIDAVIT',
          byte_size: 184320,
          blake3: 'b3_52b8dc194e8031a5719bc4220b8f9021',
          sha256: '7f83b1657ff1fc53b92dc18148a1d65dfc2d4b1251910a',
          adapter: 'Cryptographic pyHanko Signature Validator',
          authority: 'AICTE Demo Root CA Trust Chain',
          status: 'VERIFIED',
          is_verifiable: true,
          simulated: true,
          reason: 'Cryptographic digital signature valid with full byte coverage',
          integrity: 'INTACT_FULL_COVERAGE',
          trust: 'demo',
          source_verification: 'REGISTRY_MATCH'
        },
        {
          id: 'doc_scanned_2',
          document_id: 'doc_scanned_2',
          name: 'Building Approval Plan (Scanned Raster)',
          slot: 'BUILDING_PLAN',
          document_type: 'BUILDING_PLAN',
          byte_size: 512000,
          blake3: 'b3_91c4e7033a61f28014bc90a184df2011',
          sha256: 'c3ab8ff13720e8ad492fb8134a9058b71d601a4f90142b',
          adapter: 'Municipal Town Planning Authority Portal',
          authority: 'Directorate of Town & Country Planning',
          status: 'SOURCE_UNAVAILABLE',
          is_verifiable: true,
          simulated: true,
          reason: 'Municipal portal returned 503 gateway timeout; manual review fallback available',
          integrity: 'SHA256_MATCH',
          trust: 'unsigned',
          source_verification: 'SOURCE_UNAVAILABLE'
        }
      ];
    }

    // Default Clean Case
    return [
      {
        id: 'doc_clean_fire',
        document_id: 'doc_clean_fire',
        name: 'Fire & Life Safety NOC',
        slot: 'FIRE_NOC',
        document_type: 'FIRE_NOC',
        byte_size: 210000,
        blake3: 'b3_12a4c8091f6300a891bc442180de9103',
        sha256: '4a1b8c903ef8147d91240a5b9c1d4e782190ab4c1258ef',
        adapter: 'QR State Registry Adapter',
        authority: 'State Fire Services Registry',
        status: 'VERIFIED',
        is_verifiable: true,
        simulated: true,
        reason: 'Certificate verified active through 2027-04-30',
        integrity: 'SHA256_MATCH',
        trust: 'unsigned',
        source_verification: 'REGISTRY_MATCH'
      },
      {
        id: 'doc_clean_affidavit',
        document_id: 'doc_clean_affidavit',
        name: 'Registered Advocate Affidavit',
        slot: 'AFFIDAVIT',
        document_type: 'AFFIDAVIT',
        byte_size: 195000,
        blake3: 'b3_34b7f0192e8411b901ac882190ef7104',
        sha256: '9b2c3d4e5f60718293a4b5c6d7e8f90123456789abcdef',
        adapter: 'Cryptographic pyHanko Signature Validator',
        authority: 'AICTE Demo Root CA Trust Chain',
        status: 'VERIFIED',
        is_verifiable: true,
        simulated: true,
        reason: 'Signature verified and timestamped',
        integrity: 'INTACT_FULL_COVERAGE',
        trust: 'demo',
        source_verification: 'REGISTRY_MATCH'
      }
    ];
  }

  /**
   * Load Persisted Documents for Application: GET /applications/{id}/documents (Step 32)
   */
  async loadDocuments(applicationId) {
    if (!applicationId) return [];
    this.currentAppId = applicationId;

    try {
      const client = (typeof window !== 'undefined' && (window.apiClient || window.api))
        ? (window.apiClient || window.api)
        : (typeof ApiClient !== 'undefined' ? new ApiClient() : null);

      if (client && typeof client.getDocuments === 'function') {
        const res = await client.getDocuments(applicationId);
        const docs = (res && Array.isArray(res.documents)) ? res.documents : (Array.isArray(res) ? res : []);
        if (docs.length > 0) {
          // Merge with verification metadata defaults
          const defaults = this.getDefaultDocuments(applicationId);
          this.documents = docs.map(d => {
            const def = defaults.find(x => x.id === (d.id || d.document_id) || x.slot === d.slot) || {};
            return {
              ...def,
              ...d,
              id: d.id || d.document_id || def.id,
              document_id: d.document_id || d.id || def.document_id,
              name: d.filename || d.name || def.name || 'Application Document',
              slot: d.slot || def.slot || 'UNSPECIFIED',
              status: d.status || def.status || 'NOT_CHECKED',
              adapter: def.adapter || 'Authority Verification Gateway',
              authority: def.authority || 'State / Statutory Registry',
              is_verifiable: def.is_verifiable !== undefined ? def.is_verifiable : true,
              simulated: true
            };
          });
        }
      }
    } catch (err) {
      console.warn(`[VerificationPanel] Could not fetch documents for ${applicationId}:`, err);
    }

    if (!this.documents || this.documents.length === 0) {
      this.documents = this.getDefaultDocuments(applicationId);
    }

    this.isLoaded = true;

    // Dispatch custom DOM event
    if (typeof window !== 'undefined' && typeof CustomEvent !== 'undefined' && typeof window.dispatchEvent === 'function') {
      window.dispatchEvent(new CustomEvent('app:verification-documents-loaded', {
        detail: {
          applicationId,
          count: this.documents.length
        }
      }));
    }

    return this.documents;
  }

  /**
   * Calculate Overview KPI Counts (Step 32, 33, 36)
   */
  getKpiCounts() {
    const docs = this.documents || [];
    const total = docs.length;
    const verifiable = docs.filter(d => d.is_verifiable !== false).length;
    const verified = docs.filter(d => d.status === 'VERIFIED' || d.status === 'acknowledged' || d.status === 'ACKNOWLEDGED').length;
    const issues = docs.filter(d => (d.status === 'EXPIRED' || d.status === 'MISMATCH_DETECTED') && d.status !== 'acknowledged').length;
    const pending = docs.filter(d => (d.status === 'VERIFICATION_PENDING' || d.status === 'SOURCE_UNAVAILABLE' || d.status === 'MANUAL_REVIEW_REQUIRED' || d.status === 'NOT_CHECKED') && !d.manual_verification && d.status !== 'acknowledged' && d.status !== 'ACKNOWLEDGED').length;

    return { total, verifiable, verified, issues, pending };
  }

  /**
   * Render KPI Overview Metrics Bar (Step 32 & 33)
   */
  renderKpiBar() {
    const kpis = this.getKpiCounts();

    return `
      <div class="verification-kpi-bar" id="verification-kpi-bar" role="region" aria-label="Verification Summary Metrics">
        <!-- 1. Total Documents in Bundle -->
        <div class="verification-kpi-card" id="kpi-verif-total">
          <span class="verification-kpi-val font-mono text-main">${kpis.total}</span>
          <span class="verification-kpi-label">Total Documents</span>
        </div>

        <!-- 2. Issuer Verifiable Documents -->
        <div class="verification-kpi-card" id="kpi-verif-verifiable">
          <span class="verification-kpi-val font-mono text-accent">${kpis.verifiable}</span>
          <span class="verification-kpi-label">Issuer Verifiable</span>
        </div>

        <!-- 3. Verified Authenticated -->
        <div class="verification-kpi-card" id="kpi-verif-verified">
          <span class="verification-kpi-val font-mono text-success">${kpis.verified}</span>
          <span class="verification-kpi-label">Verified</span>
        </div>

        <!-- 4. Issues / Expired / Mismatch -->
        <div class="verification-kpi-card" id="kpi-verif-issues">
          <span class="verification-kpi-val font-mono text-danger">${kpis.issues}</span>
          <span class="verification-kpi-label">Issues / Expired</span>
        </div>

        <!-- 5. Pending / Source Unavailable -->
        <div class="verification-kpi-card" id="kpi-verif-pending">
          <span class="verification-kpi-val font-mono text-warn">${kpis.pending}</span>
          <span class="verification-kpi-label">Pending / Manual</span>
        </div>
      </div>
    `;
  }

  /**
   * Render Non-Negotiable Simulation Advisory Banner (AGENTS.md Compliance)
   */
  renderAdvisoryBanner() {
    return `
      <div class="verification-advisory-banner" role="status">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
          <path d="M12 8v4"></path>
          <path d="M12 16h.01"></path>
        </svg>
        <div>
          <div style="display: flex; align-items: center; gap: var(--space-2); margin-bottom: 2px;">
            <strong style="color: var(--text-main);">Independent Issuing Authority Verification Gateway (S9)</strong>
            <span class="badge-simulated-tag">SIMULATED ADAPTERS</span>
          </div>
          <p style="margin: 0; color: var(--text-muted);">
            Authoritative registry queries (State Fire Service QR code databases, pyHanko cryptographic signature validation, and municipal town planning registries) are executed via simulated adapters in this prototype. External agency integration requires an authorized memorandum of understanding (MOU) and live production gateway credentials.
          </p>
        </div>
      </div>
    `;
  }

  /**
   * Render Verification Status Pill (Guide §3.6 8-State Taxonomy & Step 33)
   * Verification Requirement: Expired Fire NOC displays EXPIRED status in yellow with SIMULATED badge.
   */
  renderStatusPill(status, simulated = true) {
    const st = String(status || 'NOT_CHECKED').toUpperCase();
    const cleanStatus = (st === 'ACKNOWLEDGED' || VERIFICATION_STATUSES.includes(st)) ? st : 'NOT_CHECKED';
    const cfg = STATUS_CONFIG[cleanStatus] || STATUS_CONFIG['NOT_CHECKED'];

    return `
      <div class="verif-status-pill-container" data-status="${cleanStatus}" style="display: inline-flex; align-items: center; gap: 4px;">
        <span class="badge ${cfg.class} font-mono text-xs" data-verification-status="${cleanStatus}" data-status="${cleanStatus}">
          ${cfg.label}
        </span>
        ${simulated ? '<span class="badge-simulated-tag" data-simulated="true" title="Simulated verification adapter per AGENTS.md">SIMULATED</span>' : ''}
      </div>
    `;
  }

  /**
   * Render Filtering and Action Toolbar (Step 32 & 33)
   */
  renderToolbar() {
    return `
      <div class="verification-toolbar">
        <!-- Filter Button Group -->
        <div class="verification-filter-group" role="group" aria-label="Filter documents by status">
          <button class="verification-filter-btn ${this.activeFilter === 'all' ? 'active' : ''}"
                  data-filter="all"
                  onclick="window.verificationPanelComponent && window.verificationPanelComponent.setFilter('all')">
            All Documents (${this.documents.length})
          </button>
          <button class="verification-filter-btn ${this.activeFilter === 'verifiable' ? 'active' : ''}"
                  data-filter="verifiable"
                  onclick="window.verificationPanelComponent && window.verificationPanelComponent.setFilter('verifiable')">
            Verifiable Only
          </button>
          <button class="verification-filter-btn ${this.activeFilter === 'issues' ? 'active' : ''}"
                  data-filter="issues"
                  onclick="window.verificationPanelComponent && window.verificationPanelComponent.setFilter('issues')">
            Issues / Expired
          </button>
          <button class="verification-filter-btn ${this.activeFilter === 'verified' ? 'active' : ''}"
                  data-filter="verified"
                  onclick="window.verificationPanelComponent && window.verificationPanelComponent.setFilter('verified')">
            Verified
          </button>
        </div>

        <!-- Search Input -->
        <div class="verification-search-box">
          <input type="text"
                 id="verif-search-input"
                 class="form-input"
                 style="font-size: 11px; padding: 4px 8px; width: 100%;"
                 placeholder="Search documents by name or slot…"
                 value="${this.searchQuery}"
                 oninput="window.verificationPanelComponent && window.verificationPanelComponent.setSearch(this.value)">
        </div>

        <!-- Action Trigger Button -->
        <button class="btn btn-primary btn-sm font-mono text-xs"
                id="btn-verify-all-docs"
                onclick="window.verificationPanelComponent && window.verificationPanelComponent.verifyAll()">
          ⚡ Run Gateway Verification
        </button>
      </div>
    `;
  }

  /**
   * Resolve default raw-byte forensic analysis result (Step 34, S2 Forensics per Guide §5.2)
   */
  getDefaultForensics(documentId, applicationId) {
    const appId = applicationId || this.currentAppId || 'DEMO-ISSUES-001';

    if (documentId === 'doc_digital_1' || documentId === 'doc_clean_affidavit') {
      return {
        application_id: appId,
        document_id: documentId,
        detected_media_type: 'application/pdf',
        byte_size: 184320,
        blake3: 'b3_52b8dc194e8031a5719bc4220b8f9021',
        sha256: '7f83b1657ff1fc53b92dc18148a1d65dfc2d4b1251910a',
        storage_key: `vault/${appId}/${documentId}.pdf`,
        pipeline_stage: 'S2_FORENSICS',
        meta: {
          producer: 'pyHanko / ReportLab Demo Generator',
          incremental_updates_count: 1,
          signatures: [
            {
              name: 'Signature1',
              integrity: 'INTACT_FULL_COVERAGE',
              trust: 'demo',
              source_verification: 'UNVERIFIED',
              signing_time: '2026-03-15T10:00:00Z'
            }
          ]
        },
        flags: [
          {
            code: 'SIG_INTACT',
            severity: 'info',
            reason: 'Cryptographically intact digital signature verified against demo stand-in root.',
            advisory: true
          }
        ],
        integrity: {
          status: 'INTACT_FULL_COVERAGE',
          sha256_match: true,
          incremental_updates_count: 1,
          detail: 'SHA-256 digest match · 0 post-signing revisions'
        },
        trust: {
          status: 'demo',
          level: 'demo_root_ca',
          provider: 'AICTE Demo Root CA',
          detail: 'Valid CMS signature · AICTE Demo Root CA'
        },
        source: {
          status: 'REGISTRY_MATCH',
          detail: 'Authoritative registry match confirmed (simulated)'
        }
      };
    }

    if (documentId === 'doc_qr_fire') {
      return {
        application_id: appId,
        document_id: documentId,
        detected_media_type: 'application/pdf',
        byte_size: 245760,
        blake3: 'b3_78a1bc4028df198001a4e5218d6c8109',
        sha256: 'a94f5c31768829efb0a701d81e976a47a13d81b49048a1',
        storage_key: `vault/${appId}/${documentId}.pdf`,
        pipeline_stage: 'S2_FORENSICS',
        meta: {
          producer: 'State Portal PDF Generator',
          incremental_updates_count: 1,
          signatures: []
        },
        qr: {
          detected: true,
          issuer: 'Karnataka State Fire & Emergency Services',
          issuer_name: 'MOCK_FIRE',
          registry_domain: 'fire.karnataka.gov.in',
          reference: 'FIRE/KA/2024/00123',
          masked_reference: 'FIRE/KA/****/00123',
          raw_url: 'https://fire.karnataka.gov.in/verify?token=sec_9f81a7b4c2&ref=FIRE/KA/2024/00123',
          decoded_url_masked: 'https://fire.karnataka.gov.in/verify?token=****&ref=FIRE/KA/****/00123',
          raw_text_masked: 'https://fire.karnataka.gov.in/verify?token=****&ref=FIRE/KA/****/00123'
        },
        flags: [],
        integrity: {
          status: 'SHA256_MATCH',
          sha256_match: true,
          incremental_updates_count: 1,
          detail: 'SHA-256 match · Original vault hash verified'
        },
        trust: {
          status: 'unsigned',
          level: 'not_applicable',
          detail: 'No embedded CMS digital signature envelope'
        },
        source: {
          status: 'EXPIRED_ON_REGISTRY',
          detail: 'Certificate FS/HQ/2023/NOC-4491 expired on 2024-03-31'
        }
      };
    }

    if (documentId === 'doc_clean_fire') {
      return {
        application_id: appId,
        document_id: documentId,
        detected_media_type: 'application/pdf',
        byte_size: 210000,
        blake3: 'b3_12a4c8091f6300a891bc442180de9103',
        sha256: '4a1b8c903ef8147d91240a5b9c1d4e782190ab4c1258ef',
        storage_key: `vault/${appId}/${documentId}.pdf`,
        pipeline_stage: 'S2_FORENSICS',
        meta: {
          producer: 'State Fire Portal',
          incremental_updates_count: 1,
          signatures: []
        },
        flags: [],
        integrity: {
          status: 'SHA256_MATCH',
          sha256_match: true,
          incremental_updates_count: 1,
          detail: 'SHA-256 match · Original vault hash verified'
        },
        trust: {
          status: 'unsigned',
          level: 'not_applicable',
          detail: 'No embedded CMS digital signature envelope'
        },
        source: {
          status: 'REGISTRY_MATCH',
          detail: 'Certificate verified active through 2027-04-30'
        }
      };
    }

    // Default / Scanned Document (e.g. doc_scanned_2)
    return {
      application_id: appId,
      document_id: documentId,
      detected_media_type: 'application/pdf',
      byte_size: 512000,
      blake3: 'b3_91c4e7033a61f28014bc90a184df2011',
      sha256: 'c3ab8ff13720e8ad492fb8134a9058b71d601a4f90142b',
      storage_key: `vault/${appId}/${documentId}.pdf`,
      pipeline_stage: 'S2_FORENSICS',
      meta: {
        producer: 'Flatbed Document Scanner',
        incremental_updates_count: 1,
        signatures: []
      },
      flags: [],
      integrity: {
        status: 'SHA256_MATCH',
        sha256_match: true,
        incremental_updates_count: 1,
        detail: 'SHA-256 match · Original vault hash verified'
      },
      trust: {
        status: 'unsigned',
        level: 'not_applicable',
        detail: 'No embedded CMS digital signature envelope'
      },
      source: {
        status: 'SOURCE_UNAVAILABLE',
        detail: 'Municipal portal returned 503 gateway timeout; manual review fallback available'
      }
    };
  }

  /**
   * Load Forensics for a Document: GET /applications/{id}/documents/{doc_id}/forensics (Step 34)
   */
  async loadForensics(documentId) {
    if (!documentId) return null;
    const appId = this.currentAppId || 'DEMO-ISSUES-001';

    if (this.forensicsCache.has(documentId)) {
      return this.forensicsCache.get(documentId);
    }

    let result = null;
    try {
      const client = (typeof window !== 'undefined' && (window.apiClient || window.api))
        ? (window.apiClient || window.api)
        : (typeof ApiClient !== 'undefined' ? new ApiClient() : null);

      if (client && typeof client.getDocumentForensics === 'function') {
        result = await client.getDocumentForensics(appId, documentId);
      }
    } catch (err) {
      console.warn(`[VerificationPanel] Could not load forensics from API for ${documentId}:`, err);
    }

    if (!result) {
      result = this.getDefaultForensics(documentId, appId);
    }

    this.forensicsCache.set(documentId, result);
    return result;
  }

  /**
   * Resolve 3-Pillar Inspection State (Step 34, Guide §5.2, §13)
   * 1. Document Integrity: SHA-256 match & incremental revisions check.
   * 2. Cryptographic Trust: Valid CMS signature vs Demo CA.
   * 3. Source Verification: External registry query response.
   */
  resolvePillars(doc) {
    if (!doc) {
      return {
        integrity: { value: 'NOT_CHECKED', detail: '—', className: 'pillar-val-muted' },
        trust: { value: 'unsigned', detail: '—', className: 'pillar-val-muted' },
        source: { value: 'NOT_CHECKED', detail: '—', className: 'pillar-val-muted' }
      };
    }

    const docId = doc.id || doc.document_id;
    const forensics = this.forensicsCache.get(docId) || doc.forensics || this.getDefaultForensics(docId, this.currentAppId);

    // 1. Column 1: Document Integrity (SHA-256 match and incremental revisions check)
    let integrityVal = 'SHA256_MATCH';
    let integrityDetail = 'SHA-256 match · Original vault hash verified';
    let integrityClass = 'pillar-val-intact';

    const sig = (forensics.meta && Array.isArray(forensics.meta.signatures) && forensics.meta.signatures.length > 0)
      ? forensics.meta.signatures[0]
      : null;

    if (sig && sig.integrity) {
      integrityVal = sig.integrity;
      if (sig.integrity === 'INTACT_FULL_COVERAGE') {
        integrityVal = 'INTACT_FULL_COVERAGE';
        integrityDetail = 'SHA-256 digest match · 0 post-signing revisions';
        integrityClass = 'pillar-val-intact';
      } else if (sig.integrity === 'MODIFIED_AFTER_SIGNING') {
        integrityDetail = 'Post-signing byte revisions detected';
        integrityClass = 'pillar-val-danger';
      } else {
        integrityDetail = 'Cryptographic signature digest invalid';
        integrityClass = 'pillar-val-danger';
      }
    } else if (doc.integrity) {
      if (typeof doc.integrity === 'string') {
        integrityVal = doc.integrity;
        if (doc.integrity === 'INTACT_FULL_COVERAGE') {
          integrityClass = 'pillar-val-intact';
          integrityDetail = 'SHA-256 digest match · 0 post-signing revisions';
        }
      } else if (doc.integrity.status) {
        integrityVal = doc.integrity.status;
        integrityDetail = doc.integrity.detail || integrityDetail;
        integrityClass = integrityVal === 'INTACT_FULL_COVERAGE' || integrityVal === 'SHA256_MATCH' ? 'pillar-val-intact' : 'pillar-val-danger';
      }
    } else if (forensics.integrity) {
      if (typeof forensics.integrity === 'string') {
        integrityVal = forensics.integrity;
      } else if (forensics.integrity.status) {
        integrityVal = forensics.integrity.status;
        integrityDetail = forensics.integrity.detail || integrityDetail;
      }
      integrityClass = integrityVal === 'INTACT_FULL_COVERAGE' || integrityVal === 'SHA256_MATCH' ? 'pillar-val-intact' : 'pillar-val-danger';
    }

    // 2. Column 2: Cryptographic Trust (Valid CMS signature vs Demo CA)
    let trustVal = 'unsigned';
    let trustDetail = 'No embedded CMS digital signature envelope';
    let trustClass = 'pillar-val-muted';

    if (sig && sig.trust) {
      trustVal = sig.trust;
      if (sig.trust === 'demo') {
        trustVal = 'demo';
        trustDetail = 'Valid CMS signature · AICTE Demo Root CA';
        trustClass = 'pillar-val-demo';
      } else if (sig.trust === 'production') {
        trustDetail = 'Valid CMS signature · Production Trust Chain';
        trustClass = 'pillar-val-intact';
      } else if (sig.trust === 'untrusted') {
        trustDetail = 'Self-signed or unanchored certificate chain';
        trustClass = 'pillar-val-warn';
      }
    } else if (doc.trust) {
      if (typeof doc.trust === 'string') {
        trustVal = doc.trust;
        if (doc.trust === 'demo') {
          trustClass = 'pillar-val-demo';
          trustDetail = 'Valid CMS signature · AICTE Demo Root CA';
        }
      } else if (doc.trust.status || doc.trust.level) {
        trustVal = doc.trust.status || (doc.trust.level === 'demo_root_ca' ? 'demo' : doc.trust.level);
        trustDetail = doc.trust.detail || (trustVal === 'demo' ? 'Valid CMS signature · AICTE Demo Root CA' : trustDetail);
        trustClass = trustVal === 'demo' ? 'pillar-val-demo' : (trustVal === 'production' ? 'pillar-val-intact' : 'pillar-val-muted');
      }
    } else if (forensics.trust) {
      if (typeof forensics.trust === 'string') {
        trustVal = forensics.trust;
      } else if (forensics.trust.status) {
        trustVal = forensics.trust.status;
        trustDetail = forensics.trust.detail || trustDetail;
      }
      trustClass = trustVal === 'demo' ? 'pillar-val-demo' : (trustVal === 'production' ? 'pillar-val-intact' : 'pillar-val-muted');
    }

    // 3. Column 3: Source Verification (External registry query response)
    let sourceVal = 'NOT_CHECKED';
    let sourceDetail = 'External registry query not yet run';
    let sourceClass = 'pillar-val-muted';

    const docStatus = String(doc.status || 'NOT_CHECKED').toUpperCase();

    if (docStatus === 'VERIFIED') {
      sourceVal = 'REGISTRY_MATCH';
      sourceDetail = doc.reason || 'Authoritative registry confirmation matches evidence';
      sourceClass = 'pillar-val-intact';
    } else if (docStatus === 'ACKNOWLEDGED' || Boolean(doc.manual_verification)) {
      sourceVal = 'ACKNOWLEDGED';
      sourceDetail = doc.reason || 'Manual officer verification recorded and acknowledged';
      sourceClass = 'pillar-val-intact';
    } else if (docStatus === 'EXPIRED') {
      sourceVal = 'EXPIRED_ON_REGISTRY';
      sourceDetail = doc.reason || 'Certificate validity period expired on registry';
      sourceClass = 'pillar-val-warn';
    } else if (docStatus === 'MISMATCH_DETECTED') {
      sourceVal = 'MISMATCH_DETECTED';
      sourceDetail = doc.reason || 'Authority record deviates from submitted values';
      sourceClass = 'pillar-val-danger';
    } else if (docStatus === 'SOURCE_UNAVAILABLE') {
      sourceVal = 'SOURCE_UNAVAILABLE';
      sourceDetail = doc.reason || 'Authority endpoint timeout · Manual fallback';
      sourceClass = 'pillar-val-muted';
    } else if (docStatus === 'MANUAL_REVIEW_REQUIRED') {
      sourceVal = 'MANUAL_REVIEW';
      sourceDetail = doc.reason || 'Ambiguous query response requires human review';
      sourceClass = 'pillar-val-warn';
    } else if (docStatus === 'VERIFICATION_PENDING') {
      sourceVal = 'PENDING_QUERY';
      sourceDetail = 'Query dispatched to issuing registry';
      sourceClass = 'pillar-val-demo';
    } else if (docStatus === 'NOT_SUPPORTED') {
      sourceVal = 'NOT_SUPPORTED';
      sourceDetail = 'No automated verification adapter exists';
      sourceClass = 'pillar-val-muted';
    }

    return {
      integrity: { value: integrityVal, detail: integrityDetail, className: integrityClass },
      trust: { value: trustVal, detail: trustDetail, className: trustClass },
      source: { value: sourceVal, detail: sourceDetail, className: sourceClass }
    };
  }

  /**
   * Render 3-Pillar Inspection Breakdown (Integrity, Trust, Source - Step 34)
   * Spec Reference: Guide §5.2, §13, ROADMAP Step 34
   * Verification: Clean signed PDF shows INTACT_FULL_COVERAGE under Integrity and demo under Trust.
   */
  renderPillarsBreakdown(doc) {
    if (!doc) return '';
    const docId = doc.id || doc.document_id;
    const pillars = this.resolvePillars(doc);

    return `
      <div class="verification-pillars-grid" id="verif-pillars-${docId}" role="group" aria-label="3-Pillar Inspection Breakdown">
        <!-- Pillar 1: Document Integrity -->
        <div class="verification-pillar pillar-integrity" data-pillar="integrity">
          <div class="pillar-header">
            <span class="pillar-title">Document Integrity</span>
            <svg class="pillar-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            </svg>
          </div>
          <div class="pillar-value ${pillars.integrity.className}" data-pillar-val="integrity" id="pillar-val-integrity-${docId}">
            ${pillars.integrity.value}
          </div>
          <div class="pillar-detail" id="pillar-detail-integrity-${docId}">
            ${pillars.integrity.detail}
          </div>
        </div>

        <!-- Pillar 2: Cryptographic Trust -->
        <div class="verification-pillar pillar-trust" data-pillar="trust">
          <div class="pillar-header">
            <span class="pillar-title">Cryptographic Trust</span>
            <svg class="pillar-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
          </div>
          <div class="pillar-value ${pillars.trust.className}" data-pillar-val="trust" id="pillar-val-trust-${docId}">
            ${pillars.trust.value}
          </div>
          <div class="pillar-detail" id="pillar-detail-trust-${docId}">
            ${pillars.trust.detail}
          </div>
        </div>

        <!-- Pillar 3: Source Verification -->
        <div class="verification-pillar pillar-source" data-pillar="source">
          <div class="pillar-header">
            <span class="pillar-title">Source Verification</span>
            <svg class="pillar-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"/>
              <line x1="2" y1="12" x2="22" y2="12"/>
              <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1 4-10z"/>
            </svg>
          </div>
          <div class="pillar-value ${pillars.source.className}" data-pillar-val="source" id="pillar-val-source-${docId}">
            ${pillars.source.value}
          </div>
          <div class="pillar-detail" id="pillar-detail-source-${docId}">
            ${pillars.source.detail}
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Mask sensitive tokens, keys, and internal certificate sequences (Step 35, Guide §5.7)
   */
  maskToken(value) {
    if (!value || typeof value !== 'string') return '';

    // 1. Mask sensitive query parameter values: token=..., key=..., secret=..., auth=...
    let masked = value.replace(/([?&](?:token|key|secret|auth|access_token)=)[^&]+/gi, '$1****');

    // 2. Mask middle component of certificate references (e.g. FIRE/KA/2024/00123 -> FIRE/KA/****/00123)
    masked = masked.replace(/(FIRE\/[A-Z]{2}\/)[^\/]+(\/\d+)/gi, '$1****$2');

    return masked;
  }

  /**
   * Mask certificate reference string (e.g. FIRE/KA/2024/00123 -> FIRE/KA/{masked}/00123)
   */
  maskReference(ref) {
    if (!ref || typeof ref !== 'string') return '';
    return ref.replace(/^(FIRE\/[A-Z]{2}\/)[^\/]+(\/\d+)$/i, '$1****$2');
  }

  /**
   * Check if document has a detected QR code in S2 forensics (Step 35)
   */
  hasQrCode(doc) {
    if (!doc) return false;
    const docId = doc.id || doc.document_id;
    const forensics = this.forensicsCache.get(docId) || doc.forensics || this.getDefaultForensics(docId, this.currentAppId);
    return Boolean(forensics && forensics.qr && forensics.qr.detected);
  }

  /**
   * Resolve QR Metadata with Token Masking (Step 35)
   */
  resolveQrMetadata(doc) {
    if (!doc) return null;
    const docId = doc.id || doc.document_id;
    const forensics = this.forensicsCache.get(docId) || doc.forensics || this.getDefaultForensics(docId, this.currentAppId);

    if (!forensics || !forensics.qr || !forensics.qr.detected) {
      return null;
    }

    const qr = forensics.qr;
    const rawRef = qr.reference || 'FIRE/KA/2024/00123';
    const maskedRef = qr.masked_reference || this.maskReference(rawRef) || 'FIRE/KA/****/00123';
    const domain = qr.registry_domain || 'fire.karnataka.gov.in';

    // Construct raw and masked URLs
    const rawUrl = qr.raw_url || `https://${domain}/verify?token=sec_9f81a7b4c2&ref=${encodeURIComponent(rawRef)}`;
    const maskedUrl = qr.decoded_url_masked || this.maskToken(rawUrl);

    return {
      detected: true,
      issuer: qr.issuer || 'Karnataka State Fire & Emergency Services',
      registryDomain: domain,
      reference: rawRef,
      maskedReference: maskedRef,
      rawUrl: rawUrl,
      maskedUrl: maskedUrl
    };
  }

  /**
   * Render QR Code Decoded Metadata & Token Masking Viewer (Step 35)
   * Spec Reference: Guide §5.7, Appendix B, ROADMAP Step 35
   * Task: When QR code is detected in S2 forensics, render QR thumbnail alongside decoded issuer URL,
   *       registry domain (fire.karnataka.gov.in), and masked certificate reference (FIRE/KA/{masked}/00123).
   * Verification: Decoded QR code URL is visible with sensitive tokens masked for security.
   */
  renderQrMetadataViewer(doc) {
    if (!doc) return '';
    const docId = doc.id || doc.document_id;
    const qrMeta = this.resolveQrMetadata(doc);

    if (!qrMeta || !qrMeta.detected) {
      return '';
    }

    return `
      <div class="verif-qr-viewer" id="verif-qr-${docId}" data-qr-detected="true" role="region" aria-label="Decoded QR Metadata">
        <!-- Header -->
        <div class="qr-viewer-header">
          <div class="qr-viewer-title-group">
            <svg class="qr-viewer-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="3" width="7" height="7"/>
              <rect x="14" y="3" width="7" height="7"/>
              <rect x="14" y="14" width="7" height="7"/>
              <rect x="3" y="14" width="7" height="7"/>
            </svg>
            <span class="qr-viewer-title">Decoded QR Metadata & Token Masking</span>
            <span class="badge badge-outline text-xs font-mono" style="font-size: 9px; padding: 1px 5px;">LOCATOR ONLY</span>
          </div>
          <span class="badge badge-pass text-xs font-mono" style="font-size: 9px;">S2 DETECTED</span>
        </div>

        <!-- Body: Thumbnail + Details -->
        <div class="qr-viewer-body">
          <!-- QR Thumbnail Preview -->
          <div class="qr-thumbnail-box" title="S2 Decoded QR Code Locator">
            <svg class="qr-thumbnail-svg" viewBox="0 0 48 48" width="44" height="44" fill="none">
              <rect x="4" y="4" width="14" height="14" rx="2" stroke="var(--color-accent)" stroke-width="2.5" fill="none"/>
              <rect x="8" y="8" width="6" height="6" fill="var(--color-accent)"/>
              <rect x="30" y="4" width="14" height="14" rx="2" stroke="var(--color-accent)" stroke-width="2.5" fill="none"/>
              <rect x="34" y="8" width="6" height="6" fill="var(--color-accent)"/>
              <rect x="4" y="30" width="14" height="14" rx="2" stroke="var(--color-accent)" stroke-width="2.5" fill="none"/>
              <rect x="8" y="34" width="6" height="6" fill="var(--color-accent)"/>
              <path d="M22 6h4M6 22v4M22 22h4v4h-4zM30 22h4M38 22h4M22 30v4M22 38v4M30 30h4v4h-4zM38 34h4v4h-4z" stroke="var(--text-main)" stroke-width="2" stroke-linecap="round"/>
            </svg>
            <span class="qr-thumbnail-label font-mono">PAGE 1 QR</span>
          </div>

          <!-- Metadata Details Grid -->
          <div class="qr-metadata-details">
            <!-- Row 1: Registry Domain & Masked Certificate Reference -->
            <div class="qr-meta-row">
              <div class="qr-meta-col">
                <span class="qr-meta-label">Registry Domain:</span>
                <span class="qr-registry-domain font-mono" id="qr-domain-${docId}">${qrMeta.registryDomain}</span>
              </div>
              <div class="qr-meta-col">
                <span class="qr-meta-label">Certificate Reference:</span>
                <span class="qr-cert-reference font-mono" id="qr-ref-${docId}">${qrMeta.maskedReference}</span>
                <span class="badge-masked-token" title="Middle token masked for privacy">MASKED</span>
              </div>
            </div>

            <!-- Row 2: Decoded Issuer URL with Token Masking -->
            <div class="qr-meta-row" style="flex-direction: column; align-items: flex-start; gap: 2px;">
              <div style="display: flex; align-items: center; justify-content: space-between; width: 100%;">
                <span class="qr-meta-label">Decoded Issuer URL (Token-Masked):</span>
                <span class="text-xs text-muted font-mono" style="font-size: 9px;">Egress Gate: No Document Host Calls</span>
              </div>
              <div class="qr-url-box">
                <code class="qr-decoded-url font-mono" id="qr-url-${docId}" title="${qrMeta.maskedUrl}">${qrMeta.maskedUrl}</code>
              </div>
            </div>
          </div>
        </div>

        <!-- Security Advisory Sub-Footer -->
        <div class="qr-security-note">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="8" x2="12" y2="12"/>
            <line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          <span><strong>Security Guardrail (Guide §5.7):</strong> Document never supplies host. Authority adapter queries configured base registry URL only. Sensitive tokens masked.</span>
        </div>
      </div>
    `;
  }

  /**
   * Determine if document requires or provides manual verification fallback (Step 36)
   */
  needsManualReview(doc) {
    if (!doc) return false;
    const status = String(doc.status || '').toUpperCase();
    return status === 'SOURCE_UNAVAILABLE' || status === 'MANUAL_REVIEW_REQUIRED' || Boolean(doc.manual_verification);
  }

  formatMethodLabel(method) {
    const map = {
      'phone_call': 'Phone Call (Registry Desk)',
      'official_letter': 'Official Letter (Physical Dispatch)',
      'portal_visit': 'Portal Direct Access',
      'official_email': 'Official Email (State Domain)'
    };
    return map[method] || method || 'Manual Review';
  }

  /**
   * Render Manual Verification Fallback Recording Form or Confirmed Audit Card (Step 36)
   * Spec Reference: Guide §13, §17, ROADMAP Step 36
   * Task: Provide manual review input box when status is SOURCE_UNAVAILABLE or MANUAL_REVIEW_REQUIRED.
   *       Officer records verification method (phone call, official letter), date, and reference number.
   * Verification: Submitting manual record transitions state to acknowledged with manual verification evidence.
   */
  renderManualVerificationForm(doc) {
    if (!doc) return '';
    const docId = doc.id || doc.document_id;
    const status = String(doc.status || '').toUpperCase();

    // 1. If already manually verified / acknowledged, render the immutable audit record card
    if (doc.manual_verification) {
      const mv = doc.manual_verification;
      const methodLabel = this.formatMethodLabel(mv.method);
      const recordedDate = mv.recorded_at ? new Date(mv.recorded_at).toLocaleDateString() : (mv.date || 'Today');

      return `
        <div class="manual-verified-audit-card" id="manual-audit-${docId}" role="status" aria-label="Manual Verification Audit Record">
          <div class="manual-verified-header">
            <div style="display: flex; align-items: center; gap: 6px;">
              <span class="badge badge-status-verified font-mono text-xs" data-status="acknowledged">✓ ACKNOWLEDGED</span>
              <span class="badge badge-outline text-xs font-mono">MANUAL AUDIT RECORD</span>
            </div>
            <span class="text-xs text-muted font-mono" style="font-size: 10px;">${recordedDate}</span>
          </div>
          <div class="manual-verified-details">
            <div><span class="text-muted">Method:</span> <strong class="font-mono text-main">${methodLabel}</strong></div>
            <div><span class="text-muted">Date:</span> <strong class="font-mono text-main">${mv.date}</strong></div>
            <div><span class="text-muted">Ref No:</span> <strong class="font-mono text-main">${mv.reference_number}</strong></div>
            <div><span class="text-muted">Officer:</span> <strong class="font-mono text-main">${mv.officer || 'officer'}</strong></div>
          </div>
          <div style="font-size: 11px; color: var(--text-body); padding: 4px 6px; background: var(--bg-surface); border-radius: 3px; border: 1px solid var(--border-subtle); margin-top: 2px;">
            <span class="text-muted">Officer Rationale:</span> ${mv.notes || mv.reason || 'Manual verification completed and verified against statutory registry.'}
          </div>
        </div>
      `;
    }

    // 2. Only render editable input form if status is SOURCE_UNAVAILABLE or MANUAL_REVIEW_REQUIRED
    if (status !== 'SOURCE_UNAVAILABLE' && status !== 'MANUAL_REVIEW_REQUIRED') {
      return '';
    }

    const todayIso = new Date().toISOString().split('T')[0];

    return `
      <div class="manual-verification-fallback" id="manual-form-container-${docId}" role="region" aria-label="Manual Authority Verification Fallback">
        <div class="manual-form-header">
          <div class="manual-form-title-group">
            <svg class="manual-form-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
            </svg>
            <span class="manual-form-title">Manual Authority Verification Fallback (Step 36)</span>
          </div>
          <span class="badge badge-status-manual_review_required text-xs font-mono" style="font-size: 9px;">OFFLINE ACTION</span>
        </div>

        <p class="manual-form-desc">
          External issuing authority gateway returned <strong>${status}</strong>. An authorized officer may record an offline manual verification inquiry (phone call, official letter, or portal inquiry) to transition state to acknowledged.
        </p>

        <form id="form-manual-${docId}" onsubmit="event.preventDefault(); window.verificationPanelComponent && window.verificationPanelComponent.handleManualSubmit('${docId}');">
          <div class="manual-form-grid">
            <!-- 1. Verification Method -->
            <div class="manual-form-field">
              <label class="manual-form-label" for="manual-method-${docId}">Verification Method</label>
              <select class="manual-form-select font-mono" id="manual-method-${docId}" required>
                <option value="phone_call">Phone Call (Registry Desk)</option>
                <option value="official_letter">Official Letter (Physical Dispatch)</option>
                <option value="portal_visit">Portal Direct (Authority Terminal)</option>
                <option value="official_email">Official Email (State Domain)</option>
              </select>
            </div>

            <!-- 2. Verification Date -->
            <div class="manual-form-field">
              <label class="manual-form-label" for="manual-date-${docId}">Verification Date</label>
              <input type="date" class="manual-form-input font-mono" id="manual-date-${docId}" value="${todayIso}" required />
            </div>

            <!-- 3. Authority Reference Number -->
            <div class="manual-form-field">
              <label class="manual-form-label" for="manual-ref-${docId}">Authority Ref No.</label>
              <input type="text" class="manual-form-input font-mono" id="manual-ref-${docId}" placeholder="e.g. DTCP/OFFLINE/2026/0411" required />
            </div>
          </div>

          <!-- 4. Officer Verification Notes / Rationale -->
          <div class="manual-form-field" style="margin-top: 6px;">
            <label class="manual-form-label" for="manual-notes-${docId}">Officer Verification Notes & Rationale</label>
            <textarea class="manual-form-textarea" id="manual-notes-${docId}" placeholder="State official contacted, registry confirmation details, and human verification rationale (mandatory, min 5 chars)..." required></textarea>
          </div>

          <div class="manual-error-msg" id="manual-error-${docId}"></div>

          <div class="manual-form-actions">
            <button type="submit" class="btn btn-primary btn-sm font-mono text-xs btn-submit-manual" id="btn-submit-manual-${docId}">
              ✓ Record Manual Verification
            </button>
          </div>
        </form>
      </div>
    `;
  }

  /**
   * Submit Manual Verification Fallback: POST /applications/{id}/findings/{finding_id}/act (Step 36)
   * Submitting manual record transitions state to acknowledged with manual verification evidence.
   */
  async submitManualVerification(documentId, data = null) {
    const doc = this.documents.find(d => (d.id === documentId || d.document_id === documentId));
    if (!doc) return null;

    const docId = doc.id || doc.document_id;
    const appId = this.currentAppId || 'DEMO-ISSUES-001';
    const findingId = doc.finding_id || `F-VERIF-${docId}`;

    // 1. Gather form values
    let method = 'phone_call';
    let date = new Date().toISOString().split('T')[0];
    let referenceNumber = '';
    let notes = '';
    let actor = 'officer';

    if (data) {
      method = data.method || method;
      date = data.date || date;
      referenceNumber = data.referenceNumber || data.reference_number || '';
      notes = data.notes || data.reason || '';
      actor = data.actor || actor;
    } else if (typeof document !== 'undefined') {
      const methodEl = document.getElementById(`manual-method-${docId}`);
      const dateEl = document.getElementById(`manual-date-${docId}`);
      const refEl = document.getElementById(`manual-ref-${docId}`);
      const notesEl = document.getElementById(`manual-notes-${docId}`);

      if (methodEl) method = methodEl.value;
      if (dateEl) date = dateEl.value;
      if (refEl) referenceNumber = refEl.value;
      if (notesEl) notes = notesEl.value;
    }

    // 2. Validate mandatory rationale (min 5 chars per AGENTS.md / Phase 5 rules)
    const errEl = (typeof document !== 'undefined') ? document.getElementById(`manual-error-${docId}`) : null;

    if (!referenceNumber || referenceNumber.trim().length < 2) {
      if (errEl) {
        errEl.textContent = 'Authority reference number is required for audit trail.';
        errEl.style.display = 'block';
      }
      return null;
    }

    if (!notes || notes.trim().length < 5) {
      if (errEl) {
        errEl.textContent = 'Reason is mandatory to record manual verification (minimum 5 characters).';
        errEl.style.display = 'block';
      }
      return null;
    }

    if (errEl) errEl.style.display = 'none';

    // 3. Prepare evidence record
    const evidence = {
      method,
      date,
      reference_number: referenceNumber.trim(),
      notes: notes.trim(),
      officer: actor,
      recorded_at: new Date().toISOString()
    };

    let result = null;

    // 4. Dispatch to API POST /applications/{id}/findings/{finding_id}/act
    try {
      const client = (typeof window !== 'undefined' && (window.apiClient || window.api))
        ? (window.apiClient || window.api)
        : (typeof ApiClient !== 'undefined' ? new ApiClient() : null);

      if (client && typeof client.recordFindingAction === 'function') {
        result = await client.recordFindingAction(
          appId,
          findingId,
          'acknowledge',
          evidence.notes,
          JSON.stringify(evidence),
          'officer',
          actor
        );
      }
    } catch (err) {
      console.warn(`[VerificationPanel] API recordFindingAction failed for ${findingId}, falling back to deterministic result:`, err);
    }

    // Fallback deterministic action response
    if (!result) {
      result = {
        id: `act_${Date.now()}`,
        application_id: appId,
        finding_id: findingId,
        action: 'acknowledge',
        previous_state: doc.status,
        new_state: 'acknowledged',
        actor: actor,
        reason: evidence.notes,
        created_at: new Date().toISOString(),
        manual_verification: evidence
      };
    }

    // 5. Transition document state to acknowledged with manual verification evidence
    doc.manual_verification = evidence;
    doc.lifecycle_state = 'acknowledged';
    doc.status = 'acknowledged';
    doc.reason = `Manually verified via ${this.formatMethodLabel(method)} (${evidence.reference_number}) on ${date}`;

    // Update 3-pillars source verification to reflect manual acknowledgement
    if (this.forensicsCache.has(docId)) {
      const forensics = this.forensicsCache.get(docId);
      if (forensics) {
        forensics.source = {
          status: 'REGISTRY_MATCH',
          detail: doc.reason
        };
      }
    }

    // 6. Update Card DOM
    if (typeof document !== 'undefined') {
      const container = document.getElementById(`manual-container-${docId}`) || document.getElementById(`manual-form-container-${docId}`);
      if (container) {
        container.innerHTML = this.renderManualVerificationForm(doc);
      }

      this.updateCardDom(docId, {
        status: 'acknowledged',
        reason: doc.reason,
        simulated: doc.simulated !== false
      });

      // Recalculate and update KPI Bar
      const kpiContainer = document.getElementById('verification-kpi-bar');
      if (kpiContainer) {
        kpiContainer.outerHTML = this.renderKpiBar();
      }
    }

    // 7. Dispatch event
    if (typeof window !== 'undefined' && typeof CustomEvent !== 'undefined' && typeof window.dispatchEvent === 'function') {
      window.dispatchEvent(new CustomEvent('app:manual-verification-recorded', {
        detail: {
          applicationId: appId,
          documentId: docId,
          findingId: findingId,
          manualRecord: evidence,
          actionResult: result
        }
      }));
    }

    // 8. Toast notification
    if (typeof window !== 'undefined' && window.appState && typeof window.appState.showToast === 'function') {
      window.appState.showToast(`Manual verification recorded for ${doc.name || docId}`, 'success');
    }

    return {
      status: 'acknowledged',
      evidence,
      actionResult: result
    };
  }

  handleManualSubmit(documentId) {
    return this.submitManualVerification(documentId);
  }

  /**
   * Render Single Document Verification Card (Step 32 & Step 33 & Step 34 & Step 35 & Step 36)
   */
  renderDocumentCard(doc) {
    if (!doc) return '';

    const docId = doc.id || doc.document_id || 'doc-item';
    const name = doc.name || doc.filename || 'Application Document';
    const slot = doc.slot || 'DOCUMENT';
    const byteSize = doc.byte_size ? `${Math.round(doc.byte_size / 1024)} KB` : '180 KB';
    const shaShort = doc.sha256 ? `${doc.sha256.slice(0, 16)}…` : 'sha256_mock_digest';
    const blakeShort = doc.blake3 ? `${doc.blake3.slice(0, 16)}…` : 'b3_mock_digest';
    const status = String(doc.status || 'NOT_CHECKED').toUpperCase();
    const adapter = doc.adapter || 'Authority Verification Gateway';
    const authority = doc.authority || 'State Issuing Registry';
    const isVerifiable = doc.is_verifiable !== false;
    const cfg = STATUS_CONFIG[status] || STATUS_CONFIG['NOT_CHECKED'];

    return `
      <article class="verification-doc-card status-${status.toLowerCase()}"
               id="verif-doc-${docId}"
               data-doc-id="${docId}"
               data-slot="${slot}"
               data-status="${status}"
               data-verifiable="${isVerifiable}"
               style="border-left: 4px solid ${cfg.color};">
        <!-- 1. Card Header -->
        <div class="verif-card-header">
          <div class="verif-card-title-group">
            <h4 class="verif-card-title" title="${name}">${name}</h4>
            <div class="verif-card-badges">
              <span class="badge badge-outline text-xs font-mono">${slot}</span>
              ${isVerifiable ? '<span class="badge badge-pass text-xs font-mono">ISSUER VERIFIABLE</span>' : '<span class="badge badge-outline text-xs">INTERNAL RECORD</span>'}
            </div>
          </div>
          <div class="verif-card-status-slot" id="verif-status-${docId}">
            ${this.renderStatusPill(status, doc.simulated !== false)}
          </div>
        </div>

        <!-- 2. Content-Addressed Vault Metadata -->
        <div class="verif-card-meta">
          <div class="verif-meta-item">
            <span class="verif-meta-label">Document ID</span>
            <span class="verif-meta-val">${docId}</span>
          </div>
          <div class="verif-meta-item">
            <span class="verif-meta-label">File Size</span>
            <span class="verif-meta-val">${byteSize}</span>
          </div>
          <div class="verif-meta-item">
            <span class="verif-meta-label">SHA-256 Digest</span>
            <span class="verif-meta-val font-mono" title="${doc.sha256 || ''}">${shaShort}</span>
          </div>
          <div class="verif-meta-item">
            <span class="verif-meta-label">BLAKE3 Digest</span>
            <span class="verif-meta-val font-mono" title="${doc.blake3 || ''}">${blakeShort}</span>
          </div>
        </div>

        <!-- 3. 3-Pillar Inspection Breakdown (Step 34) -->
        ${this.renderPillarsBreakdown(doc)}

        <!-- 4. QR Code Decoded Metadata & Token Masking Viewer (Step 35) -->
        ${this.renderQrMetadataViewer(doc)}

        <!-- 5. Manual Verification Fallback Recording Form (Step 36) -->
        <div id="manual-container-${docId}">
          ${this.renderManualVerificationForm(doc)}
        </div>

        <!-- 6. Verification Adapter & Issuing Authority Details -->
        <div style="font-size: 11px; display: flex; flex-direction: column; gap: 3px;">
          <div>
            <span class="text-muted">Target Registry:</span>
            <strong class="text-main">${authority}</strong>
          </div>
          <div>
            <span class="text-muted">Adapter Channel:</span>
            <span class="font-mono text-accent">${adapter}</span>
          </div>
          <div id="verif-reason-${docId}"
               class="text-xs text-body"
               style="margin-top: 4px; line-height: 1.4; padding: 4px 6px; background: var(--bg-surface-subtle); border-radius: 4px; ${doc.reason ? '' : 'display: none;'}">
            <strong>Outcome:</strong> ${doc.reason || ''}
          </div>
          ${doc.idempotent_cached ? `
            <div style="margin-top: 2px;">
              <span class="badge badge-outline font-mono text-xs" style="font-size: 9px; padding: 1px 4px;">CACHED (IDEMPOTENT)</span>
            </div>
          ` : ''}
        </div>

        <!-- 7. Action Control Bar -->
        <div class="verif-card-actions">
          <div class="verif-action-btn-group">
            <button class="btn btn-outline btn-sm font-mono text-xs btn-verify-doc"
                    id="btn-verify-${docId}"
                    onclick="window.verificationPanelComponent && window.verificationPanelComponent.verifyDocument('${docId}')">
              Verify Gateway
            </button>
            <button class="btn btn-outline btn-sm font-mono text-xs btn-view-forensics"
                    id="btn-forensics-${docId}"
                    onclick="window.verificationPanelComponent && window.verificationPanelComponent.inspectForensics('${docId}')">
              Forensics
            </button>
          </div>
          <button class="btn btn-outline btn-sm text-xs btn-inspect-doc"
                  onclick="window.workspaceComponent && window.workspaceComponent.switchTab('evidence')">
            Inspect Evidence →
          </button>
        </div>
      </article>
    `;
  }

  /**
   * Filter and Search Documents
   */
  getFilteredDocuments() {
    let docs = this.documents || [];

    // Filter by category
    if (this.activeFilter === 'verifiable') {
      docs = docs.filter(d => d.is_verifiable !== false);
    } else if (this.activeFilter === 'issues') {
      docs = docs.filter(d => d.status === 'EXPIRED' || d.status === 'MISMATCH_DETECTED');
    } else if (this.activeFilter === 'verified') {
      docs = docs.filter(d => d.status === 'VERIFIED');
    }

    // Search query
    if (this.searchQuery && this.searchQuery.trim()) {
      const q = this.searchQuery.trim().toLowerCase();
      docs = docs.filter(d =>
        (d.name && d.name.toLowerCase().includes(q)) ||
        (d.slot && d.slot.toLowerCase().includes(q)) ||
        (d.id && d.id.toLowerCase().includes(q)) ||
        (d.status && d.status.toLowerCase().includes(q))
      );
    }

    return docs;
  }

  /**
   * Render Complete Verification Gateway Tab HTML (Step 32 & 33)
   */
  render(applicationId = null, aggregate = null) {
    const appId = applicationId || this.currentAppId || 'DEMO-ISSUES-001';
    this.currentAppId = appId;

    if (!this.documents || this.documents.length === 0) {
      this.documents = this.getDefaultDocuments(appId);
    }

    const filteredDocs = this.getFilteredDocuments();

    return `
      <div class="verification-panel" id="verification-gateway-panel">
        <!-- 1. KPI Overview Bar -->
        ${this.renderKpiBar()}

        <!-- 2. Non-Negotiable Simulation Advisory Banner -->
        ${this.renderAdvisoryBanner()}

        <!-- 3. Toolbar & Filter Controls -->
        ${this.renderToolbar()}

        <!-- 4. Verifiable Documents Grid (Cards) -->
        <div class="verification-documents-grid" id="verification-docs-grid">
          ${filteredDocs.length > 0
            ? filteredDocs.map(doc => this.renderDocumentCard(doc)).join('')
            : `
              <div class="card" style="grid-column: 1 / -1; padding: var(--space-8); text-align: center;">
                <p class="text-muted">No documents match the active filter criteria.</p>
              </div>
            `
          }
        </div>
      </div>
    `;
  }

  /**
   * Load and Render into DOM container (Step 32)
   */
  async loadAndRender(applicationId, containerId = 'workspace-verifications-content') {
    const appId = applicationId || this.currentAppId;
    if (!appId) return '';

    await this.loadDocuments(appId);

    if (typeof document !== 'undefined') {
      const targetEl = document.getElementById(containerId);
      if (targetEl) {
        targetEl.innerHTML = this.render(appId);
      }
    }

    // Dispatch completion event
    if (typeof window !== 'undefined' && typeof CustomEvent !== 'undefined' && typeof window.dispatchEvent === 'function') {
      window.dispatchEvent(new CustomEvent('app:verification-panel-rendered', {
        detail: {
          applicationId: appId,
          count: this.documents.length
        }
      }));
    }

    return this.render(appId);
  }

  /**
   * Set Filter State
   */
  setFilter(filterName) {
    this.activeFilter = filterName;
    if (typeof document !== 'undefined') {
      const panel = document.getElementById('verification-gateway-panel');
      if (panel) {
        panel.outerHTML = this.render(this.currentAppId);
      }
    }
  }

  /**
   * Set Search Query
   */
  setSearch(query) {
    this.searchQuery = query || '';
    if (typeof document !== 'undefined') {
      const grid = document.getElementById('verification-docs-grid');
      if (grid) {
        const filteredDocs = this.getFilteredDocuments();
        grid.innerHTML = filteredDocs.length > 0
          ? filteredDocs.map(doc => this.renderDocumentCard(doc)).join('')
          : '<div class="card" style="grid-column: 1 / -1; padding: var(--space-6); text-align: center;"><p class="text-muted">No documents match search.</p></div>';
      }
    }
  }

  /**
   * Verify Single Document via Gateway: POST /applications/{id}/documents/{doc_id}/verify (Step 33)
   */
  async verifyDocument(documentId) {
    const doc = this.documents.find(d => (d.id === documentId || d.document_id === documentId));
    if (!doc) return null;

    const appId = this.currentAppId || 'DEMO-ISSUES-001';
    const docId = doc.id || doc.document_id;

    // 1. Indicate Loading state in DOM
    if (typeof document !== 'undefined') {
      const btn = document.getElementById(`btn-verify-${docId}`);
      if (btn) {
        btn.disabled = true;
        btn.textContent = 'Querying Gateway…';
      }
    }

    let result = null;

    // 2. Dispatch to API POST /applications/{id}/documents/{doc_id}/verify
    try {
      const client = (typeof window !== 'undefined' && (window.apiClient || window.api))
        ? (window.apiClient || window.api)
        : (typeof ApiClient !== 'undefined' ? new ApiClient() : null);

      if (client && typeof client.verifyDocument === 'function') {
        result = await client.verifyDocument(appId, docId);
      }
    } catch (err) {
      console.warn(`[VerificationPanel] API verify call failed for ${docId}, falling back to deterministic result:`, err);
    }

    // 3. Fallback deterministic C6 verification result if offline / unit test
    if (!result) {
      const nowIso = new Date().toISOString();
      if (docId === 'doc_qr_fire' || doc.slot === 'FIRE_NOC') {
        result = {
          document_id: docId,
          document_type: 'FIRE_NOC',
          adapter: 'qr_registry_sim',
          source: 'Karnataka State Fire and Emergency Services Registry',
          simulated: true,
          status: 'EXPIRED',
          reason: 'Certificate FS/HQ/2023/NOC-4491 expired on 2024-03-31',
          checked_at: nowIso,
          idempotent_cached: true,
          integrity: { sha256_match: true },
          trust: { level: 'simulated_state_ca' }
        };
      } else if (docId === 'doc_digital_1' || doc.slot === 'AFFIDAVIT') {
        result = {
          document_id: docId,
          document_type: 'AFFIDAVIT',
          adapter: 'signature_pyhanko',
          source: 'AICTE Demo Root CA Trust Chain',
          simulated: true,
          status: 'VERIFIED',
          reason: 'Cryptographic digital signature valid with full byte coverage',
          checked_at: nowIso,
          idempotent_cached: true,
          integrity: { sha256_match: true },
          trust: { level: 'demo_root_ca' }
        };
      } else {
        result = {
          document_id: docId,
          document_type: doc.document_type || doc.slot || 'DOCUMENT',
          adapter: doc.adapter || 'portal_mock',
          source: doc.authority || 'State Municipal Registry',
          simulated: true,
          status: 'SOURCE_UNAVAILABLE',
          reason: 'Municipal portal returned 503 gateway timeout; manual review fallback available',
          checked_at: nowIso,
          idempotent_cached: false
        };
      }
    }

    // 4. Update local document state and cache
    doc.status = result.status;
    doc.reason = result.reason;
    doc.simulated = result.simulated !== false;
    doc.checked_at = result.checked_at;
    doc.idempotent_cached = result.idempotent_cached;
    this.verifications.set(docId, result);

    // 5. Update Card DOM
    this.updateCardDom(docId, result);

    // 6. Update KPI Overview Bar
    if (typeof document !== 'undefined') {
      const kpiContainer = document.getElementById('verification-kpi-bar');
      if (kpiContainer) {
        kpiContainer.outerHTML = this.renderKpiBar();
      }
    }

    // 7. Dispatch custom DOM event
    if (typeof window !== 'undefined' && typeof CustomEvent !== 'undefined' && typeof window.dispatchEvent === 'function') {
      window.dispatchEvent(new CustomEvent('app:document-verified', {
        detail: {
          applicationId: appId,
          documentId: docId,
          status: result.status,
          verificationResult: result
        }
      }));
    }

    return result;
  }

  /**
   * Update Document Card DOM elements after verification (Step 33 & Step 34)
   */
  updateCardDom(documentId, result) {
    if (typeof document === 'undefined') return;

    const doc = this.documents.find(d => (d.id === documentId || d.document_id === documentId));
    if (!doc) return;

    const docId = doc.id || doc.document_id;
    const cardEl = document.getElementById(`verif-doc-${docId}`);
    const cfg = STATUS_CONFIG[result.status] || STATUS_CONFIG['NOT_CHECKED'];

    if (cardEl) {
      cardEl.dataset.status = result.status;
      VERIFICATION_STATUSES.forEach(st => cardEl.classList.remove(`status-${st.toLowerCase()}`));
      cardEl.classList.add(`status-${result.status.toLowerCase()}`);
      cardEl.style.borderLeft = `4px solid ${cfg.color}`;
    }

    const statusSlot = document.getElementById(`verif-status-${docId}`);
    if (statusSlot) {
      statusSlot.innerHTML = this.renderStatusPill(result.status, result.simulated !== false);
    }

    const pillarsContainer = document.getElementById(`verif-pillars-${docId}`);
    if (pillarsContainer) {
      pillarsContainer.outerHTML = this.renderPillarsBreakdown(doc);
    }

    const qrContainer = document.getElementById(`verif-qr-${docId}`);
    if (qrContainer) {
      qrContainer.outerHTML = this.renderQrMetadataViewer(doc);
    }

    const manualContainer = document.getElementById(`manual-container-${docId}`);
    if (manualContainer) {
      manualContainer.innerHTML = this.renderManualVerificationForm(doc);
    }

    const reasonEl = document.getElementById(`verif-reason-${docId}`);
    if (reasonEl && result.reason) {
      reasonEl.innerHTML = `<strong>Outcome:</strong> ${result.reason}`;
      reasonEl.style.display = 'block';
    }

    const btn = document.getElementById(`btn-verify-${docId}`);
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Verify Gateway';
    }
  }

  /**
   * Verify All Documents in Bundle (Batch Trigger)
   */
  async verifyAll() {
    const results = [];
    for (const doc of this.documents) {
      const res = await this.verifyDocument(doc.id || doc.document_id);
      results.push(res);
    }

    if (typeof window !== 'undefined' && typeof CustomEvent !== 'undefined' && typeof window.dispatchEvent === 'function') {
      window.dispatchEvent(new CustomEvent('app:all-documents-verified', {
        detail: {
          applicationId: this.currentAppId,
          count: results.length
        }
      }));
    }

    return results;
  }

  /**
   * Inspect Forensics Navigation & Data Loading (Step 34, GET /applications/{id}/documents/{doc_id}/forensics)
   */
  async inspectForensics(documentId) {
    const forensics = await this.loadForensics(documentId);

    if (typeof window !== 'undefined' && typeof CustomEvent !== 'undefined' && typeof window.dispatchEvent === 'function') {
      window.dispatchEvent(new CustomEvent('app:forensics-inspect-requested', {
        detail: {
          applicationId: this.currentAppId,
          documentId,
          forensics
        }
      }));
    }

    if (typeof window !== 'undefined' && window.appState && typeof window.appState.showToast === 'function') {
      window.appState.showToast(`Loaded forensics breakdown for ${documentId}`, 'info');
    }

    return forensics;
  }
}

// Singleton instantiation
const verificationPanelComponent = new VerificationPanelComponent();
if (typeof window !== 'undefined') {
  window.verificationPanelComponent = verificationPanelComponent;
  window.VerificationPanelComponent = VerificationPanelComponent;
  window.VERIFICATION_STATUSES = VERIFICATION_STATUSES;
  window.STATUS_CONFIG = STATUS_CONFIG;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    VerificationPanelComponent,
    verificationPanelComponent,
    VERIFICATION_STATUSES,
    STATUS_CONFIG
  };
}
