/**
 * Test Step 25: Split-Pane Canvas & Findings Inspector Layout
 * Spec Reference: ROADMAP.md (Phase 5: Step 25), Guide §17.2
 *
 * Verifies:
 * 1. EvidenceViewerComponent singleton and class export.
 * 2. Split-screen layout:
 *    - Left pane for document page canvas renderer (60% width: #evidence-canvas-pane, .evidence-left-pane)
 *    - Right pane for discrepancy findings inspector (40% width: #evidence-findings-pane, .evidence-right-pane)
 * 3. CSS Responsive Stacking Rules in ui/css/viewer.css (desktop >= 1024px side-by-side vs < 1024px column stack).
 * 4. Document selector dropdown connected to GET /applications/{id}/documents/{doc_id}/extract.
 * 5. Document switching mechanics (switchDocument) and app:evidence-document-changed event dispatch.
 * 6. Integration with Workspace tab manager and DOM population.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

// 1. Mock Browser Environment
const eventsDispatched = [];
const mockState = {
  selectedAppId: null,
  selectedAppAggregate: null,
  get: function(k) { return this[k]; },
  setSelectedApp: function(id, agg) {
    this.selectedAppId = id;
    this.selectedAppAggregate = agg;
  }
};

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
    style: {},
    dataset: {},
    classList: {
      add: (c) => classes.add(c),
      remove: (c) => classes.delete(c),
      contains: (c) => classes.has(c)
    },
    setAttribute: (k, v) => attributes.set(k, v),
    getAttribute: (k) => attributes.get(k) || null,
    addEventListener: (evt, fn) => {
      listeners[evt] = listeners[evt] || [];
      listeners[evt].push(fn);
    },
    dispatchEvent: (evt) => {
      if (listeners[evt.type]) {
        listeners[evt.type].forEach(fn => fn(evt));
      }
    }
  };
  mockElements.set(id, el);
  return el;
};

// Setup mock workspace DOM elements
const mockEvidenceContent = createMockElement('workspace-evidence-content');
const mockDocSelect = createMockElement('evidence-doc-select');
const mockWorkspaceRoot = createMockElement('workspace-root');

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
  appState: mockState,
  document: global.document
};

global.CustomEvent = class CustomEvent {
  constructor(type, params) {
    this.type = type;
    this.detail = params ? params.detail : null;
  }
};

// 2. Load Component Scripts
const evidenceViewerCode = fs.readFileSync(path.join(__dirname, '../ui/js/components/evidence_viewer.js'), 'utf8');
eval(evidenceViewerCode);

const workspaceCode = fs.readFileSync(path.join(__dirname, '../ui/js/components/workspace.js'), 'utf8');
eval(workspaceCode);

console.log('--- Step 25 Verification Starting ---');

// Test 1: Component Export Integrity
assert(window.evidenceViewerComponent, 'evidenceViewerComponent singleton must exist on window');
assert(window.EvidenceViewerComponent, 'EvidenceViewerComponent class must be exported');
const viewer = window.evidenceViewerComponent;

// Test 2: Aggregate Fixture with Documents & Findings
const testAggregate = {
  application_id: 'DEMO-ISSUES-001',
  institution_name: 'Apex Institute of Technology & Management',
  documents: [
    { id: 'doc_qr_fire', name: 'State Fire Service Certificate', slot: 'FIRE_NOC', pages: 1 },
    { id: 'doc_digital_1', name: 'Land Title & Possession Deed', slot: 'LAND_DOC', pages: 3 },
    { id: 'doc_scanned_2', name: 'Building Approval Plan', slot: 'BUILDING_PLAN', pages: 2 }
  ],
  findings: [
    {
      id: 'f-1',
      rule_id: 'R-NUM-001',
      category: 'INTAKE_COMPLIANCE',
      severity: 'high',
      reason: 'Requested intake (540) exceeds approved institutional record intake (480).'
    },
    {
      id: 'f-2',
      rule_id: 'R-DOC-001',
      category: 'MANDATORY_DOCUMENT',
      severity: 'high',
      reason: 'Mandatory document missing: AFFIDAVIT.'
    },
    {
      id: 'f-3',
      rule_id: 'R-COMP-001',
      category: 'FIELD_COMPLETENESS',
      severity: 'medium',
      reason: 'Mandatory fields missing in FIRE_NOC: certificate_no, valid_till.'
    }
  ]
};

// Test 3: Split-Pane Workspace DOM Layout (60% / 40%)
console.log('Testing Split-Screen Layout (60% Left / 40% Right)...');
const renderedHtml = viewer.render('DEMO-ISSUES-001', testAggregate);

// A. Container Structure
assert(renderedHtml.includes('id="evidence-split-workspace"'), 'Must render #evidence-split-workspace container');
assert(renderedHtml.includes('class="evidence-split-workspace"'), 'Must have .evidence-split-workspace CSS class');

// B. Left Pane (Document Canvas Renderer: 60% Width)
assert(renderedHtml.includes('id="evidence-canvas-pane"'), 'Must render #evidence-canvas-pane for canvas renderer');
assert(renderedHtml.includes('class="evidence-left-pane"'), 'Left pane must have .evidence-left-pane class');
assert(renderedHtml.includes('id="evidence-toolbar"'), 'Must render #evidence-toolbar in left pane');
assert(renderedHtml.includes('id="evidence-canvas-viewport"'), 'Must render #evidence-canvas-viewport');
assert(renderedHtml.includes('id="evidence-canvas"'), 'Must render <canvas id="evidence-canvas">');
assert(renderedHtml.includes('id="evidence-overlay-svg"'), 'Must render <svg id="evidence-overlay-svg">');

// C. Right Pane (Discrepancy Findings Inspector: 40% Width)
assert(renderedHtml.includes('id="evidence-findings-pane"'), 'Must render #evidence-findings-pane for findings');
assert(renderedHtml.includes('class="evidence-right-pane"'), 'Right pane must have .evidence-right-pane class');
assert(renderedHtml.includes('id="evidence-findings-count"'), 'Must render #evidence-findings-count badge');
assert(renderedHtml.includes('id="evidence-findings-list"'), 'Must render #evidence-findings-list');

// D. Documents & Findings Content
assert(renderedHtml.includes('value="doc_qr_fire"'), 'Doc dropdown must contain option for doc_qr_fire');
assert(renderedHtml.includes('value="doc_digital_1"'), 'Doc dropdown must contain option for doc_digital_1');
assert(renderedHtml.includes('R-NUM-001'), 'Findings inspector must render R-NUM-001 card');
assert(renderedHtml.includes('R-COMP-001'), 'Findings inspector must render R-COMP-001 card');

// Test 4: CSS Layout & Responsive Verification in viewer.css
console.log('Verifying Desktop 60/40 & Mobile Responsive CSS in ui/css/viewer.css...');
const viewerCss = fs.readFileSync(path.join(__dirname, '../ui/css/viewer.css'), 'utf8');

// Desktop 60% Left Pane rule
assert(viewerCss.includes('.evidence-left-pane'), 'viewer.css must define .evidence-left-pane');
assert(viewerCss.includes('60%'), 'Left pane must specify 60% width');

// Desktop 40% Right Pane rule
assert(viewerCss.includes('.evidence-right-pane'), 'viewer.css must define .evidence-right-pane');
assert(viewerCss.includes('40%'), 'Right pane must specify 40% width');

// Responsive Stacking Rule for Mobile (< 1024px)
assert(viewerCss.includes('@media (max-width: 1023px)'), 'viewer.css must specify responsive breakpoint for < 1024px');
assert(viewerCss.includes('flex-direction: column'), 'Mobile breakpoint must stack panes vertically (column layout)');

// Test 5: Document Switching & API Endpoint Wiring
console.log('Testing Document Switching (switchDocument) & Endpoint Wiring...');
class MockApiClient {
  constructor() {
    this.extractedCalls = [];
  }
  async getDocumentExtraction(appId, docId) {
    this.extractedCalls.push({ appId, docId });
    return {
      document_id: docId,
      application_id: appId,
      pages: [{ page_number: 1, width: 800, height: 1100, blocks: [] }]
    };
  }
  async getApplicationAggregate(appId) {
    return testAggregate;
  }
}

const mockApi = new MockApiClient();
window.apiClient = mockApi;

eventsDispatched.length = 0;
return viewer.switchDocument('doc_digital_1').then(extraction => {
  assert.strictEqual(viewer.currentDocId, 'doc_digital_1', 'currentDocId must be updated to doc_digital_1');
  assert.strictEqual(mockApi.extractedCalls.length, 1, 'Must invoke getDocumentExtraction API method');
  assert.strictEqual(mockApi.extractedCalls[0].docId, 'doc_digital_1');

  const docChangedEvt = eventsDispatched.find(e => e.type === 'app:evidence-document-changed');
  assert(docChangedEvt, 'app:evidence-document-changed event must be emitted');
  assert.strictEqual(docChangedEvt.detail.documentId, 'doc_digital_1');

  // Test 6: Workspace loadAndRender Integration
  console.log('Testing Workspace & EvidenceViewer Integration...');
  eventsDispatched.length = 0;
  return viewer.loadAndRender('DEMO-ISSUES-001', mockEvidenceContent).then(html => {
    assert(mockEvidenceContent.innerHTML.includes('evidence-split-workspace'), 'loadAndRender must populate target container with split workspace');
    
    const loadedEvt = eventsDispatched.find(e => e.type === 'app:evidence-viewer-loaded');
    assert(loadedEvt, 'app:evidence-viewer-loaded event must be emitted');
    assert.strictEqual(loadedEvt.detail.applicationId, 'DEMO-ISSUES-001');
    assert.strictEqual(loadedEvt.detail.documentsCount, 3);
    assert.strictEqual(loadedEvt.detail.findingsCount, 3);

    // Switch workspace tab to evidence
    window.workspaceComponent.currentAppId = 'DEMO-ISSUES-001';
    window.workspaceComponent.switchTab('evidence');
    assert.strictEqual(window.workspaceComponent.activeTab, 'evidence', 'Workspace tab must switch to evidence');

    console.log('✓ All Step 25 verification assertions passed successfully!');
  });
});
