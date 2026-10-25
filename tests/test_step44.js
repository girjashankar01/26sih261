/**
 * Test Step 44: Deficiency Notice Internal Tag Omission Filter
 * Spec Reference: ROADMAP.md (Phase 8: Step 44), Guide §11.8
 *
 * Verifies:
 * 1. Filter Deficiencies Logic (filterDeficiencies):
 *    - Omits dismissed findings (status === 'dismissed' / lifecycle === 'dismissed').
 *    - Omits internal forensic signals (EDITING_TOOL, INCREMENTAL_UPDATE, FONT_CORRUPTION, C2_FORENSICS).
 *    - Omits cross-institution duplicate pHash identities (POSSIBLE_DUPLICATE_PHOTO, PEER_MATCH, HAMMING_DISTANCE).
 * 2. Specific Verification Requirement:
 *    - Dismissed finding does not appear in the generated deficiency notice.
 * 3. Incremental Dismissal & Zero Deficiencies State:
 *    - Dismissing FIND-ISSUE-001 leaves only FIND-ISSUE-002 in the letter.
 *    - Dismissing both findings results in 0 deficiencies and renders clean compliance message.
 * 4. Internal Forensic Tags Omission Verification:
 *    - Synthetic findings containing forensic flags are strictly filtered from institutional output.
 * 5. Cross-Institution Duplicate Hash Omission Verification:
 *    - Reused photo / pHash duplicate finding is strictly filtered from institutional notice.
 * 6. Automated Event Wiring:
 *    - Listening to app:action-modal-submitted automatically updates dismissed finding list.
 *    - Dispatches app:deficiency-omission-applied custom event.
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

const windowListeners = {};
global.window = {
  document: global.document,
  addEventListener: (ev, fn) => {
    windowListeners[ev] = windowListeners[ev] || [];
    windowListeners[ev].push(fn);
  },
  dispatchEvent: (event) => {
    eventsDispatched.push(event);
    const handlers = windowListeners[event.type] || [];
    for (const h of handlers) h(event);
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
  console.log('--- Running Step 44 Test Suite: Deficiency Notice Internal Tag Omission Filter ---');
  const hub = new ExportsHubComponent();

  // -------------------------------------------------------------
  // Test 1: filterDeficiencies Method Functionality
  // -------------------------------------------------------------
  console.log('Test 1: filterDeficiencies Core Filter Logic');
  {
    const mixedFindings = [
      {
        finding_id: 'FIND-VALID-001',
        rule_id: 'FIRE_SAFETY_VALIDITY',
        category: 'EXPIRED_CERTIFICATE',
        observed: 'Fire NOC expired',
        expected: 'Valid NOC',
        action_required: 'Upload renewed NOC',
        handbook_reference: 'Chapter II Clause 4.3',
        status: 'OPEN'
      },
      {
        finding_id: 'FIND-DISMISSED-001',
        rule_id: 'BUILDING_PLAN_APPROVAL',
        category: 'MISSING_DOCUMENT',
        observed: 'Plan missing in slot',
        expected: 'Valid sanctioned plan',
        status: 'dismissed'
      },
      {
        finding_id: 'FIND-FORENSIC-001',
        rule_id: 'PDF_EDITING_TOOL_DETECTED',
        category: 'EDITING_TOOL_IN_METADATA',
        observed: 'Adobe Photoshop CS6 Producer in metadata',
        expected: 'Clean unedited document',
        status: 'OPEN'
      },
      {
        finding_id: 'FIND-DUP-001',
        rule_id: 'INFRA_PHOTO_DUPLICATE',
        category: 'POSSIBLE_DUPLICATE_PHOTO',
        observed: 'Perceptual hash matches peer institution (Hamming distance: 2)',
        expected: 'Original facility photo',
        status: 'OPEN'
      }
    ];

    const filtered = hub.filterDeficiencies(mixedFindings);

    // Only FIND-VALID-001 should remain
    assert.strictEqual(filtered.length, 1, 'Filter must omit dismissed, forensic, and duplicate items');
    assert.strictEqual(filtered[0].finding_id, 'FIND-VALID-001');

    console.log('✓ filterDeficiencies cleanly strips dismissed findings, internal forensic flags, and duplicate pHash identities');
  }

  // -------------------------------------------------------------
  // Test 2: Specific Verification Requirement
  // Verification Requirement: Dismissed finding does not appear in the generated deficiency notice.
  // -------------------------------------------------------------
  console.log('Test 2: Specific Verification Requirement: Dismissed Finding Omission');
  {
    hub.dismissedFindingIds.clear();
    hub.currentAppId = 'DEMO-ISSUES-001';

    // 1. Initial State: Both findings are present
    const initialNotice = hub.getDefaultDeficiencyNotice('DEMO-ISSUES-001');
    assert.strictEqual(initialNotice.deficiencies.length, 2, 'Initial notice must have 2 deficiencies');

    const initialLetterHtml = hub.renderDeficiencyNoticeLetter(initialNotice);
    assert.ok(initialLetterHtml.includes('row-def-FIND-ISSUE-001'), 'FIND-ISSUE-001 must be present initially');
    assert.ok(initialLetterHtml.includes('row-def-FIND-ISSUE-002'), 'FIND-ISSUE-002 must be present initially');
    assert.ok(initialLetterHtml.includes('Certificate expired on 2026-01-15'));

    // 2. Dismiss FIND-ISSUE-001 (Fire Safety finding overridden by officer)
    hub.dismissFinding('FIND-ISSUE-001');
    assert.strictEqual(hub.dismissedFindingIds.has('FIND-ISSUE-001'), true);

    // 3. Re-render notice letter post-dismissal
    const filteredLetterHtml = hub.renderDeficiencyNoticeLetter(initialNotice);

    // ASSERTION: FIND-ISSUE-001 MUST NOT APPEAR IN THE GENERATED DEFICIENCY NOTICE
    assert.strictEqual(
      filteredLetterHtml.includes('row-def-FIND-ISSUE-001'),
      false,
      'Dismissed finding FIND-ISSUE-001 must not appear in the generated deficiency notice'
    );
    assert.strictEqual(
      filteredLetterHtml.includes('FIRE_SAFETY_VALIDITY'),
      false,
      'Dismissed rule ID FIRE_SAFETY_VALIDITY must not appear in the generated deficiency notice'
    );
    assert.strictEqual(
      filteredLetterHtml.includes('Certificate expired on 2026-01-15'),
      false,
      'Dismissed observed finding text must not appear in the generated deficiency notice'
    );

    // Remaining finding FIND-ISSUE-002 (Land Area) MUST still be present
    assert.ok(
      filteredLetterHtml.includes('row-def-FIND-ISSUE-002'),
      'Undismissed finding FIND-ISSUE-002 must remain in the generated deficiency notice'
    );
    assert.ok(filteredLetterHtml.includes('LAND_AREA_NORMS'));
    assert.ok(filteredLetterHtml.includes('1.85 Acres'));

    console.log('✓ Specific verification requirement satisfied: Dismissed finding does not appear in the generated deficiency notice');
  }

  // -------------------------------------------------------------
  // Test 3: Incremental Dismissal & Zero Deficiencies State
  // -------------------------------------------------------------
  console.log('Test 3: Zero Deficiencies State after Full Dismissal');
  {
    // Dismiss remaining finding FIND-ISSUE-002
    hub.dismissFinding('FIND-ISSUE-002');
    assert.strictEqual(hub.dismissedFindingIds.size, 2);

    const emptyNotice = hub.getDefaultDeficiencyNotice('DEMO-ISSUES-001');
    assert.strictEqual(emptyNotice.deficiencies_count, 0, 'Count must drop to 0 after all findings dismissed');
    assert.strictEqual(emptyNotice.deficiencies.length, 0);

    const emptyLetterHtml = hub.renderDeficiencyNoticeLetter(emptyNotice);
    assert.ok(
      emptyLetterHtml.includes('No open rectifiable discrepancies identified'),
      'Letter must display clean compliance notice when all deficiencies are resolved/dismissed'
    );
    assert.ok(!emptyLetterHtml.includes('row-def-FIND-ISSUE-002'));

    console.log('✓ Full dismissal transitions letter cleanly to zero-deficiencies compliance state');
  }

  // -------------------------------------------------------------
  // Test 4: Internal Forensic Signals Omission Filter
  // -------------------------------------------------------------
  console.log('Test 4: Internal Forensic Signals Omission');
  {
    const forensicFindings = [
      {
        finding_id: 'FIND-FOR-01',
        rule_id: 'C2_METADATA_EDITING_TOOL',
        category: 'EDITING_TOOL_IN_METADATA',
        observed: 'Adobe Photoshop Producer present',
        status: 'OPEN'
      },
      {
        finding_id: 'FIND-FOR-02',
        rule_id: 'PDF_INCREMENTAL_UPDATE',
        category: 'INCREMENTAL_UPDATE_PRESENT',
        observed: 'Multiple EOF markers detected',
        status: 'OPEN'
      },
      {
        finding_id: 'FIND-FOR-03',
        rule_id: 'FONT_SANITY_LOW',
        category: 'FONT_CORRUPTION_SUSPECTED',
        observed: 'Private use character mapping',
        status: 'OPEN'
      }
    ];

    const result = hub.filterDeficiencies(forensicFindings);
    assert.strictEqual(result.length, 0, 'All internal forensic signals must be filtered out');

    console.log('✓ Internal forensic signals strictly excluded from institutional notices');
  }

  // -------------------------------------------------------------
  // Test 5: Cross-Institution Duplicate Hash Omission Filter
  // -------------------------------------------------------------
  console.log('Test 5: Cross-Institution Duplicate pHash Omission');
  {
    const dupFindings = [
      {
        finding_id: 'FIND-DUP-01',
        rule_id: 'INFRA_PHOTO_DUPLICATE',
        category: 'POSSIBLE_DUPLICATE_PHOTO',
        observed: 'Perceptual hash matches peer institution APP-CONFIDENTIAL-**** (Hamming distance: 2)',
        status: 'OPEN'
      },
      {
        finding_id: 'FIND-DUP-02',
        rule_id: 'S10_PHASH_COLLISION',
        category: 'POSSIBLE_DUPLICATE_EVIDENCE',
        observed: 'Collision with external institution evidence',
        status: 'OPEN'
      }
    ];

    const result = hub.filterDeficiencies(dupFindings);
    assert.strictEqual(result.length, 0, 'Cross-institution duplicate pHash identities must be filtered out');

    console.log('✓ Cross-institution duplicate pHash identities strictly excluded from institutional notices');
  }

  // -------------------------------------------------------------
  // Test 6: Automated Event Wiring
  // -------------------------------------------------------------
  console.log('Test 6: Automated Event Wiring with Officer Action Modal');
  {
    hub.dismissedFindingIds.clear();
    eventsDispatched.length = 0;

    // Simulate officer dismissing a finding via app:action-modal-submitted event
    global.window.dispatchEvent(new CustomEvent('app:action-modal-submitted', {
      detail: {
        applicationId: 'DEMO-ISSUES-001',
        findingId: 'FIND-ISSUE-001',
        actionName: 'dismiss'
      }
    }));

    // Verify finding was added to dismissed list
    assert.strictEqual(hub.dismissedFindingIds.has('FIND-ISSUE-001'), true);

    // Verify app:deficiency-omission-applied event was dispatched
    const omEvent = eventsDispatched.find(e => e.type === 'app:deficiency-omission-applied');
    assert.ok(omEvent, 'Must dispatch app:deficiency-omission-applied event');
    assert.strictEqual(omEvent.detail.dismissedFindingId, 'FIND-ISSUE-001');

    console.log('✓ Officer action modal event integration automatically filters dismissed finding and notifies UI');
  }

  console.log('\n======================================================');
  console.log('✓ ALL 6 STEP 44 VERIFICATION CHECKS PASSED SUCCESSFULLY');
  console.log('======================================================');
}

runTests().catch(err => {
  console.error('❌ Step 44 Test Suite Failed:', err);
  process.exit(1);
});
