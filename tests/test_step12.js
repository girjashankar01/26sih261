// Step 12 Automated Verification Test
global.window = {
  addEventListener: () => {},
  dispatchEvent: (evt) => { global._lastEvent = evt; },
  appState: {
    _docs: [],
    _selectedDocId: null,
    getState: (k) => k === 'selectedAppId' ? 'DEMO-CLEAN-001' : null,
    setSelectedDoc: (id) => { global.window.appState._selectedDocId = id; },
    setState: (k, v) => { if (k === 'documents') global.window.appState._docs = v; },
    showToast: (msg, type) => { global._lastToast = { msg, type }; }
  },
  apiClient: {
    async getDocuments(appId) {
      return {
        application_id: appId,
        count: 2,
        documents: [
          {
            id: 'doc_affidavit_01',
            document_id: 'doc_affidavit_01',
            application_id: appId,
            doc_slot: 'affidavit',
            byte_size: 1572864, // 1.5 MB
            media_type: 'application/pdf',
            blake3: '4a9b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b',
            sha256: '9f8e7d6c5b4a3f2e1d0c9b8a7f6e5d4c3b2a1f0e9d8c7b6a5f4e3d2c1b0a9f8e',
            routing_outcome: 'BRANCH_A_DIGITAL'
          },
          {
            id: 'doc_fire_02',
            document_id: 'doc_fire_02',
            application_id: appId,
            doc_slot: 'fire_noc',
            byte_size: 524288, // 512 KB
            media_type: 'application/pdf',
            blake3: '1111222233334444555566667777888899990000aaaabbbbccccddddeeeeffff',
            sha256: 'aaaabbbbccccddddeeeeffff0000111122223333444455556666777788889999',
            routing_outcome: 'BRANCH_B_SCANNED'
          }
        ]
      };
    },
    async getDocumentRoute(appId, docId) {
      return { routing_outcome: 'BRANCH_A_DIGITAL', total_pages: 1 };
    },
    async extractDocument(appId, docId) {
      return { document_id: docId, status: 'C1_EXTRACTED', engine: 'docling_no_ocr' };
    }
  }
};
global.CustomEvent = class { constructor(name, opts) { this.name = name; this.detail = opts && opts.detail; } };
global._container = { innerHTML: '' };
global.document = {
  readyState: 'complete',
  addEventListener: () => {},
  getElementById: (id) => {
    if (id === 'workspace-documents-container') return global._container;
    return { innerHTML: '', style: {} };
  },
  querySelectorAll: () => []
};

const { DocumentListComponent } = require('../ui/js/components/document_list.js');
const docList = new DocumentListComponent();

async function runStep12Tests() {
  // 1. Verify renderDocumentCard formatting
  const sampleDoc = {
    document_id: 'doc_affidavit_01',
    application_id: 'DEMO-CLEAN-001',
    doc_slot: 'affidavit',
    byte_size: 1572864, // 1.5 MB
    media_type: 'application/pdf',
    blake3: '4a9b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b',
    sha256: '9f8e7d6c5b4a3f2e1d0c9b8a7f6e5d4c3b2a1f0e9d8c7b6a5f4e3d2c1b0a9f8e',
    routing_outcome: 'BRANCH_A_DIGITAL'
  };

  const cardHtml = docList.renderDocumentCard(sampleDoc);
  console.log('Sample Document Card HTML generated.');

  // Verify Slot label
  if (!cardHtml.includes('affidavit')) {
    throw new Error('Card missing slot label');
  }
  // Verify Byte size formatted
  if (!cardHtml.includes('1.5 MB')) {
    throw new Error('Card missing formatted byte size: ' + cardHtml);
  }
  // Verify first 16 chars of BLAKE3 & SHA-256
  const blake3Prefix = sampleDoc.blake3.slice(0, 16);
  const sha256Prefix = sampleDoc.sha256.slice(0, 16);
  if (!cardHtml.includes(blake3Prefix) || !cardHtml.includes(sha256Prefix)) {
    throw new Error('Card missing 16-char hash digests');
  }
  // Verify copy buttons
  if (!cardHtml.includes('btn-copy-hash')) {
    throw new Error('Card missing copy buttons');
  }
  // Verify S3 Routing badge
  if (!cardHtml.includes('BRANCH_A_DIGITAL')) {
    throw new Error('Card missing BRANCH_A_DIGITAL badge');
  }
  // Verify Action Buttons
  if (!cardHtml.includes('Inspect Forensics') || !cardHtml.includes('Run Extraction')) {
    throw new Error('Card missing action buttons');
  }
  console.log('DOCUMENT CARD RENDERING VERIFIED OK');

  // 2. Verify loadApplicationDocuments
  const docs = await docList.loadApplicationDocuments('DEMO-CLEAN-001', 'workspace-documents-container');
  console.log('Loaded docs count:', docs.length);
  if (docs.length !== 2) {
    throw new Error('Expected 2 documents loaded, got ' + docs.length);
  }
  if (!global._container.innerHTML.includes('doc_affidavit_01') || !global._container.innerHTML.includes('doc_fire_02')) {
    throw new Error('Grid container missing rendered document cards');
  }
  if (!global._container.innerHTML.includes('fire_noc') || !global._container.innerHTML.includes('512 KB')) {
    throw new Error('Second card details missing');
  }
  console.log('DOCUMENT GRID CONTAINER VERIFIED OK');

  // 3. Verify inspectForensics action
  docList.inspectForensics('DEMO-CLEAN-001', 'doc_affidavit_01');
  if (global.window.appState._selectedDocId !== 'doc_affidavit_01') {
    throw new Error('inspectForensics failed to select doc in state');
  }
  if (!global._lastEvent || global._lastEvent.name !== 'app:inspect-forensics') {
    throw new Error('app:inspect-forensics event not dispatched');
  }
  console.log('INSPECT FORENSICS ACTION VERIFIED OK');

  // 4. Verify runExtraction action
  await docList.runExtraction('DEMO-CLEAN-001', 'doc_affidavit_01');
  if (!global._lastEvent || global._lastEvent.name !== 'app:extraction-completed') {
    throw new Error('app:extraction-completed event not dispatched');
  }
  console.log('RUN EXTRACTION ACTION VERIFIED OK');

  console.log('ALL STEP 12 ACCEPTANCE TESTS PASSED 100%!');
}

runStep12Tests().catch(err => {
  console.error(err);
  process.exit(1);
});
