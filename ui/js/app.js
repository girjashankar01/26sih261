/**
 * AICTE Application Validation Platform — Zero-Dependency Hash Router & App Bootstrap
 * Spec Reference: ROADMAP.md (Step 03)
 */

class Router {
  constructor() {
    this.routes = [];
    this.currentRoute = null;
    this.currentParams = {};
    this.listeners = [];

    // Bind browser hash events
    window.addEventListener('hashchange', () => this.handleHashChange());
    window.addEventListener('DOMContentLoaded', () => this.init());
  }

  /**
   * Register a route path with an optional handler
   * Supports dynamic segments e.g. '#application/:id'
   */
  addRoute(pathPattern, viewId, handler = null) {
    // Convert ':param' syntax to regex capture groups
    const paramNames = [];
    const regexPattern = pathPattern
      .replace(/:([a-zA-Z0-9_]+)/g, (_, name) => {
        paramNames.push(name);
        return '([a-zA-Z0-9_\\-\\.]+)';
      })
      .replace(/\//g, '\\/');

    const regex = new RegExp(`^#?${regexPattern}$`);

    this.routes.push({
      pattern: pathPattern,
      regex,
      paramNames,
      viewId,
      handler
    });

    return this;
  }

  /**
   * Register a callback listener for route transitions
   */
  onRouteChange(listener) {
    if (typeof listener === 'function') {
      this.listeners.push(listener);
    }
    return this;
  }

  /**
   * Programmatic navigation
   */
  navigate(targetHash, replace = false) {
    const formatted = targetHash.startsWith('#') ? targetHash : `#${targetHash}`;
    if (replace) {
      const url = new URL(window.location);
      url.hash = formatted;
      window.location.replace(url);
    } else {
      window.location.hash = formatted;
    }
  }

  /**
   * Resolve current hash against registered route table
   */
  resolve(hash) {
    const cleanHash = hash || '#queue';

    for (const route of this.routes) {
      const match = cleanHash.match(route.regex);
      if (match) {
        const params = {};
        route.paramNames.forEach((name, index) => {
          params[name] = match[index + 1];
        });
        return {
          route: route.pattern,
          viewId: route.viewId,
          params,
          handler: route.handler
        };
      }
    }

    // Default fallback to queue
    return {
      route: '#queue',
      viewId: 'view-queue',
      params: {},
      handler: null
    };
  }

  /**
   * Main router event handler
   */
  handleHashChange() {
    const hash = window.location.hash;
    const match = this.resolve(hash);

    this.currentRoute = match.route;
    this.currentParams = match.params;

    // 1. Toggle visibility of viewports
    document.querySelectorAll('.app-viewport').forEach(vp => {
      if (vp.id === match.viewId) {
        vp.classList.remove('hidden');
      } else {
        vp.classList.add('hidden');
      }
    });

    // 2. Synchronize navigation buttons active state
    document.querySelectorAll('.nav-tab-btn').forEach(btn => {
      const targetView = btn.dataset.target;
      if (targetView === match.viewId) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });

    // 3. Execute route handler if present
    if (typeof match.handler === 'function') {
      try {
        match.handler(match.params);
      } catch (err) {
        console.error(`[Router] Error executing handler for ${match.route}:`, err);
      }
    }

    // 4. Notify all registered listeners
    this.listeners.forEach(listener => {
      try {
        listener(match.route, match.params, match.viewId);
      } catch (err) {
        console.error('[Router] Error in route listener:', err);
      }
    });

    // 5. Dispatch native DOM event
    if (typeof window !== 'undefined' && typeof CustomEvent !== 'undefined' && typeof window.dispatchEvent === 'function') {
      window.dispatchEvent(new CustomEvent('app:route-change', {
        detail: {
          route: match.route,
          viewId: match.viewId,
          params: match.params
        }
      }));
    }
  }

  /**
   * Initialize router on startup
   */
  init() {
    // Intercept clicks on links with data-route or relative hash
    document.body.addEventListener('click', (e) => {
      const targetLink = e.target.closest('a[href^="#"], [data-route]');
      if (!targetLink) return;

      const destination = targetLink.getAttribute('data-route') || targetLink.getAttribute('href');
      if (destination && destination.startsWith('#')) {
        e.preventDefault();
        this.navigate(destination);
      }
    });

    // Resolve initial URL state
    if (!window.location.hash) {
      this.navigate('#queue', true);
    } else {
      this.handleHashChange();
    }
  }
}

// Instantiate and configure standard platform routes
const appRouter = new Router();

// Configure the 5 standard viewports (Guide §17)
appRouter
  .addRoute('#queue', 'view-queue')
  .addRoute('#workspace', 'view-workspace')
  .addRoute('#application/:id', 'view-workspace', (params) => {
    if (window.workspaceComponent && typeof window.workspaceComponent.loadApplication === 'function') {
      window.workspaceComponent.loadApplication(params.id);
    } else {
      const titleEl = document.getElementById('workspace-app-title');
      const subtitleEl = document.getElementById('workspace-app-subtitle');
      if (titleEl && params.id) {
        titleEl.textContent = `Application: ${params.id}`;
      }
      if (subtitleEl && params.id) {
        subtitleEl.textContent = `Inspection console for institutional bundle ID: ${params.id}`;
      }
      if (window.appState && typeof window.appState.setSelectedApp === 'function') {
        window.appState.setSelectedApp(params.id);
      }
    }
  })
  .addRoute('#application/:id/:tab', 'view-workspace', (params) => {
    if (window.workspaceComponent && typeof window.workspaceComponent.loadApplication === 'function') {
      window.workspaceComponent.loadApplication(params.id, null, params.tab);
    }
  })
  .addRoute('#rules', 'view-rules', () => {
    if (window.rulesViewComponent && typeof window.rulesViewComponent.loadAndRender === 'function') {
      window.rulesViewComponent.loadAndRender();
    }
  })
  .addRoute('#audit', 'view-audit', () => {
    if (window.auditViewComponent && typeof window.auditViewComponent.loadAndRender === 'function') {
      window.auditViewComponent.loadAndRender();
    }
  })
  .addRoute('#about/realness', 'view-realness', () => {
    if (window.realnessViewComponent && typeof window.realnessViewComponent.loadAndRender === 'function') {
      window.realnessViewComponent.loadAndRender();
    }
  })
  .addRoute('#realness', 'view-realness', () => {
    if (window.realnessViewComponent && typeof window.realnessViewComponent.loadAndRender === 'function') {
      window.realnessViewComponent.loadAndRender();
    }
  });

// Export globally for programmatic control across components
window.router = appRouter;
