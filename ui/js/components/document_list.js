/**
 * AICTE Application Validation Platform — Document List & S3 Routing Badge Binder
 * Spec Reference: ROADMAP.md (Phase 2, Step 11 & Step 12), Guide §6
 *
 * Responsibilities:
 * 1. Query and bind S3 Document Routing verdicts (BRANCH_A_DIGITAL, BRANCH_B_SCANNED, MIXED).
 * 2. Render routing badge indicators with deterministic visual styling.
 * 3. Inspect per-page metrics (visible chars, invisible OCR trace, image coverage, vector paths).
 * 4. Cache routing responses in-memory to prevent duplicate network calls.
 * 5. Provide routing inspection modal for deep officer scrutiny.
 */

const ROUTING_METADATA = {
  BRANCH_A_DIGITAL: {
    label: 'BRANCH_A_DIGITAL',
    title: 'Branch A (Born-Digital Vector PDF)',
    cssClass: 'badge-routing-digital',
    description: 'Native extractable vector text layer detected. Direct text stream ingestion (no OCR rasterization needed).',
    pipelineTarget: 'docling_no_ocr'
  },
  BRANCH_B_SCANNED: {
    label: 'BRANCH_B_SCANNED',
    title: 'Branch B (Scanned Raster)',
    cssClass: 'badge-routing-scanned',
    description: 'Raster image coverage >= 60% or raw image file (PNG/JPEG). Dispatched to Tesseract/EasyOCR ladder.',
    pipelineTarget: 'ocr_ladder'
  },
  MIXED: {
    label: 'MIXED',
    title: 'Mixed Digital & Scanned',
    cssClass: 'badge-routing-mixed',
    description: 'Multi-page document containing both born-digital vector pages and scanned raster pages. Dispatched per-page.',
    pipelineTarget: 'hybrid_pipeline'
  },
  VECTOR_DRAWING: {
    label: 'VECTOR_DRAWING',
    title: 'Vector Architectural Plan',
    cssClass: 'badge-routing-vector',
    description: 'High vector path density with sparse text. Architectural / floor / site plan drawing.',
    pipelineTarget: 'cad_layout'
  },
  BLANK_DOCUMENT: {
    label: 'BLANK_DOCUMENT',
    title: 'Blank Document',
    cssClass: 'badge-warn',
    description: 'Document contains zero visible characters, zero image coverage, and no vector paths.',
    pipelineTarget: 'none'
  },
  CORRUPT_DOCUMENT: {
    label: 'CORRUPT_DOCUMENT',
    title: 'Corrupt Document',
    cssClass: 'badge-fail',
    description: 'Document structure corrupted or unreadable.',
    pipelineTarget: 'none'
  },
  ENCRYPTED_PDF: {
    label: 'ENCRYPTED_PDF',
    title: 'Encrypted / Password-Protected PDF',
    cssClass: 'badge-fail',
    description: 'PDF contains /Encrypt dictionary. Password protection rejected per policy.',
    pipelineTarget: 'none'
  }
};

class DocumentListComponent {
  constructor() {
    this.routeCache = new Map(); // Key: `${applicationId}:${documentId}`
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
   * Initialize event bindings
   */
  init() {
    if (this.isInitialized) return;

    // Listen to document upload completions to auto-route
    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      window.addEventListener('app:documents-uploaded', (e) => {
        if (e.detail && e.detail.results) {
          e.detail.results.forEach(res => {
            this.fetchAndBindRoute(res.application_id, res.document_id).catch(() => {});
          });
        }
      });
    }

    this.isInitialized = true;
  }

  /**
   * Generate styled routing badge HTML (Step 11)
   */
  getRoutingBadge(routingOutcome, metrics = null, interactive = true) {
    const meta = ROUTING_METADATA[routingOutcome] || {
      label: routingOutcome || 'UNROUTED',
      title: routingOutcome || 'Unrouted Document',
      cssClass: 'badge-notchecked',
      description: 'Document routing has not yet been determined.'
    };

    const clickAttr = interactive && metrics && metrics.application_id && metrics.document_id
      ? `onclick="window.documentListComponent.openRoutingInspectorModal('${metrics.application_id}', '${metrics.document_id}')" style="cursor: pointer;"`
      : '';

    return `
      <span class="badge ${meta.cssClass}" title="${meta.title}: ${meta.description}" ${clickAttr}>
        ${meta.label}
      </span>
    `;
  }

  /**
   * Fetch S3 routing result for a document and bind badge to DOM elements (Step 11)
   */
  async fetchAndBindRoute(applicationId, documentId) {
    if (!applicationId || !documentId) return null;

    const cacheKey = `${applicationId}:${documentId}`;
    if (this.routeCache.has(cacheKey)) {
      const cached = this.routeCache.get(cacheKey);
      this.bindBadgeToDOM(documentId, cached);
      return cached;
    }

    try {
      const client = (typeof window !== 'undefined' && window.apiClient) ? window.apiClient : new ApiClient();
      // Try GET cached route first; if 404, trigger POST to compute
      let result;
      try {
        result = await client.getDocumentRoute(applicationId, documentId);
      } catch (err) {
        if (err.status === 404 || err.status === 405) {
          result = await client.routeDocument(applicationId, documentId);
        } else {
          throw err;
        }
      }

      this.routeCache.set(cacheKey, result);
      this.bindBadgeToDOM(documentId, result);

      if (typeof window !== 'undefined' && typeof CustomEvent !== 'undefined' && typeof window.dispatchEvent === 'function') {
        window.dispatchEvent(new CustomEvent('app:document-routed', {
          detail: {
            applicationId,
            documentId,
            routeResult: result
          }
        }));
      }

      return result;
    } catch (err) {
      console.error(`[DocumentList] Error fetching S3 route for ${documentId}:`, err);
      return null;
    }
  }

  /**
   * Update badge placeholder elements in DOM
   */
  bindBadgeToDOM(documentId, routeResult) {
    if (typeof document === 'undefined') return;

    const elements = document.querySelectorAll(`[data-route-badge-for="${documentId}"]`);
    elements.forEach(el => {
      el.innerHTML = this.getRoutingBadge(routeResult.routing_outcome, routeResult);
    });
  }

  /**
   * Open S3 Routing Forensics & Metrics inspection modal
   */
  openRoutingInspectorModal(applicationId, documentId) {
    if (typeof window === 'undefined' || !window.navbarComponent) return;

    const cacheKey = `${applicationId}:${documentId}`;
    const route = this.routeCache.get(cacheKey);

    if (!route) {
      this.fetchAndBindRoute(applicationId, documentId).then(res => {
        if (res) this.openRoutingInspectorModal(applicationId, documentId);
      });
      return;
    }

    const meta = ROUTING_METADATA[route.routing_outcome] || {};
    const title = `S3 Document Routing Analysis — ${documentId}`;

    const bodyHtml = `
      <div style="display: flex; flex-direction: column; gap: var(--space-4);">
        <!-- Routing Outcome Banner -->
        <div class="card" style="padding: var(--space-4); background: var(--bg-surface-subtle); border-left: 4px solid var(--color-accent);">
          <div class="flex items-center justify-between" style="margin-bottom: var(--space-2); flex-wrap: wrap; gap: var(--space-2);">
            <div>
              <strong style="font-size: var(--font-size-base);">${meta.title || route.routing_outcome}</strong>
              <div class="text-xs text-muted" style="margin-top: 2px;">${route.reason || meta.description}</div>
            </div>
            ${this.getRoutingBadge(route.routing_outcome, route, false)}
          </div>
          <div class="flex gap-4" style="margin-top: var(--space-3); font-size: var(--font-size-xs); color: var(--text-muted); flex-wrap: wrap;">
            <span>Document ID: <code class="font-mono text-main">${route.document_id}</code></span>
            <span>Slot: <span class="badge badge-outline text-xs">${route.doc_slot || 'unspecified'}</span></span>
            <span>Total Pages: <strong>${route.total_pages}</strong></span>
            <span>Format: <strong>${route.detected_kind.toUpperCase()}</strong></span>
          </div>
        </div>

        <!-- Metric Insights Grid -->
        <div>
          <h4 style="margin: 0 0 var(--space-2) 0; font-size: var(--font-size-sm);">Routing Threshold Breakdown (Guide §6)</h4>
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: var(--space-3);">
            <div class="card" style="padding: var(--space-3); background: var(--bg-surface);">
              <div class="text-xs text-muted">Pipeline Dispatch</div>
              <strong class="font-mono text-sm" style="color: var(--color-primary);">${meta.pipelineTarget || 'standard'}</strong>
              <div class="text-xs text-faint" style="margin-top: 2px;">Downstream engine target</div>
            </div>
            <div class="card" style="padding: var(--space-3); background: var(--bg-surface);">
              <div class="text-xs text-muted">Page Class Distribution</div>
              <div class="text-xs font-mono" style="margin-top: 4px;">
                ${Object.entries(route.page_counts || {}).map(([k, v]) => `<div>${k}: <strong>${v}</strong></div>`).join('')}
              </div>
            </div>
            <div class="card" style="padding: var(--space-3); background: var(--bg-surface);">
              <div class="text-xs text-muted">Cryptographic Digest</div>
              <div class="text-xs font-mono text-muted" style="margin-top: 4px; word-break: break-all;">
                BLAKE3: ${route.blake3 ? route.blake3.slice(0, 16) : ''}…
              </div>
            </div>
          </div>
        </div>

        <!-- Per-Page Breakdown Table (if multi-page) -->
        ${route.page_verdicts && route.page_verdicts.length > 0 ? `
          <div>
            <h4 style="margin: 0 0 var(--space-2) 0; font-size: var(--font-size-sm);">Per-Page Inspection Verdicts</h4>
            <div style="max-height: 200px; overflow-y: auto; border: 1px solid var(--border-subtle); border-radius: var(--radius-md);">
              <table style="width: 100%; border-collapse: collapse; font-size: var(--font-size-xs);">
                <thead>
                  <tr style="background: var(--bg-surface-subtle); border-bottom: 1px solid var(--border-subtle); text-align: left;">
                    <th style="padding: var(--space-2) var(--space-3);">Page #</th>
                    <th style="padding: var(--space-2) var(--space-3);">Classification</th>
                    <th style="padding: var(--space-2) var(--space-3);">Metrics</th>
                    <th style="padding: var(--space-2) var(--space-3);">Rationale</th>
                  </tr>
                </thead>
                <tbody>
                  ${route.page_verdicts.map(pv => `
                    <tr style="border-bottom: 1px solid var(--border-subtle);">
                      <td style="padding: var(--space-2) var(--space-3); font-weight: bold;">Page ${pv.page_index}</td>
                      <td style="padding: var(--space-2) var(--space-3);"><span class="badge badge-outline text-xs">${pv.label}</span></td>
                      <td style="padding: var(--space-2) var(--space-3); font-family: var(--font-mono); color: var(--text-muted);">
                        ${pv.metrics ? `chars: ${pv.metrics.visible ?? 0}, img: ${Math.round((pv.metrics.cover_max ?? 0) * 100)}%` : '—'}
                      </td>
                      <td style="padding: var(--space-2) var(--space-3); color: var(--text-muted);">${pv.reason}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          </div>
        ` : ''}

        <!-- Regulatory Notice -->
        <div class="advisory-banner" style="margin: 0;">
          <strong>Stage Boundary (S3 Route):</strong>
          Determines branch dispatch only. Raw-byte forensics (S2) and fact extraction (S4-S6) execute separately.
        </div>
      </div>
    `;

    const footerHtml = `
      <div class="flex justify-between items-center" style="width: 100%;">
        <span class="text-xs text-muted font-mono">Stage: S3_ROUTER · ${route.processing_state}</span>
        <button class="btn btn-outline btn-sm" onclick="window.navbarComponent.closeModal()">Close</button>
      </div>
    `;

    window.navbarComponent.openModal(title, bodyHtml, footerHtml);
  }

  /**
   * Render a content-addressed document card (Step 12)
   */
  renderDocumentCard(doc) {
    const docId = doc.document_id || doc.id || 'unknown';
    const appId = doc.application_id || (window.appState && window.appState.getState('selectedAppId')) || '';
    const slot = doc.doc_slot || doc.slot || 'unspecified';
    const byteSize = doc.byte_size || doc.size || 0;
    const formattedSize = this.formatBytes(byteSize);
    const blake3Full = doc.blake3 || '';
    const blake3Short = blake3Full ? blake3Full.slice(0, 16) : '—';
    const sha256Full = doc.sha256 || '';
    const sha256Short = sha256Full ? sha256Full.slice(0, 16) : '—';
    const mediaType = doc.media_type || doc.detected_media_type || 'application/pdf';
    const isPdf = mediaType.includes('pdf');
    const iconLabel = isPdf ? 'PDF' : 'IMG';

    const routeOutcome = doc.routing_outcome || (doc.route && doc.route.routing_outcome);
    let routingBadgeHtml = '';
    if (routeOutcome) {
      routingBadgeHtml = this.getRoutingBadge(routeOutcome, { ...doc, application_id: appId, document_id: docId });
    } else {
      routingBadgeHtml = `<span data-route-badge-for="${docId}">${this.getRoutingBadge(null, null, false)}</span>`;
    }

    return `
      <div class="document-card" id="doc-card-${docId}" data-doc-id="${docId}">
        <div class="document-card-header">
          <div class="document-card-title">
            <div class="staged-file-icon" style="${isPdf ? 'color: #dc2626; background: rgba(220, 38, 38, 0.08);' : 'color: #0066cc; background: rgba(0, 102, 204, 0.08);'}">
              ${iconLabel}
            </div>
            <div>
              <div style="font-weight: 600; font-size: var(--font-size-sm);">${docId}</div>
              <div class="text-xs text-muted" style="margin-top: 1px;">
                <span class="badge badge-outline text-xs" style="padding: 1px 6px; font-size: 10px;">${slot}</span>
                <span>·</span>
                <span>${formattedSize}</span>
              </div>
            </div>
          </div>
          <div>
            ${routingBadgeHtml}
          </div>
        </div>

        <!-- Cryptographic Hashes (Step 12) -->
        <div style="display: flex; flex-direction: column; gap: var(--space-1); margin-top: var(--space-1);">
          <div class="hash-pill" title="BLAKE3 Digest: ${blake3Full}">
            <span class="hash-label">BLAKE3:</span>
            <code class="hash-value">${blake3Short}…</code>
            <button class="btn-copy-hash" title="Copy full BLAKE3 hash" onclick="window.documentListComponent.copyToClipboard('${blake3Full}', 'BLAKE3')">📋</button>
          </div>
          <div class="hash-pill" title="SHA-256 Digest: ${sha256Full}">
            <span class="hash-label">SHA-256:</span>
            <code class="hash-value">${sha256Short}…</code>
            <button class="btn-copy-hash" title="Copy full SHA-256 hash" onclick="window.documentListComponent.copyToClipboard('${sha256Full}', 'SHA-256')">📋</button>
          </div>
        </div>

        <!-- Action Buttons (Step 12) -->
        <div class="document-card-actions">
          <button class="btn btn-outline btn-sm" onclick="window.documentListComponent.inspectForensics('${appId}', '${docId}')" title="Inspect raw-byte metadata, EXIF, and digital signatures">
            Inspect Forensics
          </button>
          <button class="btn btn-primary btn-sm" onclick="window.documentListComponent.runExtraction('${appId}', '${docId}')" title="Run S4 extraction and S6 field bounding box grounding">
            Run Extraction
          </button>
          <button class="btn btn-outline btn-sm" onclick="window.documentListComponent.viewInEvidence('${appId}', '${docId}')" title="Inspect page raster and bounding boxes in Evidence Viewer">
            View in Evidence
          </button>
        </div>
      </div>
    `;
  }

  /**
   * Focus document in Evidence Viewer (Step 12 & Phase 5)
   */
  viewInEvidence(applicationId, documentId) {
    if (typeof window === 'undefined') return;

    if (window.appState && typeof window.appState.setSelectedDoc === 'function') {
      window.appState.setSelectedDoc(documentId);
    }

    if (window.workspaceComponent && typeof window.workspaceComponent.switchTab === 'function') {
      window.workspaceComponent.switchTab('evidence');
    } else {
      window.location.hash = `#application/${applicationId}/evidence`;
    }

    if (window.evidenceViewerComponent && typeof window.evidenceViewerComponent.switchDocument === 'function') {
      window.evidenceViewerComponent.switchDocument(documentId);
    }
  }

  /**
   * Copy hash to clipboard with user feedback toast
   */
  copyToClipboard(text, label = 'Digest') {
    if (!text) return;
    if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      navigator.clipboard.writeText(text).then(() => {
        if (typeof window !== 'undefined' && window.appState && typeof window.appState.showToast === 'function') {
          window.appState.showToast(`Copied ${label} digest to clipboard`, 'info');
        }
      }).catch(() => {});
    } else {
      if (typeof document !== 'undefined') {
        const input = document.createElement('textarea');
        input.value = text;
        document.body.appendChild(input);
        input.select();
        try { document.execCommand('copy'); } catch (_) {}
        document.body.removeChild(input);
      }
      if (typeof window !== 'undefined' && window.appState && typeof window.appState.showToast === 'function') {
        window.appState.showToast(`Copied ${label} digest to clipboard`, 'info');
      }
    }
  }

  /**
   * Action trigger for S2 Forensics review
   */
  inspectForensics(applicationId, documentId) {
    if (typeof window !== 'undefined' && window.appState) {
      window.appState.setSelectedDoc(documentId);
    }
    if (typeof window !== 'undefined' && typeof CustomEvent !== 'undefined' && typeof window.dispatchEvent === 'function') {
      window.dispatchEvent(new CustomEvent('app:inspect-forensics', {
        detail: { applicationId, documentId }
      }));
    }
    if (typeof window !== 'undefined' && window.appState && typeof window.appState.showToast === 'function') {
      window.appState.showToast(`Inspecting forensics for ${documentId}`, 'info');
    }
  }

  /**
   * Action trigger for S4 Branch B extraction
   */
  async runExtraction(applicationId, documentId) {
    if (typeof window !== 'undefined' && window.appState && typeof window.appState.showToast === 'function') {
      window.appState.showToast(`Running extraction for ${documentId}…`, 'info');
    }

    try {
      const client = (typeof window !== 'undefined' && window.apiClient) ? window.apiClient : new ApiClient();
      const res = await client.extractDocument(applicationId, documentId);
      if (typeof window !== 'undefined' && window.appState && typeof window.appState.showToast === 'function') {
        window.appState.showToast(`Extraction completed for ${documentId} (C1 payload generated)`, 'success');
      }
      if (typeof window !== 'undefined' && typeof CustomEvent !== 'undefined' && typeof window.dispatchEvent === 'function') {
        window.dispatchEvent(new CustomEvent('app:extraction-completed', {
          detail: { applicationId, documentId, result: res }
        }));
      }
    } catch (err) {
      console.error('Extraction failed:', err);
      if (typeof window !== 'undefined' && window.appState && typeof window.appState.showToast === 'function') {
        window.appState.showToast(`Extraction failed: ${err.message}`, 'error');
      }
    }
  }

  /**
   * Render grid of document cards into container element (Step 12)
   */
  renderDocumentGrid(documents, container = null) {
    let targetEl = null;
    if (typeof document !== 'undefined') {
      targetEl = typeof container === 'string'
        ? document.getElementById(container)
        : (container || document.getElementById('workspace-documents-container'));
    }

    if (!documents || documents.length === 0) {
      const emptyHtml = `
        <div class="card" style="padding: var(--space-6); text-align: center; background: var(--bg-surface-subtle); border: 1px dashed var(--border-default);">
          <div class="text-muted text-sm" style="margin-bottom: var(--space-3);">No documents uploaded yet for this application.</div>
          <button class="btn btn-primary btn-sm" onclick="window.uploadModalComponent && window.uploadModalComponent.open()">
            + Upload Document Bundle
          </button>
        </div>
      `;
      if (targetEl) targetEl.innerHTML = emptyHtml;
      return emptyHtml;
    }

    const headerHtml = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--space-3);">
        <span class="text-xs text-muted">Showing <strong>${documents.length}</strong> persisted document(s) · <em>newest first</em></span>
      </div>
    `;
    const cardsHtml = documents.map(doc => this.renderDocumentCard(doc)).join('');
    const gridHtml = `${headerHtml}<div class="document-grid">${cardsHtml}</div>`;
    if (targetEl) targetEl.innerHTML = gridHtml;

    // Asynchronously fetch missing routes for documents that need them
    const needsRouting = documents.filter(doc => {
      const docId = doc.document_id || doc.id;
      const appId = doc.application_id || (window.appState && window.appState.getState('selectedAppId'));
      const hasOutcome = Boolean(doc.routing_outcome || (doc.route && doc.route.routing_outcome));
      return docId && appId && !hasOutcome && !this.routeCache.has(`${appId}:${docId}`);
    });

    // Process unrouted documents in small sequential batches of 2 to avoid event loop contention
    (async () => {
      for (let i = 0; i < Math.min(needsRouting.length, 10); i += 2) {
        const batch = needsRouting.slice(i, i + 2);
        await Promise.all(batch.map(doc => {
          const docId = doc.document_id || doc.id;
          const appId = doc.application_id || (window.appState && window.appState.getState('selectedAppId'));
          return this.fetchAndBindRoute(appId, docId).catch(() => {});
        }));
      }
    })();

    return gridHtml;
  }

  /**
   * Fetch documents from S1 endpoint and render into workspace (Step 12)
   */
  async loadApplicationDocuments(applicationId, container = null) {
    if (!applicationId) return [];

    try {
      const client = (typeof window !== 'undefined' && window.apiClient) ? window.apiClient : new ApiClient();
      const res = await client.getDocuments(applicationId);
      const docs = res.documents || [];

      if (typeof window !== 'undefined' && window.appState) {
        window.appState.setState('documents', docs);
      }

      this.renderDocumentGrid(docs, container);
      return docs;
    } catch (err) {
      console.error(`Failed to load documents for ${applicationId}:`, err);
      const targetEl = typeof container === 'string'
        ? document.getElementById(container)
        : (container || document.getElementById('workspace-documents-container'));
      if (targetEl) {
        targetEl.innerHTML = `
          <div class="card" style="padding: var(--space-4); text-align: center; color: var(--status-fail);">
            Failed to load documents: ${err.message || 'Network error'}
          </div>
        `;
      }
      return [];
    }
  }

  /**
   * Load documents for an application (alias matching workspace caller)
   */
  async loadDocuments(applicationId, container = null) {
    return this.loadApplicationDocuments(applicationId, container);
  }

  /**
   * Helper to format raw bytes into human readable string
   */
  formatBytes(bytes, decimals = 2) {
    if (!bytes || bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  }
}

// Singleton instantiation
const documentListComponent = new DocumentListComponent();
if (typeof window !== 'undefined') {
  window.documentListComponent = documentListComponent;
  window.DocumentListComponent = DocumentListComponent;
  window.ROUTING_METADATA = ROUTING_METADATA;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { DocumentListComponent, ROUTING_METADATA };
}
