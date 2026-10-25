/**
 * Test Step 41: Facility Readiness Status & Ground Inspection Suggester
 * Spec Reference: ROADMAP.md (Phase 7: Step 41), Guide §14
 *
 * Verifies:
 * 1. Facility Readiness Status Computation (computeOverallStatus):
 *    - Accurate resolution of EVIDENCE_COMPLETE_FOR_REVIEW, ADDITIONAL_EVIDENCE_REQUIRED, and INSPECTION_SUGGESTED.
 * 2. Specific Verification Requirement:
 *    - Missing classroom photos accurately results in ADDITIONAL_EVIDENCE_REQUIRED.
 * 3. Facility Readiness Section Component (renderReadinessSection):
 *    - Renders #infra-readiness-card with title, descriptive rationale, and status badge (#badge-readiness-status).
 * 4. One-Click Ground Inspection Suggester:
 *    - Renders button: "Recommend for Ground Inspection Checklist" (#btn-recommend-ground-inspection).
 *    - recommendForGroundInspection() queues deficient/flagged facilities into recommendedInspections.
 *    - Updates button state to "✓ Queued for Ground Inspection (N)" with .active class.
 *    - Renders #readiness-queued-alert banner and badges on individual facility cards.
 *    - Dispatches app:infra-inspection-recommended custom event with diagnostic payload.
 * 5. Facility-Level Inspection Toggle:
 *    - toggleGroundInspectionItem toggles individual items on/off.
 *    - Dispatches app:infra-item-inspection-toggled event.
 * 6. Full Panel Integration:
 *    - render() integrates readiness section seamlessly with summary metrics and checklist grid.
 * 7. CSS Stylesheet Rules:
 *    - ui/css/infra.css defines .infra-readiness-card, .btn-ground-inspection, .badge-readiness-*, and .badge-inspection-queued.
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

// Load infra_panel module
const {
  InfraPanelComponent,
  infraPanelComponent,
  INFRA_STATUS_CONFIG,
  CONFIG_ITEMS_NORMS,
  SYNTHETIC_REFERENCE_PHOTOS
} = require('../ui/js/components/infra_panel.js');

async function runTests() {
  console.log('--- Running Step 41 Test Suite: Facility Readiness Status & Ground Inspection Suggester ---');
  const comp = new InfraPanelComponent();

  // -------------------------------------------------------------
  // Test 1: Facility Readiness Status Computation
  // -------------------------------------------------------------
  console.log('Test 1: Overall Facility Status Computation Logic');
  {
    // Clean items -> EVIDENCE_COMPLETE_FOR_REVIEW
    const cleanItems = [
      { item_key: 'computer_lab_photos', status: 'EVIDENCE_COMPLETE_FOR_REVIEW' },
      { item_key: 'classroom_photos', status: 'EVIDENCE_COMPLETE_FOR_REVIEW' },
      { item_key: 'central_library_photos', status: 'EVIDENCE_COMPLETE_FOR_REVIEW' }
    ];
    assert.strictEqual(
      comp.computeOverallStatus(cleanItems),
      'EVIDENCE_COMPLETE_FOR_REVIEW',
      'All complete items must evaluate to EVIDENCE_COMPLETE_FOR_REVIEW'
    );

    // Deficient items -> ADDITIONAL_EVIDENCE_REQUIRED
    const missingItems = [
      { item_key: 'computer_lab_photos', status: 'EVIDENCE_COMPLETE_FOR_REVIEW' },
      { item_key: 'classroom_photos', status: 'ADDITIONAL_EVIDENCE_REQUIRED' },
      { item_key: 'central_library_photos', status: 'EVIDENCE_COMPLETE_FOR_REVIEW' }
    ];
    assert.strictEqual(
      comp.computeOverallStatus(missingItems),
      'ADDITIONAL_EVIDENCE_REQUIRED',
      'Any missing evidence item must evaluate overall status to ADDITIONAL_EVIDENCE_REQUIRED'
    );

    // Anomaly / Duplicate / Sub-norm -> INSPECTION_SUGGESTED
    const suggestedItems = [
      { item_key: 'computer_lab_photos', status: 'POSSIBLE_DUPLICATE_EVIDENCE' },
      { item_key: 'classroom_photos', status: 'EVIDENCE_COMPLETE_FOR_REVIEW' },
      { item_key: 'central_library_photos', status: 'EVIDENCE_COMPLETE_FOR_REVIEW' }
    ];
    assert.strictEqual(
      comp.computeOverallStatus(suggestedItems),
      'INSPECTION_SUGGESTED',
      'Duplicate photo or area deficit item must evaluate to INSPECTION_SUGGESTED'
    );

    // Mixed deficit and suggested -> ADDITIONAL_EVIDENCE_REQUIRED takes precedence
    const mixedItems = [
      { item_key: 'computer_lab_photos', status: 'POSSIBLE_DUPLICATE_EVIDENCE' },
      { item_key: 'classroom_photos', status: 'ADDITIONAL_EVIDENCE_REQUIRED' }
    ];
    assert.strictEqual(
      comp.computeOverallStatus(mixedItems),
      'ADDITIONAL_EVIDENCE_REQUIRED',
      'Missing evidence must take precedence over inspection suggested'
    );

    console.log('✓ computeOverallStatus correctly resolves COMPLETE, DEFICIENT, and INSPECTION_SUGGESTED states');
  }

  // -------------------------------------------------------------
  // Test 2: Specific Verification Requirement
  // Verification Requirement: Missing classroom photos accurately results in ADDITIONAL_EVIDENCE_REQUIRED.
  // -------------------------------------------------------------
  console.log('Test 2: Specific Verification Requirement: Missing Classroom Photos');
  {
    // A. Single item evaluation with 0 uploaded photos
    const evalResult = comp.evaluateItem('classroom_photos', []);
    assert.strictEqual(
      evalResult.status,
      'ADDITIONAL_EVIDENCE_REQUIRED',
      'Missing classroom photos (0 photos) must evaluate to ADDITIONAL_EVIDENCE_REQUIRED'
    );
    assert.strictEqual(evalResult.evidence_count, 0, 'Evidence count must be 0');
    assert.ok(evalResult.reason.includes('Insufficient evidence uploaded'), 'Reason must explain evidence insufficiency');
    assert.ok(evalResult.flags.includes('INFRA_EVIDENCE_INSUFFICIENT'), 'Flags must include INFRA_EVIDENCE_INSUFFICIENT');

    // B. Overall evaluation including the missing classroom photos
    const checklistWithMissingClass = [
      { item_key: 'computer_lab_photos', status: 'EVIDENCE_COMPLETE_FOR_REVIEW' },
      evalResult,
      { item_key: 'central_library_photos', status: 'EVIDENCE_COMPLETE_FOR_REVIEW' }
    ];
    const overall = comp.computeOverallStatus(checklistWithMissingClass);
    assert.strictEqual(
      overall,
      'ADDITIONAL_EVIDENCE_REQUIRED',
      'Checklist containing missing classroom photos must evaluate overall status to ADDITIONAL_EVIDENCE_REQUIRED'
    );

    // C. Verify DEMO-MISSING-CLASS-001 demo bundle
    const demoBundle = comp.getDefaultChecklist('DEMO-MISSING-CLASS-001');
    assert.strictEqual(demoBundle.overall_status, 'ADDITIONAL_EVIDENCE_REQUIRED');
    const classItem = demoBundle.items.find(i => i.item_key === 'classroom_photos');
    assert.ok(classItem, 'Bundle must contain classroom_photos item');
    assert.strictEqual(classItem.status, 'ADDITIONAL_EVIDENCE_REQUIRED');
    assert.strictEqual(classItem.evidence_count, 0);

    console.log('✓ Specific verification requirement satisfied: Missing classroom photos accurately results in ADDITIONAL_EVIDENCE_REQUIRED');
  }

  // -------------------------------------------------------------
  // Test 3: Facility Readiness Section Component
  // -------------------------------------------------------------
  console.log('Test 3: Facility Readiness Section Component Rendering');
  {
    // Render clean state
    const cleanData = comp.getDefaultChecklist('DEMO-CLEAN-001');
    const cleanSectionHtml = comp.renderReadinessSection(cleanData);
    assert.ok(cleanSectionHtml.includes('id="infra-readiness-card"'), 'Must contain #infra-readiness-card');
    assert.ok(cleanSectionHtml.includes('badge-readiness-complete'), 'Clean state must render badge-readiness-complete');
    assert.ok(cleanSectionHtml.includes('EVIDENCE COMPLETE FOR REVIEW'), 'Badge must display EVIDENCE COMPLETE FOR REVIEW');

    // Render deficient state
    const issuesData = comp.getDefaultChecklist('DEMO-ISSUES-001');
    const issuesSectionHtml = comp.renderReadinessSection(issuesData);
    assert.ok(issuesSectionHtml.includes('badge-readiness-missing'), 'Deficient state must render badge-readiness-missing');
    assert.ok(issuesSectionHtml.includes('ADDITIONAL EVIDENCE REQUIRED'), 'Badge must display ADDITIONAL EVIDENCE REQUIRED');

    // Render inspection suggested state
    const dupData = comp.getDefaultChecklist('DEMO-DUPLICATE-001');
    const dupSectionHtml = comp.renderReadinessSection(dupData);
    assert.ok(dupSectionHtml.includes('badge-readiness-suggested'), 'Suggested state must render badge-readiness-suggested');
    assert.ok(dupSectionHtml.includes('PHYSICAL GROUND INSPECTION SUGGESTED'), 'Badge must display PHYSICAL GROUND INSPECTION SUGGESTED');

    console.log('✓ renderReadinessSection renders appropriate badges and descriptions for all 3 readiness states');
  }

  // -------------------------------------------------------------
  // Test 4: One-Click Ground Inspection Suggester
  // -------------------------------------------------------------
  console.log('Test 4: One-Click Ground Inspection Suggester Button & Action');
  {
    eventsDispatched.length = 0;
    comp.recommendedInspections.clear();
    comp.currentAppId = 'DEMO-ISSUES-001';
    comp.currentData = comp.getDefaultChecklist('DEMO-ISSUES-001');

    // 1. Initial button rendering
    const sectionHtml = comp.renderReadinessSection(comp.currentData);
    assert.ok(sectionHtml.includes('id="btn-recommend-ground-inspection"'), 'Must render #btn-recommend-ground-inspection');
    assert.ok(
      sectionHtml.includes('Recommend for Ground Inspection Checklist'),
      'Button text must read "Recommend for Ground Inspection Checklist"'
    );

    // 2. Trigger One-Click Recommendation
    const actionResult = comp.recommendForGroundInspection();
    assert.strictEqual(actionResult.success, true, 'Action must succeed');
    assert.ok(actionResult.recommendedCount > 0, 'Must recommend at least 1 facility requiring ground check');
    assert.ok(
      actionResult.recommendedItems.includes('computer_lab_photos') || actionResult.recommendedItems.includes('classroom_photos'),
      'Deficient facilities must be queued'
    );

    // 3. Verify CustomEvent dispatch
    const recEvent = eventsDispatched.find(e => e.type === 'app:infra-inspection-recommended');
    assert.ok(recEvent, 'Must dispatch app:infra-inspection-recommended custom event');
    assert.strictEqual(recEvent.detail.applicationId, 'DEMO-ISSUES-001');
    assert.strictEqual(recEvent.detail.recommendedCount, actionResult.recommendedCount);
    assert.deepStrictEqual(recEvent.detail.recommendedItems, actionResult.recommendedItems);

    // 4. Re-render section when items are queued
    const queuedSectionHtml = comp.renderReadinessSection(comp.currentData);
    assert.ok(queuedSectionHtml.includes('id="readiness-queued-alert"'), 'Must render #readiness-queued-alert banner');
    assert.ok(queuedSectionHtml.includes('Visiting Team Queue:'), 'Must indicate visiting team physical verification queue');
    assert.ok(queuedSectionHtml.includes('✓ Queued for Ground Inspection'), 'Button text must indicate queued state');

    console.log('✓ One-click Ground Inspection Suggester triggers recommendation, queues facilities, and dispatches event');
  }

  // -------------------------------------------------------------
  // Test 5: Facility-Level Inspection Toggle
  // -------------------------------------------------------------
  console.log('Test 5: Facility-Level Inspection Item Toggle');
  {
    eventsDispatched.length = 0;
    comp.recommendedInspections.clear();

    // Toggle on
    const queued = comp.toggleGroundInspectionItem('central_library_photos');
    assert.strictEqual(queued, true, 'Toggling empty item must add it to queue');
    assert.strictEqual(comp.recommendedInspections.has('central_library_photos'), true);

    const toggleEvent1 = eventsDispatched.find(e => e.type === 'app:infra-item-inspection-toggled');
    assert.ok(toggleEvent1, 'Must dispatch app:infra-item-inspection-toggled event');
    assert.strictEqual(toggleEvent1.detail.itemKey, 'central_library_photos');
    assert.strictEqual(toggleEvent1.detail.isQueued, true);

    // Toggle off
    const unqueued = comp.toggleGroundInspectionItem('central_library_photos');
    assert.strictEqual(unqueued, false, 'Toggling already queued item must remove it');
    assert.strictEqual(comp.recommendedInspections.has('central_library_photos'), false);

    console.log('✓ toggleGroundInspectionItem successfully toggles individual facility items and dispatches events');
  }

  // -------------------------------------------------------------
  // Test 6: Full Panel Integration
  // -------------------------------------------------------------
  console.log('Test 6: Full Infrastructure Panel Integration');
  {
    comp.recommendedInspections.clear();
    const panelHtml = comp.render('DEMO-ISSUES-001');

    assert.ok(panelHtml.includes('id="infra-checklist-panel"'), 'Panel must render #infra-checklist-panel');
    assert.ok(panelHtml.includes('id="infra-summary-bar"'), 'Panel must include #infra-summary-bar');
    assert.ok(panelHtml.includes('id="infra-readiness-card"'), 'Panel must include #infra-readiness-card (Step 41)');
    assert.ok(panelHtml.includes('id="infra-items-grid"'), 'Panel must include #infra-items-grid');
    assert.ok(panelHtml.includes('id="btn-recommend-classroom_photos"'), 'Cards must include individual recommend buttons');

    console.log('✓ Full panel integration verified: Readiness card placed cleanly between metrics bar and facility grid');
  }

  // -------------------------------------------------------------
  // Test 7: CSS Stylesheet Rules
  // -------------------------------------------------------------
  console.log('Test 7: CSS Stylesheet Rules');
  {
    const cssPath = path.join(__dirname, '../ui/css/infra.css');
    assert.ok(fs.existsSync(cssPath), 'ui/css/infra.css must exist');
    const cssContent = fs.readFileSync(cssPath, 'utf-8');

    const requiredClasses = [
      '.infra-readiness-card',
      '.infra-readiness-header',
      '.badge-readiness-complete',
      '.badge-readiness-missing',
      '.badge-readiness-suggested',
      '.btn-ground-inspection',
      '.badge-inspection-queued',
      '.infra-queued-banner'
    ];

    for (const cls of requiredClasses) {
      assert.ok(cssContent.includes(cls), `CSS must define ${cls}`);
    }

    console.log('✓ ui/css/infra.css defines all Step 41 facility readiness and ground inspection styles');
  }

  console.log('\n======================================================');
  console.log('✓ ALL 7 STEP 41 VERIFICATION CHECKS PASSED SUCCESSFULLY');
  console.log('======================================================');
}

runTests().catch(err => {
  console.error('❌ Step 41 Test Suite Failed:', err);
  process.exit(1);
});
