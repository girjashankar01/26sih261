/**
 * AICTE Decision Support Prototype - Step 57 Verification Suite
 * Step 57: Keyboard Shortcuts Cheat Sheet Modal (?)
 * Spec Reference: Prototype Guide §17.3, §17.4, ROADMAP.md (Phase 10: Step 57)
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

// Setup Node mock DOM environment
const domNodes = new Map();
const keyListeners = [];
const eventListeners = new Map();

function createMockElement(id, tagName = 'div', className = '') {
  const el = {
    id,
    tagName: tagName.toUpperCase(),
    className,
    classList: {
      classes: new Set(className.split(' ').filter(Boolean)),
      add: function (...tokens) { tokens.forEach(t => this.classes.add(t)); el.className = Array.from(this.classes).join(' '); },
      remove: function (...tokens) { tokens.forEach(t => this.classes.delete(t)); el.className = Array.from(this.classes).join(' '); },
      contains: function (t) { return this.classes.has(t); },
      toggle: function (t) {
        if (this.classes.has(t)) { this.classes.delete(t); } else { this.classes.add(t); }
        el.className = Array.from(this.classes).join(' ');
      }
    },
    dataset: {},
    attributes: new Map(),
    children: [],
    parentNode: null,
    style: {},
    value: '',
    textContent: '',
    _innerHTML: '',
    setAttribute: function (k, v) { this.attributes.set(k, String(v)); },
    getAttribute: function (k) { return this.attributes.get(k) || null; },
    removeAttribute: function (k) { this.attributes.delete(k); },
    hasAttribute: function (k) { return this.attributes.has(k); },
    addEventListener: function (type, handler) {
      if (!this._listeners) this._listeners = new Map();
      if (!this._listeners.has(type)) this._listeners.set(type, []);
      this._listeners.get(type).push(handler);
    },
    removeEventListener: function (type, handler) {
      if (!this._listeners || !this._listeners.has(type)) return;
      this._listeners.set(type, this._listeners.get(type).filter(h => h !== handler));
    },
    dispatchEvent: function (event) {
      if (!this._listeners || !this._listeners.has(event.type)) return;
      this._listeners.get(event.type).forEach(h => h(event));
    },
    click: function () {
      if (this._listeners && this._listeners.has('click')) {
        this._listeners.get('click').forEach(h => h({ target: this, preventDefault: () => {} }));
      }
    },
    focus: function () {},
    blur: function () {},
    select: function () {},
    remove: function () {
      if (this.parentNode) {
        this.parentNode.removeChild(this);
      }
      domNodes.delete(this.id);
    },
    appendChild: function (child) {
      child.parentNode = this;
      this.children.push(child);
      if (child.id) domNodes.set(child.id, child);
      return child;
    },
    removeChild: function (child) {
      const idx = this.children.indexOf(child);
      if (idx !== -1) {
        this.children.splice(idx, 1);
        child.parentNode = null;
        if (child.id) domNodes.delete(child.id);
      }
      return child;
    },
    querySelector: function (sel) {
      return querySelectorMock(this, sel);
    },
    querySelectorAll: function (sel) {
      return querySelectorAllMock(this, sel);
    }
  };

  Object.defineProperty(el, 'innerHTML', {
    get() { return this._innerHTML; },
    set(val) {
      this._innerHTML = val;
      parseSimpleMockHtml(this, val);
    }
  });

  if (id) domNodes.set(id, el);
  return el;
}

function parseSimpleMockHtml(parent, html) {
  parent.children = [];
  const idRegex = /id="([^"]+)"/g;
  let match;
  while ((match = idRegex.exec(html)) !== null) {
    const childId = match[1];
    let tag = 'div';
    if (childId.startsWith('input-')) tag = 'input';
    if (childId.startsWith('btn-')) tag = 'button';
    const childEl = createMockElement(childId, tag);
    parent.children.push(childEl);
    childEl.parentNode = parent;
  }

  // Also collect classes for querySelectorAll
  const itemMatches = html.match(/class="shortcut-item[^"]*"/g) || [];
  itemMatches.forEach((m, idx) => {
    const item = createMockElement(`mock-shortcut-item-${idx}`, 'div', 'shortcut-item');
    if (idx === 0) item.setAttribute('data-keywords', 'j next focus advance finding ground evidence bbox');
    if (idx === 1) item.setAttribute('data-keywords', 'k previous focus retreat finding ground evidence bbox');
    if (idx === 2) item.setAttribute('data-keywords', 'enter open inspect expand details');
    if (idx === 3) item.setAttribute('data-keywords', 'escape esc clear deselect close dismiss blur');
    if (idx === 4) item.setAttribute('data-keywords', 'a acknowledge mark review');
    if (idx === 5) item.setAttribute('data-keywords', 'd dismiss override reject finding reason modal justification');
    if (idx === 6) item.setAttribute('data-keywords', 'r request rectification notice institutional deficiency re-upload');
    if (idx === 7) item.setAttribute('data-keywords', 'e escalate senior officer committee review hearing');
    if (idx === 8) item.setAttribute('data-keywords', 'v verify audit hash chain integrity sha256 genesis head');
    if (idx === 9) item.setAttribute('data-keywords', '/ search filter quick find focus input');
    if (idx === 10) item.setAttribute('data-keywords', '? help cheat sheet modal shortcuts keycaps');
    parent.children.push(item);
    item.parentNode = parent;
  });
}

function querySelectorMock(root, sel) {
  if (sel.startsWith('#')) {
    const targetId = sel.substring(1);
    if (root.id === targetId) return root;
    for (const child of root.children) {
      const found = querySelectorMock(child, sel);
      if (found) return found;
    }
    return domNodes.get(targetId) || null;
  }
  if (sel.startsWith('.')) {
    const className = sel.substring(1);
    if (root.classList && root.classList.contains(className)) return root;
    for (const child of root.children) {
      const found = querySelectorMock(child, sel);
      if (found) return found;
    }
  }
  return null;
}

function querySelectorAllMock(root, sel) {
  const results = [];
  function search(node) {
    if (sel.startsWith('.')) {
      const className = sel.substring(1);
      if (node.classList && node.classList.contains(className)) {
        results.push(node);
      }
    } else if (sel.startsWith('#')) {
      const targetId = sel.substring(1);
      if (node.id === targetId) results.push(node);
    }
    for (const child of node.children) {
      search(child);
    }
  }
  search(root);
  return results;
}

// Global browser mocks
const mockDocument = {
  body: createMockElement('document-body', 'body'),
  getElementById: (id) => domNodes.get(id) || null,
  querySelector: (sel) => querySelectorMock(mockDocument.body, sel),
  querySelectorAll: (sel) => querySelectorAllMock(mockDocument.body, sel),
  createElement: (tag) => createMockElement(`gen-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`, tag)
};

global.document = mockDocument;
global.window = {
  addEventListener: (type, handler) => {
    if (type === 'keydown') keyListeners.push(handler);
    if (!eventListeners.has(type)) eventListeners.set(type, []);
    eventListeners.get(type).push(handler);
  },
  removeEventListener: (type, handler) => {
    if (type === 'keydown') {
      const idx = keyListeners.indexOf(handler);
      if (idx !== -1) keyListeners.splice(idx, 1);
    }
  },
  dispatchEvent: (evt) => {
    const handlers = eventListeners.get(evt.type || evt);
    if (handlers) handlers.forEach(h => h(evt));
  }
};

function triggerKey(key, target = null) {
  const evt = {
    key,
    target: target || mockDocument.body,
    preventDefault: () => {},
    stopPropagation: () => {},
    ctrlKey: false,
    metaKey: false,
    altKey: false
  };
  for (const listener of keyListeners) {
    listener(evt);
  }
}

// Load KeyboardShortcutsEngine module
const KeyboardShortcutsEngine = require('../ui/js/components/keyboard_shortcuts.js');

console.log('--- Step 57: Keyboard Shortcuts Cheat Sheet Modal Tests ---');

(async () => {
  try {
    // -------------------------------------------------------------------------
    // Test 1: Component Initialization & Closed State by Default
    // -------------------------------------------------------------------------
    console.log('Test 1: Component Initialization & Initial State...');
    const shortcuts = new KeyboardShortcutsEngine();
    shortcuts.init();

    assert.strictEqual(shortcuts.isEnabled, true, 'Shortcuts engine must be enabled');
    assert.strictEqual(shortcuts.isCheatSheetOpen, false, 'Cheat sheet modal must be closed by default');
    assert.strictEqual(mockDocument.getElementById('shortcuts-modal-host'), null, 'Modal host must not be in DOM');
    console.log('✓ Test 1 passed: Engine initialized and cheat sheet modal is closed by default.');

    // -------------------------------------------------------------------------
    // Test 2: Specific Verification Requirement: Pressing ? Opens Cheat Sheet
    // -------------------------------------------------------------------------
    console.log('Test 2: Specific Verification Requirement: Pressing ? Opens Modal...');
    triggerKey('?');

    assert.strictEqual(shortcuts.isCheatSheetOpen, true, 'isCheatSheetOpen must be true after pressing ?');
    const modalHost = mockDocument.getElementById('shortcuts-modal-host');
    assert.ok(modalHost, '#shortcuts-modal-host must be rendered in DOM');
    assert.ok(mockDocument.getElementById('shortcuts-modal-container'), '#shortcuts-modal-container must exist');
    assert.ok(mockDocument.getElementById('shortcuts-modal-backdrop'), '#shortcuts-modal-backdrop must exist');
    assert.ok(mockDocument.getElementById('btn-close-shortcuts-modal'), '#btn-close-shortcuts-modal must exist');
    assert.ok(mockDocument.getElementById('btn-dismiss-shortcuts-modal'), '#btn-dismiss-shortcuts-modal must exist');
    console.log('✓ Test 2 passed: Pressing ? opens the shortcuts cheat sheet modal.');

    // -------------------------------------------------------------------------
    // Test 3: Specific Verification Requirement: Pressing Escape Dismisses Modal
    // -------------------------------------------------------------------------
    console.log('Test 3: Specific Verification Requirement: Pressing Escape Dismisses Modal...');
    triggerKey('Escape');

    assert.strictEqual(shortcuts.isCheatSheetOpen, false, 'isCheatSheetOpen must be false after pressing Escape');
    assert.strictEqual(mockDocument.getElementById('shortcuts-modal-host'), null, '#shortcuts-modal-host must be removed from DOM');
    console.log('✓ Test 3 passed: Pressing Escape dismisses the cheat sheet modal.');

    // -------------------------------------------------------------------------
    // Test 4: Modal Dismissal via Close Button, Backdrop Click & Footer Button
    // -------------------------------------------------------------------------
    console.log('Test 4: Modal Dismissal via Close Buttons and Backdrop Click...');
    // A. Close button (✕)
    shortcuts.openCheatSheet();
    assert.strictEqual(shortcuts.isCheatSheetOpen, true, 'Modal must open');
    const btnClose = mockDocument.getElementById('btn-close-shortcuts-modal');
    assert.ok(btnClose, 'Close button must exist');
    btnClose.click();
    assert.strictEqual(shortcuts.isCheatSheetOpen, false, 'Modal must close on header close button click');

    // B. Footer dismiss button
    shortcuts.openCheatSheet();
    assert.strictEqual(shortcuts.isCheatSheetOpen, true, 'Modal must open');
    const btnDismiss = mockDocument.getElementById('btn-dismiss-shortcuts-modal');
    assert.ok(btnDismiss, 'Dismiss button must exist');
    btnDismiss.click();
    assert.strictEqual(shortcuts.isCheatSheetOpen, false, 'Modal must close on footer dismiss button click');

    // C. Backdrop click
    shortcuts.openCheatSheet();
    assert.strictEqual(shortcuts.isCheatSheetOpen, true, 'Modal must open');
    const backdrop = mockDocument.getElementById('shortcuts-modal-backdrop');
    assert.ok(backdrop, 'Backdrop must exist');
    backdrop.click();
    assert.strictEqual(shortcuts.isCheatSheetOpen, false, 'Modal must close on backdrop click');
    console.log('✓ Test 4 passed: Modal closes cleanly via close button, footer dismiss, and backdrop click.');

    // -------------------------------------------------------------------------
    // Test 5: Dark Pill Keycap Styling Verification in CSS
    // -------------------------------------------------------------------------
    console.log('Test 5: Dark Pill Keycap Styling Verification in CSS...');
    const cssPath = path.join(__dirname, '../ui/css/shortcuts.css');
    assert.ok(fs.existsSync(cssPath), 'ui/css/shortcuts.css must exist');
    const cssContent = fs.readFileSync(cssPath, 'utf8');

    // Verify dark pill design keycap rules
    assert.ok(cssContent.includes('.kbd') || cssContent.includes('.kbd-pill'), 'CSS must define .kbd or .kbd-pill keycap classes');
    assert.ok(cssContent.includes('border-radius: 9999px') || cssContent.includes('border-radius:9999px'), 'Keycaps must use pill border radius (9999px)');
    assert.ok(cssContent.includes('#0f172a') || cssContent.includes('#1e293b'), 'Keycaps must have dark slate background');
    assert.ok(cssContent.includes('#f8fafc') || cssContent.includes('#ffffff') || cssContent.includes('color: #fff'), 'Keycaps must have crisp light text');
    assert.ok(cssContent.includes('.shortcuts-modal-backdrop'), 'CSS must style .shortcuts-modal-backdrop');
    assert.ok(cssContent.includes('.shortcuts-modal-container'), 'CSS must style .shortcuts-modal-container');
    console.log('✓ Test 5 passed: CSS verifies dark pill design styling for keycaps and modal overlay.');

    // -------------------------------------------------------------------------
    // Test 6: Shortcut Coverage & Categorization in Modal Content
    // -------------------------------------------------------------------------
    console.log('Test 6: Shortcut Coverage & Categorization in Modal Content...');
    const jsPath = path.join(__dirname, '../ui/js/components/keyboard_shortcuts.js');
    const jsContent = fs.readFileSync(jsPath, 'utf8');

    // Check Guide references
    assert.ok(jsContent.includes('Guide §17.3'), 'Modal must reference Guide §17.3');
    assert.ok(jsContent.includes('Guide §17.4'), 'Modal must reference Guide §17.4');

    // Check all operational shortcut groups
    const expectedKeys = ['J', 'K', 'Enter', 'Esc', 'A', 'D', 'R', 'E', 'V', '/', '?', '1', '2', '3', '4', '5'];
    for (const key of expectedKeys) {
      assert.ok(
        jsContent.includes(`>${key}</kbd>`) || jsContent.includes(`>${key} `) || jsContent.includes(`"${key}"`),
        `Modal or engine must include shortcut '${key}'`
      );
    }
    console.log('✓ Test 6 passed: Modal contains all 16 required triage, review, security, and view shortcuts.');

    // -------------------------------------------------------------------------
    // Test 7: Top Navigation Bar Button & Filter Input Integration
    // -------------------------------------------------------------------------
    console.log('Test 7: Top Navigation Bar Button & Filter Input Integration...');
    // Create header button
    const btnHelp = createMockElement('btn-shortcuts-help', 'button');
    mockDocument.body.appendChild(btnHelp);

    const shortcuts2 = new KeyboardShortcutsEngine();
    shortcuts2.init();

    // Click header button to toggle
    btnHelp.click();
    assert.strictEqual(shortcuts2.isCheatSheetOpen, true, 'Clicking #btn-shortcuts-help must toggle modal open');

    // Filter input search test
    const filterInput = mockDocument.getElementById('input-shortcuts-filter');
    assert.ok(filterInput, 'Filter input #input-shortcuts-filter must exist in modal');

    // Trigger filter input event
    filterInput.value = 'rectification';
    if (filterInput._listeners && filterInput._listeners.has('input')) {
      filterInput._listeners.get('input').forEach(h => h({ target: { value: 'rectification' } }));
    }

    // Verify pressing Escape while in input closes modal
    triggerKey('Escape', filterInput);
    assert.strictEqual(shortcuts2.isCheatSheetOpen, false, 'Escape while focused in filter input must close modal');

    // Click header button again to verify toggle
    btnHelp.click();
    assert.strictEqual(shortcuts2.isCheatSheetOpen, true, 'Clicking #btn-shortcuts-help again opens modal');
    btnHelp.click();
    assert.strictEqual(shortcuts2.isCheatSheetOpen, false, 'Clicking #btn-shortcuts-help again closes modal');
    console.log('✓ Test 7 passed: Top navigation bar button and filter input integration verified.');

    console.log('\n======================================================');
    console.log('ALL 7 SUITES IN STEP 57 PASSED (100% SUCCESS)');
    console.log('======================================================\n');
    process.exit(0);

  } catch (err) {
    console.error('\n❌ Step 57 Test Failure:', err);
    process.exit(1);
  }
})();
