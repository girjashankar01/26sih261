/**
 * Test Step 40: Perceptual Hash (pHash) Duplicate Detector Warning
 * Spec Reference: ROADMAP.md (Phase 7: Step 40), Guide §14
 *
 * Verifies:
 * 1. 64-bit DCT pHash Bitwise Hamming Distance Calculation:
 *    - calculateHammingDistance accurately computes bitwise divergence between 16-hex pHash digests.
 *    - Validates identical hashes (0 bits), near-duplicates (1-2 bits <= 6), unrelated (64 bits), and null safety.
 * 2. Specific Verification Requirement:
 *    - Reused photo displays amber advisory banner with exact text:
 *      "Perceptual hash matches an image submitted by another institution".
 * 3. Privacy & Confidentiality Protection Gate (Guide §14 & AGENTS.md Compliance):
 *    - Zero confidential peer institution data leakage.
 *    - Peer institution and application IDs are strictly masked (INST-CONFIDENTIAL-****, APP-CONFIDENTIAL-****).
 * 4. 8x8 Bitmatrix Visualization SVG Rendering:
 *    - Renders 64 bit rects corresponding to the 64-bit DCT pHash.
 *    - Divergent bits are highlighted with contrasting alert fill (#ef4444).
 * 5. Hamming Distance Meter Gauge:
 *    - Renders gauge with 6-bit norm threshold pin, danger zone, and divergence fill.
 * 6. Cross-Institution Duplicate Hash Inspection Modal Lifecycle:
 *    - inspectDuplicateHash mounts #infra-duplicate-modal with side-by-side comparison.
 *    - Dispatches app:infra-duplicate-inspected event with full diagnostic payload.
 *    - closeModal cleanly clears modal.
 * 7. CSS Stylesheet Rules:
 *    - ui/css/infra.css defines .infra-duplicate-banner, .infra-hash-compare-grid, .infra-hamming-meter, and .badge-privacy-masked.
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
  console.log('--- Running Step 40 Test Suite: Perceptual Hash (pHash) Duplicate Detector Warning ---');
  const comp = new InfraPanelComponent();

  // -------------------------------------------------------------
  // Test 1: 64-bit DCT pHash Bitwise Hamming Distance Calculation
  // -------------------------------------------------------------
  console.log('Test 1: Bitwise Hamming Distance Function');
  {
    // Identical digests
    const distZero = comp.calculateHammingDistance('aabbccddeeff0011', 'aabbccddeeff0011');
    assert.strictEqual(distZero, 0, 'Identical hashes must have Hamming distance 0');

    // 1-bit difference: 0x0011 (0001 0001) vs 0x0013 (0001 0011) -> 1 bit diff
    const distOne = comp.calculateHammingDistance('aabbccddeeff0011', 'aabbccddeeff0013');
    assert.strictEqual(distOne, 1, '1-bit divergent hash must have Hamming distance 1');

    // 2-bit difference: 0x0011 (0001 0001) vs 0x0012 (0001 0010) -> 2 bit diff (bit 0 differs, bit 1 differs)
    const distTwo = comp.calculateHammingDistance('aabbccddeeff0011', 'aabbccddeeff0012');
    assert.strictEqual(distTwo, 2, '2-bit divergent hash must have Hamming distance 2');

    // Full 64-bit divergence
    const distFull = comp.calculateHammingDistance('0000000000000000', 'ffffffffffffffff');
    assert.strictEqual(distFull, 64, 'Opposite 64-bit hashes must have Hamming distance 64');

    // Error safety on bad/null inputs
    assert.strictEqual(comp.calculateHammingDistance(null, 'aabbccddeeff0011'), 64, 'Null input returns 64');
    assert.strictEqual(comp.calculateHammingDistance('invalid_hex', 'aabbccddeeff0011'), 64, 'Invalid hex returns 64');

    console.log('✓ calculateHammingDistance verified across 0, 1, 2, and 64-bit divergence');
  }

  // -------------------------------------------------------------
  // Test 2: Specific Verification Requirement
  // Reused photo displays amber advisory banner with exact text:
  // "Perceptual hash matches an image submitted by another institution"
  // -------------------------------------------------------------
  console.log('Test 2: Specific Verification Requirement: Amber Advisory Banner Phrasing');
  {
    const expectedAdvisoryText = "Perceptual hash matches an image submitted by another institution";

    // 1. Check banner generator method
    const bannerHtml = comp.renderDuplicateBanner({
      item_key: 'computer_lab_photos',
      duplicate_match: {
        peer_hash: 'aabbccddeeff0013',
        hamming_distance: 2,
        peer_institution_masked: 'INST-CONFIDENTIAL-****'
      }
    });

    assert.ok(
      bannerHtml.includes(expectedAdvisoryText),
      `Advisory banner must contain exact text: "${expectedAdvisoryText}"`
    );
    assert.ok(bannerHtml.includes('infra-duplicate-banner'), 'Must have CSS class infra-duplicate-banner');
    assert.ok(bannerHtml.includes('Hamming distance: 2'), 'Must display calculated Hamming distance');
    assert.ok(bannerHtml.includes('Norm limit ≤ 6'), 'Must display AICTE regulatory norm threshold limit ≤ 6');

    // 2. Check modal banner
    const modalHtml = comp.renderDuplicateModal(
      { file_id: 'reused_lab_01', filename: 'lab_reused.jpg', phash: 'aabbccddeeff0011' },
      { peer_hash: 'aabbccddeeff0013', hamming_distance: 2, peer_institution_masked: 'INST-CONFIDENTIAL-****' },
      'computer_lab_photos'
    );

    assert.ok(
      modalHtml.includes(expectedAdvisoryText),
      `Modal must also display exact advisory text: "${expectedAdvisoryText}"`
    );

    // 3. Check card rendering when duplicate bundle is active
    const bundleData = comp.getDefaultChecklist('DEMO-DUPLICATE-001');
    const dupItem = bundleData.items.find(i => i.item_key === 'computer_lab_photos');
    assert.ok(dupItem, 'DEMO-DUPLICATE-001 must contain computer_lab_photos item');
    assert.strictEqual(dupItem.status, 'POSSIBLE_DUPLICATE_EVIDENCE', 'Status must be POSSIBLE_DUPLICATE_EVIDENCE');

    const cardHtml = comp.renderItemCard(dupItem);
    assert.ok(
      cardHtml.includes(expectedAdvisoryText),
      `Card rendering for duplicate item must display exact advisory text: "${expectedAdvisoryText}"`
    );

    console.log(`✓ Specific verification requirement satisfied: "${expectedAdvisoryText}"`);
  }

  // -------------------------------------------------------------
  // Test 3: Privacy & Confidentiality Protection Gate (Guide §14 Compliance)
  // -------------------------------------------------------------
  console.log('Test 3: Confidentiality Gate: Zero Peer Identity Leakage');
  {
    const modalHtml = comp.renderDuplicateModal(
      { file_id: 'reused_lab_01', filename: 'lab_reused.jpg', phash: 'aabbccddeeff0011' },
      {
        peer_hash: 'aabbccddeeff0013',
        hamming_distance: 2,
        peer_institution_masked: 'INST-CONFIDENTIAL-****',
        peer_application_masked: 'APP-CONFIDENTIAL-****'
      },
      'computer_lab_photos'
    );

    // Assert that confidentiality masking badges and masked identifiers are present
    assert.ok(modalHtml.includes('PEER INSTITUTION [CONFIDENTIAL]'), 'Must render confidential peer title');
    assert.ok(modalHtml.includes('badge-privacy-masked'), 'Must apply badge-privacy-masked styling');
    assert.ok(modalHtml.includes('APP-CONFIDENTIAL-****'), 'Must mask peer application ID');
    assert.ok(modalHtml.includes('Confidentiality Protection Gate:'), 'Must display AGENTS.md confidentiality notice');

    // Assert that no unmasked real institution or portal IDs leak
    assert.ok(!modalHtml.includes('Delhi Technological University'), 'Must not leak unmasked institution name');
    assert.ok(!modalHtml.includes('IIT Bombay'), 'Must not leak peer institution name');
    assert.ok(!modalHtml.includes('APP-REAL-'), 'Must not leak real application ID');

    console.log('✓ Privacy & confidentiality protection gate verified: strictly masked peer metadata');
  }

  // -------------------------------------------------------------
  // Test 4: 8x8 Bitmatrix Visualization SVG Rendering
  // -------------------------------------------------------------
  console.log('Test 4: 8x8 Bitmatrix Visualization SVG Rendering');
  {
    const h1 = 'aabbccddeeff0011';
    const h2 = 'aabbccddeeff0013';
    const diffMask = BigInt('0x' + h1) ^ BigInt('0x' + h2);

    const svgHtml = comp.renderHashBitmatrixSvg(h1, diffMask);
    assert.ok(svgHtml.includes('<svg width="116" height="116"'), 'Must render 116x116 SVG canvas');

    // Count 64 bit rectangles in the 8x8 matrix (plus 1 background rect)
    const rectMatches = svgHtml.match(/<rect /g) || [];
    assert.strictEqual(rectMatches.length, 65, 'Must render 1 background rect + 64 bit cell rects (8x8)');

    // Diff highlighting check: at least one cell has the #ef4444 alert fill
    assert.ok(svgHtml.includes('fill="#ef4444"'), 'Must highlight divergent bits with red fill #ef4444');

    console.log('✓ 8x8 bitmatrix SVG rendering and diff highlighting verified');
  }

  // -------------------------------------------------------------
  // Test 5: Hamming Distance Meter Gauge
  // -------------------------------------------------------------
  console.log('Test 5: Hamming Distance Meter Gauge');
  {
    const modalHtml = comp.renderDuplicateModal(
      { file_id: 'f1', filename: 'photo1.jpg', phash: 'aabbccddeeff0011' },
      { peer_hash: 'aabbccddeeff0013', hamming_distance: 2 },
      'computer_lab_photos'
    );

    assert.ok(modalHtml.includes('id="hamming-meter"'), 'Must contain #hamming-meter element');
    assert.ok(modalHtml.includes('infra-hamming-danger-zone'), 'Must render red danger zone for <= 6 bits');
    assert.ok(modalHtml.includes('infra-hamming-threshold-pin'), 'Must render norm threshold pin');
    assert.ok(modalHtml.includes('Hamming Distance: 2 / 64 bits'), 'Must display formatted distance in meter header');

    console.log('✓ Hamming distance meter gauge rendering verified');
  }

  // -------------------------------------------------------------
  // Test 6: Cross-Institution Duplicate Hash Inspection Modal Lifecycle
  // -------------------------------------------------------------
  console.log('Test 6: Duplicate Hash Inspector Modal Lifecycle & Event Dispatch');
  {
    eventsDispatched.length = 0;
    comp.currentAppId = 'DEMO-DUPLICATE-001';

    // Launch Duplicate Inspector
    const modalHtml = comp.inspectDuplicateHash('computer_lab_photos');
    assert.ok(modalHtml.includes('id="infra-duplicate-modal"'), 'inspectDuplicateHash must return #infra-duplicate-modal');

    // Verify DOM host received modal
    const host = global.document.getElementById('infra-modal-host');
    assert.ok(host.innerHTML.includes('id="infra-duplicate-modal"'), 'Modal must be mounted in #infra-modal-host');

    // Verify side-by-side comparison boxes
    assert.ok(host.innerHTML.includes('id="box-hash-current"'), 'Modal must have #box-hash-current box');
    assert.ok(host.innerHTML.includes('id="box-hash-peer"'), 'Modal must have #box-hash-peer box');

    // Verify CustomEvent dispatch
    const dupEvent = eventsDispatched.find(e => e.type === 'app:infra-duplicate-inspected');
    assert.ok(dupEvent, 'Must dispatch app:infra-duplicate-inspected custom event');
    assert.strictEqual(dupEvent.detail.applicationId, 'DEMO-DUPLICATE-001');
    assert.strictEqual(dupEvent.detail.itemKey, 'computer_lab_photos');
    assert.strictEqual(dupEvent.detail.isDuplicate, true, 'isDuplicate must be true for Hamming distance <= 6');
    assert.ok(dupEvent.detail.hammingDistance <= 6, 'hammingDistance must be <= 6');

    // Close Modal
    comp.closeModal();
    assert.strictEqual(host.innerHTML, '', 'closeModal must empty #infra-modal-host');

    console.log('✓ Modal lifecycle, side-by-side boxes, and app:infra-duplicate-inspected event verified');
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
      '.infra-duplicate-banner',
      '.infra-hash-compare-grid',
      '.infra-hash-box',
      '.infra-bitmatrix-box',
      '.infra-hamming-meter',
      '.infra-hamming-track',
      '.infra-hamming-danger-zone',
      '.badge-privacy-masked',
      '.badge-infra-duplicate'
    ];

    for (const cls of requiredClasses) {
      assert.ok(cssContent.includes(cls), `CSS must define ${cls}`);
    }

    console.log('✓ ui/css/infra.css defines all Step 40 duplicate warning styles');
  }

  console.log('\n======================================================');
  console.log('✓ ALL 7 STEP 40 VERIFICATION CHECKS PASSED SUCCESSFULLY');
  console.log('======================================================');
}

runTests().catch(err => {
  console.error('❌ Step 40 Test Suite Failed:', err);
  process.exit(1);
});
