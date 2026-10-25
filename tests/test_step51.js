/**
 * Test Step 51: External Anchor Checkpoint Creation Form
 * Spec Reference: ROADMAP.md (Phase 9: Step 51), Guide §15.1
 *
 * Verifies:
 * 1. Checkpoint Creation Form Layout & Authorized Officer Role Presentation:
 *    - #audit-checkpoint-creation-bar renders with senior officer authorization badge.
 *    - Displays authorized key ID (aicte-ed25519-2026-demo).
 *    - Renders action button #btn-create-checkpoint.
 * 2. Specific Verification Requirement:
 *    - Clicking create generates new signed checkpoint that appears immediately in checkpoint list (#audit-checkpoint-list).
 *    - New checkpoint card renders with valid Ed25519 signature match status.
 * 3. Checkpoint Creation Event Lifecycle:
 *    - Dispatches app:checkpoint-creation-started upon click.
 *    - Dispatches app:checkpoint-created with new checkpoint payload upon completion.
 * 4. Top Statistics Grid Synchronization:
 *    - Card 4 (#audit-checkpoint-status-badge) updates to reflect newly anchored event height.
 * 5. Creation Feedback Notification:
 *    - Renders #audit-checkpoint-create-feedback with formatted confirmation message.
 * 6. Button Loading State & Re-entrancy Protection:
 *    - isCreatingCheckpoint disables button and displays "Signing Checkpoint...".
 * 7. CSS Stylesheet Integration:
 *    - ui/css/audit.css defines all required creation bar and button selectors.
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
  console.log('--- Running Step 51 Test Suite: External Anchor Checkpoint Creation Form ---');

  // ============================================================================
  // Test 1: Checkpoint Creation Form Layout & Authorized Officer Role Presentation
  // ============================================================================
  console.log('Test 1: Checkpoint Creation Form Layout & Authorized Officer Role Presentation');
  assert(auditViewComponent, 'AuditViewComponent singleton instance must exist');

  // Render initial section
  auditViewComponent.checkpoints = [auditViewComponent.getDefaultCheckpoint()];
  auditViewComponent.checkpointCreateFeedback = null;
  const initialHtml = auditViewComponent.renderCheckpointSection();

  assert(initialHtml.includes('id="audit-checkpoint-creation-bar"'), 'Must render #audit-checkpoint-creation-bar');
  assert(initialHtml.includes('id="badge-officer-checkpoint-auth"'), 'Must render senior officer authorization badge');
  assert(initialHtml.includes('AUTHORIZED SENIOR OFFICER ROLE'), 'Must display AUTHORIZED SENIOR OFFICER ROLE text');
  assert(initialHtml.includes('id="audit-checkpoint-auth-key"'), 'Must render signing key ID indicator');
  assert(initialHtml.includes('aicte-ed25519-2026-demo'), 'Must specify demo key ID');
  assert(initialHtml.includes('id="btn-create-checkpoint"'), 'Must render #btn-create-checkpoint button');
  assert(initialHtml.includes('Create Signed Checkpoint'), 'Button must display Create Signed Checkpoint text');

  console.log('✓ Checkpoint creation form layout and senior officer authorization bar verified');

  // ============================================================================
  // Test 2: Specific Verification Requirement
  // "Clicking create generates new signed checkpoint that appears immediately in checkpoint list."
  // ============================================================================
  console.log('Test 2: Specific Verification Requirement: Clicking create generates new signed checkpoint appearing immediately in list');
  eventsDispatched.length = 0;
  createMockElement('audit-checkpoint-section');
  createMockElement('audit-checkpoint-status-badge');

  const initialCount = auditViewComponent.checkpoints.length;

  // Execute checkpoint creation
  const newCp = await auditViewComponent.createCheckpoint('aicte-ed25519-2026-demo');

  assert(newCp, 'createCheckpoint must return newly created checkpoint object');
  assert(newCp.id.startsWith('chk-'), 'New checkpoint ID must start with chk-');
  assert(typeof newCp.upto_id === 'number', 'New checkpoint upto_id must be numeric');
  assert.strictEqual(newCp.head_hash.length, 64, 'New checkpoint head_hash must be 64-char hex SHA-256 string');
  assert.strictEqual(newCp.signature.length, 128, 'New checkpoint signature must be 128 hex chars (64 bytes)');
  assert.strictEqual(newCp.key_id, 'aicte-ed25519-2026-demo', 'New checkpoint key_id must match demo key');

  // Verify list count increased
  assert.strictEqual(
    auditViewComponent.checkpoints.length,
    initialCount + 1,
    'Checkpoints array must have 1 additional item'
  );

  // Verify new checkpoint is first in list (unshifted)
  assert.strictEqual(auditViewComponent.checkpoints[0].id, newCp.id, 'New checkpoint must be placed at top of list');

  // Verify rendered HTML immediately contains new checkpoint card
  const refreshedHtml = auditViewComponent.renderCheckpointSection();
  assert(refreshedHtml.includes(`id="card-checkpoint-${newCp.id}"`), 'Must render card for newly created checkpoint');
  assert(refreshedHtml.includes(`id="cp-id-${newCp.id}"`), 'Must render checkpoint ID element');
  assert(refreshedHtml.includes(`id="cp-sig-${newCp.id}"`), 'Must render 64-byte signature hex element');
  assert(refreshedHtml.includes(`id="badge-sig-status-${newCp.id}"`), 'Must render signature status badge for new checkpoint');
  assert(refreshedHtml.includes('SIGNATURE MATCH: VALID'), 'New checkpoint signature must be verified as valid');

  console.log('✓ Specific verification requirement satisfied: New signed checkpoint generated and rendered immediately in list');

  // ============================================================================
  // Test 3: Checkpoint Creation Event Lifecycle
  // ============================================================================
  console.log('Test 3: Checkpoint Creation Event Lifecycle');
  const startedEvent = eventsDispatched.find(e => e.type === 'app:checkpoint-creation-started');
  assert(startedEvent, 'createCheckpoint must dispatch app:checkpoint-creation-started');
  assert.strictEqual(startedEvent.detail.keyId, 'aicte-ed25519-2026-demo');

  const createdEvent = eventsDispatched.find(e => e.type === 'app:checkpoint-created');
  assert(createdEvent, 'createCheckpoint must dispatch app:checkpoint-created');
  assert.strictEqual(createdEvent.detail.checkpoint.id, newCp.id);
  assert.strictEqual(createdEvent.detail.totalCheckpoints, auditViewComponent.checkpoints.length);

  console.log('✓ Checkpoint creation lifecycle events dispatched properly');

  // ============================================================================
  // Test 4: Top Statistics Grid Synchronization
  // ============================================================================
  console.log('Test 4: Top Statistics Grid Synchronization');
  assert.strictEqual(auditViewComponent.latestCheckpoint.id, newCp.id, 'latestCheckpoint must be updated to new checkpoint');
  const statusBadgeEl = document.getElementById('audit-checkpoint-status-badge');
  assert(statusBadgeEl.textContent.includes('ANCHORED'), 'Status badge must reflect ANCHORED status');
  console.log('✓ Top statistics grid synchronized with newly anchored checkpoint');

  // ============================================================================
  // Test 5: Creation Feedback Notification Banner
  // ============================================================================
  console.log('Test 5: Creation Feedback Notification Banner');
  assert(refreshedHtml.includes('id="audit-checkpoint-create-feedback"'), 'Must render feedback container');
  assert(refreshedHtml.includes('id="audit-checkpoint-create-msg"'), 'Must render feedback message');
  assert(refreshedHtml.includes(newCp.id), 'Feedback message must cite new checkpoint ID');
  assert(refreshedHtml.includes(`anchored up to event #${newCp.upto_id}`), 'Feedback message must cite anchored event height');
  console.log('✓ Checkpoint creation feedback notification verified');

  // ============================================================================
  // Test 6: Button Loading State & Re-entrancy Protection
  // ============================================================================
  console.log('Test 6: Button Loading State & Re-entrancy Protection');
  auditViewComponent.isCreatingCheckpoint = true;
  const loadingHtml = auditViewComponent.renderCheckpointSection();
  assert(loadingHtml.includes('disabled'), 'Button must be disabled when isCreatingCheckpoint is true');
  assert(loadingHtml.includes('Signing Checkpoint...'), 'Button text must indicate Signing Checkpoint...');
  auditViewComponent.isCreatingCheckpoint = false;
  console.log('✓ Button loading state and re-entrancy protection verified');

  // ============================================================================
  // Test 7: CSS Stylesheet Integration
  // ============================================================================
  console.log('Test 7: CSS Stylesheet Integration');
  const cssPath = path.join(__dirname, '../ui/css/audit.css');
  assert(fs.existsSync(cssPath), 'ui/css/audit.css must exist');
  const cssContent = fs.readFileSync(cssPath, 'utf8');

  const requiredCreationSelectors = [
    '.audit-checkpoint-creation-bar',
    '.audit-checkpoint-creation-info',
    '.badge-officer',
    '.btn-create-checkpoint',
    '.audit-checkpoint-feedback'
  ];

  for (const sel of requiredCreationSelectors) {
    assert(cssContent.includes(sel), `CSS must define selector: ${sel}`);
  }

  console.log('✓ ui/css/audit.css checkpoint creation stylesheet rules verified');

  console.log('\n======================================================');
  console.log('✓ ALL 7 STEP 51 VERIFICATION CHECKS PASSED SUCCESSFULLY');
  console.log('======================================================');
})().catch(err => {
  console.error(err);
  process.exit(1);
});
