/**
 * Test Step 38: Evidence Photo Gallery & EXIF Metadata Viewer
 * Spec Reference: ROADMAP.md (Phase 7: Step 38), Guide §5.3, §14
 *
 * Verifies:
 * 1. Component Method Integrity:
 *    - renderThumbnailItem, renderPhotoCanvasSvg, renderExifCard, renderPhotoModal,
 *      openExifModal, closeModal, openGallery exist.
 *    - SYNTHETIC_REFERENCE_PHOTOS constant is defined and exported.
 * 2. Thumbnail Grid Rendering on Item Cards:
 *    - Renders .infra-photo-thumbnails-grid with interactive thumbnails for items with uploads.
 *    - Renders .infra-photo-empty state with benchmark button for items with 0 uploads.
 * 3. Specific Verification Requirement:
 *    - Synthetic lab photo displays EXIF metadata card.
 *    - Card renders Camera Make (Canon), Model (EOS R6 Mark II), Lens (RF24-105mm F4 L IS USM),
 *      Focal Length (24.0 mm), Capture Date/Time (2026-03-11), Exposure & ISO, Dimensions (6000 × 4000).
 * 4. Photo Canvas Viewfinder Simulation:
 *    - Canvas box renders SVG with reticle, rule of thirds, HUD data, and simulated watermark banner.
 * 5. Multi-Facility EXIF Coverage:
 *    - Classroom photo renders Apple iPhone 15 Pro with 21.16 km distance outside campus perimeter.
 *    - Central library photo renders Sony ILCE-7M4 with on-campus perimeter badge.
 * 6. Modal Lifecycle & Custom Event Dispatch:
 *    - openExifModal mounts #infra-photo-modal into DOM and dispatches app:infra-photo-inspected event.
 *    - closeModal cleanly clears modal host.
 * 7. CSS Stylesheet Rules:
 *    - ui/css/infra.css defines all thumbnail grid and EXIF modal styles.
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
  console.log('--- Running Step 38 Test Suite: Evidence Photo Gallery & EXIF Metadata Viewer ---');

  // Test 1: Component Method & Constant Integrity
  console.log('Test 1: Component Method & Constant Integrity');
  const comp = new InfraPanelComponent();
  assert(typeof comp.renderThumbnailItem === 'function', 'renderThumbnailItem must be defined');
  assert(typeof comp.renderPhotoCanvasSvg === 'function', 'renderPhotoCanvasSvg must be defined');
  assert(typeof comp.renderExifCard === 'function', 'renderExifCard must be defined');
  assert(typeof comp.renderPhotoModal === 'function', 'renderPhotoModal must be defined');
  assert(typeof comp.openExifModal === 'function', 'openExifModal must be defined');
  assert(typeof comp.closeModal === 'function', 'closeModal must be defined');
  assert(typeof comp.openGallery === 'function', 'openGallery must be defined');

  assert(typeof SYNTHETIC_REFERENCE_PHOTOS === 'object', 'SYNTHETIC_REFERENCE_PHOTOS must be exported');
  assert(SYNTHETIC_REFERENCE_PHOTOS['computer_lab_photos'], 'Synthetic lab photo reference must exist');
  assert(SYNTHETIC_REFERENCE_PHOTOS['classroom_photos'], 'Synthetic classroom photo reference must exist');
  assert(SYNTHETIC_REFERENCE_PHOTOS['central_library_photos'], 'Synthetic library photo reference must exist');
  console.log('✓ Component methods and reference benchmarks verified');

  // Test 2: Thumbnail Grid Rendering on Item Cards
  console.log('Test 2: Thumbnail Grid Rendering on Item Cards');
  const renderedPanel = comp.render('DEMO-ISSUES-001');

  // Classroom has 2 uploaded photos
  assert(renderedPanel.includes('id="infra-thumbs-classroom_photos"'), 'Classroom card must contain thumbnail grid');
  assert(renderedPanel.includes('id="thumb-photo_class_01"'), 'Thumbnail thumb-photo_class_01 must be rendered');
  assert(renderedPanel.includes('id="thumb-photo_class_02"'), 'Thumbnail thumb-photo_class_02 must be rendered');
  assert(renderedPanel.includes('classroom_block_a.jpg'), 'Thumbnail must show filename classroom_block_a.jpg');
  assert(renderedPanel.includes('Apple iPhone 15 Pro'), 'Thumbnail must show camera model');

  // Computer Center has 0 uploads in issues bundle
  assert(renderedPanel.includes('id="infra-thumbs-computer_lab_photos"'), 'Computer lab card must contain thumbnail grid container');
  assert(renderedPanel.includes('id="infra-empty-computer_lab_photos"'), 'Empty state must be rendered for 0 uploaded photos');
  assert(renderedPanel.includes('No photographic evidence uploaded'), 'Empty state must describe missing photos');
  assert(renderedPanel.includes('View Reference Benchmark Standard'), 'Empty state must provide reference benchmark button');
  console.log('✓ Thumbnail grid rendering for both populated and empty facility cards verified');

  // Test 3: SPECIFIC VERIFICATION REQUIREMENT: Synthetic Lab Photo Displays EXIF Metadata Card
  console.log('Test 3: Specific Verification Requirement: Synthetic Lab Photo Displays EXIF Metadata Card');
  // Case A: Synthetic clean lab photo (clean_lab_01)
  const cleanLabPhoto = {
    file_id: 'clean_lab_01',
    filename: 'lab_terminal_room.jpg',
    latitude: 28.4729,
    longitude: 77.4892,
    distance_km: 0.02,
    phash: 'aabbccddeeff0011',
    exif: {
      camera_make: 'Canon',
      camera_model: 'EOS R6 Mark II',
      lens: 'RF24-105mm F4 L IS USM',
      focal_length: '24.0 mm',
      iso: 400,
      exposure: '1/125s',
      aperture: 'f/4.0',
      dimensions: '6000 × 4000',
      captured_at: '2026-03-11T09:45:12Z',
      software: 'Canon Firmware v1.4.0 (Authentic Ingest)'
    }
  };

  const exifHtml = comp.renderExifCard(cleanLabPhoto, 'computer_lab_photos');
  assert(exifHtml.includes('id="infra-exif-card"'), 'Must render #infra-exif-card root');
  assert(exifHtml.includes('Extracted EXIF Metadata Card'), 'Must display EXIF card title');
  assert(exifHtml.includes('Canon'), 'Must display Camera Make: Canon');
  assert(exifHtml.includes('EOS R6 Mark II'), 'Must display Camera Model: EOS R6 Mark II');
  assert(exifHtml.includes('RF24-105mm F4 L IS USM'), 'Must display Lens: RF24-105mm F4 L IS USM');
  assert(exifHtml.includes('24.0 mm'), 'Must display Focal Length: 24.0 mm');
  assert(exifHtml.includes('2026-03-11'), 'Must display Capture Date/Time containing 2026-03-11');
  assert(exifHtml.includes('6000 × 4000'), 'Must display Dimensions: 6000 × 4000');
  assert(exifHtml.includes('1/125s · ISO 400 · f/4.0'), 'Must display Exposure and ISO values');
  assert(exifHtml.includes('28.472900° N, 77.489200° E'), 'Must display GPS coordinate stamp');
  assert(exifHtml.includes('0.02 km'), 'Must display perimeter distance (0.02 km)');
  assert(exifHtml.includes('Within Campus Radius'), 'Must show campus radius status');
  assert(exifHtml.includes('aabbccddeeff0011'), 'Must display perceptual hash fingerprint');
  assert(exifHtml.includes('METADATA INTACT'), 'Must show intact metadata status');
  console.log('✓ Specific verification requirement satisfied: Synthetic lab photo displays complete EXIF metadata card');

  // Test 4: Photo Canvas Viewfinder Simulation
  console.log('Test 4: Photo Canvas Viewfinder Simulation');
  const canvasHtml = comp.renderPhotoCanvasSvg(cleanLabPhoto, 'computer_lab_photos');
  assert(canvasHtml.includes('class="infra-photo-canvas-box"'), 'Canvas container must be rendered');
  assert(canvasHtml.includes('class="infra-photo-svg"'), 'SVG element must be rendered');
  assert(canvasHtml.includes('SIMULATED PHOTO EVIDENCE · S10 FACILITY INSPECTION'), 'Must render simulation watermark');
  assert(canvasHtml.includes('clean_lab_01'), 'HUD must show file ID clean_lab_01');
  assert(canvasHtml.includes('6000 × 4000'), 'HUD must show resolution dimensions');
  assert(canvasHtml.includes('lab_terminal_room.jpg'), 'HUD must show filename');
  console.log('✓ Photo canvas viewfinder simulation verified');

  // Test 5: Multi-Facility EXIF Metadata Verification
  console.log('Test 5: Multi-Facility EXIF Metadata Verification');
  // Classroom Photo (iPhone 15 Pro, 21.16 km distance outside campus)
  const classPhoto = {
    file_id: 'photo_class_01',
    filename: 'classroom_block_a.jpg',
    latitude: 28.6280,
    longitude: 77.3650,
    distance_km: 21.16,
    exif: {
      camera_make: 'Apple',
      camera_model: 'iPhone 15 Pro',
      lens: 'iPhone 15 Pro back triple camera 24mm f/1.78',
      focal_length: '6.76 mm',
      captured_at: '2026-03-12T14:32:10Z'
    }
  };
  const classExifHtml = comp.renderExifCard(classPhoto, 'classroom_photos');
  assert(classExifHtml.includes('Apple'), 'Must render Apple camera make');
  assert(classExifHtml.includes('iPhone 15 Pro'), 'Must render iPhone 15 Pro camera model');
  assert(classExifHtml.includes('6.76 mm'), 'Must render 6.76 mm focal length');
  assert(classExifHtml.includes('21.16 km'), 'Must display 21.16 km distance');
  assert(classExifHtml.includes('OUTSIDE 2.0 KM PERIMETER'), 'Must flag location outside perimeter');

  // Central Library Photo (Sony ILCE-7M4)
  const libPhoto = {
    file_id: 'photo_lib_01',
    filename: 'central_library_stack.jpg',
    latitude: 28.4730,
    longitude: 77.4893,
    distance_km: 0.03,
    exif: {
      camera_make: 'Sony',
      camera_model: 'ILCE-7M4',
      lens: 'FE 24-70mm F2.8 GM II',
      focal_length: '28.0 mm',
      captured_at: '2026-03-10T11:15:00Z'
    }
  };
  const libExifHtml = comp.renderExifCard(libPhoto, 'central_library_photos');
  assert(libExifHtml.includes('Sony'), 'Must render Sony camera make');
  assert(libExifHtml.includes('ILCE-7M4'), 'Must render ILCE-7M4 camera model');
  assert(libExifHtml.includes('FE 24-70mm F2.8 GM II'), 'Must render Sony lens');
  assert(libExifHtml.includes('28.0 mm'), 'Must render 28.0 mm focal length');
  console.log('✓ Multi-facility EXIF metadata verified for Apple and Sony devices');

  // Test 6: Modal Lifecycle & Custom Event Dispatch
  console.log('Test 6: Modal Lifecycle & Custom Event Dispatch');
  eventsDispatched.length = 0;
  comp.currentAppId = 'DEMO-ISSUES-001';

  // Open modal on classroom photo
  const modalHtml = comp.openExifModal('classroom_photos', 'photo_class_01');
  assert(modalHtml.includes('id="infra-photo-modal"'), 'Modal must render #infra-photo-modal backdrop');
  assert(modalHtml.includes('classroom_block_a.jpg'), 'Modal title must display filename');

  const inspectedEvent = eventsDispatched.find(e => e.type === 'app:infra-photo-inspected');
  assert(inspectedEvent, 'Must dispatch app:infra-photo-inspected event');
  assert.strictEqual(inspectedEvent.detail.applicationId, 'DEMO-ISSUES-001');
  assert.strictEqual(inspectedEvent.detail.itemKey, 'classroom_photos');
  assert.strictEqual(inspectedEvent.detail.fileId, 'photo_class_01');
  assert(inspectedEvent.detail.exif.camera_make === 'Apple');

  // Test openGallery triggers modal
  eventsDispatched.length = 0;
  comp.openGallery('computer_lab_photos');
  const labEvent = eventsDispatched.find(e => e.type === 'app:infra-photo-inspected');
  assert(labEvent, 'openGallery must open EXIF modal and dispatch inspection event');
  assert.strictEqual(labEvent.detail.itemKey, 'computer_lab_photos');
  assert.strictEqual(labEvent.detail.exif.camera_make, 'Canon');

  // Test closeModal clears DOM
  comp.closeModal();
  const host = document.getElementById('infra-modal-host');
  assert(!host || host.innerHTML === '', 'closeModal must clear modal host HTML');
  console.log('✓ Modal lifecycle, trigger actions, and custom event dispatches verified');

  // Test 7: CSS Stylesheet Verification
  console.log('Test 7: CSS Stylesheet Verification');
  const infraCss = fs.readFileSync(path.join(__dirname, '../ui/css/infra.css'), 'utf8');
  assert(infraCss.includes('.infra-photo-thumbnails-grid'), 'CSS must define .infra-photo-thumbnails-grid');
  assert(infraCss.includes('.infra-photo-thumb'), 'CSS must define .infra-photo-thumb');
  assert(infraCss.includes('.infra-thumb-preview'), 'CSS must define .infra-thumb-preview');
  assert(infraCss.includes('.infra-thumb-canvas-sim'), 'CSS must define .infra-thumb-canvas-sim');
  assert(infraCss.includes('.infra-photo-empty'), 'CSS must define .infra-photo-empty');
  assert(infraCss.includes('.infra-modal-backdrop'), 'CSS must define .infra-modal-backdrop');
  assert(infraCss.includes('.infra-modal-content'), 'CSS must define .infra-modal-content');
  assert(infraCss.includes('.infra-modal-body'), 'CSS must define .infra-modal-body');
  assert(infraCss.includes('.infra-modal-preview-col'), 'CSS must define .infra-modal-preview-col');
  assert(infraCss.includes('.infra-photo-canvas-box'), 'CSS must define .infra-photo-canvas-box');
  assert(infraCss.includes('.infra-exif-card'), 'CSS must define .infra-exif-card');
  assert(infraCss.includes('.infra-exif-grid'), 'CSS must define .infra-exif-grid');
  assert(infraCss.includes('.infra-exif-row'), 'CSS must define .infra-exif-row');
  console.log('✓ ui/css/infra.css defines all Step 38 gallery and EXIF modal styles');

  console.log('\n======================================================');
  console.log('✓ ALL 7 STEP 38 VERIFICATION CHECKS PASSED SUCCESSFULLY');
  console.log('======================================================');
}

runTests().catch(err => {
  console.error('\n❌ STEP 38 TEST FAILED:', err);
  process.exit(1);
});
