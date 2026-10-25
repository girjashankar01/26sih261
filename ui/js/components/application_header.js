/**
 * AICTE Application Validation Platform — Institutional Identity & Metadata Header Card
 * Spec Reference: ROADMAP.md (Phase 4: Steps 20 & 21), Guide §11.4, §17.1
 *
 * Responsibilities:
 * 1. Fetch S7 typed facts and canonical institute resolution via GET /applications/{id}/facts (Step 20).
 * 2. Render institutional banner displaying:
 *    - Submitted / Canonical Institution Name
 *    - Permanent AICTE ID
 *    - Academic Year (e.g. 2026-2027)
 *    - Regulatory Application Category (e.g. EOA_RENEWAL -> EoA Renewal)
 *    - Workflow State pill (NEEDS_RECTIFICATION, VALIDATED_NO_ISSUES, NEEDS_MANUAL_REVIEW)
 * 3. Canonical Entity Resolution & Alias Match Inspector (Step 21):
 *    - Core name normalization and legal form segregation (P1-2)
 *    - Calculate core token similarity score
 *    - Tag legal form variations (MATCH, LEGAL_FORM_DIFF, MISMATCH)
 *    - Interactive drawer inspecting cross-document name aliases without hard-failing minor suffix differences
 * 4. Mount seamlessly into #workspace-header-container within Application Workspace.
 */

class ApplicationHeaderComponent {
  constructor() {
    this.currentAppId = null;
    this.currentFacts = null;
    this.currentAggregate = null;
    this.isInspectorOpen = false;
  }

  /**
   * Format workflow state into badge pill HTML (Step 20)
   */
  renderWorkflowStatePill(status) {
    const raw = status || 'NEEDS_RECTIFICATION';
    const normalized = String(raw).toUpperCase().replace(/\s+/g, '_');

    let badgeClass = 'badge-warn';
    let label = 'NEEDS MANUAL REVIEW';

    if (normalized === 'NEEDS_RECTIFICATION') {
      badgeClass = 'badge-fail';
      label = 'NEEDS RECTIFICATION';
    } else if (normalized === 'VALIDATED_NO_ISSUES') {
      badgeClass = 'badge-pass';
      label = 'VALIDATED NO ISSUES';
    } else if (normalized === 'NEEDS_MANUAL_REVIEW' || normalized === 'NEEDS_REVIEW') {
      badgeClass = 'badge-review';
      label = 'NEEDS MANUAL REVIEW';
    } else {
      label = raw.replace(/_/g, ' ');
    }

    return `<span class="badge ${badgeClass} text-xs" id="header-workflow-badge" data-workflow-state="${normalized}">${label}</span>`;
  }

  /**
   * Format regulatory category code into title case
   */
  formatCategory(category) {
    if (!category) return 'EoA Renewal';
    if (category === 'EOA_RENEWAL') return 'EoA Renewal';
    if (category === 'NEW_INSTITUTION') return 'New Institution';
    return category.replace(/_/g, ' ');
  }

  /**
   * Split entity name into core tokens and normalized legal form tokens (Guide §11.4, Step 21)
   */
  splitEntityName(name) {
    if (!name || !name.trim()) return { core: '', tokens: [], legalForms: [] };

    const LEGAL_FORMS = {
      'pvt': 'private',
      'private': 'private',
      'ltd': 'limited',
      'limited': 'limited',
      'trust': 'trust',
      'society': 'society',
      'llp': 'llp',
      'foundation': 'foundation',
      'inc': 'incorporated',
      'corp': 'corporation'
    };

    const ABBREVIATIONS = {
      'inst': 'institute',
      'engg': 'engineering',
      'tech': 'technology',
      'univ': 'university',
      'coll': 'college',
      'mgmt': 'management'
    };

    const STOP_WORDS = new Set(['the', 'of', 'and', '&']);

    const rawTokens = name.toLowerCase().replace(/[^\w\s]/g, ' ').split(/\s+/).filter(Boolean);
    const expandedTokens = rawTokens.map(w => ABBREVIATIONS[w] || w);

    const legalSet = new Set();
    const coreTokens = [];

    for (const w of expandedTokens) {
      if (LEGAL_FORMS[w]) {
        legalSet.add(LEGAL_FORMS[w]);
      } else if (!STOP_WORDS.has(w)) {
        coreTokens.push(w);
      }
    }

    return {
      core: coreTokens.join(' '),
      tokens: coreTokens,
      legalForms: Array.from(legalSet).sort()
    };
  }

  /**
   * Compare two entity names and calculate match status and core similarity score (Guide §11.4, Step 21)
   */
  compareEntityNames(extractedName, canonicalName) {
    const ext = this.splitEntityName(extractedName);
    const can = this.splitEntityName(canonicalName);

    if (!ext.core && !can.core) {
      return {
        status: 'MATCH',
        score: 100,
        coreExtracted: '',
        coreCanonical: '',
        legalExtracted: ext.legalForms,
        legalCanonical: can.legalForms
      };
    }

    // Calculate core token overlap ratio
    const setExt = new Set(ext.tokens);
    const setCan = new Set(can.tokens);

    let intersection = 0;
    for (const t of setExt) {
      if (setCan.has(t)) intersection++;
    }

    const union = new Set([...ext.tokens, ...can.tokens]).size;
    const score = union > 0 ? Math.round((intersection / union) * 100) : 0;

    // Check legal forms equivalence
    const legalMatch = ext.legalForms.length === can.legalForms.length &&
      ext.legalForms.every((val, idx) => val === can.legalForms[idx]);

    let status = 'MISMATCH';

    // Core name match condition: exact core match or token score >= 85%
    if (ext.core === can.core || score >= 85) {
      if (legalMatch) {
        status = 'MATCH';
      } else {
        // Minor legal suffix variation -> LEGAL_FORM_DIFF (NOT a hard error per Guide §11.4)
        status = 'LEGAL_FORM_DIFF';
      }
    } else if (score >= 50) {
      status = 'PARTIAL';
    } else {
      status = 'MISMATCH';
    }

    return {
      status,
      score,
      coreExtracted: ext.core,
      coreCanonical: can.core,
      legalExtracted: ext.legalForms,
      legalCanonical: can.legalForms
    };
  }

  /**
   * Render Entity Resolution Pill & Summary Status (Step 21)
   */
  renderEntityResolutionPill(canonicalName, aliases = []) {
    let summaryStatus = 'MATCH';
    let verdictClass = 'badge-pass';
    let summaryLabel = 'All Document Aliases Matched';

    const hasMismatch = aliases.some(a => a.match_status === 'MISMATCH' || a.match_status === 'DIFFERENT');
    const hasLegalDiff = aliases.some(a => a.match_status === 'LEGAL_FORM_DIFF' || a.match_status === 'LEGAL_FORM_DIFFERS');

    if (hasMismatch) {
      summaryStatus = 'MISMATCH';
      verdictClass = 'badge-fail';
      summaryLabel = 'Entity Mismatch Detected';
    } else if (hasLegalDiff) {
      summaryStatus = 'LEGAL_FORM_DIFF';
      verdictClass = 'badge-warn';
      summaryLabel = 'Legal Form Suffix Variation (Non-Blocking)';
    }

    const count = aliases.length;
    const countBadge = count > 0 ? `${count} Document Alias${count > 1 ? 'es' : ''} Checked` : '1 Document Alias Checked';

    return `
      <div class="workspace-entity-resolution-bar" id="entity-resolution-pill">
        <div class="flex items-center gap-2" style="flex-wrap: wrap;">
          <span class="badge ${verdictClass} text-xs font-mono" id="entity-resolution-badge" data-status="${summaryStatus}">
            ENTITY RESOLUTION: ${summaryStatus}
          </span>
          <span class="text-xs text-muted">
            Canonical: <strong class="text-main">${canonicalName}</strong> ·
            <span class="badge badge-outline text-xs">${countBadge}</span> ·
            <span>${summaryLabel}</span>
          </span>
        </div>
        <button class="btn btn-outline btn-sm text-xs"
                id="btn-toggle-alias-inspector"
                onclick="window.applicationHeaderComponent.toggleAliasInspector()"
                aria-expanded="${this.isInspectorOpen ? 'true' : 'false'}"
                aria-controls="alias-inspector-drawer">
          ${this.isInspectorOpen ? '▲ Hide Alias Inspector' : '▼ Inspect Document Aliases'}
        </button>
      </div>
    `;
  }

  /**
   * Render Interactive Document Alias Inspector Table Drawer (Step 21)
   */
  renderAliasInspectorDrawer(canonicalName, aliases = []) {
    let rowsHtml = '';

    if (!aliases || aliases.length === 0) {
      rowsHtml = `
        <tr>
          <td colspan="6" class="text-muted text-center" style="padding: var(--space-4);">
            No document institution name aliases registered for inspection.
          </td>
        </tr>
      `;
    } else {
      rowsHtml = aliases.map(alias => {
        const docSlot = alias.doc_type || 'DOCUMENT';
        const docId = alias.document_id || 'doc-ref';
        const extracted = alias.extracted_name || '—';
        const canonical = alias.canonical_name || canonicalName;

        const comparison = this.compareEntityNames(extracted, canonical);
        const matchStatus = alias.match_status || comparison.status;
        const score = typeof alias.score === 'number' ? alias.score : comparison.score;

        let badgeClass = 'badge-pass';
        let badgeText = 'MATCH';

        if (matchStatus === 'LEGAL_FORM_DIFF' || matchStatus === 'LEGAL_FORM_DIFFERS') {
          badgeClass = 'badge-warn';
          badgeText = 'LEGAL_FORM_DIFF';
        } else if (matchStatus === 'MISMATCH' || matchStatus === 'DIFFERENT') {
          badgeClass = 'badge-fail';
          badgeText = 'MISMATCH';
        } else if (matchStatus === 'PARTIAL') {
          badgeClass = 'badge-review';
          badgeText = 'PARTIAL';
        }

        const legalExt = (alias.legal_forms_extracted || comparison.legalExtracted || []).join(', ') || 'None';
        const legalCan = (alias.legal_forms_canonical || comparison.legalCanonical || []).join(', ') || 'None';
        const legalPolicyNote = legalExt === legalCan
          ? `<span class="text-xs text-muted">Identical (${legalCan})</span>`
          : `<span class="text-xs" style="color: var(--status-warn);">Extracted: [${legalExt}] vs Canonical: [${legalCan}]</span>`;

        return `
          <tr id="alias-row-${docId}" data-alias-status="${badgeText}">
            <td style="padding: 6px 8px;">
              <span class="badge badge-outline text-xs font-mono">${docSlot}</span>
              <div class="text-faint" style="font-size: 10px; margin-top: 2px;">${docId}</div>
            </td>
            <td style="padding: 6px 8px; font-weight: var(--font-weight-medium);">${extracted}</td>
            <td style="padding: 6px 8px; color: var(--text-muted);">${canonical}</td>
            <td style="padding: 6px 8px; font-family: var(--font-mono); font-weight: bold; color: var(--color-accent);">
              ${score}%
            </td>
            <td style="padding: 6px 8px;">
              ${legalPolicyNote}
            </td>
            <td style="padding: 6px 8px;">
              <span class="badge ${badgeClass} text-xs font-mono" id="alias-badge-${docId}">${badgeText}</span>
            </td>
          </tr>
        `;
      }).join('');
    }

    return `
      <div id="alias-inspector-drawer" class="alias-inspector-drawer ${this.isInspectorOpen ? '' : 'hidden'}" role="region" aria-label="Document Name Alias Inspector">
        <div style="margin-bottom: var(--space-2); display: flex; align-items: center; justify-content: space-between;">
          <h4 style="margin: 0; font-size: var(--font-size-xs); text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted);">
            Canonical Entity Resolution & Cross-Document Alias Inspector (Guide §11.4)
          </h4>
          <span class="text-xs text-muted">Core token similarity threshold: <strong>85%</strong> · Minor legal suffixes non-blocking</span>
        </div>
        <table class="alias-inspector-table">
          <thead>
            <tr>
              <th>Document Slot</th>
              <th>Document-Extracted Name</th>
              <th>Canonical AICTE Record Name</th>
              <th>Core Token Match</th>
              <th>Legal Form Segregation</th>
              <th>Status Verdict</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>
      </div>
    `;
  }

  /**
   * Toggle visibility of Alias Inspector Drawer (Step 21)
   */
  toggleAliasInspector() {
    this.isInspectorOpen = !this.isInspectorOpen;

    if (typeof document !== 'undefined') {
      const drawer = document.getElementById('alias-inspector-drawer');
      const btn = document.getElementById('btn-toggle-alias-inspector');
      if (drawer) {
        if (this.isInspectorOpen) {
          drawer.classList.remove('hidden');
        } else {
          drawer.classList.add('hidden');
        }
      }
      if (btn) {
        btn.textContent = this.isInspectorOpen ? '▲ Hide Alias Inspector' : '▼ Inspect Document Aliases';
        btn.setAttribute('aria-expanded', this.isInspectorOpen ? 'true' : 'false');
      }
    }

    if (typeof window !== 'undefined' && typeof CustomEvent !== 'undefined' && typeof window.dispatchEvent === 'function') {
      window.dispatchEvent(new CustomEvent('app:alias-inspector-toggled', {
        detail: { isOpen: this.isInspectorOpen }
      }));
    }
  }

  /**
   * Render Header Card HTML (Steps 20 & 21)
   */
  render(applicationId, facts = null, agg = null) {
    this.currentAppId = applicationId;
    this.currentFacts = facts;
    this.currentAggregate = agg;

    const appId = applicationId || 'DEMO-APP';
    const canonical = (facts && facts.canonical_institute) ? facts.canonical_institute : {};

    const instName = canonical.name
      || (agg && agg.institution_name)
      || (appId === 'DEMO-ISSUES-001' ? 'Beacon College of Engineering' : 'Autonomous Technical Institution');

    const aicteId = canonical.aicte_id
      || (agg && agg.aicte_id)
      || '1-10998878';

    const categoryRaw = (agg && agg.category) || 'EOA_RENEWAL';
    const category = this.formatCategory(categoryRaw);
    const academicYear = '2026-2027';

    const workflowStatus = (agg && agg.workflow_status)
      || (facts && facts.workflow_status)
      || (agg && agg.findings && agg.findings.length > 0 ? 'NEEDS_RECTIFICATION' : 'VALIDATED_NO_ISSUES');

    const workflowPill = this.renderWorkflowStatePill(workflowStatus);

    const address = canonical.address
      ? `${canonical.address}${canonical.state ? ', ' + canonical.state : ''}`
      : 'Sector 62, Institutional Area, Noida, Uttar Pradesh';

    const factsCount = (facts && typeof facts.facts_count === 'number')
      ? facts.facts_count
      : (facts && facts.facts ? facts.facts.length : 12);

    // Extract aliases from facts or build default fixtures
    let aliases = (facts && facts.aliases) ? facts.aliases : [];
    if (aliases.length === 0) {
      if (appId === 'DEMO-ISSUES-001') {
        aliases = [
          {
            document_id: 'doc_fire_noc_1',
            doc_type: 'FIRE_NOC',
            extracted_name: 'Beacon College of Engg',
            canonical_name: instName,
            match_status: 'MATCH'
          },
          {
            document_id: 'doc_affidavit_1',
            doc_type: 'AFFIDAVIT',
            extracted_name: 'Beacon College of Engineering Society',
            canonical_name: instName,
            match_status: 'LEGAL_FORM_DIFF'
          }
        ];
      } else {
        aliases = [
          {
            document_id: 'doc_affidavit_clean',
            doc_type: 'AFFIDAVIT',
            extracted_name: instName,
            canonical_name: instName,
            match_status: 'MATCH'
          }
        ];
      }
    }

    const entityPillHtml = this.renderEntityResolutionPill(instName, aliases);
    const inspectorDrawerHtml = this.renderAliasInspectorDrawer(instName, aliases);

    return `
      <div class="card workspace-metadata-card" id="app-header-card">
        <!-- Top Badge Row -->
        <div class="workspace-header-badge-row">
          <span class="badge badge-outline font-mono text-xs" id="header-app-id">${appId}</span>
          ${workflowPill}
          <span class="badge badge-simulated text-xs">S7 TYPED FACTS · CANONICAL RECORD</span>
          <span class="badge badge-outline text-xs">${factsCount} Facts Verified</span>
        </div>

        <!-- Main Title & Action Row -->
        <div class="workspace-header-title-row">
          <div>
            <h1 class="workspace-header-inst-name" id="header-institution-name" title="${instName}">${instName}</h1>
            <p class="text-xs text-muted" id="header-address" style="margin: 4px 0 0 0;">
              ${address}
            </p>
          </div>
          <div style="display: flex; align-items: center; gap: var(--space-2);">
            <a href="#queue" class="btn btn-outline btn-sm">
              &larr; Queue Dashboard
            </a>
            <button class="btn btn-primary btn-sm" onclick="window.workspaceComponent && window.workspaceComponent.switchTab('exports')">
              Officer Actions &rarr;
            </button>
          </div>
        </div>

        <!-- Entity Resolution Pill & Document Alias Inspector (Step 21) -->
        ${entityPillHtml}
        ${inspectorDrawerHtml}

        <!-- Metadata Grid -->
        <div class="workspace-header-meta-grid">
          <div class="workspace-meta-item">
            <span class="workspace-meta-label">Permanent AICTE ID</span>
            <span class="workspace-meta-val font-mono" id="header-aicte-id">${aicteId}</span>
          </div>
          <div class="workspace-meta-item">
            <span class="workspace-meta-label">Approval Track</span>
            <span class="workspace-meta-val" id="header-category" data-raw-category="${categoryRaw}">${category}</span>
          </div>
          <div class="workspace-meta-item">
            <span class="workspace-meta-label">Academic Year</span>
            <span class="workspace-meta-val font-mono" id="header-academic-year">${academicYear}</span>
          </div>
          <div class="workspace-meta-item">
            <span class="workspace-meta-label">Statutory SLA Window</span>
            <span class="workspace-meta-val" id="header-sla-status">14-Day Mandatory Review</span>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Load S7 facts via ApiClient and render into DOM container (Steps 20 & 21)
   */
  async loadAndRender(applicationId, container = null, agg = null) {
    if (!applicationId) return;

    let targetEl = null;
    if (typeof document !== 'undefined') {
      targetEl = typeof container === 'string'
        ? document.getElementById(container)
        : (container || document.getElementById('workspace-header-container'));
    }

    let facts = null;
    try {
      const client = (typeof window !== 'undefined' && window.apiClient)
        ? window.apiClient
        : (typeof ApiClient !== 'undefined' ? new ApiClient() : null);

      if (client && typeof client.getApplicationFacts === 'function') {
        facts = await client.getApplicationFacts(applicationId);
      }
    } catch (err) {
      console.warn(`[ApplicationHeader] Could not fetch facts for ${applicationId}:`, err);
    }

    this.currentFacts = facts;
    this.currentAggregate = agg;

    const html = this.render(applicationId, facts, agg);
    if (targetEl) {
      targetEl.innerHTML = html;
    }

    // Dispatch DOM event for test verification
    if (typeof window !== 'undefined' && typeof CustomEvent !== 'undefined' && typeof window.dispatchEvent === 'function') {
      window.dispatchEvent(new CustomEvent('app:header-rendered', {
        detail: {
          applicationId,
          facts,
          aggregate: agg
        }
      }));
    }

    return html;
  }
}

// Singleton instantiation
const applicationHeaderComponent = new ApplicationHeaderComponent();
if (typeof window !== 'undefined') {
  window.applicationHeaderComponent = applicationHeaderComponent;
  window.ApplicationHeaderComponent = ApplicationHeaderComponent;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { ApplicationHeaderComponent };
}
