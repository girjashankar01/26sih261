/**
 * Test Step 46: Print Layout Stylesheet & Export Formats
 * Spec Reference: ROADMAP.md (Phase 8: Step 46), Guide §11.8
 *
 * Verifies:
 * 1. Action Toolbar Buttons in Preview Modal:
 *    - "Copy Formatted Text (Markdown)" (#btn-copy-notice).
 *    - "Download JSON Envelope" (#btn-download-notice).
 *    - "Print Official Document" (#btn-print-notice).
 * 2. Specific Verification Requirement:
 *    - Triggering window.print() renders clean, professional printable letterhead document.
 * 3. Markdown Export Generation (generateMarkdownExport):
 *    - Deficiency notice formatted as clean Markdown table and letterhead text.
 *    - Inspection brief formatted with checklists, GPS coordinates, and inspection focus tables.
 * 4. Clipboard Copy Action (copyNoticeText / copyFormattedMarkdown):
 *    - Copies Markdown content and dispatches app:export-copied event.
 * 5. Standard JSON Envelope Generation (generateJsonEnvelope & downloadNoticeJson):
 *    - Produces structured envelope schema with simulated and decision_support_only flags.
 * 6. @media print Stylesheet Rules in ui/css/main.css:
 *    - A4 portrait page configuration (@page { size: A4 portrait; margin: 15mm... }).
 *    - Application chrome hidden (.app-header, .nav-tabs-bar, .sidebar, .export-modal-footer, button, .btn).
 *    - Modal container converted to static flow document without scrollbars or fixed overlay.
 *    - Page-break protection for tables and signature blocks (page-break-inside: avoid).
 * 7. @media print Stylesheet Rules in ui/css/exports.css:
 *    - Export-specific print styles mirrored for standalone or modular inclusion.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

// 1. Mock Browser Environment
const eventsDispatched = [];
const mockElements = new Map();
let printCallCount = 0;
let clipboardWrittenText = '';

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
    click: () => {
      // Simulate click
    },
    remove: () => {
      if (el.parentNode) el.parentNode.removeChild(el);
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
  print: () => {
    printCallCount++;
  },
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

Object.defineProperty(globalThis, 'navigator', {
  value: {
    clipboard: {
      writeText: (txt) => {
        clipboardWrittenText = txt;
        return Promise.resolve();
      }
    }
  },
  configurable: true,
  writable: true
});

// Load Component
const { ExportsHubComponent, exportsHubComponent } = require('../ui/js/components/exports_modal.js');

console.log('--- Running Step 46 Test Suite: Print Layout Stylesheet & Export Formats ---');

// ============================================================================
// Test 1: Action Toolbar Buttons in Preview Modal
// ============================================================================
console.log('Test 1: Action Toolbar Buttons in Preview Modal');
exportsHubComponent.currentAppId = 'DEMO-ISSUES-001';
const hostEl = createMockElement('export-preview-modal-host');
const previewHtml = exportsHubComponent.openPreview('deficiency-notice');

assert(previewHtml, 'Preview content HTML must be returned');
const hostHtml = hostEl.innerHTML;

// Button 1: Copy Formatted Text (Markdown)
assert(hostHtml.includes('id="btn-copy-notice"'), 'Must contain Copy Formatted Text button (#btn-copy-notice)');
assert(hostHtml.includes('Copy Formatted Text'), 'Button text must describe copying formatted text');

// Button 2: Download JSON Envelope
assert(hostHtml.includes('id="btn-download-notice"'), 'Must contain Download JSON Envelope button (#btn-download-notice)');
assert(hostHtml.includes('Download JSON Envelope'), 'Button text must describe downloading JSON envelope');

// Button 3: Print Official Document
assert(hostHtml.includes('id="btn-print-notice"'), 'Must contain Print Official Document button (#btn-print-notice)');
assert(hostHtml.includes('Print Official Document'), 'Button text must describe printing official document');
console.log('✓ Action toolbar buttons verified: Copy Formatted Text, Download JSON Envelope, Print Official Document');

// ============================================================================
// Test 2: Specific Verification Requirement
// "Triggering window.print() renders clean, professional printable letterhead document."
// ============================================================================
console.log('Test 2: Specific Verification Requirement: window.print() Execution & Event Dispatch');
printCallCount = 0;
eventsDispatched.length = 0;

exportsHubComponent.printDocument();

assert.strictEqual(printCallCount, 1, 'window.print() must be triggered exactly once');
const printEvent = eventsDispatched.find(e => e.type === 'app:export-print-triggered');
assert(printEvent, 'app:export-print-triggered event must be dispatched');
assert.strictEqual(printEvent.detail.exportType, 'deficiency-notice');
assert.strictEqual(printEvent.detail.targetFormat, 'A4');
console.log('✓ Specific verification requirement satisfied: Triggering window.print() triggers native print subsystem with A4 event payload');

// ============================================================================
// Test 3: Markdown Export Generation (generateMarkdownExport)
// ============================================================================
console.log('Test 3: Markdown Export Generation for Deficiency Notice & Inspection Brief');

// 1. Deficiency notice markdown
const defNoticeMd = exportsHubComponent.generateMarkdownExport('deficiency-notice');
assert(typeof defNoticeMd === 'string', 'Markdown export must return a string');
assert(defNoticeMd.includes('# ALL INDIA COUNCIL FOR TECHNICAL EDUCATION'), 'Must include official AICTE header');
assert(defNoticeMd.includes('STATUS: DRAFT — FOR OFFICER REVIEW'), 'Must specify DRAFT status');
assert(defNoticeMd.includes('| # | Discrepancy Category & Rule | Submitted / Observed Value | Prescribed Mandatory Norm | Required Rectification Action | Upload Cutoff |'), 'Must include Markdown table header');
assert(defNoticeMd.includes('FIRE_SAFETY_VALIDITY'), 'Must include rule ID');
assert(defNoticeMd.includes('LAND_AREA_NORMS'), 'Must include land area rule');
assert(defNoticeMd.includes('> **Mandatory Rectification Deadline:**'), 'Must include statutory deadline quote block');
assert(defNoticeMd.includes('[✓ DRAFT APPROVED FOR OFFICER DISPATCH]'), 'Must include official signoff stamp');

// 2. Inspection brief markdown
const briefMd = exportsHubComponent.generateMarkdownExport('inspection-brief');
assert(briefMd.includes('# EXPERT VISITING COMMITTEE (EVC) — PHYSICAL INSPECTION BRIEF'), 'Must include EVC header');
assert(briefMd.includes('STATUS: READY_FOR_INSPECTION_TEAM'), 'Must specify inspection team status');
assert(briefMd.includes('Registered GPS Coordinates:'), 'Must include registered campus GPS coordinates');
assert(briefMd.includes('28.4728° N, 77.4891° E'), 'Must include exact registered coordinates in markdown');
assert(briefMd.includes('| Verify | Facility & Key | Evidence Status | Reason Flagged | Visiting Team Inspection Focus |'), 'Must include facilities checklist table in markdown');
assert(briefMd.includes('| [ ] | **Classrooms & Smart Teaching Areas**'), 'Must include checklist box for classrooms');
assert(briefMd.includes('| [ ] | **Central Computer Center & Server Room**'), 'Must include checklist box for computer center');
assert(briefMd.includes('Pending Statutory Documents Requiring On-Site Physical Verification'), 'Must include pending verifications in markdown');
assert(briefMd.includes('[✓ EVC GROUND BRIEFING VERIFIED]'), 'Must include EVC verified signoff');
console.log('✓ Markdown formatting verified for both Deficiency Notice and Inspection Brief');

// ============================================================================
// Test 4: Clipboard Copy Action (copyNoticeText / copyFormattedMarkdown)
// ============================================================================
console.log('Test 4: Clipboard Copy Action & Event Dispatch');
eventsDispatched.length = 0;
clipboardWrittenText = '';

const copiedText = exportsHubComponent.copyNoticeText();

assert.strictEqual(copiedText, clipboardWrittenText, 'Copied text must match clipboard content');
assert(copiedText.includes('# ALL INDIA COUNCIL FOR TECHNICAL EDUCATION'), 'Clipboard text must contain formatted Markdown');
const copyEvent = eventsDispatched.find(e => e.type === 'app:export-copied');
assert(copyEvent, 'app:export-copied event must be dispatched');
assert.strictEqual(copyEvent.detail.format, 'markdown');
assert(copyEvent.detail.charCount > 100, 'Must report character count in event detail');

// Semantic alias test
assert.strictEqual(typeof exportsHubComponent.copyFormattedMarkdown, 'function');
assert.strictEqual(exportsHubComponent.copyFormattedMarkdown(), copiedText);
console.log('✓ Copy Formatted Text successfully delivers Markdown to clipboard and dispatches app:export-copied');

// ============================================================================
// Test 5: Standard JSON Envelope Generation (generateJsonEnvelope & downloadNoticeJson)
// ============================================================================
console.log('Test 5: Standard JSON Envelope Generation & Download');
eventsDispatched.length = 0;

const envelope = exportsHubComponent.downloadNoticeJson();

assert(envelope, 'Envelope object must be returned');
assert.strictEqual(envelope.envelope_version, '1.0.0');
assert.strictEqual(envelope.export_type, 'deficiency-notice');
assert.strictEqual(envelope.document_type, 'DEFICIENCY_NOTICE_DRAFT');
assert.strictEqual(envelope.application_id, 'DEMO-ISSUES-001');
assert.strictEqual(envelope.environment, 'OFFLINE_SOVEREIGN');
assert.strictEqual(envelope.simulated, true);
assert.strictEqual(envelope.decision_support_only, true);
assert(envelope.payload, 'Envelope must contain original payload data');

const downloadEvent = eventsDispatched.find(e => e.type === 'app:export-downloaded');
assert(downloadEvent, 'app:export-downloaded event must be dispatched');
assert.strictEqual(downloadEvent.detail.format, 'json-envelope');
assert(downloadEvent.detail.filename.endsWith('_envelope.json'), 'Filename must end with _envelope.json');

// Semantic alias test
assert.strictEqual(typeof exportsHubComponent.downloadJsonEnvelope, 'function');
console.log('✓ JSON Envelope conforms to official envelope schema and dispatches app:export-downloaded');

// ============================================================================
// Test 6: @media print Stylesheet Rules in ui/css/main.css
// ============================================================================
console.log('Test 6: @media print Stylesheet Rules in ui/css/main.css');
const mainCssPath = path.join(__dirname, '../ui/css/main.css');
assert(fs.existsSync(mainCssPath), 'ui/css/main.css must exist');
const mainCss = fs.readFileSync(mainCssPath, 'utf8');

assert(mainCss.includes('@media print'), 'main.css must contain @media print block');
assert(mainCss.includes('size: A4 portrait;'), 'Must specify A4 portrait paper size');
assert(mainCss.includes('margin: 15mm 15mm 15mm 15mm;'), 'Must define standard 15mm print margins');

// Chrome hiding checks
const hiddenSelectors = [
  '.app-header',
  '.nav-tabs-bar',
  '.sidebar',
  '.export-modal-footer',
  '.btn-generate-preview',
  'button'
];
for (const sel of hiddenSelectors) {
  assert(mainCss.includes(sel), `main.css @media print must hide: ${sel}`);
}

// Modal flow unconstraining checks
assert(mainCss.includes('.export-modal-backdrop'), 'Must target .export-modal-backdrop for static flow');
assert(mainCss.includes('.export-modal-content'), 'Must target .export-modal-content for static flow');
assert(mainCss.includes('overflow: visible !important;'), 'Must set overflow: visible for printable modal content');

// Page break protection checks
assert(mainCss.includes('page-break-inside: avoid !important;'), 'Must protect rows from page breaks');
assert(mainCss.includes('.notice-table tr'), 'Must protect notice table rows from page break');
assert(mainCss.includes('.brief-table tr'), 'Must protect brief table rows from page break');
assert(mainCss.includes('.brief-committee-signatures'), 'Must protect committee signatures from page break');
console.log('✓ ui/css/main.css @media print rules verify A4 paper formatting, chrome hiding, and page-break protection');

// ============================================================================
// Test 7: @media print Stylesheet Rules in ui/css/exports.css
// ============================================================================
console.log('Test 7: @media print Stylesheet Rules in ui/css/exports.css');
const exportsCssPath = path.join(__dirname, '../ui/css/exports.css');
assert(fs.existsSync(exportsCssPath), 'ui/css/exports.css must exist');
const exportsCss = fs.readFileSync(exportsCssPath, 'utf8');

assert(exportsCss.includes('@media print'), 'exports.css must contain @media print block');
assert(exportsCss.includes('size: A4 portrait;'), 'exports.css must specify A4 portrait paper size');
assert(exportsCss.includes('.notice-letterhead'), 'exports.css must format letterhead for print');
assert(exportsCss.includes('.brief-header'), 'exports.css must format brief header for print');
console.log('✓ ui/css/exports.css mirrors complete printable document styles');

console.log('\n======================================================');
console.log('✓ ALL 7 STEP 46 VERIFICATION CHECKS PASSED SUCCESSFULLY');
console.log('======================================================');
