// Step 13 Automated Verification Test
global.window = {
  addEventListener: () => {},
  dispatchEvent: (evt) => { global._lastEvent = evt; },
  appState: {
    _apps: [],
    setState: (k, v) => { if (k === 'applications') global.window.appState._apps = v; },
    getState: (k) => k === 'applications' ? global.window.appState._apps : null
  },
  apiClient: {
    async getDemoApplications() {
      return {
        simulated: true,
        items: [
          {
            id: 'DEMO-CLEAN-001',
            category: 'EOA_RENEWAL',
            institution_name: 'Apex Institute of Technology',
            submitted_on: '2026-10-12',
            requested_intake: 480
          },
          {
            id: 'DEMO-ISSUES-001',
            category: 'EOA_RENEWAL',
            institution_name: 'Beacon College of Engineering',
            submitted_on: '2026-10-12',
            requested_intake: 540
          }
        ]
      };
    },
    async getApplicationAggregate(appId) {
      if (appId === 'DEMO-CLEAN-001') {
        return {
          application_id: appId,
          workflow_status: 'VALIDATED_NO_ISSUES',
          review_lane: 'FAST_REVIEW',
          findings: [],
          checks: [{ rule_id: 'R-DOC-001', reason: 'Affidavit verified' }],
          priority: { score: 0 }
        };
      } else if (appId === 'DEMO-ISSUES-001') {
        return {
          application_id: appId,
          workflow_status: 'NEEDS_RECTIFICATION',
          review_lane: 'NEEDS_SCRUTINY',
          findings: [
            { rule_id: 'R-EXP-001', severity: 'high', reason: 'Fire NOC expired' }
          ],
          checks: [],
          priority: { score: 100 }
        };
      }
      return null;
    }
  }
};
global.CustomEvent = class { constructor(name, opts) { this.name = name; this.detail = opts && opts.detail; } };
global._container = { innerHTML: '' };
global.document = {
  readyState: 'complete',
  addEventListener: () => {},
  getElementById: (id) => {
    if (id === 'queue-kpi-bar') return global._container;
    return { innerHTML: '', style: {} };
  }
};

const { QueueViewComponent } = require('../ui/js/components/queue_view.js');
const queueView = new QueueViewComponent();

async function runStep13Tests() {
  console.log('Running Step 13 Queue Dashboard & KPI Metrics tests...');

  // 1. Load queue data
  const result = await queueView.loadQueueData();
  console.log('Loaded applications count:', result.applications.length);
  if (result.applications.length !== 2) {
    throw new Error('Expected 2 applications loaded, got ' + result.applications.length);
  }

  // 2. Verify KPI metrics calculation
  console.log('Computed KPI metrics:', queueView.kpi);
  if (queueView.kpi.total !== 2) {
    throw new Error('Expected total = 2, got ' + queueView.kpi.total);
  }
  if (queueView.kpi.critical !== 1) {
    throw new Error('Expected critical = 1 (DEMO-ISSUES-001 in NEEDS_SCRUTINY), got ' + queueView.kpi.critical);
  }
  if (queueView.kpi.verification !== 0) {
    throw new Error('Expected verification = 0, got ' + queueView.kpi.verification);
  }
  if (queueView.kpi.fastReview !== 1) {
    throw new Error('Expected fastReview = 1 (DEMO-CLEAN-001 in FAST_REVIEW), got ' + queueView.kpi.fastReview);
  }
  console.log('KPI METRICS CALCULATION VERIFIED ACCURATE: 2 Total, 1 Critical, 0 Verification, 1 Fast Review');

  // 3. Verify KPI Bar HTML rendering
  const kpiHtml = global._container.innerHTML;
  if (!kpiHtml.includes('Total Active Queue') || !kpiHtml.includes('Needs Scrutiny') || !kpiHtml.includes('Fast Review Eligible')) {
    throw new Error('KPI Bar HTML missing labels');
  }
  if (!kpiHtml.includes('id="kpi-val-total">2') || !kpiHtml.includes('id="kpi-val-critical">1') || !kpiHtml.includes('id="kpi-val-fast">1')) {
    throw new Error('KPI values missing or mismatched in rendered HTML');
  }
  console.log('KPI BAR RENDERING VERIFIED OK');

  // 4. Verify global state synchronization
  if (global.window.appState._apps.length !== 2) {
    throw new Error('AppState applications list was not synchronized');
  }
  console.log('APPSTATE SYNCHRONIZATION VERIFIED OK');

  // 5. Verify DOM event dispatch
  if (!global._lastEvent || global._lastEvent.name !== 'app:queue-loaded') {
    throw new Error('app:queue-loaded event not dispatched');
  }
  console.log('EVENT app:queue-loaded VERIFIED OK');

  console.log('ALL STEP 13 ACCEPTANCE TESTS PASSED 100%!');
}

runStep13Tests().catch(err => {
  console.error(err);
  process.exit(1);
});
