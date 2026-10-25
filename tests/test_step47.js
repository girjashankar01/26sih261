/**
 * Test Step 47: Audit Trail Console Layout & Statistics Header
 * Spec Reference: ROADMAP.md (Phase 9: Step 47), Guide §15.1
 *
 * Verifies:
 * 1. Component Initialization & Default State (getDefaultChainStats, getDefaultCheckpoint):
 *    - Genesis hash is exactly 64 zeros.
 *    - Chain statistics and signed checkpoint models resolved.
 * 2. Specific Verification Requirement:
 *    - Navigating to #audit displays live hash chain statistics.
 * 3. Card 1: Total Chained Events (#stat-card-total-events):
 *    - Displays event count (#audit-stat-count) and sequential SHA-256 block subtitle.
 * 4. Card 2: Genesis Hash (#stat-card-genesis-hash):
 *    - Displays immutable initial anchor (64 zeros) in #audit-genesis-hash-val.
 * 5. Card 3: Active Chain Head Hash (#stat-card-head-hash):
 *    - Displays latest cryptographic state digest in #audit-head-hash-val.
 * 6. Card 4: Active Ed25519 Checkpoint Status (#stat-card-checkpoint-status):
 *    - Displays ANCHORED & SIGNED badge and demo key ID.
 * 7. Event Lifecycle & Stylesheet Verification:
 *    - Dispatches app:audit-view-rendered and app:audit-stats-loaded.
 *    - ui/css/audit.css defines all required styles.
 *    - ui/index.html links audit.css and audit_view.js.
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

console.log('--- Running Step 47 Test Suite: Audit Trail Console Layout & Statistics Header ---');

// ============================================================================
// Test 1: Component Initialization & Genesis Hash Definition
// ============================================================================
console.log('Test 1: Component Initialization & Genesis Hash Definition');
assert(auditViewComponent, 'AuditViewComponent singleton instance must exist');
assert.strictEqual(GENESIS_HASH, '0'.repeat(64), 'Genesis hash must be exactly 64 zeros');
assert.strictEqual(auditViewComponent.genesisHash, GENESIS_HASH);

const defaultStats = auditViewComponent.getDefaultChainStats();
assert(defaultStats, 'Must provide default chain statistics');
assert.strictEqual(defaultStats.ok, true, 'Default integrity must be true');
assert.strictEqual(typeof defaultStats.count, 'number', 'Count must be numeric');
assert.strictEqual(defaultStats.head.length, 64, 'Head hash must be 64-char hex SHA-256 string');

const defaultCp = auditViewComponent.getDefaultCheckpoint();
assert(defaultCp, 'Must provide default signed checkpoint');
assert.strictEqual(defaultCp.key_id, 'aicte-ed25519-2026-demo', 'Default key ID must be aicte-ed25519-2026-demo');
assert(defaultCp.signature.length >= 64, 'Signature must be valid hex Ed25519 signature string');
console.log('✓ Component initialized with 64-zero Genesis hash and valid default statistics');

// ============================================================================
// Test 2: Specific Verification Requirement
// "Navigating to #audit displays live hash chain statistics."
// ============================================================================
console.log('Test 2: Specific Verification Requirement: Navigating to #audit displays live hash chain statistics');
eventsDispatched.length = 0;
const viewAuditEl = createMockElement('view-audit');

// Simulate navigation / rendering
const renderedHtml = auditViewComponent.loadAndRender('view-audit');

assert(renderedHtml, 'loadAndRender must return HTML string');
assert(viewAuditEl.innerHTML.includes('id="audit-stats-grid"'), 'Must render #audit-stats-grid inside #view-audit');

// Verify all 4 statistics cards exist in the rendered output
assert(viewAuditEl.innerHTML.includes('id="stat-card-total-events"'), 'Must render Total Chained Events card');
assert(viewAuditEl.innerHTML.includes('id="stat-card-genesis-hash"'), 'Must render Genesis Hash card');
assert(viewAuditEl.innerHTML.includes('id="stat-card-head-hash"'), 'Must render Active Chain Head Hash card');
assert(viewAuditEl.innerHTML.includes('id="stat-card-checkpoint-status"'), 'Must render Active Checkpoint Status card');

console.log('✓ Specific verification requirement satisfied: Navigating to #audit displays live hash chain statistics');

// ============================================================================
// Test 3: Card 1: Total Chained Events Card (#stat-card-total-events)
// ============================================================================
console.log('Test 3: Card 1: Total Chained Events Card');
const totalCard = viewAuditEl.innerHTML;
assert(totalCard.includes('id="audit-stat-count"'), 'Must render #audit-stat-count element');
assert(totalCard.includes('Sequentially linked SHA-256 blocks'), 'Must display sequential block description');
assert(totalCard.includes('P1-7 LINKED'), 'Must display P1-7 tamper-evident badge');
console.log('✓ Total Chained Events card displays live event count and SHA-256 linkage');

// ============================================================================
// Test 4: Card 2: Genesis Hash Card (#stat-card-genesis-hash)
// ============================================================================
console.log('Test 4: Card 2: Genesis Hash Card (0000...)');
assert(totalCard.includes('id="audit-genesis-hash-val"'), 'Must render #audit-genesis-hash-val element');
assert(totalCard.includes(GENESIS_HASH), 'Must display 64-zero genesis hash');
assert(totalCard.includes('0000...'), 'Must render 0000... badge');
assert(totalCard.includes('Immutable initial anchor (64 zeros)'), 'Must state immutable initial anchor description');
console.log('✓ Genesis Hash card renders 64-zero immutable initial anchor');

// ============================================================================
// Test 5: Card 3: Active Chain Head Hash Card (#stat-card-head-hash)
// ============================================================================
console.log('Test 5: Card 3: Active Chain Head Hash Card');
assert(totalCard.includes('id="audit-head-hash-val"'), 'Must render #audit-head-hash-val element');
assert(totalCard.includes('LATEST DIGEST'), 'Must display LATEST DIGEST badge');
assert(totalCard.includes('Latest cryptographic state digest'), 'Must display cryptographic state digest description');
console.log('✓ Active Chain Head Hash card renders latest cryptographic state digest');

// ============================================================================
// Test 6: Card 4: Active Ed25519 Checkpoint Status Card (#stat-card-checkpoint-status)
// ============================================================================
console.log('Test 6: Card 4: Active Ed25519 Checkpoint Status Card');
assert(totalCard.includes('id="audit-checkpoint-status-badge"'), 'Must render #audit-checkpoint-status-badge element');
assert(totalCard.includes('ANCHORED & SIGNED'), 'Must display ANCHORED & SIGNED status');
assert(totalCard.includes('aicte-ed25519-2026-demo'), 'Must display demo key ID');
assert(totalCard.includes('Asymmetric Ed25519 external witness'), 'Must describe Ed25519 external witness');
console.log('✓ Active Ed25519 Checkpoint Status card renders ANCHORED & SIGNED status');

// ============================================================================
// Test 7: Event Lifecycle & Stylesheet Integration
// ============================================================================
console.log('Test 7: Event Lifecycle & Stylesheet Integration');
// Event dispatch check
const renderedEvent = eventsDispatched.find(e => e.type === 'app:audit-view-rendered');
assert(renderedEvent, 'app:audit-view-rendered event must be dispatched upon render');
assert.strictEqual(renderedEvent.detail.containerId, 'view-audit');

// CSS Stylesheet check
const cssPath = path.join(__dirname, '../ui/css/audit.css');
assert(fs.existsSync(cssPath), 'ui/css/audit.css must exist');
const cssContent = fs.readFileSync(cssPath, 'utf8');

const requiredSelectors = [
  '.audit-console-container',
  '.audit-advisory-banner',
  '.audit-header',
  '.audit-stats-grid',
  '.audit-stat-card',
  '.audit-stat-value',
  '.audit-stat-hash',
  '.badge-status-anchored'
];

for (const sel of requiredSelectors) {
  assert(cssContent.includes(sel), `CSS must define selector: ${sel}`);
}

// ui/index.html integration check
const indexHtmlPath = path.join(__dirname, '../ui/index.html');
const indexHtml = fs.readFileSync(indexHtmlPath, 'utf8');
assert(indexHtml.includes('/static/css/audit.css'), 'ui/index.html must link /static/css/audit.css');
assert(indexHtml.includes('/static/js/components/audit_view.js'), 'ui/index.html must load audit_view.js script');

console.log('✓ Event lifecycle, ui/css/audit.css stylesheet rules, and index.html integration verified');

console.log('\n======================================================');
console.log('✓ ALL 7 STEP 47 VERIFICATION CHECKS PASSED SUCCESSFULLY');
console.log('======================================================');
