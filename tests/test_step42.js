/**
 * Test Step 42: Officer Exports Tab & Generator Hub
 * Spec Reference: ROADMAP.md (Phase 8: Step 42), Guide §11.8
 *
 * Verifies:
 * 1. Exports Hub Container & Simulation Advisory Banner:
 *    - Renders #exports-hub-panel with non-punitive decision support disclaimer.
 * 2. Dedicated 3-Card Document Generator Grid:
 *    - Renders exactly 3 cards for the standard AICTE decision support exports:
 *      1. Formal Draft Deficiency Notice (#export-card-deficiency-notice)
 *      2. Visiting Team Ground Inspection Brief (#export-card-inspection-brief)
 *      3. Comprehensive Evaluation Summary Report (#export-card-summary-report)
 * 3. Specific Verification Requirement:
 *    - Each card displays document description, target recipient, and "Generate & Preview" button.
 * 4. Document Generator Metadata & Formats:
 *    - Format tags (Letter, PDF, Markdown, JSON Envelope).
 * 5. Document Preview Modal Lifecycle & Event Dispatch:
 *    - openPreview() mounts #export-preview-modal in #export-preview-modal-host.
 *    - Dispatches app:export-preview-opened event with full metadata.
 *    - closeModal() cleanly removes preview modal.
 * 6. Workspace Integration:
 *    - Workspace exports tab pane renders Exports Hub component.
 *    - loadAndRender() populates container and dispatches app:exports-hub-rendered.
 * 7. CSS Stylesheet Rules:
 *    - ui/css/exports.css defines all required styles (.exports-hub-panel, .export-generator-card, .btn-generate-preview, .badge-recipient-*).
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

const mockBody = createMockElement('mock-body');

global.document = {
  body: mockBody,
  getElementById: (id) => {
    if (!mockElements.has(id)) {
      mockElements.set(id, createMockElement(id));
    }
    return mockElements.get(id);
  },
  createElement: (tag) => createMockElement(`mock-${Date.now()}-${Math.random()}`),
  querySelectorAll: (selector) => []
};

global.window = {
  document: global.document,
  addEventListener: () => {},
  dispatchEvent: (event) => {
    eventsDispatched.push(event);
  }
};

global.CustomEvent = class {
  constructor(type, options = {}) {
    this.type = type;
    this.detail = options.detail || {};
  }
};

// Load exports_modal module
const {
  ExportsHubComponent,
  ExportsModalComponent,
  exportsHubComponent,
  EXPORT_GENERATORS
} = require('../ui/js/components/exports_modal.js');

// Load workspace module
const { WorkspaceComponent } = require('../ui/js/components/workspace.js');

async function runTests() {
  console.log('--- Running Step 42 Test Suite: Officer Exports Tab & Generator Hub ---');
  const hub = new ExportsHubComponent();

  // -------------------------------------------------------------
  // Test 1: Configuration & 3 Core Document Generators Definition
  // -------------------------------------------------------------
  console.log('Test 1: Core Document Generators Configuration');
  {
    assert.strictEqual(EXPORT_GENERATORS.length, 3, 'Must define exactly 3 core export generators');

    const ids = EXPORT_GENERATORS.map(g => g.id);
    assert.ok(ids.includes('deficiency-notice'), 'Must include deficiency-notice generator');
    assert.ok(ids.includes('inspection-brief'), 'Must include inspection-brief generator');
    assert.ok(ids.includes('summary-report'), 'Must include summary-report generator');

    console.log('✓ Exactly 3 standard document generators configured (deficiency-notice, inspection-brief, summary-report)');
  }

  // -------------------------------------------------------------
  // Test 2: Specific Verification Requirement
  // Verification Requirement: Each card displays document description,
  // target recipient, and "Generate & Preview" button.
  // -------------------------------------------------------------
  console.log('Test 2: Specific Verification Requirement: Description, Recipient & Button');
  {
    const hubHtml = hub.render('DEMO-ISSUES-001');

    for (const gen of EXPORT_GENERATORS) {
      // 1. Card container presence
      assert.ok(hubHtml.includes(`id="${gen.cardId}"`), `Hub must render card with id="${gen.cardId}"`);

      // 2. Title presence
      assert.ok(hubHtml.includes(gen.title), `Card must display title: "${gen.title}"`);

      // 3. Target Recipient display
      assert.ok(hubHtml.includes(gen.recipient), `Card must display target recipient: "${gen.recipient}"`);
      assert.ok(hubHtml.includes(gen.recipientBadgeClass), `Card must have recipient badge class "${gen.recipientBadgeClass}"`);

      // 4. Document Description display
      assert.ok(hubHtml.includes(gen.description), `Card must display document description: "${gen.description.substring(0, 30)}..."`);

      // 5. "Generate & Preview" button
      assert.ok(hubHtml.includes(`id="${gen.buttonId}"`), `Card must render button with id="${gen.buttonId}"`);
      assert.ok(hubHtml.includes('Generate & Preview'), 'Card must render button text "Generate & Preview"');
      assert.ok(hubHtml.includes('btn-generate-preview'), 'Card button must have class btn-generate-preview');
    }

    console.log('✓ Specific verification requirement satisfied: All 3 cards render document description, target recipient, and "Generate & Preview" button');
  }

  // -------------------------------------------------------------
  // Test 3: Simulation Advisory Banner (AGENTS.md Compliance)
  // -------------------------------------------------------------
  console.log('Test 3: Non-Negotiable Simulation Advisory Banner');
  {
    const bannerHtml = hub.renderAdvisoryBanner();
    assert.ok(bannerHtml.includes('exports-advisory-banner'), 'Must have CSS class exports-advisory-banner');
    assert.ok(bannerHtml.includes('ADVISORY DRAFTS ONLY'), 'Must include "ADVISORY DRAFTS ONLY" badge');
    assert.ok(
      bannerHtml.includes('does not dispatch automated institutional notices'),
      'Must clearly state that system does not send autonomous notices'
    );

    console.log('✓ Non-negotiable simulation advisory banner verified');
  }

  // -------------------------------------------------------------
  // Test 4: Format Badges & Metadata
  // -------------------------------------------------------------
  console.log('Test 4: Available Formats & Metadata Display');
  {
    const hubHtml = hub.render('DEMO-ISSUES-001');

    assert.ok(hubHtml.includes('Official Letter'), 'Must display Official Letter format tag');
    assert.ok(hubHtml.includes('Inspection Dossier'), 'Must display Inspection Dossier format tag');
    assert.ok(hubHtml.includes('Evaluation Dossier'), 'Must display Evaluation Dossier format tag');
    assert.ok(hubHtml.includes('DEMO-ISSUES-001'), 'Must display active application ID');

    console.log('✓ Document export format tags and application reference verified');
  }

  // -------------------------------------------------------------
  // Test 5: Document Preview Modal Lifecycle & Event Dispatch
  // -------------------------------------------------------------
  console.log('Test 5: Preview Modal Lifecycle & Custom Event Dispatch');
  {
    eventsDispatched.length = 0;
    hub.currentAppId = 'DEMO-ISSUES-001';

    // 1. Open Preview Modal for deficiency-notice
    hub.openPreview('deficiency-notice');
    assert.strictEqual(hub.activePreviewType, 'deficiency-notice');

    const host = global.document.getElementById('export-preview-modal-host');
    assert.ok(host.innerHTML.includes('id="export-preview-modal"'), 'Modal must mount in #export-preview-modal-host');
    assert.ok(host.innerHTML.includes('Formal Draft Deficiency Notice'), 'Modal must display document title');
    assert.ok(host.innerHTML.includes('Institution / Applying Trust'), 'Modal must display recipient');

    // Verify CustomEvent
    const openEvent = eventsDispatched.find(e => e.type === 'app:export-preview-opened');
    assert.ok(openEvent, 'Must dispatch app:export-preview-opened custom event');
    assert.strictEqual(openEvent.detail.applicationId, 'DEMO-ISSUES-001');
    assert.strictEqual(openEvent.detail.exportType, 'deficiency-notice');

    // 2. Close Modal
    hub.closeModal();
    assert.strictEqual(hub.activePreviewType, null);
    assert.strictEqual(host.innerHTML, '', 'closeModal must empty #export-preview-modal-host');

    console.log('✓ openPreview() and closeModal() modal lifecycle and event dispatch verified');
  }

  // -------------------------------------------------------------
  // Test 6: Workspace Integration
  // -------------------------------------------------------------
  console.log('Test 6: Workspace Integration & Load Event');
  {
    eventsDispatched.length = 0;
    const ws = new WorkspaceComponent();
    ws.currentAppId = 'DEMO-CLEAN-001';

    // Verify Tab 6 exists in workspace tabs
    const exportsTab = ws.tabs.find(t => t.id === 'exports');
    assert.ok(exportsTab, 'Workspace tabs must include "exports" tab');
    assert.strictEqual(exportsTab.label, 'Officer Actions & Exports');

    // Render workspace with exports tab active
    ws.activeTab = 'exports';
    const wsHtml = ws.renderWorkspace();
    assert.ok(wsHtml.includes('workspace-pane-exports'), 'Must render workspace-pane-exports');
    assert.ok(wsHtml.includes('id="workspace-exports-content"'), 'Must render #workspace-exports-content container');

    // Test loadAndRender method
    hub.loadAndRender('DEMO-CLEAN-001', 'workspace-exports-content');
    const loadEvent = eventsDispatched.find(e => e.type === 'app:exports-hub-rendered');
    assert.ok(loadEvent, 'Must dispatch app:exports-hub-rendered custom event');
    assert.strictEqual(loadEvent.detail.applicationId, 'DEMO-CLEAN-001');
    assert.strictEqual(loadEvent.detail.generatorCount, 3);

    console.log('✓ Workspace exports tab wiring and loadAndRender event verified');
  }

  // -------------------------------------------------------------
  // Test 7: CSS Stylesheet Rules
  // -------------------------------------------------------------
  console.log('Test 7: CSS Stylesheet Rules in ui/css/exports.css');
  {
    const cssPath = path.join(__dirname, '../ui/css/exports.css');
    assert.ok(fs.existsSync(cssPath), 'ui/css/exports.css must exist');
    const cssContent = fs.readFileSync(cssPath, 'utf-8');

    const requiredClasses = [
      '.exports-hub-panel',
      '.exports-advisory-banner',
      '.exports-cards-grid',
      '.export-generator-card',
      '.export-card-header',
      '.export-recipient-badge',
      '.badge-recipient-institution',
      '.badge-recipient-committee',
      '.badge-recipient-admin',
      '.export-card-desc',
      '.export-card-footer',
      '.btn-generate-preview',
      '.export-modal-backdrop'
    ];

    for (const cls of requiredClasses) {
      assert.ok(cssContent.includes(cls), `CSS must define ${cls}`);
    }

    console.log('✓ ui/css/exports.css defines all required styles');
  }

  console.log('\n======================================================');
  console.log('✓ ALL 7 STEP 42 VERIFICATION CHECKS PASSED SUCCESSFULLY');
  console.log('======================================================');
}

runTests().catch(err => {
  console.error('❌ Step 42 Test Suite Failed:', err);
  process.exit(1);
});
