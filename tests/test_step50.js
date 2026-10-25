/**
 * Test Step 50: Ed25519 Checkpoint Card & Signature Validator
 * Spec Reference: ROADMAP.md (Phase 9: Step 50), Guide §15.1
 *
 * Verifies:
 * 1. Default Checkpoint Model & Cryptographic Signature Validation:
 *    - getDefaultCheckpoint returns valid checkpoint object.
 *    - Signature is strictly 64 bytes (128 hex characters).
 *    - verifyCheckpointSignature returns valid: true with statusText 'SIGNATURE MATCH: VALID'.
 * 2. Specific Verification Requirement:
 *    - Checkpoint card displays: Checkpoint ID, Event Count upto_id, Anchored Head Hash, 64-byte Ed25519 signature hex, and trusted public key confirmation (aicte-ed25519-2026-demo.pub).
 *    - Checkpoint card displays cryptographic signature match status (#badge-sig-status-X, badge-signature-valid).
 * 3. Fail-Visible Signature Validation on Tampering:
 *    - Corrupted signature or untrusted key_id fails validator (valid: false, statusText: 'SIGNATURE MISMATCH: INVALID').
 *    - Rendered card displays badge-signature-invalid.
 * 4. Signature Clipboard Copy Interaction:
 *    - copyHash with 128-char signature dispatches app:hash-copied.
 * 5. Checkpoint Fetch & Event Lifecycle:
 *    - fetchCheckpoints populates this.checkpoints and dispatches app:audit-checkpoints-loaded.
 *    - loadAndRender dispatches app:audit-checkpoints-rendered.
 * 6. Multi-Checkpoint List Rendering:
 *    - renderCheckpointSection renders all checkpoint cards inside #audit-checkpoint-list.
 *    - Refresh button #btn-refresh-checkpoints present.
 * 7. CSS Stylesheet Integration:
 *    - ui/css/audit.css defines all required checkpoint card and validator selectors.
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

// Mock clipboard
Object.defineProperty(globalThis, 'navigator', {
  value: {
    clipboard: {
      writeText: async (text) => {
        global.lastCopied = text;
        return Promise.resolve();
      }
    }
  },
  configurable: true,
  writable: true
});

// Load Component
const { AuditViewComponent, auditViewComponent } = require('../ui/js/components/audit_view.js');

(async () => {
  console.log('--- Running Step 50 Test Suite: Ed25519 Checkpoint Card & Signature Validator ---');

  // ============================================================================
  // Test 1: Default Checkpoint Model & Cryptographic Signature Validation
  // ============================================================================
  console.log('Test 1: Default Checkpoint Model & Cryptographic Signature Validation');
  assert(auditViewComponent, 'AuditViewComponent singleton instance must exist');

  const defaultCp = auditViewComponent.getDefaultCheckpoint();
  assert(defaultCp, 'getDefaultCheckpoint must return checkpoint object');
  assert(defaultCp.id.startsWith('chk-'), 'Checkpoint ID must start with chk-');
  assert.strictEqual(typeof defaultCp.upto_id, 'number', 'upto_id must be a number');
  assert.strictEqual(defaultCp.head_hash.length, 64, 'head_hash must be a 64-char hex SHA-256 string');
  assert.strictEqual(defaultCp.signature.length, 128, 'signature must be exactly 128 hex chars (64 bytes)');
  assert.strictEqual(defaultCp.key_id, 'aicte-ed25519-2026-demo', 'key_id must be aicte-ed25519-2026-demo');

  const sigCheck = auditViewComponent.verifyCheckpointSignature(defaultCp);
  assert.strictEqual(sigCheck.valid, true, 'Default checkpoint signature must be valid');
  assert.strictEqual(sigCheck.status, 'MATCH');
  assert.strictEqual(sigCheck.statusText, 'SIGNATURE MATCH: VALID');
  assert.strictEqual(sigCheck.pubkey_file, 'aicte-ed25519-2026-demo.pub');
  assert.strictEqual(sigCheck.signature_bytes, 64);

  console.log('✓ Default checkpoint model and Ed25519 signature validator verified');

  // ============================================================================
  // Test 2: Specific Verification Requirement
  // "Checkpoint card displays cryptographic signature match status."
  // Shows: Checkpoint ID, Event Count upto_id, Anchored Head Hash,
  // 64-byte Ed25519 signature hex, and trusted public key confirmation (aicte-ed25519-2026-demo.pub).
  // ============================================================================
  console.log('Test 2: Specific Verification Requirement: Checkpoint card displays cryptographic signature match status');
  const cardHtml = auditViewComponent.renderCheckpointCard(defaultCp);

  // 1. Checkpoint ID
  assert(cardHtml.includes(`id="cp-id-${defaultCp.id}"`), 'Must render Checkpoint ID element');
  assert(cardHtml.includes(defaultCp.id), 'Must display exact Checkpoint ID');

  // 2. Event Count upto_id
  assert(cardHtml.includes(`id="cp-upto-${defaultCp.id}"`), 'Must render upto_id element');
  assert(cardHtml.includes(`upto_id: ${defaultCp.upto_id}`), 'Must display upto_id count');

  // 3. Anchored Head Hash
  assert(cardHtml.includes(`id="cp-head-${defaultCp.id}"`), 'Must render Anchored Head Hash element');
  assert(cardHtml.includes(`data-hash="${defaultCp.head_hash}"`), 'Must store head_hash in data-hash');

  // 4. 64-byte Ed25519 signature hex (128 hex chars)
  assert(cardHtml.includes(`id="cp-sig-${defaultCp.id}"`), 'Must render 64-byte signature hex element');
  assert(cardHtml.includes(`data-sig="${defaultCp.signature}"`), 'Must store 128-char hex in data-sig');
  assert(cardHtml.includes(defaultCp.signature), 'Must render full signature hex string');

  // 5. Trusted public key confirmation (aicte-ed25519-2026-demo.pub)
  assert(cardHtml.includes(`id="cp-key-${defaultCp.id}"`), 'Must render public key confirmation element');
  assert(cardHtml.includes('aicte-ed25519-2026-demo.pub'), 'Must confirm aicte-ed25519-2026-demo.pub');

  // 6. Cryptographic signature match status
  assert(cardHtml.includes(`id="cp-sig-status-${defaultCp.id}"`), 'Must render signature status group');
  assert(cardHtml.includes(`id="badge-sig-status-${defaultCp.id}"`), 'Must render signature status badge');
  assert(cardHtml.includes('badge-signature-valid'), 'Must have badge-signature-valid class');
  assert(cardHtml.includes('SIGNATURE MATCH: VALID'), 'Must display SIGNATURE MATCH: VALID status');

  console.log('✓ Specific verification requirement satisfied: Checkpoint card renders all required fields and valid signature status');

  // ============================================================================
  // Test 3: Fail-Visible Signature Validation on Tampering
  // ============================================================================
  console.log('Test 3: Fail-Visible Signature Validation on Tampering');
  // Mutated signature
  const tamperedSigCp = {
    ...defaultCp,
    id: 'chk-tampered-sig',
    signature: 'deadbeef'.repeat(4) // 32 hex chars, not 128
  };
  const badSigCheck = auditViewComponent.verifyCheckpointSignature(tamperedSigCp);
  assert.strictEqual(badSigCheck.valid, false, 'Mutated signature must fail verification');
  assert.strictEqual(badSigCheck.status, 'MISMATCH');
  assert.strictEqual(badSigCheck.statusText, 'SIGNATURE MISMATCH: INVALID');

  const badCardHtml = auditViewComponent.renderCheckpointCard(tamperedSigCp);
  assert(badCardHtml.includes('badge-signature-invalid'), 'Tampered card must render badge-signature-invalid class');
  assert(badCardHtml.includes('SIGNATURE MISMATCH: INVALID'), 'Tampered card must display SIGNATURE MISMATCH: INVALID');

  // Untrusted key
  const untrustedKeyCp = {
    ...defaultCp,
    id: 'chk-untrusted-key',
    key_id: 'rogue-key-id-999'
  };
  const untrustedCheck = auditViewComponent.verifyCheckpointSignature(untrustedKeyCp);
  assert.strictEqual(untrustedCheck.valid, false, 'Untrusted key must fail verification');

  console.log('✓ Fail-visible signature validation verified against corrupted signatures and untrusted keys');

  // ============================================================================
  // Test 4: Signature Clipboard Copy Interaction
  // ============================================================================
  console.log('Test 4: Signature Clipboard Copy Interaction');
  eventsDispatched.length = 0;
  auditViewComponent.copyHash(defaultCp.signature);
  assert.strictEqual(global.lastCopied, defaultCp.signature, 'Clipboard writeText must receive full 128-char signature');
  const copyEvent = eventsDispatched.find(e => e.type === 'app:hash-copied');
  assert(copyEvent, 'copyHash must dispatch app:hash-copied');
  assert.strictEqual(copyEvent.detail.hash, defaultCp.signature);
  assert(cardHtml.includes(`id="btn-copy-sig-${defaultCp.id}"`), 'Must render copy signature button');
  console.log('✓ Signature clipboard copy interaction verified');

  // ============================================================================
  // Test 5: Checkpoint Fetch & Event Lifecycle
  // ============================================================================
  console.log('Test 5: Checkpoint Fetch & Event Lifecycle');
  eventsDispatched.length = 0;
  const fetchedList = await auditViewComponent.fetchCheckpoints();
  assert(Array.isArray(fetchedList), 'fetchCheckpoints must return an array');
  assert(fetchedList.length > 0, 'Must have at least one checkpoint in list');

  const loadedEvent = eventsDispatched.find(e => e.type === 'app:audit-checkpoints-loaded');
  assert(loadedEvent, 'fetchCheckpoints must dispatch app:audit-checkpoints-loaded');
  assert.strictEqual(loadedEvent.detail.latestId, fetchedList[0].id);

  // loadAndRender event check
  createMockElement('view-audit');
  auditViewComponent.loadAndRender('view-audit');
  const renderedEvent = eventsDispatched.find(e => e.type === 'app:audit-checkpoints-rendered');
  assert(renderedEvent, 'loadAndRender must dispatch app:audit-checkpoints-rendered');

  console.log('✓ Checkpoint fetch, data caching, and lifecycle events verified');

  // ============================================================================
  // Test 6: Multi-Checkpoint Section Rendering
  // ============================================================================
  console.log('Test 6: Multi-Checkpoint Section Rendering');
  const secondCp = {
    id: 'chk-24-17cd2253',
    upto_id: 24,
    head_hash: 'fb6cba352483b80b280fb2491c2e09fc7cb099fbc5dc56eb27a57718d364ced8',
    signature: 'a6362e7dfe50c2b9153e223ad3fd7d89cf10dfe5ad62c1a35cb1985c459b039f4de870c986f6145a4295009afde74d4ef2352f021eb9cc2170ade1e337e4cd0f',
    key_id: 'aicte-ed25519-2026-demo',
    created_at: new Date().toISOString()
  };

  const sectionHtml = auditViewComponent.renderCheckpointSection([defaultCp, secondCp]);
  assert(sectionHtml.includes('id="audit-checkpoint-list"'), 'Must render #audit-checkpoint-list container');
  assert(sectionHtml.includes(`id="card-checkpoint-${defaultCp.id}"`), 'Must render first checkpoint card');
  assert(sectionHtml.includes(`id="card-checkpoint-${secondCp.id}"`), 'Must render second checkpoint card');
  assert(sectionHtml.includes('id="btn-refresh-checkpoints"'), 'Must render refresh checkpoints button');
  assert(sectionHtml.includes('aicte-ed25519-2026-demo.pub'), 'Section description must cite public key');

  console.log('✓ Multi-checkpoint section and list container verified');

  // ============================================================================
  // Test 7: CSS Stylesheet Integration
  // ============================================================================
  console.log('Test 7: CSS Stylesheet Integration');
  const cssPath = path.join(__dirname, '../ui/css/audit.css');
  assert(fs.existsSync(cssPath), 'ui/css/audit.css must exist');
  const cssContent = fs.readFileSync(cssPath, 'utf8');

  const requiredCheckpointSelectors = [
    '.audit-checkpoint-actions',
    '.audit-checkpoint-list',
    '.audit-checkpoint-card',
    '.audit-checkpoint-header',
    '.audit-checkpoint-id',
    '.audit-sig-status-group',
    '.badge-signature-valid',
    '.badge-signature-invalid',
    '.audit-checkpoint-grid',
    '.audit-checkpoint-field',
    '.audit-checkpoint-label',
    '.audit-checkpoint-val',
    '.audit-pubkey-pill',
    '.audit-sig-hex-box',
    '.audit-checkpoint-footer'
  ];

  for (const sel of requiredCheckpointSelectors) {
    assert(cssContent.includes(sel), `CSS must define selector: ${sel}`);
  }

  console.log('✓ ui/css/audit.css checkpoint stylesheet rules verified');

  console.log('\n======================================================');
  console.log('✓ ALL 7 STEP 50 VERIFICATION CHECKS PASSED SUCCESSFULLY');
  console.log('======================================================');
})().catch(err => {
  console.error(err);
  process.exit(1);
});
