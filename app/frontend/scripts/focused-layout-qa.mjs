/**
 * Focused View layout probe — measures, per page, WHERE the pill-nav actually
 * lands and WHAT the workspace/shell backgrounds actually are.
 *
 * Static reading of the SCSS says the dashboard and the caseload should both put
 * the pill-nav 16 + 32 + 48 = 96px below the topbar, yet they visibly differ. This
 * script exists so that gets settled by measurement instead of by inference — it
 * reports the resolved box offsets and the computed paint for each route.
 *
 * PUPPETEER, not Playwright: `puppeteer ^24.42.0` is what this repo commits.
 * Reuses scripts/qa-helpers.mjs for login (the /login/device interstitial is subtle).
 *
 *   nvm use 22 && node scripts/focused-layout-qa.mjs [--user example --pass password]
 */
/* eslint-env node */
import { cliArgs, launch, login } from './qa-helpers.mjs';

const opts = cliArgs(process.argv);

// Focused View is driven by the SAVED preference, not by a URL flag: app-state's
// `sync_layout_scope` observer mirrors `preferences.dashboard_layout` onto <body>.
// Setting the preference (rather than hand-adding the body class) is what also gets
// the dashboard component to emit `.md-shell--layout-focused`, which half the
// focused rules key off — a faked body class would measure a layout nobody sees.
async function forceFocused(page) {
  return page.evaluate(() => {
    if (!window.appState) { return 'window.appState missing'; }
    try {
      window.appState.set('sessionUser.preferences.dashboard_layout', 'focused');
      if (window.LingoLinq && window.LingoLinq.set_layout_scope) {
        window.LingoLinq.set_layout_scope('focused');
      }
      return true;
    } catch (e) { return 'threw: ' + e.message; }
  });
}

function probe() {
  const px = (v) => Math.round(parseFloat(v) || 0);
  const nav = document.querySelector('.md-pillnav');
  const shell = document.querySelector('.md-shell');
  const ws = document.querySelector('.md-workspace');
  const content = document.querySelector('#content');
  const topbar = document.querySelector('.app-navbar, .navbar-fixed-top, header');

  const box = (el) => {
    if (!el) { return null; }
    const r = el.getBoundingClientRect();
    return { top: Math.round(r.top + window.scrollY), height: Math.round(r.height) };
  };
  // FULL string, never truncated. An earlier version cut this to 120 chars, which hid
  // any difference past the first gradient — the shell mesh is six stacked gradients,
  // so a truncated compare can report "identical" for two genuinely different surfaces.
  const paint = (el) => {
    if (!el) { return null; }
    const c = getComputedStyle(el);
    return {
      bgColor: c.backgroundColor,
      bgImage: c.backgroundImage || 'none',
      backdrop: c.backdropFilter || c.webkitBackdropFilter || 'none'
    };
  };
  const boxOf = (el) => {
    if (!el) { return null; }
    const c = getComputedStyle(el);
    return { marginTop: px(c.marginTop), paddingTop: px(c.paddingTop) };
  };

  return {
    url: location.pathname,
    focusedBody: document.body.classList.contains('ll-layout-focused'),
    shellClasses: shell ? shell.className.split(/\s+/).filter((x) => /^md-shell/.test(x)).join(' ') : null,
    contentClasses: content ? content.className : null,
    topbarHeight: getComputedStyle(document.documentElement).getPropertyValue('--topbar-height').trim(),
    topbarBottom: topbar ? Math.round(topbar.getBoundingClientRect().bottom) : null,
    pillnavTop: box(nav) ? box(nav).top : null,
    contentPadTop: boxOf(content) ? boxOf(content).paddingTop : null,
    shellPadTop: boxOf(shell) ? boxOf(shell).paddingTop : null,
    wsBox: boxOf(ws),
    pillBox: boxOf(nav),
    workspacePaint: paint(ws),
    shellPaint: paint(shell),
    contentPaint: paint(content),
    bodyPaint: paint(document.body),
    // The visible inner panel differs per page: Extras and Boards each wrap their
    // content in a frosted card, Reports deliberately clears its one.
    panel: (() => {
      const sel = ['.md-extras-page', '.ub-boards-page__boards-section', '.md-stats-main',
        '.md-caseload', '.md-grid--dashboard'];
      for (const s of sel) {
        const el = document.querySelector(s);
        if (el) { return { sel: s, ...paint(el) }; }
      }
      return null;
    })()
  };
}

// Widths chosen around the breakpoints these rules actually use (1024 for the
// reports/boards workspace, 820 for the shell/workspace flex switch, 640 for the
// pill-nav dropdown, 375 for the tight focused padding).
const WIDTHS = [1440, 1280, 1100, 1024, 1000, 900, 820, 700, 640, 600, 500, 375];

const ROUTES = [
  ['dashboard (baseline)', '/'],
  ['caseload', '/caseload'],
  ['boards', '/{u}/boards'],
  ['reports', '/{u}/stats'],
  ['extras', '/{u}/extras']
];

(async () => {
  const { browser, page } = await launch(opts);
  const results = [];
  try {
    await login(page, opts);
    await forceFocused(page);
    await new Promise((r) => setTimeout(r, 1200));

    for (const [name, tpl] of ROUTES) {
      const path = tpl.replace('{u}', opts.USER);
      try {
        await page.setViewport({ width: WIDTHS[0], height: 900 });
        await page.goto(opts.BASE + path, { waitUntil: 'networkidle2', timeout: 45000 });
        // Re-assert per navigation: a full page load re-boots the app, and the
        // preference write above lives only in the previous document.
        await forceFocused(page);
        await page.waitForSelector('.md-shell', { timeout: 15000 }).catch(() => {});
        await new Promise((r) => setTimeout(r, 1500));
        // Sweep widths WITHOUT reloading: the offsets in question are pure CSS, and
        // a reload per width would cost five minutes for the same answer.
        const byWidth = {};
        for (const w of WIDTHS) {
          await page.setViewport({ width: w, height: 900 });
          await new Promise((r) => setTimeout(r, 350));
          const m = await page.evaluate(probe);
          byWidth[w] = m.pillnavTop == null || m.topbarBottom == null
            ? null : m.pillnavTop - m.topbarBottom;
        }
        results.push({ name, ...(await page.evaluate(probe)), byWidth });
      } catch (e) {
        results.push({ name, error: e.message });
      }
    }
  } finally {
    await browser.close();
  }

  for (const r of results) {
    console.log('\n=== ' + r.name + ' ===');
    if (r.error) { console.log('  ERROR: ' + r.error); continue; }
    console.log('  url             ', r.url, '| focused body:', r.focusedBody);
    console.log('  shell classes   ', r.shellClasses);
    console.log('  #content classes', r.contentClasses);
    console.log('  --topbar-height ', r.topbarHeight, '| topbar bottom:', r.topbarBottom);
    console.log('  #content padTop ', r.contentPadTop, '| shell padTop:', r.shellPadTop);
    console.log('  workspace       ', JSON.stringify(r.wsBox), '| pillnav:', JSON.stringify(r.pillBox));
    console.log('  PILLNAV TOP     ', r.pillnavTop,
      r.topbarBottom != null && r.pillnavTop != null ? '(gap below topbar: ' + (r.pillnavTop - r.topbarBottom) + 'px)' : '');
    console.log('  workspace paint ', JSON.stringify(r.workspacePaint));
    console.log('  panel           ', JSON.stringify(r.panel));
  }

  // Equality matrix against the dashboard, on the FULL computed paint strings.
  const base = results[0];
  if (base && !base.error) {
    console.log('\n\n=== PAGE BACKGROUND vs dashboard (full computed strings) ===');
    const layers = ['bodyPaint', 'contentPaint', 'shellPaint', 'workspacePaint'];
    console.log('page'.padEnd(22) + layers.map((l) => l.replace('Paint', '').padStart(12)).join(''));
    for (const r of results) {
      if (r.error) { continue; }
      console.log(r.name.padEnd(22) + layers.map((l) => {
        const a = JSON.stringify(base[l]), b = JSON.stringify(r[l]);
        return (a === b ? 'same' : 'DIFFERENT').padStart(12);
      }).join(''));
    }
    for (const r of results) {
      if (r.error || r === base) { continue; }
      for (const l of layers) {
        if (JSON.stringify(base[l]) !== JSON.stringify(r[l])) {
          console.log('\n--- ' + r.name + ' :: ' + l + ' ---');
          console.log('  dashboard: ' + JSON.stringify(base[l]));
          console.log('  ' + r.name + ': ' + JSON.stringify(r[l]));
        }
      }
    }
  }

  // The comparison that matters: gap below the topbar, per width, per page. The
  // dashboard row is the baseline; anything that differs from it is the defect.
  const ok = results.filter((r) => r.byWidth);
  if (ok.length) {
    console.log('\n\n=== PILL-NAV GAP BELOW TOPBAR (px), by viewport width ===');
    console.log('page'.padEnd(22) + WIDTHS.map((w) => String(w).padStart(6)).join(''));
    const base = ok[0].byWidth;
    for (const r of ok) {
      console.log(r.name.padEnd(22) + WIDTHS.map((w) => String(r.byWidth[w] ?? '-').padStart(6)).join(''));
    }
    console.log('\n=== DELTA vs dashboard baseline (0 = aligned) ===');
    console.log('page'.padEnd(22) + WIDTHS.map((w) => String(w).padStart(6)).join(''));
    for (const r of ok.slice(1)) {
      console.log(r.name.padEnd(22) + WIDTHS.map((w) => {
        /* A MISSING measurement is not a zero delta. `byWidth[w]` is set to `null` whenever the
       pill-nav or topbar was not found, and `?? 0` turned that into 0 — printing "." for
       "aligned" on a route where the nav had VANISHED. WIDTHS includes 375/500/600, exactly
       the range where pillnav-narrow-qa.mjs exists because the nav disappears. The table one
       row up already prints "-" for the same cell (`?? '-'`), so the two disagreed. */
    const missing = r.byWidth[w] == null || base[w] == null;
    const d = missing ? null : r.byWidth[w] - base[w];
        if (missing) { return String('-').padStart(6); }   // not measured, NOT "aligned"
        return String(d === 0 ? '.' : (d > 0 ? '+' + d : d)).padStart(6);
      }).join(''));
    }
  }
})();
