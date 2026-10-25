/**
 * Test Step 52: Interactive Fail-Visible Tamper Demonstration
 * Spec Reference: ROADMAP.md (Phase 9: Step 52), Guide §15.1
 *
 * Verifies:
 * 1. Tamper Studio Layout & Initial Authentic State:
 *    - #audit-tamper-section renders with #audit-tamper-card.
 *    - Status badge #badge-tamper-studio-status displays "INTEGRITY INTACT (ZERO MUTATIONS)".
 *    - Buttons #btn-simulate-tamper and #btn-restore-integrity present.
 * 2. Specific Verification Requirement:
 *    - Clicking "Simulate Database Tampering" modifies event in sandbox memory and runs verification.
 *    - Displays dramatic Red Alert banner:
 *      "CHAIN BROKEN AT EVENT #X! Canonical payload hash mismatch: Database records have been altered without authorization!"
 *    - Row in event table is highlighted with .audit-row-tampered and MUTATED badge.
 * 3. Field Variation Support (Timestamp & Details Mutation):
 *    - simulateTamper supports 'actor', 'ts' (timestamp), and 'details'.
 * 4. Specific Verification Requirement:
 *    - Clicking "Restore Integrity" reverts alteration in memory.
 *    - Restores green verification badge in #audit-verification-section:
 *      "Integrity Verified: N events cryptographically linked."
 * 5. Lifecycle Event Dispatches:
 *    - Dispatches app:tamper-simulated on tampering.
 *    - Dispatches app:tamper-restored on restoration.
 * 6. Backend / Sandbox API Contract Compatibility:
 *    - GET /audit/verify?sandbox_tamper=true returns fail-visible mismatch response.
 * 7. CSS Stylesheet Integration:
 *    - ui/css/audit.css defines all required tamper demonstration selectors.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

// 1. Mock Browser Environment
const eventsDispatched = [];
const mockElements = new Map();

const createMockElement = (initialId) => {
  const classes = new Set();
  const attributes = new Map();
  const listeners = {};
  let _id = initialId;
  let _innerHTML = '';
  let _textContent = '';

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
    get textContent() { return _textContent || _innerHTML.replace(/<[^>]+>/g, ''); },
    set textContent(val) { _textContent = val; },
    outerHTML: '',
    parentNode: null,
    disabled: false,
    classList: {
      add: (cls) => classes.add(cls),
      remove: (cls) => classes.delete(cls),
      contains: (cls) => classes.has(cls)
    },
    setAttribute: (k, v) => attributes.set(k, String(v)),
    getAttribute: (k) => attributes.get(k) || null,
    addEventListener: (ev, handler) => {
      listeners[ev] = listeners[ev] || [];
      listeners[ev].push(handler);
    },
    removeEventListener: (ev, handler) => {
      if (listeners[ev]) {
        listeners[ev] = listeners[ev].filter(h => h !== handler);
      }
    },
    dispatchEvent: (event) => {
      const handlers = listeners[event.type] || [];
      for (const h of handlers) h(event);
    },
    dataset: {},
    appendChild: (child) => {
      child.parentNode = el;
      if (child.id) mockElements.set(child.id, child);
    },
    removeChild: (child) => {
      if (child.id) mockElements.delete(child.id);
      child.parentNode = null;
    },
    querySelector: (selector) => {
      if (selector.startsWith('#')) {
        const targetId = selector.substring(1);
        if (mockElements.has(targetId)) return mockElements.get(targetId);
      }
      return null;
    },
    querySelectorAll: (selector) => []
  };

  if (_id) mockElements.set(_id, el);
  return el;
};

// Global Browser Stubs
global.window = {
  location: { hash: '#audit' },
  addEventListener: (ev, fn) => {},
  removeEventListener: (ev, fn) => {},
  dispatchEvent: (ev) => eventsDispatched.push(ev)
};

global.document = {
  getElementById: (id) => {
    if (mockElements.has(id)) return mockElements.get(id);
    return null;
  },
  createElement: (tag) => createMockElement(`el-${Math.random().toString(36).substring(7)}`),
  body: createMockElement('body')
};

global.CustomEvent = class CustomEvent {
  constructor(name, options = {}) {
    this.type = name;
    this.detail = options.detail || {};
  }
};

// Load Component
const { AuditViewComponent, auditViewComponent } = require('../ui/js/components/audit_view.js');

(async () => {
  console.log('--- Running Step 52 Test Suite: Interactive Fail-Visible Tamper Demonstration ---');

  // ============================================================================
  // Test 1: Tamper Studio Layout & Initial Authentic State
  // ============================================================================
  console.log('Test 1: Tamper Studio Layout & Initial Authentic State');
  assert(auditViewComponent, 'AuditViewComponent singleton instance must exist');

  // Ensure clean state
  auditViewComponent.isTampered = false;
  auditViewComponent.tamperedEventBackup = null;
  auditViewComponent.events = auditViewComponent.getDefaultAuditEvents();

  const studioHtml = auditViewComponent.renderTamperSection();
  assert(studioHtml.includes('id="audit-tamper-card"'), 'Must render #audit-tamper-card');
  assert(studioHtml.includes('id="badge-tamper-studio-status"'), 'Must render studio status badge');
  assert(studioHtml.includes('INTEGRITY INTACT (ZERO MUTATIONS)'), 'Must indicate integrity intact initially');
  assert(studioHtml.includes('id="btn-simulate-tamper"'), 'Must render #btn-simulate-tamper');
  assert(studioHtml.includes('Simulate Database Tampering'), 'Button text must include Simulate Database Tampering');
  assert(studioHtml.includes('id="btn-restore-integrity"'), 'Must render #btn-restore-integrity');
  assert(studioHtml.includes('Restore Integrity'), 'Button text must include Restore Integrity');
  assert(studioHtml.includes('id="select-tamper-event"'), 'Must render target event selector');
  assert(studioHtml.includes('id="select-tamper-field"'), 'Must render target field selector');

  console.log('✓ Tamper studio layout, selectors, and initial intact status verified');

  // ============================================================================
  // Test 2: Specific Verification Requirement
  // "Button: 'Simulate Database Tampering': modifies an event timestamp or actor field in sandbox memory.
  // Runs verification; displays dramatic Red Alert banner:
  // CHAIN BROKEN AT EVENT #X! Canonical payload hash mismatch: Database records have been altered without authorization!"
  // ============================================================================
  console.log('Test 2: Specific Verification Requirement: Simulate Database Tampering trips Red Alert banner');
  eventsDispatched.length = 0;
  createMockElement('audit-tamper-section');
  createMockElement('audit-verification-section');
  createMockElement('audit-events-table-host');

  // Trigger tamper simulation on Event #4 actor field
  const tamperResult = await auditViewComponent.simulateTamper(4, 'actor');

  assert.strictEqual(auditViewComponent.isTampered, true, 'isTampered must be set to true');
  assert.strictEqual(auditViewComponent.tamperedEventId, 4, 'tamperedEventId must be 4');
  assert.strictEqual(tamperResult.ok, false, 'Verification must fail with ok: false');
  assert.strictEqual(tamperResult.first_bad_id, 4, 'first_bad_id must identify Event #4');

  const expectedAlertMsg = 'CHAIN BROKEN AT EVENT #4! Canonical payload hash mismatch: Database records have been altered without authorization!';
  assert.strictEqual(tamperResult.reason, 'Canonical payload hash mismatch: Database records have been altered without authorization!');

  // Verify dramatic Red Alert banner in studio
  const tamperedStudioHtml = auditViewComponent.renderTamperSection();
  assert(tamperedStudioHtml.includes('id="banner-chain-broken-tamper"'), 'Must render dramatic Red Alert banner container');
  assert(tamperedStudioHtml.includes('audit-tamper-alert-banner'), 'Must apply audit-tamper-alert-banner class');
  assert(tamperedStudioHtml.includes(expectedAlertMsg), `Red Alert banner must display exact text: "${expectedAlertMsg}"`);
  assert(tamperedStudioHtml.includes('badge-tamper-active'), 'Status badge must transition to badge-tamper-active');

  // Verify verification section also reflects broken chain
  const verSectionHtml = auditViewComponent.renderVerificationSection(tamperResult);
  assert(verSectionHtml.includes('badge-integrity-failed'), 'Verification section must render badge-integrity-failed');
  assert(verSectionHtml.includes('CHAIN BROKEN AT EVENT #4!'), 'Verification section must identify broken Event #4');

  // Verify table row is highlighted with tamper styling
  const tableHtml = auditViewComponent.renderEventsTable();
  assert(tableHtml.includes('audit-row-tampered'), 'Table row must receive audit-row-tampered class');
  assert(tableHtml.includes('MUTATED'), 'Row must display MUTATED pill badge');

  console.log('✓ Specific verification requirement satisfied: Red Alert banner displayed with exact tamper notification');

  // ============================================================================
  // Test 3: Field Variation Support (Timestamp & Details Mutation)
  // ============================================================================
  console.log('Test 3: Field Variation Support (Timestamp & Details Mutation)');
  await auditViewComponent.restoreIntegrity();

  // Test timestamp backdating
  const tsTamperResult = await auditViewComponent.simulateTamper(4, 'ts');
  assert.strictEqual(tsTamperResult.ok, false);
  assert.strictEqual(tsTamperResult.first_bad_id, 4);
  assert.strictEqual(auditViewComponent.tamperField, 'ts');
  assert.strictEqual(auditViewComponent.tamperDetails.tamperedVal, '2020-01-01T00:00:00.000000+00:00');

  console.log('✓ Field variation (timestamp backdating) correctly simulated and detected');

  // ============================================================================
  // Test 4: Specific Verification Requirement
  // "Button: 'Restore Integrity': reverts alteration and restores green verification badge."
  // ============================================================================
  console.log('Test 4: Specific Verification Requirement: Restore Integrity reverts alteration and restores green badge');
  eventsDispatched.length = 0;

  // Execute restore integrity
  const restoredResult = await auditViewComponent.restoreIntegrity();

  assert.strictEqual(auditViewComponent.isTampered, false, 'isTampered must be reset to false');
  assert.strictEqual(auditViewComponent.tamperedEventBackup, null, 'tamperedEventBackup must be cleared');
  assert.strictEqual(restoredResult.ok, true, 'Verification must succeed with ok: true');
  assert.strictEqual(restoredResult.first_bad_id, null, 'first_bad_id must be null');

  // Verify green badge is restored in verification section
  const restoredVerHtml = auditViewComponent.renderVerificationSection(restoredResult);
  assert(restoredVerHtml.includes('badge-integrity-verified'), 'Must restore badge-integrity-verified class');
  assert(
    restoredVerHtml.includes(`Integrity Verified: ${restoredResult.count} events cryptographically linked.`),
    'Must display green verified badge text'
  );

  // Verify Red Alert banner is removed from studio
  const restoredStudioHtml = auditViewComponent.renderTamperSection();
  assert(!restoredStudioHtml.includes('id="banner-chain-broken-tamper"'), 'Red Alert banner must be removed');
  assert(restoredStudioHtml.includes('id="banner-chain-intact"'), 'Intact banner must be displayed');
  assert(restoredStudioHtml.includes('INTEGRITY INTACT (ZERO MUTATIONS)'), 'Status badge must return to intact state');

  // Verify table row highlighting is cleared
  const cleanTableHtml = auditViewComponent.renderEventsTable();
  assert(!cleanTableHtml.includes('audit-row-tampered'), 'audit-row-tampered class must be removed from rows');

  console.log('✓ Specific verification requirement satisfied: Integrity restored and green verification badge displayed');

  // ============================================================================
  // Test 5: Lifecycle Event Dispatches
  // ============================================================================
  console.log('Test 5: Lifecycle Event Dispatches');
  eventsDispatched.length = 0;

  await auditViewComponent.simulateTamper(2, 'actor');
  const tamperEvent = eventsDispatched.find(e => e.type === 'app:tamper-simulated');
  assert(tamperEvent, 'Must dispatch app:tamper-simulated');
  assert.strictEqual(tamperEvent.detail.eventId, 2);

  await auditViewComponent.restoreIntegrity();
  const restoreEvent = eventsDispatched.find(e => e.type === 'app:tamper-restored');
  assert(restoreEvent, 'Must dispatch app:tamper-restored');
  assert(restoreEvent.detail.timestamp, 'Restore event must include timestamp');

  console.log('✓ app:tamper-simulated and app:tamper-restored lifecycle events verified');

  // ============================================================================
  // Test 6: Backend Sandbox API Query Parameter Contract
  // ============================================================================
  console.log('Test 6: Backend Sandbox API Query Parameter Contract');
  const mainPyPath = path.join(__dirname, '../backend/api/main.py');
  const mainPy = fs.readFileSync(mainPyPath, 'utf8');
  assert(mainPy.includes('sandbox_tamper: bool = False'), 'backend/api/main.py must accept sandbox_tamper query param');
  assert(mainPy.includes('tamper_event_id: int = 4'), 'backend/api/main.py must accept tamper_event_id param');
  assert(mainPy.includes('Canonical payload hash mismatch: Database records have been altered without authorization!'), 'Backend must return canonical tamper alert message');
  console.log('✓ Backend API endpoint sandbox query parameter contract verified');

  // ============================================================================
  // Test 7: CSS Stylesheet Integration
  // ============================================================================
  console.log('Test 7: CSS Stylesheet Integration');
  const cssPath = path.join(__dirname, '../ui/css/audit.css');
  assert(fs.existsSync(cssPath), 'ui/css/audit.css must exist');
  const cssContent = fs.readFileSync(cssPath, 'utf8');

  const requiredTamperSelectors = [
    '.audit-tamper-studio-card',
    '.audit-tamper-controls',
    '.audit-tamper-buttons',
    '.btn-tamper-simulate',
    '.btn-tamper-restore',
    '.audit-tamper-alert-banner',
    '.audit-tamper-alert-title',
    '.audit-tamper-alert-desc',
    '.audit-tamper-intact-banner',
    '.audit-row-tampered',
    '.badge-tamper-intact',
    '.badge-tamper-active'
  ];

  for (const sel of requiredTamperSelectors) {
    assert(cssContent.includes(sel), `CSS must define selector: ${sel}`);
  }

  console.log('✓ ui/css/audit.css tamper demonstration stylesheet rules verified');

  console.log('\n======================================================');
  console.log('✓ ALL 7 STEP 52 VERIFICATION CHECKS PASSED SUCCESSFULLY');
  console.log('======================================================');
})().catch(err => {
  console.error(err);
  process.exit(1);
});
