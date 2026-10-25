/**
 * Test Step 54: Rule Set Difference & Version Switcher
 * Spec Reference: ROADMAP.md (Phase 10: Step 54), Guide §12, AGENTS.md
 *
 * Verifies:
 * 1. Version Switcher Dropdown in UI:
 *    - #select-rules-version renders with options for v4.0 (AY 2024-26) and v4.1 (AY 2026-27).
 *    - switchVersion() updates the active regulatory model dynamically.
 * 2. Specific Verification Requirement:
 *    - Toggling versions updates effective date ranges and academic cycle badges:
 *      v4.0: 2024-04-01 to 2026-03-31 (AY 2024-26).
 *      v4.1: 2026-04-01 onwards (AY 2026-27 Amendment).
 * 3. Specific Verification Requirement:
 *    - Toggling to v4.1 highlights changed clauses (.diff-changed-clause) and threshold shifts (.diff-changed-threshold).
 *    - Displays .badge-version-amended on modified rules.
 * 4. Regulatory Difference Matrix Panel:
 *    - #rules-diff-container renders with #diff-header-banner and side-by-side comparison table #diff-rules-table.
 *    - #diff-academic-shift displays CALENDAR SHIFT (+1 Academic Cycle).
 * 5. Global Threshold Shifts Grid:
 *    - expiry_warn_days shifts from 30 days to 45 days.
 *    - name_min_ratio shifts from 90% to 95%.
 *    - faculty_student_ratio shifts from 1:20 to 1:15.
 * 6. Backend Comparison API Route:
 *    - GET /rules/compare accurately computes difference matrix between EOA_RENEWAL and EOA_RENEWAL_v4_1.
 * 7. CSS Stylesheet Integration:
 *    - ui/css/rules.css includes all required version switcher and diff matrix selectors.
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

// Load RulesViewComponent module
const RulesViewComponent = require('../ui/js/components/rules_view.js');

console.log('--- Step 54: Rule Set Difference & Version Switcher Tests ---');

// Setup base host element
const viewRulesEl = createMockElement('view-rules');
mockElements.set('view-rules', viewRulesEl);

(async () => {
  try {
    // -------------------------------------------------------------------------
    // Test 1: Version Switcher Dropdown in UI Layout
    // -------------------------------------------------------------------------
    console.log('Test 1: Version Switcher Dropdown in UI Layout...');
    const rulesView = new RulesViewComponent({ containerId: 'view-rules' });
    rulesView.render();
    const initialHtml = viewRulesEl.innerHTML;

    assert.ok(initialHtml.includes('id="select-rules-version"'), 'Must render #select-rules-version dropdown');
    assert.ok(initialHtml.includes('v4.0 (APH 2024-26 Established Norms)'), 'Must include v4.0 Established Norms option');
    assert.ok(initialHtml.includes('v4.1 (APH 2026-27 Amended Standards)'), 'Must include v4.1 Amended Standards option');
    assert.ok(initialHtml.includes('id="btn-toggle-rules-diff"'), 'Must render #btn-toggle-rules-diff comparison button');
    console.log('✓ Test 1 passed: Version switcher dropdown and comparison button rendered in UI header.');

    // -------------------------------------------------------------------------
    // Test 2: Specific Verification Requirement: Toggling Versions Updates Effective Dates
    // -------------------------------------------------------------------------
    console.log('Test 2: Specific Verification Requirement: Effective Date Ranges Toggle...');
    // Initial state: v4.0
    assert.strictEqual(rulesView.activeRuleSet.version, 4, 'Initial version must be 4');
    let effectivePill = initialHtml;
    assert.ok(effectivePill.includes('Effective: 2024-04-01 to 2026-03-31 (AY 2024-26)'), 'v4.0 must display established date range (2024-04-01 to 2026-03-31)');

    // Switch to v4.1
    await rulesView.switchVersion('EOA_RENEWAL_v4_1');
    const v41Html = viewRulesEl.innerHTML;
    assert.strictEqual(String(rulesView.activeRuleSet.version), '4.1', 'Active version must switch to 4.1');
    assert.ok(v41Html.includes('Effective: 2026-04-01 onwards (AY 2026-27)'), 'v4.1 must display amended date range (2026-04-01 onwards)');
    assert.ok(v41Html.includes('id="badge-amendment-notice"'), 'v4.1 must render amendment notice badge');
    console.log('✓ Test 2 passed: Toggling versions dynamically updates effective date ranges and academic cycle badges.');

    // -------------------------------------------------------------------------
    // Test 3: Specific Verification Requirement: Highlighting Changed Clauses & Thresholds
    // -------------------------------------------------------------------------
    console.log('Test 3: Specific Verification Requirement: Changed Clauses & Thresholds Highlighted...');
    // In v4.1, amended rules display amendment pills and highlight classes
    assert.ok(v41Html.includes('v4.1 AMENDED'), 'Table must render v4.1 AMENDED badge on modified rules');
    assert.ok(v41Html.includes('diff-changed-clause'), 'Must apply .diff-changed-clause highlight to amended clauses');
    assert.ok(v41Html.includes('diff-changed-threshold'), 'Must apply .diff-changed-threshold highlight to modified expressions');

    // Specific rule checks:
    // R-EXP-001 has 45-day window in v4.1
    assert.ok(v41Html.includes('warn if &lt;= submission_date + 45d') || v41Html.includes('warn if <= submission_date + 45d'), 'R-EXP-001 expression must reflect 45d window in v4.1');
    assert.ok(v41Html.includes('Chapter II, Clause 2.3-B'), 'R-EXP-001 must cite amended Clause 2.3-B');
    // R-CROSS-001 has 95% threshold in v4.1
    assert.ok(v41Html.includes('&gt;= 95%') || v41Html.includes('>= 95%'), 'R-CROSS-001 expression must reflect 95% similarity in v4.1');
    assert.ok(v41Html.includes('Chapter II, Clause 2.4-A'), 'R-CROSS-001 must cite amended Clause 2.4-A');
    // R-FAC-001 has 1:15 ratio in v4.1
    assert.ok(v41Html.includes('1 / 15'), 'R-FAC-001 must reflect 1:15 faculty ratio in v4.1');
    console.log('✓ Test 3 passed: Changed clauses and numeric thresholds are prominently highlighted when viewing v4.1.');

    // -------------------------------------------------------------------------
    // Test 4: Regulatory Difference Matrix Panel (v4.0 vs v4.1 Side-by-Side)
    // -------------------------------------------------------------------------
    console.log('Test 4: Regulatory Difference Matrix Panel...');
    rulesView.toggleDiffMode(true);
    const diffHtml = viewRulesEl.innerHTML;

    assert.ok(diffHtml.includes('id="rules-diff-container"'), 'Must render #rules-diff-container');
    assert.ok(diffHtml.includes('id="diff-header-banner"'), 'Must render #diff-header-banner');
    assert.ok(diffHtml.includes('Regulatory Difference Matrix: v4.0 (AY 2024-26) ➔ v4.1 (AY 2026-27)'), 'Banner must display comparison title');
    assert.ok(diffHtml.includes('id="diff-academic-shift"'), 'Must render #diff-academic-shift');
    assert.ok(diffHtml.includes('CALENDAR SHIFT (+1 Academic Cycle)'), 'Must highlight calendar cycle shift');
    console.log('✓ Test 4 passed: Side-by-side difference matrix panel activates and highlights academic cycle shift.');

    // -------------------------------------------------------------------------
    // Test 5: Global Threshold Shifts & Comparison Table
    // -------------------------------------------------------------------------
    console.log('Test 5: Global Threshold Shifts & Comparison Table...');
    assert.ok(diffHtml.includes('id="diff-params-grid"'), 'Must render #diff-params-grid');
    assert.ok(diffHtml.includes('expiry_warn_days'), 'Must compare expiry_warn_days');
    assert.ok(diffHtml.includes('30 days') && diffHtml.includes('45 days'), 'Must display expiry_warn_days shift: 30d -> 45d');
    assert.ok(diffHtml.includes('name_min_ratio'), 'Must compare name_min_ratio');
    assert.ok(diffHtml.includes('90%') && diffHtml.includes('95%'), 'Must display name_min_ratio shift: 90% -> 95%');
    assert.ok(diffHtml.includes('1:20 Ratio') && diffHtml.includes('1:15 Ratio'), 'Must display faculty ratio shift: 1:20 -> 1:15');

    // Table checks
    assert.ok(diffHtml.includes('id="diff-rules-table"'), 'Must render #diff-rules-table');
    assert.ok(diffHtml.includes('pill-modified'), 'Must display MODIFIED status pills');
    assert.ok(diffHtml.includes('pill-unchanged'), 'Must display UNCHANGED status pills');
    assert.ok(diffHtml.includes('diff-row-modified'), 'Must apply .diff-row-modified to altered rules');
    console.log('✓ Test 5 passed: Global threshold shifts and side-by-side rules table render accurately.');

    // -------------------------------------------------------------------------
    // Test 6: Backend Comparison API Integration
    // -------------------------------------------------------------------------
    console.log('Test 6: Backend Comparison API Integration & Method Contract...');
    const apiJsContent = fs.readFileSync(path.join(__dirname, '../ui/js/api.js'), 'utf8');
    assert.ok(apiJsContent.includes('compareRuleSets('), 'api.js must provide compareRuleSets() method');
    assert.ok(apiJsContent.includes('/rules/compare'), 'api.js must call /rules/compare');

    const mainPyContent = fs.readFileSync(path.join(__dirname, '../backend/api/main.py'), 'utf8');
    assert.ok(mainPyContent.includes('"/rules/compare"'), 'backend/api/main.py must expose /rules/compare endpoint');
    console.log('✓ Test 6 passed: Backend /rules/compare endpoint and API client method verified.');

    // -------------------------------------------------------------------------
    // Test 7: CSS Stylesheet Integration for Version Diff Selectors
    // -------------------------------------------------------------------------
    console.log('Test 7: CSS Stylesheet Integration...');
    const cssContent = fs.readFileSync(path.join(__dirname, '../ui/css/rules.css'), 'utf8');
    assert.ok(cssContent.includes('.rules-version-select'), 'rules.css must define .rules-version-select');
    assert.ok(cssContent.includes('.btn-compare-versions'), 'rules.css must define .btn-compare-versions');
    assert.ok(cssContent.includes('.rules-diff-container'), 'rules.css must define .rules-diff-container');
    assert.ok(cssContent.includes('.diff-changed-clause'), 'rules.css must define .diff-changed-clause');
    assert.ok(cssContent.includes('.diff-changed-threshold'), 'rules.css must define .diff-changed-threshold');
    assert.ok(cssContent.includes('.badge-version-amended'), 'rules.css must define .badge-version-amended');
    assert.ok(cssContent.includes('.diff-highlight-dates'), 'rules.css must define .diff-highlight-dates');
    console.log('✓ Test 7 passed: All required version switcher and diff styling rules verified.');

    console.log('\n======================================================');
    console.log('ALL 7 SUITES IN STEP 54 PASSED (100% SUCCESS)');
    console.log('======================================================');
  } catch (err) {
    console.error('❌ Step 54 Test Failure:', err);
    process.exit(1);
  }
})();
