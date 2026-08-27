/**
 * Board OPEN (first paint) profiler.
 *
 * WHY THIS EXISTS: every board-rendering measurement taken so far profiled
 * RE-RENDERS (a categorize toggle, a category reorder). Board open — the thing an
 * AAC user actually waits on — had never been profiled, so the ranked optimisation
 * list was built on inference. This measures it.
 *
 * Method, per docs/task-management/LEARNINGS.md:
 *   - CPU throttle via CDP (Emulation.setCPUThrottlingRate); desktop hides the cost.
 *   - Attribute by STUBBING (`--stub label_fit`), not by reading a flame chart. The
 *     profiler attributes a layout FLUSH to whichever read triggered it, which is what
 *     sent three of six label_fit attempts down the wrong path.
 *   - Navigate via service:router, NOT page.goto — goto is a full reload and would
 *     measure app boot instead of board open.
 *
 * Usage (run from app/frontend):
 *   node scripts/board-open-profile.mjs --user marcus_williams_slp --pass 'demo2025!' \
 *        --board vocal-flair-84 --cpu 6 --runs 3
 *   node scripts/board-open-profile.mjs ... --stub label_fit
 *
 * NOTE: OPTS.BASE / OPTS.USER are UPPERCASE in qa-helpers (a lowercase typo produces a
 * misleading waitForSelector timeout that looks like a broken component).
 *
 * REACHING THE ROUTER: `window.LingoLinq.__container__` does NOT exist on this app
 * (verified live — LingoLinq is the Application, and Ember 5 keeps no __container__ or
 * __deprecatedInstance__ on it). The working route is getOwner() on any live service;
 * `window.modal._getService()` is the one qa-helpers already relies on.
 */
/* eslint-env node */
import { cliArgs, launch, login } from './qa-helpers.mjs';

const OPTS = cliArgs(process.argv);
const BOARD = OPTS.arg('--board', null);
const CPU = parseFloat(OPTS.arg('--cpu', '6'));
const RUNS = parseInt(OPTS.arg('--runs', '3'), 10);
const STUB = OPTS.arg('--stub', null);
const IDLE_MS = 400; // no DOM mutation in the grid for this long == settled

/* Instrument the page: mutation-quiet detection + long-task capture.
   Installed fresh before each run so the counters are per-open. */
const INSTRUMENT = (idleMs) => {
  window.__bop = { t0: performance.now(), last: performance.now(), longtasks: [], mutations: 0 };
  const bop = window.__bop;
  bop.kinds = { childList: 0, attributes: 0, characterData: 0 };
  bop.addedNodes = 0;
  bop.tFirstCell = 0;   // first grid cell in the DOM -> route + model + ordered_buttons done
  bop.tAllCells = 0;    // cell count stopped growing -> grid construction done
  bop.peakCells = 0;
  bop.tailInGrid = 0; bop.tailOutGrid = 0; bop.tailTargets = {};
  bop.mo = new MutationObserver((recs) => {
    bop.mutations += recs.length;
    for (const r of recs) {
      bop.kinds[r.type] = (bop.kinds[r.type] || 0) + 1;
      if (r.addedNodes) { bop.addedNodes += r.addedNodes.length; }
    }
    const grid = document.querySelector('.md-board-detail-main .md-board-detail-grid');
    const cells = grid ? grid.querySelectorAll('.md-board-detail-grid__cell').length : 0;
    if (cells > 0 && !bop.tFirstCell) { bop.tFirstCell = performance.now(); }
    if (cells > bop.peakCells) { bop.peakCells = cells; bop.tAllCells = performance.now(); }
    /* Attribute the TAIL: once the grid exists, record which elements are still
       mutating and whether they are inside the grid. Without this the whole-page
       observer cannot tell "the grid is slow" from "the sentence bar is slow". */
    if (bop.tAllCells) {
      for (const r of recs) {
        const t = r.target;
        const el = (t && t.nodeType === 1) ? t : (t && t.parentElement);
        if (!el) { continue; }
        const inGrid = !!(grid && grid.contains(el));
        bop.tailInGrid += inGrid ? 1 : 0;
        bop.tailOutGrid += inGrid ? 0 : 1;
        const cls = (el.getAttribute && el.getAttribute('class')) || '';
        const name = (el.tagName || '?').toLowerCase() + '.' + (cls.split(/\s+/)[0] || '(none)');
        bop.tailTargets[name] = (bop.tailTargets[name] || 0) + 1;
      }
    }
    bop.last = performance.now();
  });
  bop.mo.observe(document.body, { childList: true, subtree: true, attributes: true });
  try {
    bop.po = new PerformanceObserver((l) => {
      for (const e of l.getEntries()) { bop.longtasks.push(Math.round(e.duration)); }
    });
    bop.po.observe({ entryTypes: ['longtask'] });
  } catch (e) { /* longtask unsupported — durations just come back empty */ }
  bop.settled = () => {
    const grid = document.querySelector('.md-board-detail-main .md-board-detail-grid');
    const cells = grid ? grid.querySelectorAll('.md-board-detail-grid__cell').length : 0;
    return cells > 0 && (performance.now() - bop.last) > idleMs;
  };
};

/* Installed once, then reused by every transition in the run. */
const OWNER_SETUP = () => {
  const { getOwner } = window.require('@ember/application');
  const owner = getOwner(window.modal._getService());
  if (!owner) { throw new Error('could not reach the Ember owner'); }
  window.__owner = owner;
  return true;
};

const stubLabelFit = () => {
  /* The app's AMD loader is the only way in from a plain node script.
     CORRECTED 2026-08-26: this used to say "testem cannot launch in this environment
     (vendored execa is ESM while testem require()s it)". That is FALSE, and CLAUDE.md
     rule 10 documents it as such — the `require() of ES Module .../execa` error is the
     symptom of running on the WRONG NODE, not of a broken toolchain. The suite needs
     Node 22; `nvm use 22 && ./node_modules/.bin/ember test` runs it fine. Leaving the
     old claim here re-seeds exactly the wrong conclusion, which rule 10 says was already
     rediscovered the hard way once. */
  const m = window.require('frontend/utils/label_fit').default;
  if (!m.__orig_apply) { m.__orig_apply = m.apply; }
  m.apply = function () {};
  return true;
};

const run = async () => {
  if (!BOARD) { throw new Error('--board is required (e.g. --board vocal-flair-84)'); }
  const { browser, page } = await launch(OPTS);
  const client = await page.target().createCDPSession();
  const results = [];
  try {
    await login(page, OPTS);
    const u = OPTS.USER;

    // Warm once: prime persistence, image URLs and the ordered_buttons cache, so we
    // measure a STEADY-STATE open rather than a cold-cache one. Cold is a separate
    // question and is reported by --runs 1 on a fresh profile.
    await page.goto(`${OPTS.BASE}/${u}/board-detail/${BOARD}`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.md-board-detail-grid__cell', { timeout: 45000 });
    await new Promise((r) => setTimeout(r, 2500));
    await page.evaluate(OWNER_SETUP);

    if (STUB === 'label_fit') {
      const ok = await page.evaluate(stubLabelFit);
      console.log(`   stub: label_fit.apply -> no-op (${ok})`);
    }

    await client.send('Emulation.setCPUThrottlingRate', { rate: CPU });
    console.log(`   cpu throttle: ${CPU}x   runs: ${RUNS}   board: ${BOARD}`);

    for (let i = 0; i < RUNS; i++) {
      // Leave the board, then come back — an in-app transition both ways.
      await page.evaluate(async (user) => {
        const r = window.__owner.lookup('service:router');
        try { await r.transitionTo(`/${user}/boards`); } catch (e) { /* TransitionAborted is normal */ }
      }, u);
      await new Promise((r) => setTimeout(r, 1200));

      await page.evaluate(INSTRUMENT, IDLE_MS);
      await page.evaluate(async (user, board) => {
        const r = window.__owner.lookup('service:router');
        try { await r.transitionTo(`/${user}/board-detail/${board}`); } catch (e) { /* ditto */ }
      }, u, BOARD);

      await page.waitForFunction(() => window.__bop && window.__bop.settled(), { timeout: 120000, polling: 50 });
      const m = await page.evaluate((idleMs) => {
        const b = window.__bop;
        b.mo.disconnect();
        if (b.po) { b.po.disconnect(); }
        const grid = document.querySelector('.md-board-detail-main .md-board-detail-grid');
        return {
          ms: Math.round(b.last - b.t0),              // t0 -> last DOM mutation
          toFirstCell: b.tFirstCell ? Math.round(b.tFirstCell - b.t0) : -1,
          toAllCells: b.tAllCells ? Math.round(b.tAllCells - b.t0) : -1,
          tail: (b.tAllCells ? Math.round(b.last - b.tAllCells) : -1),
          settle: Math.round((b.last - b.t0) + idleMs),
          mutations: b.mutations,
          addedNodes: b.addedNodes,
          kinds: b.kinds,
          tailInGrid: b.tailInGrid,
          tailOutGrid: b.tailOutGrid,
          tailTop: Object.entries(b.tailTargets).sort((x, y) => y[1] - x[1]).slice(0, 8),
          cells: grid ? grid.querySelectorAll('.md-board-detail-grid__cell').length : 0,
          imgs: grid ? grid.querySelectorAll('img.symbol').length : 0,
          longtasks: b.longtasks,
          longest: b.longtasks.length ? Math.max(...b.longtasks) : 0,
          blocked: b.longtasks.reduce((a, x) => a + x, 0)
        };
      }, IDLE_MS);
      results.push(m);
      console.log(`   run ${i + 1}: ${m.ms}ms total | first cell ${m.toFirstCell}ms, all ${m.cells} cells ${m.toAllCells}ms, tail ${m.tail}ms | ` +
                  `mut ${m.mutations} (child ${m.kinds.childList}/attr ${m.kinds.attributes}), +${m.addedNodes} nodes | ` +
                  `blocked ${m.blocked}ms, longest ${m.longest}ms`);
    }

    const med = (xs) => xs.slice().sort((a, b) => a - b)[Math.floor(xs.length / 2)];
    console.log('\n   ---- median over ' + RUNS + ' runs ----');
    console.log('   open -> settled : ' + med(results.map((r) => r.ms)) + 'ms');
    console.log('   main thread blocked: ' + med(results.map((r) => r.blocked)) + 'ms');
    console.log('   longest single task: ' + med(results.map((r) => r.longest)) + 'ms');
    console.log('   -> first cell      : ' + med(results.map((r) => r.toFirstCell)) + 'ms   (route + model + ordered_buttons)');
    console.log('   -> all cells built : ' + med(results.map((r) => r.toAllCells)) + 'ms   (grid DOM construction)');
    console.log('   -> tail after cells: ' + med(results.map((r) => r.tail)) + 'ms   (label fit, images, settle)');
    console.log('   DOM mutations      : ' + med(results.map((r) => r.mutations)) + '  (+' + med(results.map((r) => r.addedNodes)) + ' nodes added)');
    console.log('   cells / imgs       : ' + results[0].cells + ' / ' + results[0].imgs);
    const last = results[results.length - 1];
    console.log('   tail mutations     : ' + last.tailInGrid + ' inside grid / ' + last.tailOutGrid + ' outside');
    console.log('   tail top targets   :');
    for (const [name, n] of last.tailTop) { console.log('       ' + String(n).padStart(5) + '  ' + name); }
  } finally {
    await client.send('Emulation.setCPUThrottlingRate', { rate: 1 }).catch(() => {});
    await browser.close();
  }
};

run().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
