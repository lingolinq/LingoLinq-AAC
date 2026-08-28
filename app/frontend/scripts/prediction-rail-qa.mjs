/**
 * Word-prediction rail: geometry + loading-state measurement probe.
 *
 * Covers the six behaviours from 2026-08-28-prediction-rail-alignment-and-width-stability.md,
 * none of which any unit test can reach — they are all questions about the RENDERED box or
 * about timing:
 *
 *   1  rail tiles line up with the board buttons beside them, in EVERY folder setting
 *   2  the rail holds its width in every state (the deployment flicker: the rail used to
 *      unmount between lookups and the board buttons stretched, then snapped back)
 *   3  the loading cue is delayed (~400ms) and never appears for a fast lookup
 *   4  stale tiles stay LIVE while a lookup runs (never disabled / pointer-events:none)
 *   5  a new prediction set is HELD while the panel is the live scan/dwell target
 *   6  the rail is reachable by scanning (it is a sibling of #speak, so it needs its own row)
 *
 * Checks 1, 2 and 4 are black-box measurements of the real render. Checks 3, 5 and 6 drive
 * controller / scanner state directly, because the timing windows they test cannot be
 * produced reliably from the outside — a fast local lookup never sits in the loading state
 * long enough to observe, and there is no way to hold a dwell from Puppeteer.
 *
 * PUPPETEER, not Playwright: `puppeteer ^24.42.0` is what this repo commits.
 *
 * Requires the app running (ember 8184 -> rails 5000) and an account whose home board has
 * FOLDERS — the per-folder-setting cell reserve is the thing check 1 exists to catch, and a
 * folder-less board cannot exercise it. The probe says so rather than quietly passing.
 *
 * Usage:
 *   node scripts/prediction-rail-qa.mjs --user example --pass password
 *   node scripts/prediction-rail-qa.mjs --user marcus_williams_slp --pass 'demo2025!' --headed
 *   node scripts/prediction-rail-qa.mjs --user u --pass p --board <key-with-folders>
 *   node scripts/prediction-rail-qa.mjs --user u --pass p --throttle "Slow 3G" --cpu 6
 *   ... --throttle off       (skip the throttled phase)
 */
/* eslint-env node */
import { cliArgs, launch, login } from './qa-helpers.mjs';
import { PredefinedNetworkConditions } from 'puppeteer';

const OPTS = cliArgs(process.argv);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const pass = (n, d) => { results.push({ n, ok: true }); console.log(`  PASS  ${n}\n        ${d}`); };
const fail = (n, d) => { results.push({ n, ok: false }); console.log(`  FAIL  ${n}\n        ${d}`); };
const info = (d) => console.log(`        ${d}`);

/* 2px: the controller publishes ROUNDED px vars, and the browser resolves the grid's
   fractional row heights independently, so a sub-pixel disagreement is expected and is not
   what this probe is looking for. A folder-tab reserve is 14% of the cell — tens of px. */
const TOL = 2;

/* A FOLDER cell is a link, not a word — clicking one navigates into the sub-board, leaves the
   sentence empty and no lookup ever runs (which on a folder board is the FIRST cell, so this is
   not an edge case). Every click in this probe must target a plain word button. */
const WORD_CARD = '.md-board-detail-grid__cell:not(.md-board-detail-grid__cell--empty)' +
  ':not(.md-board-detail-grid__cell--folder) .md-board-detail-symbol-card';
const RAIL = '.md-board-detail-prediction-rail';
const TILE = '.md-board-detail-sentence-bar__prediction';

/* ---- in-page measurements ------------------------------------------------------- */

/* Pair each rail tile with the board card in the SAME row band. The grid is row-major, so
   row i starts at cell i*columns; empty cells carry no card, so scan the row for the first
   one that does. Returns per-row deltas of the card box vs the tile box. */
const MEASURE_ALIGNMENT = () => {
  const grid = document.querySelector('.md-board-detail-grid');
  const rail = document.querySelector('.md-board-detail-prediction-rail');
  if (!grid || !rail) { return { ok: false, why: !grid ? 'no grid' : 'no rail' }; }
  const railVisible = rail.offsetParent !== null || rail.offsetWidth > 0 || rail.offsetHeight > 0;
  if (!railVisible) { return { ok: false, why: 'rail is display:none at this width' }; }

  const cs = getComputedStyle(grid);
  const cols = parseInt(cs.getPropertyValue('--board-columns'), 10) ||
    cs.gridTemplateColumns.split(' ').length;
  const cells = Array.from(grid.querySelectorAll('.md-board-detail-grid__cell'));
  const tiles = Array.from(rail.querySelectorAll('.md-board-detail-sentence-bar__prediction'));
  if (!tiles.length) { return { ok: false, why: 'rail holds no tiles — no predictions to measure' }; }

  const cardInRow = (row) => {
    for (let c = 0; c < cols; c++) {
      const cell = cells[row * cols + c];
      if (!cell) { continue; }
      const card = cell.querySelector('.md-board-detail-symbol-card');
      if (card) { return card; }
    }
    return null;
  };

  const rows = tiles.map((tile, i) => {
    const card = cardInRow(i);
    if (!card) { return { row: i, paired: false }; }
    const t = tile.getBoundingClientRect();
    const c = card.getBoundingClientRect();
    return {
      row: i,
      paired: true,
      dTop: Math.round(t.top - c.top),
      dHeight: Math.round(t.height - c.height),
      dWidth: Math.round(t.width - c.width),
      tileTop: Math.round(t.top),
      cardTop: Math.round(c.top)
    };
  });

  return {
    ok: true,
    tiles: tiles.length,
    hasFolders: grid.classList.contains('md-board-detail-grid--has-folders'),
    tabLabels: grid.classList.contains('md-board-detail-grid--folder-tab-labels'),
    coloredCorner: grid.classList.contains('md-board-detail-grid--folder-colored-corner'),
    cellMin: getComputedStyle(grid).getPropertyValue('--bd-cell-min').trim(),
    rows: rows.filter((r) => r.paired)
  };
};

/* Are the tiles actually operable while a lookup runs? A dimmed-but-dead target is the
   failure mode this guards — worse for a dwell user than a stale word. */
const MEASURE_LIVENESS = () => {
  const tiles = Array.from(document.querySelectorAll('.md-board-detail-prediction-rail .md-board-detail-sentence-bar__prediction'));
  return tiles.map((t) => {
    const cs = getComputedStyle(t);
    return { disabled: !!t.disabled, pointerEvents: cs.pointerEvents, opacity: cs.opacity };
  });
};

/* Sample the first board card's width every frame. The rail is a flex-shrink:0 sibling of
   the flex:1 grid, so if it ever leaves the DOM the cards immediately widen — a spread
   between min and max IS the bug, no matter what caused the reflow. */
const START_SAMPLER = () => {
  const card = document.querySelector('.md-board-detail-symbol-card');
  if (!card) { return false; }
  const ctrl = window.editManager && window.editManager.controller;
  window.__railProbe = {
    min: Infinity, max: -Infinity, samples: 0, railGone: 0,
    cueSeen: false, loadingMs: 0, maxLoadingRun: 0, _run: 0,
    _last: performance.now(), stop: false
  };
  const tick = () => {
    const p = window.__railProbe;
    if (p.stop) { return; }
    const now = performance.now();
    const dt = now - p._last;
    p._last = now;
    const c = document.querySelector('.md-board-detail-symbol-card');
    if (c) {
      const w = c.getBoundingClientRect().width;
      p.min = Math.min(p.min, w);
      p.max = Math.max(p.max, w);
      p.samples++;
    }
    if (!document.querySelector('.md-board-detail-prediction-rail')) { p.railGone++; }
    if (document.querySelector('.md-board-detail-prediction-rail--is-loading, .md-board-detail-sentence-bar__prediction-group--is-loading')) { p.cueSeen = true; }
    /* Time actually spent in the loading state, so the report can say whether the
       throttle really produced a slow lookup instead of assuming it did. */
    let loading = false;
    try { loading = !!(ctrl && ctrl.get('suggestions.loading')); } catch (e) { loading = false; }
    if (loading) { p.loadingMs += dt; p._run += dt; p.maxLoadingRun = Math.max(p.maxLoadingRun, p._run); } else { p._run = 0; }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  return true;
};

const READ_SAMPLER = () => {
  /* A missing probe object means the page navigated out from under the sampler (a reload,
     a session bounce). Report that rather than letting `|| 0` below turn every field into
     a perfect score — 0 spread over 0 frames used to read as PASS. */
  if (!window.__railProbe) { return { dead: true }; }
  const p = window.__railProbe;
  p.stop = true;
  return {
    samples: p.samples || 0,
    min: Math.round((p.min || 0) * 100) / 100,
    max: Math.round((p.max || 0) * 100) / 100,
    spread: Math.round(((p.max || 0) - (p.min || 0)) * 100) / 100,
    railGone: p.railGone || 0,
    cueSeen: !!p.cueSeen,
    loadingMs: Math.round(p.loadingMs || 0),
    maxLoadingRun: Math.round(p.maxLoadingRun || 0)
  };
};

/* A failing precondition must say WHICH precondition: "no tiles appeared" is true whether the
   board never loaded, the click never reached the sentence bar, or the lookup came back empty,
   and those need completely different responses. */
const DIAG = () => {
  const c = window.editManager && window.editManager.controller;
  const grid = document.querySelector('.md-board-detail-grid');
  const rail = document.querySelector('.md-board-detail-prediction-rail');
  const get = (k) => { try { return c.get(k); } catch (e) { return 'ERR'; } };
  const s = get('suggestions');
  return {
    url: location.href,
    grid: !!grid,
    cells: document.querySelectorAll('.md-board-detail-grid__cell').length,
    cards: document.querySelectorAll('.md-board-detail-symbol-card').length,
    railInDom: !!rail,
    railDisplay: rail ? getComputedStyle(rail).display : null,
    controller: !!c,
    editMode: c ? get('edit_mode') : null,
    showWordSuggestions: c ? get('show_word_suggestions') : null,
    prefWordSuggestions: (() => { try { return window.appState.get('referenced_user.preferences.word_suggestions'); } catch (e) { return 'ERR'; } })(),
    sentenceWords: (() => { try { return (window.appState.get('button_list') || []).map((b) => b.label); } catch (e) { return 'ERR'; } })(),
    suggestions: s === null ? null : (typeof s === 'object' ? { ready: s.ready, loading: s.loading, n: (s.list || []).length } : s)
  };
};

/* ---- controller access ------------------------------------------------------------
 * editManager.controller is the live board controller (scanner.scan_content reads
 * `editManager.controller.get('model.grid')` through it), which is how the whitebox
 * checks reach `suggestions` without adding a test-only hook to the app. */

/* Network + CPU throttling through a CDP session. Puppeteer 24 exposes
   page.emulateNetworkConditions on the INSTANCE (the abstract Page prototype has neither),
   so going through CDP directly is the shape that cannot drift. CPU is throttled too — a
   deployment is slower in both dimensions, and CPU is what makes a re-render visible. */
const setThrottle = async (client, { network, cpu }) => {
  await client.send('Network.emulateNetworkConditions', network
    ? { offline: false, latency: network.latency, downloadThroughput: network.download, uploadThroughput: network.upload }
    : { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  await client.send('Emulation.setCPUThrottlingRate', { rate: cpu || 1 }).catch(() => {});
};

(async () => {
  const { browser, page } = await launch(OPTS);
  page.on('pageerror', (e) => console.log('  [pageerror] ' + e.message));
  let saved = null;
  let cdp = null;

  const setPrefs = async (patch) => page.evaluate(async (p) => {
    try {
      const u = window.appState.get('referenced_user');
      Object.keys(p).forEach((k) => u.set('preferences.' + k, p[k]));
      await u.save();
      return true;
    } catch (e) { return 'ERR ' + e.message; }
  }, patch);

  try {
    console.log(`\nBASE ${OPTS.BASE}  USER ${OPTS.USER}`);
    await login(page, OPTS);

    /* --board aims the probe at a specific board. Check 1 is only MEANINGFUL on a board
       with folders — the per-folder-setting cell reserve is the thing it exists to catch —
       and the home board often has none, so point it at one: --board my-spanish-board */
    const wanted = OPTS.arg('--board', null);
    const key = wanted || await page.evaluate(() => window.appState && window.appState.get('currentUser.preferences.home_board.key'));
    if (!key) { fail('precondition — a board to measure', 'no --board given and no home board is set'); throw new Error('halt'); }
    const boardUrl = `${OPTS.BASE}/${OPTS.USER}/board-detail/${String(key).split('/').pop()}`;
    info(`measuring ${boardUrl}`);

    /* Record what we are about to change so the account is left exactly as found. */
    saved = await page.evaluate(() => {
      const p = window.appState.get('referenced_user.preferences') || {};
      return {
        word_suggestions: p.word_suggestions,
        word_suggestion_position: p.word_suggestion_position,
        folder_display_style: p.folder_display_style
      };
    });
    info(`saved prefs: ${JSON.stringify(saved)}`);

    const ok = await setPrefs({ word_suggestions: true, word_suggestion_position: 'side_rail' });
    if (ok !== true) { fail('precondition — prediction prefs writable', String(ok)); throw new Error('halt'); }

    /* A prediction only exists once there is a sentence, so put one word in the bar. */
    const seedSentence = async () => {
      await page.goto(boardUrl, { waitUntil: 'domcontentloaded' });
      await sleep(9000);
      const card = await page.$(WORD_CARD);
      if (!card) { return false; }
      const b = await card.boundingBox();
      await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
      await page.waitForSelector(`${RAIL} ${TILE}`, { timeout: 20000 }).catch(() => {});
      await sleep(1500);
      return !!(await page.$(`${RAIL} ${TILE}`));
    };

    if (!(await seedSentence())) {
      const d = await page.evaluate(DIAG).catch((e) => 'DIAG failed: ' + e.message);
      fail('precondition — the rail renders predictions after a word is selected',
        'no tiles within 20s. State: ' + JSON.stringify(d));
      throw new Error('halt');
    }
    pass('precondition — rail renders predictions', 'a word was selected and the rail populated');

    /* ---- 1. alignment, per folder setting ---- */
    const STYLES = [
      ['default', undefined],
      ['tab_labels', 'tab_labels'],
      ['colored_corner', 'colored_corner']
    ];
    for (const [label, value] of STYLES) {
      const wrote = await setPrefs({ folder_display_style: value === undefined ? null : value });
      if (wrote !== true) { fail(`alignment — folder style "${label}"`, `could not write the style: ${wrote}`); continue; }
      await seedSentence();
      const m = await page.evaluate(MEASURE_ALIGNMENT);
      if (!m.ok) { fail(`alignment — folder style "${label}"`, m.why); continue; }
      /* Assert the style actually APPLIED before trusting the geometry. Without this the
         three iterations can measure one identical rendered state and print three PASSes —
         which is exactly what happened before this check existed, since the pref write was
         unchecked and the grid classes were read and then discarded. */
      if (m.tabLabels !== (label === 'tab_labels') || m.coloredCorner !== (label === 'colored_corner')) {
        fail(`alignment — folder style "${label}" is actually applied`,
          `grid reports tab_labels=${m.tabLabels}, colored_corner=${m.coloredCorner} — the board is not in "${label}"`);
        continue;
      }
      /* Every tile must pair with a board row. prediction_rail_suggestions caps the tile
         count at the board's row count, so an unpaired tile means the pairing walk is
         wrong (grouped/keyboard boards place cells by explicit grid-row, so the flat
         row-major index does not hold) — and an empty rows array would otherwise make
         `bad.length === 0` and `Math.max(0, ...[])` print a clean PASS on no measurement. */
      if (m.rows.length === 0 || m.rows.length !== m.tiles) {
        fail(`alignment — folder style "${label}"`,
          `paired ${m.rows.length} of ${m.tiles} tile(s) — cannot conclude anything from a partial pairing`);
        continue;
      }
      if (!m.hasFolders && label === 'default') {
        info('NOTE: this board carries no folders, so no cell reserve applies — check 1 is not' +
          ' exercised here. Re-run against a board WITH folders to make it meaningful.');
      }
      const bad = m.rows.filter((r) => Math.abs(r.dTop) > TOL || Math.abs(r.dHeight) > TOL);
      const detail = `${m.rows.length} row(s) paired, --bd-cell-min=${m.cellMin}, has-folders=${m.hasFolders}` +
        `; worst dTop=${Math.max(0, ...m.rows.map((r) => Math.abs(r.dTop)))}px` +
        `, worst dHeight=${Math.max(0, ...m.rows.map((r) => Math.abs(r.dHeight)))}px`;
      if (bad.length === 0) {
        pass(`alignment — folder style "${label}": tiles sit on the board rows`, detail);
      } else {
        fail(`alignment — folder style "${label}": tiles sit on the board rows`,
          `${bad.length} row(s) off by more than ${TOL}px — ${JSON.stringify(bad)} (${detail})`);
      }
    }
    await setPrefs({ folder_display_style: saved.folder_display_style === undefined ? null : saved.folder_display_style });
    await seedSentence();

    /* ---- 2. the rail holds its width across real lookups ----
       Run twice: once at local speed, once under deployment-like throttling (see the end
       of the run). The reported symptom — "on deployment the section goes away while it
       reloads and the buttons stretch" — only has a visible window when the lookup is
       SLOW, so the local pass proves the DOM no longer unmounts and the throttled pass
       proves it over a window long enough to have shown the flicker. */
    const runSelections = async (clicks, waitMs) => {
      if (!(await page.evaluate(START_SAMPLER))) { return null; }
      for (let i = 0; i < clicks; i++) {
        const cards = await page.$$(WORD_CARD);
        const target = cards[i + 1] || cards[0];
        if (!target) { continue; }
        const b = await target.boundingBox();
        if (!b) { continue; }
        await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
        await sleep(waitMs);
      }
      return page.evaluate(READ_SAMPLER);
    };

    const reportSelections = (name, w, extra) => {
      if (!w) { fail(name, 'sampler could not attach — no word card to sample'); return null; }
        if (w.dead) { fail(name, 'the sampler was destroyed mid-run (page navigated?) — no measurement'); return null; }
      if (!w.samples) { fail(name, 'the sampler recorded 0 frames — nothing was measured'); return null; }
    const detail = `${w.samples} frames, card width ${w.min}–${w.max}px (spread ${w.spread}px), ` +
        `rail missing on ${w.railGone} frame(s), longest loading window ${w.maxLoadingRun}ms, ` +
        `cue shown=${w.cueSeen}` + (extra ? `; ${extra}` : '');
      if (w.spread <= 1 && w.railGone === 0) { pass(name, detail); } else {
        fail(name, detail + ' — the rail is still leaving the layout mid-lookup');
      }
      return w;
    };

    reportSelections('width stability (local speed) — buttons never resize between selections',
      await runSelections(2, 2500));

    /* ---- 3. the loading cue is delayed ---- */
    const cue = await page.evaluate(async () => {
      const c = window.editManager && window.editManager.controller;
      if (!c) { return 'no controller'; }
      const cls = () => !!document.querySelector('.md-board-detail-prediction-rail--is-loading');
      const before = c.get('suggestions');
      c.set('suggestions', { ready: true, list: (before && before.list) || [], loading: true });
      await new Promise((r) => setTimeout(r, 150));
      const at150 = cls();
      await new Promise((r) => setTimeout(r, 500));
      const at650 = cls();
      c.set('suggestions', before);
      await new Promise((r) => setTimeout(r, 200));
      const afterResolve = cls();
      return { at150, at650, afterResolve };
    });
    if (typeof cue === 'string') {
      fail('loading cue — delayed, then retracted', cue);
    } else if (!cue.at150 && cue.at650 && !cue.afterResolve) {
      pass('loading cue — delayed, then retracted',
        'absent at 150ms, present at 650ms, gone once the lookup resolved');
    } else {
      fail('loading cue — delayed, then retracted',
        `at150=${cue.at150} (want false), at650=${cue.at650} (want true), afterResolve=${cue.afterResolve} (want false)`);
    }

    /* ---- 4. stale tiles stay live while loading ---- */
    const live = await page.evaluate(async () => {
      const c = window.editManager && window.editManager.controller;
      if (!c) { return 'no controller'; }
      const before = c.get('suggestions');
      c.set('suggestions', { ready: true, list: (before && before.list) || [], loading: true });
      await new Promise((r) => setTimeout(r, 600));
      const tiles = Array.from(document.querySelectorAll('.md-board-detail-prediction-rail .md-board-detail-sentence-bar__prediction'))
        .map((t) => ({ disabled: !!t.disabled, pointerEvents: getComputedStyle(t).pointerEvents, opacity: getComputedStyle(t).opacity }));
      c.set('suggestions', before);
      return tiles;
    });
    if (typeof live === 'string') {
      fail('stale tiles stay live during a lookup', live);
    } else if (!live.length) {
      fail('stale tiles stay live during a lookup', 'no tiles were on screen to check');
    } else {
      const dead = live.filter((t) => t.disabled || t.pointerEvents === 'none');
      if (dead.length === 0) {
        pass('stale tiles stay live during a lookup',
          `${live.length} tile(s), none disabled, pointer-events intact, dimmed to opacity ${live[0].opacity}`);
      } else {
        fail('stale tiles stay live during a lookup',
          `${dead.length} tile(s) unusable while loading: ${JSON.stringify(dead)}`);
      }
    }

    /* ---- 5. a swap is HELD while the panel is the scan target ----
       Drives the scanner half of _prediction_panel_targeted: window.scanner IS the module
       singleton the controller imports, so faking its state is the real code path. The DWELL
       half shares the same containment test but cannot be reached from here — buttonTracker
       is not exposed on window — so this proves the mechanism, not both branches. */
    const hold = await page.evaluate(async () => {
      const c = window.editManager && window.editManager.controller;
      if (!c) { return 'no controller'; }
      const tile = document.querySelector('.md-board-detail-prediction-rail .md-board-detail-sentence-bar__prediction');
      if (!tile) { return 'no tile on screen'; }
      const words = () => Array.from(document.querySelectorAll('.md-board-detail-prediction-rail .md-board-detail-sentence-bar__prediction-label')).map((e) => e.textContent.trim()).join(',');

      const realActively = window.scanner.actively_scanning;
      const realCurrent = window.scanner.current_element;
      let beforeWords, heldWords, controlWords;
      try {
        /* CONTROL first: the same commit with the panel NOT targeted must land immediately.
           Without it, "held" is indistinguishable from "slow", "debounced" or "dropped" —
           the observation would be identical and the check would not mean its own name. */
        const control = [{ word: 'zzcontrolone' }, { word: 'zzcontroltwo' }];
        c._commit_suggestions({ ready: true, list: control });
        await new Promise((r) => setTimeout(r, 250));
        controlWords = words();

        /* Re-query the tile AFTER the control commit. The control replaces the words, and
           with key="word" that destroys the previous tile nodes — feeding the stale one to
           current_element makes _prediction_panel_targeted correctly report "not targeted"
           (a detached node is not a live target), and the check then measures nothing.
           Verified: targeted=false with the stale node, true with a fresh one. */
        const liveTile = document.querySelector('.md-board-detail-prediction-rail .md-board-detail-sentence-bar__prediction');
        if (!liveTile) { return 'no tile on screen after the control commit'; }
        window.scanner.actively_scanning = () => true;
        window.scanner.current_element = { dom: [liveTile] };
        beforeWords = words();
        c._commit_suggestions({ ready: true, list: [{ word: 'zzprobealpha' }, { word: 'zzprobebeta' }] });
        await new Promise((r) => setTimeout(r, 400));
        heldWords = words();
      } finally {
        window.scanner.actively_scanning = realActively;
        window.scanner.current_element = realCurrent;
      }
      await new Promise((r) => setTimeout(r, 600));
      const releasedWords = words();
      return { beforeWords, heldWords, releasedWords, controlWords };
    });
    if (typeof hold === 'string') {
      fail('swap is held while the panel is the scan target', hold);
    } else if (hold.controlWords.indexOf('zzcontrolone') === -1) {
      fail('swap is held while the panel is the scan target',
        `CONTROL failed: an untargeted commit did not land ("${hold.controlWords}") — the hold ` +
        'result below would be meaningless, since a commit that never lands looks identical to one held');
    } else if (hold.heldWords === hold.beforeWords && hold.releasedWords.indexOf('zzprobealpha') !== -1) {
      pass('swap is held while the panel is the scan target',
        `control commit landed immediately ("${hold.controlWords}"), words then unchanged during ` +
        `the scan ("${hold.heldWords}"), committed on release ("${hold.releasedWords}")`);
    } else {
      fail('swap is held while the panel is the scan target',
        `control="${hold.controlWords}" before="${hold.beforeWords}" held="${hold.heldWords}" ` +
        `released="${hold.releasedWords}" — held should equal before, released should contain the probe words`);
    }

    /* ---- 5b. regressions from the adversarial review of this branch ----
       Neither had any coverage; both were live bugs. Driven whitebox because both are
       about state transitions inside the hold, which cannot be produced from the outside. */
    const holdRegressions = await page.evaluate(async () => {
      const c = window.editManager && window.editManager.controller;
      if (!c) { return 'no controller'; }
      const words = () => Array.from(document.querySelectorAll('.md-board-detail-prediction-rail .md-board-detail-sentence-bar__prediction-label')).map((e) => e.textContent.trim()).join(',');
      const realA = window.scanner.actively_scanning;
      const realC = window.scanner.current_element;
      const out = {};
      try {
        /* (a) A blanked sentence must never come back. Under the render-side freeze there is
           no queued write to replay, so the property to assert is the outcome: freeze, clear
           the sentence, release — the panel must end up EMPTY, not showing the words that
           were live when the freeze started. */
        c.set('suggestions', { ready: true, list: [{ word: 'zzbaseword' }] });
        await new Promise((r) => setTimeout(r, 60));
        let tile = document.querySelector('.md-board-detail-prediction-rail .md-board-detail-sentence-bar__prediction');
        if (!tile) { return 'no tile to target'; }
        window.scanner.actively_scanning = () => true;
        window.scanner.current_element = { dom: [tile] };
        c._commit_suggestions({ ready: true, list: [{ word: 'zzghostword' }] });  // freezes on zzbaseword
        await new Promise((r) => setTimeout(r, 60));
        out.wordsWhileFrozen = words();
        c.set('suggestions', null);                                              // what "Clear" does
        window.scanner.actively_scanning = () => false;                          // release the freeze
        await new Promise((r) => setTimeout(r, 500));
        out.wordsAfterClear = words();
        out.ghostReturned = words().indexOf('zzghostword') !== -1 || words().indexOf('zzbaseword') !== -1;

        /* (b) The freeze must not outlive its cap even while the panel stays targeted. Drive
           it by ageing the freeze start; the poll must release and render whatever is live. */
        window.scanner.actively_scanning = () => true;
        c.set('suggestions', { ready: true, list: [{ word: 'zzbase2' }] });
        await new Promise((r) => setTimeout(r, 60));
        tile = document.querySelector('.md-board-detail-prediction-rail .md-board-detail-sentence-bar__prediction');
        window.scanner.current_element = { dom: [tile] };
        c._commit_suggestions({ ready: true, list: [{ word: 'zzheld' }] });       // freezes on zzbase2
        await new Promise((r) => setTimeout(r, 60));
        out.frozeOn = words();
        c._prediction_freeze_started = (new Date()).getTime() - 600000;           // cap elapsed
        await new Promise((r) => setTimeout(r, 400));
        out.wordsAfterCap = words();
        out.capHonoured = words().indexOf('zzheld') !== -1;
      } finally {
        window.scanner.actively_scanning = realA;
        window.scanner.current_element = realC;
      }
      return out;
    });
    if (typeof holdRegressions === 'string') {
      fail('hold regressions — cleared sentence stays cleared, and the freeze respects its cap', holdRegressions);
    } else {
      if (!holdRegressions.ghostReturned) {
        pass('hold regression — a cleared sentence stays cleared through a freeze',
          `froze showing "${holdRegressions.wordsWhileFrozen}", and after the clear + release the panel ` +
          `showed "${holdRegressions.wordsAfterClear}" — no word came back`);
      } else {
        fail('hold regression — a cleared sentence stays cleared through a freeze',
          `words came back after the clear: "${holdRegressions.wordsAfterClear}"`);
      }
      if (holdRegressions.frozeOn.indexOf('zzbase2') === -1) {
        /* Without this the check passes vacuously when the freeze never engages at all —
           verified by disabling the freeze and watching it stay green. It must first prove a
           freeze HAPPENED (the panel still showing the pre-commit word) before the release
           it asserts means anything. */
        fail('hold regression — the freeze does not outlive its cap',
          `the freeze never engaged — panel showed "${holdRegressions.frozeOn}" where "zzbase2" was expected, ` +
          'so the release below proves nothing');
      } else if (holdRegressions.capHonoured) {
        pass('hold regression — the freeze does not outlive its cap',
          `froze on "${holdRegressions.frozeOn}", and once the cap elapsed the panel released to ` +
          `"${holdRegressions.wordsAfterCap}" despite still being targeted`);
      } else {
        fail('hold regression — the freeze does not outlive its cap',
          `the panel still shows "${holdRegressions.wordsAfterCap}" — the freeze outlived its own cap`);
      }
    }

    /* ---- 6. the rail is in the scan order ----
       Mirrors how tests/utils/scanner-test.js drives this: stub scan_elements to capture the
       rows start() builds, rather than letting a live scan run over the page. */
    const scanRows = await page.evaluate(async () => {
      const s = window.scanner;
      if (!s) { return 'window.scanner missing'; }
      /* Two things start() needs that are only wired when a REAL scan begins:
         - `scanner.appState`, set by app-state.js the first time it starts scanning;
           without it the preference read below resolves to undefined and start() bails;
         - `currentUser.preferences.device.scanning` — note currentUser, not
           referenced_user, which is what start() actually reads.
         Both are set in MEMORY only (no save), so nothing is persisted to the account,
         and both are put back below. scan_elements is stubbed, so no scan ever runs. */
      const u = window.appState.get('currentUser');
      const priorScanning = u.get('preferences.device.scanning');
      const priorAppState = s.get('appState');
      if (!priorAppState) { s.set('appState', window.appState); }
      u.set('preferences.device.scanning', true);
      const realScanElements = s.scan_elements;
      const realStop = s.stop;
      let captured = null;
      s.scan_elements = (rows) => { captured = rows; };
      s.stop = () => {};
      try {
        s.start({ scan_mode: 'row', interval: 1000, auto_start: false });
      } catch (e) {
        s.scan_elements = realScanElements; s.stop = realStop;
        u.set('preferences.device.scanning', priorScanning);
        if (!priorAppState) { s.set('appState', priorAppState); }
        return 'start() threw: ' + e.message;
      }
      s.scan_elements = realScanElements;
      s.stop = realStop;
      try { realStop.call(s); } catch (e) { /* leave scanning off regardless */ }
      u.set('preferences.device.scanning', priorScanning);
      if (!priorAppState) { s.set('appState', priorAppState); }
      if (!captured) { return 'scan_elements was never called — start() bailed for another reason'; }
      return captured.map((r) => ({
        label: r.label,
        children: (r.children || []).length,
        /* Identify by DOM, never by label: scanner.js builds TWO rows with the same
           i18n'd "Suggestions" label (the classic #word_suggestions row and the rail),
           so a label match could pass while the rail row was missing — and a hardcoded
           English literal would false-FAIL under any other locale. */
        isRail: !!(r.dom && r.dom.hasClass && r.dom.hasClass('md-board-detail-prediction-rail'))
      }));
    });
    if (typeof scanRows === 'string') {
      fail('the prediction rail is reachable by scanning', scanRows);
    } else {
      const row = scanRows.find((r) => r.isRail && r.children > 0);
      if (row) {
        pass('the prediction rail is reachable by scanning',
          `a Suggestions row with ${row.children} tile(s) is in the scan order: ${JSON.stringify(scanRows)}`);
      } else {
        fail('the prediction rail is reachable by scanning',
          `no populated Suggestions row was built — rows were ${JSON.stringify(scanRows)}`);
      }
    }

    /* ---- 7. the same measurement under deployment-like conditions ----
       This is the run that actually corresponds to the bug report. Locally the loading
       window is a few ms, so a rail that unmounted and remounted inside it would very
       likely pass check 2 by luck; throttled, the window is long enough that a flicker
       could not hide in it. The board is loaded and seeded BEFORE the throttle goes on,
       so what is being measured is the lookup cycle, not the page load. */
    const profileName = OPTS.arg('--throttle', 'Slow 3G');
    if (profileName === 'off') {
      info('throttled phase skipped (--throttle off)');
    } else if (typeof page.createCDPSession !== 'function') {
      fail('throttled run — CDP session available', 'page.createCDPSession is not a function in this puppeteer build');
    } else if (!PredefinedNetworkConditions[profileName]) {
      fail('throttled run — profile is valid',
        `unknown --throttle "${profileName}"; use one of: ${Object.keys(PredefinedNetworkConditions).map((k) => `"${k}"`).join(', ')}, or "off"`);
    } else {
      const network = PredefinedNetworkConditions[profileName];
      const cpu = parseInt(OPTS.arg('--cpu', '4'), 10) || 1;
      cdp = await page.createCDPSession();
      await cdp.send('Network.enable').catch(() => {});
      await setThrottle(cdp, { network, cpu });
      info(`throttled: "${profileName}" (~${Math.round(network.download / 1024)}KB/s down, ` +
        `${network.latency}ms latency) + ${cpu}x CPU slowdown`);

      const w = await runSelections(2, 12000);
      const r = reportSelections('width stability (THROTTLED) — buttons never resize between selections',
        w, `profile "${profileName}" + ${cpu}x CPU`);

      /* A slow lookup is the only thing that can exercise the delayed cue for real: locally
         it resolves before the 400ms delay and correctly shows nothing. Only assert the cue
         if the throttle actually produced a window longer than the delay — otherwise say so
         rather than claiming the run tested something it did not. */
      if (r) {
        if (r.maxLoadingRun >= 400) {
          if (r.cueSeen) {
            pass('throttled — the loading cue does appear once a lookup is genuinely slow',
              `longest loading window ${r.maxLoadingRun}ms, past the 400ms delay, and the dim was observed`);
          } else {
            fail('throttled — the loading cue does appear once a lookup is genuinely slow',
              `a lookup ran ${r.maxLoadingRun}ms, well past the 400ms delay, but the dim never appeared`);
          }
        } else {
          info(`NOTE: even throttled, the longest real loading window was ${r.maxLoadingRun}ms — these ` +
            'predictions come back from the LOCAL corpus, which no amount of network throttling slows ' +
            'down (only the AI fallback path crosses the network). The forced-window check below covers ' +
            'what this run could not.');
        }
      }

      /* The reported symptom lives entirely inside the loading window, and the run above
         could not produce a long one — the local corpus answered instantly. So hold the
         panel in the loading state deliberately, under the SAME throttle, and measure the
         real render for as long as a bad deployment would sit there. The state written
         here is exactly what _begin_suggestion_lookup writes; what is being measured is
         the layout and the cue, which are the things that were broken. */
      if (!(await page.evaluate(START_SAMPLER))) {
        fail('throttled — a 3s loading window moves nothing and shows the cue',
          'sampler could not attach — no word card present; check SKIPPED, not passed');
      } else {
        const held = await page.evaluate(async () => {
          const c = window.editManager && window.editManager.controller;
          if (!c) { return 'no controller'; }
          const before = c.get('suggestions');
          c.set('suggestions', { ready: true, list: (before && before.list) || [], loading: true });
          await new Promise((r2) => setTimeout(r2, 3000));
          const tiles = document.querySelectorAll('.md-board-detail-prediction-rail .md-board-detail-sentence-bar__prediction').length;
          c.set('suggestions', before);
          return { tiles };
        });
        const h = await page.evaluate(READ_SAMPLER);
        if (typeof held === 'string') {
          fail('throttled — a 3s loading window moves nothing and shows the cue', held);
        } else {
          const detail = `${h.samples} frames over a ${h.maxLoadingRun}ms loading window, card width ` +
            `${h.min}–${h.max}px (spread ${h.spread}px), rail missing on ${h.railGone} frame(s), ` +
            `${held.tiles} tile(s) still on screen, cue shown=${h.cueSeen}`;
          if (h.spread <= 1 && h.railGone === 0 && h.cueSeen && held.tiles > 0) {
            pass('throttled — a 3s loading window moves nothing and shows the cue', detail);
          } else {
            fail('throttled — a 3s loading window moves nothing and shows the cue', detail +
              ' — want spread<=1px, rail present throughout, words still shown, and the cue visible');
          }
        }
      }
      await setThrottle(cdp, { network: null, cpu: 1 });
      cdp = null;
    }
  } catch (e) {
    if (e.message !== 'halt') {
      console.log('\nERROR ' + e.message);
      results.push({ n: 'probe completed', ok: false });
    }
  } finally {
    /* Never leave the browser throttled if the run died mid-phase. */
    if (cdp) { await setThrottle(cdp, { network: null, cpu: 1 }).catch(() => {}); }
    if (saved) {
      const restored = await page.evaluate(async (s) => {
        try {
          const u = window.appState.get('referenced_user');
          Object.keys(s).forEach((k) => u.set('preferences.' + k, s[k] === undefined ? null : s[k]));
          await u.save();
          return true;
        } catch (e) { return 'ERR ' + e.message; }
      }, saved).catch((e) => 'ERR ' + e.message);
      console.log(restored === true
        ? '  (preferences restored to their original values)'
        : `  (WARNING: could not restore preferences: ${restored}) — check the dev account`);
    }
    await browser.close();
  }
  const bad = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - bad}/${results.length} checks passed`);
  process.exit(bad ? 1 : 0);
})();
