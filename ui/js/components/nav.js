/**
 * AICTE Application Validation Platform — Top Navigation Bar & Role Switcher Component
 * Spec Reference: ROADMAP.md (Step 06), SIH26261_MASTER.md (§1, §2)
 *
 * Responsibilities:
 * 1. Synchronize top navigation bar tabs with Router and URL hash state.
 * 2. Multi-Persona Role Switcher ('officer', 'senior_officer', 'institution', 'auditor').
 * 3. Dynamic role badge indicator and role-based body attribute (`data-current-role`).
 * 4. Sovereign Air-Gapped topology indicator modal/toast.
 * 5. Reusable Modal helper (openModal / closeModal) and Keyboard Shortcuts cheat sheet.
 */

const ROLE_METADATA = {
  officer: {
    id: 'officer',
    title: 'Scrutiny Officer',
    badgeClass: 'badge-pass',
    tagColor: '#059669',
    description: 'Primary scrutiny, document extraction review, and finding lifecycle management.',
    permissions: ['review_findings', 'acknowledge_finding', 'request_rectification', 'inspect_vault']
  },
  senior_officer: {
    id: 'senior_officer',
    title: 'Senior Officer',
    badgeClass: 'badge-accent',
    tagColor: '#0066cc',
    description: 'Escalation resolution, ground inspection assignment, and deficiency notice export.',
    permissions: ['review_findings', 'acknowledge_finding', 'request_rectification', 'dismiss_finding', 'export_notices', 'override_rule']
  },
  institution: {
    id: 'institution',
    title: 'Applicant Institution',
    badgeClass: 'badge-simulated',
    tagColor: '#d97706',
    description: 'Applicant portal view. Inspect deficiency notices, submit rectification documents, and verify checklist transparency.',
    permissions: ['view_notices', 'upload_rectification', 'view_checklists']
  },
  auditor: {
    id: 'auditor',
    title: 'Independent Auditor',
    badgeClass: 'badge-warning',
    tagColor: '#7c3aed',
    description: 'Cryptographic hash chain verification, tamper demonstration, and non-repudiation audit.',
    permissions: ['verify_hash_chains', 'view_audit_trail', 'run_tamper_demo', 'export_audit_log']
  }
};

class NavigationComponent {
  constructor() {
    this.roleMeta = ROLE_METADATA;
    this.isInitialized = false;

    // DOM references cached on init
    this.roleSwitcherEl = null;
    this.roleBadgeEl = null;
    this.shortcutsBtn = null;
    this.offlineBadgeEl = null;
    this.modalContainer = null;
    this.modalTitle = null;
    this.modalBody = null;
    this.modalFooter = null;
    this.modalCloseBtn = null;
    this.navTabButtons = [];

    if (typeof window !== 'undefined' && typeof document !== 'undefined') {
      if (document.readyState === 'loading' && typeof document.addEventListener === 'function') {
        document.addEventListener('DOMContentLoaded', () => this.init());
      } else {
        this.init();
      }
    }
  }

  /**
   * Initialize DOM elements and event bindings
   */
  init() {
    if (this.isInitialized) return;

    this.roleSwitcherEl = document.getElementById('role-switcher');
    this.roleBadgeEl = document.getElementById('role-badge');
    this.shortcutsBtn = document.getElementById('btn-shortcuts-help');
    this.offlineBadgeEl = document.querySelector('.badge-offline');
    this.modalContainer = document.getElementById('modal-container');
    this.modalTitle = document.getElementById('modal-title');
    this.modalBody = document.getElementById('modal-body');
    this.modalFooter = document.getElementById('modal-footer');
    this.modalCloseBtn = document.getElementById('modal-close-btn');
    this.navTabButtons = Array.from(document.querySelectorAll('.nav-tab-btn'));

    this.bindRoleSwitcher();
    this.bindNavigationTabs();
    this.bindShortcutsModal();
    this.bindOfflineBadge();
    this.bindKeyboardShortcuts();
    this.bindModalBackdrop();

    // Sync with initial global state if available
    if (typeof window !== 'undefined' && window.appState) {
      const initialRole = window.appState.getState('currentRole') || 'officer';
      this.applyRole(initialRole, false);

      // Subscribe to subsequent role changes in global state
      window.appState.subscribe('currentRole', (newRole) => {
        this.applyRole(newRole, true);
      });
    }

    // Subscribe to router change events to keep tabs synced
    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      window.addEventListener('app:route-change', (e) => {
        if (e.detail && e.detail.viewId) {
          this.setActiveTabByViewId(e.detail.viewId);
        }
      });
    }

    this.isInitialized = true;
  }

  /**
   * Bind Role Switcher dropdown events
   */
  bindRoleSwitcher() {
    if (!this.roleSwitcherEl) return;

    this.roleSwitcherEl.addEventListener('change', (e) => {
      const selectedRole = e.target.value;
      if (window.appState) {
        window.appState.setRole(selectedRole);
      } else {
        this.applyRole(selectedRole, true);
      }
    });
  }

  /**
   * Apply role changes across DOM and emit events
   */
  applyRole(role, notifyToast = true) {
    const meta = this.roleMeta[role] || this.roleMeta.officer;

    // 1. Sync dropdown selection
    if (this.roleSwitcherEl && this.roleSwitcherEl.value !== role) {
      this.roleSwitcherEl.value = role;
    }

    // 2. Update role badge display
    if (this.roleBadgeEl) {
      this.roleBadgeEl.textContent = meta.title;
      this.roleBadgeEl.className = `badge ${meta.badgeClass} text-xs`;
      this.roleBadgeEl.title = meta.description;
    }

    // 3. Set data-current-role on body for role-gated CSS styling
    if (document.body) {
      document.body.setAttribute('data-current-role', role);
    }

    // 4. Show user feedback toast if user triggered change
    if (notifyToast && window.appState && typeof window.appState.showToast === 'function') {
      window.appState.showToast(`Switched persona to: ${meta.title}`, 'info');
    }

    // 5. Dispatch native DOM event
    if (typeof window !== 'undefined' && typeof CustomEvent !== 'undefined' && typeof window.dispatchEvent === 'function') {
      window.dispatchEvent(new CustomEvent('app:role-change', {
        detail: {
          role,
          metadata: meta
        }
      }));
    }
  }

  /**
   * Bind navigation tab buttons
   */
  bindNavigationTabs() {
    this.navTabButtons.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const route = btn.dataset.route;
        if (route) {
          if (window.router && typeof window.router.navigate === 'function') {
            window.router.navigate(route);
          } else {
            window.location.hash = route;
          }
        }
      });
    });
  }

  /**
   * Sync active class on navigation tab buttons by view ID
   */
  setActiveTabByViewId(viewId) {
    this.navTabButtons.forEach(btn => {
      const isActive = btn.dataset.target === viewId;
      btn.classList.toggle('active', isActive);
      if (isActive) {
        btn.setAttribute('aria-current', 'page');
      } else {
        btn.removeAttribute('aria-current');
      }
    });
  }

  /**
   * Bind offline / air-gapped badge click for educational verification
   */
  bindOfflineBadge() {
    if (!this.offlineBadgeEl) return;

    this.offlineBadgeEl.style.cursor = 'pointer';
    this.offlineBadgeEl.addEventListener('click', () => {
      this.openModal(
        'Sovereign Execution Boundary',
        `
        <div style="display: flex; gap: var(--space-4); align-items: flex-start; margin-bottom: var(--space-4);">
          <div style="background: rgba(16, 185, 129, 0.1); color: var(--status-pass); padding: var(--space-3); border-radius: var(--radius-md);">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            </svg>
          </div>
          <div>
            <h4 style="margin: 0 0 var(--space-1) 0;">Air-Gapped & Offline Sovereign Mode</h4>
            <p class="text-sm text-muted" style="margin: 0;">Verified cryptographic privacy compliance for SIH PS 26261.</p>
          </div>
        </div>
        <p class="text-sm" style="margin-bottom: var(--space-3);">
          <strong>Non-Negotiable Project Policy:</strong> No document, metadata, or extracted evidence is transmitted to external cloud APIs, LLM providers, or unauthorized endpoints.
        </p>
        <ul class="text-sm" style="padding-left: var(--space-4); margin-bottom: var(--space-4); line-height: 1.6;">
          <li>All OCR and table extraction pipelines execute within local sovereign containers.</li>
          <li>All rule evaluation engines operate deterministically against versioned Handbook clauses.</li>
          <li>Every state modification is cryptographically hashed with sequential BLAKE3 / SHA-256 tamper chains.</li>
          <li>External issuer calls are sandboxed simulations clearly tagged with <code>SIMULATED</code> badges.</li>
        </ul>
        <div class="card" style="padding: var(--space-3); background: var(--bg-surface-subtle); border-left: 4px solid var(--color-primary);">
          <span class="text-xs font-mono text-muted">Network Gate: 127.0.0.1 (Loopback only) · External Egress: BLOCKED</span>
        </div>
        `,
        `
        <button class="btn btn-primary btn-sm" onclick="window.navbarComponent.closeModal()">Acknowledge</button>
        `
      );
    });
  }

  /**
   * Bind Keyboard Shortcuts Help button
   */
  bindShortcutsModal() {
    if (!this.shortcutsBtn) return;

    this.shortcutsBtn.addEventListener('click', () => {
      this.openShortcutsModal();
    });
  }

  /**
   * Render and open the keyboard shortcuts dialog
   */
  openShortcutsModal() {
    const shortcuts = [
      { key: '1', desc: 'Navigate to Queue Dashboard (#queue)' },
      { key: '2', desc: 'Navigate to Application Workspace (#workspace)' },
      { key: '3', desc: 'Navigate to Rules Explorer (#rules)' },
      { key: '4', desc: 'Navigate to Audit & Tamper Console (#audit)' },
      { key: '5', desc: 'Navigate to Realness Matrix (#about/realness)' },
      { key: 'U', desc: 'Open Upload Modal' },
      { key: '?', desc: 'Toggle this Keyboard Shortcuts Cheat Sheet' },
      { key: 'Esc', desc: 'Close Active Modal Window' }
    ];

    const bodyHtml = `
      <p class="text-sm text-muted" style="margin-bottom: var(--space-4);">
        Quick keyboard navigation shortcuts for high-throughput scrutiny officer review.
      </p>
      <div style="display: flex; flex-direction: column; gap: var(--space-2);">
        ${shortcuts.map(s => `
          <div class="flex items-center justify-between" style="padding: var(--space-2) var(--space-3); background: var(--bg-surface-subtle); border-radius: var(--radius-sm); border: 1px solid var(--border-subtle);">
            <span class="text-sm">${s.desc}</span>
            <kbd class="kbd">${s.key}</kbd>
          </div>
        `).join('')}
      </div>
    `;

    this.openModal(
      'Keyboard Shortcuts',
      bodyHtml,
      '<button class="btn btn-outline btn-sm" onclick="window.navbarComponent.closeModal()">Close</button>'
    );
  }

  /**
   * Bind global keydown listeners
   */
  bindKeyboardShortcuts() {
    if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') return;

    window.addEventListener('keydown', (e) => {
      // Ignore when user is actively typing in form inputs
      const activeTag = document.activeElement ? document.activeElement.tagName.toUpperCase() : '';
      if (activeTag === 'INPUT' || activeTag === 'TEXTAREA' || activeTag === 'SELECT') {
        if (e.key === 'Escape') {
          this.closeModal();
        }
        return;
      }

      if (e.key === 'Escape') {
        this.closeModal();
        return;
      }

      if (e.key === '?' || (e.key === '/' && e.shiftKey)) {
        e.preventDefault();
        this.openShortcutsModal();
        return;
      }

      // View switcher hotkeys
      if (e.key === '1') {
        e.preventDefault();
        if (window.router) window.router.navigate('#queue');
      } else if (e.key === '2') {
        e.preventDefault();
        if (window.router) window.router.navigate('#workspace');
      } else if (e.key === '3') {
        e.preventDefault();
        if (window.router) window.router.navigate('#rules');
      } else if (e.key === '4') {
        e.preventDefault();
        if (window.router) window.router.navigate('#audit');
      } else if (e.key === '5') {
        e.preventDefault();
        if (window.router) window.router.navigate('#about/realness');
      } else if (e.key === 'u' || e.key === 'U') {
        const uploadBtn = document.getElementById('btn-open-upload-modal');
        if (uploadBtn) {
          e.preventDefault();
          uploadBtn.click();
        }
      }
    });
  }

  /**
   * Bind backdrop and close button for modal
   */
  bindModalBackdrop() {
    if (this.modalCloseBtn) {
      this.modalCloseBtn.addEventListener('click', () => this.closeModal());
    }

    if (this.modalContainer) {
      this.modalContainer.addEventListener('click', (e) => {
        // Close if clicked directly on backdrop overlay
        if (e.target === this.modalContainer) {
          this.closeModal();
        }
      });
    }
  }

  /**
   * Open modal helper
   */
  openModal(title, bodyHtml, footerHtml = '') {
    if (!this.modalContainer) return;

    if (this.modalTitle) this.modalTitle.textContent = title;
    if (this.modalBody) this.modalBody.innerHTML = bodyHtml;
    if (this.modalFooter) {
      this.modalFooter.innerHTML = footerHtml;
      this.modalFooter.style.display = footerHtml ? 'flex' : 'none';
    }

    this.modalContainer.classList.remove('hidden');
    document.body.style.overflow = 'hidden'; // Prevent background scrolling
  }

  /**
   * Close modal helper
   */
  closeModal() {
    if (!this.modalContainer) return;

    this.modalContainer.classList.add('hidden');
    document.body.style.overflow = '';
  }
}

// Instantiate and export singleton
const navbarComponent = new NavigationComponent();
if (typeof window !== 'undefined') {
  window.navbarComponent = navbarComponent;
  window.NavigationComponent = NavigationComponent;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { NavigationComponent, ROLE_METADATA };
}
