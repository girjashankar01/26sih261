/**
 * Test Step 17: Statutory SLA Deadline Countdown Timer
 * Verification of 14-day cutoff calculation, progressive warning states
 * (>7 days gray/normal, 3-7 days yellow/warning, <3 days pulsating red/critical),
 * visual urgency tags for <= 7 days, and DOM badge integration.
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

console.log('--- Step 17 Verification Starting ---');

assert(window.queueCardComponent, 'QueueCardComponent singleton must exist');

// Benchmark date in component is 2026-10-24T00:00:00Z
// 3. Test State 1: Normal (> 7 days remaining, gray badge, no urgency tag)
// Submitted: 2026-10-22 -> Elapsed 2 days -> 14 - 2 = 12 days remaining (> 7d)
const slaNormal = window.queueCardComponent.calculateSlaDeadline('2026-10-22');
console.log('Normal SLA Result (12d left):', slaNormal);

assert.strictEqual(slaNormal.daysRemaining, 12, 'Days remaining should be 12');
assert.strictEqual(slaNormal.state, 'NORMAL', 'State should be NORMAL for > 7 days');
assert.strictEqual(slaNormal.cssClass, 'badge-sla-normal', 'CSS class should be badge-sla-normal');
assert.strictEqual(slaNormal.isUrgent, false, 'isUrgent should be false for > 7 days');
assert.strictEqual(slaNormal.label, 'SLA: 12d left', 'Label should format correctly');

const htmlNormal = window.queueCardComponent.renderSlaBadge('APP-NORMAL', slaNormal);
assert(htmlNormal.includes('badge-sla-normal'), 'HTML should use badge-sla-normal');
assert(htmlNormal.includes('data-sla-urgent="false"'), 'HTML should have data-sla-urgent="false"');
assert(!htmlNormal.includes('class="sla-urgency-tag"'), 'HTML should NOT have urgency tag when > 7 days');

// Boundary test for normal state: 8 days remaining (submitted 2026-10-18)
const sla8d = window.queueCardComponent.calculateSlaDeadline('2026-10-18');
assert.strictEqual(sla8d.daysRemaining, 8, 'Days remaining should be 8');
assert.strictEqual(sla8d.state, 'NORMAL', 'State should be NORMAL for 8 days');
assert.strictEqual(sla8d.isUrgent, false, 'isUrgent should be false for 8 days');

// 4. Test State 2: Warning (3-7 days remaining, yellow badge, visual urgency tag)
// Boundary test 1: Exactly 7 days remaining (submitted 2026-10-17)
const sla7d = window.queueCardComponent.calculateSlaDeadline('2026-10-17');
console.log('Warning SLA Result (7d left):', sla7d);

assert.strictEqual(sla7d.daysRemaining, 7, 'Days remaining should be 7');
assert.strictEqual(sla7d.state, 'WARNING', 'State should be WARNING for 7 days');
assert.strictEqual(sla7d.cssClass, 'badge-sla-warning', 'CSS class should be badge-sla-warning');
assert.strictEqual(sla7d.isUrgent, true, 'isUrgent must be true for <= 7 days per specification');
assert.strictEqual(sla7d.label, 'SLA: 7d left', 'Label should indicate 7d left');

const htmlWarning = window.queueCardComponent.renderSlaBadge('APP-WARN-7', sla7d);
assert(htmlWarning.includes('badge-sla-warning'), 'HTML should use badge-sla-warning');
assert(htmlWarning.includes('data-sla-urgent="true"'), 'HTML should have data-sla-urgent="true"');
assert(htmlWarning.includes('class="sla-urgency-tag"'), 'HTML MUST contain visual urgency tag when <= 7 days');

// Midpoint test: 4 days remaining (submitted 2026-10-14)
const sla4d = window.queueCardComponent.calculateSlaDeadline('2026-10-14');
assert.strictEqual(sla4d.daysRemaining, 4, 'Days remaining should be 4');
assert.strictEqual(sla4d.state, 'WARNING', 'State should be WARNING for 4 days');
assert.strictEqual(sla4d.isUrgent, true, 'isUrgent should be true for 4 days');

// Boundary test 2: Exactly 3 days remaining (submitted 2026-10-13)
const sla3d = window.queueCardComponent.calculateSlaDeadline('2026-10-13');
assert.strictEqual(sla3d.daysRemaining, 3, 'Days remaining should be 3');
assert.strictEqual(sla3d.state, 'WARNING', 'State should be WARNING for 3 days');
assert.strictEqual(sla3d.isUrgent, true, 'isUrgent should be true for 3 days');

// 5. Test State 3: Critical (< 3 days remaining, pulsating red, visual urgency tag)
// 2 days remaining (submitted 2026-10-12)
const sla2d = window.queueCardComponent.calculateSlaDeadline('2026-10-12');
console.log('Critical SLA Result (2d left):', sla2d);

assert.strictEqual(sla2d.daysRemaining, 2, 'Days remaining should be 2');
assert.strictEqual(sla2d.state, 'CRITICAL', 'State should be CRITICAL for < 3 days');
assert.strictEqual(sla2d.cssClass, 'badge-sla-critical', 'CSS class should be badge-sla-critical');
assert.strictEqual(sla2d.isUrgent, true, 'isUrgent should be true for < 3 days');
assert.strictEqual(sla2d.label, 'SLA: 2d left', 'Label should indicate 2d left');

const htmlCritical = window.queueCardComponent.renderSlaBadge('APP-CRIT-2', sla2d);
assert(htmlCritical.includes('badge-sla-critical'), 'HTML should use badge-sla-critical');
assert(htmlCritical.includes('data-sla-urgent="true"'), 'HTML should flag urgency for critical');
assert(htmlCritical.includes('class="sla-urgency-tag"'), 'HTML MUST contain visual urgency tag');

// 0 days remaining (Due Today, submitted 2026-10-10)
const sla0d = window.queueCardComponent.calculateSlaDeadline('2026-10-10');
assert.strictEqual(sla0d.daysRemaining, 0, 'Days remaining should be 0');
assert.strictEqual(sla0d.state, 'CRITICAL', 'State should be CRITICAL for 0 days');
assert.strictEqual(sla0d.label, 'SLA: Due Today', 'Label should indicate Due Today');

// Overdue test: -2 days remaining (submitted 2026-10-08)
const slaOverdue = window.queueCardComponent.calculateSlaDeadline('2026-10-08');
assert.strictEqual(slaOverdue.daysRemaining, -2, 'Days remaining should be -2');
assert.strictEqual(slaOverdue.state, 'CRITICAL', 'State should be CRITICAL for overdue');
assert.strictEqual(slaOverdue.label, 'SLA: 2d Overdue', 'Label should indicate overdue');

// 6. Test Card Rendering Integration
const cardApp = {
  id: 'DEMO-ISSUES-001',
  institution_name: 'Apex Institute of Technology & Management',
  aicte_id: '1-10998877',
  category: 'EOA_RENEWAL',
  submitted_on: '2026-10-17' // 7 days remaining -> WARNING state
};

const cardAgg = {
  application_id: 'DEMO-ISSUES-001',
  priority: { score: 200 },
  findings: [{ severity: 'high' }]
};

const fullCardHtml = window.queueCardComponent.render(cardApp, cardAgg);
assert(fullCardHtml.includes('id="sla-badge-DEMO-ISSUES-001"'), 'Card HTML must include SLA badge with app id');
assert(fullCardHtml.includes('badge-sla-warning'), 'Card HTML must reflect WARNING SLA state');
assert(fullCardHtml.includes('data-sla-days="7"'), 'Card HTML must carry data-sla-days="7"');
assert(fullCardHtml.includes('class="sla-urgency-tag"'), 'Card HTML must include visual urgency tag');
assert(fullCardHtml.includes('Priority: 200'), 'Card HTML must still retain Step 16 priority score');

console.log('✓ All Step 17 verification assertions passed successfully!');
