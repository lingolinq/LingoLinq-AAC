/**
 * Board-detail FLASH diagnostic — Unit 0 of
 * docs/task-management/2026-09-11-board-detail-flash-and-cold-load.md
 *
 * WHY THIS EXISTS: the proposed fixes for the board-detail "flash" rest on an
 * UNMEASURED premise — that a render happens between
 * `routes/user/board-detail.js:334` (`ordered_buttons = null`) and `:525`
 * (`_finalize_board_display` writes the real grid).
 *
 * Adversarial review (F4) showed that premise is usually FALSE:
 * `_maybe_prime_caches` returns a bare `RSVP.resolve()` when `persistence.primed`
 * is true (routes/user/board-detail.js:26-30), and `persistence` sets `primed`
 * true on its first attempt INCLUDING the failure branch (utils/persistence.js:1343).
 * Ember drains RSVP `.then` on the `actions` queue, which flushes BEFORE `render` —
 * so on a primed navigation the grid is built in the same runloop turn and there is
 * no empty frame at all.
 *
 * This measures which case actually occurs, so a fix is aimed at a frame that exists.
 *
 * METHOD, per docs/task-management/LEARNINGS.md:
 *   - Navigate via service:router, NOT page.goto — goto is a full reload and would
 *     measure app boot instead of board open. (Same reason board-open-profile.mjs
 *     does it; reaching the router via modal._getService() is the documented seam,
 *     because window.LingoLinq.__container__ does NOT exist on this app.)
 *   - The FIRST board of a session is the cold case (persistence.primed false); every
 *     later one is warm. Both are measured, in that order, in one session.
 *   - CPU throttling via CDP, because desktop hides the cost.
 *
 * Usage (run from app/frontend):
 *   node scripts/board-flash-diag-qa.mjs \
 *     --user aiden_parker --pass 'demo2025!' \
 *     --board vocal-flair-112 --board2 sequoia-15 --cpu 6
 */
/* eslint-env node */
import { cliArgs, launch, login } from './qa-helpers.mjs';

const OPTS = cliArgs(process.argv);
const BOARD = OPTS.arg('--board', 'vocal-flair-112');
const BOARD2 = OPTS.arg('--board2', 'sequoia-15');
const CPU = parseFloat(OPTS.arg('--cpu', '6'));

/* Per-frame sampler. rAF rather than MutationObserver: we need to know what was
   actually PAINTED, and a mutation that is coalesced away in the same turn never
   reaches a frame. A frame with the grid present and zero cells is the disputed
   state; if it never appears, the empty-grid mechanism did not fire. */
const SAMPLER = () => {
  window.__flash = { frames: [], t0: performance.now(), stopped: false };
  const f = window.__flash;
  const tick = () => {
    if (f.stopped) { return; }
    const grid = document.querySelector('.md-board-detail-grid');
    const shell = document.querySelector('.md-shell--board-detail');
    const loadingCard = document.querySelector('.ll-premium-progress');
    let cols = null, cells = 0, emptyMsg = false, faded = false;
    if (grid) {
      cells = grid.querySelectorAll('.md-board-detail-grid__cell').length;
      cols = getComputedStyle(grid).getPropertyValue('--board-columns').trim();
      emptyMsg = !!document.querySelector('.md-board-detail-grid__empty');
      const fade = document.querySelector('.md-board-detail-grid-fade');
      faded = !!(fade && fade.classList.contains('md-board-detail-grid-fade--loading'));
    }
    f.frames.push({
      t: Math.round(performance.now() - f.t0),
      shell: !!shell,
      loadingCard: !!loadingCard,
      grid: !!grid,
      cells: cells,
      cols: cols,
      emptyMsg: emptyMsg,
      faded: faded
    });
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
};

/* Drive the transition through the app's own router. Returns once the route has
   settled; the sampler keeps running independently so the interval is captured
   even though this resolves early. */
const GO = (key) => {
  return new Promise((resolve, reject) => {
    try {
      /* getOwner() on a live service is the documented way in; modal._getService()
         is the seam qa-helpers already relies on. Resolved through the AMD registry
         rather than a global: this body is stringified into the page, so it cannot
         `import`, and reading getOwner off a global trips ember/new-module-imports. */
      const svc = window.modal._getService();
      const getOwner = window.require('@ember/application').getOwner;
      const router = getOwner(svc).lookup('service:router');
      router.transitionTo('user.board-detail', key.split('/')[0], key.split('/')[1])
        .then(() => resolve('settled'), (e) => resolve('rejected:' + (e && e.message)));
    } catch (e) { reject(e); }
  });
};

function summarise(label, frames, log) {
  const withGrid = frames.filter((f) => f.grid);
  const emptyFrames = withGrid.filter((f) => f.cells === 0);
  const fallbackGeom = withGrid.filter((f) => f.cols === '4' || f.cols === '');
  const falseEmptyMsg = frames.filter((f) => f.emptyMsg);
  const loadingCard = frames.filter((f) => f.loadingCard);
  const firstReal = withGrid.find((f) => f.cells > 0);

  const primeStart = log.find((e) => e.label === 'setup:prime_start');
  const primeDone = log.find((e) => e.label === 'setup:prime_done');
  const gridBuilt = log.find((e) => e.label === 'setup:grid_built');
  const cacheHit = log.find((e) => e.label === 'model:cache_hit');
  const cacheMiss = log.find((e) => e.label === 'model:cache_miss');

  console.log('\n──────── ' + label + ' ────────');
  console.log('  model path        :', cacheHit ? 'CACHE HIT' : (cacheMiss ? 'CACHE MISS (network)' : '(no mark)'));
  console.log('  primed_already    :', primeStart ? JSON.stringify(primeStart.detail && primeStart.detail.primed_already) : '(no mark)');
  console.log('  prime_done ms     :', primeDone ? (primeDone.detail && primeDone.detail.ms) : '(no mark)');
  console.log('  grid_built ms     :', gridBuilt ? (gridBuilt.detail && gridBuilt.detail.ms) : '(no mark)');
  console.log('  frames sampled    :', frames.length);
  console.log('  frames w/ grid    :', withGrid.length);
  console.log('  EMPTY-GRID FRAMES :', emptyFrames.length,
    emptyFrames.length ? '  <-- the disputed state DID paint' : '  <-- never painted');
  if (emptyFrames.length) {
    console.log('     window         :', emptyFrames[0].t + 'ms .. ' + emptyFrames[emptyFrames.length - 1].t + 'ms');
    console.log('     geometry       :', JSON.stringify(fallbackGeom.length ? '4x3 fallback in ' + fallbackGeom.length + ' frames' : 'real geometry throughout'));
  }
  console.log('  "No symbols" msg  :', falseEmptyMsg.length ? falseEmptyMsg.length + ' frames  <-- FALSE STATEMENT SHOWN' : 'never');
  console.log('  loading card      :', loadingCard.length ? loadingCard.length + ' frames' : 'never (warm)');
  console.log('  first real cells  :', firstReal ? firstReal.t + 'ms (' + firstReal.cells + ' cells, cols=' + firstReal.cols + ')' : 'never');

  /* STATE TIMELINE. Without this a "0 empty frames" result is unfalsifiable: it reads the
     same whether the state never painted or the selector never matched. Collapse each frame
     to a state string and print the transitions with their durations. */
  const state = (f) => (f.loadingCard ? 'loading-card'
    : !f.shell ? 'no-board-shell'
      : !f.grid ? 'shell-no-grid'
        : f.cells === 0 ? 'GRID-EMPTY(' + f.cols + ')'
          : 'grid-' + f.cells + 'cells(' + f.cols + ')');
  const tl = [];
  frames.forEach((f) => {
    const s = state(f);
    if (!tl.length || tl[tl.length - 1].s !== s) { tl.push({ s: s, from: f.t, to: f.t }); }
    else { tl[tl.length - 1].to = f.t; }
  });
  console.log('  timeline          :');
  tl.forEach((seg) => console.log('     ' + String(seg.from).padStart(5) + '..' + String(seg.to).padStart(5) + 'ms  ' + seg.s));
  return { emptyFrames: emptyFrames.length, primed: primeStart && primeStart.detail && primeStart.detail.primed_already };
}

(async () => {
  const { browser, page } = await launch(OPTS);
  const client = await page.target().createCDPSession();
  await client.send('Emulation.setCPUThrottlingRate', { rate: CPU });

  /* Enable the in-app diagnostic BEFORE the app boots — board_cache_diag.js#enabled()
     reads localStorage at call time, and the earliest marks fire during model(). */
  await page.evaluateOnNewDocument(() => {
    try { window.localStorage.setItem('ll_board_cache_diag', '1'); } catch (e) { /* private mode */ }
  });

  await login(page, OPTS);
  console.log('logged in as', OPTS.USER, '— CPU throttle', CPU + 'x');

  const user = OPTS.USER;
  const runs = [];
  for (const [label, key] of [['RUN 1 — COLD (first board of session)', user + '/' + BOARD],
                              ['RUN 2 — WARM (second board, prime already done)', user + '/' + BOARD2]]) {
    await page.evaluate(() => { try { window.__LL_BOARD_CACHE_LOG = []; } catch (e) { /* ignore */ } });
    await page.evaluate(SAMPLER);
    const outcome = await page.evaluate(GO, key);
    await new Promise((r) => setTimeout(r, 4000));
    const frames = await page.evaluate(() => { window.__flash.stopped = true; return window.__flash.frames; });
    const log = await page.evaluate(() => window.__LL_BOARD_CACHE_LOG || []);
    console.log('\n[' + key + '] transition:', outcome);
    runs.push(summarise(label, frames, log));
  }

  console.log('\n════════ VERDICT ════════');
  const [cold, warm] = runs;
  if (cold.emptyFrames > 0 && warm.emptyFrames === 0) {
    console.log('  Matches review finding F4: the empty-grid frame is COLD-PATH ONLY.');
    console.log('  A geometry fix is aimed at a real frame, but only the first board of a session.');
  } else if (cold.emptyFrames === 0 && warm.emptyFrames === 0) {
    console.log('  NO empty-grid frame painted on either path.');
    console.log('  The diagnosed mechanism did NOT fire — do not fix this frame. Re-diagnose.');
  } else {
    console.log('  Empty frames on BOTH paths — the mechanism is not gated on prime as F4 predicted.');
  }
  await browser.close();
})().catch((e) => { console.error('PROBE FAILED:', e); process.exit(1); });
