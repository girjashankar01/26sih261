/**
 * Test Step 15: Application Queue Card Component
 * Verification of QueueCardComponent, DOM rendering, findings/alerts badges,
 * age calculation, priority pill, and card click navigation.
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

// 2. Load Component Scripts
const queueCardCode = fs.readFileSync(path.join(__dirname, '../ui/js/components/queue_card.js'), 'utf8');
eval(queueCardCode);

const queueViewCode = fs.readFileSync(path.join(__dirname, '../ui/js/components/queue_view.js'), 'utf8');
eval(queueViewCode);

console.log('--- Step 15 Verification Starting ---');

assert(window.queueCardComponent, 'QueueCardComponent singleton should exist on window');
assert(window.QueueCardComponent, 'QueueCardComponent class should be exported on window');

// 3. Test Fixtures
const appIssues = {
  id: 'DEMO-ISSUES-001',
  institution_name: 'Apex Institute of Technology & Management',
  aicte_id: '1-10998877',
  category: 'EOA_RENEWAL',
  submitted_on: '2026-10-10',
  requested_intake: 420
};

const aggIssues = {
  application_id: 'DEMO-ISSUES-001',
  review_lane: 'NEEDS_SCRUTINY',
  workflow_status: 'NEEDS_RECTIFICATION',
  priority: { score: 200 },
  findings: [
    { rule_id: 'RULE-01', severity: 'high', reason: 'Missing fire NOC' },
    { rule_id: 'RULE-02', severity: 'critical', reason: 'Intake mismatch' }
  ],
  alerts: [
    { type: 'CRITICAL_DISCREPANCY', message: 'Intake exceeds sanctioned limit' }
  ]
};

const appClean = {
  id: 'DEMO-CLEAN-001',
  institution_name: 'Bharat Institute of Science & Technology',
  aicte_id: '1-55443322',
  category: 'EOA_RENEWAL',
  submitted_on: '2026-10-20',
  requested_intake: 300
};

const aggClean = {
  application_id: 'DEMO-CLEAN-001',
  review_lane: 'FAST_REVIEW',
  workflow_status: 'VALIDATED_NO_ISSUES',
  priority: { score: 0 },
  findings: [],
  alerts: []
};

// 4. Test Rendering for DEMO-ISSUES-001
const htmlIssues = window.queueCardComponent.render(appIssues, aggIssues);
console.log('Issues Card Rendered Output Length:', htmlIssues.length);

assert(htmlIssues.includes('id="card-DEMO-ISSUES-001"'), 'Should render card container with app id');
assert(htmlIssues.includes('DEMO-ISSUES-001'), 'Should display application ID');
assert(htmlIssues.includes('Apex Institute of Technology &amp; Management') || htmlIssues.includes('Apex Institute of Technology & Management'), 'Should display institution name');
assert(htmlIssues.includes('1-10998877'), 'Should display AICTE permanent ID');
assert(htmlIssues.includes('EoA Renewal'), 'Should format category to EoA Renewal');
assert(htmlIssues.includes('420 seats'), 'Should display intake seats');
assert(htmlIssues.includes('2 Findings (2 High)'), 'Should display findings count with high severity breakdown');
assert(htmlIssues.includes('1 Alert'), 'Should display active alerts badge');
assert(htmlIssues.includes('Priority: 200'), 'Should display calculated priority score');
assert(htmlIssues.includes('elapsed'), 'Should display elapsed age text');

// Age calculation verification
// Benchmark date in component is 2026-10-24T00:00:00Z
// Submitted on 2026-10-10 -> 14 days
const ageDaysIssues = window.queueCardComponent.calculateAgeDays('2026-10-10');
assert.strictEqual(ageDaysIssues, 14, 'Age for 2026-10-10 should be 14 days');
assert(htmlIssues.includes('14d</strong> elapsed'), 'Should display 14d elapsed in card HTML');

// 5. Test Rendering for DEMO-CLEAN-001
const htmlClean = window.queueCardComponent.render(appClean, aggClean);
console.log('Clean Card Rendered Output Length:', htmlClean.length);

assert(htmlClean.includes('DEMO-CLEAN-001'), 'Should display clean app ID');
assert(htmlClean.includes('0 Findings'), 'Should display 0 Findings badge');
assert(htmlClean.includes('badge-pass'), 'Should use badge-pass styling for 0 findings');
assert(htmlClean.includes('Priority: 0'), 'Should display Priority: 0');
const ageDaysClean = window.queueCardComponent.calculateAgeDays('2026-10-20');
assert.strictEqual(ageDaysClean, 4, 'Age for 2026-10-20 should be 4 days');
assert(htmlClean.includes('4d</strong> elapsed'), 'Should display 4d elapsed in card HTML');

// 6. Test Card Click Selection & Router Navigation
window.queueViewComponent.aggregates.set('DEMO-ISSUES-001', aggIssues);
eventsDispatched.length = 0;

window.queueCardComponent.handleCardClick('DEMO-ISSUES-001');

assert.strictEqual(window.appState.selectedAppId, 'DEMO-ISSUES-001', 'appState.selectedAppId should be set to DEMO-ISSUES-001');
assert.strictEqual(window.appState.selectedAppAggregate, aggIssues, 'appState.selectedAppAggregate should be updated');
assert.strictEqual(window.router.currentRoute, '#application/DEMO-ISSUES-001', 'Router should navigate to #application/DEMO-ISSUES-001');

const selectedEvent = eventsDispatched.find(e => e.type === 'app:application-selected');
assert(selectedEvent, 'app:application-selected CustomEvent should be dispatched');
assert.strictEqual(selectedEvent.detail.applicationId, 'DEMO-ISSUES-001', 'Event detail should carry applicationId');

// 7. Test Delegation from QueueViewComponent.renderQueueCard
const delegatedHtml = window.queueViewComponent.renderQueueCard(appIssues, aggIssues);
assert.strictEqual(delegatedHtml, htmlIssues, 'QueueViewComponent.renderQueueCard should delegate cleanly to QueueCardComponent');

console.log('✓ All Step 15 verification assertions passed successfully!');
