/**
 * Test Step 21: Canonical Entity Resolution & Alias Match Inspector
 * Verification of entity name core/legal token segregation (Guide §11.4),
 * core token match scoring, classification of minor legal suffix variations
 * as LEGAL_FORM_DIFF (non-blocking warning) rather than hard errors (MISMATCH),
 * entity resolution pill, and interactive drawer inspection.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

// 1. Mock Browser Environment
const eventsDispatched = [];
const mockElements = new Map();
const createMockElement = (id) => {
  const listeners = {};
  const classes = new Set(['hidden']);
  const attributes = new Map();

  const el = {
    id,
    innerHTML: '',
    textContent: '',
    classList: {
      add: (c) => classes.add(c),
      remove: (c) => classes.delete(c),
      contains: (c) => classes.has(c)
    },
    setAttribute: (k, v) => attributes.set(k, v),
    getAttribute: (k) => attributes.get(k) || null,
    addEventListener: (evt, fn) => {
      listeners[evt] = listeners[evt] || [];
      listeners[evt].push(fn);
    },
    dispatchEvent: (evt) => {
      if (listeners[evt.type]) {
        listeners[evt.type].forEach(fn => fn(evt));
      }
    }
  };
  mockElements.set(id, el);
  return el;
};

const mockDrawer = createMockElement('alias-inspector-drawer');
const mockToggleBtn = createMockElement('btn-toggle-alias-inspector');

global.document = {
  readyState: 'complete',
  getElementById: (id) => mockElements.get(id) || null
};

global.window = {
  addEventListener: () => {},
  removeEventListener: () => {},
  dispatchEvent: (evt) => {
    eventsDispatched.push(evt);
  },
  location: { hash: '' },
  document: global.document
};

global.CustomEvent = class CustomEvent {
  constructor(type, params) {
    this.type = type;
    this.detail = params ? params.detail : null;
  }
};

// 2. Load Component Script
const appHeaderCode = fs.readFileSync(path.join(__dirname, '../ui/js/components/application_header.js'), 'utf8');
eval(appHeaderCode);

console.log('--- Step 21 Verification Starting ---');

assert(window.applicationHeaderComponent, 'ApplicationHeaderComponent singleton must exist');

// 3. Test 1: Entity Name Core/Legal Token Segregation (Guide §11.4)
console.log('Testing splitEntityName tokenization...');
const splitA = window.applicationHeaderComponent.splitEntityName('Apex Inst of Tech Pvt Ltd');
assert.strictEqual(splitA.core, 'apex institute technology', 'Abbreviations like inst/tech must be expanded, stop words like of removed');
assert.deepStrictEqual(splitA.legalForms, ['limited', 'private'], 'Legal forms like pvt/ltd must be segregated');

const splitB = window.applicationHeaderComponent.splitEntityName('The Beacon College of Engg Society');
assert.strictEqual(splitB.core, 'beacon college engineering', 'engg expanded to engineering, the/of filtered');
assert.deepStrictEqual(splitB.legalForms, ['society'], 'society recognized as legal form');

// 4. Test 2: Core Token Match Score & Status Classification
console.log('Testing Entity Comparison Logic & Legal Form Variations...');

// Case A: Exact Match
const cmpMatch = window.applicationHeaderComponent.compareEntityNames(
  'Beacon College of Engineering',
  'Beacon College of Engineering'
);
assert.strictEqual(cmpMatch.status, 'MATCH', 'Identical names must produce MATCH');
assert.strictEqual(cmpMatch.score, 100, 'Score must be 100%');

// Case B: Abbreviation Expansion with Matching Legal Forms
const cmpAbbr = window.applicationHeaderComponent.compareEntityNames(
  'Beacon Coll of Engg Pvt Ltd',
  'Beacon College of Engineering Private Limited'
);
assert.strictEqual(cmpAbbr.status, 'MATCH', 'Expanded abbreviations with matching legal tokens must produce MATCH');
assert.strictEqual(cmpAbbr.score, 100, 'Score must be 100%');

// Case C: The Specification Case — Minor Legal Suffix Variation (LEGAL_FORM_DIFF, NOT a hard error)
// Verification: Minor legal suffix variations (e.g., "Trust" vs "Society", "Pvt Ltd" vs non-suffixed)
// are identified as LEGAL_FORM_DIFF instead of hard errors.
const cmpLegalDiff = window.applicationHeaderComponent.compareEntityNames(
  'Beacon College of Engineering Society',
  'Beacon College of Engineering Trust'
);
assert.strictEqual(
  cmpLegalDiff.status,
  'LEGAL_FORM_DIFF',
  'Different legal suffixes (Society vs Trust) with matching core names MUST be identified as LEGAL_FORM_DIFF'
);
assert.strictEqual(cmpLegalDiff.score, 100, 'Core token match score must be 100%');

const cmpSuffixOmitted = window.applicationHeaderComponent.compareEntityNames(
  'Apex Institute of Technology',
  'Apex Institute of Technology Pvt Ltd'
);
assert.strictEqual(
  cmpSuffixOmitted.status,
  'LEGAL_FORM_DIFF',
  'Omission or addition of legal suffix MUST be identified as LEGAL_FORM_DIFF'
);

// Case D: True Mismatch (Different Core Names)
const cmpMismatch = window.applicationHeaderComponent.compareEntityNames(
  'National Institute of Management',
  'Beacon College of Engineering'
);
assert.strictEqual(cmpMismatch.status, 'MISMATCH', 'Different core names must produce MISMATCH');
assert(cmpMismatch.score < 50, 'Score must be low for mismatched names');

// 5. Test 3: Entity Resolution Pill Rendering & Severity Classification
console.log('Testing Entity Resolution Pill Rendering...');
const aliasesWithDiff = [
  {
    document_id: 'doc_fire_noc',
    doc_type: 'FIRE_NOC',
    extracted_name: 'Beacon College of Engineering',
    canonical_name: 'Beacon College of Engineering',
    match_status: 'MATCH'
  },
  {
    document_id: 'doc_affidavit',
    doc_type: 'AFFIDAVIT',
    extracted_name: 'Beacon College of Engineering Society',
    canonical_name: 'Beacon College of Engineering Trust',
    match_status: 'LEGAL_FORM_DIFF'
  }
];

const pillHtml = window.applicationHeaderComponent.renderEntityResolutionPill('Beacon College of Engineering', aliasesWithDiff);
assert(pillHtml.includes('id="entity-resolution-pill"'), 'Pill HTML must contain #entity-resolution-pill');
assert(pillHtml.includes('ENTITY RESOLUTION: LEGAL_FORM_DIFF'), 'Pill must report summary status LEGAL_FORM_DIFF');
assert(pillHtml.includes('badge-warn'), 'LEGAL_FORM_DIFF must be styled with badge-warn (amber/warning, NOT a hard blocker error)');
assert(!pillHtml.includes('badge-fail'), 'LEGAL_FORM_DIFF must NOT use badge-fail (not a hard error)');
assert(pillHtml.includes('id="btn-toggle-alias-inspector"'), 'Pill must include drawer toggle button');

// 6. Test 4: Document Alias Inspector Drawer Rendering
console.log('Testing Alias Inspector Drawer Rendering...');
const drawerHtml = window.applicationHeaderComponent.renderAliasInspectorDrawer('Beacon College of Engineering', aliasesWithDiff);

assert(drawerHtml.includes('id="alias-inspector-drawer"'), 'Drawer HTML must contain #alias-inspector-drawer');
assert(drawerHtml.includes('doc_fire_noc'), 'Drawer must list Fire NOC alias');
assert(drawerHtml.includes('doc_affidavit'), 'Drawer must list Affidavit alias');
assert(drawerHtml.includes('id="alias-badge-doc_affidavit"'), 'Drawer must render alias badge for affidavit');
assert(drawerHtml.includes('LEGAL_FORM_DIFF'), 'Affidavit row badge must show LEGAL_FORM_DIFF');
assert(drawerHtml.includes('100%'), 'Must display 100% core match score');

// 7. Test 5: Interactive Drawer Toggle Action
console.log('Testing Drawer Toggle Action...');
assert.strictEqual(window.applicationHeaderComponent.isInspectorOpen, false, 'Inspector drawer must start closed');

eventsDispatched.length = 0;
window.applicationHeaderComponent.toggleAliasInspector();

assert.strictEqual(window.applicationHeaderComponent.isInspectorOpen, true, 'Inspector state must toggle to open');
assert(!mockDrawer.classList.contains('hidden'), 'Drawer must NOT have .hidden class when open');
assert.strictEqual(mockToggleBtn.getAttribute('aria-expanded'), 'true', 'Toggle button aria-expanded must be true');

const toggleEvt = eventsDispatched.find(e => e.type === 'app:alias-inspector-toggled');
assert(toggleEvt, 'app:alias-inspector-toggled event must be dispatched');
assert.strictEqual(toggleEvt.detail.isOpen, true);

// Toggle closed again
window.applicationHeaderComponent.toggleAliasInspector();
assert.strictEqual(window.applicationHeaderComponent.isInspectorOpen, false);
assert(mockDrawer.classList.contains('hidden'), 'Drawer must have .hidden class when closed');

// 8. Test 6: Complete Header Integration
const fullHeader = window.applicationHeaderComponent.render(
  'DEMO-ISSUES-001',
  {
    canonical_institute: { name: 'Beacon College of Engineering', aicte_id: '1-10998878' },
    aliases: aliasesWithDiff
  },
  { workflow_status: 'NEEDS_RECTIFICATION' }
);

assert(fullHeader.includes('ENTITY RESOLUTION: LEGAL_FORM_DIFF'), 'Full header must embed Entity Resolution Pill');
assert(fullHeader.includes('id="alias-inspector-drawer"'), 'Full header must embed Alias Inspector Drawer');

console.log('✓ All Step 21 verification assertions passed successfully!');
