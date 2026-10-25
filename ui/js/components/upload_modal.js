/**
 * AICTE Application Validation Platform — Document Intake & Upload Modal Component
 * Spec Reference: ROADMAP.md (Phase 2, Step 07)
 *
 * Responsibilities:
 * 1. Drag-and-drop file ingestion zone supporting PDF, PNG, and JPEG formats.
 * 2. Browse file dialog trigger via hidden HTML file input.
 * 3. Format constraint hint pills (.pdf, .png, .jpg, .jpeg, Max 10MB).
 * 4. Staging queue management for multi-slot document uploads.
 * 5. Visual highlight states on dragenter/dragover and drop handling.
 */

class UploadModalComponent {
  constructor() {
    this.isOpen = false;
    this.stagedFiles = [];
    this.targetApplicationId = null;
    this.allowedExtensions = ['pdf', 'png', 'jpg', 'jpeg'];
    this.maxSizeBytes = 10 * 1024 * 1024; // 10 MB limit per Guide §4

    this.slots = [
      { id: 'affidavit', label: 'Affidavit (Format A)' },
      { id: 'fire_noc', label: 'Fire & Safety NOC' },
      { id: 'site_plan', label: 'Architect / Site Plan' },
      { id: 'building_photo', label: 'Infrastructure / Building Photo' },
      { id: 'unspecified', label: 'Unspecified Document' }
    ];

    if (typeof window !== 'undefined' && typeof document !== 'undefined') {
      if (document.readyState === 'loading' && typeof document.addEventListener === 'function') {
        document.addEventListener('DOMContentLoaded', () => this.init());
      } else {
        this.init();
      }
    }
  }

  /**
   * Initialize UI hooks and trigger buttons
   */
  init() {
    const openBtn = document.getElementById('btn-open-upload-modal');
    if (openBtn) {
      openBtn.addEventListener('click', () => this.open());
    }

    // Listen for custom trigger events from other components
    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      window.addEventListener('app:open-upload-modal', (e) => {
        const appId = e.detail && e.detail.applicationId ? e.detail.applicationId : null;
        this.open(appId);
      });
    }
  }

  /**
   * Open the Upload Modal and bind drag-and-drop dropzone
   */
  open(applicationId = null) {
    if (typeof window === 'undefined' || !window.navbarComponent) return;

    // Use current application from state if not specified
    if (applicationId) {
      this.targetApplicationId = applicationId;
    } else if (window.appState) {
      this.targetApplicationId = window.appState.getState('selectedAppId') || 'DEMO-CLEAN-001';
    } else {
      this.targetApplicationId = 'DEMO-CLEAN-001';
    }

    const title = `Upload Document Bundle — ${this.targetApplicationId}`;
    const bodyHtml = this.renderModalBody();
    const footerHtml = this.renderModalFooter();

    window.navbarComponent.openModal(title, bodyHtml, footerHtml);
    this.isOpen = true;

    // Bind Dropzone events after DOM injection
    this.bindDropzoneEvents();
    this.updateStagedFilesList();
  }

  /**
   * Close the upload modal
   */
  close() {
    if (typeof window !== 'undefined' && window.navbarComponent) {
      window.navbarComponent.closeModal();
    }
    this.isOpen = false;
  }

  /**
   * Render internal HTML structure for modal body
   */
  renderModalBody() {
    return `
      <div id="upload-modal-content">
        <!-- Target Application & Confidentiality Notice -->
        <div style="margin-bottom: var(--space-4); display: flex; justify-content: space-between; align-items: center;">
          <span class="text-xs text-muted">
            Target Application: <strong class="font-mono text-main">${this.targetApplicationId}</strong>
          </span>
          <span class="badge badge-offline text-xs">LOCAL VAULT · AIR-GAPPED</span>
        </div>

        <!-- Drag-and-Drop Dropzone -->
        <div id="upload-dropzone" class="dropzone" tabindex="0" role="button" aria-label="File upload dropzone">
          <input type="file" id="file-input-upload" multiple accept=".pdf,.png,.jpg,.jpeg" style="display: none;">
          <div class="dropzone-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="17 8 12 3 7 8"/>
              <line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
          </div>
          <div class="dropzone-title">Drag & drop application documents here</div>
          <div class="dropzone-subtitle">or <span style="color: var(--color-accent); text-decoration: underline; font-weight: 500;">browse files</span> from your local filesystem</div>

          <!-- Format Hint Pills -->
          <div class="format-hint-pills">
            <span class="format-pill">PDF (.pdf)</span>
            <span class="format-pill">PNG (.png)</span>
            <span class="format-pill">JPEG (.jpg, .jpeg)</span>
            <span class="format-pill" style="border-color: var(--color-accent);">Max 10 MB per file</span>
          </div>
        </div>

        <!-- Staged Files Queue Container -->
        <div id="staged-files-container" style="margin-top: var(--space-4);">
          <div class="flex items-center justify-between" style="margin-bottom: var(--space-2);">
            <strong class="text-xs text-muted" style="text-transform: uppercase; letter-spacing: 0.05em;">
              Staged Documents (<span id="staged-count">${this.stagedFiles.length}</span>)
            </strong>
            <button id="btn-clear-staged" class="btn btn-outline btn-sm" style="padding: 2px 8px; font-size: 11px; display: ${this.stagedFiles.length ? 'inline-flex' : 'none'};">
              Clear All
            </button>
          </div>

          <div id="staged-files-list" class="staged-files-list">
            <!-- Dynamically populated by updateStagedFilesList() -->
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Render internal HTML structure for modal footer
   */
  renderModalFooter() {
    return `
      <div class="flex justify-between items-center" style="width: 100%;">
        <span class="text-xs text-muted" id="upload-status-hint">
          ${this.stagedFiles.length ? `${this.stagedFiles.length} file(s) staged for S1 ingest` : 'Select or drop files to proceed'}
        </span>
        <div class="flex gap-2">
          <button class="btn btn-outline btn-sm" onclick="window.uploadModalComponent.close()">Cancel</button>
          <button id="btn-start-upload" class="btn btn-primary btn-sm" ${this.stagedFiles.length === 0 ? 'disabled' : ''}>
            Upload to S1 Vault
          </button>
        </div>
      </div>
    `;
  }

  /**
   * Bind DOM drag, drop, and file input events
   */
  bindDropzoneEvents() {
    const dropzone = document.getElementById('upload-dropzone');
    const fileInput = document.getElementById('file-input-upload');
    const clearBtn = document.getElementById('btn-clear-staged');

    if (!dropzone || !fileInput) return;

    // Click on dropzone triggers file picker
    dropzone.addEventListener('click', () => {
      fileInput.click();
    });

    // Keyboard trigger (Enter or Space)
    dropzone.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        fileInput.click();
      }
    });

    // File input selection
    fileInput.addEventListener('change', () => {
      if (fileInput.files && fileInput.files.length > 0) {
        this.handleFiles(fileInput.files);
        fileInput.value = ''; // Reset input to allow re-uploading same file
      }
    });

    // Drag-and-drop events
    const highlight = (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropzone.classList.add('dragover', 'active');
    };

    const unhighlight = (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropzone.classList.remove('dragover', 'active');
    };

    ['dragenter', 'dragover'].forEach(eventName => {
      dropzone.addEventListener(eventName, highlight, false);
    });

    ['dragleave', 'dragend'].forEach(eventName => {
      dropzone.addEventListener(eventName, unhighlight, false);
    });

    dropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropzone.classList.remove('dragover', 'active');

      const dt = e.dataTransfer;
      if (dt && dt.files && dt.files.length > 0) {
        this.handleFiles(dt.files);
      }
    }, false);

    // Clear all staged files button
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        this.stagedFiles = [];
        this.updateStagedFilesList();
      });
    }

    // Start upload button (Step 10)
    const uploadBtn = document.getElementById('btn-start-upload');
    if (uploadBtn) {
      uploadBtn.addEventListener('click', () => {
        this.startUpload();
      });
    }
  }

  /**
   * Streaming upload pipeline to S1 Ingestion Gateway (Step 10)
   */
  async startUpload() {
    const validFiles = this.stagedFiles.filter(f => f.status === 'valid' || f.status === 'staged');
    if (validFiles.length === 0) return;

    const uploadBtn = document.getElementById('btn-start-upload');
    const statusHint = document.getElementById('upload-status-hint');

    if (uploadBtn) {
      uploadBtn.disabled = true;
      uploadBtn.innerHTML = `
        <svg class="spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="animation: spin 1s linear infinite;">
          <circle cx="12" cy="12" r="10" stroke-opacity="0.25"/>
          <path d="M12 2a10 10 0 0 1 10 10"/>
        </svg>
        Streaming to S1 Vault…
      `;
    }

    if (statusHint) {
      statusHint.textContent = `Streaming ${validFiles.length} document(s) to S1 Content-Addressed Vault…`;
    }

    let successCount = 0;
    const uploadResults = [];

    for (const staged of validFiles) {
      staged.status = 'uploading';
      staged.progress = 10;
      this.updateStagedFilesList();

      try {
        const client = (typeof window !== 'undefined' && window.apiClient) ? window.apiClient : new ApiClient();
        const result = await client.uploadDocument(
          this.targetApplicationId,
          staged.file,
          staged.slot,
          staged.idempotencyKey,
          (percent) => {
            staged.progress = Math.max(10, percent);
            const progressEl = document.getElementById(`progress-bar-${staged.id}`);
            if (progressEl) progressEl.style.width = `${staged.progress}%`;
          }
        );

        staged.status = 'persisted';
        staged.result = result;
        staged.progress = 100;
        successCount++;
        uploadResults.push(result);

        // Step 11: Call S3 document router immediately upon S1 persistence
        try {
          if (typeof window !== 'undefined' && window.documentListComponent) {
            const routeResult = await window.documentListComponent.fetchAndBindRoute(this.targetApplicationId, result.document_id);
            staged.routeResult = routeResult;
          } else {
            const routeResult = await (client.routeDocument ? client.routeDocument(this.targetApplicationId, result.document_id) : client.getDocumentRoute(this.targetApplicationId, result.document_id));
            staged.routeResult = routeResult;
          }
        } catch (routeErr) {
          console.warn('Could not run immediate S3 route:', routeErr);
        }

        // Update reactive global state
        if (typeof window !== 'undefined' && window.appState && typeof window.appState.addDocument === 'function') {
          window.appState.addDocument({ ...result, route: staged.routeResult });
        }
      } catch (err) {
        console.error(`Upload error for ${staged.name}:`, err);
        staged.status = 'error';
        staged.error = err.message || 'Vault streaming failed';
      }

      this.updateStagedFilesList();
    }

    // Refresh application bundle in global state if method exists
    if (typeof window !== 'undefined' && window.appState && typeof window.appState.loadApplication === 'function') {
      window.appState.loadApplication(this.targetApplicationId).catch(() => {});
    }

    // Final UI button status
    if (uploadBtn) {
      if (successCount === validFiles.length) {
        uploadBtn.textContent = 'Upload Complete ✓';
        uploadBtn.disabled = true;
      } else {
        uploadBtn.textContent = 'Retry Failed Uploads';
        uploadBtn.disabled = false;
      }
    }

    if (typeof window !== 'undefined' && window.appState && typeof window.appState.showToast === 'function') {
      if (successCount > 0) {
        window.appState.showToast(`Successfully persisted ${successCount} document(s) in S1 vault`, 'success');
      } else {
        window.appState.showToast('Failed to persist documents in vault', 'error');
      }
    }

    // Dispatch DOM event for listeners and automated tests
    if (typeof window !== 'undefined' && typeof CustomEvent !== 'undefined' && typeof window.dispatchEvent === 'function') {
      window.dispatchEvent(new CustomEvent('app:documents-uploaded', {
        detail: {
          applicationId: this.targetApplicationId,
          results: uploadResults,
          successCount
        }
      }));
    }
  }

  /**
   * Ingest and stage dropped or selected files
   */
  async handleFiles(fileList) {
    const newFiles = Array.from(fileList);
    let addedCount = 0;

    for (const file of newFiles) {
      const ext = (file.name.split('.').pop() || '').toLowerCase();

      // Check format support by extension
      if (!this.allowedExtensions.includes(ext)) {
        if (window.appState && typeof window.appState.showToast === 'function') {
          window.appState.showToast(`Unsupported file extension: ${file.name}. Allowed: .pdf, .png, .jpg, .jpeg`, 'error');
        }
        continue;
      }

      // Infer slot from filename heuristic
      const inferredSlot = this.inferSlotFromFilename(file.name);

      const staged = {
        id: 'staged_' + Math.random().toString(36).substr(2, 9),
        file: file,
        name: file.name,
        size: file.size,
        formattedSize: this.formatBytes(file.size),
        extension: ext,
        slot: inferredSlot,
        idempotencyKey: this.generateUUID(), // Step 09 auto-populated 36-char token
        status: 'validating', // 'validating' | 'valid' | 'error' | 'uploading' | 'persisted'
        detectedKind: null,
        mediaType: null,
        error: null
      };

      this.stagedFiles.push(staged);
      addedCount++;

      // Trigger asynchronous magic bytes & size verification (Step 08)
      this.verifyStagedFile(staged);
    }

    this.updateStagedFilesList();

    if (addedCount > 0 && window.appState && typeof window.appState.showToast === 'function') {
      window.appState.showToast(`Staged ${addedCount} document(s) for verification`, 'info');
    }

    // Dispatch DOM event for test inspection and parent components
    if (typeof window !== 'undefined' && typeof CustomEvent !== 'undefined' && typeof window.dispatchEvent === 'function') {
      window.dispatchEvent(new CustomEvent('app:file-staged', {
        detail: {
          stagedFiles: this.stagedFiles,
          totalStaged: this.stagedFiles.length
        }
      }));
    }
  }

  /**
   * Verify file size constraint (10MB) and sniff magic byte header (Step 08)
   */
  async verifyStagedFile(staged) {
    const result = await this.verifyFileHeader(staged.file);
    if (result.valid) {
      staged.status = 'valid';
      staged.detectedKind = result.detectedKind;
      staged.mediaType = result.mediaType;
      staged.error = null;
    } else {
      staged.status = 'error';
      staged.error = result.error;
      if (window.appState && typeof window.appState.showToast === 'function') {
        window.appState.showToast(result.error, 'error');
      }
    }

    this.updateStagedFilesList();

    if (typeof window !== 'undefined' && typeof CustomEvent !== 'undefined' && typeof window.dispatchEvent === 'function') {
      window.dispatchEvent(new CustomEvent('app:file-validated', {
        detail: {
          stagedId: staged.id,
          fileName: staged.name,
          valid: result.valid,
          detectedKind: result.detectedKind,
          error: result.error
        }
      }));
    }

    return result;
  }

  /**
   * Validate file size <= 10MB and magic bytes matching PDF, PNG, or JPEG
   */
  async verifyFileHeader(file) {
    // 1. Max size check (10 MB limit per Guide §4)
    if (file.size > this.maxSizeBytes) {
      return {
        valid: false,
        error: `File size exceeds 10 MB limit (${this.formatBytes(file.size)})`
      };
    }

    if (file.size === 0) {
      return {
        valid: false,
        error: 'File is empty (0 bytes)'
      };
    }

    // 2. Read first 8 bytes for magic byte sniffing
    try {
      const buffer = await this.readFileSlice(file, 0, 8);
      const bytes = new Uint8Array(buffer);

      if (bytes.length < 3) {
        return {
          valid: false,
          error: 'Invalid file header: must be authentic PDF, PNG, or JPEG'
        };
      }

      // Check PDF: %PDF- (0x25, 0x50, 0x44, 0x46, 0x2D) or %PDF (0x25, 0x50, 0x44, 0x46)
      if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) {
        return { valid: true, detectedKind: 'pdf', mediaType: 'application/pdf' };
      }

      // Check PNG: \x89PNG (0x89, 0x50, 0x4E, 0x47)
      if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47) {
        return { valid: true, detectedKind: 'png', mediaType: 'image/png' };
      }

      // Check JPEG: \xFF\xD8\xFF (0xFF, 0xD8, 0xFF)
      if (bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF) {
        return { valid: true, detectedKind: 'jpeg', mediaType: 'image/jpeg' };
      }

      return {
        valid: false,
        error: 'Invalid file header: must be authentic PDF, PNG, or JPEG'
      };
    } catch (err) {
      return {
        valid: false,
        error: `Failed to inspect file header: ${err.message || 'Read error'}`
      };
    }
  }

  /**
   * Helper to read a slice of a File/Blob as an ArrayBuffer
   */
  readFileSlice(file, start, end) {
    if (file.slice && typeof file.slice(start, end).arrayBuffer === 'function') {
      return file.slice(start, end).arrayBuffer();
    }
    if (file.arrayBuffer && typeof file.arrayBuffer === 'function') {
      return file.arrayBuffer().then(buf => buf.slice(start, end));
    }
    if (file.buffer && file.buffer instanceof ArrayBuffer) {
      return Promise.resolve(file.buffer.slice(start, end));
    }
    if (file.bytes && file.bytes instanceof Uint8Array) {
      return Promise.resolve(file.bytes.buffer.slice(file.bytes.byteOffset + start, file.bytes.byteOffset + end));
    }
    // Browser FileReader fallback
    return new Promise((resolve, reject) => {
      if (typeof FileReader === 'undefined') {
        return reject(new Error('FileReader is not supported in this environment'));
      }
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      const slice = file.slice ? file.slice(start, end) : file;
      reader.readAsArrayBuffer(slice);
    });
  }

  /**
   * Infer likely slot from filename
   */
  inferSlotFromFilename(name) {
    const lower = name.toLowerCase();
    if (lower.includes('affidavit')) return 'affidavit';
    if (lower.includes('fire') || lower.includes('noc')) return 'fire_noc';
    if (lower.includes('site') || lower.includes('plan') || lower.includes('floor')) return 'site_plan';
    if (lower.includes('building') || lower.includes('photo') || lower.includes('infra') || lower.includes('campus')) return 'building_photo';
    return 'unspecified';
  }

  /**
   * Generate RFC4122 v4 compliant UUID for Idempotency-Key header (Step 09)
   */
  generateUUID() {
    if (typeof crypto !== 'undefined') {
      if (typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
      }
      if (typeof crypto.getRandomValues === 'function') {
        const bytes = new Uint8Array(16);
        crypto.getRandomValues(bytes);
        bytes[6] = (bytes[6] & 0x0f) | 0x40; // RFC4122 v4 version
        bytes[8] = (bytes[8] & 0x3f) | 0x80; // RFC4122 v4 variant
        const hex = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
        return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
      }
    }
    // Fallback pseudo-random RFC4122 v4 generator
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  /**
   * Update the document slot assignment for a staged file (Step 09)
   */
  updateStagedSlot(stagedId, newSlot) {
    const staged = this.stagedFiles.find(f => f.id === stagedId);
    if (!staged) return;

    staged.slot = newSlot;

    if (typeof window !== 'undefined' && typeof CustomEvent !== 'undefined' && typeof window.dispatchEvent === 'function') {
      window.dispatchEvent(new CustomEvent('app:slot-changed', {
        detail: {
          stagedId: staged.id,
          fileName: staged.name,
          slot: staged.slot
        }
      }));
    }
  }

  /**
   * Regenerate fresh Idempotency-Key for a staged file (Step 09)
   */
  regenerateIdempotencyKey(stagedId) {
    const staged = this.stagedFiles.find(f => f.id === stagedId);
    if (!staged) return;

    staged.idempotencyKey = this.generateUUID();
    this.updateStagedFilesList();

    if (window.appState && typeof window.appState.showToast === 'function') {
      window.appState.showToast(`Regenerated Idempotency-Key for ${staged.name}`, 'info');
    }
  }

  /**
   * Remove a staged file from the queue
   */
  removeStagedFile(stagedId) {
    this.stagedFiles = this.stagedFiles.filter(f => f.id !== stagedId);
    this.updateStagedFilesList();
  }

  /**
   * Update staged files list in DOM
   */
  updateStagedFilesList() {
    const listEl = document.getElementById('staged-files-list');
    const countEl = document.getElementById('staged-count');
    const clearBtn = document.getElementById('btn-clear-staged');
    const uploadBtn = document.getElementById('btn-start-upload');
    const statusHint = document.getElementById('upload-status-hint');

    const validCount = this.stagedFiles.filter(f => f.status === 'valid').length;
    const errorCount = this.stagedFiles.filter(f => f.status === 'error').length;
    const validatingCount = this.stagedFiles.filter(f => f.status === 'validating').length;

    if (countEl) countEl.textContent = this.stagedFiles.length;
    if (clearBtn) clearBtn.style.display = this.stagedFiles.length ? 'inline-flex' : 'none';

    // Disable upload if no valid files, or any errors or ongoing validations
    if (uploadBtn) {
      uploadBtn.disabled = this.stagedFiles.length === 0 || errorCount > 0 || validatingCount > 0 || validCount === 0;
    }

    if (statusHint) {
      if (this.stagedFiles.length === 0) {
        statusHint.textContent = 'Select or drop files to proceed';
      } else if (errorCount > 0) {
        statusHint.innerHTML = `<span style="color: var(--status-fail); font-weight: 500;">${errorCount} file(s) failed verification</span>`;
      } else if (validatingCount > 0) {
        statusHint.textContent = `Verifying magic bytes (${validatingCount} remaining)…`;
      } else {
        statusHint.textContent = `${validCount} document(s) verified and ready for S1 vault`;
      }
    }

    if (!listEl) return;

    if (this.stagedFiles.length === 0) {
      listEl.innerHTML = `
        <div style="padding: var(--space-4); text-align: center; color: var(--text-muted); font-size: var(--font-size-xs); background: var(--bg-surface-subtle); border-radius: var(--radius-md); border: 1px dashed var(--border-subtle);">
          No documents staged yet. Drag files into the dropzone above.
        </div>
      `;
      return;
    }

    listEl.innerHTML = this.stagedFiles.map(staged => {
      const isPdf = staged.extension === 'pdf' || staged.detectedKind === 'pdf';
      const iconLabel = isPdf ? 'PDF' : 'IMG';

      let statusBadge = '';
      if (staged.status === 'validating') {
        statusBadge = `<span class="badge text-xs" style="background: rgba(0, 102, 204, 0.08); color: var(--color-accent); padding: 1px 6px; font-size: 10px;">Validating…</span>`;
      } else if (staged.status === 'uploading') {
        statusBadge = `<span class="badge text-xs" style="background: rgba(0, 102, 204, 0.15); color: var(--color-accent); padding: 1px 6px; font-size: 10px;">Streaming (${staged.progress || 0}%)…</span>`;
      } else if (staged.status === 'persisted') {
        statusBadge = `<span class="badge badge-pass text-xs" style="padding: 1px 6px; font-size: 10px;">PERSISTED · S1 VAULT</span>`;
        if (staged.result && staged.result.idempotent_replay) {
          statusBadge += ` <span class="badge badge-accent text-xs" style="padding: 1px 6px; font-size: 10px;" title="Replayed from existing vault blob">IDEMPOTENT REPLAY</span>`;
        }
        if (staged.routeResult) {
          if (typeof window !== 'undefined' && window.documentListComponent) {
            statusBadge += ` ${window.documentListComponent.getRoutingBadge(staged.routeResult.routing_outcome, staged.routeResult)}`;
          } else {
            statusBadge += ` <span class="badge badge-routing-digital text-xs">${staged.routeResult.routing_outcome}</span>`;
          }
        } else if (staged.result && staged.result.document_id) {
          statusBadge += ` <span data-route-badge-for="${staged.result.document_id}"></span>`;
        }
      } else if (staged.status === 'valid') {
        statusBadge = `<span class="badge badge-pass text-xs" style="padding: 1px 6px; font-size: 10px;">${staged.detectedKind ? staged.detectedKind.toUpperCase() : 'VALID'} · VERIFIED</span>`;
      } else if (staged.error) {
        statusBadge = `<span class="badge text-xs" style="background: rgba(220, 38, 38, 0.1); color: var(--status-fail); border: 1px solid rgba(220, 38, 38, 0.3); padding: 1px 6px; font-size: 10px;">${staged.error}</span>`;
      }

      return `
        <div class="staged-file-card ${staged.error ? 'has-error' : ''}" id="card-${staged.id}">
          <div class="staged-file-info">
            <div class="staged-file-icon" style="${isPdf ? 'color: #dc2626; background: rgba(220, 38, 38, 0.08);' : 'color: #0066cc; background: rgba(0, 102, 204, 0.08);'}">
              ${iconLabel}
            </div>
            <div class="staged-file-details">
              <div class="staged-file-name" title="${staged.name}">${staged.name}</div>
              <div class="staged-file-meta">
                <span>${staged.formattedSize}</span>
                <span>·</span>
                <select class="slot-select" aria-label="Select Document Slot" onchange="window.uploadModalComponent.updateStagedSlot('${staged.id}', this.value)" ${staged.status === 'persisted' ? 'disabled' : ''}>
                  ${this.slots.map(s => `<option value="${s.id}" ${s.id === staged.slot ? 'selected' : ''}>${s.label}</option>`).join('')}
                </select>
                <span class="idempotency-tag" title="S1 Idempotent Ingest Token: ${staged.idempotencyKey}">
                  key: <code>${staged.idempotencyKey.slice(0, 8)}…</code>
                  ${staged.status !== 'persisted' ? `<button class="btn-regen-key" title="Regenerate fresh Idempotency-Key" onclick="window.uploadModalComponent.regenerateIdempotencyKey('${staged.id}')">&#x21bb;</button>` : ''}
                </span>
                ${statusBadge}
              </div>

              ${staged.status === 'uploading' ? `
                <div class="upload-progress-container" style="margin-top: var(--space-2);">
                  <div class="upload-progress-bar" id="progress-bar-${staged.id}" style="width: ${staged.progress || 10}%;"></div>
                </div>
              ` : ''}

              ${staged.result ? `
                <div class="font-mono text-xs" style="font-size: 10px; color: var(--text-muted); margin-top: 4px; display: flex; gap: var(--space-3); flex-wrap: wrap;">
                  <span>Doc ID: <code class="text-main">${staged.result.document_id}</code></span>
                  <span>BLAKE3: <code class="text-main">${staged.result.blake3 ? staged.result.blake3.slice(0, 16) : ''}…</code></span>
                  <span>SHA-256: <code class="text-main">${staged.result.sha256 ? staged.result.sha256.slice(0, 16) : ''}…</code></span>
                  <span>Vault: <code class="text-main">${staged.result.storage_key}</code></span>
                </div>
              ` : ''}
            </div>
          </div>
          <div class="staged-file-actions">
            ${staged.status === 'persisted' ? `
              <span style="color: var(--status-pass); font-weight: bold; font-size: var(--font-size-base); padding: 0 4px;" title="Persisted in S1 Vault">✓</span>
            ` : `
              <button class="btn-remove-staged" title="Remove file" onclick="window.uploadModalComponent.removeStagedFile('${staged.id}')">
                &times;
              </button>
            `}
          </div>
        </div>
      `;
    }).join('');
  }

  /**
   * Helper to format raw bytes into human readable string
   */
  formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  }
}

// Singleton instantiation
const uploadModalComponent = new UploadModalComponent();
if (typeof window !== 'undefined') {
  window.uploadModalComponent = uploadModalComponent;
  window.UploadModalComponent = UploadModalComponent;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { UploadModalComponent };
}
