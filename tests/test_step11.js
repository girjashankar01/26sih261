// Step 11 Automated Verification Test
global.window = {
  addEventListener: () => {},
  dispatchEvent: (evt) => { global._lastEvent = evt; },
  navbarComponent: {
    openModal: (title, body, footer) => {
      global._lastModal = { title, body, footer };
    },
    closeModal: () => {
      global._lastModal = null;
    }
  },
  apiClient: {
    async getDocumentRoute(appId, docId) {
      if (docId === 'doc_digital_1') {
        return {
          application_id: appId,
          document_id: docId,
          routing_outcome: 'BRANCH_A_DIGITAL',
          reason: 'All pages born-digital with native vector text layer',
          total_pages: 1,
          page_counts: { digital: 1 },
          detected_kind: 'pdf',
          blake3: '11112222333344445555666677778888',
          processing_state: 'ROUTED',
          page_verdicts: [{ page_index: 1, label: 'digital', reason: 'High font sanity', metrics: { visible: 450, cover_max: 0 } }]
        };
      } else if (docId === 'doc_scanned_2') {
        return {
          application_id: appId,
          document_id: docId,
          routing_outcome: 'BRANCH_B_SCANNED',
          reason: 'Scanned raster image detected (coverage >= 60%)',
          total_pages: 1,
          page_counts: { scanned: 1 },
          detected_kind: 'png',
          blake3: '99998888777766665555444433332222',
          processing_state: 'ROUTED',
          page_verdicts: [{ page_index: 1, label: 'scanned', reason: 'Raster image', metrics: { visible: 0, cover_max: 1.0 } }]
        };
      }
      throw new Error('Doc not found');
    }
  }
};
global.CustomEvent = class { constructor(name, opts) { this.name = name; this.detail = opts && opts.detail; } };
global._badges = {};
global.document = {
  readyState: 'complete',
  addEventListener: () => {},
  querySelectorAll: (selector) => {
    const parts = selector.split('"');
    if (parts.length >= 2) {
      const docId = parts[1];
      if (!global._badges[docId]) global._badges[docId] = { innerHTML: '' };
      return [global._badges[docId]];
    }
    return [];
  }
};

const { DocumentListComponent, ROUTING_METADATA } = require('../ui/js/components/document_list.js');
const docList = new DocumentListComponent();

async function runStep11Tests() {
  // 1. Verify getRoutingBadge outputs correct CSS class and label
  const digitalBadge = docList.getRoutingBadge('BRANCH_A_DIGITAL');
  console.log('Digital Badge HTML:', digitalBadge);
  if (!digitalBadge.includes('BRANCH_A_DIGITAL') || !digitalBadge.includes('badge-routing-digital')) {
    throw new Error('Digital badge output incorrect');
  }

  const scannedBadge = docList.getRoutingBadge('BRANCH_B_SCANNED');
  console.log('Scanned Badge HTML:', scannedBadge);
  if (!scannedBadge.includes('BRANCH_B_SCANNED') || !scannedBadge.includes('badge-routing-scanned')) {
    throw new Error('Scanned badge output incorrect');
  }

  // 2. Test fetchAndBindRoute for Digital PDF
  const res1 = await docList.fetchAndBindRoute('DEMO-CLEAN-001', 'doc_digital_1');
  console.log('Fetched route for doc_digital_1:', res1.routing_outcome);
  if (res1.routing_outcome !== 'BRANCH_A_DIGITAL') {
    throw new Error('Expected BRANCH_A_DIGITAL');
  }
  if (!global._badges['doc_digital_1'].innerHTML.includes('BRANCH_A_DIGITAL')) {
    throw new Error('DOM binding failed for doc_digital_1');
  }
  console.log('DOM BINDING FOR DIGITAL PDF VERIFIED OK');

  // 3. Test fetchAndBindRoute for Scanned Image
  const res2 = await docList.fetchAndBindRoute('DEMO-CLEAN-001', 'doc_scanned_2');
  console.log('Fetched route for doc_scanned_2:', res2.routing_outcome);
  if (res2.routing_outcome !== 'BRANCH_B_SCANNED') {
    throw new Error('Expected BRANCH_B_SCANNED');
  }
  if (!global._badges['doc_scanned_2'].innerHTML.includes('BRANCH_B_SCANNED')) {
    throw new Error('DOM binding failed for doc_scanned_2');
  }
  console.log('DOM BINDING FOR SCANNED IMAGE VERIFIED OK');

  // 4. Verify custom event was dispatched
  console.log('Last event name:', global._lastEvent && global._lastEvent.name);
  if (!global._lastEvent || global._lastEvent.name !== 'app:document-routed') {
    throw new Error('app:document-routed event not dispatched');
  }
  console.log('EVENT app:document-routed VERIFIED OK');

  // 5. Verify routing inspector modal
  docList.openRoutingInspectorModal('DEMO-CLEAN-001', 'doc_digital_1');
  if (!global._lastModal || !global._lastModal.title.includes('doc_digital_1')) {
    throw new Error('Routing inspector modal did not open');
  }
  if (!global._lastModal.body.includes('Routing Threshold Breakdown')) {
    throw new Error('Modal body missing threshold breakdown');
  }
  console.log('ROUTING INSPECTION MODAL VERIFIED OK:', global._lastModal.title);

  console.log('ALL STEP 11 ACCEPTANCE TESTS PASSED 100%!');
}

runStep11Tests().catch(err => {
  console.error(err);
  process.exit(1);
});
