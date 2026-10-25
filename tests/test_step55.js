/**
 * Test Step 55: System Realness & Transparency Matrix Page
 * Spec Reference: ROADMAP.md (Phase 10: Step 55), Guide §1.4, AGENTS.md
 *
 * Verifies:
 * 1. Component Initialization & Built-in Realness Manifest:
 *    - Initializes with 15 core subsystems (11 REAL, 4 SIMULATED).
 *    - Validates 73.3% real production-grade ratio and 0 external network dependencies.
 * 2. Specific Verification Requirement: Honest Disclosure of Real vs. Simulated Capabilities:
 *    - Real engines: Ingestion (S1), Forensics (S2), Extraction (S3/S4), Typing (S5),
 *      Field extraction (S6), Entity resolution (S7), Rules engine (S8), Infra (S10),
 *      Triage (S11), Officer exports (S12), and Cryptographic audit trail (S13).
 *    - Simulated mocks: AICTE core DB, State Fire Service QR registry, PKI root CA, and TER fee gateway.
 * 3. Status and Domain Category Filtering:
 *    - Status filters for ALL, REAL, and SIMULATED.
 *    - Domain filters for DATA_PIPELINE, REGULATORY_ENGINE, EVIDENCE_FORENSICS, AUDIT_SECURITY, EXTERNAL_INTEGRATIONS.
 * 4. Real-time Search Filter:
 *    - Matches by subsystem name, description, library (Docling, BLAKE3, pyHanko, Ed25519, RapidFuzz), or file path.
 * 5. Interactive Subsystem Transparency Modal:
 *    - Displays operational mode, technical stack tags, and file references without opening source files.
 * 6. Non-negotiable Sovereignty & Zero External Transmission Notice:
 *    - #badge-airgap-status ("100% AIR-GAPPED SOVEREIGN") and #banner-sovereignty-declaration verified per AGENTS.md.
 * 7. HTML Shell, Router, API Client & CSS Integration:
 *    - ui/index.html includes realness.css and realness_view.js.
 *    - ui/js/app.js routes #about/realness and #realness to realnessViewComponent.loadAndRender().
 *    - ui/js/api.js provides getRealnessMatrix() querying GET /about/realness.
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
            mockElements.set(m[1], childEl);
          }
        }
      }
    },
    get textContent() { return _textContent || _innerHTML.replace(/<[^>]*>/g, '').trim(); },
    set textContent(val) { _textContent = val; _innerHTML = val; },
    classList: {
      add: (...cls) => cls.forEach(c => classes.add(c)),
      remove: (...cls) => cls.forEach(c => classes.delete(c)),
      contains: (c) => classes.has(c),
      toggle: (c, force) => {
        if (force === undefined) {
          if (classes.has(c)) classes.delete(c);
          else classes.add(c);
        } else if (force) classes.add(c);
        else classes.delete(c);
      }
    },
    setAttribute: (k, v) => attributes.set(k, String(v)),
    getAttribute: (k) => attributes.has(k) ? attributes.get(k) : null,
    hasAttribute: (k) => attributes.has(k),
    addEventListener: (evt, cb) => {
      listeners[evt] = listeners[evt] || [];
      listeners[evt].push(cb);
    },
    dispatchEvent: (evt) => {
      const handlers = listeners[evt.type] || [];
      handlers.forEach(h => h(evt));
      eventsDispatched.push(evt);
    },
    querySelector: (sel) => {
      if (sel.startsWith('#')) {
        const id = sel.substring(1);
        if (mockElements.has(id)) return mockElements.get(id);
      }
      return createMockElement();
    },
    querySelectorAll: (sel) => {
      const results = [];
      for (const [id, elem] of mockElements.entries()) {
        if (sel.startsWith('#') && id === sel.substring(1)) results.push(elem);
        else if (sel.startsWith('.') && elem.classList.contains(sel.substring(1))) results.push(elem);
      }
      return results;
    },
    focus: () => {},
    setSelectionRange: () => {}
  };

  if (initialId) mockElements.set(initialId, el);
  return el;
};

// Global polyfills
global.document = {
  getElementById: (id) => {
    if (!mockElements.has(id)) {
      const el = createMockElement(id);
      mockElements.set(id, el);
    }
    return mockElements.get(id);
  },
  querySelector: (sel) => {
    if (sel.startsWith('#')) return global.document.getElementById(sel.substring(1));
    return createMockElement();
  },
  querySelectorAll: () => []
};

global.window = {
  document: global.document,
  addEventListener: () => {},
  dispatchEvent: (evt) => eventsDispatched.push(evt),
  CustomEvent: class CustomEvent {
    constructor(type, init) {
      this.type = type;
      this.detail = init ? init.detail : null;
    }
  }
};

// Load RealnessViewComponent module
const RealnessViewComponent = require('../ui/js/components/realness_view.js');

console.log('--- Step 55: System Realness & Transparency Matrix Page Tests ---');

// Setup base host element
const viewRealnessEl = createMockElement('view-realness');
mockElements.set('view-realness', viewRealnessEl);

(async () => {
  try {
    // -------------------------------------------------------------------------
    // Test 1: Component Initialization & Built-in Realness Manifest
    // -------------------------------------------------------------------------
    console.log('Test 1: Component Initialization & Built-in Realness Manifest...');
    const realnessView = new RealnessViewComponent({ containerId: 'view-realness' });
    assert.strictEqual(typeof realnessView.loadAndRender, 'function', 'loadAndRender must be a function');
    assert.strictEqual(typeof realnessView.render, 'function', 'render must be a function');

    const m = realnessView.manifest;
    assert.strictEqual(m.components.length, 15, 'Must evaluate exactly 15 core subsystems');
    assert.strictEqual(m.summary.real_components, 11, 'Must contain 11 real production engines');
    assert.strictEqual(m.summary.simulated_components, 4, 'Must contain 4 explicitly disclosed simulations');
    assert.strictEqual(m.summary.realness_percentage, 73.3, 'Realness percentage must be 73.3%');
    assert.strictEqual(m.external_network_calls, 0, 'External outbound network calls must be strictly 0');
    console.log('✓ Test 1 passed: Component initialized with 15 subsystems, 73.3% realness ratio, and 0 external network dependencies.');

    // -------------------------------------------------------------------------
    // Test 2: Specific Verification Requirement: Complete Honest Transparency of Real vs Simulated
    // -------------------------------------------------------------------------
    console.log('Test 2: Specific Verification Requirement: Real vs Simulated Disclosure...');
    realnessView.render();
    const hostHtml = viewRealnessEl.innerHTML;

    // Check title and sovereign perimeter badge
    assert.ok(hostHtml.includes('System Realness &amp; Transparency Matrix') || hostHtml.includes('System Realness & Transparency Matrix'), 'Must render system title');
    assert.ok(hostHtml.includes('100% AIR-GAPPED SOVEREIGN'), 'Must display 100% AIR-GAPPED SOVEREIGN badge');
    assert.ok(hostHtml.includes('AUDIT-READY / 100% TRANSPARENT'), 'Must display AUDIT-READY status badge');

    // Check production-grade REAL systems in table
    assert.ok(hostHtml.includes('Ingestion Gateway &amp; Storage Vault') || hostHtml.includes('Ingestion Gateway & Storage Vault'), 'Must list S1 Ingestion');
    assert.ok(hostHtml.includes('Document Forensics &amp; Signature Verification') || hostHtml.includes('Document Forensics & Signature Verification'), 'Must list S2 Forensics');
    assert.ok(hostHtml.includes('Document Routing &amp; Dual-Tier Text Extraction') || hostHtml.includes('Document Routing & Dual-Tier Text Extraction'), 'Must list S3/S4 Extraction');
    assert.ok(hostHtml.includes('Document Typing &amp; Checklist Prior Classifier') || hostHtml.includes('Document Typing & Checklist Prior Classifier'), 'Must list S5 Typing');
    assert.ok(hostHtml.includes('Structured Field Extraction &amp; Date Policy') || hostHtml.includes('Structured Field Extraction & Date Policy'), 'Must list S6 Field Extraction');
    assert.ok(hostHtml.includes('Typed Facts &amp; Entity Resolution Engine') || hostHtml.includes('Typed Facts & Entity Resolution Engine'), 'Must list S7 Entity Resolution');
    assert.ok(hostHtml.includes('Deterministic Rules Engine v4 &amp; Three-Valued Gate') || hostHtml.includes('Deterministic Rules Engine v4'), 'Must list S8 Rules');
    assert.ok(hostHtml.includes('Physical Infrastructure Evidence &amp; Geotag Engine') || hostHtml.includes('Physical Infrastructure Evidence'), 'Must list S10 Infra');
    assert.ok(hostHtml.includes('Application Triage &amp; Dynamic Priority Engine') || hostHtml.includes('Application Triage'), 'Must list S11 Triage');
    assert.ok(hostHtml.includes('Officer Draft Export &amp; Notice Generator') || hostHtml.includes('Officer Draft Export'), 'Must list S12 Exports');
    assert.ok(hostHtml.includes('Cryptographic Hash Chain &amp; Signed Checkpoints') || hostHtml.includes('Cryptographic Hash Chain'), 'Must list S13 Audit');

    // Check explicitly disclosed SIMULATED integrations
    assert.ok(hostHtml.includes('AICTE Core Institutional Database'), 'Must list AICTE Core DB as simulated');
    assert.ok(hostHtml.includes('State Fire Service Online QR Portal'), 'Must list State Fire Service QR portal as simulated');
    assert.ok(hostHtml.includes('Government PKI Root Certificate Authority'), 'Must list PKI root CA as simulated');
    assert.ok(hostHtml.includes('TER Processing Fee Banking Gateway'), 'Must list TER payment gateway as simulated');

    // Check status badges
    assert.ok(hostHtml.includes('badge-status-real'), 'Must render badge-status-real');
    assert.ok(hostHtml.includes('badge-status-simulated'), 'Must render badge-status-simulated');
    console.log('✓ Test 2 passed: All 11 real engines and 4 simulated integrations explicitly disclosed and labeled.');

    // -------------------------------------------------------------------------
    // Test 3: Status and Domain Category Filtering
    // -------------------------------------------------------------------------
    console.log('Test 3: Status and Domain Category Filtering...');
    // Filter REAL ONLY
    realnessView.setStatusFilter('REAL');
    let filtered = realnessView.getFilteredComponents();
    assert.strictEqual(filtered.length, 11, 'REAL filter must yield exactly 11 components');
    assert.ok(filtered.every(c => c.status === 'REAL'), 'All filtered components must be REAL');

    // Filter SIMULATED ONLY
    realnessView.setStatusFilter('SIMULATED');
    filtered = realnessView.getFilteredComponents();
    assert.strictEqual(filtered.length, 4, 'SIMULATED filter must yield exactly 4 components');
    assert.ok(filtered.every(c => c.status === 'SIMULATED'), 'All filtered components must be SIMULATED');

    // Reset status filter and test domain categories
    realnessView.setStatusFilter('ALL');
    realnessView.setCategoryFilter('DATA_PIPELINE');
    filtered = realnessView.getFilteredComponents();
    assert.ok(filtered.length >= 3, 'DATA_PIPELINE category must contain S1, S3/S4, S6');
    assert.ok(filtered.every(c => c.category === 'DATA_PIPELINE'), 'All must belong to DATA_PIPELINE');

    realnessView.setCategoryFilter('EXTERNAL_INTEGRATIONS');
    filtered = realnessView.getFilteredComponents();
    assert.strictEqual(filtered.length, 4, 'EXTERNAL_INTEGRATIONS must contain 4 simulated adapters');

    realnessView.setCategoryFilter('ALL');
    console.log('✓ Test 3 passed: Status toggling and category domain filtering function deterministically.');

    // -------------------------------------------------------------------------
    // Test 4: Real-time Keyword Search Filter
    // -------------------------------------------------------------------------
    console.log('Test 4: Real-time Keyword Search Filter...');
    realnessView.setSearchQuery('Docling');
    filtered = realnessView.getFilteredComponents();
    assert.strictEqual(filtered.length, 1, 'Search for Docling must match S3/S4 extraction');
    assert.strictEqual(filtered[0].id, 'S3_S4', 'Matched component must be S3_S4');

    realnessView.setSearchQuery('pyHanko');
    filtered = realnessView.getFilteredComponents();
    assert.strictEqual(filtered[0].id, 'S2', 'Search for pyHanko must match S2 Forensics');

    realnessView.setSearchQuery('Ed25519');
    filtered = realnessView.getFilteredComponents();
    assert.strictEqual(filtered[0].id, 'S13', 'Search for Ed25519 must match S13 Audit');

    realnessView.setSearchQuery('QR');
    filtered = realnessView.getFilteredComponents();
    assert.ok(filtered.length >= 2, 'Search for QR must match S2 and simulated Fire NOC registry');

    realnessView.setSearchQuery('');
    console.log('✓ Test 4 passed: Real-time search by library, technology, and keyword verified.');

    // -------------------------------------------------------------------------
    // Test 5: Interactive Subsystem Transparency Modal
    // -------------------------------------------------------------------------
    console.log('Test 5: Interactive Subsystem Transparency Modal...');
    const modalHost = createMockElement('realness-modal-host');
    mockElements.set('realness-modal-host', modalHost);

    // Open modal for S1
    realnessView.openComponentModal('S1');
    assert.strictEqual(realnessView.selectedComponentId, 'S1', 'selectedComponentId must be S1');
    let modalHtml = modalHost.innerHTML;
    assert.ok(modalHtml.includes('id="modal-container-realness"'), 'Modal container must be rendered');
    assert.ok(modalHtml.includes('Ingestion Gateway &amp; Storage Vault') || modalHtml.includes('Ingestion Gateway & Storage Vault'), 'Modal must display S1 name');
    assert.ok(modalHtml.includes('BLAKE3') && modalHtml.includes('SHA-256'), 'Modal must display cryptographic technology tags');
    assert.ok(modalHtml.includes('backend/ingest/service.py'), 'Modal must display code file references');

    // Open modal for SIM_FIRE_REGISTRY
    realnessView.openComponentModal('SIM_FIRE_REGISTRY');
    modalHtml = modalHost.innerHTML;
    assert.ok(modalHtml.includes('State Fire Service Online QR Portal'), 'Modal must display Fire NOC registry name');
    assert.ok(modalHtml.includes('SIMULATED'), 'Modal must display SIMULATED status');
    assert.ok(modalHtml.includes('confidentiality gate'), 'Modal must explain AGENTS.md confidentiality gate');

    // Close modal
    realnessView.closeModal();
    assert.strictEqual(realnessView.selectedComponentId, null, 'selectedComponentId must be null after closing');
    assert.strictEqual(modalHost.innerHTML, '', 'Modal host must be cleared on close');
    console.log('✓ Test 5 passed: Interactive component transparency modal displays operational guarantees and file references.');

    // -------------------------------------------------------------------------
    // Test 6: Non-Negotiable Sovereignty & Zero External Transmission Notice
    // -------------------------------------------------------------------------
    console.log('Test 6: Non-Negotiable Sovereignty & Zero External Transmission Notice...');
    realnessView.render();
    const finalHtml = viewRealnessEl.innerHTML;
    assert.ok(finalHtml.includes('id="badge-airgap-status"'), 'Must render #badge-airgap-status');
    assert.ok(finalHtml.includes('id="banner-sovereignty-declaration"'), 'Must render #banner-sovereignty-declaration');
    assert.ok(finalHtml.includes('Zero External Transmission Guarantee'), 'Must declare Zero External Transmission Guarantee');
    assert.ok(finalHtml.includes('Zero bytes of institutional applications'), 'Must guarantee zero document exfiltration');
    console.log('✓ Test 6 passed: Non-negotiable sovereignty guarantee and air-gap proof enforced.');

    // -------------------------------------------------------------------------
    // Test 7: HTML Shell, Router, API Client & CSS Integration
    // -------------------------------------------------------------------------
    console.log('Test 7: HTML Shell, Router, API Client & CSS Integration...');
    const htmlContent = fs.readFileSync(path.join(__dirname, '../ui/index.html'), 'utf8');
    assert.ok(htmlContent.includes('/static/css/realness.css'), 'index.html must link realness.css');
    assert.ok(htmlContent.includes('/static/js/components/realness_view.js'), 'index.html must include realness_view.js');
    assert.ok(htmlContent.includes('id="view-realness"'), 'index.html must contain #view-realness container');

    const appJsContent = fs.readFileSync(path.join(__dirname, '../ui/js/app.js'), 'utf8');
    assert.ok(appJsContent.includes(".addRoute('#about/realness'"), 'app.js must register #about/realness route');
    assert.ok(appJsContent.includes(".addRoute('#realness'"), 'app.js must register #realness alias route');
    assert.ok(appJsContent.includes('realnessViewComponent.loadAndRender'), 'app.js must route to realnessViewComponent');

    const apiJsContent = fs.readFileSync(path.join(__dirname, '../ui/js/api.js'), 'utf8');
    assert.ok(apiJsContent.includes('getRealnessMatrix()'), 'api.js must provide getRealnessMatrix() method');
    assert.ok(apiJsContent.includes('/about/realness'), 'api.js must query /about/realness');

    const mainPyContent = fs.readFileSync(path.join(__dirname, '../backend/api/main.py'), 'utf8');
    assert.ok(mainPyContent.includes('"/about/realness"'), 'backend/api/main.py must expose /about/realness endpoint');

    const cssContent = fs.readFileSync(path.join(__dirname, '../ui/css/realness.css'), 'utf8');
    assert.ok(cssContent.includes('.realness-container'), 'realness.css must define .realness-container');
    assert.ok(cssContent.includes('.badge-status-real'), 'realness.css must define .badge-status-real');
    assert.ok(cssContent.includes('.badge-status-simulated'), 'realness.css must define .badge-status-simulated');
    assert.ok(cssContent.includes('.badge-sovereign-airgap'), 'realness.css must define .badge-sovereign-airgap');
    console.log('✓ Test 7 passed: Full end-to-end integration with HTML shell, Router, API client, and CSS.');

    console.log('\n======================================================');
    console.log('ALL 7 SUITES IN STEP 55 PASSED (100% SUCCESS)');
    console.log('======================================================');
  } catch (err) {
    console.error('❌ Step 55 Test Failure:', err);
    process.exit(1);
  }
})();
