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
 *   - Uses absolute paths ("/episodes/", "/customizer/"…) so it
 *     works correctly from any subdirectory depth. Test via a local
 *     dev server, not the file:// protocol.
 * ================================================================ */
(function () {
  'use strict';

  // ---- EDIT THIS TO CHANGE THE NAV SITEWIDE ----------------------
  const MENU = [
    { label: 'Episodes', href: '/episodes/' },
    { label: 'Scenes', href: '/scenes/' },
    { label: 'Character', href: '/customizer/' },
    { label: 'Animate', href: '/animator/' },
    { label: 'Stream', href: '/live/' },
    { label: 'Clip', href: '/clipper/' },
    { label: 'Arcade', href: '/game/' },
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

      /* Social row sits at the bottom of the drawer. */
      .bhb-nav.mobile-open .nav-social {
        display: flex;
        width: 100%;
        justify-content: center;
        gap: 0.75rem;
        margin: auto 0 0; /* auto top margin pushes the row to the drawer floor */
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
      <div class="nav-social">
        <a href="https://www.youtube.com/@BHaleyArt" target="_blank" rel="noopener" aria-label="YouTube"><svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg></a>
        <a href="https://www.tiktok.com/@bigheadbillionaires" target="_blank" rel="noopener" aria-label="TikTok"><svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z"/></svg></a>
        <a href="https://facebook.com/BigHeadBillionaires" target="_blank" rel="noopener" aria-label="Facebook"><svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M9.101 23.691v-7.98H6.627v-3.667h2.474v-1.58c0-4.085 1.848-5.978 5.858-5.978.401 0 .955.042 1.468.103a8.68 8.68 0 0 1 1.141.195v3.325a8.623 8.623 0 0 0-.653-.036 26.805 26.805 0 0 0-.733-.009c-.707 0-1.259.096-1.675.309a1.686 1.686 0 0 0-.679.622c-.258.42-.374.995-.374 1.752v1.297h3.919l-.386 2.103-.287 1.564h-3.246v8.245C19.396 23.238 24 18.179 24 12.044c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.628 3.874 10.35 9.101 11.647Z"/></svg></a>
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
