// ShopGraph Documentation — Sidebar Navigation
(function () {
  const VERSION = '1.0.1';
  const GITHUB_URL = 'https://github.com/laundromatic/shopgraph';

  const sections = [
    {
      title: 'Getting Started',
      items: [
        { label: 'Overview', href: '/' },
        { label: 'Installation', href: '/install' },
      ],
    },
    {
      title: 'Features',
      items: [
        { label: 'Features Overview', href: '/features' },
        { label: 'Confidence Scoring', href: '/features/confidence' },
        { label: 'UCP Output', href: '/features/ucp' },
        { label: 'AgentReady Scoring', href: '/features/agentready' },
        { label: 'Routing Engine', href: '/features/routing' },
        { label: 'Self-Healing', href: '/features/self-healing' },
      ],
    },
    {
      title: 'Output Schemas',
      items: [
        { label: 'ProductData', href: '/output/schema' },
        { label: 'UCP Line Item', href: '/output/ucp-line-item' },
        { label: 'AgentReady Score', href: '/output/agentready-score' },
      ],
    },
    {
      title: 'Tools',
      items: [
        { label: 'MCP Server', href: '/tools/mcp' },
        { label: 'REST API', href: '/tools/api' },
        { label: 'Nodes', href: '/tools/nodes' },
      ],
    },
    {
      title: 'Resources',
      items: [
        { label: 'Pricing', href: '/pricing' },
        { label: 'Changelog', href: '/changelog' },
        { label: 'Methodology', href: '/methodology' },
        { label: 'FAQ', href: '/faq' },
      ],
    },
  ];

  // Determine current path
  let currentPath = window.location.pathname.replace(/\.html$/, '').replace(/\/index$/, '/');
  if (currentPath !== '/' && currentPath.endsWith('/')) currentPath = currentPath.slice(0, -1);
  if (currentPath === '') currentPath = '/';

  const chevronSVG = '<svg class="chevron" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><polyline points="4 6 8 10 12 6"/></svg>';

  const logoSVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>';

  const githubSVG = '<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>';

  function buildSidebar() {
    // Create mobile toggle
    const toggle = document.createElement('button');
    toggle.className = 'mobile-toggle';
    toggle.setAttribute('aria-label', 'Toggle navigation');
    toggle.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>';
    document.body.appendChild(toggle);

    // Create overlay
    const overlay = document.createElement('div');
    overlay.className = 'mobile-overlay';
    document.body.appendChild(overlay);

    // Create sidebar
    const sidebar = document.createElement('nav');
    sidebar.className = 'sidebar';

    // Header
    sidebar.innerHTML = `
      <div class="sidebar-header">
        <a href="/" class="sidebar-logo">
          ${logoSVG}
          <span class="sidebar-logo-text">SHOPGRAPH</span>
          <span class="sidebar-version">v${VERSION}</span>
        </a>
      </div>
      <div class="sidebar-nav" id="sidebar-nav"></div>
      <div class="sidebar-footer">
        <span>v${VERSION}</span>
        <a href="${GITHUB_URL}" target="_blank" rel="noopener">${githubSVG} GitHub</a>
      </div>
    `;

    const nav = sidebar.querySelector('#sidebar-nav');

    sections.forEach(function (section) {
      const sec = document.createElement('div');
      sec.className = 'nav-section';

      const isActive = section.items.some(function (item) {
        return item.href === currentPath;
      });

      const title = document.createElement('div');
      title.className = 'nav-section-title';
      title.innerHTML = section.title + ' ' + chevronSVG;
      title.addEventListener('click', function () {
        sec.classList.toggle('collapsed');
      });

      const ul = document.createElement('ul');
      ul.className = 'nav-items';

      section.items.forEach(function (item) {
        const li = document.createElement('li');
        li.className = 'nav-item';
        const a = document.createElement('a');
        a.href = item.href;
        a.textContent = item.label;
        if (item.href === currentPath) {
          a.className = 'active';
        }
        li.appendChild(a);
        ul.appendChild(li);
      });

      sec.appendChild(title);
      sec.appendChild(ul);

      // Collapse non-active sections by default (except Getting Started)
      if (!isActive && section.title !== 'Getting Started') {
        // Don't collapse — keep all open for discoverability
      }

      nav.appendChild(sec);
    });

    document.body.appendChild(sidebar);

    // Mobile toggle behavior
    toggle.addEventListener('click', function () {
      sidebar.classList.toggle('open');
      overlay.classList.toggle('open');
    });

    overlay.addEventListener('click', function () {
      sidebar.classList.remove('open');
      overlay.classList.remove('open');
    });
  }

  // Wrap existing body content in layout structure
  function wrapContent() {
    const existingContent = document.querySelector('.content-inner');
    if (!existingContent) return; // Already structured

    buildSidebar();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wrapContent);
  } else {
    wrapContent();
  }
})();
