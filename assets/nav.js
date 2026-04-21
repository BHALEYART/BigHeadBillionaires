/* ================================================================
 * BHB NAV — shared across every page of the site.
 * ================================================================
 * To change the nav anywhere on the site, edit the MENU array below.
 *
 * Usage on each page (replace the existing <nav class="bhb-nav">...</nav>
 * block with this one line, placed at the top of <body>):
 *
 *     <script src="/assets/nav.js"></script>
 *
 * Requirements:
 *   - Load synchronously (no defer / async / type=module).
 *     document.currentScript is used to inject the nav at the
 *     script tag's exact position, so the nav renders in the
 *     right spot with no flash of unstyled content.
 *   - Uses absolute paths ("/marketplace/", "/customizer/"…) so it
 *     works correctly from any subdirectory depth. Test via a local
 *     dev server, not the file:// protocol.
 *
 * Keeps the existing #walletBtn id so wallet wiring in bhb.js
 * continues to work untouched.
 * ================================================================ */
(function () {
  'use strict';

  // ---- EDIT THIS TO CHANGE THE NAV SITEWIDE ----------------------
  const MENU = [
    { label: 'Episodes', href: '/episodes/' },
    {
      label: 'Marketplace',
      children: [
        { label: 'Market',  href: '/marketplace/' },
        { label: 'Burg Token',  href: 'https://pump.fun/coin/6disLregVtZ8qKpTTGyW81mbfAS9uwvHwjKfy6LApump' },
        { label: 'Expansions',  href: '/expansions/' },
        { label: 'Redeem',  href: '/redeem/' },         // TODO: confirm path (Burn-for-BURG)
      ],
    },
    {
      label: 'Tools',
      children: [
        { label: 'Customizer', href: '/customizer/' },
        { label: 'Animator',   href: '/animator/' },
        { label: 'Livestream', href: '/live/' },      // TODO: confirm path (BHB Live)
        { label: 'Software',   href: '/software/' },     // TODO: confirm path (BHB Agent Studio)
      ],
    },
    {
      label: 'Rewards',
      children: [
        { label: 'Arcade',   href: '/game/' },
        { label: 'Seasons',  href: '/seasons/' },
      ],
    },
    { label: 'Help', href: '/help/', help: true },
  ];
  // ---------------------------------------------------------------

  const CSS = `
    /* ── Panel wrapper (contents on desktop → inline, flex-column on mobile) ── */
    .bhb-nav .nav-panel { display: contents; }

    /* ── Dropdown parent button (styled like a .nav-links a) ── */
    .nav-links .nav-dropdown { position: relative; }
    .nav-links .nav-dropdown-toggle {
      display: inline-flex;
      align-items: center;
      gap: 0.3rem;
      padding: 0.35rem 0.85rem;
      font-family: var(--font-body);
      font-size: 0.72rem;
      font-weight: 700;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: rgba(255,255,255,0.7);
      background: transparent;
      border: 2px solid transparent;
      border-radius: 4px;
      cursor: pointer;
      transition: all 0.1s;
    }
    .nav-links .nav-dropdown-toggle .caret {
      font-size: 0.55rem;
      line-height: 1;
      transition: transform 0.15s;
    }
    .nav-links .nav-dropdown:hover > .nav-dropdown-toggle,
    .nav-links .nav-dropdown.open > .nav-dropdown-toggle,
    .nav-links .nav-dropdown.active-parent > .nav-dropdown-toggle {
      background: var(--yellow);
      color: var(--black);
      border-color: var(--yellow);
    }
    .nav-links .nav-dropdown:hover .caret,
    .nav-links .nav-dropdown.open .caret { transform: rotate(180deg); }

    /* ── Dropdown menu (desktop = floating; mobile = accordion, handled below) ── */
    .nav-dropdown-menu {
      position: absolute;
      top: calc(100% + 6px);
      left: 0;
      min-width: 180px;
      padding: 6px;
      list-style: none;
      background: var(--black);
      border: 2px solid var(--yellow);
      border-radius: 6px;
      box-shadow: 4px 4px 0 rgba(0,0,0,0.4);
      opacity: 0;
      visibility: hidden;
      transform: translateY(-4px);
      transition: opacity 0.12s, transform 0.12s, visibility 0.12s;
      z-index: 1001;
    }
    .nav-links .nav-dropdown:hover > .nav-dropdown-menu,
    .nav-links .nav-dropdown.open > .nav-dropdown-menu {
      opacity: 1;
      visibility: visible;
      transform: translateY(0);
    }
    .nav-dropdown-menu li { list-style: none; }
    .nav-dropdown-menu a {
      display: block;
      padding: 0.45rem 0.85rem;
      font-family: var(--font-body);
      font-size: 0.72rem;
      font-weight: 700;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: rgba(255,255,255,0.8);
      text-decoration: none;
      border: 2px solid transparent;
      border-radius: 4px;
      white-space: nowrap;
      transition: all 0.1s;
    }
    .nav-dropdown-menu a:hover,
    .nav-dropdown-menu a.active {
      background: var(--yellow);
      color: var(--black);
      border-color: var(--yellow);
    }

    /* ── Hamburger button (mobile only) ── */
    .nav-toggle {
      display: none;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      gap: 4px;
      width: 40px;
      height: 36px;
      padding: 0;
      background: transparent;
      border: 2px solid var(--yellow);
      border-radius: 4px;
      cursor: pointer;
    }
    .nav-toggle span {
      display: block;
      width: 18px;
      height: 2px;
      background: var(--yellow);
      transition: transform 0.2s, opacity 0.2s;
    }
    .bhb-nav.mobile-open .nav-toggle span:nth-child(1) { transform: translateY(6px) rotate(45deg); }
    .bhb-nav.mobile-open .nav-toggle span:nth-child(2) { opacity: 0; }
    .bhb-nav.mobile-open .nav-toggle span:nth-child(3) { transform: translateY(-6px) rotate(-45deg); }

    /* ── Scrim behind the mobile drawer ── */
    .nav-scrim {
      position: fixed;
      inset: 62px 0 0 0;
      background: rgba(0,0,0,0.5);
      opacity: 0;
      visibility: hidden;
      transition: opacity 0.18s, visibility 0.18s;
      z-index: 998;
    }
    body.nav-locked .nav-scrim { opacity: 1; visibility: visible; }

    /* ══════════════════ MOBILE ══════════════════ */
    @media (max-width: 768px) {
      .bhb-nav { padding: 0 1rem; }
      .nav-toggle { display: flex; }

      /* Hide the panel contents until the drawer is opened. */
      .bhb-nav .nav-panel { display: none; }

      .bhb-nav.mobile-open .nav-panel {
        display: flex;
        flex-direction: column;
        position: fixed;
        top: 62px;
        right: 0;
        width: min(320px, 88vw);
        height: calc(100vh - 62px);
        background: var(--black);
        border-left: 3px solid var(--yellow);
        padding: 1rem 1rem calc(1rem + env(safe-area-inset-bottom, 0));
        overflow-y: auto;
        z-index: 999;
      }

      .bhb-nav.mobile-open .nav-links {
        display: flex;
        flex-direction: column;
        align-items: stretch;
        gap: 0.25rem;
        width: 100%;
      }

      /* Help: reset the desktop "push-to-right" behavior. */
      .bhb-nav.mobile-open .nav-help-li { margin-left: 0; margin-top: 0.5rem; }

      /* Full-width tappable rows for links + dropdown toggles. */
      .bhb-nav.mobile-open .nav-links > li > a,
      .bhb-nav.mobile-open .nav-links .nav-dropdown-toggle {
        width: 100%;
        padding: 0.75rem 0.85rem;
        font-size: 0.85rem;
        justify-content: space-between;
        text-align: left;
      }

      /* Dropdowns become accordions — static flow, height-animated. */
      .bhb-nav.mobile-open .nav-dropdown-menu {
        position: static;
        opacity: 1;
        visibility: visible;
        transform: none;
        box-shadow: none;
        border: none;
        background: transparent;
        max-height: 0;
        overflow: hidden;
        padding: 0;
        transition: max-height 0.2s ease, padding 0.2s ease;
      }
      .bhb-nav.mobile-open .nav-dropdown.open > .nav-dropdown-menu {
        max-height: 600px;
        padding: 4px 0 6px 12px;
      }
      .bhb-nav.mobile-open .nav-dropdown-menu a {
        padding: 0.55rem 0.85rem;
        font-size: 0.78rem;
      }
      /* Kill hover-open on touch so it requires a tap. */
      .bhb-nav.mobile-open .nav-links .nav-dropdown:hover > .nav-dropdown-menu {
        opacity: 0;
        visibility: hidden;
      }
      .bhb-nav.mobile-open .nav-links .nav-dropdown.open > .nav-dropdown-menu {
        opacity: 1;
        visibility: visible;
      }

      /* Wallet button and social sit at the bottom of the drawer. */
      .bhb-nav.mobile-open .nav-wallet-btn {
        display: flex;
        width: 100%;
        justify-content: center;
        margin-top: auto;
      }
      .bhb-nav.mobile-open .nav-social {
        display: flex;
        width: 100%;
        justify-content: center;
        gap: 0.75rem;
        margin: 0.75rem 0 0;
      }

      body.nav-locked { overflow: hidden; }
    }
  `;

  // ---- inject styles once ----------------------------------------
  if (!document.getElementById('bhb-nav-styles')) {
    const style = document.createElement('style');
    style.id = 'bhb-nav-styles';
    style.textContent = CSS;
    document.head.appendChild(style);
  }

  // ---- active-link detection -------------------------------------
  const normalize = (p) =>
    (p || '').replace(/\/index\.html?$/i, '').replace(/\/+$/, '') || '/';
  const currentPath = normalize(location.pathname);
  const isActive = (href) => normalize(href) === currentPath;

  // ---- build nav HTML --------------------------------------------
  const esc = (s) => String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  const renderItem = (item) => {
    if (item.children) {
      const anyActive = item.children.some((c) => isActive(c.href));
      const kids = item.children.map((c) =>
        `<li><a href="${esc(c.href)}"${isActive(c.href) ? ' class="active"' : ''}>${esc(c.label)}</a></li>`
      ).join('');
      return `
        <li class="nav-dropdown${anyActive ? ' active-parent' : ''}">
          <button type="button" class="nav-dropdown-toggle" aria-expanded="false" aria-haspopup="true">
            ${esc(item.label)}<span class="caret" aria-hidden="true">▼</span>
          </button>
          <ul class="nav-dropdown-menu" role="menu">${kids}</ul>
        </li>`;
    }
    const cls = item.help ? ' class="nav-help-li"' : '';
    const active = isActive(item.href) ? ' class="active"' : '';
    return `<li${cls}><a href="${esc(item.href)}"${active}>${esc(item.label)}</a></li>`;
  };

  const navHtml = `
    <a href="/" class="logo">BIG HEAD <span>BILLIONAIRES</span></a>
    <div class="nav-panel">
      <ul class="nav-links">${MENU.map(renderItem).join('')}</ul>
      <button class="nav-wallet-btn" id="walletBtn">Connect Wallet</button>
      <div class="nav-social">
        <a href="https://x.com/bigheadbillions/" target="_blank" rel="noopener" aria-label="X / Twitter"><svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.73-8.835L1.254 2.25H8.08l4.253 5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg></a>
        <a href="https://discord.gg/MHskPjHsf2" target="_blank" rel="noopener" aria-label="Discord"><svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057c.001.022.015.041.033.051a19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/></svg></a>
      </div>
    </div>
    <button class="nav-toggle" aria-label="Menu" aria-expanded="false">
      <span></span><span></span><span></span>
    </button>
  `;

  // ---- insert nav at script position -----------------------------
  const nav = document.createElement('nav');
  nav.className = 'bhb-nav';
  nav.innerHTML = navHtml;

  const script = document.currentScript;
  if (script && script.parentNode) {
    script.parentNode.insertBefore(nav, script);
  } else {
    document.body.insertBefore(nav, document.body.firstChild);
  }

  // Scrim for mobile (outside click → close)
  const scrim = document.createElement('div');
  scrim.className = 'nav-scrim';
  document.body.appendChild(scrim);

  // ---- interactions ---------------------------------------------
  const isDesktop = () => window.matchMedia('(min-width: 769px)').matches;

  const closeAllDropdowns = () => {
    nav.querySelectorAll('.nav-dropdown.open').forEach((el) => {
      el.classList.remove('open');
      const t = el.querySelector('.nav-dropdown-toggle');
      if (t) t.setAttribute('aria-expanded', 'false');
    });
  };

  nav.querySelectorAll('.nav-dropdown').forEach((dd) => {
    const toggle = dd.querySelector('.nav-dropdown-toggle');
    toggle.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const wasOpen = dd.classList.contains('open');
      closeAllDropdowns();
      if (!wasOpen) {
        dd.classList.add('open');
        toggle.setAttribute('aria-expanded', 'true');
      }
    });
  });

  // Mobile hamburger
  const toggleBtn = nav.querySelector('.nav-toggle');
  const openMobile = () => {
    nav.classList.add('mobile-open');
    document.body.classList.add('nav-locked');
    toggleBtn.setAttribute('aria-expanded', 'true');
  };
  const closeMobile = () => {
    nav.classList.remove('mobile-open');
    document.body.classList.remove('nav-locked');
    toggleBtn.setAttribute('aria-expanded', 'false');
    closeAllDropdowns();
  };
  toggleBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (nav.classList.contains('mobile-open')) closeMobile();
    else openMobile();
  });
  scrim.addEventListener('click', closeMobile);

  // Close on outside click / Escape
  document.addEventListener('click', (e) => {
    if (!nav.contains(e.target)) closeAllDropdowns();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeAllDropdowns();
      if (nav.classList.contains('mobile-open')) closeMobile();
    }
  });

  // Tapping a leaf link in the mobile drawer should close it.
  nav.querySelectorAll('.nav-dropdown-menu a, .nav-links > li > a').forEach((a) => {
    a.addEventListener('click', () => {
      if (!isDesktop()) closeMobile();
    });
  });

  // Resize: if switching back to desktop, reset mobile state.
  window.addEventListener('resize', () => {
    if (isDesktop() && nav.classList.contains('mobile-open')) closeMobile();
  });
})();
