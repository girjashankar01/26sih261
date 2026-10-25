/**
 * Test Step 35: QR Code Decoded Metadata & Token Masking Viewer
 * Spec Reference: ROADMAP.md (Phase 6: Step 35), Guide §5.7, Appendix B
 *
 * Verifies:
 * 1. Component Method Integrity:
 *    - maskToken, maskReference, hasQrCode, resolveQrMetadata, renderQrMetadataViewer available on VerificationPanelComponent.
 * 2. Token Masking Security Guardrail:
 *    - Sensitive query parameters (token, key, secret, auth) masked with ****.
 *    - Internal sequence tokens in certificate references masked (e.g. FIRE/KA/2024/00123 -> FIRE/KA/{masked}/00123).
 *    - Unmasked secrets (e.g. sec_9f81a7b4c2) strictly prohibited in viewer output.
 * 3. Forensic Detection Filtering:
 *    - hasQrCode returns true for Fire NOC (doc_qr_fire).
 *    - hasQrCode returns false for documents without QR (doc_digital_1, doc_scanned_2).
 *    - Non-QR documents render empty string for renderQrMetadataViewer.
 * 4. Specific Verification Requirement:
 *    - When QR code is detected in S2 forensics:
 *      * Render QR thumbnail (.qr-thumbnail-box, .qr-thumbnail-svg).
 *      * Render registry domain: fire.karnataka.gov.in.
 *      * Render masked certificate reference: FIRE/KA/{masked}/00123.
 *      * Render decoded issuer URL with sensitive tokens masked for security.
 * 5. Security Notice & Guardrails:
 *    - Displays Guide §5.7 rule: Document never supplies host; adapter queries configured base registry URL only.
 * 6. Document Card Full Integration:
 *    - Card HTML for doc_qr_fire embeds .verif-qr-viewer with all required elements.
 *    - Card HTML for doc_digital_1 does not render .verif-qr-viewer.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

// 1. Mock Browser Environment
const eventsDispatched = [];
const mockElements = new Map();

const createMockElement = (initialId) => {
  const listeners = {};
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
    textContent: '',
    value: '',
    disabled: false,
    style: {},
    dataset: {},
    parentNode: null,
    children: [],
    classList: {
      add: (...cls) => cls.forEach(c => classes.add(c)),
      remove: (...cls) => cls.forEach(c => classes.delete(c)),
      contains: (c) => classes.has(c)
    },
    setAttribute: (k, v) => attributes.set(k, String(v)),
    getAttribute: (k) => attributes.has(k) ? attributes.get(k) : null,
    removeAttribute: (k) => attributes.delete(k),
    hasAttribute: (k) => attributes.has(k),
    addEventListener: (evt, fn) => {
      listeners[evt] = listeners[evt] || [];
      listeners[evt].push(fn);
    },
    removeEventListener: (evt, fn) => {
      if (listeners[evt]) {
        listeners[evt] = listeners[evt].filter(f => f !== fn);
      }
    },
    dispatchEvent: (evt) => {
      if (listeners[evt.type]) {
        listeners[evt.type].forEach(fn => fn(evt));
      }
    },
    appendChild: (child) => {
      el.children.push(child);
      child.parentNode = el;
      return child;
    },
    removeChild: (child) => {
      el.children = el.children.filter(c => c !== child);
      child.parentNode = null;
      if (child.id) mockElements.delete(child.id);
      return child;
    }
  };

  if (initialId) {
    mockElements.set(initialId, el);
  }
  return el;
};

const mockBody = createMockElement('body');

global.document = {
  readyState: 'complete',
  body: mockBody,
  getElementById: (id) => mockElements.get(id) || null,
  querySelector: (sel) => null,
  createElement: (tagName) => {
    const el = createMockElement(`dyn-${Math.random().toString(36).slice(2, 8)}`);
    el.tagName = tagName.toUpperCase();
    return el;
  },
  querySelectorAll: (sel) => []
};

global.window = {
  addEventListener: () => {},
  removeEventListener: () => {},
  dispatchEvent: (evt) => {
    eventsDispatched.push(evt);
  },
  location: { hash: '' },
  document: global.document,
  state: {
    currentRole: 'officer'
  }
};

global.CustomEvent = class CustomEvent {
  constructor(type, params) {
    this.type = type;
    this.detail = params ? params.detail : null;
  }
};

// 2. Load Verification Panel Script
const verificationCode = fs.readFileSync(path.join(__dirname, '../ui/js/components/verification_panel.js'), 'utf8');
eval(verificationCode);

console.log('--- Step 35 Verification Starting ---');

const comp = window.verificationPanelComponent;
assert(comp, 'verificationPanelComponent must be initialized');

// Test 1: Method Integrity
assert.strictEqual(typeof comp.maskToken, 'function', 'maskToken method must exist');
assert.strictEqual(typeof comp.maskReference, 'function', 'maskReference method must exist');
assert.strictEqual(typeof comp.hasQrCode, 'function', 'hasQrCode method must exist');
assert.strictEqual(typeof comp.resolveQrMetadata, 'function', 'resolveQrMetadata method must exist');
assert.strictEqual(typeof comp.renderQrMetadataViewer, 'function', 'renderQrMetadataViewer method must exist');
console.log('✓ Test 1 Passed: QR forensic methods defined on component.');

// Test 2: Token Masking Security Guardrail
const rawSampleUrl = 'https://fire.karnataka.gov.in/verify?token=sec_9f81a7b4c2&ref=FIRE/KA/2024/00123';
const maskedUrl = comp.maskToken(rawSampleUrl);
assert(maskedUrl.includes('token=****'), 'Query parameter token must be replaced with ****');
assert(maskedUrl.includes('FIRE/KA/****/00123'), 'Middle token of reference in URL must be replaced with ****');
assert(!maskedUrl.includes('sec_9f81a7b4c2'), 'Sensitive secret token must NOT be leaked in masked URL');

const rawCertRef = 'FIRE/KA/2024/00123';
const maskedRef = comp.maskReference(rawCertRef);
assert.strictEqual(maskedRef, 'FIRE/KA/****/00123', 'Certificate reference middle component must be masked');
console.log('✓ Test 2 Passed: Token masking correctly redacts sensitive secrets and certificate serials.');

// Test 3: Detection Filtering
const demoDocs = comp.getDefaultDocuments('DEMO-ISSUES-001');
const fireDoc = demoDocs.find(d => d.id === 'doc_qr_fire');
const digitalDoc = demoDocs.find(d => d.id === 'doc_digital_1');
const scannedDoc = demoDocs.find(d => d.id === 'doc_scanned_2');

assert.strictEqual(comp.hasQrCode(fireDoc), true, 'Fire NOC must detect QR code from S2 forensics');
assert.strictEqual(comp.hasQrCode(digitalDoc), false, 'Affidavit must NOT detect QR code');
assert.strictEqual(comp.hasQrCode(scannedDoc), false, 'Building plan must NOT detect QR code');

assert.strictEqual(comp.renderQrMetadataViewer(digitalDoc), '', 'Non-QR doc must render empty string');
assert.strictEqual(comp.renderQrMetadataViewer(scannedDoc), '', 'Non-QR doc must render empty string');
console.log('✓ Test 3 Passed: QR forensic filtering strictly isolates QR-bearing documents.');

// Test 4: Specific Verification Requirement
// Requirement: Render QR thumbnail alongside decoded issuer URL, registry domain (fire.karnataka.gov.in),
//              and masked certificate reference (FIRE/KA/****/00123) with sensitive tokens masked.
const qrHtml = comp.renderQrMetadataViewer(fireDoc);
assert(qrHtml.includes('class="verif-qr-viewer"'), 'Must render container with class .verif-qr-viewer');
assert(qrHtml.includes('id="verif-qr-doc_qr_fire"'), 'Must have ID verif-qr-doc_qr_fire');

// 1. QR Thumbnail
assert(qrHtml.includes('class="qr-thumbnail-box"'), 'Must contain QR thumbnail box');
assert(qrHtml.includes('class="qr-thumbnail-svg"'), 'Must contain scalable QR thumbnail SVG');
assert(qrHtml.includes('PAGE 1 QR'), 'Thumbnail must indicate page 1 QR locator');

// 2. Registry Domain: fire.karnataka.gov.in
assert(qrHtml.includes('fire.karnataka.gov.in'), 'Must display registry domain fire.karnataka.gov.in');
assert(qrHtml.includes('id="qr-domain-doc_qr_fire"'), 'Must have element id qr-domain-doc_qr_fire');

// 3. Masked Certificate Reference: FIRE/KA/****/00123
assert(qrHtml.includes('FIRE/KA/****/00123'), 'Must display masked certificate reference FIRE/KA/****/00123');
assert(qrHtml.includes('id="qr-ref-doc_qr_fire"'), 'Must have element id qr-ref-doc_qr_fire');
assert(qrHtml.includes('badge-masked-token'), 'Must display MASKED badge tag');

// 4. Decoded Issuer URL with sensitive tokens masked
assert(qrHtml.includes('id="qr-url-doc_qr_fire"'), 'Must have element id qr-url-doc_qr_fire');
assert(qrHtml.includes('https://fire.karnataka.gov.in/verify'), 'Must contain base decoded registry URL');
assert(qrHtml.includes('token=****'), 'URL must have token masked with ****');
assert(qrHtml.includes('FIRE/KA/****/00123'), 'URL must have reference masked');
assert(!qrHtml.includes('sec_9f81a7b4c2'), 'Raw secret token must NEVER appear in viewer HTML');
console.log('✓ Test 4 Passed: Specific verification requirement satisfied — QR thumbnail, registry domain (fire.karnataka.gov.in), and masked reference (FIRE/KA/****/00123) rendered with masked URL.');

// Test 5: Security Egress Guardrail Notice (Guide §5.7)
assert(qrHtml.includes('Document never supplies host'), 'Must display Guide §5.7 rule: Document never supplies host');
assert(qrHtml.includes('Security Guardrail'), 'Must include Security Guardrail heading');
assert(qrHtml.includes('LOCATOR ONLY'), 'Must include LOCATOR ONLY badge');
console.log('✓ Test 5 Passed: Security egress guardrail notice (Guide §5.7) verified.');

// Test 6: Document Card Full Integration
const cardWithQr = comp.renderDocumentCard(fireDoc);
assert(cardWithQr.includes('class="verif-qr-viewer"'), 'Fire NOC card must embed .verif-qr-viewer');
assert(cardWithQr.includes('fire.karnataka.gov.in'), 'Fire NOC card must include fire.karnataka.gov.in');
assert(cardWithQr.includes('FIRE/KA/****/00123'), 'Fire NOC card must include masked reference');

const cardWithoutQr = comp.renderDocumentCard(digitalDoc);
assert(!cardWithoutQr.includes('verif-qr-viewer'), 'Clean affidavit card must NOT embed QR viewer');
console.log('✓ Test 6 Passed: Document card integration verified for both QR and non-QR documents.');

// Test 7: CSS Stylesheet Verification
const cssContent = fs.readFileSync(path.join(__dirname, '../ui/css/verification.css'), 'utf8');
assert(cssContent.includes('.verif-qr-viewer'), 'verification.css must declare .verif-qr-viewer');
assert(cssContent.includes('.qr-thumbnail-box'), 'verification.css must declare .qr-thumbnail-box');
assert(cssContent.includes('.qr-registry-domain'), 'verification.css must declare .qr-registry-domain');
assert(cssContent.includes('.badge-masked-token'), 'verification.css must declare .badge-masked-token');
assert(cssContent.includes('.qr-decoded-url'), 'verification.css must declare .qr-decoded-url');
console.log('✓ Test 7 Passed: CSS stylesheet rules verified in ui/css/verification.css.');

console.log('-------------------------------------------');
console.log('ALL STEP 35 TESTS PASSED SUCCESSFULLY! (7/7)');
console.log('-------------------------------------------');
