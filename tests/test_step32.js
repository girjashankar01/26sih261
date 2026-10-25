/**
 * Test Step 32: Verification Gateway Container & Overview
 * Spec Reference: ROADMAP.md (Phase 6: Step 32), Guide §3.6, §13
 *
 * Verifies:
 * 1. Component Export Integrity:
 *    - VerificationPanelComponent class and verificationPanelComponent singleton on window and module.exports.
 *    - VERIFICATION_STATUSES contains all 8 Guide §3.6 statuses.
 * 2. Gateway Overview Layout:
 *    - Top KPI bar (Total, Verifiable, Verified, Issues/Expired, Pending/Manual).
 *    - Non-negotiable simulation advisory banner per AGENTS.md.
 *    - Search input, filter buttons, and batch verification action trigger.
 * 3. Specific Verification Requirement:
 *    - Tab renders cards for all uploaded documents in the bundle.
 *    - For DEMO-ISSUES-001: doc_qr_fire (FIRE_NOC), doc_digital_1 (AFFIDAVIT), and doc_scanned_2 (BUILDING_PLAN).
 * 4. Document Card Details:
 *    - Document ID, slot label, byte size, SHA-256 and BLAKE3 digests, target authority, and verification adapter.
 * 5. Dynamic Filtering & Search:
 *    - Filter by 'issues' isolates expired Fire NOC; search by name/slot updates visible grid.
 * 6. Workspace Integration:
 *    - Tab 4 in workspace.js renders verificationPanelComponent.
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

// 2. Load Verification Panel & Workspace Scripts
const verificationCode = fs.readFileSync(path.join(__dirname, '../ui/js/components/verification_panel.js'), 'utf8');
eval(verificationCode);

const workspaceCode = fs.readFileSync(path.join(__dirname, '../ui/js/components/workspace.js'), 'utf8');
eval(workspaceCode);

console.log('--- Step 32 Verification Starting ---');

// Test 1: Component Export Integrity
assert(window.verificationPanelComponent, 'verificationPanelComponent singleton must exist on window');
assert(window.VerificationPanelComponent, 'VerificationPanelComponent class must exist on window');
assert(Array.isArray(window.VERIFICATION_STATUSES), 'VERIFICATION_STATUSES must be an array');
assert.strictEqual(window.VERIFICATION_STATUSES.length, 8, 'Must declare exactly 8 verification statuses per Guide §3.6');
const expectedStatuses = ['VERIFIED', 'MISMATCH_DETECTED', 'EXPIRED', 'VERIFICATION_PENDING', 'SOURCE_UNAVAILABLE', 'MANUAL_REVIEW_REQUIRED', 'NOT_SUPPORTED', 'NOT_CHECKED'];
expectedStatuses.forEach(st => {
  assert(window.VERIFICATION_STATUSES.includes(st), `VERIFICATION_STATUSES must contain ${st}`);
});
console.log('✓ Test 1 Passed: Component export integrity & 8-status taxonomy verified.');

// Test 2: Verification Gateway Overview Layout Rendering
const comp = window.verificationPanelComponent;
const overviewHtml = comp.render('DEMO-ISSUES-001');

assert(overviewHtml.includes('id="verification-gateway-panel"'), 'Overview must render #verification-gateway-panel');
assert(overviewHtml.includes('id="verification-kpi-bar"'), 'Overview must render #verification-kpi-bar');
assert(overviewHtml.includes('id="kpi-verif-total"'), 'KPI bar must render Total Documents counter');
assert(overviewHtml.includes('id="kpi-verif-verifiable"'), 'KPI bar must render Verifiable counter');
assert(overviewHtml.includes('id="kpi-verif-verified"'), 'KPI bar must render Verified counter');
assert(overviewHtml.includes('id="kpi-verif-issues"'), 'KPI bar must render Issues/Expired counter');
assert(overviewHtml.includes('id="kpi-verif-pending"'), 'KPI bar must render Pending/Manual counter');

// Simulation Advisory Banner (AGENTS.md compliance)
assert(overviewHtml.includes('verification-advisory-banner'), 'Must render simulation advisory banner');
assert(overviewHtml.includes('SIMULATED ADAPTERS'), 'Must tag simulated external adapters');
assert(overviewHtml.toLowerCase().includes('authoriz'), 'Advisory banner must note authorization requirement');

// Toolbar
assert(overviewHtml.includes('verification-toolbar'), 'Must render verification toolbar');
assert(overviewHtml.includes('id="verif-search-input"'), 'Must render search input');
assert(overviewHtml.includes('id="btn-verify-all-docs"'), 'Must render batch verification button');
console.log('✓ Test 2 Passed: Gateway layout, KPI counters, and simulation advisory rendered.');

// Test 3: Verification Requirement — Tab renders cards for all uploaded documents in the bundle
assert(overviewHtml.includes('id="verif-doc-doc_qr_fire"'), 'Must render document card for doc_qr_fire');
assert(overviewHtml.includes('id="verif-doc-doc_digital_1"'), 'Must render document card for doc_digital_1');
assert(overviewHtml.includes('id="verif-doc-doc_scanned_2"'), 'Must render document card for doc_scanned_2');

// Details on cards
assert(overviewHtml.includes('FIRE_NOC'), 'Card must display slot FIRE_NOC');
assert(overviewHtml.includes('AFFIDAVIT'), 'Card must display slot AFFIDAVIT');
assert(overviewHtml.includes('BUILDING_PLAN'), 'Card must display slot BUILDING_PLAN');

// Cryptographic digests
assert(overviewHtml.includes('SHA-256 Digest'), 'Card must render SHA-256 label');
assert(overviewHtml.includes('BLAKE3 Digest'), 'Card must render BLAKE3 label');
assert(overviewHtml.includes('a94f5c31768829ef'), 'Card must render SHA-256 digest substring');

// Authority & Adapter info
assert(overviewHtml.includes('Karnataka State Fire &amp; Emergency Services') || overviewHtml.includes('Karnataka State Fire & Emergency Services'), 'Card must render target authority');
assert(overviewHtml.includes('QR State Registry Adapter'), 'Card must render verification adapter name');
console.log('✓ Test 3 Passed: Specific verification requirement satisfied — all bundle documents rendered.');

// Test 4: Filtering and Search Logic
// Filter by 'issues'
comp.setFilter('issues');
const issuesDocs = comp.getFilteredDocuments();
assert.strictEqual(issuesDocs.length, 1, 'Issues filter must isolate 1 document');
assert.strictEqual(issuesDocs[0].id, 'doc_qr_fire', 'Issues filter must return expired doc_qr_fire');

// Filter by 'verified'
comp.setFilter('verified');
const verifiedDocs = comp.getFilteredDocuments();
assert.strictEqual(verifiedDocs.length, 1, 'Verified filter must isolate 1 document');
assert.strictEqual(verifiedDocs[0].id, 'doc_digital_1', 'Verified filter must return verified doc_digital_1');

// Reset to 'all'
comp.setFilter('all');
assert.strictEqual(comp.getFilteredDocuments().length, 3, 'All filter must return all 3 bundle documents');

// Search filter
comp.setSearch('fire');
const searchedDocs = comp.getFilteredDocuments();
assert.strictEqual(searchedDocs.length, 1, 'Search for "fire" must return fire NOC');
assert.strictEqual(searchedDocs[0].id, 'doc_qr_fire');
comp.setSearch(''); // reset search
console.log('✓ Test 4 Passed: Status filtering and real-time search logic verified.');

// Test 5: Workspace Tab Manager Integration
const ws = window.workspaceComponent || new WorkspaceComponent();
const wsHtml = ws.renderWorkspace();

assert(wsHtml.includes('id="workspace-pane-verifications"'), 'Workspace must include Tab 4 pane #workspace-pane-verifications');
assert(wsHtml.includes('id="workspace-verifications-content"'), 'Workspace must include container #workspace-verifications-content');
assert(wsHtml.includes('verification-gateway-panel'), 'Workspace Tab 4 must render verification-gateway-panel');

console.log('✓ Test 5 Passed: Workspace Tab Manager integration verified.');

// Test 6: Clean Demo Application Case
const cleanDocs = comp.getDefaultDocuments('DEMO-CLEAN-001');
assert.strictEqual(cleanDocs.length, 2, 'Clean bundle must contain 2 documents');
assert(cleanDocs.every(d => d.status === 'VERIFIED'), 'All clean documents must evaluate to VERIFIED');
console.log('✓ Test 6 Passed: Clean demo application verification defaults verified.');

console.log('-------------------------------------------');
console.log('ALL STEP 32 TESTS PASSED SUCCESSFULLY! (6/6)');
console.log('-------------------------------------------');
