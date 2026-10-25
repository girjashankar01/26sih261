/**
 * Test Step 45: Visiting Committee Physical Inspection Brief Generator
 * Spec Reference: ROADMAP.md (Phase 8: Step 45), Guide §11.8
 *
 * Verifies:
 * 1. Inspection Brief Data Model Resolution (getDefaultInspectionBrief):
 *    - Resolves brief_id, application_id, document_type, status, advisory_banner, campus_coordinates.
 * 2. Specific Verification Requirement:
 *    - Ground inspection brief contains facilities checklist with inspection checkboxes and campus GPS coordinates.
 * 3. Registered Campus GPS Coordinates & Geotag Anchor Display:
 *    - Renders #brief-gps-box, #brief-campus-coords with latitude and longitude (28.4728° N, 77.4891° E).
 * 4. Facilities Checklist Table & Missing Infrastructure Photos:
 *    - Renders facilities requiring physical check with inspection checkboxes and inspection_focus instructions.
 * 5. Pending Document Verifications Table:
 *    - Renders documents requiring physical certificate inspection on campus.
 * 6. Preview Modal Lifecycle, Checkbox Toggling & Custom Event Dispatch:
 *    - openPreview('inspection-brief') mounts modal and dispatches app:inspection-brief-generated.
 *    - toggleBriefCheckbox dispatches app:inspection-checkbox-toggled.
 * 7. CSS Stylesheet Rules in ui/css/exports.css:
 *    - Ensures all Step 45 inspection dossier styles are defined.
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
  let _checked = false;

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
    get checked() { return _checked; },
    set checked(val) { _checked = Boolean(val); },
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

global.navigator = {
  clipboard: {
    writeText: (txt) => Promise.resolve()
  }
};

// Load Component
const { ExportsHubComponent, exportsHubComponent } = require('../ui/js/components/exports_modal.js');

console.log('--- Running Step 45 Test Suite: Visiting Committee Physical Inspection Brief Generator ---');

// ============================================================================
// Test 1: Inspection Brief Data Model Resolution (getDefaultInspectionBrief)
// ============================================================================
console.log('Test 1: Inspection Brief Data Model Resolution');
const briefData = exportsHubComponent.getDefaultInspectionBrief('DEMO-ISSUES-001');

assert(briefData, 'Inspection brief data must be returned');
assert.strictEqual(briefData.application_id, 'DEMO-ISSUES-001', 'application_id must match requested app');
assert.strictEqual(briefData.document_type, 'PHYSICAL_INSPECTION_BRIEF', 'document_type must be PHYSICAL_INSPECTION_BRIEF');
assert.strictEqual(briefData.status, 'READY_FOR_INSPECTION_TEAM', 'status must be READY_FOR_INSPECTION_TEAM');
assert(briefData.brief_id.startsWith('INSP-BRF-'), 'brief_id must follow standard naming convention');
assert(briefData.campus_coordinates, 'campus_coordinates must be present');
assert.strictEqual(typeof briefData.campus_coordinates.latitude, 'number', 'latitude must be numeric');
assert.strictEqual(typeof briefData.campus_coordinates.longitude, 'number', 'longitude must be numeric');
assert.strictEqual(briefData.simulated, true, 'simulated flag must be true');
assert.strictEqual(briefData.decision_support_only, true, 'decision_support_only flag must be true');
assert(briefData.advisory_banner.includes('Preliminary indicators'), 'advisory_banner must contain non-punitive disclaimer');
assert(Array.isArray(briefData.facilities_to_inspect), 'facilities_to_inspect must be an array');
assert(briefData.facilities_to_inspect.length >= 2, 'Should include at least 2 facilities requiring ground verification for demo issues');
console.log('✓ Inspection brief data model resolves with READY_FOR_INSPECTION_TEAM and registered coordinates');

// ============================================================================
// Test 2: Specific Verification Requirement
// "Ground inspection brief contains facilities checklist with inspection checkboxes and campus GPS coordinates."
// ============================================================================
console.log('Test 2: Specific Verification Requirement: Facilities Checklist with Checkboxes & Campus GPS Coordinates');
const html = exportsHubComponent.renderInspectionBrief(briefData);

// 1. Must contain facilities checklist table
assert(html.includes('id="inspection-facilities-table"'), 'Must contain #inspection-facilities-table');
assert(html.includes('Facilities Checklist for Ground Verification'), 'Must contain Facilities Checklist section heading');

// 2. Must contain inspection checkboxes for facilities
assert(html.includes('type="checkbox"'), 'Must contain checkbox input elements');
assert(html.includes('class="brief-checkbox"'), 'Must contain .brief-checkbox elements');
assert(html.includes('id="chk-facility-classrooms"'), 'Must contain inspection checkbox for classrooms');
assert(html.includes('id="chk-facility-computer_center"'), 'Must contain inspection checkbox for computer center');

// 3. Must contain campus GPS coordinates
assert(html.includes('id="brief-campus-coords"'), 'Must contain #brief-campus-coords container');
assert(html.includes('28.4728° N, 77.4891° E'), 'Must display registered campus GPS coordinates');
assert(html.includes('id="brief-gps-box"'), 'Must contain #brief-gps-box coordinate callout');

console.log('✓ Specific verification requirement satisfied: Facilities checklist contains inspection checkboxes and campus GPS coordinates');

// ============================================================================
// Test 3: Registered Campus GPS Coordinates & Geotag Anchor Display
// ============================================================================
console.log('Test 3: Registered Campus GPS Coordinates & Geotag Anchor Display');
assert(html.includes('AICTE Registered Campus Coordinates'), 'Must display registered campus coordinate header');
assert(html.includes('GEO_VERIFIED_ANCHOR'), 'Must display GEO_VERIFIED_ANCHOR geotag badge');
assert(html.includes('Permissible ground tolerance radius: <strong>2.0 km</strong>'), 'Must specify 2.0 km tolerance radius');
assert(html.includes('Verify GPS reading on mobile device upon arrival'), 'Must provide guidance to calibrate on mobile device');
console.log('✓ Campus GPS coordinate box and geotag anchor display verified');

// ============================================================================
// Test 4: Facilities Checklist Content & Missing Photos Handling
// ============================================================================
console.log('Test 4: Facilities Checklist Content & Missing Infrastructure Photos');
// Classrooms missing photos check
assert(html.includes('id="facility-name-classrooms"'), 'Must render classroom facility name');
assert(html.includes('No photos provided for Classrooms (0 uploaded, minimum 1 required)'), 'Must state missing photos reason');
assert(html.includes('ADDITIONAL_EVIDENCE_REQUIRED'), 'Must flag ADDITIONAL_EVIDENCE_REQUIRED for missing photos');
assert(html.includes('Physically verify classroom count'), 'Must include specific physical inspection instructions for classrooms');

// Computer center distance discrepancy check
assert(html.includes('id="facility-name-computer_center"'), 'Must render computer center facility name');
assert(html.includes('LOCATION_METADATA_INCONSISTENT'), 'Must flag LOCATION_METADATA_INCONSISTENT');
assert(html.includes('Physically verify terminal count'), 'Must include terminal count and LAN inspection focus');

// Committee observation notes inputs
assert(html.includes('id="obs-classrooms"'), 'Must provide observation input field for classrooms');
assert(html.includes('id="obs-computer_center"'), 'Must provide observation input field for computer center');
console.log('✓ Missing infrastructure photos and inspection focus instructions verified');

// ============================================================================
// Test 5: Pending Statutory Document Verifications Table
// ============================================================================
console.log('Test 5: Pending Statutory Document Verifications Table');
assert(html.includes('id="inspection-verifications-table"'), 'Must contain #inspection-verifications-table');
assert(html.includes('id="chk-verif-doc_fire_01"'), 'Must contain checkbox for doc_fire_01 physical verification');
assert(html.includes('id="verif-doc-doc_fire_01"'), 'Must render document ID doc_fire_01');
assert(html.includes('mock_fire_service'), 'Must display verification adapter');
assert(html.includes('MANUAL_REVIEW_REQUIRED'), 'Must display verification status');
assert(html.includes('Inspect original physical Fire Safety Certificate / NOC'), 'Must specify on-site hardcopy verification instructions');
console.log('✓ Pending statutory document verifications table verified');

// ============================================================================
// Test 6: Visiting Committee Sign-off, Checkbox Toggling & Event Lifecycle
// ============================================================================
console.log('Test 6: Visiting Committee Sign-off, Checkbox Toggling & Event Lifecycle');
// Attestation section
assert(html.includes('id="brief-committee-signatures"'), 'Must render committee signatures container');
assert(html.includes('Convener / Senior Technical Expert'), 'Must include Convener signature slot');
assert(html.includes('Member / Domain Subject Expert'), 'Must include Domain Subject Expert signature slot');
assert(html.includes('Member / Architect or Regional Officer'), 'Must include Regional Officer signature slot');
assert(html.includes('id="chk-outcome-compliant"'), 'Must include Recommendation A checkbox');
assert(html.includes('id="chk-outcome-discrepancies"'), 'Must include Recommendation B checkbox');
assert(html.includes('✓ EVC GROUND BRIEFING VERIFIED'), 'Must include verified official stamp');

// Checkbox toggle test
const testChk = createMockElement('chk-facility-classrooms');
testChk.checked = true;
testChk.setAttribute('data-item-key', 'classrooms');
exportsHubComponent.toggleBriefCheckbox('chk-facility-classrooms');
const toggleEvent = eventsDispatched.find(e => e.type === 'app:inspection-checkbox-toggled');
assert(toggleEvent, 'app:inspection-checkbox-toggled event must be dispatched');
assert.strictEqual(toggleEvent.detail.checkboxId, 'chk-facility-classrooms', 'Dispatched event must include checkbox ID');
assert.strictEqual(toggleEvent.detail.checked, true, 'Dispatched event must include checked state');

// Preview Modal Lifecycle test
eventsDispatched.length = 0;
exportsHubComponent.currentAppId = 'DEMO-ISSUES-001';
const previewHost = createMockElement('export-preview-modal-host');
const modalPreviewHtml = exportsHubComponent.openPreview('inspection-brief');

assert(modalPreviewHtml.includes('inspection-brief-dossier'), 'Modal preview content must include #inspection-brief-dossier');
const generatedEvent = eventsDispatched.find(e => e.type === 'app:inspection-brief-generated');
assert(generatedEvent, 'app:inspection-brief-generated event must be dispatched');
assert.strictEqual(generatedEvent.detail.applicationId, 'DEMO-ISSUES-001');
assert.strictEqual(generatedEvent.detail.status, 'READY_FOR_INSPECTION_TEAM');
assert(generatedEvent.detail.facilitiesCount >= 2, 'Should report at least 2 facilities in payload');

// Clean application handling (0 flagged facilities)
const cleanBrief = exportsHubComponent.getDefaultInspectionBrief('DEMO-CLEAN-001');
const cleanHtml = exportsHubComponent.renderInspectionBrief(cleanBrief);
assert(cleanHtml.includes('No facilities flagged for mandatory physical inspection'), 'Clean app must indicate no flagged facilities');
assert(cleanHtml.includes('No pending statutory document verifications'), 'Clean app must indicate no pending verifications');
console.log('✓ Visiting committee sign-off, checkbox toggling, and event lifecycle verified');

// ============================================================================
// Test 7: CSS Stylesheet Rules in ui/css/exports.css
// ============================================================================
console.log('Test 7: CSS Stylesheet Rules in ui/css/exports.css');
const cssPath = path.join(__dirname, '../ui/css/exports.css');
assert(fs.existsSync(cssPath), 'ui/css/exports.css must exist');
const cssContent = fs.readFileSync(cssPath, 'utf8');

const requiredSelectors = [
  '.brief-dossier',
  '.brief-header',
  '.brief-emblem',
  '.badge-brief-status',
  '.brief-gps-box',
  '.brief-campus-coords',
  '.badge-gps-anchor',
  '.brief-table',
  '.brief-checkbox',
  '.brief-obs-input',
  '.brief-committee-signatures',
  '.brief-signatures-grid'
];

for (const sel of requiredSelectors) {
  assert(cssContent.includes(sel), `CSS must define selector: ${sel}`);
}
console.log('✓ ui/css/exports.css defines all Step 45 inspection brief styles');

console.log('\n======================================================');
console.log('✓ ALL 7 STEP 45 VERIFICATION CHECKS PASSED SUCCESSFULLY');
console.log('======================================================');
