/**
 * Test Step 49: Live Hash Chain Verification Button & Badge
 * Spec Reference: ROADMAP.md (Phase 9: Step 49), Guide §15.1
 *
 * Verifies:
 * 1. Verification Engine Initialization & Deterministic Local Verifier:
 *    - verifyLocalEvents on default chain returns ok: true with valid head hash and count.
 *    - verifyLocalEvents on tampered chain detects mutation and returns ok: false with first_bad_id.
 * 2. Specific Verification Requirement:
 *    - Successful verification displays green badge: "Integrity Verified: N events cryptographically linked."
 *    - Active chain head match confirmation rendered (#audit-head-match-confirmation, #audit-verified-head-hash).
 * 3. Interactive Verification Trigger (triggerVerifyChain):
 *    - Triggering verification calls backend verifier / GET /audit/verify.
 *    - Dispatches app:audit-verification-started and app:audit-chain-verified events.
 * 4. Statistics Grid Synchronization:
 *    - Updates Card 1 (#audit-stat-count) and Card 3 (#audit-head-hash-val) upon verification.
 * 5. Cryptographic Verification Breakdown Checklist:
 *    - Renders 4 explicit verification checklist items (Genesis anchor, sequential continuity, canonical JSON, zero payload mutations).
 * 6. Fail-Visible Tampered Chain Display:
 *    - Broken chain renders red badge (#badge-chain-integrity-failed) identifying broken event ID and reason.
 * 7. CSS Stylesheet Integration & Loading State:
 *    - isVerifying state renders #audit-verification-loading with spinner-sm.
 *    - ui/css/audit.css defines all required verification selectors.
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
const { AuditViewComponent, auditViewComponent, GENESIS_HASH } = require('../ui/js/components/audit_view.js');

(async () => {
  console.log('--- Running Step 49 Test Suite: Live Hash Chain Verification Button & Badge ---');

  // ============================================================================
  // Test 1: Verification Engine Initialization & Deterministic Local Verifier
  // ============================================================================
  console.log('Test 1: Verification Engine Initialization & Deterministic Local Verifier');
  assert(auditViewComponent, 'AuditViewComponent singleton instance must exist');

  const cleanEvents = auditViewComponent.getDefaultAuditEvents();
  const cleanResult = auditViewComponent.verifyLocalEvents(cleanEvents);
  assert.strictEqual(cleanResult.ok, true, 'Clean chain must verify ok: true');
  assert.strictEqual(cleanResult.count, cleanEvents.length, `Count must match total events (${cleanEvents.length})`);
  assert.strictEqual(cleanResult.head, cleanEvents[cleanEvents.length - 1].entry_hash, 'Head must equal last entry_hash');
  assert.strictEqual(cleanResult.first_bad_id, null, 'first_bad_id must be null for valid chain');

  // Simulate broken link
  const tamperedEvents = JSON.parse(JSON.stringify(cleanEvents));
  tamperedEvents[3].prev_hash = 'deadbeef'.repeat(8);
  const brokenResult = auditViewComponent.verifyLocalEvents(tamperedEvents);
  assert.strictEqual(brokenResult.ok, false, 'Tampered chain must fail verification (ok: false)');
  assert.strictEqual(brokenResult.first_bad_id, tamperedEvents[3].id, `Broken event must be detected at ID #${tamperedEvents[3].id}`);
  assert.strictEqual(brokenResult.reason, 'Broken prev_hash link');

  console.log('✓ Verification engine successfully verifies valid chain and detects broken links');

  // ============================================================================
  // Test 2: Specific Verification Requirement
  // "Successful verification displays green badge with head hash match confirmation."
  // ============================================================================
  console.log('Test 2: Specific Verification Requirement: Green badge with head hash match confirmation');
  const renderedSection = auditViewComponent.renderVerificationSection(cleanResult);

  // 1. Verify "Verify Hash Chain Integrity" button exists
  assert(renderedSection.includes('id="btn-verify-audit-chain"'), 'Must render #btn-verify-audit-chain');
  assert(renderedSection.includes('Verify Hash Chain Integrity'), 'Button text must include Verify Hash Chain Integrity');

  // 2. Verify green badge
  assert(renderedSection.includes('id="badge-chain-integrity-verified"'), 'Must render #badge-chain-integrity-verified');
  assert(renderedSection.includes('class="badge-integrity-verified"'), 'Must apply badge-integrity-verified class');
  const expectedBadgeText = `Integrity Verified: ${cleanResult.count} events cryptographically linked.`;
  assert(renderedSection.includes(expectedBadgeText), `Badge must display exact text: "${expectedBadgeText}"`);

  // 3. Verify head hash match confirmation
  assert(renderedSection.includes('id="audit-head-match-confirmation"'), 'Must render #audit-head-match-confirmation element');
  assert(renderedSection.includes('id="audit-verified-head-hash"'), 'Must render #audit-verified-head-hash element');
  assert(renderedSection.includes(cleanResult.head), 'Must render exact 64-char head hash in confirmation');
  assert(
    renderedSection.includes('matches calculated state digest across all'),
    'Must display confirmation text affirming active chain head match'
  );

  console.log('✓ Specific verification requirement satisfied: Green badge and head hash match confirmation verified');

  // ============================================================================
  // Test 3: Interactive Verification Trigger (triggerVerifyChain)
  // ============================================================================
  console.log('Test 3: Interactive Verification Trigger (triggerVerifyChain)');
  eventsDispatched.length = 0;
  createMockElement('audit-verification-section');
  createMockElement('audit-stat-count');
  createMockElement('audit-head-hash-val');

  // Trigger verification and await completion
  const verifiedRes = await auditViewComponent.triggerVerifyChain();
  assert(verifiedRes, 'Verification result must be resolved');
  assert.strictEqual(verifiedRes.ok, true, 'Verification result must be ok: true');

  // Verify start event dispatched
  const startedEvent = eventsDispatched.find(e => e.type === 'app:audit-verification-started');
  assert(startedEvent, 'triggerVerifyChain must dispatch app:audit-verification-started');

  // Verify completion event dispatched
  const verifiedEvent = eventsDispatched.find(e => e.type === 'app:audit-chain-verified');
  assert(verifiedEvent, 'triggerVerifyChain must dispatch app:audit-chain-verified');
  assert.strictEqual(verifiedEvent.detail.ok, true);
  assert.strictEqual(verifiedEvent.detail.count, verifiedRes.count);
  assert.strictEqual(verifiedEvent.detail.head, verifiedRes.head);
  assert(verifiedEvent.detail.verifiedAt, 'Verified event must include timestamp');

  console.log('✓ Interactive verification trigger successfully executed and dispatched lifecycle events');

  // ============================================================================
  // Test 4: Statistics Grid Synchronization
  // ============================================================================
  console.log('Test 4: Statistics Grid Synchronization');
  const countEl = document.getElementById('audit-stat-count');
  const headEl = document.getElementById('audit-head-hash-val');
  assert(countEl.textContent.includes('Events'), 'Card 1 must be updated with event count');
  assert(headEl.textContent.length > 0, 'Card 3 must be updated with head hash');
  console.log('✓ Statistics cards 1 & 3 synchronized with verified chain state');

  // ============================================================================
  // Test 5: Cryptographic Verification Breakdown Checklist
  // ============================================================================
  console.log('Test 5: Cryptographic Verification Breakdown Checklist');
  assert(renderedSection.includes('Genesis Anchor (64 zeros) confirmed'), 'Must verify Genesis anchor');
  assert(renderedSection.includes('0000...0000'), 'Must specify Genesis 0000...0000 anchor');
  assert(renderedSection.includes('Strict prev-to-entry sequential continuity'), 'Must verify sequential continuity');
  assert(renderedSection.includes('0 broken links'), 'Must confirm 0 broken links');
  assert(renderedSection.includes('Canonical JSON serialization validated'), 'Must verify canonical JSON formatting');
  assert(renderedSection.includes('Fail-visible tamper guarantee'), 'Must affirm fail-visible guarantee');
  console.log('✓ Cryptographic verification breakdown checklist verified');

  // ============================================================================
  // Test 6: Fail-Visible Tampered Chain Display
  // ============================================================================
  console.log('Test 6: Fail-Visible Tampered Chain Display');
  const tamperedHtml = auditViewComponent.renderVerificationSection(brokenResult);
  assert(tamperedHtml.includes('id="badge-chain-integrity-failed"'), 'Must render failed integrity badge');
  assert(tamperedHtml.includes('badge-integrity-failed'), 'Must apply badge-integrity-failed class');
  assert(tamperedHtml.includes(`CHAIN BROKEN AT EVENT #${tamperedEvents[3].id}`), 'Must display exact broken event ID');
  assert(tamperedHtml.includes('id="audit-broken-chain-details"'), 'Must render audit-broken-chain-details');
  console.log('✓ Fail-visible tamper detection display verified');

  // ============================================================================
  // Test 7: CSS Stylesheet Integration & Loading State
  // ============================================================================
  console.log('Test 7: CSS Stylesheet Integration & Loading State');
  // Loading state check
  auditViewComponent.isVerifying = true;
  const loadingHtml = auditViewComponent.renderVerificationSection();
  assert(loadingHtml.includes('id="audit-verification-loading"'), 'Must render #audit-verification-loading when isVerifying is true');
  assert(loadingHtml.includes('spinner-sm'), 'Must render spinner-sm');
  assert(loadingHtml.includes('disabled'), 'Verify button must be disabled during active recalculation');
  auditViewComponent.isVerifying = false;

  // Stylesheet selectors check
  const cssPath = path.join(__dirname, '../ui/css/audit.css');
  assert(fs.existsSync(cssPath), 'ui/css/audit.css must exist');
  const cssContent = fs.readFileSync(cssPath, 'utf8');

  const requiredVerificationSelectors = [
    '.btn-verify-chain',
    '.audit-verification-card',
    '.audit-verification-verified',
    '.audit-verification-tampered',
    '.badge-integrity-verified',
    '.badge-integrity-failed',
    '.audit-verified-head-box',
    '.audit-head-label',
    '.audit-head-match-status',
    '.audit-match-icon',
    '.audit-verification-checklist',
    '.audit-broken-chain-details',
    '.audit-verification-loading',
    '.spinner-sm'
  ];

  for (const sel of requiredVerificationSelectors) {
    assert(cssContent.includes(sel), `CSS must define selector: ${sel}`);
  }

  console.log('✓ Loading state and ui/css/audit.css verification stylesheet rules verified');

  console.log('\n======================================================');
  console.log('✓ ALL 7 STEP 49 VERIFICATION CHECKS PASSED SUCCESSFULLY');
  console.log('======================================================');
})().catch(err => {
  console.error(err);
  process.exit(1);
});
