/**
 * Test Step 39: Campus Geotag Inspector & Haversine Distance Calculator
 * Spec Reference: ROADMAP.md (Phase 7: Step 39), Guide §14
 *
 * Verifies:
 * 1. Haversine Distance Calculator Function:
 *    - calculateHaversineKm accurately computes great-circle distance using WGS-84 mean radius.
 *    - Validates Greater Noida to Noida Sec 62 (~21.16 km), self-distance (0 km), and 100m proximity (~0.08 km).
 * 2. Specific Verification Requirement:
 *    - Photo taken within 100m of campus displays green On-Campus GPS (0.08 km) badge.
 *    - Photo taken in different city triggers red LOCATION_METADATA_INCONSISTENT warning badge.
 * 3. Distance Meter Gauge Component:
 *    - Renders #meter-gauge with track, 2.0 km threshold pin, and distance fill bar (gauge-valid vs gauge-exceeded).
 * 4. Geodesic Radar SVG Viewport:
 *    - Renders SVG radar canvas with concentric range rings, campus center anchor, photo coordinate pin, and simulation banner.
 * 5. Campus Geotag Inspector Modal Lifecycle:
 *    - inspectGeotag mounts #infra-geotag-modal in DOM.
 *    - Displays registered campus coordinates vs photo coordinates and Haversine distance breakdown.
 *    - Dispatches app:infra-geotag-inspected event with full geodesic payload.
 *    - closeModal cleanly clears modal.
 * 6. Facility Card Action Integration:
 *    - Facility cards render Geotag Inspector button (btn-geotag-*) wired to inspectGeotag().
 * 7. CSS Stylesheet Rules:
 *    - ui/css/infra.css defines .badge-on-campus-gps, .badge-within-perimeter, .infra-meter-gauge, and .infra-radar-box.
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
  console.log('--- Running Step 39 Test Suite: Campus Geotag Inspector & Haversine Distance ---');

  const comp = new InfraPanelComponent();

  // Test 1: Haversine Distance Calculator Function
  console.log('Test 1: Haversine Distance Calculator Function');
  assert(typeof comp.calculateHaversineKm === 'function', 'calculateHaversineKm must be defined on component');

  // A: Distance to self is 0.0 km
  const dSelf = comp.calculateHaversineKm(28.4728, 77.4891, 28.4728, 77.4891);
  assert.strictEqual(dSelf, 0.0, 'Distance to self must be 0.0 km');

  // B: Greater Noida (28.472, 77.489) to Noida Sec 62 (28.628, 77.365) ~ 21.16 km
  const dFar = comp.calculateHaversineKm(28.472, 77.489, 28.628, 77.365);
  assert(Math.abs(dFar - 21.16) < 0.5, `Distance should be ~21.16 km, got ${dFar}`);

  // C: 80 meter on-campus proximity (28.4728, 77.4891 vs 28.4735, 77.4893) ~ 0.08 km
  const dClose = comp.calculateHaversineKm(28.4728, 77.4891, 28.4735, 77.4893);
  assert(Math.abs(dClose - 0.08) < 0.02, `Distance should be ~0.08 km (80m), got ${dClose}`);
  console.log('✓ Haversine mathematical calculations verified against geodesic ground truth');

  // Test 2: Specific Verification Requirement: Proximity Badge Formatter
  console.log('Test 2: Specific Verification Requirement: Proximity Badge Formatter');
  assert(typeof comp.formatProximityBadge === 'function', 'formatProximityBadge must be defined');

  // Case A: Photo within 100m (0.08 km) displays green On-Campus GPS (0.08 km) badge
  const badge80m = comp.formatProximityBadge(0.08);
  assert(badge80m.includes('On-Campus GPS (0.08 km)'), 'Badge must display "On-Campus GPS (0.08 km)"');
  assert(badge80m.includes('badge-on-campus-gps') || badge80m.includes('badge-pass'), 'Badge must have green pass styling');
  assert(badge80m.includes('data-proximity="on-campus"'), 'Badge must tag data-proximity="on-campus"');

  // Case B: Photo taken in different city (21.16 km) triggers red LOCATION_METADATA_INCONSISTENT warning
  const badgeFarCity = comp.formatProximityBadge(21.16);
  assert(badgeFarCity.includes('LOCATION_METADATA_INCONSISTENT (21.16 km)'), 'Badge must display "LOCATION_METADATA_INCONSISTENT (21.16 km)"');
  assert(badgeFarCity.includes('badge-infra-geo-error') || badgeFarCity.includes('badge-danger'), 'Badge must have red alert styling');
  assert(badgeFarCity.includes('data-proximity="inconsistent"'), 'Badge must tag data-proximity="inconsistent"');

  // Case C: Photo within 2.0 km perimeter (e.g. 1.20 km) displays green Within Campus Perimeter badge
  const badge1200m = comp.formatProximityBadge(1.20);
  assert(badge1200m.includes('Within Campus Perimeter (1.20 km)'), 'Badge must display "Within Campus Perimeter (1.20 km)"');
  assert(badge1200m.includes('data-proximity="within-perimeter"'), 'Badge must tag data-proximity="within-perimeter"');
  console.log('✓ Specific verification requirement satisfied: Photo within 100m renders green On-Campus GPS (0.08 km) badge; distant photo renders red LOCATION_METADATA_INCONSISTENT warning');

  // Test 3: Distance Meter Gauge Component
  console.log('Test 3: Distance Meter Gauge Component');
  assert(typeof comp.renderDistanceGauge === 'function', 'renderDistanceGauge must be defined');

  // Valid gauge (0.08 km)
  const gaugeValid = comp.renderDistanceGauge(0.08, 2.0);
  assert(gaugeValid.includes('id="meter-gauge"'), 'Must render #meter-gauge');
  assert(gaugeValid.includes('id="gauge-track"'), 'Must render #gauge-track');
  assert(gaugeValid.includes('id="gauge-fill"'), 'Must render #gauge-fill');
  assert(gaugeValid.includes('gauge-valid'), 'Gauge fill must have class gauge-valid for distance <= 2.0 km');
  assert(gaugeValid.includes('2.0 km Limit'), 'Gauge track must display 2.0 km threshold pin');

  // Exceeded gauge (21.16 km)
  const gaugeExceeded = comp.renderDistanceGauge(21.16, 2.0);
  assert(gaugeExceeded.includes('gauge-exceeded'), 'Gauge fill must have class gauge-exceeded for distance > 2.0 km');
  assert(gaugeExceeded.includes('21.16 km'), 'Gauge must display 21.16 km distance value');
  console.log('✓ Distance meter gauge rendering verified for valid and exceeded distances');

  // Test 4: Geodesic Radar SVG Rendering
  console.log('Test 4: Geodesic Radar SVG Rendering');
  assert(typeof comp.renderGeotagRadarSvg === 'function', 'renderGeotagRadarSvg must be defined');
  const campus = { latitude: 28.4728, longitude: 77.4891, name: 'Knowledge Park III, Greater Noida' };
  const photoFar = { file_id: 'photo_class_01', latitude: 28.6280, longitude: 77.3650 };

  const radarHtml = comp.renderGeotagRadarSvg(photoFar, campus, 21.16, 2.0);
  assert(radarHtml.includes('id="radar-box-photo_class_01"'), 'Radar container must be rendered');
  assert(radarHtml.includes('class="infra-radar-svg"'), 'SVG radar element must be rendered');
  assert(radarHtml.includes('CAMPUS ANCHOR'), 'Radar must display campus center anchor');
  assert(radarHtml.includes('2.0 km Norm Limit'), 'Radar must mark 2.0 km perimeter ring');
  assert(radarHtml.includes('OUTSIDE'), 'Radar marker must flag outside perimeter status');
  assert(radarHtml.includes('SIMULATED GEOSPATIAL RADAR · PS 26261'), 'Radar must show simulation notice');
  console.log('✓ Geodesic radar SVG canvas rendering verified');

  // Test 5: Campus Geotag Inspector Modal Lifecycle
  console.log('Test 5: Campus Geotag Inspector Modal Lifecycle');
  eventsDispatched.length = 0;
  comp.currentAppId = 'DEMO-ISSUES-001';

  // Open Geotag Inspector for classroom_photos (21.16 km far city)
  const modalHtmlFar = comp.inspectGeotag('classroom_photos');
  assert(modalHtmlFar.includes('id="infra-geotag-modal"'), 'Modal must render #infra-geotag-modal backdrop');
  assert(modalHtmlFar.includes('Campus Geotag Inspector'), 'Modal must display inspector title');
  assert(modalHtmlFar.includes('LOCATION_METADATA_INCONSISTENT'), 'Modal must display red warning badge for divergent photo');
  assert(modalHtmlFar.includes('21.16 km'), 'Modal must display calculated 21.16 km distance');
  assert(modalHtmlFar.includes('28.472800° N, 77.489100° E'), 'Modal must display registered campus coordinates');
  assert(modalHtmlFar.includes('28.628000° N, 77.365000° E'), 'Modal must display photo coordinates');

  const inspectedEvent = eventsDispatched.find(e => e.type === 'app:infra-geotag-inspected');
  assert(inspectedEvent, 'Must dispatch app:infra-geotag-inspected event');
  assert.strictEqual(inspectedEvent.detail.applicationId, 'DEMO-ISSUES-001');
  assert.strictEqual(inspectedEvent.detail.itemKey, 'classroom_photos');
  assert.strictEqual(inspectedEvent.detail.isConsistent, false);
  assert.strictEqual(inspectedEvent.detail.isOnCampus, false);
  assert(Math.abs(inspectedEvent.detail.distanceKm - 21.16) < 0.5);

  // Close modal and test cleanup
  comp.closeModal();
  const host = document.getElementById('infra-modal-host');
  assert(!host || host.innerHTML === '', 'closeModal must clear modal host HTML');

  // Open Geotag Inspector for central_library_photos (0.03 km on-campus)
  eventsDispatched.length = 0;
  const modalHtmlClose = comp.inspectGeotag('central_library_photos');
  assert(modalHtmlClose.includes('On-Campus GPS (0.03 km)'), 'Modal must display green On-Campus GPS badge for library');
  const libEvent = eventsDispatched.find(e => e.type === 'app:infra-geotag-inspected');
  assert(libEvent, 'Must dispatch event for library photo');
  assert.strictEqual(libEvent.detail.isConsistent, true);
  assert.strictEqual(libEvent.detail.isOnCampus, true);
  comp.closeModal();
  console.log('✓ Modal lifecycle, coordinate comparison table, and custom event dispatches verified');

  // Test 6: Facility Card Action Integration
  console.log('Test 6: Facility Card Action Integration');
  const panelHtml = comp.render('DEMO-ISSUES-001');
  assert(panelHtml.includes('id="btn-geotag-computer_lab_photos"'), 'Card must have Geotag Inspector button for lab');
  assert(panelHtml.includes('id="btn-geotag-classroom_photos"'), 'Card must have Geotag Inspector button for classroom');
  assert(panelHtml.includes('id="btn-geotag-central_library_photos"'), 'Card must have Geotag Inspector button for library');
  assert(panelHtml.includes("inspectGeotag('classroom_photos')"), 'Button must be wired to inspectGeotag');
  console.log('✓ Facility card action button integration verified');

  // Test 7: CSS Stylesheet Rules
  console.log('Test 7: CSS Stylesheet Rules');
  const infraCss = fs.readFileSync(path.join(__dirname, '../ui/css/infra.css'), 'utf8');
  assert(infraCss.includes('.badge-on-campus-gps'), 'CSS must define .badge-on-campus-gps');
  assert(infraCss.includes('.badge-within-perimeter'), 'CSS must define .badge-within-perimeter');
  assert(infraCss.includes('.infra-meter-gauge'), 'CSS must define .infra-meter-gauge');
  assert(infraCss.includes('.infra-gauge-track'), 'CSS must define .infra-gauge-track');
  assert(infraCss.includes('.infra-gauge-fill'), 'CSS must define .infra-gauge-fill');
  assert(infraCss.includes('.infra-gauge-threshold-pin'), 'CSS must define .infra-gauge-threshold-pin');
  assert(infraCss.includes('.infra-radar-box'), 'CSS must define .infra-radar-box');
  assert(infraCss.includes('.infra-radar-svg'), 'CSS must define .infra-radar-svg');
  console.log('✓ ui/css/infra.css defines all Step 39 geotag inspector styles');

  console.log('\n======================================================');
  console.log('✓ ALL 7 STEP 39 VERIFICATION CHECKS PASSED SUCCESSFULLY');
  console.log('======================================================');
}

runTests().catch(err => {
  console.error('\n❌ STEP 39 TEST FAILED:', err);
  process.exit(1);
});
