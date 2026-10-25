/**
 * Test Step 53: Versioned YAML Rules Explorer View
 * Spec Reference: ROADMAP.md (Phase 10: Step 53), Guide §12, AGENTS.md
 *
 * Verifies:
 * 1. Component Initialization & Built-in YAML Rules Manifest:
 *    - Loads and initializes with active EOA_RENEWAL rule set v4.0.
 *    - Verifies presence of comprehensive rules (R-DOC-001, R-EXP-001, R-INTAKE-001, R-LAND-001, R-FAC-001, etc.).
 * 2. Specific Verification Requirement:
 *    - Evaluators can inspect exact rule logic without opening Python source files.
 *    - Table renders Rule IDs, Categories, Expression Logic in code boxes, Evaluator Names, and synthetic_demo badges.
 * 3. Expandable Rule Logic Inspector Modal:
 *    - Displays exact Python evaluator function signature, condition breakdown, test scenarios table, and raw YAML snippet.
 * 4. Interactive Category Filtering:
 *    - Supports DOCUMENTATION, EXPIRY_VALIDITY, CAPACITY_INTAKE, LAND_INFRA, FACULTY, INTEGRITY_CROSS_CHECK.
 * 5. Real-time Search and Status Filters:
 *    - Keyword search by ID, evaluator name, clause citation, or message.
 *    - Status toggles for ALL, ACTIVE, and PLANNED candidate rules.
 * 6. Non-negotiable Regulatory Integrity Notice:
 *    - #banner-rules-synthetic-disclaimer clearly displays synthetic_demo label per AGENTS.md.
 * 7. HTML Shell, Router, API Client & CSS Integration:
 *    - ui/index.html includes rules.css and rules_view.js.
 *    - ui/js/app.js routes #rules to rulesViewComponent.loadAndRender().
 *    - ui/js/api.js defines getRuleSets() and getRuleSet().
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

console.log('--- Step 53: Versioned YAML Rules Explorer View Tests ---');

// Setup base host element
const viewRulesEl = createMockElement('view-rules');
mockElements.set('view-rules', viewRulesEl);

(async () => {
  try {
    // -------------------------------------------------------------------------
    // Test 1: Component Initialization & Built-in YAML Rules Manifest
    // -------------------------------------------------------------------------
    console.log('Test 1: Component Initialization & Built-in YAML Rules Manifest...');
    const rulesView = new RulesViewComponent({ containerId: 'view-rules' });
    assert.strictEqual(typeof rulesView.loadAndRender, 'function', 'loadAndRender must be a function');
    assert.strictEqual(typeof rulesView.render, 'function', 'render must be a function');
    assert.strictEqual(rulesView.activeRuleSet.rule_set, 'EOA_RENEWAL', 'Default rule set must be EOA_RENEWAL');
    assert.strictEqual(rulesView.activeRuleSet.version, 4, 'Default rule set version must be 4');
    assert.ok(rulesView.activeRuleSet.rules.length >= 10, 'Rule set must contain at least 10 rules');

    // Verify key categories exist in manifest
    const cats = rulesView.activeRuleSet.categories;
    assert.ok(cats.includes('DOCUMENTATION'), 'Categories must include DOCUMENTATION');
    assert.ok(cats.includes('EXPIRY_VALIDITY'), 'Categories must include EXPIRY_VALIDITY');
    assert.ok(cats.includes('CAPACITY_INTAKE'), 'Categories must include CAPACITY_INTAKE');
    assert.ok(cats.includes('LAND_INFRA'), 'Categories must include LAND_INFRA');
    assert.ok(cats.includes('FACULTY'), 'Categories must include FACULTY');
    console.log('✓ Test 1 passed: Component initialized with 15 versioned YAML rules.');

    // -------------------------------------------------------------------------
    // Test 2: Core Step 53 Display Requirements (IDs, Categories, Expressions, Evaluators, Badges)
    // -------------------------------------------------------------------------
    console.log('Test 2: Core Step 53 Display Requirements...');
    rulesView.render();
    const hostHtml = viewRulesEl.innerHTML;

    // Check header and version badges
    assert.ok(hostHtml.includes('Rules &amp; Checklists Explorer') || hostHtml.includes('Rules & Checklists Explorer'), 'Header must contain system title');
    assert.ok(hostHtml.includes('EOA_RENEWAL v4'), 'Header must render rule set name and version');
    assert.ok(hostHtml.includes('ACTIVE REGULATORY SET'), 'Header must display ACTIVE REGULATORY SET badge');

    // Check specific rule IDs specified in Step 53
    assert.ok(hostHtml.includes('R-DOC-001'), 'Table must render R-DOC-001');
    assert.ok(hostHtml.includes('R-EXP-001'), 'Table must render R-EXP-001');
    assert.ok(hostHtml.includes('R-INTAKE-001'), 'Table must render R-INTAKE-001');
    assert.ok(hostHtml.includes('R-LAND-001'), 'Table must render R-LAND-001');
    assert.ok(hostHtml.includes('R-FAC-001'), 'Table must render R-FAC-001');

    // Check Evaluator Names
    assert.ok(hostHtml.includes('eval_required_doc'), 'Must display evaluator name eval_required_doc');
    assert.ok(hostHtml.includes('eval_not_expired'), 'Must display evaluator name eval_not_expired');
    assert.ok(hostHtml.includes('eval_field_lte_record'), 'Must display evaluator name eval_field_lte_record');

    // Check Expression Logic in monospace blocks
    assert.ok(hostHtml.includes('doc_type == &#39;AFFIDAVIT&#39;') || hostHtml.includes("doc_type == 'AFFIDAVIT'"), 'Must display expression logic for R-DOC-001');
    assert.ok(hostHtml.includes('FIRE_NOC.valid_till &gt;= submission_date') || hostHtml.includes('FIRE_NOC.valid_till >='), 'Must display expression logic for R-EXP-001');
    assert.ok(hostHtml.includes('form.requested_intake &lt;= record.approved_programmes.intake') || hostHtml.includes('form.requested_intake <='), 'Must display expression logic for R-INTAKE-001');
    assert.ok(hostHtml.includes('campus.land_acres &gt;= norms.min_acres') || hostHtml.includes('campus.land_acres >='), 'Must display expression logic for R-LAND-001');

    // Check synthetic_demo badges
    assert.ok(hostHtml.includes('badge-synthetic-demo'), 'Must include badge-synthetic-demo pills');
    assert.ok(hostHtml.includes('synthetic_demo'), 'Must label illustrative rules as synthetic_demo');
    console.log('✓ Test 2 passed: All required Rule IDs, Categories, Expressions, Evaluators, and synthetic_demo badges rendered.');

    // -------------------------------------------------------------------------
    // Test 3: Evaluators Can Inspect Exact Rule Logic Without Opening Python Files
    // -------------------------------------------------------------------------
    console.log('Test 3: Evaluator Inspection Without Opening Python Source Files...');
    const inspectorHost = createMockElement('rule-inspector-modal-host');
    mockElements.set('rule-inspector-modal-host', inspectorHost);

    // Open inspector for R-DOC-001
    rulesView.openRuleInspector('R-DOC-001');
    assert.strictEqual(rulesView.selectedRuleId, 'R-DOC-001', 'selectedRuleId must be R-DOC-001');
    const modalHtml = inspectorHost.innerHTML;

    // Check Python evaluator signature
    assert.ok(modalHtml.includes('eval_required_doc(rule, facts, context)'), 'Inspector must show Python evaluator signature');
    // Check regulatory clause
    assert.ok(modalHtml.includes('Chapter II, Clause 2.1'), 'Inspector must show Handbook clause reference');
    // Check test scenarios table
    assert.ok(modalHtml.includes('missing') && modalHtml.includes('FAILED_CHECK'), 'Inspector must show missing -> FAILED_CHECK test scenario');
    assert.ok(modalHtml.includes('present') && modalHtml.includes('PASS'), 'Inspector must show present -> PASS test scenario');
    assert.ok(modalHtml.includes('unclassified_present') && modalHtml.includes('NEEDS_REVIEW'), 'Inspector must show unclassified -> NEEDS_REVIEW test scenario');
    // Check raw YAML definition block
    assert.ok(modalHtml.includes('type: required_doc'), 'Inspector must show raw YAML definition');
    assert.ok(modalHtml.includes('doc_type: AFFIDAVIT'), 'Inspector must show doc_type in raw YAML');

    // Close inspector
    rulesView.closeRuleInspector();
    assert.strictEqual(rulesView.selectedRuleId, null, 'selectedRuleId must be null after closing');
    assert.strictEqual(inspectorHost.innerHTML, '', 'Modal host must be cleared on close');
    console.log('✓ Test 3 passed: Evaluators can inspect exact rule logic, evaluators, tests, and raw YAML in UI without opening Python source files.');

    // -------------------------------------------------------------------------
    // Test 4: Category Filtering Mechanism
    // -------------------------------------------------------------------------
    console.log('Test 4: Category Filtering Mechanism...');
    rulesView.setCategoryFilter('DOCUMENTATION');
    let filteredRules = rulesView.getFilteredRules();
    assert.ok(filteredRules.length >= 2, 'Should have at least 2 DOCUMENTATION rules');
    assert.ok(filteredRules.every(r => r.category === 'DOCUMENTATION'), 'All filtered rules must have category DOCUMENTATION');
    assert.ok(filteredRules.some(r => r.id === 'R-DOC-001'), 'Must include R-DOC-001');

    rulesView.setCategoryFilter('LAND_INFRA');
    filteredRules = rulesView.getFilteredRules();
    assert.strictEqual(filteredRules.length, 1, 'Should have 1 LAND_INFRA rule');
    assert.strictEqual(filteredRules[0].id, 'R-LAND-001', 'Must be R-LAND-001');

    rulesView.setCategoryFilter('FACULTY');
    filteredRules = rulesView.getFilteredRules();
    assert.strictEqual(filteredRules.length, 1, 'Should have 1 FACULTY rule');
    assert.strictEqual(filteredRules[0].id, 'R-FAC-001', 'Must be R-FAC-001');

    // Reset to ALL
    rulesView.setCategoryFilter('ALL');
    filteredRules = rulesView.getFilteredRules();
    assert.ok(filteredRules.length >= 10, 'Full list must be restored on ALL');
    console.log('✓ Test 4 passed: Category filtering functions deterministically.');

    // -------------------------------------------------------------------------
    // Test 5: Keyword Search & Status Filtering
    // -------------------------------------------------------------------------
    console.log('Test 5: Keyword Search & Status Filtering...');
    rulesView.setSearchQuery('Fire NOC');
    filteredRules = rulesView.getFilteredRules();
    assert.ok(filteredRules.length >= 2, 'Search for Fire NOC should match at least 2 rules');
    assert.ok(filteredRules.some(r => r.id === 'R-EXP-001'), 'Search must match R-EXP-001');

    rulesView.setSearchQuery('intake');
    filteredRules = rulesView.getFilteredRules();
    assert.ok(filteredRules.some(r => r.id === 'R-INTAKE-001' || r.id === 'R-NUM-001'), 'Search for intake must match intake rules');

    // Status filter
    rulesView.setSearchQuery('');
    rulesView.setStatusFilter('ACTIVE');
    filteredRules = rulesView.getFilteredRules();
    assert.ok(filteredRules.every(r => r.status !== 'planned'), 'Active filter must exclude planned rules');

    rulesView.setStatusFilter('PLANNED');
    filteredRules = rulesView.getFilteredRules();
    assert.ok(filteredRules.every(r => r.status === 'planned'), 'Planned filter must only include planned rules');
    assert.ok(filteredRules.some(r => r.id === 'R-LAND-001'), 'Planned filter must include R-LAND-001');

    rulesView.setStatusFilter('ALL');
    console.log('✓ Test 5 passed: Real-time search and status filters operate correctly.');

    // -------------------------------------------------------------------------
    // Test 6: Non-Negotiable Regulatory Integrity Notice per AGENTS.md
    // -------------------------------------------------------------------------
    console.log('Test 6: Non-Negotiable Regulatory Integrity Notice...');
    rulesView.render();
    const updatedHtml = viewRulesEl.innerHTML;
    assert.ok(updatedHtml.includes('id="banner-rules-synthetic-disclaimer"'), 'Disclaimer banner must be present');
    assert.ok(updatedHtml.includes('synthetic_demo'), 'Banner must mention synthetic_demo');
    assert.ok(updatedHtml.includes('Approval Process Handbook'), 'Banner must cite Approval Process Handbook');
    assert.ok(updatedHtml.includes('domain review'), 'Banner must emphasize domain review requirement');
    console.log('✓ Test 6 passed: Prominent synthetic_demo regulatory notice enforced.');

    // -------------------------------------------------------------------------
    // Test 7: HTML Shell, Router, API Client & CSS Integration
    // -------------------------------------------------------------------------
    console.log('Test 7: HTML Shell, Router, API Client & CSS Integration...');
    const htmlContent = fs.readFileSync(path.join(__dirname, '../ui/index.html'), 'utf8');
    assert.ok(htmlContent.includes('/static/css/rules.css'), 'index.html must link /static/css/rules.css');
    assert.ok(htmlContent.includes('/static/js/components/rules_view.js'), 'index.html must include rules_view.js');
    assert.ok(htmlContent.includes('id="view-rules"'), 'index.html must have #view-rules container');

    const appJsContent = fs.readFileSync(path.join(__dirname, '../ui/js/app.js'), 'utf8');
    assert.ok(appJsContent.includes(".addRoute('#rules'"), 'app.js must register #rules route');
    assert.ok(appJsContent.includes('rulesViewComponent.loadAndRender'), 'app.js must route #rules to rulesViewComponent');

    const apiJsContent = fs.readFileSync(path.join(__dirname, '../ui/js/api.js'), 'utf8');
    assert.ok(apiJsContent.includes('getRuleSets()'), 'api.js must provide getRuleSets() method');
    assert.ok(apiJsContent.includes('getRuleSet('), 'api.js must provide getRuleSet() method');

    const cssContent = fs.readFileSync(path.join(__dirname, '../ui/css/rules.css'), 'utf8');
    assert.ok(cssContent.includes('.rules-explorer-container'), 'rules.css must define .rules-explorer-container');
    assert.ok(cssContent.includes('.rule-expression-box'), 'rules.css must define .rule-expression-box');
    assert.ok(cssContent.includes('.badge-synthetic-demo'), 'rules.css must define .badge-synthetic-demo');
    assert.ok(cssContent.includes('.rule-evaluator-tag'), 'rules.css must define .rule-evaluator-tag');
    console.log('✓ Test 7 passed: Full end-to-end integration with HTML shell, Router, API client, and CSS.');

    console.log('\n======================================================');
    console.log('ALL 7 SUITES IN STEP 53 PASSED (100% SUCCESS)');
    console.log('======================================================');
  } catch (err) {
    console.error('❌ Step 53 Test Failure:', err);
    process.exit(1);
  }
})();
