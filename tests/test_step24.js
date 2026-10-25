/**
 * Test Step 24: Strict 5-State Rule Status Pill Renderer & Source Type Filter
 * Spec Reference: ROADMAP.md (Phase 4: Step 24), Guide §12, §17.1
 *
 * Verifies:
 * 1. Strict 5-State Status Pills:
 *    - PASS (Green badge with checkmark: ✓)
 *    - WARNING (Amber badge: ⚠)
 *    - FAILED_CHECK (Red badge with cross: ✕)
 *    - NOT_CHECKED (Slate badge; explicit missing check indicator: —)
 *    - NEEDS_REVIEW (Purple badge: 🔍)
 * 2. Unchecked rules display NOT_CHECKED in gray, never disguised as PASS.
 * 3. Filter Toolbar rendering (All, Issues, Passed, Not Checked, and Rule Source dropdown).
 * 4. Dynamic Status Filtering (All | Issues Only | Passed | Not Checked).
 * 5. Dynamic Source Filtering (All Sources | Deterministic | AI Extraction).
 * 6. Custom DOM Event app:checklist-filtered emission.
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
    children: [],
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
    },
    querySelectorAll: (sel) => {
      // Mock row and button query selectors
      if (sel.includes('tr.checklist-row')) {
        return el.rows || [];
      }
      if (sel.includes('.checklist-filter-btn')) {
        return el.filterButtons || [];
      }
      return [];
    }
  };
  mockElements.set(id, el);
  return el;
};

// Setup mock workspace DOM elements
const mockTable = createMockElement('interactive-checklist-table');
const mockSourceSelect = createMockElement('checklist-source-filter');
const mockChecklistContent = createMockElement('workspace-checklist-content');

global.document = {
  readyState: 'complete',
  getElementById: (id) => mockElements.get(id) || null,
  querySelector: (sel) => null,
  createElement: (tagName) => createMockElement(`dyn-${Math.random()}`),
  querySelectorAll: (sel) => {
    if (sel.includes('.checklist-filter-btn')) {
      return mockTable.filterButtons || [];
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
  appState: mockState,
  document: global.document
};

global.CustomEvent = class CustomEvent {
  constructor(type, params) {
    this.type = type;
    this.detail = params ? params.detail : null;
  }
};

// 2. Load Component Script
const checklistTableCode = fs.readFileSync(path.join(__dirname, '../ui/js/components/checklist_table.js'), 'utf8');
eval(checklistTableCode);

console.log('--- Step 24 Verification Starting ---');

assert(window.checklistTableComponent, 'checklistTableComponent singleton must exist on window');
const comp = window.checklistTableComponent;

// 3. Test 1: Strict 5-State Rule Status Pill Renderer (Guide §17.1 & Step 24)
console.log('Testing Strict 5-State Status Pills...');

// State 1: PASS (Green badge with checkmark)
const passPill = comp.renderResultPill('PASS');
assert(passPill.includes('badge-pass'), 'PASS must use badge-pass');
assert(passPill.includes('✓ PASS'), 'PASS must include checkmark ✓');
assert(passPill.includes('data-result="PASS"'), 'PASS must specify data-result="PASS"');

// State 2: WARNING (Amber badge)
const warnPill = comp.renderResultPill('WARNING');
assert(warnPill.includes('badge-warn'), 'WARNING must use badge-warn');
assert(warnPill.includes('⚠ WARNING'), 'WARNING must include warning symbol ⚠');
assert(warnPill.includes('data-result="WARNING"'), 'WARNING must specify data-result="WARNING"');

// State 3: FAILED_CHECK (Red badge with cross)
const failPill = comp.renderResultPill('FAILED_CHECK');
assert(failPill.includes('badge-fail'), 'FAILED_CHECK must use badge-fail');
assert(failPill.includes('✕ FAILED_CHECK'), 'FAILED_CHECK must include cross ✕');
assert(failPill.includes('data-result="FAILED_CHECK"'), 'FAILED_CHECK must specify data-result="FAILED_CHECK"');

// State 4: NOT_CHECKED (Slate badge; explicit missing check indicator)
const notCheckedPill = comp.renderResultPill('NOT_CHECKED');
assert(notCheckedPill.includes('badge-notchecked'), 'NOT_CHECKED must use badge-notchecked');
assert(notCheckedPill.includes('— NOT_CHECKED'), 'NOT_CHECKED must include em-dash —');
assert(notCheckedPill.includes('data-result="NOT_CHECKED"'), 'NOT_CHECKED must specify data-result="NOT_CHECKED"');

// State 5: NEEDS_REVIEW (Purple badge)
const reviewPill = comp.renderResultPill('NEEDS_REVIEW');
assert(reviewPill.includes('badge-review'), 'NEEDS_REVIEW must use badge-review');
assert(reviewPill.includes('🔍 NEEDS_REVIEW'), 'NEEDS_REVIEW must include magnifying glass 🔍');
assert(reviewPill.includes('data-result="NEEDS_REVIEW"'), 'NEEDS_REVIEW must specify data-result="NEEDS_REVIEW"');

// Verification Requirement: Unchecked rules display NOT_CHECKED in gray, never disguised as PASS
console.log('Testing Unchecked/Undefined Rule Safety...');
const undefinedPill = comp.renderResultPill(undefined);
assert(undefinedPill.includes('badge-notchecked'), 'Undefined status must fall back to badge-notchecked');
assert(!undefinedPill.includes('badge-pass'), 'Undefined status must NEVER be disguised as PASS');
assert(!undefinedPill.includes('✓'), 'Undefined status must NEVER contain checkmark');

const emptyPill = comp.renderResultPill('');
assert(emptyPill.includes('badge-notchecked'), 'Empty status must fall back to badge-notchecked');
assert(!emptyPill.includes('badge-pass'), 'Empty status must NEVER be disguised as PASS');

// 4. Test 2: Validation Data Fixture with All 5 States
const fiveStateFixture = {
  application_id: 'DEMO-ISSUES-001',
  category: 'EOA_RENEWAL',
  rule_set: 'EOA_RENEWAL',
  rule_set_version: '2026.1',
  findings: [
    {
      rule_id: 'R-NUM-001',
      category: 'INTAKE_COMPLIANCE',
      status: 'FAILED_CHECK',
      reason: 'Requested intake (540) exceeds approved institutional record intake (480).'
    },
    {
      rule_id: 'R-DOC-001',
      category: 'MANDATORY_DOCUMENT',
      status: 'FAILED_CHECK',
      reason: 'Mandatory document missing: AFFIDAVIT.'
    },
    {
      rule_id: 'R-COMP-001',
      category: 'FIELD_COMPLETENESS',
      status: 'NEEDS_REVIEW',
      reason: 'Mandatory fields missing in FIRE_NOC: certificate_no, valid_till.'
    },
    {
      rule_id: 'R-NAME-001',
      category: 'ENTITY_RESOLUTION',
      status: 'WARNING',
      reason: 'Minor legal form suffix variation detected (Society vs Trust).'
    }
  ],
  checks: [
    {
      rule_id: 'R-EXP-001',
      category: 'EXPIRY_CHECK',
      status: 'PASS',
      reason: 'All statutory certificates are within validity period.'
    },
    {
      rule_id: 'R-LAND-001',
      category: 'LAND_INFRA',
      status: 'PASS',
      reason: 'Contiguous land area meets norms.'
    }
  ],
  unchecked: [
    {
      rule_id: 'R-BUILD-001',
      category: 'BUILT_UP_AREA',
      status: 'NOT_CHECKED',
      reason: 'Built-up area verification requires physical inspection.'
    }
  ]
};

// 5. Test 3: Table Rendering & Filter Toolbar Layout
console.log('Testing Filter Toolbar & Source Badges...');
const renderedHtml = comp.render('DEMO-ISSUES-001', fiveStateFixture);

// Verify Filter Toolbar Buttons
assert(renderedHtml.includes('id="btn-filter-all"'), 'Must render All filter button');
assert(renderedHtml.includes('id="btn-filter-issues"'), 'Must render Issues filter button');
assert(renderedHtml.includes('id="btn-filter-pass"'), 'Must render Passed filter button');
assert(renderedHtml.includes('id="btn-filter-notchecked"'), 'Must render Not Checked filter button');
assert(renderedHtml.includes('id="checklist-source-filter"'), 'Must render Source Type dropdown filter');

// Verify Counts in Toolbar
assert(renderedHtml.includes('All (7)'), 'Toolbar must count 7 total evaluated rules');
assert(renderedHtml.includes('Issues (4)'), 'Toolbar must count 4 issues (2 failed + 1 review + 1 warning)');
assert(renderedHtml.includes('Passed (2)'), 'Toolbar must count 2 passed checks');
assert(renderedHtml.includes('Not Checked (1)'), 'Toolbar must count 1 not checked rule');

// Verify Source Badges in Table Rows
assert(renderedHtml.includes('badge-source-det'), 'Must render DETERMINISTIC source badge');
assert(renderedHtml.includes('badge-source-ai'), 'Must render AI EXTRACTION source badge');
assert(renderedHtml.includes('DETERMINISTIC'), 'DETERMINISTIC source label must be present');
assert(renderedHtml.includes('AI EXTRACTION'), 'AI EXTRACTION source label must be present');

// 6. Test 4: Dynamic DOM Filtering Mechanics (applyFilters)
console.log('Testing applyFilters Logic...');

// Populate mock table rows
const mockRows = [
  { id: 'r1', dataset: { result: 'FAILED_CHECK', sourceType: 'DETERMINISTIC' }, style: {} },
  { id: 'r2', dataset: { result: 'FAILED_CHECK', sourceType: 'DETERMINISTIC' }, style: {} },
  { id: 'r3', dataset: { result: 'NEEDS_REVIEW', sourceType: 'AI_EXTRACTION' }, style: {} },
  { id: 'r4', dataset: { result: 'WARNING', sourceType: 'AI_EXTRACTION' }, style: {} },
  { id: 'r5', dataset: { result: 'PASS', sourceType: 'DETERMINISTIC' }, style: {} },
  { id: 'r6', dataset: { result: 'PASS', sourceType: 'DETERMINISTIC' }, style: {} },
  { id: 'r7', dataset: { result: 'NOT_CHECKED', sourceType: 'DETERMINISTIC' }, style: {} }
];
mockTable.rows = mockRows;

const mockBtnAll = createMockElement('btn-filter-all');
mockBtnAll.dataset = { filterType: 'status', filterValue: 'ALL' };
const mockBtnIssues = createMockElement('btn-filter-issues');
mockBtnIssues.dataset = { filterType: 'status', filterValue: 'ISSUES' };
const mockBtnPass = createMockElement('btn-filter-pass');
mockBtnPass.dataset = { filterType: 'status', filterValue: 'PASS' };
const mockBtnNotChecked = createMockElement('btn-filter-notchecked');
mockBtnNotChecked.dataset = { filterType: 'status', filterValue: 'NOT_CHECKED' };

mockTable.filterButtons = [mockBtnAll, mockBtnIssues, mockBtnPass, mockBtnNotChecked];

// A. Filter by ISSUES
eventsDispatched.length = 0;
comp.setStatusFilter('ISSUES');
let visible = comp.applyFilters();
assert.strictEqual(visible, 4, 'ISSUES filter must show exactly 4 rows (2 failed + 1 review + 1 warning)');
assert.strictEqual(mockRows[0].style.display, '', 'Failed row r1 must be visible');
assert.strictEqual(mockRows[2].style.display, '', 'Review row r3 must be visible');
assert.strictEqual(mockRows[3].style.display, '', 'Warning row r4 must be visible');
assert.strictEqual(mockRows[4].style.display, 'none', 'Pass row r5 must be hidden');
assert.strictEqual(mockRows[6].style.display, 'none', 'Not Checked row r7 must be hidden');

const filterEvt1 = eventsDispatched.find(e => e.type === 'app:checklist-filtered');
assert(filterEvt1, 'app:checklist-filtered must be dispatched');
assert.strictEqual(filterEvt1.detail.statusFilter, 'ISSUES');
assert.strictEqual(filterEvt1.detail.visibleCount, 4);

// B. Filter by PASS
eventsDispatched.length = 0;
comp.setStatusFilter('PASS');
visible = comp.applyFilters();
assert.strictEqual(visible, 2, 'PASS filter must show exactly 2 rows');
assert.strictEqual(mockRows[4].style.display, '', 'Pass row r5 must be visible');
assert.strictEqual(mockRows[5].style.display, '', 'Pass row r6 must be visible');
assert.strictEqual(mockRows[0].style.display, 'none', 'Failed row r1 must be hidden');

// C. Filter by NOT_CHECKED
eventsDispatched.length = 0;
comp.setStatusFilter('NOT_CHECKED');
visible = comp.applyFilters();
assert.strictEqual(visible, 1, 'NOT_CHECKED filter must show exactly 1 row');
assert.strictEqual(mockRows[6].style.display, '', 'Not Checked row r7 must be visible');
assert.strictEqual(mockRows[0].style.display, 'none', 'Failed row r1 must be hidden');

// D. Filter by Source: AI_EXTRACTION on All Statuses
eventsDispatched.length = 0;
comp.setStatusFilter('ALL');
comp.setSourceFilter('AI_EXTRACTION');
visible = comp.applyFilters();
assert.strictEqual(visible, 2, 'AI_EXTRACTION must show 2 rows (r3 and r4)');
assert.strictEqual(mockRows[2].style.display, '', 'AI row r3 must be visible');
assert.strictEqual(mockRows[3].style.display, '', 'AI row r4 must be visible');
assert.strictEqual(mockRows[0].style.display, 'none', 'Deterministic row r1 must be hidden');

// E. Reset to ALL
comp.setStatusFilter('ALL');
comp.setSourceFilter('ALL');
visible = comp.applyFilters();
assert.strictEqual(visible, 7, 'ALL filters must show all 7 rows');

console.log('✓ All Step 24 verification assertions passed successfully!');
