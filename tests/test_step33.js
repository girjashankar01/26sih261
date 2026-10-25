/**
 * Test Step 33: 8-State Verification Status Card
 * Spec Reference: ROADMAP.md (Phase 6: Step 33), Guide §3.6, §13
 *
 * Verifies:
 * 1. Component Export Integrity:
 *    - VerificationPanelComponent class and verificationPanelComponent singleton on window and module.exports.
 *    - STATUS_CONFIG declares all 8 Guide §3.6 statuses with classes, labels, and color codes.
 * 2. 8-State Verification Status Badging (Guide §3.6):
 *    - VERIFIED, MISMATCH_DETECTED, EXPIRED, VERIFICATION_PENDING,
 *      SOURCE_UNAVAILABLE, MANUAL_REVIEW_REQUIRED, NOT_SUPPORTED, NOT_CHECKED.
 *    - Unchecked or missing checks evaluate strictly to NOT_CHECKED (never disguised as VERIFIED).
 * 3. Specific Verification Requirement:
 *    - Expired Fire NOC displays EXPIRED status in yellow with SIMULATED badge.
 *    - Verified on doc_qr_fire in DEMO-ISSUES-001.
 * 4. Gateway Execution (POST /applications/{id}/documents/{doc_id}/verify):
 *    - verifyDocument executes verification query, returns C6 verification result,
 *      updates card DOM, and dispatches app:document-verified.
 * 5. Batch Gateway Execution (verifyAll):
 *    - Verifies all documents in bundle and dispatches app:all-documents-verified.
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

console.log('--- Step 33 Verification Starting ---');

// Test 1: Component Export Integrity & Status Taxonomy
assert(window.verificationPanelComponent, 'verificationPanelComponent singleton must exist on window');
assert(window.STATUS_CONFIG, 'STATUS_CONFIG must exist on window');
const comp = window.verificationPanelComponent;

const all8Statuses = [
  'VERIFIED',
  'MISMATCH_DETECTED',
  'EXPIRED',
  'VERIFICATION_PENDING',
  'SOURCE_UNAVAILABLE',
  'MANUAL_REVIEW_REQUIRED',
  'NOT_SUPPORTED',
  'NOT_CHECKED'
];

all8Statuses.forEach(st => {
  assert(window.STATUS_CONFIG[st], `STATUS_CONFIG must declare ${st}`);
  assert(window.STATUS_CONFIG[st].class, `${st} must have a CSS class`);
  assert(window.STATUS_CONFIG[st].label, `${st} must have a label`);
  assert(window.STATUS_CONFIG[st].color, `${st} must have a color code`);
});
console.log('✓ Test 1 Passed: Component export integrity & 8-status configuration verified.');

// Test 2: 8-State Verification Status Badging (Guide §3.6)
all8Statuses.forEach(st => {
  const pillHtml = comp.renderStatusPill(st, true);
  const cfg = window.STATUS_CONFIG[st];

  assert(pillHtml.includes(cfg.class), `renderStatusPill(${st}) must include class ${cfg.class}`);
  assert(pillHtml.includes(cfg.label), `renderStatusPill(${st}) must include label ${cfg.label}`);
  assert(pillHtml.includes('SIMULATED'), `renderStatusPill(${st}, true) must include SIMULATED badge`);
  assert(pillHtml.includes(`data-verification-status="${st}"`), `renderStatusPill(${st}) must include data-verification-status attribute`);
});

// Unknown status must fail safely to NOT_CHECKED (never disguised as VERIFIED)
const fallbackPill = comp.renderStatusPill('UNKNOWN_INVALID_STATUS');
assert(fallbackPill.includes('badge-status-not_checked'), 'Unknown status must evaluate to NOT_CHECKED');
assert(fallbackPill.includes('— NOT CHECKED'), 'Fallback label must be — NOT CHECKED');
console.log('✓ Test 2 Passed: 8-state status badging and fail-safe uncheck verified.');

// Test 3: Specific Verification Requirement
// Requirement: Expired Fire NOC displays EXPIRED status in yellow with SIMULATED badge
const fireDocCard = comp.renderDocumentCard({
  id: 'doc_qr_fire',
  document_id: 'doc_qr_fire',
  name: 'State Fire Service Certificate (Fire NOC)',
  slot: 'FIRE_NOC',
  status: 'EXPIRED',
  simulated: true,
  byte_size: 245760,
  sha256: 'a94f5c31768829efb0a701d81e976a47a13d81b49048a1',
  blake3: 'b3_78a1bc4028df198001a4e5218d6c8109',
  authority: 'Karnataka State Fire & Emergency Services',
  adapter: 'QR State Registry Adapter',
  reason: 'Certificate FS/HQ/2023/NOC-4491 expired on 2024-03-31'
});

assert(fireDocCard.includes('data-status="EXPIRED"'), 'Expired Fire NOC card must have data-status="EXPIRED"');
assert(fireDocCard.includes('badge-status-expired'), 'Expired Fire NOC card must have badge-status-expired class');
assert(fireDocCard.includes('✕ EXPIRED'), 'Expired Fire NOC card must display "✕ EXPIRED"');
assert(fireDocCard.includes('SIMULATED'), 'Expired Fire NOC card must prominently display SIMULATED badge');
assert(fireDocCard.includes('#d97706'), 'Expired Fire NOC card must have yellow/amber border accent (#d97706)');
assert(fireDocCard.includes('status-expired'), 'Expired Fire NOC card must have status-expired class');
console.log('✓ Test 3 Passed: Specific verification requirement satisfied — Expired Fire NOC renders EXPIRED in yellow with SIMULATED badge.');

(async () => {
  // Test 4: Gateway Verification Execution (POST /applications/{id}/documents/{doc_id}/verify)
  eventsDispatched.length = 0;
  await comp.loadDocuments('DEMO-ISSUES-001');

  const verifyRes = await comp.verifyDocument('doc_qr_fire');
  assert(verifyRes, 'Verification result must be returned');
  assert.strictEqual(verifyRes.document_id, 'doc_qr_fire', 'Document ID must match');
  assert.strictEqual(verifyRes.status, 'EXPIRED', 'Status must be EXPIRED');
  assert.strictEqual(verifyRes.simulated, true, 'simulated must be true');
  assert(verifyRes.reason.includes('expired'), 'Reason must explain expiration');
  assert(verifyRes.checked_at, 'checked_at timestamp must be present');

  // Verify custom event dispatch
  const docVerifiedEvt = eventsDispatched.find(e => e.type === 'app:document-verified');
  assert(docVerifiedEvt, 'app:document-verified event must be dispatched');
  assert.strictEqual(docVerifiedEvt.detail.documentId, 'doc_qr_fire');
  assert.strictEqual(docVerifiedEvt.detail.status, 'EXPIRED');
  console.log('✓ Test 4 Passed: Gateway verification query executes and yields C6 result.');

  // Test 5: Verified Status Card (doc_digital_1 Affidavit)
  const affidavitRes = await comp.verifyDocument('doc_digital_1');
  assert.strictEqual(affidavitRes.status, 'VERIFIED');
  assert.strictEqual(affidavitRes.simulated, true);
  assert(affidavitRes.reason.includes('Valid') || affidavitRes.reason.includes('signature'));

  const digitalCard = comp.renderDocumentCard(comp.documents.find(d => d.id === 'doc_digital_1'));
  assert(digitalCard.includes('badge-status-verified'), 'Affidavit card must have badge-status-verified');
  assert(digitalCard.includes('✓ VERIFIED'), 'Affidavit card must display "✓ VERIFIED"');
  assert(digitalCard.includes('SIMULATED'), 'Affidavit card must have SIMULATED badge');
  console.log('✓ Test 5 Passed: Verified digital signature document card verified.');

  // Test 6: Batch Gateway Verification (verifyAll)
  eventsDispatched.length = 0;
  const allResults = await comp.verifyAll();
  assert.strictEqual(allResults.length, 3, 'Must verify all 3 bundle documents');
  assert(eventsDispatched.some(e => e.type === 'app:all-documents-verified'), 'app:all-documents-verified event must be emitted');

  const kpis = comp.getKpiCounts();
  assert.strictEqual(kpis.total, 3, 'KPI Total must be 3');
  assert.strictEqual(kpis.verified, 1, 'KPI Verified must be 1 (doc_digital_1)');
  assert.strictEqual(kpis.issues, 1, 'KPI Issues must be 1 (doc_qr_fire)');
  assert.strictEqual(kpis.pending, 1, 'KPI Pending must be 1 (doc_scanned_2)');
  console.log('✓ Test 6 Passed: Batch verification and KPI counters update successfully.');

  console.log('-------------------------------------------');
  console.log('ALL STEP 33 TESTS PASSED SUCCESSFULLY! (6/6)');
  console.log('-------------------------------------------');
})();
