/**
 * AICTE Application Validation Platform — Reactive Global State Store
 * Spec Reference: ROADMAP.md (Step 05)
 * Lightweight pub-sub store managing application context, officer role, and queue data.
 */

class StateStore {
  constructor() {
    this._state = {
      // User Persona & Security Scope
      currentRole: 'officer', // 'officer' | 'senior_officer' | 'institution' | 'auditor'
      offlineMode: true,

      // Queue & Applications
      applications: [],
      selectedAppId: null,
      selectedApplication: null, // Full S11 aggregate payload

      // Document Inspection & Evidence Viewer
      selectedDocId: null,
      selectedFindingId: null,
      activeDocumentPage: 1,

      // Aggregated Module Cache
      documents: [],
      findings: [],
      verifications: [],
      infra: null,
      alerts: [],
      alertsCount: 0,

      // Audit & Tamper Simulation State
      auditEvents: [],
      checkpoints: [],
      isChainVerified: null, // null = unknown, true = valid, false = broken
      isTampered: false,

      // UI Indicators
      isLoading: false,
      activeModal: null
    };

    // Listeners partitioned by key for fast dispatch
    this._listeners = new Map();
    this._globalListeners = new Set();
  }

  /**
   * Retrieve state property or entire state snapshot
   */
  getState(key = null) {
    if (key === null) {
      return { ...this._state };
    }
    return this._state[key];
  }

  /**
   * Mutate state and notify matching subscribers
   */
  setState(keyOrUpdates, valueOrNotify = undefined, notify = true) {
    let updates = {};
    let shouldNotify = true;

    if (typeof keyOrUpdates === 'string') {
      updates[keyOrUpdates] = valueOrNotify;
      shouldNotify = notify;
    } else if (typeof keyOrUpdates === 'object' && keyOrUpdates !== null) {
      updates = keyOrUpdates;
      shouldNotify = valueOrNotify !== false;
    }

    const changedKeys = [];

    for (const [k, newVal] of Object.entries(updates)) {
      const prevVal = this._state[k];
      if (prevVal !== newVal) {
        this._state[k] = newVal;
        changedKeys.push({ key: k, prevVal, newVal });
      }
    }

    if (shouldNotify && changedKeys.length > 0) {
      // 1. Notify key-specific listeners
      for (const { key, prevVal, newVal } of changedKeys) {
        if (this._listeners.has(key)) {
          this._listeners.get(key).forEach(listener => {
            try {
              listener(newVal, prevVal, this._state);
            } catch (err) {
              console.error(`[StateStore] Error in listener for "${key}":`, err);
            }
          });
        }
      }

      // 2. Notify global wildcard listeners
      this._globalListeners.forEach(listener => {
        try {
          listener(changedKeys, this._state);
        } catch (err) {
          console.error('[StateStore] Error in global listener:', err);
        }
      });

      // 3. Dispatch native DOM event if browser environment
      if (typeof window !== 'undefined' && typeof CustomEvent !== 'undefined' && typeof window.dispatchEvent === 'function') {
        window.dispatchEvent(new CustomEvent('app:state-change', {
          detail: { changedKeys, state: { ...this._state } }
        }));
      }
    }

    return this._state;
  }

  /**
   * Subscribe to specific state key or wildcard changes
   * Returns unsubscribe function
   */
  subscribe(key, listener) {
    if (typeof listener !== 'function') {
      throw new Error('[StateStore] Listener must be a function');
    }

    if (key === '*' || key === 'all') {
      this._globalListeners.add(listener);
      return () => this._globalListeners.delete(listener);
    }

    if (!this._listeners.has(key)) {
      this._listeners.set(key, new Set());
    }

    const listenersSet = this._listeners.get(key);
    listenersSet.add(listener);

    return () => {
      listenersSet.delete(listener);
      if (listenersSet.size === 0) {
        this._listeners.delete(key);
      }
    };
  }

  // =========================================================================
  // Helper Actions & Mutations
  // =========================================================================

  /**
   * Switch active user persona
   */
  setRole(newRole) {
    const validRoles = ['officer', 'senior_officer', 'institution', 'auditor'];
    if (!validRoles.includes(newRole)) {
      console.warn(`[StateStore] Invalid role: ${newRole}`);
      return;
    }
    this.setState('currentRole', newRole);
  }

  /**
   * Select active application in workspace
   */
  setSelectedApp(applicationId, appData = null) {
    const updates = {
      selectedAppId: applicationId,
      selectedDocId: null,
      selectedFindingId: null,
      activeDocumentPage: 1
    };

    if (appData) {
      updates.selectedApplication = appData;
      updates.documents = appData.documents || [];
      updates.findings = appData.findings || [];
      updates.verifications = appData.verifications || [];
      updates.infra = appData.infra || null;
      updates.alerts = appData.alerts || [];
      updates.alertsCount = (appData.alerts || []).length;
    }

    this.setState(updates);
  }

  /**
   * Focus a specific finding in Evidence Viewer
   */
  setSelectedFinding(findingId) {
    this.setState('selectedFindingId', findingId);
  }

  /**
   * Focus a specific document in Evidence Viewer
   */
  setSelectedDoc(documentId) {
    this.setState({
      selectedDocId: documentId,
      activeDocumentPage: 1
    });
  }

  /**
   * Append newly ingested document to active documents list (Step 10)
   */
  addDocument(doc) {
    if (!doc) return;
    const existing = Array.isArray(this._state.documents) ? this._state.documents : [];
    const filtered = existing.filter(d => d.document_id !== doc.document_id && d.storage_key !== doc.storage_key);
    this.setState('documents', [...filtered, doc]);
  }

  /**
   * Set audit chain verification result
   */
  setChainVerification(isValid) {
    this.setState('isChainVerified', isValid);
  }

  /**
   * Toggle educational tamper demo flag
   */
  setTampered(isTampered) {
    this.setState('isTampered', Boolean(isTampered));
  }

  /**
   * Global toast helper
   */
  showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = 'toast';
    if (type === 'error') {
      toast.style.borderColor = 'var(--status-fail)';
      toast.style.borderLeft = '4px solid var(--status-fail)';
    } else if (type === 'success') {
      toast.style.borderColor = 'var(--status-pass)';
      toast.style.borderLeft = '4px solid var(--status-pass)';
    }

    toast.innerHTML = `
      <span style="font-weight: 500;">${message}</span>
    `;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(100%)';
      toast.style.transition = 'all 200ms ease';
      setTimeout(() => toast.remove(), 200);
    }, 4000);
  }
}

// Export singleton instance globally and as module
const appState = new StateStore();
window.appState = appState;
window.StateStore = StateStore;
