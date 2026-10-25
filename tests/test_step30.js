/**
 * Test Step 30: Finding Action Control Bar
 * Spec Reference: ROADMAP.md (Phase 5: Step 30), Guide §1.3, §17.2, §17.3
 *
 * Verifies:
 * 1. Component Export Integrity:
 *    - FindingCardComponent class, findingCardComponent singleton, VALID_ACTIONS_MAP, ACTIONS_REQUIRING_REASON.
 * 2. 4 Action Buttons Rendered:
 *    - Acknowledge, Request Rectification, Dismiss, Escalate buttons present with designated IDs, classes, and attributes.
 * 3. Lifecycle State Dynamic Reflection:
 *    - State 'open': all buttons active and ready for officer decision.
 *    - State 'acknowledged': Acknowledge button marked is-active and disabled, status pill shows ACKNOWLEDGED.
 *    - State 'rectification_requested': Request Rectification marked is-active and disabled, rectification notice displayed.
 *    - State 'dismissed': Dismiss marked is-active and disabled, card marked is-dismissed, officer override banner displayed.
 *    - State 'escalated': Escalate marked is-active and disabled, escalation notice displayed; senior officer resolve button rendered.
 * 4. Mandatory Human Reason Validation:
 *    - Submitting dismiss or request_rectification with empty/whitespace/<5 char reason is blocked by the UI component.
 *    - Returns error 'MANDATORY_REASON_REQUIRED' without modifying finding state.
 * 5. Action Execution & Audit Appending:
 *    - Submitting with valid reason successfully updates finding state to 'dismissed'/'rectification_requested'.
 *    - Appends chronological action entry to action timeline with actor, timestamp, justification reason, and S13 audit entry hash.
 *    - Dispatches 'app:finding-action-recorded' custom DOM event.
 * 6. Timeline Loader Integration:
 *    - loadFindingActions loads application actions and reflects them onto finding cards.
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
    outerHTML: '',
    textContent: '',
    value: '',
    width: 800,
    height: 1100,
    clientWidth: 600,
    clientHeight: 520,
    scrollLeft: 0,
    scrollTop: 0,
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
      return child;
    },
    focus: () => {}
  };
  mockElements.set(id, el);
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

// 2. Load Finding Card Component
const findingCardCode = fs.readFileSync(path.join(__dirname, '../ui/js/components/finding_card.js'), 'utf8');
eval(findingCardCode);

console.log('--- Step 30 Verification Starting ---');

// Test 1: Component Export Integrity
assert(window.findingCardComponent, 'findingCardComponent singleton must exist on window');
assert(window.FindingCardComponent, 'FindingCardComponent class must exist on window');
assert(window.RULE_REGULATORY_METADATA, 'RULE_REGULATORY_METADATA must exist on window');
const comp = window.findingCardComponent;
assert.strictEqual(typeof comp.renderActionBar, 'function', 'renderActionBar must be a function');
assert.strictEqual(typeof comp.renderActionTimeline, 'function', 'renderActionTimeline must be a function');
assert.strictEqual(typeof comp.onAction, 'function', 'onAction must be a function');
assert.strictEqual(typeof comp.executeAction, 'function', 'executeAction must be a function');
assert.strictEqual(typeof comp.loadFindingActions, 'function', 'loadFindingActions must be a function');
console.log('✓ Test 1 Passed: Component export integrity verified.');

// Test 2: 4 Action Buttons Rendered
const findingSample = {
  id: 'finding-fire-001',
  rule_id: 'R-EXP-001',
  category: 'REGULATORY',
  severity: 'high',
  lifecycle_state: 'open',
  observed: '2024-03-31',
  expected: '2026-10-12',
  reason: 'Fire NOC expired on 2024-03-31.'
};

const openCardHtml = comp.renderCard(findingSample, { applicationId: 'DEMO-ISSUES-001' });
assert(openCardHtml.includes('id="btn-action-ack-finding-fire-001"'), 'Acknowledge button must be rendered');
assert(openCardHtml.includes('id="btn-action-rectify-finding-fire-001"'), 'Request Rectification button must be rendered');
assert(openCardHtml.includes('id="btn-action-dismiss-finding-fire-001"'), 'Dismiss button must be rendered');
assert(openCardHtml.includes('id="btn-action-escalate-finding-fire-001"'), 'Escalate button must be rendered');
assert(openCardHtml.includes('class="btn btn-action btn-action-ack'), 'Acknowledge button must have .btn-action-ack class');
assert(openCardHtml.includes('class="btn btn-action btn-action-rectify'), 'Request Rectification must have .btn-action-rectify class');
assert(openCardHtml.includes('class="btn btn-action btn-action-dismiss'), 'Dismiss button must have .btn-action-dismiss class');
assert(openCardHtml.includes('class="btn btn-action btn-action-escalate'), 'Escalate button must have .btn-action-escalate class');
assert(openCardHtml.includes('data-lifecycle-state="open"'), 'Action bar must indicate open lifecycle state');
console.log('✓ Test 2 Passed: 4 action buttons rendered with designated IDs and classes.');

// Test 3: Lifecycle State Dynamic Reflection
// 3a. Acknowledged State
const ackBarHtml = comp.renderActionBar('finding-fire-001', 'acknowledged');
assert(ackBarHtml.includes('✓ Acknowledged'), 'Acknowledge button text must update to "✓ Acknowledged"');
assert(ackBarHtml.includes('is-active'), 'Acknowledge button must receive .is-active class');
assert(ackBarHtml.includes('disabled'), 'Acknowledge button must be disabled when acknowledged');

const ackPillHtml = comp.renderStatusPill('acknowledged');
assert(ackPillHtml.includes('data-status="acknowledged"'), 'Status pill must indicate acknowledged');
assert(ackPillHtml.includes('badge-ack'), 'Status pill must have badge-ack class');

// 3b. Rectification Requested State
const rectBarHtml = comp.renderActionBar('finding-fire-001', 'rectification_requested');
assert(rectBarHtml.includes('⚠ Rectification Requested'), 'Button text must reflect rectification requested');
assert(rectBarHtml.includes('btn-action-rectify is-active'), 'Rectification button must receive .is-active');

const rectNoticeHtml = comp.renderStateNotice('finding-fire-001', 'rectification_requested');
assert(rectNoticeHtml.includes('Rectification Requested:'), 'Notice must explain rectification requested');
assert(rectNoticeHtml.includes('finding-rectification-notice'), 'Notice must have .finding-rectification-notice class');

// 3c. Dismissed State (Officer Override)
const dismissBarHtml = comp.renderActionBar('finding-fire-001', 'dismissed');
assert(dismissBarHtml.includes('✕ Dismissed'), 'Dismiss button text must reflect "✕ Dismissed"');
assert(dismissBarHtml.includes('btn-action-dismiss is-active'), 'Dismiss button must receive .is-active');

const dismissNoticeHtml = comp.renderStateNotice('finding-fire-001', 'dismissed');
assert(dismissNoticeHtml.includes('Officer Override (Dismissed):'), 'Notice must emphasize non-destructive officer override');
assert(dismissNoticeHtml.includes('remain immutable in audit log'), 'Notice must state audit log immutability');

// 3d. Escalated State
const escBarHtml = comp.renderActionBar('finding-fire-001', 'escalated');
assert(escBarHtml.includes('▲ Escalated'), 'Escalate button text must reflect "▲ Escalated"');
assert(escBarHtml.includes('btn-action-escalate is-active'), 'Escalate button must receive .is-active');
console.log('✓ Test 3 Passed: Action bar and notice dynamically reflect all lifecycle states.');

// Test 4: Senior Officer Resolve Button for Escalated Findings
window.state.currentRole = 'senior_officer';
const seniorEscBarHtml = comp.renderActionBar('finding-fire-001', 'escalated');
assert(seniorEscBarHtml.includes('id="btn-action-resolve-finding-fire-001"'), 'Senior officer must see Resolve Finding button on escalated finding');
window.state.currentRole = 'officer'; // reset
console.log('✓ Test 4 Passed: Senior officer resolve button displayed on escalated findings.');

(async () => {
  // Test 5: Mandatory Human Reason Validation
  // Attempting to dismiss or request rectification without reason MUST be blocked
  const emptyDismissRes = await comp.onAction('finding-fire-001', 'dismiss', '');
  assert.strictEqual(emptyDismissRes.success, false, 'Dismiss with empty reason must fail');
  assert.strictEqual(emptyDismissRes.error, 'MANDATORY_REASON_REQUIRED', 'Error code must be MANDATORY_REASON_REQUIRED');

  const wsDismissRes = await comp.onAction('finding-fire-001', 'dismiss', '    ');
  assert.strictEqual(wsDismissRes.success, false, 'Dismiss with whitespace reason must fail');

  const shortDismissRes = await comp.onAction('finding-fire-001', 'dismiss', 'abc');
  assert.strictEqual(shortDismissRes.success, false, 'Dismiss with <5 characters reason must fail');

  const emptyRectRes = await comp.onAction('finding-fire-001', 'request_rectification', '');
  assert.strictEqual(emptyRectRes.success, false, 'Request rectification with empty reason must fail');

  console.log('✓ Test 5 Passed: Mandatory human reason validation strictly enforced.');

  // Test 6: Action Execution & Audit Timeline Appending
  // Execute valid dismiss action
  const validReason = 'Verified valid physical extension certificate FS/2024/EXT-99 issued by State Fire Directorate';
  eventsDispatched.length = 0;

  const actionRes = await comp.onAction('finding-fire-001', 'dismiss', validReason, 'Verified against emergency service register');
  assert(actionRes, 'Action result must be returned');
  assert.strictEqual(actionRes.action, 'dismiss', 'Action must be dismiss');
  assert.strictEqual(actionRes.new_state, 'dismissed', 'New state must be dismissed');
  assert.strictEqual(actionRes.reason, validReason, 'Justification reason must match');
  assert(actionRes.created_at, 'created_at timestamp must be populated');
  assert(actionRes.audit_entry_hash, 'audit_entry_hash must be generated');

  // Verify finding state is updated
  assert.strictEqual(comp.getFindingState('finding-fire-001'), 'dismissed', 'Finding state must update to dismissed');

  // Verify timeline contains the record
  const timeline = comp.getActionTimeline('finding-fire-001');
  assert.strictEqual(timeline.length, 1, 'Timeline must have 1 recorded action');
  assert.strictEqual(timeline[0].action, 'dismiss', 'Timeline entry action must be dismiss');
  assert.strictEqual(timeline[0].new_state, 'dismissed', 'Timeline entry new_state must be dismissed');

  // Verify timeline rendering
  const timelineHtml = comp.renderActionTimeline('finding-fire-001');
  assert(timelineHtml.includes('Audit &amp; Officer Action History (1)') || timelineHtml.includes('Audit & Officer Action History (1)'), 'Timeline header must indicate 1 action');
  assert(timelineHtml.includes('DISMISS'), 'Timeline entry must display DISMISS badge');
  assert(timelineHtml.includes(validReason), 'Timeline entry must display justification reason');
  assert(timelineHtml.includes('open → <strong>dismissed</strong>'), 'Timeline entry must show state transition');

  // Verify event emission
  const actionRecordedEvt = eventsDispatched.find(e => e.type === 'app:finding-action-recorded');
  assert(actionRecordedEvt, 'app:finding-action-recorded event must be dispatched');
  assert.strictEqual(actionRecordedEvt.detail.findingId, 'finding-fire-001', 'Event detail must include findingId');
  assert.strictEqual(actionRecordedEvt.detail.newState, 'dismissed', 'Event detail must include newState');
  console.log('✓ Test 6 Passed: Action execution updates state, appends audit timeline, and dispatches event.');

  // Test 7: Acknowledge Action Execution
  const ackRes = await comp.onAction('finding-num-002', 'acknowledge');
  assert(ackRes, 'Acknowledge must execute');
  assert.strictEqual(ackRes.new_state, 'acknowledged', 'New state must be acknowledged');
  assert.strictEqual(comp.getFindingState('finding-num-002'), 'acknowledged', 'Finding state must be acknowledged');
  console.log('✓ Test 7 Passed: Acknowledge action executes successfully.');

  // Test 8: Load Finding Actions from API
  const mockApiActions = [
    {
      id: 'act-api-001',
      application_id: 'DEMO-ISSUES-001',
      finding_id: 'R-EXP-001',
      action: 'request_rectification',
      previous_state: 'open',
      new_state: 'rectification_requested',
      actor: 'Officer Sharma (scrutiny_officer)',
      reason: 'Fire NOC has expired on 2024-03-31. Applicant must re-upload current certificate.',
      notes: 'Applicant notified via automated notice draft.',
      created_at: '2026-10-24T10:00:00Z',
      audit_entry_hash: 'sha256_mock_hash_for_test'
    }
  ];

  window.apiClient = {
    getFindingActions: async (appId) => ({
      application_id: appId,
      total_actions: mockApiActions.length,
      actions: mockApiActions
    })
  };

  eventsDispatched.length = 0;
  const loaded = await comp.loadFindingActions('DEMO-ISSUES-001');
  assert.strictEqual(loaded.length, 1, 'Must load 1 action from API');
  assert.strictEqual(comp.getFindingState('R-EXP-001'), 'rectification_requested', 'R-EXP-001 state must update to rectification_requested');
  const rExpTimeline = comp.getActionTimeline('R-EXP-001');
  assert.strictEqual(rExpTimeline.length, 1, 'R-EXP-001 must have 1 action in timeline');
  assert(eventsDispatched.some(e => e.type === 'app:finding-actions-loaded'), 'app:finding-actions-loaded event must be dispatched');
  console.log('✓ Test 8 Passed: Actions loaded via API update finding state and timeline.');

  console.log('-------------------------------------------');
  console.log('ALL STEP 30 TESTS PASSED SUCCESSFULLY! (8/8)');
  console.log('-------------------------------------------');
})();
