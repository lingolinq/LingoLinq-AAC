#!/usr/bin/env node
/**
 * board-detail sentence-bar tools at narrow widths.
 *
 * Reported: "at 640px and below we lose all of our controls, and when you click the speak
 * options dropdown it shows above it off of the view."
 *
 * NOTE FOR THE NEXT READER: the first version of this probe aimed at the CLASSIC board
 * header (#speak_options / #backspace_button in templates/application.hbs) and reported
 * 31 failures, every one of them its own fault — /example/keyboard redirects to
 * /example/board-detail/keyboard, so none of those ids were ever on the page. The
 * surface under test is board-detail's own sentence bar. Its controls are addressed by
 * `data-bd-action`, not by id.
 *
 * Run from app/frontend, against a live dev stack:
 *   node scripts/speak-header-narrow-qa.mjs [--headed] [--widths 1280,768,641,640,480]
 */
/* eslint-env node */
import { cliArgs, launch, login } from './qa-helpers.mjs';

/* The portrait-orientation overlay covers the whole board below ~640px and swallows every
   click underneath it. Without this the chevron "did not open" at 480/375 — the tap never
   reached it. Dismiss after EVERY viewport change, because it re-arms. */
async function dismissPortraitOverlay(page) {
  /* Click it if it is THERE. An earlier version gated this on a getBoundingClientRect
     visibility check, which came back false, so the overlay was never dismissed and it
     silently swallowed every chevron click after it — the probe then reported "popover did
     not open" for a popover that was working perfectly. A negative control that fails for
     its own reasons is worse than no control. */
  const btn = await page.$('button[data-bd-action="dismiss_portrait_overlay"]');
  if (btn) { await btn.click().catch(() => {}); await new Promise((r) => setTimeout(r, 1200)); }
}

const OPTS = cliArgs(process.argv);
const WIDTHS = (OPTS.arg('--widths', '1280,768,641,640,480,375')).split(',').map(Number);
const BOARD = OPTS.arg('--board', 'example/vocal-flair-84');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const TOOLS = [
  ['[data-bd-action="speak_sentence"]', 'Speak (mic)'],
  ['[data-bd-action="backspace_sentence"]', 'Backspace'],
  ['[data-bd-action="clear_sentence"]', 'Clear'],
  ['[data-bd-action="open_speak_menu"]', 'Speak options'],
  ['[data-bd-action="toggle_quick_actions"]', 'Chevron (consolidated)']
];

const results = [];
const record = (id, pass, detail) => {
  results.push({ id, pass, detail });
  console.log(`[${pass === true ? 'PASS' : pass === false ? 'FAIL' : 'INFO'}] ${id}: ${detail}`);
};

const VISIBLE = (sel) => {
  const el = document.querySelector(sel);
  if (!el) { return { present: false }; }
  const r = el.getBoundingClientRect();
  const cs = getComputedStyle(el);
  return {
    present: true,
    rect: { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) },
    hidden: cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0 || r.width < 2,
    offscreen: r.right > innerWidth + 1 || r.left < -1 || r.bottom > innerHeight + 1 || r.top < -1
  };
};

(async () => {
  const { browser, page } = await launch(OPTS);
  try {
    await login(page, OPTS);
    const [owner, ...rest] = BOARD.split('/');
    await page.goto(`${OPTS.BASE}/${owner}/${rest.join('/')}`, { waitUntil: 'networkidle2', timeout: 60000 }).catch(() => {});
    await sleep(4000);

    const ctx = await page.evaluate(() => ({
      url: location.href,
      bar: !!document.querySelector('.md-board-detail-sentence-bar__tools'),
      flag: !!(window.LingoLinq && window.LingoLinq.feature_flags && window.LingoLinq.feature_flags.portrait_orientation_overlay)
    }));
    record('context', ctx.bar, `${ctx.url} | sentence-bar tools present=${ctx.bar} | portrait_orientation_overlay flag=${ctx.flag}`);
    if (!ctx.bar) { throw new Error('sentence bar not on the page — nothing measured'); }

    for (const w of WIDTHS) {
      await page.setViewport({ width: w, height: 800 });
      await sleep(1500);
      await dismissPortraitOverlay(page);
      console.log(`\n=== ${w}px ===`);

      const seen = [];
      for (const [sel, label] of TOOLS) {
        const m = await page.evaluate(VISIBLE, sel);
        if (m.present && !m.hidden) { seen.push(label); }
        record(`${w}/${label}`, null,
          !m.present ? 'not rendered' : m.hidden ? 'rendered but hidden' : `visible ${m.rect.w}x${m.rect.h} @ y=${m.rect.y}`);
      }
      record(`${w}/tools-available`, seen.length > 1,
        seen.length > 1 ? `${seen.length} controls on the bar: ${seen.join(', ')}` : `ONLY ${seen.length}: ${seen.join(', ') || 'none'} — the rest are behind it`);

      /* If the bar consolidated, open the popover and see where it lands. */
      const chev = await page.$('[data-bd-action="toggle_quick_actions"]');
      if (chev) {
        await chev.click().catch(() => {});
        await sleep(900);
        const pop = await page.evaluate(() => {
          const el = document.querySelector('.md-board-detail-sentence-bar__quick-actions');
          if (!el) { return { open: false }; }
          const r = el.getBoundingClientRect();
          const cs = getComputedStyle(el);
          /* Stacking, measured rather than read off a z-index: sample points across the
             popover and ask the document what is actually on top there. A panel can carry
             the highest z-index in the file and still lose, if an ancestor establishes a
             stacking context the board sits above. */
          const pts = [[0.5, 0.15], [0.5, 0.5], [0.5, 0.85], [0.15, 0.5], [0.85, 0.5]];
          let ownedPts = 0; let blockedBy = null;
          pts.forEach(([fx, fy]) => {
            const x = Math.round(r.left + r.width * fx);
            const y = Math.round(r.top + r.height * fy);
            if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) { return; }
            const hit = document.elementFromPoint(x, y);
            if (hit && (el === hit || el.contains(hit))) { ownedPts++; }
            else if (hit && !blockedBy) {
              blockedBy = (hit.id ? '#' + hit.id : hit.tagName.toLowerCase() +
                '.' + String(hit.className).split(' ').filter(Boolean).slice(0, 2).join('.'));
            }
          });
          return {
            open: true,
            top: Math.round(r.top), bottom: Math.round(r.bottom), h: Math.round(r.height),
            vh: innerHeight, position: cs.position, bottomCss: cs.bottom, zIndex: cs.zIndex,
            aboveFold: r.top < 0, belowFold: r.bottom > innerHeight + 1,
            ownedPts, totalPts: pts.length, blockedBy
          };
        });
        if (!pop.open) {
          record(`${w}/quick-actions`, false, 'chevron present but popover did not open');
        } else {
          const bad = [];
          if (pop.aboveFold) { bad.push(`top=${pop.top} is ABOVE the viewport — clipped off the screen`); }
          if (pop.belowFold) { bad.push(`bottom=${pop.bottom} exceeds viewport ${pop.vh}`); }
          record(`${w}/quick-actions-fits`, bad.length === 0,
            bad.length ? `${bad.join('; ')} (css bottom:${pop.bottomCss}, h=${pop.h})` : `fits — top=${pop.top} bottom=${pop.bottom} vh=${pop.vh}`);
          record(`${w}/quick-actions-on-top`, pop.ownedPts === pop.totalPts,
            pop.ownedPts === pop.totalPts
              ? `paints above the board — wins all ${pop.totalPts} hit-tests (z-index ${pop.zIndex})`
              : `only ${pop.ownedPts}/${pop.totalPts} hit-tests won; blocked by ${pop.blockedBy} (z-index ${pop.zIndex})`);
        }
        /* Close by asserting the END STATE, not by clicking the toggle again: a stray
           click when it is already shut re-OPENS it, and the next width then reports
           "did not open" for a popover that was open the whole time. That is what the
           480/375 rows said on the first run. */
        for (let i = 0; i < 3; i++) {
          const open = await page.evaluate(() => !!document.querySelector('.md-board-detail-sentence-bar__quick-actions'));
          if (!open) { break; }
          await page.evaluate(() => { const c = document.querySelector('[data-bd-action="toggle_quick_actions"]'); if (c) { c.click(); } }).catch(() => {});
          await sleep(500);
        }
      }
    }

    const fails = results.filter((r) => r.pass === false);
    console.log(`\n${results.filter((r) => r.pass === true).length} pass / ${fails.length} fail`);
    if (fails.length) { console.log('\nFAILURES:'); fails.forEach((f) => console.log(`  ${f.id}: ${f.detail}`)); }
  } finally {
    await browser.close();
  }
})();
