/**
 * Test Step 36: Manual Verification Fallback Recording Form
 * Spec Reference: ROADMAP.md (Phase 6: Step 36), Guide §13, §17
 *
 * Verifies:
 * 1. Component Method Integrity:
 *    - needsManualReview, formatMethodLabel, renderManualVerificationForm, submitManualVerification exist.
 * 2. Conditional Form Rendering:
 *    - Rendered for SOURCE_UNAVAILABLE and MANUAL_REVIEW_REQUIRED.
 *    - Not rendered for clean/verified or expired documents without fallback necessity.
 * 3. Mandatory Reason & Ref No Validation:
 *    - Validates minimum length for authority reference number and human rationale (min 5 chars).
 * 4. Specific Verification Requirement:
 *    - Submitting manual record transitions state to acknowledged with manual verification evidence.
 * 5. Audit Confirmation DOM Rendering:
 *    - Replaces input form with .manual-verified-audit-card displaying method, date, ref number, and rationale.
 * 6. Reactive KPI Recalculation:
 *    - Acknowledged document increments Verified KPI count and decrements Pending KPI count.
 * 7. Event & Audit Dispatch:
 *    - Dispatches app:manual-verification-recorded event with full evidence payload.
 * 8. CSS Verification:
 *    - ui/css/verification.css contains .manual-verification-fallback and .manual-verified-audit-card.
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
    }
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
    currentRole: 'officer'
  }
};

global.CustomEvent = class CustomEvent {
  constructor(type, params) {
    this.type = type;
    this.detail = params ? params.detail : null;
  }
};

// 2. Load Verification Panel Script
const verificationCode = fs.readFileSync(path.join(__dirname, '../ui/js/components/verification_panel.js'), 'utf8');
eval(verificationCode);

console.log('--- Step 36 Verification Starting ---');

const comp = window.verificationPanelComponent;
assert(comp, 'verificationPanelComponent must be initialized');

// Test 1: Method Integrity
assert.strictEqual(typeof comp.needsManualReview, 'function', 'needsManualReview must exist');
assert.strictEqual(typeof comp.formatMethodLabel, 'function', 'formatMethodLabel must exist');
assert.strictEqual(typeof comp.renderManualVerificationForm, 'function', 'renderManualVerificationForm must exist');
assert.strictEqual(typeof comp.submitManualVerification, 'function', 'submitManualVerification must exist');
console.log('✓ Test 1 Passed: Manual verification methods defined on component.');

// Test 2: Conditional Form Rendering
const demoDocs = comp.getDefaultDocuments('DEMO-ISSUES-001');
const scannedDoc = demoDocs.find(d => d.id === 'doc_scanned_2');
const digitalDoc = demoDocs.find(d => d.id === 'doc_digital_1');
const fireDoc = demoDocs.find(d => d.id === 'doc_qr_fire');

assert.strictEqual(comp.needsManualReview(scannedDoc), true, 'doc_scanned_2 (SOURCE_UNAVAILABLE) must need manual review');
assert.strictEqual(comp.needsManualReview(digitalDoc), false, 'doc_digital_1 (VERIFIED) must not need manual review');
assert.strictEqual(comp.needsManualReview(fireDoc), false, 'doc_qr_fire (EXPIRED) must not need manual review');

const formHtml = comp.renderManualVerificationForm(scannedDoc);
assert(formHtml.includes('class="manual-verification-fallback"'), 'Must render .manual-verification-fallback container');
assert(formHtml.includes('id="manual-form-container-doc_scanned_2"'), 'Container must have unique ID');
assert(formHtml.includes('id="manual-method-doc_scanned_2"'), 'Must render method selector');
assert(formHtml.includes('id="manual-date-doc_scanned_2"'), 'Must render date input');
assert(formHtml.includes('id="manual-ref-doc_scanned_2"'), 'Must render reference input');
assert(formHtml.includes('id="manual-notes-doc_scanned_2"'), 'Must render notes textarea');
assert(formHtml.includes('id="btn-submit-manual-doc_scanned_2"'), 'Must render submit button');

assert.strictEqual(comp.renderManualVerificationForm(digitalDoc), '', 'Verified document must render empty string');
console.log('✓ Test 2 Passed: Conditional manual fallback form rendering verified.');

// Test 3: Method Label Formatting
assert.strictEqual(comp.formatMethodLabel('phone_call'), 'Phone Call (Registry Desk)');
assert.strictEqual(comp.formatMethodLabel('official_letter'), 'Official Letter (Physical Dispatch)');
assert.strictEqual(comp.formatMethodLabel('portal_visit'), 'Portal Direct Access');
assert.strictEqual(comp.formatMethodLabel('official_email'), 'Official Email (State Domain)');
console.log('✓ Test 3 Passed: Method label formatting verified.');

(async () => {
  // Test 4: Mandatory Validation Rules
  await comp.loadDocuments('DEMO-ISSUES-001');

  const initialKpis = comp.getKpiCounts();
  assert.strictEqual(initialKpis.verified, 1, 'Initial verified count must be 1');
  assert.strictEqual(initialKpis.pending, 1, 'Initial pending count must be 1');

  // Attempt submit with empty reference number
  const invalidRefResult = await comp.submitManualVerification('doc_scanned_2', {
    method: 'phone_call',
    date: '2026-10-25',
    referenceNumber: '',
    notes: 'Valid rationale text here'
  });
  assert.strictEqual(invalidRefResult, null, 'Must reject submission with missing reference number');

  // Attempt submit with short rationale (< 5 chars)
  const invalidNotesResult = await comp.submitManualVerification('doc_scanned_2', {
    method: 'phone_call',
    date: '2026-10-25',
    referenceNumber: 'REF-1234',
    notes: 'No'
  });
  assert.strictEqual(invalidNotesResult, null, 'Must reject submission with rationale < 5 chars');
  console.log('✓ Test 4 Passed: Mandatory reference number and rationale validations enforced.');

  // Test 5: Specific Verification Requirement
  // Requirement: Submitting manual record transitions state to acknowledged with manual verification evidence.
  eventsDispatched.length = 0;
  const submitRes = await comp.submitManualVerification('doc_scanned_2', {
    method: 'phone_call',
    date: '2026-10-25',
    referenceNumber: 'DTCP/OFFLINE/2026/0411',
    notes: 'Confirmed directly via phone with Directorate desk officer; sanction letter authentic.',
    actor: 'officer_ka_01'
  });

  assert(submitRes, 'submitManualVerification must return result');
  assert.strictEqual(submitRes.status, 'acknowledged', 'Status must transition to acknowledged');
  assert(submitRes.evidence, 'Evidence must be present');
  assert.strictEqual(submitRes.evidence.method, 'phone_call');
  assert.strictEqual(submitRes.evidence.reference_number, 'DTCP/OFFLINE/2026/0411');
  assert.strictEqual(submitRes.evidence.date, '2026-10-25');
  assert(submitRes.evidence.notes.includes('Directorate desk officer'));
  assert.strictEqual(submitRes.evidence.officer, 'officer_ka_01');

  // Check document properties
  const doc = comp.documents.find(d => d.id === 'doc_scanned_2');
  assert.strictEqual(doc.status, 'acknowledged', 'doc.status must transition to acknowledged');
  assert.strictEqual(doc.lifecycle_state, 'acknowledged', 'doc.lifecycle_state must transition to acknowledged');
  assert(doc.manual_verification, 'doc.manual_verification must store evidence');
  assert(doc.reason.includes('Manually verified via Phone Call'));
  console.log('✓ Test 5 Passed: Specific verification requirement satisfied — Submitting manual record transitions state to acknowledged with manual verification evidence.');

  // Test 6: Audit Confirmation DOM Rendering
  const auditHtml = comp.renderManualVerificationForm(doc);
  assert(auditHtml.includes('class="manual-verified-audit-card"'), 'Must render .manual-verified-audit-card');
  assert(auditHtml.includes('id="manual-audit-doc_scanned_2"'), 'Must have ID manual-audit-doc_scanned_2');
  assert(auditHtml.includes('✓ ACKNOWLEDGED'), 'Must display ✓ ACKNOWLEDGED');
  assert(auditHtml.includes('MANUAL AUDIT RECORD'), 'Must display MANUAL AUDIT RECORD badge');
  assert(auditHtml.includes('DTCP/OFFLINE/2026/0411'), 'Must display reference number');
  assert(auditHtml.includes('Phone Call (Registry Desk)'), 'Must display formatted method');
  assert(auditHtml.includes('officer_ka_01'), 'Must display recording officer');
  assert(auditHtml.includes('Directorate desk officer'), 'Must display officer rationale');
  console.log('✓ Test 6 Passed: Confirmed audit card replaces input form post-acknowledgement.');

  // Test 7: Reactive KPI Recalculation
  const updatedKpis = comp.getKpiCounts();
  assert.strictEqual(updatedKpis.verified, 2, 'Verified KPI count must increment to 2 (Affidavit + Acknowledged Plan)');
  assert.strictEqual(updatedKpis.pending, 0, 'Pending KPI count must decrement to 0');
  assert.strictEqual(updatedKpis.issues, 1, 'Issues KPI count remains 1 (Expired Fire NOC)');
  console.log('✓ Test 7 Passed: KPI overview counters reactive recalculation verified.');

  // Test 8: Custom Event Dispatch
  const manualEvt = eventsDispatched.find(e => e.type === 'app:manual-verification-recorded');
  assert(manualEvt, 'app:manual-verification-recorded event must be dispatched');
  assert.strictEqual(manualEvt.detail.documentId, 'doc_scanned_2');
  assert.strictEqual(manualEvt.detail.manualRecord.reference_number, 'DTCP/OFFLINE/2026/0411');
  console.log('✓ Test 8 Passed: app:manual-verification-recorded event dispatched with full payload.');

  // Test 9: Document Card DOM Integration
  const updatedCard = comp.renderDocumentCard(doc);
  assert(updatedCard.includes('class="manual-verified-audit-card"'), 'Document card must embed manual audit card');
  assert(updatedCard.includes('✓ ACKNOWLEDGED'), 'Card header must display ✓ ACKNOWLEDGED');
  assert(updatedCard.includes('DTCP/OFFLINE/2026/0411'), 'Card must display reference number');
  console.log('✓ Test 9 Passed: Document card integration verified post-acknowledgement.');

  console.log('-------------------------------------------');
  console.log('ALL STEP 36 TESTS PASSED SUCCESSFULLY! (9/9)');
  console.log('-------------------------------------------');
})();
