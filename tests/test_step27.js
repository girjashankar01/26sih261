/**
 * Test Step 27: Normalized Bounding Box SVG Overlay Math
 * Spec Reference: ROADMAP.md (Phase 5: Step 27), Guide §17.2
 *
 * Verifies:
 * 1. Normalized Bounding Box Scaling Math (Guide §17.2):
 *    left = x0 * W, top = y0 * H, width = (x1 - x0) * W, height = (y1 - y0) * H
 * 2. Precision Border Rules:
 *    - Word precision: Solid border (stroke-dasharray="none", .bbox-precision-word)
 *    - Block precision: Dashed border (stroke-dasharray="6, 4", .bbox-precision-block)
 * 3. Accurate Overlay Positioning directly over extracted words:
 *    - Certificate Number (FS/HQ/2023/NOC-4491)
 *    - Validity Date (2024-03-31 with high-severity red highlight)
 *    - Official Seal & Signature (block precision)
 * 4. SVG Layer Integration:
 *    - Injected into <svg id="evidence-overlay-svg"> with label tag pills.
 *    - Dispatches app:evidence-bboxes-rendered CustomEvent.
 * 5. Endpoint Connection:
 *    - loadFields invokes GET /applications/{id}/documents/{doc_id}/fields.
 * 6. Interactive Selection (selectBbox):
 *    - Toggles .is-selected class on active bbox group.
 *    - Dispatches app:evidence-bbox-clicked CustomEvent.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

// 1. Mock Browser Environment
const eventsDispatched = [];
const mockElements = new Map();

const createMockElement = (id) => {
  const listeners = {};
  const classes = new Set();
  const attributes = new Map();

  const el = {
    id,
    innerHTML: '',
    textContent: '',
    value: '',
    width: 800,
    height: 1100,
    clientWidth: 600,
    clientHeight: 520,
    style: {},
    dataset: {},
    children: [],
    classList: {
      add: (c) => classes.add(c),
      remove: (c) => classes.delete(c),
      contains: (c) => classes.has(c)
    },
    setAttribute: (k, v) => attributes.set(k, v),
    getAttribute: (k) => attributes.get(k) || null,
    removeAttribute: (k) => attributes.delete(k),
    hasAttribute: (k) => attributes.has(k),
    addEventListener: (evt, fn) => {
      listeners[evt] = listeners[evt] || [];
      listeners[evt].push(fn);
    },
    removeEventListener: (evt, fn) => {
      if (listeners[evt]) {
        listeners[evt] = listeners[evt].filter(f => f !== fn);
      }
    },
    dispatchEvent: (evt) => {
      if (listeners[evt.type]) {
        listeners[evt.type].forEach(fn => fn(evt));
      }
    },
    getContext: () => ({
      fillStyle: '', strokeStyle: '', fillRect: () => {}, strokeRect: () => {}, fillText: () => {}
    })
  };
  mockElements.set(id, el);
  return el;
};

// Setup mock workspace DOM elements
const mockOverlaySvg = createMockElement('evidence-overlay-svg');
const mockCanvas = createMockElement('evidence-canvas');
const mockCanvasWrapper = createMockElement('evidence-canvas-wrapper');
const mockViewport = createMockElement('evidence-canvas-viewport');
const mockZoomLevel = createMockElement('evidence-zoom-level');
const mockPageIndicator = createMockElement('evidence-page-indicator');
const mockDocSelect = createMockElement('evidence-doc-select');
const mockEvidenceContent = createMockElement('workspace-evidence-content');

// Dynamic bbox group mock storage
const mockBboxGroups = [];
global.document = {
  readyState: 'complete',
  getElementById: (id) => mockElements.get(id) || null,
  querySelector: (sel) => null,
  createElement: (tagName) => createMockElement(`dyn-${Math.random()}`),
  querySelectorAll: (sel) => {
    if (sel.includes('.bbox-group')) {
      return mockBboxGroups;
    }
    return [];
  }
};

global.window = {
  addEventListener: () => {},
  removeEventListener: () => {},
  dispatchEvent: (evt) => {
    eventsDispatched.push(evt);
  },
  location: { hash: '' },
  document: global.document
};

global.CustomEvent = class CustomEvent {
  constructor(type, params) {
    this.type = type;
    this.detail = params ? params.detail : null;
  }
};

// 2. Load Component Script
const evidenceViewerCode = fs.readFileSync(path.join(__dirname, '../ui/js/components/evidence_viewer.js'), 'utf8');
eval(evidenceViewerCode);

console.log('--- Step 27 Verification Starting ---');

assert(window.evidenceViewerComponent, 'evidenceViewerComponent singleton must exist on window');
const viewer = window.evidenceViewerComponent;

// 3. Test 1: Coordinate Scaling Math (Guide §17.2)
console.log('Testing Guide §17.2 Bounding Box Coordinate Scaling Math...');

// Case A: Typical field [x0=0.1, y0=0.2, x1=0.5, y1=0.25] on W=800, H=1100
const scaledA = viewer.scaleBboxNorm([0.1, 0.2, 0.5, 0.25], 800, 1100);
assert.strictEqual(scaledA.left, 80, 'left = 0.1 * 800 = 80');
assert.strictEqual(scaledA.top, 220, 'top = 0.2 * 1100 = 220');
assert.strictEqual(scaledA.width, 320, 'width = (0.5 - 0.1) * 800 = 320');
assert.strictEqual(scaledA.height, 55, 'height = (0.25 - 0.2) * 1100 = 55');

// Case B: Full document boundary [0, 0, 1, 1]
const scaledB = viewer.scaleBboxNorm([0, 0, 1, 1], 800, 1100);
assert.strictEqual(scaledB.left, 0);
assert.strictEqual(scaledB.top, 0);
assert.strictEqual(scaledB.width, 800);
assert.strictEqual(scaledB.height, 1100);

// Case C: Invalid/empty coordinates fallback
const scaledC = viewer.scaleBboxNorm(null);
assert.strictEqual(scaledC.left, 0);
assert.strictEqual(scaledC.width, 0);

// 4. Test 2: Word vs Block Precision Borders
console.log('Testing Word (Solid) vs Block (Dashed) Precision Borders...');

const sampleFields = [
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

eventsDispatched.length = 0;
const svgOutput = viewer.renderOverlayBboxes(sampleFields, 1);

// A. Word Precision Assertion (Certificate No)
assert(svgOutput.includes('bbox-precision-word'), 'Certificate number must receive .bbox-precision-word class');
assert(svgOutput.includes('stroke-dasharray="none"'), 'Word precision must have stroke-dasharray="none" (solid border)');
assert(svgOutput.includes('FS/HQ/2023/NOC-4491'), 'Certificate number value must be displayed in label tag');

// B. Block Precision Assertion (Official Seal)
assert(svgOutput.includes('bbox-precision-block'), 'Official seal must receive .bbox-precision-block class');
assert(svgOutput.includes('stroke-dasharray="6, 4"'), 'Block precision must have stroke-dasharray="6, 4" (dashed border)');

// C. High Severity Discrepancy Assertion (Expired Fire NOC)
assert(svgOutput.includes('bbox-severity-high'), 'Expired validity date must receive .bbox-severity-high class');
assert(svgOutput.includes('Validity: Expired: 2024-03-31'), 'Validity date label must indicate expired status');

// D. Custom Event Dispatch
const renderedEvt = eventsDispatched.find(e => e.type === 'app:evidence-bboxes-rendered');
assert(renderedEvt, 'app:evidence-bboxes-rendered CustomEvent must be dispatched');
assert.strictEqual(renderedEvt.detail.page, 1);
assert.strictEqual(renderedEvt.detail.count, 3);

// 5. Test 3: Endpoint Connection (GET /applications/{id}/documents/{doc_id}/fields)
console.log('Testing Endpoint Connection (loadFields)...');

class MockApiClient {
  constructor() {
    this.fieldsCalls = [];
  }
  async getDocumentFields(appId, docId) {
    this.fieldsCalls.push({ appId, docId });
    return {
      application_id: appId,
      document_id: docId,
      fields: sampleFields
    };
  }
}

const mockApi = new MockApiClient();
window.apiClient = mockApi;

return viewer.loadFields('DEMO-ISSUES-001', 'doc_qr_fire').then(loadedFields => {
  assert.strictEqual(mockApi.fieldsCalls.length, 1, 'loadFields must call apiClient.getDocumentFields');
  assert.strictEqual(mockApi.fieldsCalls[0].appId, 'DEMO-ISSUES-001');
  assert.strictEqual(mockApi.fieldsCalls[0].docId, 'doc_qr_fire');
  assert.strictEqual(loadedFields.length, 3, 'Must return 3 loaded fields');

  // 6. Test 4: Interactive Selection (selectBbox)
  console.log('Testing Interactive Bounding Box Selection...');
  
  // Create mock group element in mockBboxGroups
  const mockGroup = createMockElement('bbox-group-field-valid-till');
  mockGroup.dataset = { fieldId: 'field-valid-till' };
  mockBboxGroups.length = 0;
  mockBboxGroups.push(mockGroup);

  eventsDispatched.length = 0;
  viewer.selectBbox('field-valid-till');

  assert.strictEqual(viewer.activeFieldId, 'field-valid-till', 'activeFieldId must be set');
  assert(mockGroup.classList.contains('is-selected'), 'Selected bbox group must receive .is-selected class');

  const clickEvt = eventsDispatched.find(e => e.type === 'app:evidence-bbox-clicked');
  assert(clickEvt, 'app:evidence-bbox-clicked event must be dispatched');
  assert.strictEqual(clickEvt.detail.fieldId, 'field-valid-till');
  assert.strictEqual(clickEvt.detail.activeDocId, 'doc_qr_fire');

  // 7. Test 5: CSS Rules Verification in viewer.css
  console.log('Verifying CSS rules in ui/css/viewer.css...');
  const viewerCss = fs.readFileSync(path.join(__dirname, '../ui/css/viewer.css'), 'utf8');
  assert(viewerCss.includes('.bbox-precision-word'), 'CSS must define .bbox-precision-word');
  assert(viewerCss.includes('stroke-dasharray: none'), 'CSS must specify stroke-dasharray: none for word precision');
  assert(viewerCss.includes('.bbox-precision-block'), 'CSS must define .bbox-precision-block');
  assert(viewerCss.includes('stroke-dasharray: 6, 4'), 'CSS must specify dashed border for block precision');
  assert(viewerCss.includes('.bbox-severity-high'), 'CSS must define .bbox-severity-high');
  assert(viewerCss.includes('#dc2626'), 'CSS must highlight high-severity bbox in red');

  console.log('✓ All Step 27 verification assertions passed successfully!');
});
