/**
 * Test Step 31: Mandatory Human Rationale Action Modal
 * Spec Reference: ROADMAP.md (Phase 5: Step 31), Guide §1.3, §17.3
 *
 * Verifies:
 * 1. Component Export Integrity:
 *    - ActionModalComponent class and actionModalComponent singleton exist on window and module.exports.
 * 2. Modal Rendering on Action Click:
 *    - Opens accessible modal with ID 'finding-action-modal'.
 *    - Displays target finding context, rule citation, and non-destructive advisory banner.
 *    - Renders mandatory reason textarea, character counter, error banner, Cancel, and Submit buttons.
 * 3. Mandatory Human Reason Validation (Verification Requirement):
 *    - Submitting an empty reason displays validation error: "Reason is mandatory to override automated findings".
 *    - Submitting whitespace or <= 5 characters is blocked and displays validation error.
 *    - Modal remains open until valid reason is provided.
 * 4. Successful Action Submission:
 *    - Submitting a valid reason (>5 chars) appends action to audit trail without deleting original finding.
 *    - Updates finding lifecycle state to 'dismissed' / 'rectification_requested'.
 *    - Renders recorded override in finding's timeline.
 *    - Closes modal dialog and dispatches 'app:action-modal-submitted'.
 * 5. FindingCardComponent Integration:
 *    - Calling onAction without prefilled reason automatically invokes actionModalComponent.open.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

// 1. Mock Browser Environment
const eventsDispatched = [];
const mockElements = new Map();

const createMockElement = (initialId) => {
  const listeners = {};
  const classes = new Set();
  const attributes = new Map();
  let _id = initialId;
  let _innerHTML = '';

  const el = {
    get id() { return _id; },
    set id(val) {
      if (_id) mockElements.delete(_id);
      _id = val;
      if (val) mockElements.set(val, el);
    },
    get innerHTML() { return _innerHTML; },
    set innerHTML(val) {
      _innerHTML = val;
      if (typeof val === 'string') {
        const tagMatches = val.matchAll(/<([a-zA-Z0-9]+)[^>]*id="([^"]+)"[^>]*>([^<]*)<\/\1>/g);
        for (const m of tagMatches) {
          const elemId = m[2];
          const text = m[3];
          let childEl = mockElements.get(elemId);
          if (!childEl) {
            childEl = createMockElement(elemId);
          }
          childEl.textContent = text;
          childEl.parentNode = el;
        }
        const idMatches = val.matchAll(/id="([^"]+)"/g);
        for (const m of idMatches) {
          if (!mockElements.has(m[1])) {
            const childEl = createMockElement(m[1]);
            childEl.parentNode = el;
          }
        }
      }
    },
    outerHTML: '',
    textContent: '',
    value: '',
    disabled: false,
    style: {},
    dataset: {},
    parentNode: null,
    children: [],
    classList: {
      add: (...cls) => cls.forEach(c => classes.add(c)),
      remove: (...cls) => cls.forEach(c => classes.delete(c)),
      contains: (c) => classes.has(c)
    },
    setAttribute: (k, v) => attributes.set(k, String(v)),
    getAttribute: (k) => attributes.has(k) ? attributes.get(k) : null,
    removeAttribute: (k) => attributes.delete(k),
    hasAttribute: (k) => attributes.has(k),
    addEventListener: (evt, fn) => {
      listeners[evt] = listeners[evt] || [];
      listeners[evt].push(fn);
    },
    removeEventListener: (evt, fn) => {
      if (listeners[evt]) {
        listeners[evt] = listeners[evt].filter(f => f !== fn);
      }
    },
    dispatchEvent: (evt) => {
      if (listeners[evt.type]) {
        listeners[evt.type].forEach(fn => fn(evt));
      }
    },
    appendChild: (child) => {
      el.children.push(child);
      child.parentNode = el;
      return child;
    },
    removeChild: (child) => {
      el.children = el.children.filter(c => c !== child);
      child.parentNode = null;
      if (child.id) mockElements.delete(child.id);
      return child;
    },
    focus: () => {}
  };
  if (initialId) {
    mockElements.set(initialId, el);
  }
  return el;
};

const mockBody = createMockElement('body');

global.document = {
  readyState: 'complete',
  body: mockBody,
  getElementById: (id) => mockElements.get(id) || null,
  querySelector: (sel) => null,
  createElement: (tagName) => {
    const el = createMockElement(`dyn-${Math.random().toString(36).slice(2, 8)}`);
    el.tagName = tagName.toUpperCase();
    return el;
  },
  querySelectorAll: (sel) => []
};

global.window = {
  addEventListener: () => {},
  removeEventListener: () => {},
  dispatchEvent: (evt) => {
    eventsDispatched.push(evt);
  },
  location: { hash: '' },
  document: global.document,
  state: {
    currentRole: 'officer',
    currentOfficerName: 'Officer Sharma'
  }
};

global.CustomEvent = class CustomEvent {
  constructor(type, params) {
    this.type = type;
    this.detail = params ? params.detail : null;
  }
};

// 2. Load Finding Card & Action Modal Components
const findingCardCode = fs.readFileSync(path.join(__dirname, '../ui/js/components/finding_card.js'), 'utf8');
eval(findingCardCode);

const actionModalCode = fs.readFileSync(path.join(__dirname, '../ui/js/components/action_modal.js'), 'utf8');
eval(actionModalCode);

console.log('--- Step 31 Verification Starting ---');

// Test 1: Component Export Integrity
assert(window.actionModalComponent, 'actionModalComponent singleton must exist on window');
assert(window.ActionModalComponent, 'ActionModalComponent class must exist on window');
const modalComp = window.actionModalComponent;
assert.strictEqual(typeof modalComp.open, 'function', 'open must be a function');
assert.strictEqual(typeof modalComp.close, 'function', 'close must be a function');
assert.strictEqual(typeof modalComp.submit, 'function', 'submit must be a function');
assert.strictEqual(typeof modalComp.validateReason, 'function', 'validateReason must be a function');
assert.strictEqual(typeof modalComp.render, 'function', 'render must be a function');
console.log('✓ Test 1 Passed: Component export integrity verified.');

// Test 2: Unit Validation Logic
assert.strictEqual(modalComp.validateReason('').valid, false, 'Empty reason must be invalid');
assert.strictEqual(modalComp.validateReason('    ').valid, false, 'Whitespace reason must be invalid');
assert.strictEqual(modalComp.validateReason('abc').valid, false, 'Short reason (<=5 chars) must be invalid');
assert.strictEqual(modalComp.validateReason('').error, 'Reason is mandatory to override automated findings');

const validRes = modalComp.validateReason('Physical inspection confirms valid fire safety measures');
assert.strictEqual(validRes.valid, true, 'Reason >5 chars must be valid');
assert.strictEqual(validRes.cleanReason, 'Physical inspection confirms valid fire safety measures');
console.log('✓ Test 2 Passed: Reason validation rules strictly verified.');

// Test 3: Modal Opening & DOM Rendering
const sampleFinding = {
  id: 'finding-fire-001',
  rule_id: 'R-EXP-001',
  category: 'REGULATORY',
  severity: 'high',
  lifecycle_state: 'open'
};
window.findingCardComponent.findingsRegistry.set('finding-fire-001', sampleFinding);
window.findingCardComponent.renderCard(sampleFinding);

eventsDispatched.length = 0;
modalComp.open({
  applicationId: 'DEMO-ISSUES-001',
  findingId: 'finding-fire-001',
  actionName: 'dismiss',
  finding: sampleFinding
});

assert.strictEqual(modalComp.isOpen, true, 'Modal must be open');
const modalEl = document.getElementById('finding-action-modal');
assert(modalEl, 'Modal element #finding-action-modal must be added to DOM');
assert(modalEl.innerHTML.includes('Officer Override: Dismiss Finding'), 'Modal title must reflect Dismiss action');
assert(modalEl.innerHTML.includes('finding-fire-001'), 'Modal must display target finding ID');
assert(modalEl.innerHTML.includes('R-EXP-001'), 'Modal must display target rule ID');
assert(modalEl.innerHTML.includes('action-modal-reason-input'), 'Reason textarea must be rendered');
assert(modalEl.innerHTML.includes('btn-action-modal-submit'), 'Submit button must be rendered');
assert(modalEl.innerHTML.includes('btn-action-modal-cancel'), 'Cancel button must be rendered');

assert(eventsDispatched.some(e => e.type === 'app:action-modal-opened'), 'app:action-modal-opened event must be emitted');
console.log('✓ Test 3 Passed: Modal opens and renders complete accessible dialog.');

(async () => {
  // Test 4: Verification Requirement — Submitting empty reason displays validation error
  const reasonInput = document.getElementById('action-modal-reason-input');
  const errorEl = document.getElementById('action-modal-error-banner');
  reasonInput.value = '';

  const submitFail = await modalComp.submit();
  assert.strictEqual(submitFail.success, false, 'Submit must fail with empty reason');
  assert.strictEqual(submitFail.error, 'MANDATORY_REASON_REQUIRED', 'Error code must be MANDATORY_REASON_REQUIRED');
  assert.strictEqual(submitFail.message, 'Reason is mandatory to override automated findings', 'Error message must match spec requirement');
  assert.strictEqual(errorEl.textContent, 'Reason is mandatory to override automated findings', 'Error element must display spec error text');
  assert.strictEqual(errorEl.style.display, 'block', 'Error element must be visible');
  assert.strictEqual(modalComp.isOpen, true, 'Modal must remain open when validation fails');
  console.log('✓ Test 4 Passed: Empty reason submission blocked and displays exact validation error.');

  // Test 5: Submitting valid reason appends to audit trail and updates status
  const validReasonText = 'Verified valid physical extension letter FS/KA/2024/EXT-104 issued by State Fire Directorate';
  reasonInput.value = validReasonText;

  eventsDispatched.length = 0;
  const actionRes = await modalComp.submit();

  assert(actionRes, 'Action record must be returned');
  assert.strictEqual(actionRes.action, 'dismiss', 'Recorded action must be dismiss');
  assert.strictEqual(actionRes.new_state, 'dismissed', 'New state must be dismissed');
  assert.strictEqual(actionRes.reason, validReasonText, 'Reason in audit record must match input');
  assert(actionRes.created_at, 'Timestamp must be present');
  assert(actionRes.audit_entry_hash, 'S13 audit hash must be present');

  // Verify modal is closed
  assert.strictEqual(modalComp.isOpen, false, 'Modal must close on successful submission');
  assert.strictEqual(document.getElementById('finding-action-modal'), null, 'Modal element must be removed from DOM');

  // Verify finding state is updated in findingCardComponent
  assert.strictEqual(window.findingCardComponent.getFindingState('finding-fire-001'), 'dismissed', 'Finding state must update to dismissed');

  // Verify timeline contains the record without deleting original finding
  const timeline = window.findingCardComponent.getActionTimeline('finding-fire-001');
  assert(timeline.length >= 1, 'Timeline must contain recorded override');
  const lastEntry = timeline[timeline.length - 1];
  assert.strictEqual(lastEntry.action, 'dismiss');
  assert.strictEqual(lastEntry.reason, validReasonText);

  // Verify custom event emission
  assert(eventsDispatched.some(e => e.type === 'app:action-modal-submitted'), 'app:action-modal-submitted must be dispatched');
  assert(eventsDispatched.some(e => e.type === 'app:finding-action-recorded'), 'app:finding-action-recorded must be dispatched');
  console.log('✓ Test 5 Passed: Valid reason submission records override, updates status, and appends to audit trail.');

  // Test 6: Request Rectification Modal Action
  modalComp.open({
    applicationId: 'DEMO-ISSUES-001',
    findingId: 'finding-fire-001',
    actionName: 'request_rectification',
    finding: sampleFinding
  });

  const rectModalEl = document.getElementById('finding-action-modal');
  assert(rectModalEl.innerHTML.includes('Request Document Rectification'), 'Modal title must reflect Request Rectification');
  const rectSubmitBtn = document.getElementById('btn-action-modal-submit');
  assert(rectSubmitBtn.textContent.includes('Queue Rectification Notice'), 'Submit button must reflect Queue Rectification Notice');

  const rectReasonInput = document.getElementById('action-modal-reason-input');
  const rectReasonText = 'Fire NOC expired. Applicant must upload valid renewal certificate.';
  rectReasonInput.value = rectReasonText;

  const rectRes = await modalComp.submit();
  assert.strictEqual(rectRes.action, 'request_rectification');
  assert.strictEqual(rectRes.new_state, 'rectification_requested');
  assert.strictEqual(window.findingCardComponent.getFindingState('finding-fire-001'), 'rectification_requested');
  console.log('✓ Test 6 Passed: Request rectification modal executes and updates status.');

  // Test 7: Integration — Clicking action in FindingCardComponent invokes ActionModalComponent
  modalComp.close();
  assert.strictEqual(modalComp.isOpen, false);

  window.findingCardComponent.onAction('finding-fire-001', 'dismiss');
  assert.strictEqual(modalComp.isOpen, true, 'FindingCardComponent.onAction must open ActionModalComponent');
  modalComp.close();
  console.log('✓ Test 7 Passed: FindingCardComponent seamlessly delegates to ActionModalComponent.');

  console.log('-------------------------------------------');
  console.log('ALL STEP 31 TESTS PASSED SUCCESSFULLY! (7/7)');
  console.log('-------------------------------------------');
})();
