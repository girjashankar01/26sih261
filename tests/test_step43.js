/**
 * Test Step 43: Formal Draft Deficiency Notice Generator & Viewer
 * Spec Reference: ROADMAP.md (Phase 8: Step 43), Guide §11.8
 *
 * Verifies:
 * 1. Deficiency Notice Data Model & Resolver:
 *    - getDefaultDeficiencyNotice returns valid structure with status DRAFT and DEFICIENCY_NOTICE_DRAFT.
 *    - DEMO-ISSUES-001 contains 2 open rectifiable deficiencies with two-sided evidence.
 *    - DEMO-CLEAN-001 contains 0 deficiencies.
 * 2. Specific Verification Requirement:
 *    - Clicking generate loads clean deficiency notice letter ready for officer dispatch.
 * 3. Official Letterhead Presentation & Recipient Address:
 *    - Formatted reference number (AICTE/RO-NR/DEF/...), date, and recipient address block.
 *    - Draft watermark badge: DRAFT — FOR OFFICER REVIEW (#badge-notice-status).
 *    - Formal subject line and introductory regulatory paragraph.
 * 4. Two-Sided Deficiency Evidence Table:
 *    - Table (#deficiency-table) lists observed submitted values vs mandatory handbook expected norms.
 *    - Clearly specifies required rectification action and statutory upload deadline.
 * 5. Statutory Upload Deadline Callout & Sign-off:
 *    - #notice-deadline-box highlights 7-day upload cutoff.
 *    - Official sign-off block with officer designation and approval stamp (#notice-stamp).
 * 6. Interactive Toolbar Actions & Event Dispatch:
 *    - Generates and mounts modal into #export-preview-modal-host.
 *    - Dispatches app:deficiency-notice-generated event with diagnostic payload.
 *    - Action toolbar buttons: Copy Formatted Text, Download JSON, Print Official Letter.
 * 7. CSS Stylesheet Rules:
 *    - ui/css/exports.css defines .notice-letter, .notice-letterhead, .badge-draft-notice, .notice-table, .notice-observed-val, .notice-expected-val, .notice-deadline-box.
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
  },
  print: () => {}
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
  exportsHubComponent,
  EXPORT_GENERATORS
} = require('../ui/js/components/exports_modal.js');

async function runTests() {
  console.log('--- Running Step 43 Test Suite: Formal Draft Deficiency Notice Generator & Viewer ---');
  const hub = new ExportsHubComponent();

  // -------------------------------------------------------------
  // Test 1: Deficiency Notice Data Model & Resolver
  // -------------------------------------------------------------
  console.log('Test 1: Deficiency Notice Data Model Resolution');
  {
    // A. DEMO-ISSUES-001 (has open rectifiable deficiencies)
    const issuesNotice = hub.getDefaultDeficiencyNotice('DEMO-ISSUES-001');
    assert.strictEqual(issuesNotice.application_id, 'DEMO-ISSUES-001');
    assert.strictEqual(issuesNotice.status, 'DRAFT', 'Notice status must be DRAFT');
    assert.strictEqual(issuesNotice.document_type, 'DEFICIENCY_NOTICE_DRAFT');
    assert.strictEqual(issuesNotice.deficiencies_count, 2, 'DEMO-ISSUES-001 must have 2 deficiencies');
    assert.strictEqual(issuesNotice.deficiencies.length, 2);

    // Verify two-sided evidence on items
    const def1 = issuesNotice.deficiencies[0];
    assert.ok(def1.observed, 'Deficiency 1 must have observed submitted evidence');
    assert.ok(def1.expected, 'Deficiency 1 must have expected regulatory norm');
    assert.ok(def1.action_required, 'Deficiency 1 must specify required action');
    assert.ok(def1.handbook_reference, 'Deficiency 1 must have handbook reference');

    // B. DEMO-CLEAN-001 (compliant)
    const cleanNotice = hub.getDefaultDeficiencyNotice('DEMO-CLEAN-001');
    assert.strictEqual(cleanNotice.deficiencies_count, 0, 'Clean app must have 0 deficiencies');
    assert.strictEqual(cleanNotice.status, 'DRAFT');

    console.log('✓ Deficiency notice data model resolved with DRAFT status and two-sided evidence');
  }

  // -------------------------------------------------------------
  // Test 2: Specific Verification Requirement
  // Verification Requirement: Clicking generate loads clean deficiency notice letter ready for officer dispatch.
  // -------------------------------------------------------------
  console.log('Test 2: Specific Verification Requirement: Clean Deficiency Notice Letter Ready for Dispatch');
  {
    eventsDispatched.length = 0;
    hub.currentAppId = 'DEMO-ISSUES-001';

    // Simulate clicking "Generate & Preview" on deficiency-notice card
    hub.openPreview('deficiency-notice');

    const host = global.document.getElementById('export-preview-modal-host');
    assert.ok(host.innerHTML.includes('id="export-preview-modal"'), 'Modal must mount in #export-preview-modal-host');

    // Verify clean letterhead document structure
    assert.ok(host.innerHTML.includes('id="deficiency-notice-letter"'), 'Must render #deficiency-notice-letter');
    assert.ok(host.innerHTML.includes('All India Council for Technical Education'), 'Must display authority title');
    assert.ok(host.innerHTML.includes('Regional Approvals Bureau'), 'Must display Regional Bureau subheader');
    assert.ok(host.innerHTML.includes('id="notice-ref-no"'), 'Must render reference number');
    assert.ok(host.innerHTML.includes('id="notice-inst-name"'), 'Must render addressed institution');
    assert.ok(host.innerHTML.includes('Apex Institute of Engineering & Technology'), 'Must contain addressed institution name');
    assert.ok(host.innerHTML.includes('id="notice-subject"'), 'Must render formal subject line');

    // Status marked DRAFT
    assert.ok(host.innerHTML.includes('badge-draft-notice'), 'Must display DRAFT watermark badge');
    assert.ok(host.innerHTML.includes('DRAFT — FOR OFFICER REVIEW'), 'Must display DRAFT status text');

    console.log('✓ Specific verification requirement satisfied: Clicking generate loads clean deficiency notice letter ready for officer dispatch');
  }

  // -------------------------------------------------------------
  // Test 3: Two-Sided Deficiency Evidence Table
  // -------------------------------------------------------------
  console.log('Test 3: Two-Sided Deficiency Evidence Table');
  {
    const host = global.document.getElementById('export-preview-modal-host');

    // Table container and element
    assert.ok(host.innerHTML.includes('id="deficiency-table"'), 'Must render #deficiency-table');

    // Table headers
    assert.ok(host.innerHTML.includes('Submitted Claim / Observed Value'), 'Table must have Observed column');
    assert.ok(host.innerHTML.includes('Prescribed Regulatory Norm'), 'Table must have Expected Norm column');
    assert.ok(host.innerHTML.includes('Required Rectification Action'), 'Table must have Action column');
    assert.ok(host.innerHTML.includes('Upload Cutoff'), 'Table must have Upload Deadline column');

    // Row 1: Fire Safety Expired
    assert.ok(host.innerHTML.includes('id="row-def-FIND-ISSUE-001"'), 'Must render row for FIND-ISSUE-001');
    assert.ok(host.innerHTML.includes('id="val-observed-FIND-ISSUE-001"'), 'Must render observed value slot');
    assert.ok(host.innerHTML.includes('2026-01-15'), 'Must display observed expiry date');
    assert.ok(host.innerHTML.includes('id="val-expected-FIND-ISSUE-001"'), 'Must render expected norm slot');
    assert.ok(host.innerHTML.includes('Mandatory Safety Clearances'), 'Must cite Chapter II Clause 4.3');

    // Row 2: Land Area Norms
    assert.ok(host.innerHTML.includes('id="row-def-FIND-ISSUE-002"'), 'Must render row for FIND-ISSUE-002');
    assert.ok(host.innerHTML.includes('1.85 Acres'), 'Must display observed land area');
    assert.ok(host.innerHTML.includes('2.50 Acres'), 'Must display expected land area');

    console.log('✓ Two-sided evidence table renders observed values, regulatory norms, and action steps');
  }

  // -------------------------------------------------------------
  // Test 4: Statutory Upload Deadline Callout & Sign-off Block
  // -------------------------------------------------------------
  console.log('Test 4: Statutory Upload Deadline Callout & Official Sign-off');
  {
    const host = global.document.getElementById('export-preview-modal-host');

    // Deadline callout box
    assert.ok(host.innerHTML.includes('id="notice-deadline-box"'), 'Must render #notice-deadline-box');
    assert.ok(host.innerHTML.includes('Mandatory Rectification Deadline:'), 'Must highlight rectification deadline');
    assert.ok(host.innerHTML.includes('7 calendar days'), 'Must specify statutory 7-day period');

    // Official sign-off block
    assert.ok(host.innerHTML.includes('notice-signoff'), 'Must render notice-signoff block');
    assert.ok(host.innerHTML.includes('Scrutiny Officer / Regional Approval Committee'), 'Must render officer designation');
    assert.ok(host.innerHTML.includes('id="notice-stamp"'), 'Must render #notice-stamp');
    assert.ok(host.innerHTML.includes('DRAFT APPROVED FOR OFFICER DISPATCH'), 'Stamp must confirm draft approval');

    console.log('✓ Statutory deadline box and official sign-off block verified');
  }

  // -------------------------------------------------------------
  // Test 5: Event Dispatching & Action Toolbar
  // -------------------------------------------------------------
  console.log('Test 5: Event Dispatching & Action Toolbar');
  {
    // Custom Event
    const genEvent = eventsDispatched.find(e => e.type === 'app:deficiency-notice-generated');
    assert.ok(genEvent, 'Must dispatch app:deficiency-notice-generated custom event');
    assert.strictEqual(genEvent.detail.applicationId, 'DEMO-ISSUES-001');
    assert.strictEqual(genEvent.detail.deficienciesCount, 2);
    assert.strictEqual(genEvent.detail.status, 'DRAFT');

    // Action toolbar buttons
    const host = global.document.getElementById('export-preview-modal-host');
    assert.ok(host.innerHTML.includes('id="btn-copy-notice"'), 'Must include Copy Formatted Text button');
    assert.ok(host.innerHTML.includes('id="btn-download-notice"'), 'Must include Download Draft JSON button');
    assert.ok(host.innerHTML.includes('id="btn-print-notice"'), 'Must include Print Official Letter button');
    assert.ok(host.innerHTML.includes('id="btn-close-export-modal"'), 'Must include modal close button');

    // Close modal
    hub.closeModal();
    assert.strictEqual(host.innerHTML, '', 'closeModal must empty #export-preview-modal-host');

    console.log('✓ app:deficiency-notice-generated event dispatched and action toolbar verified');
  }

  // -------------------------------------------------------------
  // Test 6: Clean Application Rendering (0 Deficiencies)
  // -------------------------------------------------------------
  console.log('Test 6: Clean Application Handling (0 Deficiencies)');
  {
    hub.currentAppId = 'DEMO-CLEAN-001';
    hub.openPreview('deficiency-notice');

    const host = global.document.getElementById('export-preview-modal-host');
    assert.ok(
      host.innerHTML.includes('No open rectifiable discrepancies identified'),
      'Clean application must state that no rectifiable discrepancies were identified'
    );

    hub.closeModal();
    console.log('✓ Clean application displays positive compliance notice with 0 deficiencies');
  }

  // -------------------------------------------------------------
  // Test 7: CSS Stylesheet Rules in ui/css/exports.css
  // -------------------------------------------------------------
  console.log('Test 7: CSS Stylesheet Rules in ui/css/exports.css');
  {
    const cssPath = path.join(__dirname, '../ui/css/exports.css');
    assert.ok(fs.existsSync(cssPath), 'ui/css/exports.css must exist');
    const cssContent = fs.readFileSync(cssPath, 'utf-8');

    const requiredClasses = [
      '.notice-letter',
      '.notice-letterhead',
      '.badge-draft-notice',
      '.notice-recipient-block',
      '.notice-subject',
      '.notice-table',
      '.notice-observed-val',
      '.notice-expected-val',
      '.notice-deadline-box',
      '.notice-signoff',
      '.notice-stamp'
    ];

    for (const cls of requiredClasses) {
      assert.ok(cssContent.includes(cls), `CSS must define ${cls}`);
    }

    console.log('✓ ui/css/exports.css defines all Step 43 deficiency notice styles');
  }

  console.log('\n======================================================');
  console.log('✓ ALL 7 STEP 43 VERIFICATION CHECKS PASSED SUCCESSFULLY');
  console.log('======================================================');
}

runTests().catch(err => {
  console.error('❌ Step 43 Test Suite Failed:', err);
  process.exit(1);
});
