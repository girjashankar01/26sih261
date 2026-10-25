/**
 * AICTE Application Validation Platform — Centralized Async API Client Layer
 * Spec Reference: docs/contracts/openapi.json, ROADMAP.md (Step 04)
 * Connects all 24 backend endpoints in backend/api/main.py.
 */

class ApiError extends Error {
  constructor(status, errorCode, message, details = null) {
    super(message || `API error ${status}`);
    this.name = 'ApiError';
    this.status = status;
    this.errorCode = errorCode || 'API_ERROR';
    this.details = details;
  }
}

class ApiClient {
  constructor(baseUrl = '') {
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  /**
   * Internal HTTP request helper
   */
  async _request(path, options = {}) {
    const url = `${this.baseUrl}${path}`;
    const defaultHeaders = {
      'Accept': 'application/json'
    };

    if (options.body && !(options.body instanceof FormData)) {
      defaultHeaders['Content-Type'] = 'application/json';
    }

    const config = {
      ...options,
      headers: {
        ...defaultHeaders,
        ...(options.headers || {})
      }
    };

    let response;
    try {
      response = await fetch(url, config);
    } catch (networkErr) {
      throw new ApiError(0, 'NETWORK_ERROR', `Network connection failed: ${networkErr.message}`);
    }

    let data = null;
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      try {
        data = await response.json();
      } catch (parseErr) {
        throw new ApiError(response.status, 'INVALID_JSON', 'Server returned invalid JSON response');
      }
    } else {
      data = await response.text();
    }

    if (!response.ok) {
      let errorCode = 'REQUEST_FAILED';
      let message = response.statusText || `HTTP ${response.status}`;
      let details = null;

      if (data && typeof data === 'object') {
        if (typeof data.detail === 'string') {
          message = data.detail;
        } else if (data.detail && typeof data.detail === 'object') {
          errorCode = data.detail.error_code || errorCode;
          message = data.detail.message || message;
          details = data.detail;
        } else if (data.message) {
          message = data.message;
        }
      }

      throw new ApiError(response.status, errorCode, message, details);
    }

    return data;
  }

  // =========================================================================
  // 1. System Health & Demo Endpoints
  // =========================================================================

  /**
   * GET /health — Returns server status, operating mode, and simulated flag
   */
  async getHealth() {
    return this._request('/health');
  }

  /**
   * GET /api/demo/applications — List seeded demo applications
   */
  async getDemoApplications() {
    return this._request('/api/demo/applications');
  }

  /**
   * GET /api/demo/applications/{application_id}/validate — In-memory demo validation report
   */
  async getDemoValidation(applicationId) {
    return this._request(`/api/demo/applications/${encodeURIComponent(applicationId)}/validate`);
  }

  // =========================================================================
  // 2. S1 Ingest & S3 Routing
  // =========================================================================

  /**
   * POST /applications/{application_id}/documents — Multipart document upload (Step 10)
   */
  async uploadDocument(applicationId, file, docSlot = null, idempotencyKey = null, onProgress = null) {
    const formData = new FormData();
    formData.append('file', file);
    if (docSlot) {
      formData.append('doc_slot', docSlot);
    }

    const headers = {};
    if (idempotencyKey) {
      headers['Idempotency-Key'] = idempotencyKey;
    }

    // Support streaming upload progress tracking via XMLHttpRequest if available
    if (typeof XMLHttpRequest !== 'undefined' && typeof onProgress === 'function') {
      return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        const url = `${this.baseUrl}/applications/${encodeURIComponent(applicationId)}/documents`;
        xhr.open('POST', url, true);
        xhr.setRequestHeader('Accept', 'application/json');
        if (idempotencyKey) {
          xhr.setRequestHeader('Idempotency-Key', idempotencyKey);
        }

        xhr.upload.onprogress = (evt) => {
          if (evt.lengthComputable) {
            const percent = Math.round((evt.loaded / evt.total) * 100);
            onProgress(percent, evt.loaded, evt.total);
          }
        };

        xhr.onload = () => {
          let data = null;
          try {
            data = JSON.parse(xhr.responseText);
          } catch (_) {
            data = xhr.responseText;
          }

          if (xhr.status >= 200 && xhr.status < 300) {
            resolve(data);
          } else {
            let errorCode = 'REQUEST_FAILED';
            let message = xhr.statusText || `HTTP ${xhr.status}`;
            let details = null;
            if (data && typeof data === 'object') {
              if (data.detail && typeof data.detail === 'object') {
                errorCode = data.detail.error_code || errorCode;
                message = data.detail.message || message;
                details = data.detail;
              } else if (typeof data.detail === 'string') {
                message = data.detail;
              } else if (data.message) {
                message = data.message;
              }
            }
            reject(new ApiError(xhr.status, errorCode, message, details));
          }
        };

        xhr.onerror = () => {
          reject(new ApiError(0, 'NETWORK_ERROR', 'Network connection failed during document upload'));
        };

        xhr.send(formData);
      });
    }

    return this._request(`/applications/${encodeURIComponent(applicationId)}/documents`, {
      method: 'POST',
      body: formData,
      headers
    });
  }

  /**
   * GET /applications/{application_id}/documents — List all persisted documents (Step 12)
   */
  async getDocuments(applicationId) {
    return this._request(`/applications/${encodeURIComponent(applicationId)}/documents`);
  }

  /**
   * POST /applications/{application_id}/documents/{document_id}/route — Run S3 route
   */
  async routeDocument(applicationId, documentId) {
    return this._request(`/applications/${encodeURIComponent(applicationId)}/documents/${encodeURIComponent(documentId)}/route`, {
      method: 'POST'
    });
  }

  /**
   * GET /applications/{application_id}/documents/{document_id}/route — Get cached S3 route
   */
  async getDocumentRoute(applicationId, documentId) {
    return this._request(`/applications/${encodeURIComponent(applicationId)}/documents/${encodeURIComponent(documentId)}/route`);
  }

  // =========================================================================
  // 3. S2 Document Forensics
  // =========================================================================

  /**
   * POST /applications/{application_id}/documents/{document_id}/forensics — Run S2 analysis
   */
  async runForensics(applicationId, documentId) {
    return this._request(`/applications/${encodeURIComponent(applicationId)}/documents/${encodeURIComponent(documentId)}/forensics`, {
      method: 'POST'
    });
  }

  /**
   * GET /applications/{application_id}/documents/{document_id}/forensics — Get cached S2 results
   */
  async getDocumentForensics(applicationId, documentId) {
    return this._request(`/applications/${encodeURIComponent(applicationId)}/documents/${encodeURIComponent(documentId)}/forensics`);
  }

  // =========================================================================
  // 4. S4 Branch B Extraction & S5 Typing
  // =========================================================================

  /**
   * POST /applications/{application_id}/documents/{document_id}/extract — Run S4 extraction
   */
  async extractDocument(applicationId, documentId, forceRecompute = false) {
    const q = forceRecompute ? '?force_recompute=true' : '';
    return this._request(`/applications/${encodeURIComponent(applicationId)}/documents/${encodeURIComponent(documentId)}/extract${q}`, {
      method: 'POST'
    });
  }

  /**
   * GET /applications/{application_id}/documents/{document_id}/extract — Get S4 payload
   */
  async getDocumentExtraction(applicationId, documentId) {
    return this._request(`/applications/${encodeURIComponent(applicationId)}/documents/${encodeURIComponent(documentId)}/extract`);
  }

  /**
   * POST /applications/{application_id}/documents/{document_id}/type — Run S5 classification
   */
  async classifyDocumentType(applicationId, documentId, forceRecompute = false) {
    const q = forceRecompute ? '?force_recompute=true' : '';
    return this._request(`/applications/${encodeURIComponent(applicationId)}/documents/${encodeURIComponent(documentId)}/type${q}`, {
      method: 'POST'
    });
  }

  /**
   * GET /applications/{application_id}/documents/{document_id}/type — Get S5 classification
   */
  async getDocumentType(applicationId, documentId) {
    return this._request(`/applications/${encodeURIComponent(applicationId)}/documents/${encodeURIComponent(documentId)}/type`);
  }

  // =========================================================================
  // 5. S6 Field Extraction & S7 Typed Facts
  // =========================================================================

  /**
   * POST /applications/{application_id}/documents/{document_id}/fields — Extract fields with bboxes
   */
  async extractFields(applicationId, documentId, forceRecompute = false) {
    const q = forceRecompute ? '?force_recompute=true' : '';
    return this._request(`/applications/${encodeURIComponent(applicationId)}/documents/${encodeURIComponent(documentId)}/fields${q}`, {
      method: 'POST'
    });
  }

  /**
   * GET /applications/{application_id}/documents/{document_id}/fields — Get extracted fields
   */
  async getDocumentFields(applicationId, documentId) {
    return this._request(`/applications/${encodeURIComponent(applicationId)}/documents/${encodeURIComponent(documentId)}/fields`);
  }

  /**
   * GET /applications/{application_id}/facts — S7 aggregated facts and entity resolution
   */
  async getApplicationFacts(applicationId) {
    return this._request(`/applications/${encodeURIComponent(applicationId)}/facts`);
  }

  // =========================================================================
  // 6. S8 Deterministic Rules Engine v4
  // =========================================================================

  /**
   * POST /applications/{application_id}/validate — Execute S8 rules evaluation
   */
  async validateApplication(applicationId, ruleSetName = 'EOA_RENEWAL') {
    const q = `?rule_set=${encodeURIComponent(ruleSetName)}`;
    return this._request(`/applications/${encodeURIComponent(applicationId)}/validate${q}`, {
      method: 'POST'
    });
  }

  /**
   * GET /applications/{application_id}/validate — Get S8 rules evaluation result
   */
  async getApplicationValidation(applicationId, ruleSetName = 'EOA_RENEWAL') {
    const q = `?rule_set=${encodeURIComponent(ruleSetName)}`;
    return this._request(`/applications/${encodeURIComponent(applicationId)}/validate${q}`);
  }

  // =========================================================================
  // 7. S9 Issuing Authority Verification Gateway
  // =========================================================================

  /**
   * POST /applications/{application_id}/documents/{document_id}/verify — Run issuer verification
   */
  async verifyDocument(applicationId, documentId) {
    return this._request(`/applications/${encodeURIComponent(applicationId)}/documents/${encodeURIComponent(documentId)}/verify`, {
      method: 'POST'
    });
  }

  /**
   * GET /applications/{application_id}/documents/{document_id}/verify — Get cached verification
   */
  async getDocumentVerification(applicationId, documentId) {
    return this._request(`/applications/${encodeURIComponent(applicationId)}/documents/${encodeURIComponent(documentId)}/verify`);
  }

  // =========================================================================
  // 8. S10 Infrastructure Evidence Module
  // =========================================================================

  /**
   * GET /applications/{application_id}/infra — Evaluate facility checklist and geotags
   */
  async getApplicationInfra(applicationId, category = 'EOA_RENEWAL') {
    const q = `?category=${encodeURIComponent(category)}`;
    return this._request(`/applications/${encodeURIComponent(applicationId)}/infra${q}`);
  }

  // =========================================================================
  // 9. S11 Unified Aggregation, Lanes & Alerts
  // =========================================================================

  /**
   * GET /applications/{application_id}/aggregate — Unified aggregation payload
   */
  async getApplicationAggregate(applicationId, ruleSetName = 'EOA_RENEWAL', deadlineDate = null) {
    let q = `?rule_set=${encodeURIComponent(ruleSetName)}`;
    if (deadlineDate) {
      q += `&deadline_date=${encodeURIComponent(deadlineDate)}`;
    }
    return this._request(`/applications/${encodeURIComponent(applicationId)}/aggregate${q}`);
  }

  // =========================================================================
  // 10. S12 Review Console Actions & Officer Exports
  // =========================================================================

  /**
   * POST /applications/{application_id}/findings/{finding_id}/act — Record finding action
   */
  async recordFindingAction(applicationId, findingId, action, reason = null, notes = null, userRole = 'officer', actor = 'officer') {
    return this._request(`/applications/${encodeURIComponent(applicationId)}/findings/${encodeURIComponent(findingId)}/act`, {
      method: 'POST',
      body: JSON.stringify({
        action,
        actor: actor || 'officer',
        reason,
        notes,
        user_role: userRole
      })
    });
  }

  /**
   * GET /applications/{application_id}/findings/actions — Action history log
   */
  async getFindingActions(applicationId) {
    return this._request(`/applications/${encodeURIComponent(applicationId)}/findings/actions`);
  }

  /**
   * GET /applications/{application_id}/exports/deficiency-notice — Draft deficiency notice
   */
  async getDeficiencyNotice(applicationId) {
    return this._request(`/applications/${encodeURIComponent(applicationId)}/exports/deficiency-notice`);
  }

  /**
   * GET /applications/{application_id}/exports/inspection-brief — Ground inspection briefing
   */
  async getInspectionBrief(applicationId) {
    return this._request(`/applications/${encodeURIComponent(applicationId)}/exports/inspection-brief`);
  }

  /**
   * GET /applications/{application_id}/report — Full evaluation report
   */
  async getApplicationReport(applicationId) {
    return this._request(`/applications/${encodeURIComponent(applicationId)}/report`);
  }

  // =========================================================================
  // 11. S13 Cryptographic Audit Trail & Checkpoints
  // =========================================================================

  /**
   * GET /audit/events — Paginated chronological audit event log
   */
  async getAuditEvents(limit = 100, offset = 0, actor = null, action = null) {
    const params = new URLSearchParams({ limit, offset });
    if (actor) params.append('actor', actor);
    if (action) params.append('action', action);
    return this._request(`/audit/events?${params.toString()}`);
  }

  /**
   * GET /audit/verify — Cryptographic hash chain integrity verification
   */
  async verifyAuditChain() {
    return this._request('/audit/verify');
  }

  /**
   * POST /audit/checkpoint — Create signed Ed25519 external checkpoint
   */
  async createAuditCheckpoint(uptoId = null) {
    const q = uptoId ? `?upto_id=${encodeURIComponent(uptoId)}` : '';
    return this._request(`/audit/checkpoint${q}`, {
      method: 'POST'
    });
  }

  /**
   * GET /audit/checkpoints — List signed external checkpoints
   */
  async getAuditCheckpoints(limit = 50) {
    return this._request(`/audit/checkpoints?limit=${encodeURIComponent(limit)}`);
  }

  /**
   * GET /audit/checkpoints/{id}/verify — Cryptographically verify Ed25519 signature
   */
  async verifyAuditCheckpoint(checkpointId) {
    return this._request(`/audit/checkpoints/${encodeURIComponent(checkpointId)}/verify`);
  }

  // =========================================================================
  // 12. S8 Versioned YAML Rules & Norms Explorer (Guide §12)
  // =========================================================================

  /**
   * GET /rules — List active and candidate regulatory rule sets
   */
  async getRuleSets() {
    return this._request('/rules');
  }

  /**
   * GET /rules/{ruleSetName} — Get versioned rule definitions, expressions, and evaluators
   */
  async getRuleSet(ruleSetName = 'EOA_RENEWAL') {
    return this._request(`/rules/${encodeURIComponent(ruleSetName)}`);
  }

  /**
   * GET /rules/compare — Side-by-side comparison of two rule set versions
   */
  async compareRuleSets(base = 'EOA_RENEWAL', target = 'EOA_RENEWAL_v4_1') {
    const params = new URLSearchParams({ base, target });
    return this._request(`/rules/compare?${params.toString()}`);
  }

  // =========================================================================
  // 13. System Realness & Transparency Matrix (Guide §1.4, Step 55)
  // =========================================================================

  /**
   * GET /about/realness — Complete audit-ready disclosure of real vs simulated systems
   */
  async getRealnessMatrix() {
    return this._request('/about/realness');
  }
}

// Export singleton instance globally and as module
const api = new ApiClient();
window.api = api;
window.ApiClient = ApiClient;
window.ApiError = ApiError;
