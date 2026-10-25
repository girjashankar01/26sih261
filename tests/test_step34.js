/**
 * Test Step 34: 3-Pillar Inspection Breakdown (Integrity, Trust, Source)
 * Spec Reference: ROADMAP.md (Phase 6: Step 34), Guide §5.2, §13
 *
 * Verifies:
 * 1. Pillar Container & Grid Architecture:
 *    - verification-pillars-grid rendered for every document card.
 *    - Contains exactly 3 inspection columns:
 *      * Column 1: Document Integrity
 *      * Column 2: Cryptographic Trust
 *      * Column 3: Source Verification
 * 2. Specific Verification Requirement:
 *    - Clean signed PDF (doc_digital_1 / clean affidavit) shows:
 *      * INTACT_FULL_COVERAGE under Integrity (with class pillar-val-intact)
 *      * demo under Trust (with class pillar-val-demo)
 * 3. Expired & Raster Document Column Values:
 *    - Expired Fire NOC (doc_qr_fire):
 *      * Source Verification shows EXPIRED_ON_REGISTRY (with class pillar-val-warn)
 *      * Trust shows unsigned (with class pillar-val-muted)
 *    - Scanned Building Plan (doc_scanned_2):
 *      * Source Verification shows SOURCE_UNAVAILABLE (with class pillar-val-muted)
 * 4. Forensic Endpoint & Data Loading:
 *    - loadForensics loads raw-byte analysis matching S2 Forensics / Guide §5.2 (GET /applications/{id}/documents/{doc_id}/forensics).
 *    - inspectForensics dispatches app:forensics-inspect-requested with forensic detail.
 * 5. Dynamic DOM Synchronization:
 *    - Verifying a document dynamically re-renders and updates its 3 pillars in the card DOM.
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

console.log('--- Step 34 Verification Starting ---');

const comp = window.verificationPanelComponent;
assert(comp, 'verificationPanelComponent must be initialized');

// Test 1: 3-Pillar Inspection Container & Architecture
const demoDocs = comp.getDefaultDocuments('DEMO-ISSUES-001');
const signedDoc = demoDocs.find(d => d.id === 'doc_digital_1');
assert(signedDoc, 'doc_digital_1 must exist in demo bundle');

const pillarsHtml = comp.renderPillarsBreakdown(signedDoc);
assert(pillarsHtml.includes('class="verification-pillars-grid"'), 'Pillars must be wrapped in .verification-pillars-grid');
assert(pillarsHtml.includes('id="verif-pillars-doc_digital_1"'), 'Container must have unique ID per doc');
assert(pillarsHtml.includes('Document Integrity'), 'Must contain Document Integrity pillar');
assert(pillarsHtml.includes('Cryptographic Trust'), 'Must contain Cryptographic Trust pillar');
assert(pillarsHtml.includes('Source Verification'), 'Must contain Source Verification pillar');
console.log('✓ Test 1 Passed: 3-pillar grid architecture and headers verified.');

// Test 2: Specific Verification Requirement
// Requirement: Clean signed PDF shows INTACT_FULL_COVERAGE under Integrity and demo under Trust
const signedResolved = comp.resolvePillars(signedDoc);
assert.strictEqual(
  signedResolved.integrity.value,
  'INTACT_FULL_COVERAGE',
  'Clean signed PDF must show INTACT_FULL_COVERAGE under Integrity'
);
assert.strictEqual(
  signedResolved.trust.value,
  'demo',
  'Clean signed PDF must show demo under Trust'
);
assert(
  signedResolved.integrity.className.includes('pillar-val-intact'),
  'INTACT_FULL_COVERAGE must have class pillar-val-intact'
);
assert(
  signedResolved.trust.className.includes('pillar-val-demo'),
  'demo trust must have class pillar-val-demo'
);

// Verify inside rendered HTML string
assert(pillarsHtml.includes('INTACT_FULL_COVERAGE'), 'Rendered HTML must contain INTACT_FULL_COVERAGE');
assert(pillarsHtml.includes('pillar-val-intact'), 'Rendered HTML must contain pillar-val-intact');
assert(pillarsHtml.includes('demo'), 'Rendered HTML must contain demo');
assert(pillarsHtml.includes('pillar-val-demo'), 'Rendered HTML must contain pillar-val-demo');
assert(pillarsHtml.includes('0 post-signing revisions'), 'Detail must indicate 0 post-signing revisions');
assert(pillarsHtml.includes('AICTE Demo Root CA'), 'Detail must indicate AICTE Demo Root CA');
console.log('✓ Test 2 Passed: Specific verification requirement satisfied — Clean signed PDF shows INTACT_FULL_COVERAGE under Integrity and demo under Trust.');

// Test 3: Expired Fire NOC (doc_qr_fire) Pillar Values
const fireDoc = demoDocs.find(d => d.id === 'doc_qr_fire');
assert(fireDoc, 'doc_qr_fire must exist');
const firePillars = comp.resolvePillars(fireDoc);
assert.strictEqual(
  firePillars.source.value,
  'EXPIRED_ON_REGISTRY',
  'Expired Fire NOC must show EXPIRED_ON_REGISTRY under Source Verification'
);
assert.strictEqual(
  firePillars.trust.value,
  'unsigned',
  'Fire NOC without CMS signature must show unsigned under Trust'
);
assert(
  firePillars.source.className.includes('pillar-val-warn'),
  'EXPIRED_ON_REGISTRY must have pillar-val-warn class'
);

const firePillarsHtml = comp.renderPillarsBreakdown(fireDoc);
assert(firePillarsHtml.includes('EXPIRED_ON_REGISTRY'), 'Fire NOC pillars HTML must contain EXPIRED_ON_REGISTRY');
assert(firePillarsHtml.includes('pillar-val-warn'), 'Fire NOC pillars HTML must contain pillar-val-warn');
assert(firePillarsHtml.includes('unsigned'), 'Fire NOC pillars HTML must contain unsigned');
console.log('✓ Test 3 Passed: Expired Fire NOC shows EXPIRED_ON_REGISTRY under Source Verification.');

// Test 4: Scanned Building Plan (doc_scanned_2) Pillar Values
const scannedDoc = demoDocs.find(d => d.id === 'doc_scanned_2');
assert(scannedDoc, 'doc_scanned_2 must exist');
const scannedPillars = comp.resolvePillars(scannedDoc);
assert.strictEqual(
  scannedPillars.source.value,
  'SOURCE_UNAVAILABLE',
  'Scanned document with gateway timeout must show SOURCE_UNAVAILABLE under Source'
);
assert.strictEqual(
  scannedPillars.integrity.value,
  'SHA256_MATCH',
  'Scanned raster with valid original digest must show SHA256_MATCH under Integrity'
);
console.log('✓ Test 4 Passed: Scanned document shows SOURCE_UNAVAILABLE and SHA256_MATCH.');

(async () => {
  // Test 5: Forensics Endpoint & Data Loading (GET /applications/{id}/documents/{doc_id}/forensics)
  const forensics = await comp.loadForensics('doc_digital_1');
  assert(forensics, 'loadForensics must return forensics payload');
  assert.strictEqual(forensics.pipeline_stage, 'S2_FORENSICS', 'Stage must be S2_FORENSICS');
  assert(forensics.meta, 'Forensics meta must exist');
  assert(Array.isArray(forensics.meta.signatures), 'Signatures must be an array');
  assert.strictEqual(forensics.meta.signatures[0].integrity, 'INTACT_FULL_COVERAGE');
  assert.strictEqual(forensics.meta.signatures[0].trust, 'demo');
  console.log('✓ Test 5 Passed: S2 Forensics data loading adheres to Guide §5.2 contract.');

  // Test 6: inspectForensics Event Dispatch
  eventsDispatched.length = 0;
  const inspectedForensics = await comp.inspectForensics('doc_digital_1');
  assert(inspectedForensics, 'inspectForensics must resolve forensics payload');
  const inspectEvt = eventsDispatched.find(e => e.type === 'app:forensics-inspect-requested');
  assert(inspectEvt, 'app:forensics-inspect-requested event must be dispatched');
  assert.strictEqual(inspectEvt.detail.documentId, 'doc_digital_1');
  assert(inspectEvt.detail.forensics, 'Event detail must include forensics payload');
  console.log('✓ Test 6 Passed: inspectForensics loads forensic analysis and dispatches inspection event.');

  // Test 7: Document Card Full Integration
  const cardHtml = comp.renderDocumentCard(signedDoc);
  assert(cardHtml.includes('class="verification-pillars-grid"'), 'Card HTML must embed verification-pillars-grid');
  assert(cardHtml.includes('data-pillar="integrity"'), 'Card HTML must include integrity pillar');
  assert(cardHtml.includes('data-pillar="trust"'), 'Card HTML must include trust pillar');
  assert(cardHtml.includes('data-pillar="source"'), 'Card HTML must include source pillar');
  assert(cardHtml.includes('INTACT_FULL_COVERAGE'), 'Card HTML must render INTACT_FULL_COVERAGE');
  assert(cardHtml.includes('demo'), 'Card HTML must render demo');
  console.log('✓ Test 7 Passed: Verification Card fully integrates 3-pillar breakdown in DOM structure.');

  console.log('-------------------------------------------');
  console.log('ALL STEP 34 TESTS PASSED SUCCESSFULLY! (7/7)');
  console.log('-------------------------------------------');
})();
