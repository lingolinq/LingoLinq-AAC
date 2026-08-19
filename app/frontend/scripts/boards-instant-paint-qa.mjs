/**
 * Boards page: instant paint + in-section loading state.
 *
 * The page used to mount a full-viewport `.ll-premium-progress` overlay
 * ("Preparing your workspace") over everything — navbar included — until the Mine
 * list resolved. That overlay is gone; the page shell must paint immediately and
 * the BOARDS SECTION must carry its own loading message until the grid arrives.
 *
 *   1. the workspace overlay NEVER appears on this route
 *   2. the page shell (hero + boards section header) paints while boards load
 *   3. the in-section loading message is shown during that window
 *   4. the grid replaces it once the list resolves
 *
 * The Mine query is delayed by request interception so the loading window is
 * deterministic and observable. Per LEARNINGS.md ("Click-testing UI fixes"), a
 * probe that cannot observe its own window FAILS rather than passes: check 3
 * requires >= MIN_FRAMES sampled frames that actually caught the loading state.
 *
 * Usage:
 *   nvm use 22 && node scripts/boards-instant-paint-qa.mjs \
 *     --user marcus_williams_slp --pass 'demo2025!' [--headed]
 */
/* eslint-env node */
import { cliArgs, launch, login } from './qa-helpers.mjs';

const OPTS = cliArgs(process.argv);
const LIST_DELAY_MS = parseInt(OPTS.arg('--delay', '5000'), 10);
const MIN_FRAMES = 4;

const results = [];
const pass = (n, d) => { results.push({ n, ok: true }); console.log(`  PASS  ${n}\n        ${d}`); };
const fail = (n, d) => { results.push({ n, ok: false }); console.log(`  FAIL  ${n}\n        ${d}`); };

const SNAP = () => {
  const q = (s) => document.querySelector(s);
  const vis = (el) => !!(el && el.getClientRects().length > 0);
  return {
    overlay: vis(q('.ll-premium-progress')),
    hero: vis(q('.la-hero-title')),
    sectionHeader: vis(q('.ub-boards-page__boards-title')),
    loading: vis(q('.ub-boards-page__loading')),
    loadingText: (q('.ub-boards-page__loading-label') || {}).textContent || null,
    spinner: vis(q('.ub-boards-page__loading .md-loading-spinner')),
    // Real tile container is `.ub-boards-page__board-grid` (available-boards-section.hbs:374,697);
    // `.list-group` is the prior-home-boards variant of the same results branch.
    grid: (() => {
      const g = q('.ub-boards-page__board-grid') || q('.ub-boards-page__boards-body .list-group');
      return !!(g && g.children && g.children.length > 0);
    })(),
    bodyChildren: Array.from((q('.ub-boards-page__boards-body') || {}).children || [])
      .map((c) => c.className && String(c.className).split(' ')[0]).slice(0, 6)
  };
};

(async () => {
  const { browser, page } = await launch(OPTS);
  page.on('pageerror', (e) => console.log('  [pageerror] ' + e.message));
  try {
    console.log(`\nBASE ${OPTS.BASE}  USER ${OPTS.USER}`);
    await login(page, OPTS);

    // Hold the Mine-list query so the loading window is multi-second and certain.
    await page.setRequestInterception(true);
    let held = 0;
    page.on('request', (req) => {
      if (req.method() === 'GET' && /\/api\/v\d+\/boards\?/.test(req.url())) {
        held++;
        setTimeout(() => { try { req.continue(); } catch (e) { /* handled */ } }, LIST_DELAY_MS);
        return;
      }
      try { req.continue(); } catch (e) { /* handled */ }
    });

    // Clear the localStorage Mine snapshot, otherwise the page hydrates from cache
    // and there is no loading window to observe at all.
    await page.evaluate(() => {
      try {
        Object.keys(localStorage).filter((k) => /boards_page_list|mine_list/i.test(k))
          .forEach((k) => localStorage.removeItem(k));
      } catch (e) { /* nothing to clear */ }
    });

    const user = OPTS.USER;
    const nav = page.goto(`${OPTS.BASE}/${user}/boards`, { waitUntil: 'domcontentloaded' });

    // Sample the paint while the list is held.
    const frames = [];
    const t0 = Date.now();
    while (Date.now() - t0 < LIST_DELAY_MS + 1500) {
      frames.push(await page.evaluate(SNAP).catch(() => null));
      await new Promise((r) => setTimeout(r, 200));
    }
    await nav.catch(() => {});

    const seen = frames.filter(Boolean);
    const overlayFrames = seen.filter((f) => f.overlay).length;
    const shellFrames = seen.filter((f) => f.hero && f.sectionHeader).length;
    const loadingFrames = seen.filter((f) => f.loading).length;

    console.log(`   sampled ${seen.length} frames while the Mine query was held ${LIST_DELAY_MS}ms`);

    if (seen.length < MIN_FRAMES) {
      fail('0. probe observed its own window', `only ${seen.length} frames sampled — nothing below is trustworthy`);
    } else {
      pass('0. probe observed its own window', `${seen.length} frames sampled`);

      if (overlayFrames === 0) {
        pass('1. no full-viewport workspace overlay on the boards route',
          `.ll-premium-progress absent in all ${seen.length} sampled frames`);
      } else {
        fail('1. no full-viewport workspace overlay on the boards route',
          `.ll-premium-progress visible in ${overlayFrames}/${seen.length} frames`);
      }

      if (shellFrames >= MIN_FRAMES) {
        const firstShell = seen.findIndex((f) => f.hero && f.sectionHeader);
        pass('2. page shell paints while boards are still loading',
          `hero + boards-section header visible in ${shellFrames}/${seen.length} frames, ` +
          `first at sample #${firstShell + 1} (~${firstShell * 200}ms into the held window)`);
      } else {
        fail('2. page shell paints while boards are still loading',
          `hero+header visible in only ${shellFrames}/${seen.length} frames`);
      }

      const withText = seen.find((f) => f.loading && f.loadingText);
      if (loadingFrames >= MIN_FRAMES && withText) {
        pass('3. the boards SECTION carries the loading message',
          `.ub-boards-page__loading visible in ${loadingFrames}/${seen.length} frames, ` +
          `label "${withText.loadingText.trim()}", spinner=${withText.spinner}`);
      } else {
        fail('3. the boards SECTION carries the loading message',
          `visible in ${loadingFrames}/${seen.length} frames, sample-with-text=${!!withText}`);
      }
    }

    // 4. the grid eventually replaces the message
    const settled = await (async () => {
      const t = Date.now();
      for (;;) {
        const s = await page.evaluate(SNAP).catch(() => null);
        if (s && s.grid && !s.loading) { return s; }
        if (Date.now() - t > 60000) { return s; }
        await new Promise((r) => setTimeout(r, 250));
      }
    })();
    if (settled && settled.grid && !settled.loading) {
      pass('4. the grid replaces the loading message once the list resolves',
        `board tiles present, loading message gone, overlay=${settled.overlay}`);
    } else {
      fail('4. the grid replaces the loading message once the list resolves',
        `final state ${JSON.stringify(settled)}`);
    }
    console.log(`\n(held ${held} board-list request(s) for ${LIST_DELAY_MS}ms each)`);
  } catch (e) {
    fail('run', e.message);
  } finally {
    const bad = results.filter((r) => !r.ok);
    console.log('\n' + '='.repeat(72));
    console.log(`${results.length - bad.length} passed, ${bad.length} failed`);
    console.log('='.repeat(72) + '\n');
    await browser.close();
    process.exit(bad.length ? 1 : 0);
  }
})();
