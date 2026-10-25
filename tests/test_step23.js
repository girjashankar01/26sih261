/**
 * Test Step 23: Complete 3-Valued Interactive Checklist Table
 * Spec Reference: ROADMAP.md (Phase 4: Step 23), Guide §17.1
 *
 * Verifies:
 * 1. Checklist table renders 6 required columns: Rule ID, Regulatory Clause,
 *    Rule Category, Compared Values (Form vs Doc/Record), Result Pill, and Plain Reason.
 * 2. Three-Valued Gate status representation (PASS, FAILED_CHECK, NEEDS_REVIEW, NOT_CHECKED).
 * 3. Exact mathematical formula tooltip for failed checks (e.g. intake violation 540 > 480).
 * 4. Merging findings and checks from S8 Rules Engine evaluation response.
 * 5. Integration with Workspace tab switching and live DOM injection.
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
const mockChecklistContent = createMockElement('workspace-checklist-content');
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
const checklistTableCode = fs.readFileSync(path.join(__dirname, '../ui/js/components/checklist_table.js'), 'utf8');
eval(checklistTableCode);

const workspaceCode = fs.readFileSync(path.join(__dirname, '../ui/js/components/workspace.js'), 'utf8');
eval(workspaceCode);

console.log('--- Step 23 Verification Starting ---');

// Test 1: Component Export Integrity
assert(window.checklistTableComponent, 'checklistTableComponent singleton must exist on window');
assert(window.ChecklistTableComponent, 'ChecklistTableComponent class must be exported');
assert(window.RULE_METADATA, 'RULE_METADATA map must be available');
assert(window.RULE_METADATA['R-NUM-001'], 'R-NUM-001 metadata must be defined');

// Test 2: Validation Data Fixture (Simulating S8 Rules Engine Response for DEMO-ISSUES-001)
const issuesValidationFixture = {
  application_id: 'DEMO-ISSUES-001',
  category: 'EOA_RENEWAL',
  rule_set: 'EOA_RENEWAL',
  rule_set_version: '2026.1',
  workflow: 'NEEDS_RECTIFICATION',
  findings: [
    {
      rule_id: 'R-NUM-001',
      category: 'INTAKE_COMPLIANCE',
      severity: 'high',
      status: 'FAILED_CHECK',
      reason: 'Requested intake (540) exceeds approved institutional record intake (480).',
      evidence: {
        submitted: { value: 540, source: 'application_form.pdf' },
        compared_with: { value: 480, source: 'aicte_approved_records' }
      }
    },
    {
      rule_id: 'R-DOC-001',
      category: 'MANDATORY_DOCUMENT',
      severity: 'high',
      status: 'FAILED_CHECK',
      reason: 'Mandatory document missing: AFFIDAVIT.',
      evidence: {
        missing_document: 'AFFIDAVIT'
      }
    },
    {
      rule_id: 'R-COMP-001',
      category: 'FIELD_COMPLETENESS',
      severity: 'medium',
      status: 'NEEDS_REVIEW',
      reason: 'Mandatory fields missing in FIRE_NOC: certificate_no, valid_till.',
      evidence: {
        missing_fields: ['certificate_no', 'valid_till']
      }
    }
  ],
  checks: [
    {
      rule_id: 'R-EXP-001',
      category: 'EXPIRY_CHECK',
      status: 'PASS',
      reason: 'All submitted statutory certificates are within valid dates.'
    },
    {
      rule_id: 'R-LAND-001',
      category: 'LAND_INFRA',
      status: 'PASS',
      reason: 'Total contiguous land area (7.5 acres) satisfies rural requirement (5.0 acres).'
    },
    {
      rule_id: 'R-BUILD-001',
      category: 'BUILT_UP_AREA',
      status: 'PASS',
      reason: 'Built-up instructional area (14200 sqm) meets prescribed norms.'
    }
  ]
};

// Test 3: Checklist Table DOM Rendering (6 Columns & Headers)
console.log('Testing Checklist Table 6-Column Layout...');
const tableHtml = window.checklistTableComponent.render('DEMO-ISSUES-001', issuesValidationFixture);

assert(tableHtml.includes('<table class="checklist-table" id="interactive-checklist-table">'), 'Must render #interactive-checklist-table');
assert(tableHtml.includes('Rule ID'), 'Header must include Rule ID column');
assert(tableHtml.includes('Regulatory Clause'), 'Header must include Regulatory Clause column');
assert(tableHtml.includes('Category'), 'Header must include Category column');
assert(tableHtml.includes('Compared Values (Form vs Document/Norm)'), 'Header must include Compared Values column');
assert(tableHtml.includes('Result'), 'Header must include Result column');
assert(tableHtml.includes('Plain-Language Reason'), 'Header must include Plain-Language Reason column');

// Test 4: Three-Valued Gate Status Pills
console.log('Testing Three-Valued Gate Status Badges...');
assert(tableHtml.includes('data-result="FAILED_CHECK"'), 'Table must contain FAILED_CHECK badge');
assert(tableHtml.includes('data-result="PASS"'), 'Table must contain PASS badge');
assert(tableHtml.includes('data-result="NEEDS_REVIEW"'), 'Table must contain NEEDS_REVIEW badge');
assert(tableHtml.includes('badge-fail'), 'Must use badge-fail CSS class for failed check');
assert(tableHtml.includes('badge-pass'), 'Must use badge-pass CSS class for passed check');
assert(tableHtml.includes('badge-review'), 'Must use badge-review CSS class for needs review');

// Verify NOT_CHECKED status pill format
const notCheckedPill = window.checklistTableComponent.renderResultPill('NOT_CHECKED');
assert(notCheckedPill.includes('badge-notchecked'), 'NOT_CHECKED must render badge-notchecked class');
assert(notCheckedPill.includes('NOT_CHECKED'), 'NOT_CHECKED text must be present');

// Test 5: Intake Norm (R-NUM-001) Failure & Mathematical Formula Tooltip
console.log('Testing R-NUM-001 Intake Compliance Formula & Tooltip...');
assert(tableHtml.includes('id="rule-row-R-NUM-001"'), 'Row for R-NUM-001 must exist');
assert(tableHtml.includes('checklist-row-failed'), 'Failed row must receive .checklist-row-failed class');
assert(tableHtml.includes('APH Ch. II, Cl. 2.5'), 'Row must cite regulatory clause APH Ch. II, Cl. 2.5');
assert(tableHtml.includes('Form: <strong>540 seats</strong> vs Approved Record: <strong>480 seats</strong> (540 > 480)'), 'Compared values must show exact 540 vs 480 comparison');

// Formula tooltip assertion
const formulaTooltip = window.checklistTableComponent.formatFormulaTooltip(issuesValidationFixture.findings[0]);
assert(formulaTooltip.includes('requested_intake (540) <= approved_intake (480)'), 'Tooltip must articulate exact comparison inequality');
assert(formulaTooltip.includes('[VIOLATION: 540 > 480]'), 'Tooltip must indicate violation condition');
assert(tableHtml.includes('id="formula-tooltip-R-NUM-001"'), 'Formula tooltip wrapper element must exist');

// Test 6: Checklist Merging Logic
console.log('Testing Findings & Checks Merging...');
window.checklistTableComponent.validationData = issuesValidationFixture;
const mergedItems = window.checklistTableComponent.getMergedChecklistItems();
assert.strictEqual(mergedItems.length, 6, 'Must merge 3 findings and 3 checks into 6 total items');

const rNumItem = mergedItems.find(i => i.rule_id === 'R-NUM-001');
assert(rNumItem && rNumItem.isFinding === true, 'R-NUM-001 must be tracked as finding');
assert.strictEqual(rNumItem.status, 'FAILED_CHECK');

const rLandItem = mergedItems.find(i => i.rule_id === 'R-LAND-001');
assert(rLandItem && rLandItem.isFinding === false, 'R-LAND-001 must be tracked as passed check');
assert.strictEqual(rLandItem.status, 'PASS');

// Test 7: Integration with loadAndRender & Workspace
console.log('Testing Workspace & ChecklistTableComponent Integration...');

// Mock ApiClient for loadAndRender
class MockApiClient {
  async getValidationResult(id) {
    return issuesValidationFixture;
  }
  async validateApplication(id) {
    return issuesValidationFixture;
  }
}
window.apiClient = new MockApiClient();

eventsDispatched.length = 0;
return window.checklistTableComponent.loadAndRender('DEMO-ISSUES-001', mockChecklistContent).then(renderedHtml => {
  assert(mockChecklistContent.innerHTML.includes('interactive-checklist-table'), 'loadAndRender must populate target element with table');
  
  const renderedEvt = eventsDispatched.find(e => e.type === 'app:checklist-rendered');
  assert(renderedEvt, 'app:checklist-rendered CustomEvent must be dispatched');
  assert.strictEqual(renderedEvt.detail.applicationId, 'DEMO-ISSUES-001');
  assert.strictEqual(renderedEvt.detail.itemsCount, 6);

  // Test Workspace tab switch to checklist
  window.workspaceComponent.currentAppId = 'DEMO-ISSUES-001';
  window.workspaceComponent.switchTab('checklist');
  assert.strictEqual(window.workspaceComponent.activeTab, 'checklist', 'Workspace activeTab must be checklist');

  console.log('✓ All Step 23 verification assertions passed successfully!');
});
