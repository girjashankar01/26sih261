/**
 * Test Step 18: Client-Side Filter, Search & Sorting Engine
 * Verification of real-time search by Institution Name and Application ID,
 * Category filter dropdown, multi-mode sorting (Priority descending, SLA pressure ascending,
 * date ordering), filter reset, and dynamic triage board re-partitioning.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

// 1. Mock Browser Environment
const eventsDispatched = [];
const mockState = {
  selectedAppId: null,
  selectedAppAggregate: null,
  setState: () => {},
  setSelectedApp: function(id, agg) {
    this.selectedAppId = id;
    this.selectedAppAggregate = agg;
  }
};

const mockRouter = {
  currentRoute: '',
  navigate: function(route) {
    this.currentRoute = route;
  }
};

const mockElements = new Map();
const createMockElement = (id) => {
  const listeners = {};
  const el = {
    id,
    innerHTML: '',
    value: '',
    textContent: '',
    addEventListener: (evt, fn) => {
      listeners[evt] = listeners[evt] || [];
      listeners[evt].push(fn);
    },
    dispatchEvent: (evt) => {
      if (listeners[evt.type]) {
        listeners[evt.type].forEach(fn => fn(evt));
      }
    },
    querySelector: (sel) => {
      const targetId = sel.replace('#', '');
      return mockElements.get(targetId) || null;
    }
  };
  mockElements.set(id, el);
  return el;
};

// Setup mock DOM elements
const mockKpiBar = createMockElement('queue-kpi-bar');
const mockToolbar = createMockElement('queue-filter-toolbar');
const mockTriageBoard = createMockElement('queue-triage-board');
const mockSearchInput = createMockElement('queue-search-input');
const mockCatSelect = createMockElement('queue-category-select');
const mockSortSelect = createMockElement('queue-sort-select');
const mockResetBtn = createMockElement('queue-filter-reset-btn');
const mockCountBadge = createMockElement('queue-filter-count');

global.document = {
  readyState: 'complete',
  getElementById: (id) => mockElements.get(id) || null
};

global.ApiClient = class MockApiClient {
  async getDemoApplications() { return { items: [] }; }
  async getApplicationAggregate() { return null; }
  async getDemoValidation() { return { workflow: 'DEMO', findings: [], checks: [] }; }
};

global.window = {
  addEventListener: () => {},
  removeEventListener: () => {},
  dispatchEvent: (evt) => {
    eventsDispatched.push(evt);
  },
  location: { hash: '' },
  appState: mockState,
  router: mockRouter,
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
const queueCardCode = fs.readFileSync(path.join(__dirname, '../ui/js/components/queue_card.js'), 'utf8');
eval(queueCardCode);

const queueViewCode = fs.readFileSync(path.join(__dirname, '../ui/js/components/queue_view.js'), 'utf8');
eval(queueViewCode);

console.log('--- Step 18 Verification Starting ---');

assert(window.queueViewComponent, 'QueueViewComponent singleton must be defined');

// 3. Test Fixtures Setup
const appApex = {
  id: 'DEMO-ISSUES-001',
  institution_name: 'Apex Institute of Technology & Management',
  aicte_id: '1-10998877',
  category: 'EOA_RENEWAL',
  submitted_on: '2026-10-10' // 14d elapsed -> 0d SLA remaining (most urgent)
};

const aggApex = {
  application_id: 'DEMO-ISSUES-001',
  review_lane: 'NEEDS_SCRUTINY',
  priority: {
    score: 200,
    breakdown: { high: 2, medium: 0, low: 0, age_days: 0, deadline_pressure: 0 }
  },
  findings: [{ severity: 'high' }, { severity: 'high' }]
};

const appBharat = {
  id: 'DEMO-CLEAN-001',
  institution_name: 'Bharat Institute of Science & Technology',
  aicte_id: '1-55443322',
  category: 'EOA_RENEWAL',
  submitted_on: '2026-10-20' // 4d elapsed -> 10d SLA remaining
};

const aggBharat = {
  application_id: 'DEMO-CLEAN-001',
  review_lane: 'FAST_REVIEW',
  priority: {
    score: 0,
    breakdown: { high: 0, medium: 0, low: 0, age_days: 0, deadline_pressure: 0 }
  },
  findings: []
};

const appNewInst = {
  id: 'DEMO-NEW-002',
  institution_name: 'Chandigarh Polytechnic Institute',
  aicte_id: '1-99887766',
  category: 'NEW_INSTITUTION',
  submitted_on: '2026-10-15' // 9d elapsed -> 5d SLA remaining
};

const aggNewInst = {
  application_id: 'DEMO-NEW-002',
  review_lane: 'NEEDS_VERIFICATION',
  priority: {
    score: 65,
    breakdown: { high: 0, medium: 2, low: 1, age_days: 0, deadline_pressure: 0 }
  },
  findings: [{ severity: 'medium' }, { severity: 'medium' }]
};

window.queueViewComponent.applications = [appApex, appBharat, appNewInst];
window.queueViewComponent.aggregates.set(appApex.id, aggApex);
window.queueViewComponent.aggregates.set(appBharat.id, aggBharat);
window.queueViewComponent.aggregates.set(appNewInst.id, aggNewInst);

// 4. Test 1: Real-time Search by Institution Name ("Apex")
console.log('Testing Search filter for "Apex"...');
eventsDispatched.length = 0;
const resultsApex = window.queueViewComponent.setSearchQuery('Apex');

assert.strictEqual(resultsApex.length, 1, 'Search for "Apex" should return exactly 1 matching application');
assert.strictEqual(resultsApex[0].id, 'DEMO-ISSUES-001', 'Matching application must be DEMO-ISSUES-001');
assert.strictEqual(resultsApex[0].institution_name, 'Apex Institute of Technology & Management');

// Check Triage Board Lane Partitioning with "Apex" filter
const partitionsApex = window.queueViewComponent.partitionApplicationsByLane();
assert.strictEqual(partitionsApex.NEEDS_SCRUTINY.length, 1, 'NEEDS_SCRUTINY must contain 1 app (Apex)');
assert.strictEqual(partitionsApex.FAST_REVIEW.length, 0, 'FAST_REVIEW must be empty (Bharat filtered out)');
assert.strictEqual(partitionsApex.NEEDS_VERIFICATION.length, 0, 'NEEDS_VERIFICATION must be empty');

// Check dispatched event
const filterEvent = eventsDispatched.find(e => e.type === 'app:queue-filtered');
assert(filterEvent, 'app:queue-filtered CustomEvent must be emitted on search');
assert.strictEqual(filterEvent.detail.filteredCount, 1, 'Event detail filteredCount should be 1');
assert.strictEqual(filterEvent.detail.totalCount, 3, 'Event detail totalCount should be 3');

// Test Case-insensitivity ("apex", "APEX")
const resultsLower = window.queueViewComponent.setSearchQuery('apex');
assert.strictEqual(resultsLower.length, 1, 'Search should be case-insensitive');

// Test Search for "Bharat"
const resultsBharat = window.queueViewComponent.setSearchQuery('Bharat');
assert.strictEqual(resultsBharat.length, 1, 'Search for "Bharat" should return 1 application');
assert.strictEqual(resultsBharat[0].id, 'DEMO-CLEAN-001');

// Test Search by Application ID ("DEMO-NEW")
const resultsAppId = window.queueViewComponent.setSearchQuery('DEMO-NEW');
assert.strictEqual(resultsAppId.length, 1, 'Search by App ID should return matching application');
assert.strictEqual(resultsAppId[0].id, 'DEMO-NEW-002');

// 5. Test 2: Category Dropdown Filter
window.queueViewComponent.setSearchQuery(''); // clear search

// Filter by NEW_INSTITUTION
console.log('Testing Category filter for "NEW_INSTITUTION"...');
const resultsNewInst = window.queueViewComponent.setCategoryFilter('NEW_INSTITUTION');
assert.strictEqual(resultsNewInst.length, 1, 'NEW_INSTITUTION filter should return 1 application');
assert.strictEqual(resultsNewInst[0].id, 'DEMO-NEW-002');

// Filter by EOA_RENEWAL
const resultsEoa = window.queueViewComponent.setCategoryFilter('EOA_RENEWAL');
assert.strictEqual(resultsEoa.length, 2, 'EOA_RENEWAL filter should return 2 applications');

// Reset category
window.queueViewComponent.setCategoryFilter('ALL');
assert.strictEqual(window.queueViewComponent.getFilteredAndSortedApplications().length, 3);

// 6. Test 3: Multi-Mode Sorting Engine
console.log('Testing Sorting Engine...');

// A. Sort by Priority Score Descending (`priority_desc`)
// Expected order: Apex (200) -> Chandigarh (65) -> Bharat (0)
window.queueViewComponent.setSortBy('priority_desc');
const sortedPriority = window.queueViewComponent.getFilteredAndSortedApplications();
assert.strictEqual(sortedPriority[0].id, 'DEMO-ISSUES-001', 'Priority sort: Top app must be score 200');
assert.strictEqual(sortedPriority[1].id, 'DEMO-NEW-002', 'Priority sort: Middle app must be score 65');
assert.strictEqual(sortedPriority[2].id, 'DEMO-CLEAN-001', 'Priority sort: Bottom app must be score 0');

// B. Sort by SLA Deadline Pressure Ascending (`sla_asc`: Urgent Cutoff First)
// Cutoffs:
// - Apex: submitted 2026-10-10 -> 0d left (Due Today, Most Urgent)
// - Chandigarh: submitted 2026-10-15 -> 5d left (Urgent warning)
// - Bharat: submitted 2026-10-20 -> 10d left (Normal)
window.queueViewComponent.setSortBy('sla_asc');
const sortedSla = window.queueViewComponent.getFilteredAndSortedApplications();
assert.strictEqual(sortedSla[0].id, 'DEMO-ISSUES-001', 'SLA sort: Apex (0d left) must be first');
assert.strictEqual(sortedSla[1].id, 'DEMO-NEW-002', 'SLA sort: Chandigarh (5d left) must be second');
assert.strictEqual(sortedSla[2].id, 'DEMO-CLEAN-001', 'SLA sort: Bharat (10d left) must be third');

// C. Sort by Submission Date Descending (`date_desc`: Newest First)
// Dates: Bharat (2026-10-20) -> Chandigarh (2026-10-15) -> Apex (2026-10-10)
window.queueViewComponent.setSortBy('date_desc');
const sortedNewest = window.queueViewComponent.getFilteredAndSortedApplications();
assert.strictEqual(sortedNewest[0].id, 'DEMO-CLEAN-001', 'Newest date sort: Bharat (Oct 20) must be first');
assert.strictEqual(sortedNewest[1].id, 'DEMO-NEW-002', 'Newest date sort: Chandigarh (Oct 15) must be second');
assert.strictEqual(sortedNewest[2].id, 'DEMO-ISSUES-001', 'Newest date sort: Apex (Oct 10) must be third');

// D. Sort by Submission Date Ascending (`date_asc`: Oldest First)
window.queueViewComponent.setSortBy('date_asc');
const sortedOldest = window.queueViewComponent.getFilteredAndSortedApplications();
assert.strictEqual(sortedOldest[0].id, 'DEMO-ISSUES-001', 'Oldest date sort: Apex (Oct 10) must be first');
assert.strictEqual(sortedOldest[2].id, 'DEMO-CLEAN-001', 'Oldest date sort: Bharat (Oct 20) must be last');

// 7. Test 4: Reset Filters
console.log('Testing Reset Filters...');
window.queueViewComponent.setSearchQuery('NonExistentQuery');
assert.strictEqual(window.queueViewComponent.getFilteredAndSortedApplications().length, 0);

window.queueViewComponent.resetFilters();
assert.strictEqual(window.queueViewComponent.filters.searchQuery, '', 'searchQuery should be reset to empty');
assert.strictEqual(window.queueViewComponent.filters.category, 'ALL', 'category should be reset to ALL');
assert.strictEqual(window.queueViewComponent.filters.sortBy, 'priority_desc', 'sortBy should be reset to priority_desc');
assert.strictEqual(window.queueViewComponent.getFilteredAndSortedApplications().length, 3, 'All 3 apps should be restored on reset');

// 8. Test 5: Toolbar Widget DOM Rendering
console.log('Testing Filter Toolbar DOM Rendering...');
const toolbarHtml = window.queueViewComponent.renderFilterToolbar(mockToolbar);
assert(toolbarHtml.includes('id="queue-search-input"'), 'Toolbar must render search input');
assert(toolbarHtml.includes('id="queue-category-select"'), 'Toolbar must render category select');
assert(toolbarHtml.includes('id="queue-sort-select"'), 'Toolbar must render sort select');
assert(toolbarHtml.includes('id="queue-filter-reset-btn"'), 'Toolbar must render reset button');
assert(toolbarHtml.includes('id="queue-filter-count"'), 'Toolbar must render count badge');
assert(toolbarHtml.includes('Showing 3 of 3'), 'Toolbar count badge must show accurate count');

console.log('✓ All Step 18 verification assertions passed successfully!');
