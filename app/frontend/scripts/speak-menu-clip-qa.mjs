#!/usr/bin/env node
/**
 * Speak Options modal — is the bottom CLIPPED, or is it a scroll container the user
 * cannot tell is scrollable?
 *
 * Reported repeatedly as "the bottom is cut off". Every prior fix was reasoned from the
 * stylesheet. This measures the rendered boxes instead: the dialog's occupied band vs the
 * viewport, and .md-speak-menu's scrollHeight vs clientHeight, at several heights.
 *
 * Run from app/frontend against a live dev stack:
 *   node scripts/speak-menu-clip-qa.mjs [--headed] [--heights 900,800,700,640]
 */
/* eslint-env node */
import { cliArgs, launch, login } from './qa-helpers.mjs';

const OPTS = cliArgs(process.argv);
const HEIGHTS = OPTS.arg('--heights', '1000,900,800,700,640').split(',').map(Number);
const BOARD = OPTS.arg('--board', 'example/vocal-flair-84');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const MEASURE = () => {
  const menu = document.querySelector('#speak_menu');
  if (!menu) { return { open: false }; }
  const dialog = menu.closest('.modal-dialog');
  const content = menu.closest('.modal-content');
  const box = (el) => { if (!el) return null; const r = el.getBoundingClientRect();
    return { top: Math.round(r.top), bottom: Math.round(r.bottom), h: Math.round(r.height) }; };
  const cs = getComputedStyle(menu);
  const last = menu.lastElementChild;
  return {
    open: true,
    vh: window.innerHeight,
    dialog: box(dialog),
    content: box(content),
    menu: box(menu),
    menuMaxHeight: cs.maxHeight,
    menuOverflowY: cs.overflowY,
    smMenuTop: (dialog && getComputedStyle(dialog).getPropertyValue('--sm-menu-top').trim()) || '(unset)',
    dialogTopStyle: dialog ? dialog.style.top || '(unset)' : null,
    scrollH: menu.scrollHeight,
    clientH: menu.clientHeight,
    scrollable: menu.scrollHeight > menu.clientHeight + 1,
    contentOverflow: content ? getComputedStyle(content).overflow : null,
    lastChildBottom: last ? Math.round(last.getBoundingClientRect().bottom) : null
  };
};

const rows = [];
(async () => {
  const { browser, page } = await launch(OPTS);
  try {
    await login(page, OPTS);
    for (const h of HEIGHTS) {
      await page.setViewport({ width: 1280, height: h });
      await page.goto(`${OPTS.BASE}/${BOARD}`, { waitUntil: 'networkidle2', timeout: 60000 });
      await sleep(3000);
      const dismiss = await page.$('button[data-bd-action="dismiss_portrait_overlay"]');
      if (dismiss) { await dismiss.click().catch(() => {}); await sleep(1000); }
      const opener = await page.$('[data-bd-action="open_speak_menu"]');
      if (!opener) { console.log(`[INFO] h=${h}: speak-options control not found`); continue; }
      await opener.click().catch(() => {});
      /* Explicit wait, not a fixed sleep: an earlier version slept 1400ms, missed the
         modal, and reported "did not open" for a menu that opens perfectly — a probe
         failing for its own reasons. */
      await page.waitForSelector('#speak_menu', { timeout: 15000 })
        .catch(() => console.log(`[INFO] h=${h}: #speak_menu never appeared`));
      await sleep(900);
      const m = await page.evaluate(MEASURE);
      if (!m.open) { console.log(`[INFO] h=${h}: menu did not open`); continue; }
      rows.push(m);
      const overhang = m.dialog.bottom - m.vh;
      const verdict = overhang > 1 ? 'OFF-SCREEN' : (m.scrollable ? 'scrolls' : 'fits');
      console.log(
        `h=${String(m.vh).padStart(4)}  dialog ${String(m.dialog.top).padStart(3)}..${String(m.dialog.bottom).padStart(4)}` +
        `  overhang ${String(overhang).padStart(4)}px  menu ${m.clientH}/${m.scrollH}` +
        `  maxH ${m.menuMaxHeight}  --sm-menu-top ${m.smMenuTop}  top:${m.dialogTopStyle}` +
        `  overflowY ${m.menuOverflowY}  contentOverflow ${m.contentOverflow}  => ${verdict}` +
        `\n        content ${m.content.top}..${m.content.bottom} (h ${m.content.h})   menu ${m.menu.top}..${m.menu.bottom} (h ${m.menu.h})   lastChildBottom ${m.lastChildBottom}`
      );
    }
  } finally { await browser.close(); }
  const bad = rows.filter((r) => r.dialog.bottom - r.vh > 1);
  console.log(bad.length
    ? `\nRESULT: dialog hangs below the viewport at ${bad.length}/${rows.length} heights — genuine clipping.`
    : `\nRESULT: dialog fits the viewport at all ${rows.length} heights; any cut-off text is the internal scroll container.`);
})();
