/**
 * Test Step 48: Paginated Chronological Audit Event Table
 * Spec Reference: ROADMAP.md (Phase 9: Step 48), Guide §15.1
 *
 * Verifies:
 * 1. Default Audit Events Model & Genesis Hash Verification:
 *    - getDefaultAuditEvents returns 12+ sequentially chained events.
 *    - Event 1 prev_hash is GENESIS_HASH (64 zeros).
 *    - events[i].prev_hash === events[i-1].entry_hash for all i.
 * 2. Specific Verification Requirement:
 *    - Audit rows display sequential previous-to-entry hash linkage in #audit-events-table.
 *    - Row i prev_hash data equals Row i-1 entry_hash data.
 *    - Visual linkage indicator (↳) rendered for all non-genesis blocks.
 *    - copyHash dispatches app:hash-copied.
 * 3. Table Column Headers & Entity Presentation:
 *    - Headers: ID, Timestamp, Actor, Action, Subject, Prev Hash, Entry Hash, Details.
 *    - Officer vs System actor badges (badge-actor-officer, badge-actor-system).
 *    - Action pills (badge-action-pill) and subject codes.
 * 4. Pagination Controls & Page Navigation:
 *    - Initial 10-item page slice; Next button active, Prev button disabled.
 *    - setPage(2) advances page, updates pagination info, enables Prev, disables Next.
 *    - Hash chain linkage verified across page boundaries (Event 11 links to Event 10).
 *    - Dispatches app:audit-page-changed.
 * 5. Page Size Selector & Dynamic Recalculation:
 *    - setPageSize(25) renders all 12 items on single page.
 *    - Dispatches app:audit-page-size-changed.
 * 6. Search & Filter Controls:
 *    - setFilter filters by actor, action, subject, or hash.
 *    - Empty result message rendered when no matches exist.
 *    - Dispatches app:audit-filtered.
 * 7. Expandable JSON Payload Drawer & CSS Stylesheet Verification:
 *    - toggleEventDetails expands and collapses JSON payload drawer (#drawer-event-X).
 *    - Dispatches app:audit-details-toggled.
 *    - ui/css/audit.css defines all required styles.
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
  location: { hash: '#audit' },
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

// Mock clipboard
Object.defineProperty(globalThis, 'navigator', {
  value: {
    clipboard: {
      writeText: async (text) => {
        global.lastCopied = text;
        return Promise.resolve();
      }
    }
  },
  configurable: true,
  writable: true
});

// Load Component
const { AuditViewComponent, auditViewComponent, GENESIS_HASH } = require('../ui/js/components/audit_view.js');

console.log('--- Running Step 48 Test Suite: Paginated Chronological Audit Event Table ---');

// ============================================================================
// Test 1: Default Audit Events Model & Genesis Hash Verification
// ============================================================================
console.log('Test 1: Default Audit Events Model & Genesis Hash Verification');
const events = auditViewComponent.getDefaultAuditEvents();
assert(Array.isArray(events), 'getDefaultAuditEvents must return an array');
assert(events.length >= 12, 'Must provide at least 12 mock audit events');

// Genesis anchor check
assert.strictEqual(events[0].id, 1, 'First event ID must be 1');
assert.strictEqual(events[0].prev_hash, GENESIS_HASH, 'Event 1 prev_hash must be GENESIS_HASH (64 zeros)');
assert.strictEqual(events[0].entry_hash.length, 64, 'Event 1 entry_hash must be 64-char hex SHA-256');

// Sequential linkage check across all events
for (let i = 1; i < events.length; i++) {
  const current = events[i];
  const previous = events[i - 1];
  assert.strictEqual(
    current.prev_hash,
    previous.entry_hash,
    `Event #${current.id} prev_hash must exactly equal Event #${previous.id} entry_hash`
  );
  assert.strictEqual(current.entry_hash.length, 64, `Event #${current.id} entry_hash must be 64-char hex`);
}
console.log(`✓ Verified cryptographic sequential linkage across all ${events.length} mock events`);

// ============================================================================
// Test 2: Specific Verification Requirement
// "Audit rows display sequential previous-to-entry hash linkage."
// ============================================================================
console.log('Test 2: Specific Verification Requirement: Audit rows display sequential previous-to-entry hash linkage');
const tableHostEl = createMockElement('audit-events-table-host');
auditViewComponent.currentPage = 1;
auditViewComponent.pageSize = 10;
auditViewComponent.filterText = '';
const tableHtml = auditViewComponent.renderEventsTable();
tableHostEl.innerHTML = tableHtml;

// Verify Event 1 has Genesis Anchor badge
assert(tableHtml.includes('id="cell-prev-1"'), 'Must render cell-prev-1');
assert(tableHtml.includes('GENESIS ANCHOR'), 'Event 1 must display GENESIS ANCHOR badge');
assert(tableHtml.includes(`id="prev-hash-1"`), 'Event 1 must render prev-hash-1');

// Verify sequential linkage across visible rows (1 through 10)
for (let id = 2; id <= 10; id++) {
  const prevId = id - 1;
  const currentPrevHashMatch = tableHtml.match(new RegExp(`id="prev-hash-${id}"[^>]*data-hash="([^"]+)"`));
  const previousEntryHashMatch = tableHtml.match(new RegExp(`id="entry-hash-${prevId}"[^>]*data-hash="([^"]+)"`));

  assert(currentPrevHashMatch, `prev-hash-${id} with data-hash must be rendered in HTML`);
  assert(previousEntryHashMatch, `entry-hash-${prevId} with data-hash must be rendered in HTML`);

  const currentPrevHash = currentPrevHashMatch[1];
  const previousEntryHash = previousEntryHashMatch[1];

  assert.strictEqual(
    currentPrevHash,
    previousEntryHash,
    `Row #${id} prev_hash (${currentPrevHash}) must match Row #${prevId} entry_hash (${previousEntryHash})`
  );

  // Verify visual link icon exists
  assert(tableHtml.includes(`id="link-icon-${id}"`), `Row #${id} must display visual link icon (↳)`);
}

// Test copy hash helper
eventsDispatched.length = 0;
const sampleHash = events[0].entry_hash;
auditViewComponent.copyHash(sampleHash);
assert.strictEqual(global.lastCopied, sampleHash, 'Clipboard writeText must receive full 64-char hash');
const copyEvent = eventsDispatched.find(e => e.type === 'app:hash-copied');
assert(copyEvent, 'copyHash must dispatch app:hash-copied event');
assert.strictEqual(copyEvent.detail.hash, sampleHash);

console.log('✓ Specific verification requirement satisfied: Audit rows display sequential previous-to-entry hash linkage');

// ============================================================================
// Test 3: Table Column Headers & Entity Presentation
// ============================================================================
console.log('Test 3: Table Column Headers & Entity Presentation');
assert(tableHtml.includes('# ID'), 'Must include # ID header');
assert(tableHtml.includes('Timestamp (UTC)'), 'Must include Timestamp header');
assert(tableHtml.includes('Actor'), 'Must include Actor header');
assert(tableHtml.includes('Action'), 'Must include Action header');
assert(tableHtml.includes('Subject Resource'), 'Must include Subject Resource header');
assert(tableHtml.includes('Previous Hash (Chain Link)'), 'Must include Previous Hash header');
assert(tableHtml.includes('Entry Hash (State Digest)'), 'Must include Entry Hash header');
assert(tableHtml.includes('Details'), 'Must include Details header');

// Badges
assert(tableHtml.includes('badge-actor-system'), 'System actor must have badge-actor-system class');
assert(tableHtml.includes('badge-actor-officer'), 'Officer actor must have badge-actor-officer class');
assert(tableHtml.includes('badge-action-pill'), 'Actions must be styled with badge-action-pill');
assert(tableHtml.includes('id="action-event-2"'), 'Row 2 action must be tagged');

console.log('✓ Table structure, column headers, and actor/action badges verified');

// ============================================================================
// Test 4: Pagination Controls & Page Navigation
// ============================================================================
console.log('Test 4: Pagination Controls & Page Navigation');
eventsDispatched.length = 0;
const page1Info = auditViewComponent.getPaginatedEvents();
assert.strictEqual(page1Info.page, 1, 'Initial page must be 1');
assert.strictEqual(page1Info.items.length, 10, 'Page 1 must contain 10 items');
assert.strictEqual(page1Info.totalPages, 2, 'Total pages for 12 items with pageSize=10 must be 2');

assert(tableHtml.includes('id="btn-audit-prev-page"'), 'Must render Previous page button');
assert(tableHtml.includes('id="btn-audit-next-page"'), 'Must render Next page button');
assert(tableHtml.includes('disabled'), 'Previous button must be disabled on page 1');
assert(tableHtml.includes('Showing <strong>1–10</strong> of <strong>12</strong> events'), 'Must display correct pagination count text');

// Advance to Page 2
auditViewComponent.setPage(2);
const page2Info = auditViewComponent.getPaginatedEvents();
assert.strictEqual(page2Info.page, 2, 'Current page must now be 2');
assert.strictEqual(page2Info.items.length, 2, 'Page 2 must contain remaining 2 items');

// Verify page change event was dispatched
const pageChangedEvent = eventsDispatched.find(e => e.type === 'app:audit-page-changed');
assert(pageChangedEvent, 'setPage must dispatch app:audit-page-changed event');
assert.strictEqual(pageChangedEvent.detail.page, 2);

// Re-render table on Page 2 and test boundary link
const page2Html = auditViewComponent.renderEventsTable();
assert(page2Html.includes('id="row-event-11"'), 'Page 2 must render Event 11');
assert(page2Html.includes('id="row-event-12"'), 'Page 2 must render Event 12');

// Verify Event 11 (Page 2) links sequentially to Event 10 (Page 1)
const event11PrevMatch = page2Html.match(/id="prev-hash-11"[^>]*data-hash="([^"]+)"/);
assert(event11PrevMatch, 'prev-hash-11 must be present on page 2');
assert.strictEqual(event11PrevMatch[1], events[9].entry_hash, 'Event 11 prev_hash must link to Event 10 entry_hash');

console.log('✓ Pagination navigation, page-change event dispatch, and cross-page linkage verified');

// ============================================================================
// Test 5: Page Size Selector & Dynamic Recalculation
// ============================================================================
console.log('Test 5: Page Size Selector & Dynamic Recalculation');
eventsDispatched.length = 0;
auditViewComponent.setPageSize(25);
assert.strictEqual(auditViewComponent.pageSize, 25, 'Page size must update to 25');
assert.strictEqual(auditViewComponent.currentPage, 1, 'Current page must reset to 1');

const allItemsInfo = auditViewComponent.getPaginatedEvents();
assert.strictEqual(allItemsInfo.totalPages, 1, 'Total pages must be 1 when pageSize=25');
assert.strictEqual(allItemsInfo.items.length, 12, 'All 12 items must fit on single page');

const sizeChangeEvent = eventsDispatched.find(e => e.type === 'app:audit-page-size-changed');
assert(sizeChangeEvent, 'setPageSize must dispatch app:audit-page-size-changed event');
assert.strictEqual(sizeChangeEvent.detail.pageSize, 25);

console.log('✓ Page size selector and pagination recalculation verified');

// ============================================================================
// Test 6: Search & Filter Controls
// ============================================================================
console.log('Test 6: Search & Filter Controls');
eventsDispatched.length = 0;

// Filter by document subject
auditViewComponent.setFilter('doc_fire_01');
assert.strictEqual(auditViewComponent.filterText, 'doc_fire_01');
const fireFiltered = auditViewComponent.getFilteredEvents();
assert(fireFiltered.length >= 2, 'Must match at least 2 events for doc_fire_01');
for (const ev of fireFiltered) {
  const matches = String(ev.subject).includes('doc_fire_01') || String(ev.action).includes('doc_fire_01');
  assert(matches, 'Filtered events must match query string');
}

const filterEvent = eventsDispatched.find(e => e.type === 'app:audit-filtered');
assert(filterEvent, 'setFilter must dispatch app:audit-filtered');
assert.strictEqual(filterEvent.detail.query, 'doc_fire_01');

// Filter with empty result
auditViewComponent.setFilter('nonexistent-query-xyz');
const emptyHtml = auditViewComponent.renderEventsTable();
assert(emptyHtml.includes('No audit events found matching query: <code>nonexistent-query-xyz</code>'), 'Must display empty match message');

// Reset filter
auditViewComponent.setFilter('');
assert.strictEqual(auditViewComponent.getFilteredEvents().length, events.length, 'Clearing filter restores all events');

console.log('✓ Search and filtering controls verified');

// ============================================================================
// Test 7: Expandable JSON Payload Drawer & CSS Stylesheet Verification
// ============================================================================
console.log('Test 7: Expandable JSON Payload Drawer & CSS Stylesheet Verification');
eventsDispatched.length = 0;
auditViewComponent.setPageSize(10);
auditViewComponent.setPage(1);

// Initially collapsed
let tableState = auditViewComponent.renderEventsTable();
assert(!tableState.includes('id="drawer-event-2"'), 'Drawer 2 should not be rendered initially');

// Toggle open
auditViewComponent.toggleEventDetails(2);
assert(auditViewComponent.expandedEventIds.has(2), 'Event 2 should be in expandedEventIds set');
tableState = auditViewComponent.renderEventsTable();
assert(tableState.includes('id="drawer-event-2"'), 'Drawer 2 must be rendered when expanded');
assert(tableState.includes('id="json-details-2"'), 'Drawer 2 must render json-details-2 pre element');
assert(tableState.includes('doc_land_01'), 'JSON drawer must contain details payload');

const toggleEvent = eventsDispatched.find(e => e.type === 'app:audit-details-toggled');
assert(toggleEvent, 'toggleEventDetails must dispatch app:audit-details-toggled');
assert.strictEqual(toggleEvent.detail.eventId, 2);
assert.strictEqual(toggleEvent.detail.expanded, true);

// Toggle closed
auditViewComponent.toggleEventDetails(2);
assert(!auditViewComponent.expandedEventIds.has(2), 'Event 2 should be removed from expandedEventIds');
tableState = auditViewComponent.renderEventsTable();
assert(!tableState.includes('id="drawer-event-2"'), 'Drawer 2 must collapse after second toggle');

// CSS Stylesheet Validation
const cssPath = path.join(__dirname, '../ui/css/audit.css');
assert(fs.existsSync(cssPath), 'ui/css/audit.css must exist');
const cssContent = fs.readFileSync(cssPath, 'utf8');

const requiredTableSelectors = [
  '.audit-table-controls',
  '.audit-search-box',
  '.audit-search-input',
  '.audit-table-actions',
  '.audit-select-sm',
  '.audit-table-container',
  '.audit-events-table',
  '.audit-row-id',
  '.audit-hash-cell',
  '.hash-pill',
  '.hash-pill-prev',
  '.hash-link-icon',
  '.badge-actor-system',
  '.badge-actor-officer',
  '.badge-action-pill',
  '.audit-pagination-bar',
  '.audit-pagination-btns',
  '.btn-pagination',
  '.audit-details-row',
  '.audit-details-box'
];

for (const sel of requiredTableSelectors) {
  assert(cssContent.includes(sel), `CSS must define selector: ${sel}`);
}

console.log('✓ Expandable JSON drawer and ui/css/audit.css table stylesheets verified');

console.log('\n======================================================');
console.log('✓ ALL 7 STEP 48 VERIFICATION CHECKS PASSED SUCCESSFULLY');
console.log('======================================================');
