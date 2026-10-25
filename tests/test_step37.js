/**
 * Test Step 37: Facility Checklist Inspector Layout
 * Spec Reference: ROADMAP.md (Phase 7: Step 37), Guide §14, rules/infra/EOA_RENEWAL.yaml
 *
 * Verifies:
 * 1. Exports & Schema Definitions:
 *    - InfraPanelComponent, infraPanelComponent, INFRA_STATUS_CONFIG, CONFIG_ITEMS_NORMS.
 * 2. EOA_RENEWAL.yaml Configured Facility Norms:
 *    - Computer Center / Laboratory (computer_lab_photos): min_files=2, min_area_sqm=60, claimed_form_field='lab_area_sqm'.
 *    - Instructional Classrooms (classroom_photos): min_files=2, min_area_sqm=66, geo_required=true, claimed_form_field='classroom_area_sqm'.
 *    - Central Library (central_library_photos): min_files=1, min_area_sqm=150, claimed_form_field='library_area_sqm'.
 * 3. 6 Guide §14 Status Badges:
 *    - EVIDENCE_COMPLETE_FOR_REVIEW, ADDITIONAL_EVIDENCE_REQUIRED,
 *      LOCATION_METADATA_INCONSISTENT, INSPECTION_SUGGESTED,
 *      POSSIBLE_DUPLICATE_EVIDENCE, NOT_CHECKED.
 *    - Non-negotiable: Never outputs "compliant"; no forbidden terms (fake/forged/fraud).
 * 4. Inspector DOM Layout:
 *    - .infra-panel, .infra-advisory-banner, .infra-summary-bar, .infra-items-grid.
 *    - Summary KPI cards (#kpi-infra-total, #kpi-infra-complete, #kpi-infra-missing, #kpi-infra-inspect, #kpi-infra-campus).
 * 5. Facility Norms & Claim Comparisons:
 *    - Cards render norms box displaying required file counts, min areas, and geotag requirements.
 *    - Displays claimed form values vs minimum thresholds with deficit/surplus indicators.
 * 6. Data Loading & Events:
 *    - loadInfraData fetches data and dispatches app:infra-data-loaded event.
 *    - loadAndRender updates target DOM container and dispatches app:infra-panel-rendered.
 * 7. System Integration & Stylesheet:
 *    - workspace.js integrates infra tab with loadApplication and switchTab.
 *    - ui/index.html includes infra.css and infra_panel.js.
 *    - ui/css/infra.css contains all required layout and status badge classes.
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
  let _id = initialId;
  let _innerHTML = '';

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
    outerHTML: '',
    classList: {
      add: (cls) => classes.add(cls),
      remove: (cls) => classes.delete(cls),
      contains: (cls) => classes.has(cls)
    },
    setAttribute: (k, v) => attributes.set(k, String(v)),
    getAttribute: (k) => attributes.get(k) || null,
    dataset: {},
    appendChild: (child) => { child.parentNode = el; },
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

global.document = {
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

// Mock ApiClient
global.apiClient = {
  getApplicationInfra: async (appId, category) => {
    return {
      application_id: appId,
      category: category || 'EOA_RENEWAL',
      pipeline_stage: 'S10_INFRA_CHECKLIST',
      overall_status: 'ADDITIONAL_EVIDENCE_REQUIRED',
      campus_coordinates: { latitude: 28.4728, longitude: 77.4891, name: 'Knowledge Park III, Greater Noida' },
      items: [
        {
          item_key: 'computer_lab_photos',
          label: 'Computer Center / Laboratory',
          status: 'ADDITIONAL_EVIDENCE_REQUIRED',
          reason: 'Insufficient evidence uploaded: 0 file(s) found, minimum required is 2.',
          severity: 'medium',
          evidence_count: 0,
          claimed_value: 45,
          flags: ['INFRA_EVIDENCE_INSUFFICIENT']
        },
        {
          item_key: 'classroom_photos',
          label: 'Instructional Classrooms',
          status: 'LOCATION_METADATA_INCONSISTENT',
          reason: 'Photo GPS location is 21.16 km from campus registered coordinates (allowed radius: 2.0 km).',
          severity: 'low',
          evidence_count: 2,
          claimed_value: 72,
          flags: ['INFRA_LOCATION_INCONSISTENT']
        },
        {
          item_key: 'central_library_photos',
          label: 'Central Library',
          status: 'EVIDENCE_COMPLETE_FOR_REVIEW',
          reason: 'All 1 evidence items uploaded with valid metadata ready for officer review.',
          severity: 'info',
          evidence_count: 1,
          claimed_value: 160,
          flags: []
        }
      ],
      total_items: 3
    };
  }
};

// Load infra_panel module
const {
  InfraPanelComponent,
  infraPanelComponent,
  INFRA_STATUS_CONFIG,
  CONFIG_ITEMS_NORMS
} = require('../ui/js/components/infra_panel.js');

async function runTests() {
  console.log('--- Running Step 37 Test Suite: Facility Checklist Inspector Layout ---');

  // Test 1: Exports and Component Instantiation
  console.log('Test 1: Exports and Component Instantiation');
  assert(typeof InfraPanelComponent === 'function', 'InfraPanelComponent class must be exported');
  assert(infraPanelComponent instanceof InfraPanelComponent, 'infraPanelComponent singleton must be exported');
  assert(typeof INFRA_STATUS_CONFIG === 'object', 'INFRA_STATUS_CONFIG must be exported');
  assert(typeof CONFIG_ITEMS_NORMS === 'object', 'CONFIG_ITEMS_NORMS must be exported');
  console.log('✓ Component and configuration objects exported correctly');

  // Test 2: EOA_RENEWAL.yaml Configured Facility Norms
  console.log('Test 2: EOA_RENEWAL.yaml Configured Facility Norms');
  const lab = CONFIG_ITEMS_NORMS['computer_lab_photos'];
  assert(lab, 'computer_lab_photos norm definition must exist');
  assert.strictEqual(lab.min_files, 2, 'Computer Center must require 2 photos minimum');
  assert.strictEqual(lab.min_area_sqm, 60, 'Computer Center must require 60 sqm minimum area');
  assert.strictEqual(lab.claimed_form_field, 'lab_area_sqm', 'Computer Center field must be lab_area_sqm');

  const classroom = CONFIG_ITEMS_NORMS['classroom_photos'];
  assert(classroom, 'classroom_photos norm definition must exist');
  assert.strictEqual(classroom.min_files, 2, 'Classrooms must require 2 photos minimum');
  assert.strictEqual(classroom.min_area_sqm, 66, 'Classrooms must require 66 sqm minimum area');
  assert.strictEqual(classroom.geo_required, true, 'Classrooms must require mandatory geotagging');
  assert.strictEqual(classroom.radius_km, 2.0, 'Classrooms radius must be 2.0 km');

  const library = CONFIG_ITEMS_NORMS['central_library_photos'];
  assert(library, 'central_library_photos norm definition must exist');
  assert.strictEqual(library.min_files, 1, 'Central Library must require 1 photo minimum');
  assert.strictEqual(library.min_area_sqm, 150, 'Central Library must require 150 sqm minimum area');
  assert.strictEqual(library.claimed_form_field, 'library_area_sqm', 'Central Library field must be library_area_sqm');
  console.log('✓ Configured facility norms strictly match rules/infra/EOA_RENEWAL.yaml');

  // Test 3: 6 Guide §14 Status Badges & Non-Negotiable Vocabulary
  console.log('Test 3: 6 Guide §14 Status Badges & Non-Negotiable Vocabulary');
  const requiredStatuses = [
    'EVIDENCE_COMPLETE_FOR_REVIEW',
    'ADDITIONAL_EVIDENCE_REQUIRED',
    'LOCATION_METADATA_INCONSISTENT',
    'INSPECTION_SUGGESTED',
    'POSSIBLE_DUPLICATE_EVIDENCE',
    'NOT_CHECKED'
  ];
  for (const status of requiredStatuses) {
    assert(INFRA_STATUS_CONFIG[status], `INFRA_STATUS_CONFIG must define status ${status}`);
    assert(INFRA_STATUS_CONFIG[status].label, `Status ${status} must have label`);
    assert(INFRA_STATUS_CONFIG[status].class, `Status ${status} must have CSS class`);
  }

  // Verify non-negotiable: Never outputs "compliant"
  for (const [key, cfg] of Object.entries(INFRA_STATUS_CONFIG)) {
    assert(!cfg.label.toLowerCase().includes('compliant'), `Status ${key} label must not contain "compliant" per Guide §14`);
    assert(!cfg.desc.toLowerCase().includes('compliant'), `Status ${key} desc must not contain "compliant" per Guide §14`);
    // Ensure no forbidden defamatory terms per AGENTS.md
    for (const forbidden of ['fraud', 'fake', 'forged']) {
      assert(!cfg.label.toLowerCase().includes(forbidden), `Status ${key} must not contain forbidden word "${forbidden}"`);
      assert(!cfg.desc.toLowerCase().includes(forbidden), `Status ${key} must not contain forbidden word "${forbidden}"`);
    }
  }
  console.log('✓ 6 Guide §14 status badges verified with honest vocabulary (no "compliant", no forbidden terms)');

  // Test 4: Layout Rendering & Advisory Banner
  console.log('Test 4: Layout Rendering & Advisory Banner');
  const comp = new InfraPanelComponent();
  const html = comp.render('DEMO-ISSUES-001');

  assert(html.includes('class="infra-panel"'), 'Rendered HTML must contain .infra-panel root');
  assert(html.includes('class="infra-advisory-banner"'), 'Rendered HTML must contain .infra-advisory-banner');
  assert(html.includes('SYNTHETIC NORMS'), 'Banner must display SYNTHETIC NORMS badge');
  assert(html.includes('class="infra-summary-bar"'), 'Rendered HTML must contain .infra-summary-bar');
  assert(html.includes('id="kpi-infra-total"'), 'Summary bar must contain #kpi-infra-total');
  assert(html.includes('id="kpi-infra-complete"'), 'Summary bar must contain #kpi-infra-complete');
  assert(html.includes('id="kpi-infra-missing"'), 'Summary bar must contain #kpi-infra-missing');
  assert(html.includes('id="kpi-infra-inspect"'), 'Summary bar must contain #kpi-infra-inspect');
  assert(html.includes('id="kpi-infra-campus"'), 'Summary bar must contain #kpi-infra-campus');
  assert(html.includes('class="infra-items-grid"'), 'Rendered HTML must contain .infra-items-grid');
  console.log('✓ Inspector layout, advisory banner, and summary metrics bar rendered properly');

  // Test 5: Facility Norms Display on Item Cards
  console.log('Test 5: Facility Norms Display on Item Cards');
  // Computer Center card checks
  assert(html.includes('id="infra-card-computer_lab_photos"'), 'Card for computer_lab_photos must exist');
  assert(html.includes('2 photos minimum'), 'Must display "2 photos minimum" norm');
  assert(html.includes('60 sqm minimum area'), 'Must display "60 sqm minimum area" norm');
  assert(html.includes('lab_area_sqm'), 'Must display form field name lab_area_sqm');
  assert(html.includes('45 sqm'), 'Must display claimed value of 45 sqm');
  assert(html.includes('DEFICIT'), 'Must indicate area deficit for below-minimum claim');

  // Instructional Classrooms card checks
  assert(html.includes('id="infra-card-classroom_photos"'), 'Card for classroom_photos must exist');
  assert(html.includes('66 sqm minimum area'), 'Must display "66 sqm minimum area" norm');
  assert(html.includes('Mandatory GPS (radius: 2.0 km)'), 'Must display mandatory geotag norm');
  assert(html.includes('classroom_area_sqm'), 'Must display form field name classroom_area_sqm');

  // Central Library card checks
  assert(html.includes('id="infra-card-central_library_photos"'), 'Card for central_library_photos must exist');
  assert(html.includes('1 photo minimum'), 'Must display "1 photo minimum" norm');
  assert(html.includes('150 sqm minimum area'), 'Must display "150 sqm minimum area" norm');
  assert(html.includes('library_area_sqm'), 'Must display form field name library_area_sqm');
  console.log('✓ All 3 configured facility item cards display required norms and area comparisons');

  // Test 6: Data Loading and DOM Container Population
  console.log('Test 6: Data Loading and DOM Container Population');
  eventsDispatched.length = 0;
  const loadedData = await comp.loadInfraData('DEMO-ISSUES-001');
  assert(loadedData, 'loadInfraData must return data');
  assert.strictEqual(loadedData.items.length, 3, 'Must return 3 configured items');

  const loadedEvent = eventsDispatched.find(e => e.type === 'app:infra-data-loaded');
  assert(loadedEvent, 'Must dispatch app:infra-data-loaded event');
  assert.strictEqual(loadedEvent.detail.applicationId, 'DEMO-ISSUES-001');
  assert.strictEqual(loadedEvent.detail.totalItems, 3);

  // loadAndRender
  const container = document.getElementById('workspace-infra-content');
  await comp.loadAndRender('DEMO-ISSUES-001', 'workspace-infra-content');
  assert(container.innerHTML.includes('infra-checklist-panel'), 'Container must be populated with panel HTML');

  const renderEvent = eventsDispatched.find(e => e.type === 'app:infra-panel-rendered');
  assert(renderEvent, 'Must dispatch app:infra-panel-rendered event');
  assert.strictEqual(renderEvent.detail.count, 3);
  console.log('✓ Data loading and DOM container rendering succeed with custom events');

  // Test 7: System Integration in workspace.js and ui/index.html
  console.log('Test 7: System Integration in workspace.js and ui/index.html');
  const workspaceJs = fs.readFileSync(path.join(__dirname, '../ui/js/components/workspace.js'), 'utf8');
  assert(workspaceJs.includes("tabId === 'infra'") && workspaceJs.includes('infraPanelComponent.loadAndRender'),
    'workspace.js switchTab must invoke infraPanelComponent.loadAndRender for infra tab');
  assert(workspaceJs.includes("this.activeTab === 'infra'") && workspaceJs.includes('infraPanelComponent.loadAndRender'),
    'workspace.js loadApplication must invoke infraPanelComponent.loadAndRender for active infra tab');
  assert(workspaceJs.includes('workspace-pane-infra') && workspaceJs.includes('workspace-infra-content'),
    'workspace.js must define pane workspace-pane-infra with #workspace-infra-content container');

  const indexHtml = fs.readFileSync(path.join(__dirname, '../ui/index.html'), 'utf8');
  assert(indexHtml.includes('/static/css/infra.css'), 'ui/index.html must link /static/css/infra.css');
  assert(indexHtml.includes('/static/js/components/infra_panel.js'), 'ui/index.html must include infra_panel.js');
  console.log('✓ System integration verified in workspace.js and ui/index.html');

  // Test 8: CSS File Verification
  console.log('Test 8: CSS File Verification');
  const infraCss = fs.readFileSync(path.join(__dirname, '../ui/css/infra.css'), 'utf8');
  assert(infraCss.includes('.infra-panel'), 'CSS must define .infra-panel');
  assert(infraCss.includes('.infra-advisory-banner'), 'CSS must define .infra-advisory-banner');
  assert(infraCss.includes('.infra-summary-bar'), 'CSS must define .infra-summary-bar');
  assert(infraCss.includes('.infra-items-grid'), 'CSS must define .infra-items-grid');
  assert(infraCss.includes('.infra-item-card'), 'CSS must define .infra-item-card');
  assert(infraCss.includes('.infra-norms-box'), 'CSS must define .infra-norms-box');
  assert(infraCss.includes('.infra-claim-comparison'), 'CSS must define .infra-claim-comparison');
  assert(infraCss.includes('.badge-infra-complete'), 'CSS must define .badge-infra-complete');
  assert(infraCss.includes('.badge-infra-missing'), 'CSS must define .badge-infra-missing');
  assert(infraCss.includes('.badge-infra-geo-error'), 'CSS must define .badge-infra-geo-error');
  assert(infraCss.includes('.badge-infra-inspect'), 'CSS must define .badge-infra-inspect');
  assert(infraCss.includes('.badge-infra-duplicate'), 'CSS must define .badge-infra-duplicate');
  assert(infraCss.includes('.badge-infra-not_checked'), 'CSS must define .badge-infra-not_checked');
  console.log('✓ ui/css/infra.css defines all required styles and status badges');

  console.log('\n======================================================');
  console.log('✓ ALL 8 STEP 37 VERIFICATION CHECKS PASSED SUCCESSFULLY');
  console.log('======================================================');
}

runTests().catch(err => {
  console.error('\n❌ STEP 37 TEST FAILED:', err);
  process.exit(1);
});
