/**
 * Test Step 16: Dynamic Priority Score Gauge & Breakdown Tooltip
 * Verification of priority calculation, color gauge thresholds (crimson >= 100,
 * amber 30-99, blue < 30), mathematical formula tooltip string formatting,
 * and DOM/CSS gauge bindings.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

// 1. Mock Browser Environment
const eventsDispatched = [];
const mockState = {
  selectedAppId: null,
  selectedAppAggregate: null,
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

global.window = {
  addEventListener: () => {},
  removeEventListener: () => {},
  dispatchEvent: (evt) => {
    eventsDispatched.push(evt);
  },
  location: { hash: '' },
  appState: mockState,
  router: mockRouter
};

global.CustomEvent = class CustomEvent {
  constructor(type, params) {
    this.type = type;
    this.detail = params ? params.detail : null;
  }
};

// 2. Load Component Script
const queueCardCode = fs.readFileSync(path.join(__dirname, '../ui/js/components/queue_card.js'), 'utf8');
eval(queueCardCode);

console.log('--- Step 16 Verification Starting ---');

assert(window.queueCardComponent, 'QueueCardComponent singleton must be defined');

// 3. Test 1: Acceptance Criteria Spec Case — DEMO-ISSUES-001 with Score 200
// Hovering on DEMO-ISSUES-001 (score 200) reveals tooltip showing:
// "(100 × 2 High) + (30 × 0 Med) + (5 × 0 Low) + 0 Age + 0 Deadline"
const appSpec = {
  id: 'DEMO-ISSUES-001',
  institution_name: 'Apex Institute of Technology & Management',
  aicte_id: '1-10998877',
  category: 'EOA_RENEWAL',
  submitted_on: '2026-10-24' // 0 days age against 2026-10-24
};

const aggSpec = {
  application_id: 'DEMO-ISSUES-001',
  priority: {
    score: 200,
    formula: '100·high + 30·medium + 5·low + age_days + deadline_pressure',
    breakdown: {
      high: 2,
      medium: 0,
      low: 0,
      age_days: 0,
      deadline_pressure: 0
    }
  },
  findings: [
    { rule_id: 'RULE-1', severity: 'high' },
    { rule_id: 'RULE-2', severity: 'high' }
  ]
};

const prioritySpec = window.queueCardComponent.getPriorityData(appSpec, aggSpec);
console.log('Spec Case Priority Result:', prioritySpec);

assert.strictEqual(prioritySpec.score, 200, 'Priority score should be 200');
assert.strictEqual(prioritySpec.gaugeClass, 'badge-priority-crimson', 'Score 200 should use badge-priority-crimson (>= 100)');
assert.strictEqual(
  prioritySpec.tooltipText,
  '(100 × 2 High) + (30 × 0 Med) + (5 × 0 Low) + 0 Age + 0 Deadline',
  'Tooltip breakdown must exactly match ROADMAP Step 16 specification'
);

const htmlSpec = window.queueCardComponent.render(appSpec, aggSpec);
assert(htmlSpec.includes('badge-priority-crimson'), 'HTML should contain badge-priority-crimson class');
assert(htmlSpec.includes('Priority: 200'), 'HTML should render Priority: 200');
assert(htmlSpec.includes('title="(100 × 2 High) + (30 × 0 Med) + (5 × 0 Low) + 0 Age + 0 Deadline"'), 'HTML should set title attribute for hover');
assert(htmlSpec.includes('(100 × 2 High) + (30 × 0 Med) + (5 × 0 Low) + 0 Age + 0 Deadline'), 'HTML should contain tooltip formula text');
assert(htmlSpec.includes('id="priority-tooltip-DEMO-ISSUES-001"'), 'HTML should include tooltip element ID');

// 4. Test 2: Color Gauge Thresholds
// Threshold A: Crimson (Score >= 100)
const dataHigh = window.queueCardComponent.getPriorityData(
  { id: 'APP-100', submitted_on: '2026-10-24' },
  { priority: { score: 100, breakdown: { high: 1, medium: 0, low: 0, age_days: 0, deadline_pressure: 0 } } }
);
assert.strictEqual(dataHigh.gaugeClass, 'badge-priority-crimson', 'Score 100 should be crimson');

const dataHigh500 = window.queueCardComponent.getPriorityData(
  { id: 'APP-500', submitted_on: '2026-10-24' },
  { priority: { score: 550, breakdown: { high: 5, medium: 1, low: 2, age_days: 10, deadline_pressure: 0 } } }
);
assert.strictEqual(dataHigh500.gaugeClass, 'badge-priority-crimson', 'Score 550 should be crimson');

// Threshold B: Amber (30 <= Score < 100)
const dataMid30 = window.queueCardComponent.getPriorityData(
  { id: 'APP-30', submitted_on: '2026-10-24' },
  { priority: { score: 30, breakdown: { high: 0, medium: 1, low: 0, age_days: 0, deadline_pressure: 0 } } }
);
assert.strictEqual(dataMid30.gaugeClass, 'badge-priority-amber', 'Score 30 should be amber');

const dataMid99 = window.queueCardComponent.getPriorityData(
  { id: 'APP-99', submitted_on: '2026-10-24' },
  { priority: { score: 99, breakdown: { high: 0, medium: 3, low: 1, age_days: 4, deadline_pressure: 0 } } }
);
assert.strictEqual(dataMid99.gaugeClass, 'badge-priority-amber', 'Score 99 should be amber');

// Threshold C: Blue (Score < 30)
const dataLow29 = window.queueCardComponent.getPriorityData(
  { id: 'APP-29', submitted_on: '2026-10-24' },
  { priority: { score: 29, breakdown: { high: 0, medium: 0, low: 4, age_days: 9, deadline_pressure: 0 } } }
);
assert.strictEqual(dataLow29.gaugeClass, 'badge-priority-blue', 'Score 29 should be blue');

const dataLow0 = window.queueCardComponent.getPriorityData(
  { id: 'APP-0', submitted_on: '2026-10-24' },
  { priority: { score: 0, breakdown: { high: 0, medium: 0, low: 0, age_days: 0, deadline_pressure: 0 } } }
);
assert.strictEqual(dataLow0.gaugeClass, 'badge-priority-blue', 'Score 0 should be blue');

// 5. Test 3: Fallback Derivation (when agg.priority is missing)
const appFallback = {
  id: 'APP-FALLBACK',
  submitted_on: '2026-10-20' // 4 days age against 2026-10-24
};
const aggFallback = {
  findings: [
    { severity: 'high' },
    { severity: 'medium' },
    { severity: 'low' }
  ]
};
// Expected: (100 * 1) + (30 * 1) + (5 * 1) + 4 age + 0 deadline = 139
const dataFallback = window.queueCardComponent.getPriorityData(appFallback, aggFallback);
assert.strictEqual(dataFallback.score, 139, 'Fallback score should be (100*1)+(30*1)+(5*1)+4 = 139');
assert.strictEqual(dataFallback.gaugeClass, 'badge-priority-crimson', 'Score 139 should be crimson');
assert.strictEqual(
  dataFallback.tooltipText,
  '(100 × 1 High) + (30 × 1 Med) + (5 × 1 Low) + 4 Age + 0 Deadline',
  'Fallback tooltip text should format correctly with calculated age and findings'
);

// 6. Test 4: DOM Tooltip and Gauge Indicator Elements
const badgeHtml = window.queueCardComponent.renderPriorityBadge('APP-TEST', dataMid30);
assert(badgeHtml.includes('class="priority-score-container"'), 'Should wrap in priority-score-container');
assert(badgeHtml.includes('class="priority-gauge-indicator"'), 'Should include priority-gauge-indicator dot');
assert(badgeHtml.includes('class="priority-tooltip"'), 'Should include priority-tooltip element');
assert(badgeHtml.includes('data-score="30"'), 'Should carry data-score');
assert(badgeHtml.includes('data-gauge="badge-priority-amber"'), 'Should carry data-gauge');

console.log('✓ All Step 16 verification assertions passed successfully!');
