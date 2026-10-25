/**
 * Test Step 19: Application Detail Workspace & Tab Manager
 * Verification of 6 workspace navigation tabs, top metadata header card,
 * active tab switching, context preservation across tab transitions,
 * and DOM event dispatches.
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
const createMockElement = (id, tagName = 'div') => {
  const listeners = {};
  const classes = new Set();
  const attributes = new Map();

  const el = {
    id,
    tagName,
    innerHTML: '',
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

// Create root workspace DOM container
const mockWorkspaceRoot = createMockElement('workspace-root');

global.document = {
  readyState: 'complete',
  getElementById: (id) => mockElements.get(id) || null,
  querySelectorAll: (selector) => {
    if (selector === '.workspace-tab-btn') {
      const btns = [];
      ['checklist', 'documents', 'evidence', 'verifications', 'infra', 'exports'].forEach(tabId => {
        const btn = mockElements.get(`tab-btn-${tabId}`);
        if (btn) btns.push(btn);
      });
      return btns;
    }
    if (selector === '.workspace-tab-pane') {
      const panes = [];
      ['checklist', 'documents', 'evidence', 'verifications', 'infra', 'exports'].forEach(tabId => {
        const pane = mockElements.get(`workspace-pane-${tabId}`);
        if (pane) panes.push(pane);
      });
      return panes;
    }
    return [];
  }
};

global.ApiClient = class MockApiClient {
  async getApplicationAggregate(id) {
    return {
      application_id: id,
      workflow_status: 'NEEDS_RECTIFICATION',
      review_lane: 'NEEDS_SCRUTINY',
      findings: [{ id: 'f1' }, { id: 'f2' }],
      checks: [{ id: 'c1' }, { id: 'c2' }, { id: 'c3' }],
      documents: [{ id: 'd1' }, { id: 'd2' }],
      verifications: [{ id: 'v1' }],
      infra_checklist: [{ id: 'i1' }]
    };
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
  document: global.document,
  documentListComponent: {
    loadDocuments: () => {}
  }
};

global.CustomEvent = class CustomEvent {
  constructor(type, params) {
    this.type = type;
    this.detail = params ? params.detail : null;
  }
};

// 2. Load Workspace Component Script
const workspaceCode = fs.readFileSync(path.join(__dirname, '../ui/js/components/workspace.js'), 'utf8');
eval(workspaceCode);

console.log('--- Step 19 Verification Starting ---');

assert(window.workspaceComponent, 'WorkspaceComponent singleton must exist on window');
assert(window.WorkspaceComponent, 'WorkspaceComponent class must be exported');

// 3. Test 1: Verify 6 Standard Workspace Tabs Specification
const expectedTabs = [
  'checklist',
  'documents',
  'evidence',
  'verifications',
  'infra',
  'exports'
];

assert.strictEqual(window.workspaceComponent.tabs.length, 6, 'Workspace must define exactly 6 navigation tabs');
expectedTabs.forEach((tabId, index) => {
  assert.strictEqual(window.workspaceComponent.tabs[index].id, tabId, `Tab at index ${index} must have id '${tabId}'`);
});

// 4. Test 2: Render Empty State when no application is selected
const emptyStateHtml = window.workspaceComponent.renderEmptyState(mockWorkspaceRoot);
assert(emptyStateHtml.includes('No Application Selected'), 'Empty state must indicate no application is selected');
assert(emptyStateHtml.includes('href="#queue"'), 'Empty state must provide return link to queue dashboard');

// 5. Test 3: Load Application Bundle into Workspace
const appFixture = {
  id: 'DEMO-ISSUES-001',
  institution_name: 'Apex Institute of Technology & Management',
  aicte_id: '1-10998877',
  category: 'EOA_RENEWAL'
};

const aggFixture = {
  application_id: 'DEMO-ISSUES-001',
  workflow_status: 'NEEDS_RECTIFICATION',
  review_lane: 'NEEDS_SCRUTINY',
  institution_name: 'Apex Institute of Technology & Management',
  aicte_id: '1-10998877',
  category: 'EOA_RENEWAL',
  checks: [{ id: 'c1' }, { id: 'c2' }],
  documents: [{ id: 'd1' }, { id: 'd2' }],
  findings: [{ id: 'f1' }],
  verifications: [{ id: 'v1' }],
  infra_checklist: [{ id: 'i1' }]
};

eventsDispatched.length = 0;
const loadedAgg = window.workspaceComponent.loadApplication('DEMO-ISSUES-001', aggFixture);

assert.strictEqual(window.workspaceComponent.currentAppId, 'DEMO-ISSUES-001', 'currentAppId must be set to DEMO-ISSUES-001');
assert.strictEqual(window.workspaceComponent.currentAggregate, aggFixture, 'currentAggregate must reference aggFixture');
assert.strictEqual(window.appState.selectedAppId, 'DEMO-ISSUES-001', 'appState.selectedAppId must be synchronized');

// Check dispatched workspace loaded event
const loadedEvt = eventsDispatched.find(e => e.type === 'app:workspace-loaded');
assert(loadedEvt, 'app:workspace-loaded event must be dispatched');
assert.strictEqual(loadedEvt.detail.applicationId, 'DEMO-ISSUES-001');

// Verify HTML Structure rendered
const workspaceHtml = mockWorkspaceRoot.innerHTML;
assert(workspaceHtml.includes('id="workspace-header-container"'), 'Must render top metadata header container');
assert(workspaceHtml.includes('id="workspace-alerts-container"'), 'Must render active alerts container');
assert(workspaceHtml.includes('role="tablist"'), 'Must render tabs bar with role="tablist"');

// Verify all 6 tab buttons exist in HTML
expectedTabs.forEach(tabId => {
  assert(workspaceHtml.includes(`id="tab-btn-${tabId}"`), `Tab button #tab-btn-${tabId} must be rendered`);
  assert(workspaceHtml.includes(`id="workspace-pane-${tabId}"`), `Tab pane #workspace-pane-${tabId} must be rendered`);
});

// Verify Default Tab is checklist
assert.strictEqual(window.workspaceComponent.activeTab, 'checklist', 'Default active tab must be checklist');
assert(workspaceHtml.includes('id="tab-btn-checklist"'), 'Checklist tab button must be rendered');
assert(workspaceHtml.includes('class="workspace-tab-btn active"'), 'Active class must be applied to initial tab button');

// 6. Test 4: Tab Switching & Application Context Preservation
console.log('Testing Tab Switching & Context Preservation...');

// Set up mock DOM elements for querySelectorAll
expectedTabs.forEach(tabId => {
  const btn = createMockElement(`tab-btn-${tabId}`, 'button');
  btn.dataset.tab = tabId;
  if (tabId === 'checklist') btn.classList.add('active');

  const pane = createMockElement(`workspace-pane-${tabId}`, 'section');
  if (tabId !== 'checklist') pane.classList.add('hidden');
});

// A. Switch to "documents" tab
eventsDispatched.length = 0;
window.workspaceComponent.switchTab('documents');

assert.strictEqual(window.workspaceComponent.activeTab, 'documents', 'activeTab must now be documents');
assert.strictEqual(window.workspaceComponent.currentAppId, 'DEMO-ISSUES-001', 'currentAppId MUST be preserved!');
assert.strictEqual(window.workspaceComponent.currentAggregate, aggFixture, 'currentAggregate MUST be preserved!');

// Verify DOM classes toggled
const docBtn = mockElements.get('tab-btn-documents');
const checklistBtn = mockElements.get('tab-btn-checklist');
const docPane = mockElements.get('workspace-pane-documents');
const checklistPane = mockElements.get('workspace-pane-checklist');

assert(docBtn.classList.contains('active'), 'Documents tab button must now have .active class');
assert(!checklistBtn.classList.contains('active'), 'Checklist tab button must NOT have .active class');
assert(!docPane.classList.contains('hidden'), 'Documents pane must NOT have .hidden class');
assert(checklistPane.classList.contains('hidden'), 'Checklist pane must have .hidden class');

// Verify custom DOM event
const tabChangedEvt = eventsDispatched.find(e => e.type === 'app:workspace-tab-changed');
assert(tabChangedEvt, 'app:workspace-tab-changed event must be emitted');
assert.strictEqual(tabChangedEvt.detail.tabId, 'documents');
assert.strictEqual(tabChangedEvt.detail.applicationId, 'DEMO-ISSUES-001');

// B. Switch to "evidence" tab
window.workspaceComponent.switchTab('evidence');
assert.strictEqual(window.workspaceComponent.activeTab, 'evidence');
assert.strictEqual(window.workspaceComponent.currentAppId, 'DEMO-ISSUES-001', 'Context strictly preserved');
assert(!mockElements.get('workspace-pane-evidence').classList.contains('hidden'));
assert(docPane.classList.contains('hidden'));

// C. Switch to "verifications" tab
window.workspaceComponent.switchTab('verifications');
assert.strictEqual(window.workspaceComponent.activeTab, 'verifications');
assert.strictEqual(window.workspaceComponent.currentAppId, 'DEMO-ISSUES-001', 'Context strictly preserved');

// D. Switch to "infra" tab
window.workspaceComponent.switchTab('infra');
assert.strictEqual(window.workspaceComponent.activeTab, 'infra');
assert.strictEqual(window.workspaceComponent.currentAppId, 'DEMO-ISSUES-001', 'Context strictly preserved');

// E. Switch to "exports" tab
window.workspaceComponent.switchTab('exports');
assert.strictEqual(window.workspaceComponent.activeTab, 'exports');
assert.strictEqual(window.workspaceComponent.currentAppId, 'DEMO-ISSUES-001', 'Context strictly preserved');

console.log('✓ All Step 19 verification assertions passed successfully!');
