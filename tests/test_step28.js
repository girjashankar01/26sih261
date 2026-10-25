/**
 * Test Step 28: Two-Sided Comparison Finding Card Component
 * Spec Reference: ROADMAP.md (Phase 5: Step 28), Guide §17.2
 *
 * Verifies:
 * 1. Component Export Integrity (findingCardComponent singleton and FindingCardComponent class).
 * 2. Two-Sided Comparison Grid Layout:
 *    - Left Side: Observed Document Value, Page reference, and Precision badge (word / block).
 *    - Middle Divider: VS badge.
 *    - Right Side: Expected Regulatory Value and AICTE APH clause reference.
 * 3. Specific Verification Requirement:
 *    - Finding R-EXP-001 clearly displays observed date 2024-03-31 on the left,
 *      compared against expected submission cutoff 2026-10-12 on the right.
 * 4. Advisory Decision-Support Banner:
 *    - "Preliminary indicator requiring human verification", non-punitive decision support.
 * 5. Severity Badging:
 *    - High severity badge with badge-fail class and crimson border.
 * 6. Action Control Bar:
 *    - Acknowledge, Request Rectification, Dismiss, Escalate buttons.
 *    - Event emission: app:finding-action-clicked.
 * 7. EvidenceViewerComponent integration with findingCardComponent.
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

// 2. Load Component Scripts
const findingCardCode = fs.readFileSync(path.join(__dirname, '../ui/js/components/finding_card.js'), 'utf8');
eval(findingCardCode);

const evidenceViewerCode = fs.readFileSync(path.join(__dirname, '../ui/js/components/evidence_viewer.js'), 'utf8');
eval(evidenceViewerCode);

console.log('--- Step 28 Verification Starting ---');

// Test 1: Component Export Integrity
assert(window.findingCardComponent, 'findingCardComponent singleton must exist on window');
assert(window.FindingCardComponent, 'FindingCardComponent class must be exported');
assert(window.RULE_REGULATORY_METADATA, 'RULE_REGULATORY_METADATA must be exported');
const cardComp = window.findingCardComponent;

// Test 2: Specification Requirement Verification for R-EXP-001
// "Verification: Finding R-EXP-001 clearly displays observed date 2024-03-31 on the left,
//  compared against expected submission cutoff 2026-10-12 on the right."
console.log('Testing Specification Verification Requirement for R-EXP-001...');

const expiredNocFinding = {
  id: 'f-exp-01',
  rule_id: 'R-EXP-001',
  category: 'EXPIRY_CHECK',
  severity: 'high',
  status: 'FAILED_CHECK',
  observed: '2024-03-31',
  expected: '> 2026-10-12',
  reason: 'Document Fire NOC validity date (2024-03-31) has expired and precedes submission cutoff date (2026-10-12).',
  evidence: {
    document_type: 'FIRE_NOC',
    submitted: {
      value: '2024-03-31',
      field: 'valid_till',
      page: 1,
      bbox_precision: 'word'
    },
    compared_with: {
      value: '2026-10-12',
      field: 'submission_cutoff'
    }
  }
};

const cardHtml = cardComp.renderCard(expiredNocFinding);

// A. Two-Sided Grid Structure
assert(cardHtml.includes('class="two-sided-comparison"'), 'Must render .two-sided-comparison container');
assert(cardHtml.includes('comparison-observed'), 'Must render left observed comparison column');
assert(cardHtml.includes('comparison-expected'), 'Must render right expected comparison column');
assert(cardHtml.includes('comparison-vs-badge'), 'Must render VS divider badge');

// B. Exact Date Values Check
assert(cardHtml.includes('2024-03-31'), 'Left side MUST display observed date 2024-03-31');
assert(cardHtml.includes('2026-10-12'), 'Right side MUST display expected submission cutoff 2026-10-12');
assert(cardHtml.includes('id="finding-observed-R-EXP-001"'), 'Must have ID finding-observed-R-EXP-001');
assert(cardHtml.includes('id="finding-expected-R-EXP-001"'), 'Must have ID finding-expected-R-EXP-001');

// C. Document, Page & Precision Badging
assert(cardHtml.includes('Doc: <strong>FIRE_NOC</strong>'), 'Must indicate source document FIRE_NOC');
assert(cardHtml.includes('Page 1'), 'Must indicate document Page 1 reference');
assert(cardHtml.includes('WORD PRECISION'), 'Must display WORD PRECISION badge');

// D. Regulatory Clause Mapping
assert(cardHtml.includes('APH Ch. II, Cl. 2.12'), 'Must cite APH Ch. II, Cl. 2.12 on expected side');

// Test 3: Advisory Decision-Support Banner
console.log('Testing Non-Negotiable Advisory Banner...');
assert(cardHtml.includes('finding-advisory-banner'), 'Must render .finding-advisory-banner');
assert(cardHtml.includes('Preliminary indicator requiring human verification'), 'Must state preliminary indicator requiring human verification');
assert(cardHtml.includes('Non-punitive decision support'), 'Must include non-punitive decision support guarantee');

// Test 4: Severity Badging & Header
console.log('Testing Severity Badges & Header Content...');
assert(cardHtml.includes('data-severity="high"'), 'Must specify data-severity="high"');
assert(cardHtml.includes('HIGH SEVERITY'), 'Must display HIGH SEVERITY badge');
assert(cardHtml.includes('badge-fail'), 'Must use badge-fail class');
assert(cardHtml.includes('has-critical'), 'Card must receive .has-critical class');
assert(cardHtml.includes('R-EXP-001'), 'Card must display rule ID R-EXP-001');

// Test 5: Action Control Bar (Step 30 Preview)
console.log('Testing Action Control Bar...');
assert(cardHtml.includes('Acknowledge'), 'Must render Acknowledge button');
assert(cardHtml.includes('Request Rectification'), 'Must render Request Rectification button');
assert(cardHtml.includes('Dismiss'), 'Must render Dismiss button');
assert(cardHtml.includes('Escalate'), 'Must render Escalate button');

eventsDispatched.length = 0;
cardComp.onAction('f-exp-01', 'request_rectification');
const actionEvt = eventsDispatched.find(e => e.type === 'app:finding-action-clicked');
assert(actionEvt, 'app:finding-action-clicked event must be dispatched');
assert.strictEqual(actionEvt.detail.findingId, 'f-exp-01');
assert.strictEqual(actionEvt.detail.actionName, 'request_rectification');

// Test 6: Second Rule Verification: Intake Norm (R-NUM-001)
console.log('Testing Intake Compliance Finding (R-NUM-001)...');
const intakeFinding = {
  id: 'f-num-02',
  rule_id: 'R-NUM-001',
  category: 'INTAKE_COMPLIANCE',
  severity: 'high',
  observed: '540 seats',
  expected: '480 seats',
  reason: 'Requested intake (540) exceeds approved institutional record intake (480).'
};

const intakeHtml = cardComp.renderCard(intakeFinding);
assert(intakeHtml.includes('540 seats'), 'Observed side must show 540 seats');
assert(intakeHtml.includes('480 seats'), 'Expected side must show 480 seats');
assert(intakeHtml.includes('APH Ch. II, Cl. 2.5'), 'Must cite APH Ch. II, Cl. 2.5');

// Test 7: Integration with EvidenceViewerComponent
console.log('Testing Integration with EvidenceViewerComponent...');
const viewer = window.evidenceViewerComponent;
const aggregateWithFindings = {
  application_id: 'DEMO-ISSUES-001',
  findings: [expiredNocFinding, intakeFinding]
};

const viewerHtml = viewer.render('DEMO-ISSUES-001', aggregateWithFindings);
assert(viewerHtml.includes('two-sided-comparison'), 'EvidenceViewer rendered findings MUST use Two-Sided Comparison Card');
assert(viewerHtml.includes('id="finding-observed-R-EXP-001"'), 'EvidenceViewer must render R-EXP-001 observed date');
assert(viewerHtml.includes('id="finding-expected-R-EXP-001"'), 'EvidenceViewer must render R-EXP-001 expected cutoff');

console.log('✓ All Step 28 verification assertions passed successfully!');
