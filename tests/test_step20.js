/**
 * Test Step 20: Institutional Identity & Metadata Header Card
 * Verification of S7 facts integration, canonical institution name,
 * permanent AICTE ID, Academic Year, Application Category,
 * and 3-state workflow pill rendering.
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
  const el = {
    id,
    innerHTML: '',
    textContent: '',
    dataset: {},
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

const mockHeaderContainer = createMockElement('workspace-header-container');
const mockWorkspaceRoot = createMockElement('workspace-root');

global.document = {
  readyState: 'complete',
  getElementById: (id) => mockElements.get(id) || null,
  querySelectorAll: () => []
};

// S7 Typed Facts Fixture
const s7FactsBeacon = {
  application_id: 'DEMO-ISSUES-001',
  pipeline_stage: 'S7_TYPED_FACTS',
  simulated: true,
  decision_support_only: true,
  canonical_institute: {
    aicte_id: '1-10998878',
    name: 'Beacon College of Engineering',
    source: 'synthetic_record',
    address: 'Sector 62, Institutional Area, Noida',
    state: 'Uttar Pradesh',
    simulated: true
  },
  aliases: [
    {
      document_id: 'doc_fire_noc_1',
      doc_type: 'FIRE_NOC',
      extracted_name: 'Beacon College of Engg',
      canonical_name: 'Beacon College of Engineering',
      match_status: 'MATCH'
    }
  ],
  facts_count: 14,
  facts: []
};

const aggIssues = {
  application_id: 'DEMO-ISSUES-001',
  workflow_status: 'NEEDS_RECTIFICATION',
  review_lane: 'NEEDS_SCRUTINY',
  category: 'EOA_RENEWAL',
  findings: [{ severity: 'high' }]
};

const s7FactsBharat = {
  application_id: 'DEMO-CLEAN-001',
  pipeline_stage: 'S7_TYPED_FACTS',
  canonical_institute: {
    aicte_id: '1-55443322',
    name: 'Bharat Institute of Science & Technology',
    source: 'synthetic_record',
    address: 'Ring Road, Whitefield, Bangalore',
    state: 'Karnataka'
  },
  facts_count: 12
};

const aggClean = {
  application_id: 'DEMO-CLEAN-001',
  workflow_status: 'VALIDATED_NO_ISSUES',
  category: 'EOA_RENEWAL',
  findings: []
};

const aggReview = {
  application_id: 'DEMO-NEW-002',
  workflow_status: 'NEEDS_MANUAL_REVIEW',
  category: 'NEW_INSTITUTION',
  findings: [{ severity: 'medium' }]
};

global.ApiClient = class MockApiClient {
  async getApplicationFacts(id) {
    if (id === 'DEMO-ISSUES-001') return s7FactsBeacon;
    if (id === 'DEMO-CLEAN-001') return s7FactsBharat;
    return s7FactsBeacon;
  }
};

global.window = {
  addEventListener: () => {},
  removeEventListener: () => {},
  dispatchEvent: (evt) => {
    eventsDispatched.push(evt);
  },
  location: { hash: '' },
  appState: mockState,
  apiClient: new global.ApiClient(),
  document: global.document
};

global.CustomEvent = class CustomEvent {
  constructor(type, params) {
    this.type = type;
    this.detail = params ? params.detail : null;
  }
};

// 2. Load Component Scripts
const appHeaderCode = fs.readFileSync(path.join(__dirname, '../ui/js/components/application_header.js'), 'utf8');
eval(appHeaderCode);

const workspaceCode = fs.readFileSync(path.join(__dirname, '../ui/js/components/workspace.js'), 'utf8');
eval(workspaceCode);

console.log('--- Step 20 Verification Starting ---');

assert(window.applicationHeaderComponent, 'ApplicationHeaderComponent singleton must exist');
assert(window.ApplicationHeaderComponent, 'ApplicationHeaderComponent class must be exported');

// 3. Test 1: S7 Facts Canonical Rendering for DEMO-ISSUES-001
console.log('Testing Canonical Details Rendering for DEMO-ISSUES-001...');
const headerHtml = window.applicationHeaderComponent.render('DEMO-ISSUES-001', s7FactsBeacon, aggIssues);

assert(headerHtml.includes('id="app-header-card"'), 'Must render #app-header-card container');
assert(headerHtml.includes('Beacon College of Engineering'), 'Must render canonical institution name from S7 facts');
assert(headerHtml.includes('1-10998878'), 'Must render permanent AICTE ID from S7 facts');
assert(headerHtml.includes('2026-2027'), 'Must render Academic Year');
assert(headerHtml.includes('EoA Renewal'), 'Must format category to EoA Renewal');
assert(headerHtml.includes('Sector 62, Institutional Area, Noida, Uttar Pradesh'), 'Must render registered address and state');
assert(headerHtml.includes('14 Facts Verified'), 'Must display verified facts count');

// 4. Test 2: Workflow State Pill Variations
// A. NEEDS_RECTIFICATION -> Crimson badge-fail
assert(headerHtml.includes('badge-fail'), 'NEEDS_RECTIFICATION must be styled with badge-fail');
assert(headerHtml.includes('NEEDS RECTIFICATION'), 'Badge text must read NEEDS RECTIFICATION');

// B. VALIDATED_NO_ISSUES -> Green badge-pass
const headerCleanHtml = window.applicationHeaderComponent.render('DEMO-CLEAN-001', s7FactsBharat, aggClean);
assert(headerCleanHtml.includes('badge-pass'), 'VALIDATED_NO_ISSUES must use badge-pass');
assert(headerCleanHtml.includes('VALIDATED NO ISSUES'), 'Badge text must read VALIDATED NO ISSUES');
assert(headerCleanHtml.includes('Bharat Institute of Science &amp; Technology') || headerCleanHtml.includes('Bharat Institute of Science & Technology'));
assert(headerCleanHtml.includes('1-55443322'), 'Must display Bharat AICTE ID');

// C. NEEDS_MANUAL_REVIEW -> Purple badge-review
const headerReviewHtml = window.applicationHeaderComponent.render('DEMO-NEW-002', null, aggReview);
assert(headerReviewHtml.includes('badge-review'), 'NEEDS_MANUAL_REVIEW must use badge-review');
assert(headerReviewHtml.includes('NEEDS MANUAL REVIEW'), 'Badge text must read NEEDS MANUAL REVIEW');
assert(headerReviewHtml.includes('New Institution'), 'Must format NEW_INSTITUTION to New Institution');

// 5. Test 3: loadAndRender Asynchronous Integration
console.log('Testing loadAndRender with MockApiClient...');
eventsDispatched.length = 0;

async function testAsyncLoad() {
  const resultHtml = await window.applicationHeaderComponent.loadAndRender('DEMO-ISSUES-001', mockHeaderContainer, aggIssues);
  assert(resultHtml.includes('Beacon College of Engineering'), 'Async load must resolve S7 facts and render canonical name');
  assert.strictEqual(mockHeaderContainer.innerHTML, resultHtml, 'Container innerHTML must be populated');

  // Verify CustomEvent dispatch
  const headerEvt = eventsDispatched.find(e => e.type === 'app:header-rendered');
  assert(headerEvt, 'app:header-rendered CustomEvent must be emitted');
  assert.strictEqual(headerEvt.detail.applicationId, 'DEMO-ISSUES-001');
  assert.strictEqual(headerEvt.detail.facts.canonical_institute.name, 'Beacon College of Engineering');
}

testAsyncLoad().then(() => {
  // 6. Test 4: WorkspaceComponent Header Integration
  console.log('Testing WorkspaceComponent Integration...');
  window.workspaceComponent.currentFacts = s7FactsBeacon;
  window.workspaceComponent.currentAggregate = aggIssues;
  window.workspaceComponent.currentAppId = 'DEMO-ISSUES-001';

  const workspaceRendered = window.workspaceComponent.renderWorkspace(mockWorkspaceRoot);
  assert(workspaceRendered.includes('id="app-header-card"'), 'Workspace render must integrate #app-header-card');
  assert(workspaceRendered.includes('Beacon College of Engineering'), 'Workspace must reflect canonical institution name');
  assert(workspaceRendered.includes('1-10998878'), 'Workspace must reflect canonical AICTE ID');

  console.log('✓ All Step 20 verification assertions passed successfully!');
}).catch(err => {
  console.error('Test Step 20 Failed:', err);
  process.exit(1);
});
