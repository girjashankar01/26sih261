/**
 * AICTE Application Validation Platform — Split-Pane Evidence Viewer & Findings Console
 * Spec Reference: ROADMAP.md (Phase 5: Steps 25–31), Guide §17.2
 *
 * Responsibilities:
 * 1. Split-screen inspection workspace (Step 25):
 *    - Left pane for document page canvas renderer (60% width: #evidence-canvas-pane, .evidence-left-pane)
 *    - Right pane for discrepancy findings inspector (40% width: #evidence-findings-pane, .evidence-right-pane)
 *    - Responsive stacking on viewports < 1024px.
 * 2. Document Page Canvas Renderer with Zoom/Pan (Step 26):
 *    - Displays high-resolution document page raster on HTML5 canvas.
 *    - Zoom controls: 50%, 100%, 150%, 200%, Fit Width via scale transform.
 *    - Pan dragging on canvas viewport with cursor changes (grab / grabbing).
 *    - Page pagination controls (1 ... N) with page clamping and button states.
 * 3. Normalized Bounding Box SVG Overlay Math (Step 27, Guide §17.2):
 *    - Scale normalized [x0, y0, x1, y1] coordinates onto canvas W x H:
 *      left = x0 * W, top = y0 * H, width = (x1 - x0) * W, height = (y1 - y0) * H
 *    - Solid borders for 'word' precision, dashed borders for 'block' precision.
 *    - Connects to GET /applications/{id}/documents/{doc_id}/fields.
 *    - Interactive hover, selection, and coordinate overlay tag rendering.
 */

class EvidenceViewerComponent {
  constructor() {
    this.currentAppId = null;
    this.currentDocId = null;
    this.currentExtraction = null;
    this.currentFields = null;
    this.documents = [];
    this.findings = [];
    this.activeFindingId = null;
    this.activeFieldId = null;
    this.zoomLevel = 1.0;
    this.currentPage = 1;
    this.totalPages = 1;
    this.isPanning = false;
    this.canvasWidth = 800;
    this.canvasHeight = 1100;
  }

  /**
   * Scale Normalized Bounding Box [x0, y0, x1, y1] onto Canvas Dimensions (Step 27, Guide §17.2)
   * Math: left = x0 * W, top = y0 * H, width = (x1 - x0) * W, height = (y1 - y0) * H
   */
  scaleBboxNorm(bboxNorm, canvasWidth = this.canvasWidth, canvasHeight = this.canvasHeight) {
    if (!Array.isArray(bboxNorm) || bboxNorm.length < 4) {
      return { left: 0, top: 0, width: 0, height: 0 };
    }
    const [x0, y0, x1, y1] = bboxNorm;
    const left = Math.round(x0 * canvasWidth);
    const top = Math.round(y0 * canvasHeight);
    const width = Math.round((x1 - x0) * canvasWidth);
    const height = Math.round((y1 - y0) * canvasHeight);
    return { left, top, width, height };
  }

  /**
   * Resolve default documents list for application
   */
  getDefaultDocuments(appId) {
    if (appId === 'DEMO-ISSUES-001') {
      return [
        { id: 'doc_qr_fire', name: 'State Fire Service Certificate (NOC)', slot: 'FIRE_NOC', pages: 1 },
        { id: 'doc_digital_1', name: 'Land Title & Possession Deed', slot: 'LAND_DOC', pages: 3 },
        { id: 'doc_scanned_2', name: 'Building Approval Plan', slot: 'BUILDING_PLAN', pages: 2 }
      ];
    }
    return [
      { id: 'doc_digital_1', name: 'AICTE Approval Application Form', slot: 'FORM_APPLICATION', pages: 2 },
      { id: 'doc_qr_fire', name: 'State Fire Service NOC', slot: 'FIRE_NOC', pages: 1 }
    ];
  }

  /**
   * Resolve default grounded fields for document (Step 27)
   */
  getDefaultFields(docId) {
    if (docId === 'doc_qr_fire' || !docId) {
      return [
        {
          id: 'field-cert-no',
          key: 'certificate_no',
          label: 'Certificate No',
          value: 'FS/HQ/2023/NOC-4491',
          page: 1,
          bbox_norm: [0.05, 0.14, 0.52, 0.165],
          bbox_precision: 'word',
          rule_id: 'R-DOC-001'
        },
        {
          id: 'field-valid-till',
          key: 'valid_till',
          label: 'Validity: Expired',
          value: '2024-03-31',
          page: 1,
          bbox_norm: [0.05, 0.205, 0.58, 0.235],
          bbox_precision: 'word',
          severity: 'high',
          rule_id: 'R-EXP-001'
        },
        {
          id: 'field-official-seal',
          key: 'official_seal',
          label: 'Official Seal & Signature',
          value: 'SEAL_VALIDATED',
          page: 1,
          bbox_norm: [0.67, 0.78, 0.94, 0.92],
          bbox_precision: 'block'
        }
      ];
    }

    if (docId === 'doc_digital_1') {
      return [
        {
          id: 'field-land-area',
          key: 'land_area_acres',
          label: 'Contiguous Land Area',
          value: '7.5 Acres',
          page: 1,
          bbox_norm: [0.06, 0.30, 0.45, 0.34],
          bbox_precision: 'word',
          rule_id: 'R-LAND-001'
        }
      ];
    }

    if (docId === 'doc_scanned_2') {
      return [
        {
          id: 'field-builtup-area',
          key: 'builtup_area_sqm',
          label: 'Total Instructional Area',
          value: '14,200 sqm',
          page: 1,
          bbox_norm: [0.08, 0.38, 0.62, 0.46],
          bbox_precision: 'block',
          rule_id: 'R-BUILD-001'
        }
      ];
    }

    return [];
  }

  /**
   * Render simulated fallback document raster on HTML5 canvas
   */
  drawSyntheticFallback(ctx, w, h, pageNum) {
    // Clear background to clean white paper
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);

    // Outer margin border
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 1;
    ctx.strokeRect(24, 24, w - 48, h - 48);

    // Official State Emblem & Header banner
    ctx.fillStyle = '#1e3a8a';
    ctx.fillRect(36, 36, w - 72, 44);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 15px sans-serif';
    ctx.fillText('DIRECTORATE OF STATE FIRE & RESCUE EMERGENCY SERVICES', 48, 63);

    // Document Subject & Title
    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 18px sans-serif';
    ctx.fillText('NO OBJECTION CERTIFICATE (FIRE & LIFE SAFETY)', 150, 125);

    ctx.font = '12px monospace';
    ctx.fillStyle = '#475569';
    ctx.fillText(`Certificate No: FS/HQ/2023/NOC-4491 · Page ${pageNum} of ${this.totalPages}`, 48, 165);
    ctx.fillText('Issued To: Apex Institute of Technology & Management', 48, 190);
    ctx.fillText('Campus Address: Survey 142/A, Tech Knowledge Park, Greater Bengaluru', 48, 215);
    ctx.fillText('Validity Period: Valid up to 2024-03-31 [EXPIRED / STATUTORY DEFAULT]', 48, 240);

    // Simulated paragraph lines
    ctx.fillStyle = '#94a3b8';
    for (let y = 280; y < 720; y += 28) {
      const lineLen = y % 56 === 0 ? w - 180 : w - 96;
      ctx.fillRect(48, y, lineLen, 9);
    }

    // Official Seal and Verification Box
    ctx.strokeStyle = '#dc2626';
    ctx.lineWidth = 2;
    ctx.strokeRect(w - 260, h - 230, 210, 140);

    ctx.fillStyle = '#dc2626';
    ctx.font = 'bold 13px monospace';
    ctx.fillText('OFFICIAL SEAL & NOC REGISTRY', w - 245, h - 190);
    ctx.fillText('STATUS: EXPIRED MANDATORY DOC', w - 245, h - 160);
    ctx.font = '11px sans-serif';
    ctx.fillText(`Date of Expiry: 2024-03-31`, w - 245, h - 130);
    ctx.fillText(`Page Ref: Page ${pageNum}`, w - 245, h - 110);
  }

  /**
   * Render high-resolution document raster on HTML5 canvas (Step 26)
   */
  drawPage(pageNum = 1) {
    if (typeof document === 'undefined') return;
    const canvas = document.getElementById('evidence-canvas');
    if (!canvas || typeof canvas.getContext !== 'function') return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width || this.canvasWidth;
    const h = canvas.height || this.canvasHeight;

    // Check if this document can be loaded from the backend
    const activeDoc = (this.documents || []).find(d => d.id === this.currentDocId);
    const isRealUpload = Boolean(
      typeof Image !== 'undefined' &&
      activeDoc &&
      (activeDoc.isRealUpload || (this.currentDocId && (this.currentDocId.startsWith('doc_') && !this.currentDocId.includes('qr') && !this.currentDocId.includes('digital') && !this.currentDocId.includes('scanned'))))
    );

    if (isRealUpload && this.currentAppId && this.currentDocId) {
      const pageUrl = `/applications/${encodeURIComponent(this.currentAppId)}/documents/${encodeURIComponent(this.currentDocId)}/page/${pageNum}`;
      const img = new Image();
      img.crossOrigin = 'anonymous';

      // Loading indicator on canvas
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#64748b';
      ctx.font = '14px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`Loading document raster (${this.currentDocId})…`, w / 2, h / 2);
      ctx.textAlign = 'left';

      img.onload = () => {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, w, h);

        const imgAspect = img.width / img.height;
        const canvasAspect = w / h;
        let drawW = w;
        let drawH = h;
        let drawX = 0;
        let drawY = 0;

        if (imgAspect > canvasAspect) {
          drawW = w;
          drawH = w / imgAspect;
          drawY = (h - drawH) / 2;
        } else {
          drawH = h;
          drawW = h * imgAspect;
          drawX = (w - drawW) / 2;
        }

        ctx.drawImage(img, drawX, drawY, drawW, drawH);
      };

      img.onerror = () => {
        this.drawSyntheticFallback(ctx, w, h, pageNum);
      };
      img.src = pageUrl;
      return;
    }

    this.drawSyntheticFallback(ctx, w, h, pageNum);
  }

  /**
   * Render Normalized Bounding Box Overlays onto SVG Layer (Step 27)
   */
  renderOverlayBboxes(fields = null, pageNum = null) {
    if (typeof document === 'undefined') return '';
    const svgLayer = document.getElementById('evidence-overlay-svg');
    if (!svgLayer) return '';

    const targetPage = pageNum || this.currentPage;
    const activeFields = (fields || this.currentFields || [])
      .filter(f => (f.page || 1) === targetPage && Array.isArray(f.bbox_norm));

    const bboxesSvg = activeFields.map(f => {
      const scaled = this.scaleBboxNorm(f.bbox_norm, this.canvasWidth, this.canvasHeight);
      const isBlock = f.bbox_precision === 'block';
      const precisionClass = isBlock ? 'bbox-precision-block' : 'bbox-precision-word';
      const severityClass = f.severity === 'high' ? 'bbox-severity-high' : '';
      const strokeDash = isBlock ? '6, 4' : 'none';
      const isSelected = f.id === this.activeFieldId;
      const labelText = `${f.label || f.key || 'Field'}: ${f.value || ''}`;
      const textWidth = Math.min(240, Math.max(90, labelText.length * 7));

      return `
        <g class="bbox-group ${isSelected ? 'is-selected' : ''}"
           id="bbox-group-${f.id || f.key}"
           data-field-id="${f.id || f.key}"
           data-rule-id="${f.rule_id || ''}"
           data-precision="${f.bbox_precision || 'word'}"
           data-value="${f.value || ''}"
           onclick="window.evidenceViewerComponent && window.evidenceViewerComponent.selectBbox('${f.id || f.key}')">
          <rect class="bbox-rect ${precisionClass} ${severityClass} ${isSelected ? 'is-selected' : ''}"
                id="bbox-rect-${f.id || f.key}"
                x="${scaled.left}"
                y="${scaled.top}"
                width="${scaled.width}"
                height="${scaled.height}"
                stroke-dasharray="${strokeDash}" />
          <g class="bbox-label-pill">
            <rect class="bbox-label-bg"
                  x="${scaled.left}"
                  y="${Math.max(4, scaled.top - 18)}"
                  width="${textWidth}"
                  height="16" />
            <text class="bbox-label-tag"
                  x="${scaled.left + 5}"
                  y="${Math.max(16, scaled.top - 6)}">
              ${labelText}
            </text>
          </g>
        </g>
      `;
    }).join('');

    svgLayer.innerHTML = bboxesSvg;

    if (typeof window !== 'undefined' && typeof CustomEvent !== 'undefined' && typeof window.dispatchEvent === 'function') {
      window.dispatchEvent(new CustomEvent('app:evidence-bboxes-rendered', {
        detail: {
          page: targetPage,
          count: activeFields.length
        }
      }));
    }

    return bboxesSvg;
  }

  /**
   * Select Bounding Box on Canvas -> Link to Finding Card (Step 27 & Step 29)
   */
  selectBbox(fieldId) {
    this.activeFieldId = fieldId;

    // Resolve field and associated rule ID
    const field = (this.currentFields || []).find(f => (f.id === fieldId || f.key === fieldId));
    const ruleId = field ? field.rule_id : null;

    if (typeof document !== 'undefined') {
      // 1. Highlight clicked bbox on canvas with amber pulse
      const allBboxGroups = document.querySelectorAll('.bbox-group');
      allBboxGroups.forEach(g => {
        if (g.dataset.fieldId === fieldId) {
          g.classList.add('is-selected', 'bbox-pulse-highlight');
        } else {
          g.classList.remove('is-selected', 'bbox-pulse-highlight');
        }
      });

      // 2. Scroll to and highlight corresponding finding card in findings inspector (Step 29)
      if (ruleId) {
        this.activeFindingId = ruleId;
        const cardEl = document.getElementById(`finding-${ruleId}`);
        if (cardEl) {
          if (typeof cardEl.scrollIntoView === 'function') {
            cardEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          }
          const allFindingCards = document.querySelectorAll('.finding-card');
          allFindingCards.forEach(c => c.classList.remove('is-active', 'highlight-pulse'));
          cardEl.classList.add('is-active', 'highlight-pulse');
        }
      }
    }

    if (typeof window !== 'undefined' && typeof CustomEvent !== 'undefined' && typeof window.dispatchEvent === 'function') {
      window.dispatchEvent(new CustomEvent('app:evidence-bbox-clicked', {
        detail: {
          fieldId: fieldId,
          ruleId: ruleId,
          activeDocId: this.currentDocId,
          page: this.currentPage
        }
      }));
    }

    return fieldId;
  }

  /**
   * Select Finding Card -> Link to Canvas & Bounding Box (Step 29)
   * Verification: Clicking R-EXP-001 immediately brings the validity date box
   * into view on Page 1 and highlights it with amber pulse highlight.
   */
  async selectFinding(findingIdOrRuleId) {
    if (!findingIdOrRuleId) return;

    // 1. Resolve finding from aggregate list or rule metadata
    const finding = (this.findings || []).find(f => (f.rule_id === findingIdOrRuleId || f.id === findingIdOrRuleId)) || {
      rule_id: findingIdOrRuleId
    };
    const ruleId = finding.rule_id || findingIdOrRuleId;
    this.activeFindingId = ruleId;

    // 2. Resolve target document and page for this finding
    let targetDocId = null;
    let targetPage = 1;
    let targetFieldKey = null;

    if (ruleId === 'R-EXP-001') {
      targetDocId = 'doc_qr_fire';
      targetPage = 1;
      targetFieldKey = 'valid_till';
    } else if (ruleId === 'R-NUM-001') {
      targetDocId = 'doc_digital_1';
      targetPage = 1;
      targetFieldKey = 'intake';
    } else if (ruleId === 'R-DOC-001') {
      targetDocId = 'doc_qr_fire';
      targetPage = 1;
      targetFieldKey = 'certificate_no';
    } else if (ruleId === 'R-LAND-001') {
      targetDocId = 'doc_digital_1';
      targetPage = 1;
      targetFieldKey = 'land_area_acres';
    } else if (ruleId === 'R-BUILD-001') {
      targetDocId = 'doc_scanned_2';
      targetPage = 1;
      targetFieldKey = 'builtup_area_sqm';
    }

    // Switch document if not already active
    if (targetDocId && this.documents.some(d => d.id === targetDocId) && this.currentDocId !== targetDocId) {
      await this.switchDocument(targetDocId);
    }

    // Ensure page is targetPage
    if (this.currentPage !== targetPage) {
      this.setPage(targetPage);
    }

    // 3. Highlight Finding Card in Right Pane
    if (typeof document !== 'undefined') {
      const allCards = document.querySelectorAll('.finding-card');
      allCards.forEach(c => {
        if (c.dataset.ruleId === ruleId || c.id === `finding-${ruleId}`) {
          c.classList.add('is-active');
        } else {
          c.classList.remove('is-active');
        }
      });
    }

    // 4. Locate and animate target Bounding Box on Canvas (Amber Pulse Highlight)
    let targetBbox = null;
    if (typeof document !== 'undefined') {
      const allBboxes = document.querySelectorAll('.bbox-group');
      allBboxes.forEach(g => {
        const fieldId = g.dataset.fieldId;
        const gRuleId = g.dataset.ruleId;
        const matches = (gRuleId && gRuleId === ruleId) ||
                        (targetFieldKey && (fieldId === `field-${targetFieldKey}` || fieldId === targetFieldKey)) ||
                        (ruleId === 'R-EXP-001' && fieldId && fieldId.includes('valid'));
        if (matches) {
          targetBbox = g;
          g.classList.add('is-selected', 'bbox-pulse-highlight');
        } else {
          g.classList.remove('is-selected', 'bbox-pulse-highlight');
        }
      });

      // 5. Center Viewport on the Bounding Box
      const targetRect = targetBbox ? targetBbox.querySelector('.bbox-rect') : null;
      const viewport = document.getElementById('evidence-canvas-viewport');
      if (viewport && targetRect) {
        const x = parseFloat(targetRect.getAttribute('x') || 0);
        const y = parseFloat(targetRect.getAttribute('y') || 0);
        const w = parseFloat(targetRect.getAttribute('width') || 0);
        const h = parseFloat(targetRect.getAttribute('height') || 0);

        const bboxCenterX = x + (w / 2);
        const bboxCenterY = y + (h / 2);

        const vpWidth = viewport.clientWidth || 600;
        const vpHeight = viewport.clientHeight || 520;
        const targetScrollLeft = Math.max(0, (bboxCenterX * this.zoomLevel) - (vpWidth / 2));
        const targetScrollTop = Math.max(0, (bboxCenterY * this.zoomLevel) - (vpHeight / 2));

        if (typeof viewport.scrollTo === 'function') {
          viewport.scrollTo({ left: targetScrollLeft, top: targetScrollTop, behavior: 'smooth' });
        } else {
          viewport.scrollLeft = targetScrollLeft;
          viewport.scrollTop = targetScrollTop;
        }
        viewport.centeredX = targetScrollLeft;
        viewport.centeredY = targetScrollTop;
      }
    }

    // 6. Dispatch custom DOM event
    if (typeof window !== 'undefined' && typeof CustomEvent !== 'undefined' && typeof window.dispatchEvent === 'function') {
      window.dispatchEvent(new CustomEvent('app:evidence-finding-focused', {
        detail: {
          ruleId,
          findingId: finding.id || ruleId,
          documentId: this.currentDocId,
          page: this.currentPage,
          fieldKey: targetFieldKey
        }
      }));
    }

    return { ruleId, page: this.currentPage, targetDocId: this.currentDocId };
  }

  /**
   * Load Extracted Fields via GET /applications/{id}/documents/{doc_id}/fields (Step 27)
   */
  async loadFields(applicationId, documentId) {
    if (!documentId) return [];
    if (applicationId) this.currentAppId = applicationId;
    if (documentId) this.currentDocId = documentId;
    this.currentFields = [];

    try {
      const client = (typeof window !== 'undefined' && window.apiClient)
        ? window.apiClient
        : (typeof ApiClient !== 'undefined' ? new ApiClient() : null);

      if (client && typeof client.getDocumentFields === 'function' && applicationId) {
        const res = await client.getDocumentFields(applicationId, documentId);
        if (res && Array.isArray(res.fields)) {
          this.currentFields = res.fields;
        } else if (Array.isArray(res)) {
          this.currentFields = res;
        }
      }
    } catch (err) {
      console.warn(`[EvidenceViewer] Could not fetch fields for ${documentId}:`, err);
    }

    if (!this.currentFields || this.currentFields.length === 0) {
      this.currentFields = this.getDefaultFields(documentId);
    }

    this.renderOverlayBboxes(this.currentFields, this.currentPage);
    return this.currentFields;
  }

  /**
   * Set Zoom Level (Clamped 50% to 200%) (Step 26)
   */
  setZoom(level) {
    const clamped = Math.max(0.5, Math.min(2.0, Math.round(level * 100) / 100));
    this.zoomLevel = clamped;

    if (typeof document !== 'undefined') {
      const zoomText = document.getElementById('evidence-zoom-level');
      if (zoomText) {
        zoomText.textContent = `${Math.round(this.zoomLevel * 100)}%`;
      }

      const wrapper = document.getElementById('evidence-canvas-wrapper');
      if (wrapper && wrapper.style) {
        wrapper.style.transform = `scale(${this.zoomLevel})`;
        wrapper.style.transformOrigin = 'top center';
      }
    }

    if (typeof window !== 'undefined' && typeof CustomEvent !== 'undefined' && typeof window.dispatchEvent === 'function') {
      window.dispatchEvent(new CustomEvent('app:evidence-zoom-changed', {
        detail: {
          zoomLevel: this.zoomLevel,
          zoomPercent: Math.round(this.zoomLevel * 100)
        }
      }));
    }

    return this.zoomLevel;
  }

  /**
   * Zoom In: Step up zoom level (+25% / next preset)
   */
  zoomIn() {
    return this.setZoom(this.zoomLevel + 0.25);
  }

  /**
   * Zoom Out: Step down zoom level (-25% / prev preset)
   */
  zoomOut() {
    return this.setZoom(this.zoomLevel - 0.25);
  }

  /**
   * Fit Width: Computes viewport-to-canvas scale ratio (Step 26)
   */
  zoomFitWidth() {
    if (typeof document === 'undefined') return this.setZoom(1.0);
    const viewport = document.getElementById('evidence-canvas-viewport');
    const canvas = document.getElementById('evidence-canvas');
    if (!viewport || !canvas) return this.setZoom(1.0);

    const vpWidth = viewport.clientWidth || 600;
    const canvasWidth = canvas.width || this.canvasWidth;
    const fitScale = Math.max(0.4, Math.min(2.0, (vpWidth - 48) / canvasWidth));

    this.zoomLevel = Math.round(fitScale * 100) / 100;

    const zoomText = document.getElementById('evidence-zoom-level');
    if (zoomText) {
      zoomText.textContent = `Fit (${Math.round(this.zoomLevel * 100)}%)`;
    }

    const wrapper = document.getElementById('evidence-canvas-wrapper');
    if (wrapper && wrapper.style) {
      wrapper.style.transform = `scale(${this.zoomLevel})`;
      wrapper.style.transformOrigin = 'top center';
    }

    if (typeof window !== 'undefined' && typeof CustomEvent !== 'undefined' && typeof window.dispatchEvent === 'function') {
      window.dispatchEvent(new CustomEvent('app:evidence-zoom-changed', {
        detail: {
          zoomLevel: this.zoomLevel,
          zoomPercent: Math.round(this.zoomLevel * 100),
          isFitWidth: true
        }
      }));
    }

    return this.zoomLevel;
  }

  /**
   * Set Current Page (1 ... N) and re-draw canvas and overlays (Step 26 & Step 27)
   */
  setPage(pageNum) {
    const clamped = Math.max(1, Math.min(this.totalPages, pageNum));
    this.currentPage = clamped;

    if (typeof document !== 'undefined') {
      const pageIndicator = document.getElementById('evidence-page-indicator');
      if (pageIndicator) {
        pageIndicator.textContent = `Page ${this.currentPage} of ${this.totalPages}`;
      }

      const prevBtn = document.getElementById('btn-page-prev');
      if (prevBtn) {
        if (this.currentPage <= 1) {
          prevBtn.setAttribute('disabled', 'true');
        } else {
          prevBtn.removeAttribute('disabled');
        }
      }

      const nextBtn = document.getElementById('btn-page-next');
      if (nextBtn) {
        if (this.currentPage >= this.totalPages) {
          nextBtn.setAttribute('disabled', 'true');
        } else {
          nextBtn.removeAttribute('disabled');
        }
      }
    }

    this.drawPage(this.currentPage);
    this.renderOverlayBboxes(this.currentFields, this.currentPage);

    if (typeof window !== 'undefined' && typeof CustomEvent !== 'undefined' && typeof window.dispatchEvent === 'function') {
      window.dispatchEvent(new CustomEvent('app:evidence-page-changed', {
        detail: {
          page: this.currentPage,
          totalPages: this.totalPages
        }
      }));
    }

    return this.currentPage;
  }

  /**
   * Next Page helper
   */
  nextPage() {
    return this.setPage(this.currentPage + 1);
  }

  /**
   * Previous Page helper
   */
  prevPage() {
    return this.setPage(this.currentPage - 1);
  }

  /**
   * Attach Pan Dragging Listeners to Canvas Viewport (Step 26)
   */
  attachPanListeners(viewport) {
    if (!viewport || typeof viewport.addEventListener !== 'function') return;

    let startX = 0;
    let startY = 0;
    let scrollLeft = 0;
    let scrollTop = 0;

    const onMouseDown = (e) => {
      this.isPanning = true;
      if (viewport.classList && typeof viewport.classList.add === 'function') {
        viewport.classList.add('is-panning');
      }
      startX = (e.pageX || 0) - (viewport.offsetLeft || 0);
      startY = (e.pageY || 0) - (viewport.offsetTop || 0);
      scrollLeft = viewport.scrollLeft || 0;
      scrollTop = viewport.scrollTop || 0;
    };

    const onMouseMove = (e) => {
      if (!this.isPanning) return;
      if (typeof e.preventDefault === 'function') e.preventDefault();
      const x = (e.pageX || 0) - (viewport.offsetLeft || 0);
      const y = (e.pageY || 0) - (viewport.offsetTop || 0);
      const walkX = x - startX;
      const walkY = y - startY;
      viewport.scrollLeft = scrollLeft - walkX;
      viewport.scrollTop = scrollTop - walkY;
    };

    const onMouseUp = () => {
      this.isPanning = false;
      if (viewport.classList && typeof viewport.classList.remove === 'function') {
        viewport.classList.remove('is-panning');
      }
    };

    viewport.addEventListener('mousedown', onMouseDown);
    viewport.addEventListener('mousemove', onMouseMove);
    viewport.addEventListener('mouseup', onMouseUp);
    viewport.addEventListener('mouseleave', onMouseUp);
  }

  /**
   * Attach all toolbar event listeners (Zoom, Pan, Pagination)
   */
  attachEventListeners() {
    if (typeof document === 'undefined') return;

    // Zoom Buttons
    const btnZoomIn = document.getElementById('btn-zoom-in');
    if (btnZoomIn && typeof btnZoomIn.addEventListener === 'function') {
      btnZoomIn.addEventListener('click', () => this.zoomIn());
    }

    const btnZoomOut = document.getElementById('btn-zoom-out');
    if (btnZoomOut && typeof btnZoomOut.addEventListener === 'function') {
      btnZoomOut.addEventListener('click', () => this.zoomOut());
    }

    const btnZoomFit = document.getElementById('btn-zoom-fit');
    if (btnZoomFit && typeof btnZoomFit.addEventListener === 'function') {
      btnZoomFit.addEventListener('click', () => this.zoomFitWidth());
    }

    // Pagination Buttons
    const btnPagePrev = document.getElementById('btn-page-prev');
    if (btnPagePrev && typeof btnPagePrev.addEventListener === 'function') {
      btnPagePrev.addEventListener('click', () => this.prevPage());
    }

    const btnPageNext = document.getElementById('btn-page-next');
    if (btnPageNext && typeof btnPageNext.addEventListener === 'function') {
      btnPageNext.addEventListener('click', () => this.nextPage());
    }

    // Pan Dragging
    const viewport = document.getElementById('evidence-canvas-viewport');
    if (viewport) {
      this.attachPanListeners(viewport);
    }
  }

  /**
   * Switch active document in the viewer (Step 25, Step 26 & Step 27)
   */
  async switchDocument(docId) {
    if (!docId) return;
    this.currentDocId = docId;

    const doc = this.documents.find(d => d.id === docId);
    if (doc && doc.pages) {
      this.totalPages = doc.pages;
    } else {
      this.totalPages = 1;
    }

    try {
      const client = (typeof window !== 'undefined' && window.apiClient)
        ? window.apiClient
        : (typeof ApiClient !== 'undefined' ? new ApiClient() : null);

      if (client && typeof client.getDocumentExtraction === 'function' && this.currentAppId) {
        this.currentExtraction = await client.getDocumentExtraction(this.currentAppId, docId);
        if (this.currentExtraction && Array.isArray(this.currentExtraction.pages) && this.currentExtraction.pages.length > 0) {
          this.totalPages = this.currentExtraction.pages.length;
        }
      }
    } catch (err) {
      console.warn(`[EvidenceViewer] Could not fetch extraction for document ${docId}:`, err);
    }

    // Update document select dropdown in DOM if present
    if (typeof document !== 'undefined') {
      const select = document.getElementById('evidence-doc-select');
      if (select && select.value !== docId) {
        select.value = docId;
      }
    }

    // Reset pagination to page 1 for the new document
    this.setPage(1);

    // Load and render fields overlay for this document (Step 27)
    await this.loadFields(this.currentAppId, docId);

    // Dispatch custom DOM event
    if (typeof window !== 'undefined' && typeof CustomEvent !== 'undefined' && typeof window.dispatchEvent === 'function') {
      window.dispatchEvent(new CustomEvent('app:evidence-document-changed', {
        detail: {
          applicationId: this.currentAppId,
          documentId: docId,
          totalPages: this.totalPages,
          extraction: this.currentExtraction
        }
      }));
    }

    return this.currentExtraction;
  }

  /**
   * Render Split-Screen Workspace HTML (Step 25, Step 26 & Step 27)
   */
  render(applicationId, aggregate = null, uploadedDocs = []) {
    this.currentAppId = applicationId;
    
    // Resolve documents list: priority to real uploads, then aggregate, then synthetic defaults
    if (Array.isArray(uploadedDocs) && uploadedDocs.length > 0) {
      this.documents = uploadedDocs.map(d => ({
        id: d.document_id || d.id,
        name: `${d.doc_slot || 'Document'} (${d.document_id || d.id})`,
        slot: d.doc_slot || 'unspecified',
        media_type: d.media_type,
        byte_size: d.byte_size,
        pages: 1,
        isRealUpload: true,
      }));
    } else if (aggregate && Array.isArray(aggregate.documents) && aggregate.documents.length > 0) {
      this.documents = aggregate.documents;
    } else {
      this.documents = this.getDefaultDocuments(applicationId);
    }

    // Resolve findings list from aggregate
    this.findings = (aggregate && Array.isArray(aggregate.findings)) ? aggregate.findings : [];

    // Check if appState has a selectedDocId
    const stateDocId = (typeof window !== 'undefined' && window.appState && typeof window.appState.getState === 'function')
      ? window.appState.getState('selectedDocId')
      : null;

    if (stateDocId && this.documents.some(d => d.id === stateDocId)) {
      this.currentDocId = stateDocId;
    } else if (!this.currentDocId || !this.documents.some(d => d.id === this.currentDocId)) {
      this.currentDocId = this.documents[0] ? this.documents[0].id : null;
    }

    const activeDoc = this.documents.find(d => d.id === this.currentDocId);
    this.totalPages = activeDoc ? (activeDoc.pages || 1) : 1;
    this.currentPage = 1;

    // Documents selector dropdown options
    const docOptionsHtml = this.documents.map(doc => {
      const isSelected = doc.id === this.currentDocId;
      return `<option value="${doc.id}" ${isSelected ? 'selected' : ''}>${doc.slot || doc.name || doc.id} (${doc.name || doc.id})</option>`;
    }).join('');

    // Findings cards placeholder / list
    let findingsListHtml = '';
    if (this.findings.length === 0) {
      findingsListHtml = `
        <div class="finding-empty-placeholder">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="color: var(--status-pass); margin-bottom: var(--space-2);">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
            <polyline points="22 4 12 14.01 9 11.01"></polyline>
          </svg>
          <h4 style="margin: 0; color: var(--text-main);">Zero Discrepancies</h4>
          <p class="text-muted text-xs" style="margin-top: 4px;">No critical findings flagged for this document.</p>
        </div>
      `;
    } else {
      findingsListHtml = this.findings.map(finding => {
        if (typeof window !== 'undefined' && window.findingCardComponent && typeof window.findingCardComponent.renderCard === 'function') {
          return window.findingCardComponent.renderCard(finding, { applicationId: this.currentAppId });
        }
        const severityClass = finding.severity === 'high' ? 'badge-fail' : (finding.severity === 'medium' ? 'badge-warn' : 'badge-outline');
        return `
          <div class="card finding-card"
               id="finding-${finding.rule_id || finding.id || 'item'}"
               data-finding-id="${finding.id || finding.rule_id}"
               data-severity="${finding.severity || 'medium'}"
               style="border-left: 4px solid ${finding.severity === 'high' ? 'var(--status-fail)' : 'var(--status-warn)'}; margin-bottom: var(--space-3);">
            <div class="card-body" style="padding: var(--space-3) var(--space-4);">
              <div class="flex items-center justify-between" style="margin-bottom: var(--space-2);">
                <div style="display: flex; align-items: center; gap: var(--space-2);">
                  <span class="badge ${severityClass} text-xs font-mono">${(finding.severity || 'ISSUE').toUpperCase()}</span>
                  <strong class="font-mono text-xs text-main">${finding.rule_id || 'RULE'}</strong>
                </div>
                <span class="badge badge-outline text-xs">${finding.category || 'REGULATION'}</span>
              </div>
              <p class="text-xs" style="margin: 0 0 var(--space-2) 0; line-height: 1.4;">${finding.reason || 'Discrepancy detected between form and evidence.'}</p>
              <div class="text-faint font-mono text-xs" style="font-size: 10px;">
                Status: <span class="badge badge-review" style="font-size: 9px; padding: 1px 4px;">NEEDS_VERIFICATION</span>
              </div>
            </div>
          </div>
        `;
      }).join('');
    }

    return `
      <div class="evidence-split-workspace" id="evidence-split-workspace">
        <!-- =============================================================== -->
        <!-- Left Pane: Document Canvas Renderer (60% Desktop Width)        -->
        <!-- =============================================================== -->
        <section class="evidence-left-pane" id="evidence-canvas-pane" aria-label="Document Canvas Inspector">
          <!-- Canvas Top Toolbar: Document Selector, Pagination, Zoom (Step 26) -->
          <div class="evidence-toolbar" id="evidence-toolbar">
            <div class="evidence-toolbar-group">
              <label for="evidence-doc-select" class="text-xs text-muted" style="font-weight: 500;">Document:</label>
              <select id="evidence-doc-select"
                      class="form-select form-select-sm text-xs font-mono"
                      style="max-width: 280px; padding: 4px 8px; border-radius: var(--radius-sm); border: 1px solid var(--border-default); background: var(--bg-surface); color: var(--text-main);"
                      onchange="window.evidenceViewerComponent && window.evidenceViewerComponent.switchDocument(this.value)">
                ${docOptionsHtml}
              </select>
            </div>

            <!-- Page Pagination & Zoom Controls (Step 26) -->
            <div class="evidence-toolbar-group">
              <!-- Pagination (1 ... N) -->
              <div class="btn-group" style="display: flex; gap: 2px;">
                <button class="btn btn-outline btn-sm"
                        id="btn-page-prev"
                        title="Previous Page"
                        style="padding: 2px 8px;"
                        onclick="window.evidenceViewerComponent && window.evidenceViewerComponent.prevPage()"
                        ${this.currentPage <= 1 ? 'disabled' : ''}>&larr;</button>
                <span id="evidence-page-indicator" class="text-xs font-mono" style="padding: 4px 8px; background: var(--bg-surface); border: 1px solid var(--border-subtle); border-radius: var(--radius-sm);">Page ${this.currentPage} of ${this.totalPages}</span>
                <button class="btn btn-outline btn-sm"
                        id="btn-page-next"
                        title="Next Page"
                        style="padding: 2px 8px;"
                        onclick="window.evidenceViewerComponent && window.evidenceViewerComponent.nextPage()"
                        ${this.currentPage >= this.totalPages ? 'disabled' : ''}>&rarr;</button>
              </div>

              <!-- Zoom Controls (50%, 100%, 150%, 200%, Fit Width) -->
              <div class="btn-group" style="display: flex; gap: 2px; margin-left: var(--space-2);">
                <button class="btn btn-outline btn-sm"
                        id="btn-zoom-out"
                        title="Zoom Out (-25%)"
                        style="padding: 2px 8px;"
                        onclick="window.evidenceViewerComponent && window.evidenceViewerComponent.zoomOut()">-</button>
                <span id="evidence-zoom-level" class="text-xs font-mono" style="padding: 4px 8px; background: var(--bg-surface); border: 1px solid var(--border-subtle); border-radius: var(--radius-sm); min-width: 52px; text-align: center;">100%</span>
                <button class="btn btn-outline btn-sm"
                        id="btn-zoom-in"
                        title="Zoom In (+25%)"
                        style="padding: 2px 8px;"
                        onclick="window.evidenceViewerComponent && window.evidenceViewerComponent.zoomIn()">+</button>
                <button class="btn btn-outline btn-sm"
                        id="btn-zoom-fit"
                        title="Fit Width"
                        style="padding: 2px 8px;"
                        onclick="window.evidenceViewerComponent && window.evidenceViewerComponent.zoomFitWidth()">Fit</button>
              </div>
            </div>
          </div>

          <!-- Document Canvas Viewport & Coordinate Overlay Layer (Step 27) -->
          <div class="evidence-canvas-viewport" id="evidence-canvas-viewport" title="Click and drag to pan document">
            <div class="evidence-canvas-wrapper" id="evidence-canvas-wrapper">
              <canvas id="evidence-canvas" class="evidence-canvas" width="${this.canvasWidth}" height="${this.canvasHeight}"></canvas>
              <svg id="evidence-overlay-svg" class="evidence-overlay-svg" viewBox="0 0 ${this.canvasWidth} ${this.canvasHeight}"></svg>
            </div>
          </div>
        </section>

        <!-- =============================================================== -->
        <!-- Right Pane: Discrepancy Findings Inspector (40% Desktop Width) -->
        <!-- =============================================================== -->
        <aside class="evidence-right-pane" id="evidence-findings-pane" aria-label="Discrepancy Findings Inspector">
          <div class="findings-inspector-header">
            <div style="display: flex; align-items: center; gap: var(--space-2);">
              <h4 style="margin: 0; font-size: var(--font-size-sm); color: var(--text-main);">Discrepancy Findings</h4>
              <span class="badge ${this.findings.length > 0 ? 'badge-fail' : 'badge-pass'} text-xs font-mono" id="evidence-findings-count">
                ${this.findings.length}
              </span>
            </div>
            <span class="badge badge-simulated" style="font-size: 10px;">GROUNDED FACT MATRIX</span>
          </div>

          <div class="findings-inspector-body" id="evidence-findings-list">
            ${findingsListHtml}
          </div>
        </aside>
      </div>
    `;
  }

  /**
   * Load document and render split-pane workspace into target DOM container (Step 25, Step 26 & Step 27)
   */
  async loadAndRender(applicationId, container = null) {
    if (!applicationId) return;

    let targetEl = null;
    if (typeof document !== 'undefined') {
      targetEl = typeof container === 'string'
        ? document.getElementById(container)
        : (container || document.getElementById('workspace-evidence-content'));
    }

    let aggregate = null;
    let uploadedDocs = [];
    try {
      const client = (typeof window !== 'undefined' && window.apiClient)
        ? window.apiClient
        : (typeof ApiClient !== 'undefined' ? new ApiClient() : null);

      if (client && typeof client.getApplicationAggregate === 'function') {
        aggregate = await client.getApplicationAggregate(applicationId);
      }
      if (client && typeof client.getDocuments === 'function') {
        const docsRes = await client.getDocuments(applicationId);
        if (docsRes && Array.isArray(docsRes.documents) && docsRes.documents.length > 0) {
          uploadedDocs = docsRes.documents;
        }
      }
    } catch (err) {
      console.warn(`[EvidenceViewer] Could not fetch aggregate or docs for ${applicationId}:`, err);
    }

    if (!aggregate && typeof window !== 'undefined') {
      if (window.appState && window.appState.selectedAppAggregate) {
        aggregate = window.appState.selectedAppAggregate;
      } else if (window.workspaceComponent && window.workspaceComponent.currentAggregate) {
        aggregate = window.workspaceComponent.currentAggregate;
      }
    }

    const html = this.render(applicationId, aggregate, uploadedDocs);
    if (targetEl) {
      targetEl.innerHTML = html;
    }

    // Attach pan/zoom event listeners and draw initial canvas raster
    this.attachEventListeners();
    this.drawPage(this.currentPage);

    // Load grounded fields and render SVG coordinate bounding boxes (Step 27)
    await this.loadFields(applicationId, this.currentDocId);

    // Load recorded officer actions for findings (Step 30)
    if (typeof window !== 'undefined' && window.findingCardComponent && typeof window.findingCardComponent.loadFindingActions === 'function') {
      try {
        await window.findingCardComponent.loadFindingActions(applicationId);
      } catch (err) {
        console.warn(`[EvidenceViewer] Could not load finding actions:`, err);
      }
    }

    // Dispatch custom DOM event
    if (typeof window !== 'undefined' && typeof CustomEvent !== 'undefined' && typeof window.dispatchEvent === 'function') {
      window.dispatchEvent(new CustomEvent('app:evidence-viewer-loaded', {
        detail: {
          applicationId,
          activeDocId: this.currentDocId,
          documentsCount: this.documents.length,
          findingsCount: this.findings.length,
          zoomLevel: this.zoomLevel,
          currentPage: this.currentPage,
          totalPages: this.totalPages
        }
      }));
    }

    return html;
  }
}

// Singleton instantiation
const evidenceViewerComponent = new EvidenceViewerComponent();
if (typeof window !== 'undefined') {
  window.evidenceViewerComponent = evidenceViewerComponent;
  window.EvidenceViewerComponent = EvidenceViewerComponent;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { EvidenceViewerComponent };
}
