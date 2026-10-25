/**
 * Test Step 29: Bidirectional Finding-to-Canvas Click Linking
 * Spec Reference: ROADMAP.md (Phase 5: Step 29), Guide §17.2
 *
 * Verifies:
 * 1. Bidirectional Coordination Engine:
 *    - Finding Card Click -> Canvas Bounding Box Highlight & Viewport Centering.
 *    - Canvas Bounding Box Click -> Finding Card Scroll & Highlight.
 * 2. Specific Verification Requirement:
 *    - Clicking R-EXP-001 immediately brings the validity date box into view
 *      on Page 1 and highlights it with amber pulse highlight (.bbox-pulse-highlight).
 * 3. Viewport Centering Math:
 *    - Computes center coordinates (bboxCenterX, bboxCenterY) and updates viewport scroll position.
 * 4. CSS Animation Rules:
 *    - @keyframes bboxAmberPulse and .bbox-pulse-highlight in ui/css/viewer.css.
 * 5. Event Coordination:
 *    - Emits app:evidence-finding-focused and app:evidence-bbox-clicked.
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
    scrollLeft: 0,
    scrollTop: 0,
    style: {},
    dataset: {},
    classList: {
      add: (...cls) => cls.forEach(c => classes.add(c)),
      remove: (...cls) => cls.forEach(c => classes.delete(c)),
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
    scrollIntoView: (options) => {
      el.scrolledIntoView = true;
      el.scrollOptions = options;
    },
    scrollTo: (options) => {
      el.scrollLeft = options.left;
      el.scrollTop = options.top;
      el.scrolledTo = options;
    },
    querySelector: (sel) => {
      if (sel === '.bbox-rect') {
        return el.rectChild || null;
      }
      return null;
    }
  };
  mockElements.set(id, el);
  return el;
};

// Setup mock workspace DOM elements
const mockViewport = createMockElement('evidence-canvas-viewport');
const mockOverlaySvg = createMockElement('evidence-overlay-svg');
const mockCanvas = createMockElement('evidence-canvas');
const mockCanvasWrapper = createMockElement('evidence-canvas-wrapper');
const mockZoomLevel = createMockElement('evidence-zoom-level');
const mockPageIndicator = createMockElement('evidence-page-indicator');
const mockDocSelect = createMockElement('evidence-doc-select');
const mockFindingsList = createMockElement('evidence-findings-list');

// Setup mock bbox groups
const mockBboxCert = createMockElement('bbox-group-field-cert-no');
mockBboxCert.dataset = { fieldId: 'field-cert-no', ruleId: 'R-DOC-001' };
const mockRectCert = createMockElement('bbox-rect-cert');
mockRectCert.setAttribute('x', '40');
mockRectCert.setAttribute('y', '154');
mockRectCert.setAttribute('width', '376');
mockRectCert.setAttribute('height', '28');
mockBboxCert.rectChild = mockRectCert;

const mockBboxValid = createMockElement('bbox-group-field-valid-till');
mockBboxValid.dataset = { fieldId: 'field-valid-till', ruleId: 'R-EXP-001' };
const mockRectValid = createMockElement('bbox-rect-valid');
mockRectValid.setAttribute('x', '40');
mockRectValid.setAttribute('y', '226');
mockRectValid.setAttribute('width', '424');
mockRectValid.setAttribute('height', '33');
mockBboxValid.rectChild = mockRectValid;

const mockAllBboxes = [mockBboxCert, mockBboxValid];

// Setup mock finding cards
const mockFindingExp = createMockElement('finding-R-EXP-001');
mockFindingExp.dataset = { ruleId: 'R-EXP-001' };

const mockFindingIntake = createMockElement('finding-R-NUM-001');
mockFindingIntake.dataset = { ruleId: 'R-NUM-001' };

const mockAllCards = [mockFindingExp, mockFindingIntake];

global.document = {
  readyState: 'complete',
  getElementById: (id) => mockElements.get(id) || null,
  querySelector: (sel) => null,
  createElement: (tagName) => createMockElement(`dyn-${Math.random()}`),
  querySelectorAll: (sel) => {
    if (sel.includes('.bbox-group')) return mockAllBboxes;
    if (sel.includes('.finding-card')) return mockAllCards;
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

// 2. Load Component Scripts
const findingCardCode = fs.readFileSync(path.join(__dirname, '../ui/js/components/finding_card.js'), 'utf8');
eval(findingCardCode);

const evidenceViewerCode = fs.readFileSync(path.join(__dirname, '../ui/js/components/evidence_viewer.js'), 'utf8');
eval(evidenceViewerCode);

console.log('--- Step 29 Verification Starting ---');

assert(window.evidenceViewerComponent, 'evidenceViewerComponent singleton must exist on window');
const viewer = window.evidenceViewerComponent;

// Initialize mock viewer state
viewer.currentAppId = 'DEMO-ISSUES-001';
viewer.currentDocId = 'doc_qr_fire';
viewer.currentPage = 1;
viewer.totalPages = 1;
viewer.zoomLevel = 1.0;
viewer.documents = [
  { id: 'doc_qr_fire', name: 'Fire NOC', slot: 'FIRE_NOC', pages: 1 },
  { id: 'doc_digital_1', name: 'Land Title', slot: 'LAND_DOC', pages: 3 }
];
viewer.findings = [
  { id: 'f-exp-01', rule_id: 'R-EXP-001', severity: 'high', observed: '2024-03-31', expected: '2026-10-12' },
  { id: 'f-num-02', rule_id: 'R-NUM-001', severity: 'high', observed: '540 seats', expected: '480 seats' }
];
viewer.currentFields = viewer.getDefaultFields('doc_qr_fire');

// 3. Test 1: Specification Verification Requirement for R-EXP-001 Click
// "Verification: Clicking R-EXP-001 immediately brings the validity date box into view
//  on Page 1 and highlights it."
console.log('Testing Specification Verification Requirement: Click R-EXP-001...');

eventsDispatched.length = 0;
return viewer.selectFinding('R-EXP-001').then(res => {
  // A. Correct Page and Document
  assert.strictEqual(viewer.currentPage, 1, 'R-EXP-001 must navigate to Page 1');
  assert.strictEqual(viewer.currentDocId, 'doc_qr_fire', 'R-EXP-001 must focus doc_qr_fire (Fire NOC)');

  // B. Target Bounding Box Amber Pulse Animation
  assert(mockBboxValid.classList.contains('bbox-pulse-highlight'), 'Target validity box MUST receive .bbox-pulse-highlight class!');
  assert(mockBboxValid.classList.contains('is-selected'), 'Target validity box MUST receive .is-selected class!');
  assert(!mockBboxCert.classList.contains('bbox-pulse-highlight'), 'Non-matching bbox must NOT have .bbox-pulse-highlight');

  // C. Finding Card Highlighting
  assert(mockFindingExp.classList.contains('is-active'), 'Finding card R-EXP-001 MUST receive .is-active class!');
  assert(!mockFindingIntake.classList.contains('is-active'), 'Finding card R-NUM-001 must NOT receive .is-active');

  // D. Viewport Centering Coordinates Math
  // Target rect: x=40, width=424 -> center X = 40 + 212 = 252
  // Target rect: y=226, height=33 -> center Y = 226 + 16.5 = 242.5
  // Viewport: width=600, height=520 -> half width=300, half height=260
  // targetScrollLeft = max(0, 252 - 300) = 0
  // targetScrollTop = max(0, 242.5 - 260) = 0
  assert(mockViewport.scrolledTo !== undefined, 'Viewport must execute scrollTo to center on evidence bounding box');
  assert.strictEqual(mockViewport.scrolledTo.behavior, 'smooth');

  // E. Custom Event Dispatch
  const focusEvt = eventsDispatched.find(e => e.type === 'app:evidence-finding-focused');
  assert(focusEvt, 'app:evidence-finding-focused event must be dispatched');
  assert.strictEqual(focusEvt.detail.ruleId, 'R-EXP-001');
  assert.strictEqual(focusEvt.detail.page, 1);
  assert.strictEqual(focusEvt.detail.fieldKey, 'valid_till');

  // 4. Test 2: Canvas Bounding Box -> Finding Card Click Linking (selectBbox)
  console.log('Testing Canvas Bounding Box Click Linking to Finding Card...');

  mockFindingExp.scrolledIntoView = false;
  eventsDispatched.length = 0;

  viewer.selectBbox('field-valid-till');

  // Finding card must be smoothly scrolled into view and highlighted
  assert.strictEqual(mockFindingExp.scrolledIntoView, true, 'Finding card MUST be smoothly scrolled into view');
  assert.strictEqual(mockFindingExp.scrollOptions.behavior, 'smooth');
  assert(mockFindingExp.classList.contains('is-active'), 'Finding card must be marked is-active');
  assert(mockFindingExp.classList.contains('highlight-pulse'), 'Finding card must receive highlight-pulse animation');

  // Custom event check
  const bboxClickEvt = eventsDispatched.find(e => e.type === 'app:evidence-bbox-clicked');
  assert(bboxClickEvt, 'app:evidence-bbox-clicked event must be dispatched');
  assert.strictEqual(bboxClickEvt.detail.fieldId, 'field-valid-till');
  assert.strictEqual(bboxClickEvt.detail.ruleId, 'R-EXP-001');

  // 5. Test 3: CSS Animation Verification in ui/css/viewer.css
  console.log('Verifying CSS Animation Rules in ui/css/viewer.css...');
  const viewerCss = fs.readFileSync(path.join(__dirname, '../ui/css/viewer.css'), 'utf8');

  assert(viewerCss.includes('@keyframes bboxAmberPulse'), 'viewer.css must define @keyframes bboxAmberPulse');
  assert(viewerCss.includes('.bbox-pulse-highlight'), 'viewer.css must define .bbox-pulse-highlight');
  assert(viewerCss.includes('#f59e0b'), 'Animation must use amber stroke (#f59e0b)');

  console.log('✓ All Step 29 verification assertions passed successfully!');
});
