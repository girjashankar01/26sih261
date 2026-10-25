/**
 * AICTE Decision Support Prototype - Keyboard Triage Shortcuts Engine
 * Step 56: Keyboard Triage Shortcuts Engine
 * Step 57: Keyboard Shortcuts Cheat Sheet Modal (?)
 * Spec Reference: Prototype Guide §17.3, §17.4, ROADMAP.md (Phase 10: Steps 56 & 57)
 *
 * Implements rapid officer triage shortcuts:
 * - J / K: Next / Previous finding card (scrolls canvas to grounded evidence)
 * - Enter: Inspect active finding details
 * - A: Trigger Acknowledge action
 * - D: Open Dismiss reason dialog (Guide §17.4 mandatory human justification)
 * - R: Open Request Rectification dialog
 * - E: Trigger Escalate action
 * - V: Run Live Audit Hash Chain Verification
 * - /: Focus search input
 * - 1 - 5: Rapid view navigation (#queue, #workspace, #rules, #audit, #realness)
 * - ?: Open / Toggle Keyboard Shortcuts Cheat Sheet modal
 * - Escape: Deselect finding / dismiss active dialog / blur inputs
 */

(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.KeyboardShortcutsEngine = factory();
    root.keyboardShortcuts = new root.KeyboardShortcutsEngine();
    // Auto-initialize on load if document is ready
    if (typeof document !== 'undefined') {
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => root.keyboardShortcuts.init());
      } else {
        root.keyboardShortcuts.init();
      }
    }
  }
}(typeof self !== 'undefined' ? self : this, function () {

  class KeyboardShortcutsEngine {
    constructor(options = {}) {
      this.isEnabled = options.enabled !== false;
      this.activeFindingIndex = -1;
      this.toastTimeout = null;
      this.isCheatSheetOpen = false;
      this.boundHandler = this.handleKeyDown.bind(this);
      this.isInitialized = false;
    }

    /**
     * Initialize keyboard event listeners
     */
    init() {
      if (this.isInitialized || typeof window === 'undefined') return;
      window.addEventListener('keydown', this.boundHandler, true);
      this.isInitialized = true;

      // Wire ? button in top navigation bar if present
      if (typeof document !== 'undefined') {
        const btnHelp = document.getElementById('btn-shortcuts-help');
        if (btnHelp) {
          btnHelp.addEventListener('click', (e) => {
            e.preventDefault();
            this.toggleCheatSheet();
          });
        }
      }
    }

    /**
     * Destroy / remove listener
     */
    destroy() {
      if (typeof window !== 'undefined') {
        window.removeEventListener('keydown', this.boundHandler, true);
      }
      this.isInitialized = false;
    }

    /**
     * Core keydown dispatcher
     */
    handleKeyDown(e) {
      if (!this.isEnabled) return;

      const target = e.target || {};
      const tagName = (target.tagName || '').toUpperCase();
      const isInput = tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT' || target.isContentEditable;

      // When inside an input field, handle Escape to close cheat sheet or blur field
      if (isInput) {
        if (e.key === 'Escape') {
          if (this.isCheatSheetOpen) {
            e.preventDefault();
            this.closeCheatSheet();
            return;
          }
          if (typeof target.blur === 'function') target.blur();
        }
        return;
      }

      // Do not intercept if Ctrl or Meta (Command) or Alt is pressed (allow browser shortcuts)
      if (e.ctrlKey || e.metaKey || e.altKey) {
        return;
      }

      const key = e.key;

      switch (key) {
        case 'j':
        case 'J':
          e.preventDefault();
          this.focusNextFinding();
          break;

        case 'k':
        case 'K':
          e.preventDefault();
          this.focusPreviousFinding();
          break;

        case 'Enter':
          this.handleEnter();
          break;

        case 'a':
        case 'A':
          e.preventDefault();
          this.triggerAction('acknowledge');
          break;

        case 'd':
        case 'D':
          e.preventDefault();
          this.triggerAction('dismiss');
          break;

        case 'r':
        case 'R':
          e.preventDefault();
          this.triggerAction('request_rectification');
          break;

        case 'e':
        case 'E':
          e.preventDefault();
          this.triggerAction('escalate');
          break;

        case 'v':
        case 'V':
          e.preventDefault();
          this.triggerAuditVerification();
          break;

        case '/':
          e.preventDefault();
          this.focusSearchInput();
          break;

        case '1':
          e.preventDefault();
          this.navigateToRoute('#queue');
          break;

        case '2':
          e.preventDefault();
          this.navigateToRoute('#workspace');
          break;

        case '3':
          e.preventDefault();
          this.navigateToRoute('#rules');
          break;

        case '4':
          e.preventDefault();
          this.navigateToRoute('#audit');
          break;

        case '5':
          e.preventDefault();
          this.navigateToRoute('#realness');
          break;

        case '?':
          e.preventDefault();
          this.toggleCheatSheet();
          break;

        case 'Escape':
          this.handleEscape();
          break;

        default:
          break;
      }
    }

    /**
     * Resolve all finding card elements in the active view
     */
    getFindingCards() {
      if (typeof document === 'undefined') return [];
      const cards = Array.from(document.querySelectorAll('.finding-card'));
      return cards;
    }

    /**
     * Focus Next Finding (J)
     */
    focusNextFinding() {
      const cards = this.getFindingCards();
      if (!cards || cards.length === 0) {
        this.showToast('No active finding cards in current view');
        return null;
      }

      let nextIndex = this.activeFindingIndex + 1;
      if (nextIndex >= cards.length) {
        nextIndex = 0; // Wrap around to first
      }

      return this.activateFindingAtIndex(nextIndex, cards);
    }

    /**
     * Focus Previous Finding (K)
     */
    focusPreviousFinding() {
      const cards = this.getFindingCards();
      if (!cards || cards.length === 0) {
        this.showToast('No active finding cards in current view');
        return null;
      }

      let prevIndex = this.activeFindingIndex - 1;
      if (prevIndex < 0) {
        prevIndex = cards.length - 1; // Wrap around to last
      }

      return this.activateFindingAtIndex(prevIndex, cards);
    }

    /**
     * Activate a finding at specific index, updating DOM styles and invoking canvas sync
     */
    activateFindingAtIndex(index, cards) {
      if (!cards) cards = this.getFindingCards();
      if (index < 0 || index >= cards.length) return null;

      // Remove active class from all cards
      cards.forEach(card => {
        card.classList.remove('is-active', 'highlight-pulse');
      });

      const targetCard = cards[index];
      this.activeFindingIndex = index;

      targetCard.classList.add('is-active', 'highlight-pulse');
      setTimeout(() => targetCard.classList.remove('highlight-pulse'), 400);

      // Scroll card into view smoothly
      if (typeof targetCard.scrollIntoView === 'function') {
        targetCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }

      // Extract finding ID
      const findingId = targetCard.dataset.findingId || targetCard.getAttribute('data-finding-id');

      // SPECIFIC VERIFICATION REQUIREMENT: Automatically scroll canvas to highlighted evidence
      if (findingId) {
        this.syncFindingToEvidenceCanvas(findingId, targetCard);
      }

      this.showToast(`[Finding ${index + 1}/${cards.length}] ${findingId || 'Selected'}`);
      this.dispatchEvent('app:finding-focused', { index, findingId, targetCard });

      return targetCard;
    }

    /**
     * Automatically scroll canvas to grounded evidence bounding box
     */
    syncFindingToEvidenceCanvas(findingId, cardEl) {
      // 1. Try global evidence viewer component
      if (typeof window !== 'undefined' && window.evidenceViewerComponent &&
          typeof window.evidenceViewerComponent.selectFinding === 'function') {
        window.evidenceViewerComponent.selectFinding(findingId);
        return;
      }

      // 2. Fallback: simulate click on the finding card if it has an onclick handler
      if (cardEl && typeof cardEl.click === 'function') {
        const header = cardEl.querySelector('.finding-header') || cardEl;
        if (header && typeof header.click === 'function' && header !== cardEl) {
          header.click();
        }
      }
    }

    /**
     * Handle Enter key to inspect / expand active finding
     */
    handleEnter() {
      const cards = this.getFindingCards();
      if (this.activeFindingIndex >= 0 && this.activeFindingIndex < cards.length) {
        const activeCard = cards[this.activeFindingIndex];
        const expandBtn = activeCard.querySelector('.btn-expand-finding, .finding-header, button');
        if (expandBtn && typeof expandBtn.click === 'function') {
          expandBtn.click();
        }
      }
    }

    /**
     * Programmatic route navigation (Keys 1 - 5)
     */
    navigateToRoute(route) {
      if (typeof window !== 'undefined' && window.router && typeof window.router.navigate === 'function') {
        window.router.navigate(route);
        this.showToast(`Navigated to ${route}`);
        this.dispatchEvent('app:shortcut-action', { action: 'navigate', route });
        return true;
      }
      return false;
    }

    /**
     * Trigger Officer Action on Active Finding (A, D, R, E)
     */
    triggerAction(actionName) {
      const cards = this.getFindingCards();
      if (cards.length === 0) {
        this.showToast('No active finding to action');
        return false;
      }

      let activeCard = null;
      if (this.activeFindingIndex >= 0 && this.activeFindingIndex < cards.length) {
        activeCard = cards[this.activeFindingIndex];
      } else {
        // Auto-select first finding if none selected
        activeCard = this.activateFindingAtIndex(0, cards);
      }

      if (!activeCard) return false;

      const findingId = activeCard.dataset.findingId || activeCard.getAttribute('data-finding-id');

      // Forward to FindingCardComponent if available
      if (typeof window !== 'undefined' && window.findingCardComponent) {
        const appId = (window.appState && typeof window.appState.getSelectedAppId === 'function')
          ? window.appState.getSelectedAppId()
          : (activeCard.dataset.appId || 'current');

        switch (actionName) {
          case 'acknowledge':
            if (typeof window.findingCardComponent.executeAction === 'function') {
              window.findingCardComponent.executeAction(appId, findingId, 'acknowledge');
              this.showToast(`[A] Acknowledged Finding: ${findingId}`);
              return true;
            }
            if (typeof window.findingCardComponent.handleAcknowledge === 'function') {
              window.findingCardComponent.handleAcknowledge(findingId);
              this.showToast(`[A] Acknowledged Finding: ${findingId}`);
              return true;
            }
            break;

          case 'dismiss':
            if (typeof window.findingCardComponent.openReasonModal === 'function') {
              window.findingCardComponent.openReasonModal(findingId, 'dismiss');
              return true;
            }
            break;

          case 'request_rectification':
            if (typeof window.findingCardComponent.openReasonModal === 'function') {
              window.findingCardComponent.openReasonModal(findingId, 'request_rectification');
              return true;
            }
            break;

          case 'escalate':
            if (typeof window.findingCardComponent.openReasonModal === 'function') {
              window.findingCardComponent.openReasonModal(findingId, 'escalate');
              return true;
            }
            break;
        }
      }

      // Fallback: Click corresponding action button inside activeCard
      const actionSelectors = {
        'acknowledge': '.btn-action-ack, button[data-action="acknowledge"]',
        'dismiss': '.btn-action-dismiss, button[data-action="dismiss"]',
        'request_rectification': '.btn-action-rectify, button[data-action="rectify"]',
        'escalate': '.btn-action-escalate, button[data-action="escalate"]'
      };

      const selector = actionSelectors[actionName];
      if (selector) {
        const btn = activeCard.querySelector(selector);
        if (btn && typeof btn.click === 'function') {
          btn.click();
          this.showToast(`Triggered [${actionName.toUpperCase()}] on ${findingId || 'active finding'}`);
          return true;
        }
      }

      this.dispatchEvent('app:finding-action-shortcut', { action: actionName, findingId });
      return true;
    }

    /**
     * Trigger Live Audit Hash Chain Verification (V)
     */
    triggerAuditVerification() {
      // 1. If auditViewComponent is active, call triggerVerifyChain
      if (typeof window !== 'undefined' &&
          window.auditViewComponent &&
          typeof window.auditViewComponent.triggerVerifyChain === 'function') {
        window.auditViewComponent.triggerVerifyChain();
        this.showToast('[V] Triggered Audit Hash Chain Integrity Verification');
        this.dispatchEvent('app:shortcut-action', { action: 'verify_audit_chain' });
        return true;
      }

      // 2. Click verify button in DOM if present
      if (typeof document !== 'undefined') {
        const btnVerify = document.getElementById('btn-verify-audit-chain') ||
                          document.getElementById('btn-verify-chain') ||
                          document.querySelector('.btn-verify-chain');
        if (btnVerify && typeof btnVerify.click === 'function') {
          btnVerify.click();
          this.showToast('[V] Triggered Audit Hash Chain Integrity Verification');
          this.dispatchEvent('app:shortcut-action', { action: 'verify_audit_chain' });
          return true;
        }
      }

      // 3. Fallback: navigate to #audit and trigger
      if (typeof window !== 'undefined' && window.router && typeof window.router.navigate === 'function') {
        window.router.navigate('#audit');
        setTimeout(() => {
          if (window.auditViewComponent && typeof window.auditViewComponent.triggerVerifyChain === 'function') {
            window.auditViewComponent.triggerVerifyChain();
          }
        }, 150);
        this.showToast('[V] Navigated to Audit Console and Triggered Chain Verification');
        this.dispatchEvent('app:shortcut-action', { action: 'verify_audit_chain' });
        return true;
      }

      return false;
    }

    /**
     * Focus search input (/)
     */
    focusSearchInput() {
      if (typeof document === 'undefined') return false;

      // Locate active view's search input in priority order
      const selectors = [
        '#queue-search-input',
        '#rules-search-input',
        '#realness-search-input',
        '#audit-search-input',
        'input[type="text"][placeholder*="Search"]',
        'input[type="search"]'
      ];

      for (const sel of selectors) {
        const input = document.querySelector(sel);
        if (input && input.offsetParent !== null) { // visible
          input.focus();
          if (typeof input.select === 'function') input.select();
          this.showToast('[/] Search Input Focused');
          this.dispatchEvent('app:shortcut-action', { action: 'focus_search', selector: sel });
          return true;
        }
      }

      // Fallback: try first input
      const firstInput = document.querySelector(selectors.join(','));
      if (firstInput) {
        firstInput.focus();
        this.showToast('[/] Search Input Focused');
        this.dispatchEvent('app:shortcut-action', { action: 'focus_search' });
        return true;
      }

      return false;
    }

    /**
     * Escape handler
     */
    handleEscape() {
      // 1. Close shortcuts cheat sheet if open
      if (this.isCheatSheetOpen) {
        this.closeCheatSheet();
        return;
      }

      // 2. Close action modal if open
      if (typeof document !== 'undefined') {
        const actionModal = document.getElementById('finding-action-modal');
        if (actionModal && actionModal.parentNode) {
          actionModal.parentNode.removeChild(actionModal);
          return;
        }

        const dismissBtn = document.getElementById('btn-modal-close') ||
                           document.getElementById('btn-modal-cancel');
        if (dismissBtn && typeof dismissBtn.click === 'function') {
          dismissBtn.click();
          return;
        }

        // Close generic modal
        const genericModal = document.getElementById('modal-container');
        if (genericModal && !genericModal.classList.contains('hidden')) {
          genericModal.classList.add('hidden');
          return;
        }

        // Deselect finding
        const cards = this.getFindingCards();
        cards.forEach(c => c.classList.remove('is-active', 'highlight-pulse'));
        this.activeFindingIndex = -1;
      }
    }

    /**
     * Toggle Keyboard Shortcuts Cheat Sheet Modal (?)
     */
    toggleCheatSheet() {
      if (this.isCheatSheetOpen) {
        this.closeCheatSheet();
      } else {
        this.openCheatSheet();
      }
    }

    /**
     * Open Keyboard Shortcuts Cheat Sheet Modal (Step 57)
     */
    openCheatSheet() {
      if (typeof document === 'undefined') return;

      const existing = document.getElementById('shortcuts-modal-host');
      if (existing && typeof existing.remove === 'function') {
        existing.remove();
      }

      const modalHost = document.createElement('div');
      modalHost.id = 'shortcuts-modal-host';
      modalHost.innerHTML = `
        <div class="shortcuts-modal-backdrop" id="shortcuts-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="shortcuts-modal-title">
          <div class="shortcuts-modal-container" id="shortcuts-modal-container">
            <div class="shortcuts-modal-header">
              <h3 id="shortcuts-modal-title">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2563eb" stroke-width="2">
                  <rect x="2" y="4" width="20" height="16" rx="2" ry="2"/>
                  <line x1="6" y1="8" x2="6" y2="8"/>
                  <line x1="10" y1="8" x2="10" y2="8"/>
                  <line x1="14" y1="8" x2="14" y2="8"/>
                  <line x1="18" y1="8" x2="18" y2="8"/>
                  <line x1="6" y1="12" x2="6" y2="12"/>
                  <line x1="18" y1="12" x2="18" y2="12"/>
                  <line x1="8" y1="16" x2="16" y2="16"/>
                </svg>
                Officer Triage Keyboard Shortcuts Cheat Sheet (Guide §17.3)
              </h3>
              <div class="shortcuts-modal-header-actions">
                <button id="btn-close-shortcuts-modal" class="btn btn-secondary btn-sm" aria-label="Close shortcuts modal" style="padding:0.25rem 0.55rem; font-weight:700;">✕</button>
              </div>
            </div>

            <div class="shortcuts-filter-bar">
              <input type="text" id="input-shortcuts-filter" class="shortcuts-filter-input" placeholder="Filter shortcuts by action, key, or category..." autocomplete="off">
            </div>

            <div class="shortcuts-modal-body" id="shortcuts-modal-body">
              <!-- Section 1: Discrepancy Triage & Grounding -->
              <div class="shortcuts-section" data-section="triage">
                <div class="shortcuts-section-header">
                  <span class="shortcuts-section-title">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                    Discrepancy Triage & Grounding
                  </span>
                  <span class="shortcuts-section-badge">Guide §17.3</span>
                </div>
                <div class="shortcuts-grid">
                  <div class="shortcut-item" data-keywords="j next focus advance finding ground evidence bbox">
                    <div class="shortcut-meta">
                      <span class="shortcut-title">Focus Next Finding & Ground Evidence</span>
                      <span class="shortcut-desc">Advance active finding card and auto-scroll canvas to coordinate bounding box</span>
                    </div>
                    <div class="shortcut-keys"><kbd class="kbd kbd-pill">J</kbd></div>
                  </div>
                  <div class="shortcut-item" data-keywords="k previous focus retreat finding ground evidence bbox">
                    <div class="shortcut-meta">
                      <span class="shortcut-title">Focus Previous Finding & Ground Evidence</span>
                      <span class="shortcut-desc">Retreat to previous finding card and auto-scroll canvas to coordinate bounding box</span>
                    </div>
                    <div class="shortcut-keys"><kbd class="kbd kbd-pill">K</kbd></div>
                  </div>
                  <div class="shortcut-item" data-keywords="enter open inspect expand details">
                    <div class="shortcut-meta">
                      <span class="shortcut-title">Inspect Active Finding</span>
                      <span class="shortcut-desc">Open detailed comparison inspector and review documentary extraction</span>
                    </div>
                    <div class="shortcut-keys"><kbd class="kbd kbd-pill">Enter</kbd></div>
                  </div>
                  <div class="shortcut-item" data-keywords="escape esc clear deselect close dismiss blur">
                    <div class="shortcut-meta">
                      <span class="shortcut-title">Clear Focus / Dismiss Modal / Blur</span>
                      <span class="shortcut-desc">Deselect current card, close open modal dialogs, or unfocus active text inputs</span>
                    </div>
                    <div class="shortcut-keys"><kbd class="kbd kbd-pill">Esc</kbd></div>
                  </div>
                </div>
              </div>

              <!-- Section 2: Officer Finding Review Actions -->
              <div class="shortcuts-section" data-section="actions">
                <div class="shortcuts-section-header">
                  <span class="shortcuts-section-title">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
                    Officer Review Actions
                  </span>
                  <span class="shortcuts-section-badge">Guide §17.4</span>
                </div>
                <div class="shortcuts-grid">
                  <div class="shortcut-item" data-keywords="a acknowledge mark review">
                    <div class="shortcut-meta">
                      <span class="shortcut-title">Acknowledge Finding</span>
                      <span class="shortcut-desc">Record officer review confirmation and mark finding acknowledged</span>
                    </div>
                    <div class="shortcut-keys"><kbd class="kbd kbd-pill">A</kbd></div>
                  </div>
                  <div class="shortcut-item" data-keywords="d dismiss override reject finding reason modal justification">
                    <div class="shortcut-meta">
                      <span class="shortcut-title">Dismiss Finding</span>
                      <span class="shortcut-desc">Open mandatory human justification modal to record officer override</span>
                    </div>
                    <div class="shortcut-keys"><kbd class="kbd kbd-pill">D</kbd></div>
                  </div>
                  <div class="shortcut-item" data-keywords="r request rectification notice institutional deficiency re-upload">
                    <div class="shortcut-meta">
                      <span class="shortcut-title">Request Rectification</span>
                      <span class="shortcut-desc">Open rectification dialog to generate itemized deficiency notice for applicant</span>
                    </div>
                    <div class="shortcut-keys"><kbd class="kbd kbd-pill">R</kbd></div>
                  </div>
                  <div class="shortcut-item" data-keywords="e escalate senior officer committee review hearing">
                    <div class="shortcut-meta">
                      <span class="shortcut-title">Escalate Discrepancy</span>
                      <span class="shortcut-desc">Refer critical finding to Senior Officer and Standing Appellate Committee</span>
                    </div>
                    <div class="shortcut-keys"><kbd class="kbd kbd-pill">E</kbd></div>
                  </div>
                </div>
              </div>

              <!-- Section 3: Verification & Global Search -->
              <div class="shortcuts-section" data-section="system">
                <div class="shortcuts-section-header">
                  <span class="shortcuts-section-title">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                    System Security & Global Tools
                  </span>
                  <span class="shortcuts-section-badge">Cryptographic Integrity</span>
                </div>
                <div class="shortcuts-grid">
                  <div class="shortcut-item" data-keywords="v verify audit hash chain integrity sha256 genesis head">
                    <div class="shortcut-meta">
                      <span class="shortcut-title">Verify Audit Hash Chain</span>
                      <span class="shortcut-desc">Execute live Genesis-to-Head SHA-256 cryptographic chain integrity verification</span>
                    </div>
                    <div class="shortcut-keys"><kbd class="kbd kbd-pill">V</kbd></div>
                  </div>
                  <div class="shortcut-item" data-keywords="/ search filter quick find focus input">
                    <div class="shortcut-meta">
                      <span class="shortcut-title">Focus Search Input</span>
                      <span class="shortcut-desc">Quickly jump focus to active view's search filter bar</span>
                    </div>
                    <div class="shortcut-keys"><kbd class="kbd kbd-pill">/</kbd></div>
                  </div>
                  <div class="shortcut-item" data-keywords="? help cheat sheet modal shortcuts keycaps">
                    <div class="shortcut-meta">
                      <span class="shortcut-title">Toggle Shortcuts Cheat Sheet</span>
                      <span class="shortcut-desc">Display or dismiss this interactive keyboard shortcuts reference modal</span>
                    </div>
                    <div class="shortcut-keys"><kbd class="kbd kbd-pill">?</kbd></div>
                  </div>
                </div>
              </div>

              <!-- Section 4: Rapid Viewport Navigation -->
              <div class="shortcuts-section" data-section="navigation">
                <div class="shortcuts-section-header">
                  <span class="shortcuts-section-title">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
                    Rapid View Navigation
                  </span>
                  <span class="shortcuts-section-badge">5 Core Viewports</span>
                </div>
                <div class="shortcuts-grid">
                  <div class="shortcut-item" data-keywords="1 queue applications triage priority">
                    <div class="shortcut-meta">
                      <span class="shortcut-title">Applications Queue</span>
                      <span class="shortcut-desc">Switch to institution application triage dashboard (#queue)</span>
                    </div>
                    <div class="shortcut-keys"><kbd class="kbd kbd-pill">1</kbd></div>
                  </div>
                  <div class="shortcut-item" data-keywords="2 workspace evidence findings canvas checklist">
                    <div class="shortcut-meta">
                      <span class="shortcut-title">Evidence Workspace</span>
                      <span class="shortcut-desc">Switch to active application inspection workspace (#workspace)</span>
                    </div>
                    <div class="shortcut-keys"><kbd class="kbd kbd-pill">2</kbd></div>
                  </div>
                  <div class="shortcut-item" data-keywords="3 rules explorer yaml regulatory clauses">
                    <div class="shortcut-meta">
                      <span class="shortcut-title">Rules Explorer</span>
                      <span class="shortcut-desc">Switch to versioned YAML rules and norm comparison view (#rules)</span>
                    </div>
                    <div class="shortcut-keys"><kbd class="kbd kbd-pill">3</kbd></div>
                  </div>
                  <div class="shortcut-item" data-keywords="4 audit console hash chain tamper demo">
                    <div class="shortcut-meta">
                      <span class="shortcut-title">Audit Console</span>
                      <span class="shortcut-desc">Switch to cryptographic hash chain ledger and tamper demonstration (#audit)</span>
                    </div>
                    <div class="shortcut-keys"><kbd class="kbd kbd-pill">4</kbd></div>
                  </div>
                  <div class="shortcut-item" data-keywords="5 realness transparency matrix air-gap sovereign">
                    <div class="shortcut-meta">
                      <span class="shortcut-title">System Realness Matrix</span>
                      <span class="shortcut-desc">Switch to honest disclosure and air-gapped sovereignty matrix (#realness)</span>
                    </div>
                    <div class="shortcut-keys"><kbd class="kbd kbd-pill">5</kbd></div>
                  </div>
                </div>
              </div>
            </div>

            <div class="shortcuts-modal-footer">
              <span class="shortcuts-footer-hint">
                <kbd class="kbd kbd-pill" style="min-width:1.2rem; height:1.2rem; font-size:0.65rem;">Esc</kbd>
                Press Escape or click anywhere outside to close
              </span>
              <button id="btn-dismiss-shortcuts-modal" class="btn btn-primary btn-sm">Close Cheat Sheet</button>
            </div>
          </div>
        </div>
      `;

      if (typeof document.body.appendChild === 'function') {
        document.body.appendChild(modalHost);
      }
      this.isCheatSheetOpen = true;

      // Filter input handler
      const filterInput = modalHost.querySelector('#input-shortcuts-filter');
      if (filterInput) {
        filterInput.addEventListener('input', (e) => {
          const query = (e.target.value || '').trim().toLowerCase();
          const items = modalHost.querySelectorAll('.shortcut-item');
          items.forEach(item => {
            const keywords = item.getAttribute('data-keywords') || '';
            const text = item.textContent.toLowerCase();
            if (!query || keywords.includes(query) || text.includes(query)) {
              item.classList.remove('is-hidden');
            } else {
              item.classList.add('is-hidden');
            }
          });
        });
      }

      // Close handlers
      const close = () => this.closeCheatSheet();
      const btnClose = modalHost.querySelector('#btn-close-shortcuts-modal');
      const btnDismiss = modalHost.querySelector('#btn-dismiss-shortcuts-modal');
      const backdrop = modalHost.querySelector('#shortcuts-modal-backdrop');

      if (btnClose) btnClose.addEventListener('click', close);
      if (btnDismiss) btnDismiss.addEventListener('click', close);
      if (backdrop) {
        backdrop.addEventListener('click', (e) => {
          if (e.target === backdrop) close();
        });
      }

      this.dispatchEvent('app:modal-opened', { modal: 'shortcuts-cheat-sheet' });
    }

    /**
     * Close Cheat Sheet Modal
     */
    closeCheatSheet() {
      if (typeof document === 'undefined') return;
      const host = document.getElementById('shortcuts-modal-host');
      if (host && typeof host.remove === 'function') {
        host.remove();
      }
      this.isCheatSheetOpen = false;
      this.dispatchEvent('app:modal-closed', { modal: 'shortcuts-cheat-sheet' });
    }

    /**
     * Show fleeting floating feedback toast on shortcut trigger
     */
    showToast(message) {
      if (typeof document === 'undefined' || !document.body || typeof document.body.appendChild !== 'function') return;

      let toast = document.getElementById('shortcut-feedback-toast');
      if (!toast) {
        toast = document.createElement('div');
        toast.id = 'shortcut-feedback-toast';
        toast.className = 'shortcut-feedback-toast';
        document.body.appendChild(toast);
      }

      toast.textContent = message;
      if (toast.style) toast.style.display = 'flex';

      if (this.toastTimeout) clearTimeout(this.toastTimeout);
      this.toastTimeout = setTimeout(() => {
        if (toast && toast.parentNode) {
          if (toast.style) toast.style.display = 'none';
        }
      }, 1800);
    }

    /**
     * Dispatch custom DOM events for component synchronization
     */
    dispatchEvent(name, detail = {}) {
      if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
        const evt = (typeof CustomEvent !== 'undefined') ?
          new CustomEvent(name, { detail }) : { type: name, detail };
        window.dispatchEvent(evt);
      }
    }
  }

  return KeyboardShortcutsEngine;
}));
