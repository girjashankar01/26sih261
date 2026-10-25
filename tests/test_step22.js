/**
 * Test Step 22: High-Severity Active Alerts Banner
 * Verification of active alerts banner rendering, category badges
 * (CRITICAL_DISCREPANCY, EXPIRED_MANDATORY_DOCUMENT, INFRA_ANOMALY),
 * collapsible drawer toggle, and click-to-focus shortcut action
 * (automatically switching to Evidence tab and highlighting finding).
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

// 1. Mock Browser Environment
const eventsDispatched = [];
const mockState = {
  selectedAppId: null,
  selectedAppAggregate: null,
  get: function(k) { return this[k]; },
  setSelectedApp: function(id, agg) {
    this.selectedAppId = id;
    this.selectedAppAggregate = agg;
  }
};

const mockElements = new Map();
const createMockElement = (id) => {
  const listeners = {};
  const classes = new Set();
  const attributes = new Map();

  const el = {
    id,
    innerHTML: '',
    textContent: '',
    style: {},
    classList: {
      add: (c) => classes.add(c),
      remove: (c) => classes.delete(c),
      contains: (c) => classes.has(c)
    },
    setAttribute: (k, v) => attributes.set(k, v),
    getAttribute: (k) => attributes.get(k) || null,
    addEventListener: (evt, fn) => {
      listeners[evt] = listeners[evt] || [];
      listeners[evt].push(fn);
    },
    dispatchEvent: (evt) => {
      if (listeners[evt.type]) {
        listeners[evt.type].forEach(fn => fn(evt));
      }
    },
    scrollIntoView: () => {
      el.scrolled = true;
    },
    prepend: (child) => {
      el.prependedChild = child;
    }
  };
  mockElements.set(id, el);
  return el;
};

// Setup mock workspace DOM elements
const mockAlertsContainer = createMockElement('workspace-alerts-container');
const mockDrawerList = createMockElement('alerts-drawer-list');
const mockToggleBtn = createMockElement('btn-toggle-alerts');
const mockEvidencePane = createMockElement('workspace-pane-evidence');
const mockFindingFireNoc = createMockElement('finding-FIRE_NOC');
const mockEvidenceContent = createMockElement('workspace-evidence-content');
const mockWorkspaceRoot = createMockElement('workspace-root');

global.document = {
  readyState: 'complete',
  getElementById: (id) => mockElements.get(id) || null,
  querySelector: (sel) => null,
  createElement: (tagName) => createMockElement(`dyn-${Math.random()}`),
  querySelectorAll: () => []
};

global.window = {
  addEventListener: () => {},
  removeEventListener: () => {},
  dispatchEvent: (evt) => {
    eventsDispatched.push(evt);
  },
  location: { hash: '' },
  appState: mockState,
  document: global.document
};

global.CustomEvent = class CustomEvent {
  constructor(type, params) {
    this.type = type;
    this.detail = params ? params.detail : null;
  }
};

// 2. Load Component Scripts
const alertsBarCode = fs.readFileSync(path.join(__dirname, '../ui/js/components/alerts_bar.js'), 'utf8');
eval(alertsBarCode);

const workspaceCode = fs.readFileSync(path.join(__dirname, '../ui/js/components/workspace.js'), 'utf8');
eval(workspaceCode);

console.log('--- Step 22 Verification Starting ---');

assert(window.alertsBarComponent, 'AlertsBarComponent singleton must exist on window');
assert(window.AlertsBarComponent, 'AlertsBarComponent class must be exported');

// 3. Test Fixture Alerts
const alertsFixture = [
  {
    id: 'alt-disc-intake-01',
    category: 'CRITICAL_DISCREPANCY',
    severity: 'high',
    title: 'Intake Exceeds Sanctioned Limit',
    message: 'Requested intake (540) exceeds approved institutional record intake (480).'
  },
  {
    id: 'alt-exp-fire-02',
    category: 'EXPIRED_MANDATORY_DOCUMENT',
    severity: 'high',
    title: 'Expired Mandatory Document: FIRE_NOC',
    message: 'State Fire Service Certificate validity expired on 2026-05-15.'
  },
  {
    id: 'alt-infra-loc-03',
    category: 'INFRA_ANOMALY',
    severity: 'medium',
    title: 'Infrastructure Evidence: LOCATION_METADATA_INCONSISTENT',
    message: 'Facility Computer Center geotag coordinates deviate from registered campus boundary.'
  }
];

// 4. Test 1: Render Alerts Banner & Categories
console.log('Testing Alerts Banner Rendering...');
const bannerHtml = window.alertsBarComponent.render('DEMO-ISSUES-001', alertsFixture, mockAlertsContainer);

assert(bannerHtml.includes('id="alerts-banner-widget"'), 'Must render #alerts-banner-widget container');
assert(bannerHtml.includes('Active Officer Alerts (3)'), 'Header must report 3 active alerts');
assert(bannerHtml.includes('2 High Severity'), 'Header must count 2 high severity alerts');
assert(bannerHtml.includes('has-critical'), 'Container must have has-critical class');

// Verify Category Badges
assert(bannerHtml.includes('CRITICAL_DISCREPANCY'), 'Must render CRITICAL_DISCREPANCY badge');
assert(bannerHtml.includes('EXPIRED_MANDATORY_DOCUMENT'), 'Must render EXPIRED_MANDATORY_DOCUMENT badge');
assert(bannerHtml.includes('INFRA_ANOMALY'), 'Must render INFRA_ANOMALY badge');

// Verify Items Content
assert(bannerHtml.includes('Expired Mandatory Document: FIRE_NOC'), 'Must render Fire NOC alert title');
assert(bannerHtml.includes('id="btn-focus-alt-exp-fire-02"'), 'Must render click-to-focus button for Fire NOC alert');

// 5. Test 2: Collapsible Drawer Toggle Behavior
console.log('Testing Collapsible Drawer Toggle...');
assert.strictEqual(window.alertsBarComponent.isCollapsed, false, 'Drawer must initially be expanded');

eventsDispatched.length = 0;
window.alertsBarComponent.toggleCollapse();

assert.strictEqual(window.alertsBarComponent.isCollapsed, true, 'isCollapsed must toggle to true');
assert(mockDrawerList.classList.contains('hidden'), 'Drawer list must receive .hidden class when collapsed');

const toggleEvt = eventsDispatched.find(e => e.type === 'app:alerts-toggled');
assert(toggleEvt, 'app:alerts-toggled CustomEvent must be dispatched');
assert.strictEqual(toggleEvt.detail.isCollapsed, true);

// Toggle back open
window.alertsBarComponent.toggleCollapse();
assert.strictEqual(window.alertsBarComponent.isCollapsed, false);
assert(!mockDrawerList.classList.contains('hidden'), 'Drawer list must NOT have .hidden when expanded');

// 6. Test 3: The Specification Verification Requirement — Click-to-Focus Shortcut Action
// "Verification: Clicking alert 'Expired Mandatory Document: FIRE_NOC' automatically opens
//  the Evidence tab and highlights the expired Fire NOC finding."
console.log('Testing Click-to-Focus Shortcut for "Expired Mandatory Document: FIRE_NOC"...');

// Ensure workspaceComponent has an active application
window.workspaceComponent.currentAppId = 'DEMO-ISSUES-001';
window.workspaceComponent.activeTab = 'checklist'; // start on checklist tab

eventsDispatched.length = 0;
window.alertsBarComponent.focusAlert('alt-exp-fire-02');

// A. Workspace Tab Transition
assert.strictEqual(
  window.workspaceComponent.activeTab,
  'evidence',
  'Clicking Expired Fire NOC alert MUST automatically switch active tab to "evidence"!'
);

// B. DOM Highlighting
assert(
  mockFindingFireNoc.classList.contains('highlight-pulse'),
  'Target finding element MUST receive .highlight-pulse CSS animation class!'
);
assert.strictEqual(mockFindingFireNoc.scrolled, true, 'Target element must be smoothly scrolled into view');

// C. Custom Event Dispatch
const focusEvt = eventsDispatched.find(e => e.type === 'app:alert-focused');
assert(focusEvt, 'app:alert-focused CustomEvent must be emitted');
assert.strictEqual(focusEvt.detail.alertId, 'alt-exp-fire-02');
assert.strictEqual(focusEvt.detail.targetTab, 'evidence');
assert.strictEqual(focusEvt.detail.focusTarget, 'FIRE_NOC');

// 7. Test 4: Focus Shortcut for INFRA_ANOMALY
console.log('Testing Click-to-Focus Shortcut for INFRA_ANOMALY...');
window.alertsBarComponent.focusAlert('alt-infra-loc-03');
assert.strictEqual(
  window.workspaceComponent.activeTab,
  'infra',
  'Clicking INFRA_ANOMALY alert must automatically switch active tab to "infra"'
);

// 8. Test 5: Reassurance Banner when Alerts is Empty
console.log('Testing Zero-Alerts Clean State...');
const cleanHtml = window.alertsBarComponent.render('DEMO-CLEAN-001', []);
assert(cleanHtml.includes('Zero Active Critical Discrepancies'), 'Clean banner must indicate zero discrepancies');
assert(cleanHtml.includes('badge-pass'), 'Clean banner must use badge-pass styling');

console.log('✓ All Step 22 verification assertions passed successfully!');
