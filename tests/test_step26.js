/**
 * Test Step 26: Document Page Canvas Renderer with Zoom/Pan
 * Spec Reference: ROADMAP.md (Phase 5: Step 26), Guide §17.2
 *
 * Verifies:
 * 1. Document Page Canvas Rendering (drawPage) on HTML5 canvas.
 * 2. Zoom Controls:
 *    - 50%, 100%, 150%, 200%, Fit Width.
 *    - Zoom clamping (0.5 to 2.0).
 *    - Wrapper scaling transform: scale(level).
 *    - app:evidence-zoom-changed CustomEvent emission.
 * 3. Pan Dragging on Canvas Viewport:
 *    - mousedown, mousemove, mouseup/mouseleave event cycle.
 *    - is-panning class toggle and scrollLeft / scrollTop delta updates.
 * 4. Page Pagination Controls (1 ... N):
 *    - Page clamping: 1 <= page <= totalPages.
 *    - Indicator text updates: Page X of Y.
 *    - Button disabled state for first/last page.
 *    - app:evidence-page-changed CustomEvent emission.
 * 5. Dynamic Pagination synchronization when switching documents.
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
    offsetLeft: 50,
    offsetTop: 50,
    scrollLeft: 0,
    scrollTop: 0,
    style: {},
    dataset: {},
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
    getContext: (type) => {
      if (type === '2d') {
        return {
          fillStyle: '',
          strokeStyle: '',
          lineWidth: 1,
          font: '',
          fillRect: () => {},
          strokeRect: () => {},
          fillText: () => {},
          beginPath: () => {},
          stroke: () => {}
        };
      }
      return null;
    }
  };
  mockElements.set(id, el);
  return el;
};

// Setup mock workspace DOM elements
const mockCanvas = createMockElement('evidence-canvas');
const mockCanvasWrapper = createMockElement('evidence-canvas-wrapper');
const mockViewport = createMockElement('evidence-canvas-viewport');
const mockZoomLevel = createMockElement('evidence-zoom-level');
const mockPageIndicator = createMockElement('evidence-page-indicator');
const mockBtnPrev = createMockElement('btn-page-prev');
const mockBtnNext = createMockElement('btn-page-next');
const mockBtnZoomIn = createMockElement('btn-zoom-in');
const mockBtnZoomOut = createMockElement('btn-zoom-out');
const mockBtnZoomFit = createMockElement('btn-zoom-fit');
const mockDocSelect = createMockElement('evidence-doc-select');
const mockEvidenceContent = createMockElement('workspace-evidence-content');

global.document = {
  readyState: 'complete',
  getElementById: (id) => mockElements.get(id) || null,
  querySelector: (sel) => null,
  createElement: (tagName) => createMockElement(`dyn-${Math.random()}`),
  querySelectorAll: () => []
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

console.log('--- Step 26 Verification Starting ---');

assert(window.evidenceViewerComponent, 'evidenceViewerComponent singleton must exist on window');
const viewer = window.evidenceViewerComponent;

// 3. Test 1: Canvas Rendering (drawPage)
console.log('Testing Canvas Page Drawing (drawPage)...');
viewer.totalPages = 3;
viewer.drawPage(1);
// drawPage executes without throwing and successfully accesses 2d context

// 4. Test 2: Zoom Controls & Scaling Transforms
console.log('Testing Zoom Controls (50%, 100%, 150%, 200%, Fit Width)...');

// Initial Zoom: 1.0 (100%)
viewer.setZoom(1.0);
assert.strictEqual(viewer.zoomLevel, 1.0, 'Initial zoom level must be 1.0');
assert.strictEqual(mockZoomLevel.textContent, '100%');
assert.strictEqual(mockCanvasWrapper.style.transform, 'scale(1)');

// Zoom In: 1.0 -> 1.25 -> 1.5
eventsDispatched.length = 0;
viewer.zoomIn();
assert.strictEqual(viewer.zoomLevel, 1.25, 'Zoom in should increase by 0.25');
assert.strictEqual(mockZoomLevel.textContent, '125%');
assert.strictEqual(mockCanvasWrapper.style.transform, 'scale(1.25)');

let zoomEvt = eventsDispatched.find(e => e.type === 'app:evidence-zoom-changed');
assert(zoomEvt, 'app:evidence-zoom-changed must be dispatched');
assert.strictEqual(zoomEvt.detail.zoomLevel, 1.25);
assert.strictEqual(zoomEvt.detail.zoomPercent, 125);

// Zoom In to 200% (Maximum Cap)
viewer.setZoom(2.0);
assert.strictEqual(viewer.zoomLevel, 2.0);
viewer.zoomIn(); // attempt to exceed cap
assert.strictEqual(viewer.zoomLevel, 2.0, 'Zoom level must not exceed 2.0 (200%)');

// Zoom Out to 50% (Minimum Floor)
viewer.setZoom(0.5);
assert.strictEqual(viewer.zoomLevel, 0.5);
assert.strictEqual(mockZoomLevel.textContent, '50%');
viewer.zoomOut(); // attempt to go below floor
assert.strictEqual(viewer.zoomLevel, 0.5, 'Zoom level must not drop below 0.5 (50%)');

// Zoom Fit Width
eventsDispatched.length = 0;
viewer.zoomFitWidth();
assert(viewer.zoomLevel > 0, 'Fit Width must calculate a positive scale level');
assert(mockZoomLevel.textContent.includes('Fit'), 'Zoom indicator must display Fit text');
assert(mockCanvasWrapper.style.transform.includes('scale'), 'Wrapper must receive transform scale');

const fitEvt = eventsDispatched.find(e => e.type === 'app:evidence-zoom-changed');
assert(fitEvt, 'Fit Width must dispatch app:evidence-zoom-changed event');
assert.strictEqual(fitEvt.detail.isFitWidth, true);

// 5. Test 3: Pan Dragging on Canvas Viewport
console.log('Testing Pan Dragging Controller...');
viewer.attachPanListeners(mockViewport);

// Simulate Mouse Down (Start Panning)
mockViewport.dispatchEvent({
  type: 'mousedown',
  pageX: 100,
  pageY: 150
});
assert.strictEqual(viewer.isPanning, true, 'isPanning must be true on mousedown');
assert(mockViewport.classList.contains('is-panning'), 'Viewport must receive is-panning class');

// Simulate Mouse Move (Dragging by dx: 20, dy: 30)
mockViewport.dispatchEvent({
  type: 'mousemove',
  pageX: 120,
  pageY: 180,
  preventDefault: () => {}
});
assert.strictEqual(mockViewport.scrollLeft, -20, 'scrollLeft must update by -deltaX');
assert.strictEqual(mockViewport.scrollTop, -30, 'scrollTop must update by -deltaY');

// Simulate Mouse Up (End Panning)
mockViewport.dispatchEvent({
  type: 'mouseup'
});
assert.strictEqual(viewer.isPanning, false, 'isPanning must be false on mouseup');
assert(!mockViewport.classList.contains('is-panning'), 'Viewport must remove is-panning class');

// 6. Test 4: Page Pagination Controls (1 ... N)
console.log('Testing Page Pagination Controls...');
viewer.totalPages = 3;
viewer.setPage(1);

assert.strictEqual(viewer.currentPage, 1, 'Current page must be 1');
assert.strictEqual(mockPageIndicator.textContent, 'Page 1 of 3');
assert(mockBtnPrev.hasAttribute('disabled'), 'Previous button must be disabled on page 1');
assert(!mockBtnNext.hasAttribute('disabled'), 'Next button must NOT be disabled on page 1');

// Next Page: 1 -> 2
eventsDispatched.length = 0;
viewer.nextPage();
assert.strictEqual(viewer.currentPage, 2, 'nextPage() must advance to page 2');
assert.strictEqual(mockPageIndicator.textContent, 'Page 2 of 3');
assert(!mockBtnPrev.hasAttribute('disabled'), 'Previous button must NOT be disabled on page 2');
assert(!mockBtnNext.hasAttribute('disabled'), 'Next button must NOT be disabled on page 2');

const pageEvt = eventsDispatched.find(e => e.type === 'app:evidence-page-changed');
assert(pageEvt, 'app:evidence-page-changed must be dispatched');
assert.strictEqual(pageEvt.detail.page, 2);
assert.strictEqual(pageEvt.detail.totalPages, 3);

// Advance to Last Page: 2 -> 3
viewer.nextPage();
assert.strictEqual(viewer.currentPage, 3, 'Must reach page 3');
assert.strictEqual(mockPageIndicator.textContent, 'Page 3 of 3');
assert(!mockBtnPrev.hasAttribute('disabled'), 'Previous button must be enabled on page 3');
assert(mockBtnNext.hasAttribute('disabled'), 'Next button must be disabled on last page 3');

// Attempt to exceed total pages
viewer.nextPage();
assert.strictEqual(viewer.currentPage, 3, 'Current page must be clamped at totalPages (3)');

// Decrement to Page 1
viewer.prevPage();
assert.strictEqual(viewer.currentPage, 2);
viewer.prevPage();
assert.strictEqual(viewer.currentPage, 1);
viewer.prevPage(); // attempt to go below 1
assert.strictEqual(viewer.currentPage, 1, 'Current page must be floored at 1');

// 7. Test 5: Dynamic Pagination Synchronization on Document Switch
console.log('Testing Pagination Synchronization on Document Switch...');
viewer.documents = [
  { id: 'doc_qr_fire', name: 'Fire NOC', slot: 'FIRE_NOC', pages: 1 },
  { id: 'doc_digital_1', name: 'Land Title', slot: 'LAND_DOC', pages: 4 }
];

eventsDispatched.length = 0;
return viewer.switchDocument('doc_digital_1').then(() => {
  assert.strictEqual(viewer.currentDocId, 'doc_digital_1');
  assert.strictEqual(viewer.totalPages, 4, 'totalPages must update to 4 for doc_digital_1');
  assert.strictEqual(viewer.currentPage, 1, 'currentPage must reset to 1 on document switch');
  assert.strictEqual(mockPageIndicator.textContent, 'Page 1 of 4');

  const docEvt = eventsDispatched.find(e => e.type === 'app:evidence-document-changed');
  assert(docEvt, 'app:evidence-document-changed event must be dispatched');
  assert.strictEqual(docEvt.detail.totalPages, 4);

  console.log('✓ All Step 26 verification assertions passed successfully!');
});
