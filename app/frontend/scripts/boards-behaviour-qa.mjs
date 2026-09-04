/**
 * Boards-page BEHAVIOUR probe — the click sweep the geometry probes cannot do.
 *
 * `boards-columns-qa.mjs` proves the column split; `focused-layout-qa.mjs` proves the
 * pill-nav offsets. Neither one clicks anything, and the defect that shipped on
 * 2026-08-16 was purely behavioural: reusing `@compactRow` for the compact LOOK also
 * imported the picker's click behaviour, so every card on the Boards page opened a
 * preview instead of its board. Geometry was perfect the whole time.
 *
 * WHAT IT ASSERTS (and why it cannot false-pass): after each card click it requires
 * BOTH that the route left /boards for a board URL AND that no preview modal is in the
 * DOM. Asserting only "something happened" is how a click test passes without testing
 * anything — the preview modal is also "something happening".
 *
 *   nvm use 22 && node scripts/boards-behaviour-qa.mjs --user marcus_williams_slp --pass 'demo2025!'
 */
/* eslint-env node */
import { cliArgs, launch, login } from './qa-helpers.mjs';

const opts = cliArgs(process.argv);
const BOARDS_URL = opts.BASE + '/' + opts.USER + '/boards';

// Cards clicked per non-default combination. The DEFAULT combination (what every user
// lands on) is swept in full; the others prove the gate, which is per-component and
// cannot vary card to card. Any cap is printed, never silent.
const SAMPLE = 3;

let pass = 0, fail = 0;
const failures = [];
function check(ok, label, detail) {
  if (ok) { pass++; console.log('  PASS  ' + label); }
  else {
    fail++; failures.push(label + (detail ? ' — ' + detail : ''));
    console.log('  FAIL  ' + label + (detail ? '\n        ' + detail : ''));
  }
}

async function gotoBoards(page) {
  await page.goto(BOARDS_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector('.ub-boards-page__boards-body', { timeout: 30000 }).catch(() => {});
  await new Promise((r) => setTimeout(r, 1500));
}

async function setLayout(page, mode) {
  await page.evaluate((m) => {
    try { window.localStorage['ll_boards_layout'] = m; } catch (e) { /* stubbed storage */ }
    document.body.setAttribute('data-boards-layout', m);
  }, mode);
}

async function setDensity(page, compact) {
  // Drive the real control, not the property — the whole point is the rendered path.
  const clicked = await page.evaluate((wantCompact) => {
    const btns = Array.from(document.querySelectorAll('.bp-segmented__option'));
    const target = btns.find((b) => /compact/i.test(b.textContent) === wantCompact);
    if (!target) { return false; }
    target.click();
    return true;
  }, compact);
  await new Promise((r) => setTimeout(r, 800));
  return clicked;
}

// A board card, distinguished from a folder card by its containing section.
async function cardCount(page) {
  return page.evaluate(() => {
    const sec = document.querySelector('.ub-boards-page__boards-summary-section') || document;
    return sec.querySelectorAll('.simple_board_holder .simple_board_icon').length;
  });
}

async function clickCard(page, index) {
  return page.evaluate((i) => {
    const sec = document.querySelector('.ub-boards-page__boards-summary-section') || document;
    const cards = sec.querySelectorAll('.simple_board_holder .simple_board_icon');
    if (!cards[i]) { return null; }
    const label = (cards[i].getAttribute('aria-label') || '').slice(0, 40);
    cards[i].click();
    return label;
  }, index);
}

/* WAIT FOR AN OUTCOME, do not sample at a fixed delay.
 * First cut used a flat 1.8s and produced a mess of false failures: opening a board
 * raises the "preparing workspace" overlay before the route transitions, so a slow
 * card looked identical to a dead one (url unchanged, no preview). Polling until
 * EITHER outcome appears — or the deadline expires — is what separates "this click did
 * nothing" from "this click was still working". A fixed sleep in a click probe is a
 * defect generator, in both directions. */
async function outcome(page, startUrl) {
  const deadline = Date.now() + 15000;
  let last = null;
  for (;;) {
    last = await snapshot(page);
    if (last.url !== startUrl || last.previewOpen) { return last; }
    if (Date.now() > deadline) { return Object.assign(last, { timedOut: true }); }
    await new Promise((r) => setTimeout(r, 250));
  }
}

async function snapshot(page) {
  return page.evaluate(() => ({
    url: location.pathname,
    working: !!document.querySelector('.ll-premium-progress, .md-loading-overlay'),
    /* The board preview renders as `.modal.fade.in.md-board-details-modal[role=dialog]`
       (components/board-preview-overlay.hbs). The broad selector is deliberate — a
       narrow one that silently stops matching would turn this whole probe into a
       route-change check with a decorative second clause. `previewControl()` below
       proves the detector still fires. */
    previewOpen: !!document.querySelector('.md-board-details-modal, .modal.in, [role="dialog"]')
  }));
}

/* POSITIVE CONTROL for the preview detector.
 * Every sweep assertion says "no preview opened". If the selector ever stopped
 * matching, every one of those would pass for the wrong reason and the probe would
 * look green while testing half of what it claims. The picker is the surface that is
 * SUPPOSED to open a preview on card click, so it is the natural control: if a preview
 * cannot be detected there, the negative results above are worthless. */
async function previewControl(page) {
  console.log('\n--- positive control: the preview detector actually fires ---');
  await page.goto(opts.BASE + '/board-picker', { waitUntil: 'domcontentloaded', timeout: 60000 });
  // Wait for CARDS, not just the grid: the grid element paints immediately with a
  // "Loading boards..." message, so keying off it raced the data and the control
  // failed with "no card available" — which silently leaves the detector unproven.
  await page.waitForSelector('.md-home-boards-picker__grid .simple_board_icon', { timeout: 45000 })
    .catch(() => {});
  await new Promise((r) => setTimeout(r, 1500));

  const compactDefault = await page.evaluate(() =>
    !!document.querySelector('.md-home-boards-picker__grid.ll-boards-grid--compact'));
  check(compactDefault, 'picker opens in COMPACT density (2.2)');

  const toggleH = await page.evaluate(() => {
    const el = document.querySelector('.bp-segmented__option');
    return el ? Math.round(el.getBoundingClientRect().height) : null;
  });
  check(toggleH !== null && toggleH <= 34 && toggleH >= 30,
    'picker density control is the slimmed ~32px control (2.2)', 'measured ' + toggleH + 'px');

  const clicked = await page.evaluate(() => {
    const card = document.querySelector('.md-home-boards-picker__grid .simple_board_icon');
    if (!card) { return false; }
    card.click();
    return true;
  });
  if (!clicked) { check(false, 'CONTROL: a picker card was available to click'); return; }

  const res = await outcome(page, await page.evaluate(() => location.pathname));
  check(res.previewOpen,
    'CONTROL: clicking a PICKER card opens a preview (detector verified live)',
    'if this fails, every "no preview" result above is unproven');
}

async function sweep(page, layout, compact, limit) {
  const label = layout + ' / ' + (compact ? 'compact' : 'detailed');
  await gotoBoards(page);
  await setLayout(page, layout);
  const switched = await setDensity(page, compact);
  if (!switched) { check(false, label + ': density control not found'); return; }

  const total = await cardCount(page);
  if (!total) { check(false, label + ': no board cards found'); return; }
  const n = limit ? Math.min(limit, total) : total;
  console.log('\n--- ' + label + ' — clicking ' + n + ' of ' + total + ' cards' +
    (n < total ? ' (SAMPLED, cap=' + limit + ')' : ' (FULL SWEEP)') + ' ---');

  for (let i = 0; i < n; i++) {
    // The list re-renders after each round trip, so re-check presence rather than
    // trusting the count taken before the first click.
    const available = await cardCount(page);
    if (i >= available) {
      check(false, label + ': card ' + i + ' not present after return (list had ' + available + ')');
      await gotoBoards(page); await setLayout(page, layout); await setDensity(page, compact);
      continue;
    }
    const startUrl = await page.evaluate(() => location.pathname);
    const name = await clickCard(page, i);
    if (name === null) { check(false, label + ': card ' + i + ' vanished'); continue; }
    const res = await outcome(page, startUrl);
    const left = !/\/boards\/?$/.test(res.url);
    check(left && !res.previewOpen, label + ': card ' + i + ' "' + name + '" opens its board',
      'url=' + res.url + ' previewOpen=' + res.previewOpen +
      (res.timedOut ? ' TIMED OUT after 15s (working=' + res.working + ')' : ''));
    await gotoBoards(page);
    await setLayout(page, layout);
    await setDensity(page, compact);
  }
}

async function selectorGeometry(page) {
  console.log('\n--- layout selector visibility / alignment ---');
  await gotoBoards(page);
  for (const w of [1600, 1280, 1024, 769, 768, 700]) {
    await page.setViewport({ width: w, height: 900 });
    await new Promise((r) => setTimeout(r, 500));
    const m = await page.evaluate(() => {
      const el = document.querySelector('.ub-boards-page__layout-toggle');
      if (!el) { return { present: false }; }
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      const ws = document.querySelector('.md-workspace');
      const wr = ws ? ws.getBoundingClientRect() : null;
      return {
        present: true,
        shown: cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 0,
        rightGap: wr ? Math.round(wr.right - r.right) : null
      };
    });
    if (w <= 768) {
      check(!m.present || !m.shown, 'selector hidden at ' + w + 'px', JSON.stringify(m));
    } else {
      check(m.present && m.shown, 'selector visible at ' + w + 'px', JSON.stringify(m));
    }
  }
  await page.setViewport({ width: 1280, height: 900 });
}

async function ctaColours(page) {
  console.log('\n--- CTA colours (New Board / Change Home Board / Show More) ---');
  await gotoBoards(page);
  const m = await page.evaluate(() => {
    const paint = (sel) => {
      const el = document.querySelector(sel);
      if (!el) { return null; }
      const cs = getComputedStyle(el);
      return cs.backgroundColor + ' | ' + cs.backgroundImage;
    };
    return {
      newBoard: paint('.ub-boards-page__boards-summary-new-btn'),
      setHome: paint('.ub-boards-page__set-home-btn'),
      showMore: paint('.ub-boards-page__show-more-btn')
    };
  });
  const found = Object.keys(m).filter((k) => m[k]);
  if (found.length < 2) {
    check(false, 'at least two CTAs present to compare', JSON.stringify(m));
    return;
  }
  const values = found.map((k) => m[k]);
  const allSame = values.every((v) => v === values[0]);
  check(allSame, 'CTAs share one paint (' + found.join(', ') + ')', JSON.stringify(m, null, 1));
  if (found.length < 3) {
    console.log('  NOTE  only ' + found.length + '/3 CTAs rendered for this user — not a full comparison');
  }
}

async function backgroundIdentity(page) {
  console.log('\n--- shell background identity across widths (the removed overrides) ---');
  await gotoBoards(page);
  const seen = {};
  for (const w of [1600, 1280, 1024, 950, 820, 768, 400]) {
    await page.setViewport({ width: w, height: 900 });
    await new Promise((r) => setTimeout(r, 400));
    seen[w] = await page.evaluate(() => {
      const el = document.querySelector('.md-shell');
      if (!el) { return 'no .md-shell'; }
      const cs = getComputedStyle(el);
      return cs.backgroundImage.length + 'chars|' + cs.backgroundColor;
    });
  }
  const widths = Object.keys(seen);
  const base = seen[widths[0]];
  const same = widths.every((w) => seen[w] === base);
  check(same, 'shell background identical at all widths incl. 400px',
    widths.map((w) => w + '=' + seen[w]).join('\n        '));
  await page.setViewport({ width: 1280, height: 900 });
}

(async () => {
  const { browser, page } = await launch(opts);
  try {
    await login(page, opts);

    /* `--only control|sweep|static` keeps a re-run of one section cheap — the full
       pass takes ~20 minutes because every board click is a real page load. */
    const only = opts.arg('--only', 'all');

    if (only === 'all' || only === 'sweep') {
      // Default combination first, in full: side-by-side is the component default and
      // compact is the new density default, so this is what every user lands on.
      await sweep(page, 'side-by-side', true, null);
      await sweep(page, 'side-by-side', false, SAMPLE);
      await sweep(page, 'top-down', true, SAMPLE);
      await sweep(page, 'top-down', false, SAMPLE);
    }
    if (only === 'all' || only === 'static') {
      await selectorGeometry(page);
      await ctaColours(page);
      await backgroundIdentity(page);
    }
    if (only === 'all' || only === 'control') {
      await previewControl(page);
    }

    console.log('\n================ ' + pass + ' passed, ' + fail + ' failed ================');
    if (fail) { failures.forEach((f) => console.log('  ✗ ' + f)); }
  } catch (e) {
    console.log('\nPROBE ERROR: ' + e.message);
    process.exitCode = 2;
  } finally {
    await browser.close();
  }
  if (fail) { process.exitCode = 1; }
})();
