/**
 * Account page + dashboard boards card: the boards section must carry its own
 * loading state, exactly as the boards page now does.
 *
 * Background. `/:user/boards` used to mount a full-viewport `.ll-premium-progress`
 * "Preparing your workspace" overlay over the whole page until the Mine list
 * resolved; that overlay was masking a blank section body, because
 * `available-boards-section.hbs` gated its content on `{{#if board_list}}` and
 * `board_list` is assigned asynchronously. Both were fixed there.
 *
 * `<AvailableBoardsSection>` is shared by three surfaces. This probe checks the
 * other two — the ACCOUNT page (`/:user/account`, and `/:user`, which render the
 * same `user/index` template) and the DASHBOARD boards card (`/:user/home` with
 * the Boards tab active, `components/dashboard-user-boards.hbs`).
 *
 * PRECONDITIONS THIS PROBE ASSERTS FOR ITSELF (a pass proves nothing otherwise):
 *   - the dashboard's boards card only renders when `activeTab == "boards"`
 *     (authenticated-view.hbs:91) — the Boards pill must actually be clicked,
 *     and the click must be confirmed to have switched tabs
 *   - the loading window must be observed in >= MIN_FRAMES frames
 *   - the grid must eventually arrive, or "no overlay, no blank" is vacuous
 *
 * Usage:
 *   node scripts/workspace-overlay-qa.mjs --user marcus_williams_slp --pass 'demo2025!'
 */
/* eslint-env node */
import { cliArgs, launch, login } from './qa-helpers.mjs';

const OPTS = cliArgs(process.argv);
const DELAY_MS = parseInt(OPTS.arg('--delay', '5000'), 10);
const MIN_FRAMES = 4;

const results = [];
const pass = (n, d) => { results.push({ n, ok: true }); console.log(`  PASS  ${n}\n        ${d}`); };
const fail = (n, d) => { results.push({ n, ok: false }); console.log(`  FAIL  ${n}\n        ${d}`); };

const SNAP = () => {
  const q = (s) => document.querySelector(s);
  const vis = (el) => !!(el && el.getClientRects().length > 0);
  const ov = q('.ll-premium-progress');
  return {
    // Pre-Ember boot skeleton (app/index.html #loading_box) — a separate
    // mechanism from the Ember overlay, and deliberately NOT in scope.
    skeleton: vis(q('#loading_box')),
    overlay: vis(ov),
    overlaySub: ov ? ((ov.querySelector('.ll-premium-progress__sub') || {}).textContent || '').trim() : null,
    // The boards section chrome + its own loading state.
    sectionHeader: vis(q('.ub-boards-page__boards-title')),
    sectionBody: vis(q('.ub-boards-page__boards-body')),
    loading: vis(q('.ub-boards-page__loading')),
    loadingText: ((q('.ub-boards-page__loading-label') || {}).textContent || '').trim() || null,
    spinner: vis(q('.ub-boards-page__loading .md-loading-spinner')),
    grid: (() => { const g = q('.ub-boards-page__board-grid'); return !!(g && g.children.length); })(),
    activeTab: (() => {
      const a = document.querySelector('.md-pillnav__pill.is-active, .md-pillnav-dropdown__option.is-active');
      return a ? a.textContent.trim().slice(0, 24) : null;
    })()
  };
};

const sample = async (page, ms) => {
  const frames = [];
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    frames.push(await page.evaluate(SNAP).catch(() => null));
    await new Promise((r) => setTimeout(r, 200));
  }
  return frames.filter(Boolean);
};

// Real CDP mouse click on the first visible element matching `text` among `sel`.
const clickByText = async (page, sel, text) => {
  const handles = await page.$$(sel);
  for (const h of handles) {
    const t = await page.evaluate((el) => (el.textContent || '').trim(), h);
    if (t === text) {
      const box = await h.boundingBox();
      if (box) { await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2); return true; }
    }
  }
  return false;
};

const clearMineCache = (page) => page.evaluate(() => {
  try {
    /* The real prefix is `ll_boards_page_mine_v1:` (app/utils/boards_page_list_cache.js).
         The previous pattern, /boards_page_list|mine_list/i, matches NEITHER of those
         substrings, so this cleared nothing and every run hydrated from the snapshot it
         believed it had just dropped. */
      Object.keys(localStorage).filter((k) => k.indexOf('ll_boards_page_mine_v1:') === 0)
      .forEach((k) => localStorage.removeItem(k));
  } catch (e) { /* nothing to clear */ }
});

const assess = (label, frames) => {
  console.log(`\n${label}  — ${frames.length} frames sampled`);
  // Frames where Ember owns the screen (boot skeleton gone).
  const live = frames.filter((f) => !f.skeleton);
  const withGrid = live.filter((f) => f.grid).length;
  const preGrid = [];
  for (const f of live) { if (f.grid) { break; } preGrid.push(f); }

  const overlayEver = live.filter((f) => f.overlay).length;
  if (preGrid.length < MIN_FRAMES) {
    /* No observable loading window. That is a PASS only when the grid is
       already there — a cache-first paint, which is the ideal outcome and has
       no loading state to assert. With no grid either, the probe simply failed
       to observe anything and nothing can be concluded. */
    if (withGrid > 0 && overlayEver === 0) {
      pass(`${label} — cache-first paint, no loading window to observe`,
        `grid already populated by post-boot frame ${preGrid.length + 1} of ${live.length}; ` +
        `no .ll-premium-progress in any frame, and no blank section`);
    } else {
      fail(`${label} — probe observed its own loading window`,
        `only ${preGrid.length} post-boot pre-grid frames (live ${live.length}, skeleton ${frames.length - live.length}), ` +
        `grid in ${withGrid}, overlay in ${overlayEver} — nothing can be concluded`);
    }
    return;
  }
  pass(`${label} — probe observed its own loading window`,
    `${preGrid.length} post-boot frames before the grid arrived; grid present in ${withGrid} frames`);

  const overlayFrames = live.filter((f) => f.overlay).length;
  if (overlayFrames === 0) {
    pass(`${label} — no full-viewport workspace overlay`, `.ll-premium-progress absent in all ${live.length} post-boot frames`);
  } else {
    fail(`${label} — no full-viewport workspace overlay`,
      `visible in ${overlayFrames}/${live.length} frames (sub="${(live.find((f) => f.overlay) || {}).overlaySub}")`);
  }

  const loadingFrames = preGrid.filter((f) => f.loading).length;
  const blankFrames = preGrid.filter((f) => !f.loading && !f.grid).length;
  if (loadingFrames >= MIN_FRAMES) {
    const f = preGrid.find((x) => x.loading);
    pass(`${label} — boards section carries its own loading state`,
      `"${f.loadingText}" in ${loadingFrames}/${preGrid.length} pre-grid frames, spinner=${f.spinner}`);
  } else {
    fail(`${label} — boards section carries its own loading state`,
      `loading message in only ${loadingFrames}/${preGrid.length} pre-grid frames; ` +
      `${blankFrames} of them showed NEITHER a loading state nor a grid ` +
      `(sectionHeader in ${preGrid.filter((f) => f.sectionHeader).length}, sectionBody in ${preGrid.filter((f) => f.sectionBody).length})`);
  }

  if (withGrid > 0) {
    pass(`${label} — grid replaces the loading state once resolved`, `grid populated in ${withGrid} frames`);
  } else {
    fail(`${label} — grid replaces the loading state once resolved`, `grid never populated — the window may be mis-measured`);
  }
};

(async () => {
  const { browser, page } = await launch(OPTS);
  page.on('pageerror', (e) => console.log('  [pageerror] ' + e.message));
  const u = OPTS.USER;
  let holding = false;
  try {
    console.log(`\nBASE ${OPTS.BASE}  USER ${OPTS.USER}  DELAY ${DELAY_MS}ms`);
    await login(page, OPTS);

    await page.setRequestInterception(true);
    page.on('request', (req) => {
      if (holding && req.method() === 'GET' && /\/api\/v\d+\/boards\?/.test(req.url())) {
        setTimeout(() => { try { req.continue(); } catch (e) { /* handled */ } }, DELAY_MS);
        return;
      }
      try { req.continue(); } catch (e) { /* handled */ }
    });

    /* ---- 1. DASHBOARD boards card (SPA: Home tab -> Boards tab) ---- */
    await page.goto(`${OPTS.BASE}/${u}/home`, { waitUntil: 'domcontentloaded' });
    await new Promise((r) => setTimeout(r, 5000));
    await clearMineCache(page);
    holding = true;
    const clicked = await clickByText(page, '.md-pillnav__pill, .md-pillnav-dropdown__option, button', 'Boards');
    if (!clicked) {
      fail('DASHBOARD card — precondition: Boards pill clicked', 'no visible pill/button labelled "Boards" on /:user/home');
    } else {
      const dashFrames = await sample(page, DELAY_MS + 3000);
      const tabbed = dashFrames.filter((f) => f.sectionBody || f.sectionHeader || f.loading).length;
      if (tabbed === 0) {
        fail('DASHBOARD card — precondition: Boards tab actually activated',
          `the card never rendered at all (activeTab seen: ${[...new Set(dashFrames.map((f) => f.activeTab))].join(' | ')})`);
      } else {
        pass('DASHBOARD card — precondition: Boards tab actually activated', `card present in ${tabbed}/${dashFrames.length} frames`);
        assess('DASHBOARD card', dashFrames);
      }
    }
    holding = false;
    await new Promise((r) => setTimeout(r, 2000));

    /* ---- 2. ACCOUNT page, hard load ---- */
    await clearMineCache(page);
    holding = true;
    const nav = page.goto(`${OPTS.BASE}/${u}/account`, { waitUntil: 'domcontentloaded' });
    assess('ACCOUNT page (hard load)', await sample(page, DELAY_MS + 3000));
    await nav.catch(() => {});
    holding = false;
    await new Promise((r) => setTimeout(r, 2000));

    /* ---- 3. ACCOUNT page, SPA transition from the boards page ----
       Both routes sit under the `user` route, so its own pill nav
       (templates/user.hbs:12) is on screen and the Account pill is always
       rendered there — unlike the dashboard's pill nav, which gates Account
       behind `showAccountPill`. */
    await page.goto(`${OPTS.BASE}/${u}/boards`, { waitUntil: 'domcontentloaded' });
    await new Promise((r) => setTimeout(r, 5000));
    await clearMineCache(page);
    holding = true;
    /* The Account entry is NOT a pill on this route (the `user` pill nav shows
       Caseload / Dashboard / Reports / Extras only) and the navbar's "My Account"
       sits inside a Bootstrap dropdown that needs its own JS to open. Drive the
       real router instead — `window.appState` is the app-state SERVICE
       (services/app-state.js:72) and carries the router injection (:62), so this
       is the same transition the link would perform, not a pushState fake. */
    const okAccount = await page.evaluate((name) => {
      const as = window.appState;
      const r = as && (as.get ? as.get('router') : as.router);
      if (!r || typeof r.transitionTo !== 'function') { return false; }
      r.transitionTo('user.account', name);
      return true;
    }, u);
    if (!okAccount) {
      fail('ACCOUNT page (SPA) — precondition: router transition issued',
        'window.appState.router was not reachable — the transition never ran');
    } else {
      assess('ACCOUNT page (SPA transition)', await sample(page, DELAY_MS + 3000));
    }
    holding = false;
  } catch (e) {
    console.log('\nERROR ' + e.message);
    results.push({ n: 'probe completed', ok: false });
  } finally {
    await browser.close();
  }
  const bad = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - bad}/${results.length} checks passed`);
  process.exit(bad ? 1 : 0);
})();
