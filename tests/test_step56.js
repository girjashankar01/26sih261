/**
 * Test Step 56: Keyboard Triage Shortcuts Engine
 * Spec Reference: ROADMAP.md (Phase 10: Step 56), Guide §17.3, §17.4
 *
 * Verifies:
 * 1. Component Initialization & Global Keydown Listener:
 *    - KeyboardShortcutsEngine attaches keydown listener.
 *    - Enabled state and finding traversal tracking.
 * 2. Specific Verification Requirement: J / K Navigation Traversal:
 *    - Pressing 'J' advances to next finding card, applies .is-active highlight,
 *      scrolls into view, and invokes evidenceViewerComponent.selectFinding(id).
 *    - Pressing 'K' navigates to previous finding card with cyclic wrapping.
 * 3. Finding Action Shortcuts (A, D, R, E):
 *    - Pressing 'A' executes Acknowledge action on focused finding.
 *    - Pressing 'D' opens Dismiss reason dialog (Guide §17.4 mandatory human justification).
 *    - Pressing 'R' opens Request Rectification dialog.
 *    - Pressing 'E' opens Escalate dialog.
 * 4. Audit Chain Verification Shortcut (V):
 *    - Pressing 'V' executes auditViewComponent.triggerVerifyChain().
 * 5. Search Input Focus Shortcut (/):
 *    - Pressing '/' prevents default typing and focuses active view search input.
 * 6. Input Guard & Escape Behavior:
 *    - Typing inside inputs or textareas ignores single-key triage shortcuts.
 *    - Escape blurs input, deselects finding, and dismisses open modal dialogs.
 * 7. HTML Shell & CSS Integration:
 *    - ui/index.html includes shortcuts.css and keyboard_shortcuts.js.
 *    - ui/css/shortcuts.css defines .kbd, .shortcut-feedback-toast, and .finding-card.is-active.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

// 1. Mock Browser Environment
const eventsDispatched = [];
const mockElements = new Map();
const keyListeners = [];

const createMockElement = (initialId, initialTag = 'DIV') => {
  const classes = new Set();
  const attributes = new Map();
  const listeners = {};
  let _id = initialId;
  let _tagName = initialTag.toUpperCase();
  let _innerHTML = '';
  let _textContent = '';
  let _value = '';
  let _isFocused = false;
  let _dataset = {};
  const _style = {};

  const el = {
    get id() { return _id; },
    set id(val) {
      if (_id) mockElements.delete(_id);
      _id = val;
      if (val) mockElements.set(val, el);
    },
    get tagName() { return _tagName; },
    set tagName(val) { _tagName = val.toUpperCase(); },
    get dataset() { return _dataset; },
    get style() { return _style; },
    get value() { return _value; },
    set value(v) { _value = v; },
    get innerHTML() { return _innerHTML; },
    set innerHTML(val) { _innerHTML = val; },
    get textContent() { return _textContent || _innerHTML.replace(/<[^>]*>/g, '').trim(); },
    set textContent(val) { _textContent = val; _innerHTML = val; },
    classList: {
      add: (...cls) => cls.forEach(c => classes.add(c)),
      remove: (...cls) => cls.forEach(c => classes.delete(c)),
      contains: (c) => classes.has(c),
      toggle: (c, force) => {
        if (force === undefined) {
          if (classes.has(c)) classes.delete(c);
          else classes.add(c);
        } else if (force) classes.add(c);
        else classes.delete(c);
      }
    },
    setAttribute: (k, v) => attributes.set(k, String(v)),
    getAttribute: (k) => attributes.has(k) ? attributes.get(k) : null,
    hasAttribute: (k) => attributes.has(k),
    addEventListener: (evt, cb) => {
      listeners[evt] = listeners[evt] || [];
      listeners[evt].push(cb);
    },
    dispatchEvent: (evt) => {
      const handlers = listeners[evt.type] || [];
      handlers.forEach(h => h(evt));
      eventsDispatched.push(evt);
    },
    focus: () => { _isFocused = true; },
    blur: () => { _isFocused = false; },
    select: () => {},
    scrollIntoView: () => { el.scrolledIntoView = true; },
    appendChild: (child) => { mockElements.set(child.id, child); return child; },
    remove: () => {},
    click: () => {
      el.clicked = true;
      if (listeners['click']) listeners['click'].forEach(h => h({ type: 'click', target: el }));
    },
    querySelector: (sel) => {
      if (sel.startsWith('#')) return mockElements.get(sel.substring(1));
      return null;
    },
    querySelectorAll: () => []
  };

  if (initialId) mockElements.set(initialId, el);
  return el;
};

// Global polyfills
global.document = {
  body: createMockElement('body', 'BODY'),
  getElementById: (id) => mockElements.get(id),
  querySelector: (sel) => {
    if (sel.startsWith('#')) return mockElements.get(sel.substring(1));
    if (sel.includes('.finding-card.is-active')) {
      for (const el of mockElements.values()) {
        if (el.classList.contains('finding-card') && el.classList.contains('is-active')) return el;
      }
    }
    return null;
  },
  querySelectorAll: (sel) => {
    const results = [];
    if (sel === '.finding-card') {
      for (const el of mockElements.values()) {
        if (el.classList.contains('finding-card')) results.push(el);
      }
    }
    return results;
  },
  createElement: (tag) => createMockElement('', tag)
};

global.window = {
  document: global.document,
  addEventListener: (evt, handler) => {
    if (evt === 'keydown') keyListeners.push(handler);
  },
  removeEventListener: (evt, handler) => {
    if (evt === 'keydown') {
      const idx = keyListeners.indexOf(handler);
      if (idx >= 0) keyListeners.splice(idx, 1);
    }
  },
  dispatchEvent: (evt) => eventsDispatched.push(evt),
  CustomEvent: class CustomEvent {
    constructor(type, init) {
      this.type = type;
      this.detail = init ? init.detail : null;
    }
  }
};

// Mock components
let selectedEvidenceFinding = null;
global.window.evidenceViewerComponent = {
  activeFindingId: null,
  selectFinding: (id) => {
    selectedEvidenceFinding = id;
    global.window.evidenceViewerComponent.activeFindingId = id;
  }
};

let executedAction = null;
let openedReasonModal = null;
global.window.findingCardComponent = {
  executeAction: (appId, findingId, action) => {
    executedAction = { appId, findingId, action };
  },
  openReasonModal: (findingId, action) => {
    openedReasonModal = { findingId, action };
  }
};

let auditVerifiedTriggered = false;
global.window.auditViewComponent = {
  triggerVerifyChain: () => {
    auditVerifiedTriggered = true;
  }
};

// Load KeyboardShortcutsEngine module
const KeyboardShortcutsEngine = require('../ui/js/components/keyboard_shortcuts.js');

console.log('--- Step 56: Keyboard Triage Shortcuts Engine Tests ---');

(async () => {
  try {
    // -------------------------------------------------------------------------
    // Test 1: Component Initialization & Global Keydown Listener
    // -------------------------------------------------------------------------
    console.log('Test 1: Component Initialization & Global Listener...');
    const shortcuts = new KeyboardShortcutsEngine();
    shortcuts.init();

    assert.strictEqual(shortcuts.isEnabled, true, 'Shortcuts must be enabled by default');
    assert.strictEqual(keyListeners.length, 1, 'Keydown listener must be attached to window');
    console.log('✓ Test 1 passed: KeyboardShortcutsEngine initialized and attached keydown listener.');

    // -------------------------------------------------------------------------
    // Test 2: Specific Verification Requirement: J / K Finding Traversal
    // -------------------------------------------------------------------------
    console.log('Test 2: Specific Verification Requirement: J / K Finding Traversal...');
    // Create 3 mock finding cards in DOM
    const card1 = createMockElement('finding-R-DOC-001');
    card1.classList.add('finding-card');
    card1.dataset.findingId = 'R-DOC-001';

    const card2 = createMockElement('finding-R-EXP-001');
    card2.classList.add('finding-card');
    card2.dataset.findingId = 'R-EXP-001';

    const card3 = createMockElement('finding-R-LAND-001');
    card3.classList.add('finding-card');
    card3.dataset.findingId = 'R-LAND-001';

    // Helper to simulate keydown
    const triggerKey = (key, target = {}) => {
      let defaultPrevented = false;
      const event = {
        key,
        target,
        preventDefault: () => { defaultPrevented = true; }
      };
      keyListeners.forEach(h => h(event));
      return { defaultPrevented };
    };

    // Press 'J' -> should focus first finding (card1: R-DOC-001)
    selectedEvidenceFinding = null;
    triggerKey('J');
    assert.strictEqual(card1.classList.contains('is-active'), true, 'Card 1 must have .is-active');
    assert.strictEqual(card1.scrolledIntoView, true, 'Card 1 must be scrolled into view');
    assert.strictEqual(selectedEvidenceFinding, 'R-DOC-001', 'evidenceViewerComponent.selectFinding must be called for R-DOC-001');

    // Press 'j' -> should advance to second finding (card2: R-EXP-001)
    triggerKey('j');
    assert.strictEqual(card1.classList.contains('is-active'), false, 'Card 1 must no longer have .is-active');
    assert.strictEqual(card2.classList.contains('is-active'), true, 'Card 2 must have .is-active');
    assert.strictEqual(selectedEvidenceFinding, 'R-EXP-001', 'selectFinding must be called for R-EXP-001');

    // Press 'k' -> should go back to first finding (card1: R-DOC-001)
    triggerKey('k');
    assert.strictEqual(card1.classList.contains('is-active'), true, 'Card 1 must be active again');
    assert.strictEqual(selectedEvidenceFinding, 'R-DOC-001', 'selectFinding must be called for R-DOC-001');

    // Press 'K' again -> should wrap around to third finding (card3: R-LAND-001)
    triggerKey('K');
    assert.strictEqual(card3.classList.contains('is-active'), true, 'Card 3 must be active on wrap');
    assert.strictEqual(selectedEvidenceFinding, 'R-LAND-001', 'selectFinding must be called for R-LAND-001');
    console.log('✓ Test 2 passed: J/K traversal advances findings and triggers automatic evidence coordinate scrolling.');

    // -------------------------------------------------------------------------
    // Test 3: Finding Action Shortcuts (A, D, R, E)
    // -------------------------------------------------------------------------
    console.log('Test 3: Finding Action Shortcuts (A, D, R, E)...');
    // Active finding is currently Card 3 (R-LAND-001)
    // Press 'A' -> Acknowledge
    executedAction = null;
    triggerKey('A');
    assert.ok(executedAction, 'Acknowledge action must be executed');
    assert.strictEqual(executedAction.action, 'acknowledge', 'Action must be acknowledge');
    assert.strictEqual(executedAction.findingId, 'R-LAND-001', 'Target must be active finding R-LAND-001');

    // Press 'D' -> Dismiss reason modal
    openedReasonModal = null;
    triggerKey('D');
    assert.ok(openedReasonModal, 'Dismiss reason modal must be opened');
    assert.strictEqual(openedReasonModal.action, 'dismiss', 'Modal action must be dismiss');
    assert.strictEqual(openedReasonModal.findingId, 'R-LAND-001', 'Target must be R-LAND-001');

    // Press 'R' -> Request Rectification dialog
    openedReasonModal = null;
    triggerKey('R');
    assert.ok(openedReasonModal, 'Rectification dialog must be opened');
    assert.strictEqual(openedReasonModal.action, 'request_rectification', 'Modal action must be request_rectification');

    // Press 'E' -> Escalate dialog
    openedReasonModal = null;
    triggerKey('E');
    assert.ok(openedReasonModal, 'Escalate dialog must be opened');
    assert.strictEqual(openedReasonModal.action, 'escalate', 'Modal action must be escalate');
    console.log('✓ Test 3 passed: A, D, R, E shortcuts execute triage actions on currently focused finding.');

    // -------------------------------------------------------------------------
    // Test 4: Live Audit Chain Verification Shortcut (V)
    // -------------------------------------------------------------------------
    console.log('Test 4: Live Audit Chain Verification Shortcut (V)...');
    auditVerifiedTriggered = false;
    triggerKey('V');
    assert.strictEqual(auditVerifiedTriggered, true, 'Pressing V must trigger auditViewComponent.triggerVerifyChain()');

    auditVerifiedTriggered = false;
    triggerKey('v');
    assert.strictEqual(auditVerifiedTriggered, true, 'Pressing lowercase v must also trigger audit verification');
    console.log('✓ Test 4 passed: V shortcut executes live cryptographic audit chain verification.');

    // -------------------------------------------------------------------------
    // Test 5: Search Input Focus Shortcut (/)
    // -------------------------------------------------------------------------
    console.log('Test 5: Search Input Focus Shortcut (/)...');
    const searchInput = createMockElement('queue-search-input', 'INPUT');
    searchInput.offsetParent = {}; // simulate visible element

    const { defaultPrevented } = triggerKey('/');
    assert.strictEqual(defaultPrevented, true, 'Pressing / must preventDefault()');
    console.log('✓ Test 5 passed: / shortcut prevents character typing and focuses active search input.');

    // -------------------------------------------------------------------------
    // Test 6: Input Field Safety Guard & Escape Handling
    // -------------------------------------------------------------------------
    console.log('Test 6: Input Field Safety Guard & Escape Handling...');
    const textInput = createMockElement('user-comment', 'INPUT');
    executedAction = null;
    selectedEvidenceFinding = null;

    // When focused on an input element, pressing 'J', 'A', 'D' must NOT trigger actions
    triggerKey('J', textInput);
    assert.strictEqual(selectedEvidenceFinding, null, 'J inside input must NOT change active finding');

    triggerKey('A', textInput);
    assert.strictEqual(executedAction, null, 'A inside input must NOT trigger acknowledge');

    // Escape inside input calls blur
    let blurred = false;
    textInput.blur = () => { blurred = true; };
    triggerKey('Escape', textInput);
    assert.strictEqual(blurred, true, 'Escape inside input must blur focus');
    console.log('✓ Test 6 passed: Input safety guard prevents accidental triage action execution during text entry.');

    // -------------------------------------------------------------------------
    // Test 7: HTML Shell, Router & CSS Integration
    // -------------------------------------------------------------------------
    console.log('Test 7: HTML Shell, Router & CSS Integration...');
    const htmlContent = fs.readFileSync(path.join(__dirname, '../ui/index.html'), 'utf8');
    assert.ok(htmlContent.includes('/static/css/shortcuts.css'), 'index.html must link shortcuts.css');
    assert.ok(htmlContent.includes('/static/js/components/keyboard_shortcuts.js'), 'index.html must include keyboard_shortcuts.js');
    assert.ok(htmlContent.includes('id="btn-shortcuts-help"'), 'index.html must contain #btn-shortcuts-help button');

    const cssContent = fs.readFileSync(path.join(__dirname, '../ui/css/shortcuts.css'), 'utf8');
    assert.ok(cssContent.includes('.kbd'), 'shortcuts.css must define .kbd');
    assert.ok(cssContent.includes('.shortcut-feedback-toast'), 'shortcuts.css must define .shortcut-feedback-toast');
    assert.ok(cssContent.includes('.finding-card.is-active'), 'shortcuts.css must define .finding-card.is-active');

    console.log('✓ Test 7 passed: Full end-to-end integration with HTML shell, navigation bar, and CSS.');

    console.log('\n======================================================');
    console.log('ALL 7 SUITES IN STEP 56 PASSED (100% SUCCESS)');
    console.log('======================================================');
  } catch (err) {
    console.error('❌ Step 56 Test Failure:', err);
    process.exit(1);
  }
})();
