// Step 14 Automated Verification Test
global.window = {
  addEventListener: () => {},
  dispatchEvent: (evt) => { global._lastEvent = evt; },
  appState: {
    _apps: [],
    _selectedAppId: null,
    setState: (k, v) => { if (k === 'applications') global.window.appState._apps = v; },
    setSelectedApp: (id) => { global.window.appState._selectedAppId = id; },
    getState: (k) => k === 'applications' ? global.window.appState._apps : null
  },
  router: {
    navigate: (route) => { global._lastRoute = route; }
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
global._kpiContainer = { innerHTML: '' };
global._boardContainer = { innerHTML: '' };
global.document = {
  readyState: 'complete',
  addEventListener: () => {},
  getElementById: (id) => {
    if (id === 'queue-kpi-bar') return global._kpiContainer;
    if (id === 'queue-triage-board') return global._boardContainer;
    return { innerHTML: '', style: {} };
  }
};

const { QueueViewComponent } = require('../ui/js/components/queue_view.js');
const queueView = new QueueViewComponent();

async function runStep14Tests() {
  console.log('Running Step 14 4-Lane Triage Board tests...');

  // 1. Load queue data which triggers partition & render
  const result = await queueView.loadQueueData();
  console.log('Loaded applications count:', result.applications.length);

  // 2. Test partitionApplicationsByLane
  const partitions = queueView.partitionApplicationsByLane();
  console.log('Partitions summary:');
  console.log('  NEEDS_SCRUTINY:', partitions.NEEDS_SCRUTINY.map(a => a.id));
  console.log('  NEEDS_VERIFICATION:', partitions.NEEDS_VERIFICATION.map(a => a.id));
  console.log('  NEEDS_EVIDENCE:', partitions.NEEDS_EVIDENCE.map(a => a.id));
  console.log('  FAST_REVIEW:', partitions.FAST_REVIEW.map(a => a.id));

  if (partitions.NEEDS_SCRUTINY.length !== 1 || partitions.NEEDS_SCRUTINY[0].id !== 'DEMO-ISSUES-001') {
    throw new Error('DEMO-ISSUES-001 was not partitioned into NEEDS_SCRUTINY');
  }
  if (partitions.FAST_REVIEW.length !== 1 || partitions.FAST_REVIEW[0].id !== 'DEMO-CLEAN-001') {
    throw new Error('DEMO-CLEAN-001 was not partitioned into FAST_REVIEW');
  }
  console.log('PARTITIONS ACCURACY VERIFIED 100%');

  // 3. Verify Triage Board HTML structure
  const boardHtml = global._boardContainer.innerHTML;
  if (!boardHtml.includes('id="lane-col-NEEDS_SCRUTINY"') ||
      !boardHtml.includes('id="lane-col-NEEDS_VERIFICATION"') ||
      !boardHtml.includes('id="lane-col-NEEDS_EVIDENCE"') ||
      !boardHtml.includes('id="lane-col-FAST_REVIEW"')) {
    throw new Error('Triage board HTML missing 4 lane columns');
  }

  // Check card placements in HTML
  if (!boardHtml.includes('id="card-DEMO-ISSUES-001"') || !boardHtml.includes('id="card-DEMO-CLEAN-001"')) {
    throw new Error('Application cards missing in triage board HTML');
  }
  if (!boardHtml.includes('No applications in this lane')) {
    throw new Error('Empty lane placeholder missing');
  }
  console.log('TRIAGE BOARD HTML STRUCTURE VERIFIED OK (4 Columns, Cards & Empty States)');

  // 4. Test selectApplication action
  queueView.selectApplication('DEMO-ISSUES-001');
  if (global.window.appState._selectedDocId !== 'DEMO-ISSUES-001' && global.window.appState._selectedAppId !== 'DEMO-ISSUES-001') {
    throw new Error('selectApplication failed to set state');
  }
  if (global._lastRoute !== '#application/DEMO-ISSUES-001') {
    throw new Error('selectApplication failed to trigger router navigation');
  }
  if (!global._lastEvent || global._lastEvent.name !== 'app:application-selected') {
    throw new Error('app:application-selected event not dispatched');
  }
  console.log('APPLICATION SELECTION & ROUTING NAVIGATION VERIFIED OK');

  console.log('ALL STEP 14 ACCEPTANCE TESTS PASSED 100%!');
}

runStep14Tests().catch(err => {
  console.error(err);
  process.exit(1);
});
