#!/usr/bin/env node
/**
 * Share Text modal — does it actually shrink on small screens?
 *
 * Reported: "the share text modal doesn't shrink on smaller screens." Measures the dialog
 * against the viewport, and the fixed-basis children inside it, at a range of widths.
 *
 * The modal renders its full body only when the sentence bar is non-empty (the empty state
 * collapses to a single notice), so this builds a sentence first by tapping grid CELLS —
 * board buttons on board-detail are NOT <button> elements.
 *
 * Run from app/frontend against a live dev stack:
 *   node scripts/share-text-responsive-qa.mjs [--headed] [--widths 1280,1024,900,768,640,480]
 */
/* eslint-env node */
import { cliArgs, launch, login } from './qa-helpers.mjs';

const OPTS = cliArgs(process.argv);
const WIDTHS = OPTS.arg('--widths', '1280,1024,900,768,640,480').split(',').map(Number);
const VH = Number(OPTS.arg('--height', '900'));
const BOARD = OPTS.arg('--board', 'example/vocal-flair-84');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const MEASURE = () => {
  const wrap = document.querySelector('.la-share-text-modal-wrap');
  if (!wrap) { return { open: false }; }
  const dialog = wrap.closest('.modal-dialog');
  const w = (el) => (el ? Math.round(el.getBoundingClientRect().width) : null);
  const r = dialog.getBoundingClientRect();
  const tiles = [...document.querySelectorAll('.la-share-text__action')];
  const contacts = document.querySelector('.la-share-text__contacts');
  const body = document.querySelector('.la-share-text-modal-body');
  return {
    open: true,
    vw: window.innerWidth,
    dialogW: Math.round(r.width),
    dialogLeft: Math.round(r.left), dialogRight: Math.round(r.right),
    dialogInline: dialog.getAttribute('style'),
    vh: window.innerHeight,
    dialogTop: Math.round(r.top), dialogBottom: Math.round(r.bottom), dialogH: Math.round(r.height),
    contentInlineMaxH: (dialog.querySelector('.modal-content') || {}).style ? dialog.querySelector('.modal-content').style.maxHeight : null,
    contentH: w(dialog.querySelector('.modal-content')) === null ? null : Math.round(dialog.querySelector('.modal-content').getBoundingClientRect().height),
    contentScrollH: dialog.querySelector('.modal-content') ? dialog.querySelector('.modal-content').scrollHeight : null,
    bodyW: w(body),
    bodyScrollW: body ? body.scrollWidth : null,
    tileW: tiles.length ? Math.round(tiles[0].getBoundingClientRect().width) : null,
    tileCount: tiles.length,
    widestTileRow: (() => {
      const rows = [...document.querySelectorAll('.la-share-text__actions')];
      return rows.map((el) => Math.round(el.scrollWidth));
    })(),
    contactsCols: contacts ? getComputedStyle(contacts).gridTemplateColumns.split(' ').length : null,
    docScrollW: document.documentElement.scrollWidth,
    horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 1
  };
};

(async () => {
  const { browser, page } = await launch(OPTS);
  const rows = [];
  try {
    await login(page, OPTS);
    for (const vw of WIDTHS) {
      await page.setViewport({ width: vw, height: VH });
      await page.goto(`${OPTS.BASE}/${BOARD}`, { waitUntil: 'networkidle2', timeout: 60000 });
      await sleep(3200);
      const d = await page.$('button[data-bd-action="dismiss_portrait_overlay"]');
      if (d) { await d.click().catch(() => {}); await sleep(1200); }
      /* Build a sentence: the modal's body is gated on it. Grid CELLS, not <button>s —
         and NOT folder cells, which navigate into a sub-board instead of speaking. An
         earlier version clicked the first three cells, hit folders, navigated away and
         measured the EMPTY modal while reporting it as the real one. */
      const cells = await page.$$('.md-board-detail-grid__cell:not(.md-board-detail-grid__cell--folder)');
      for (const c of cells.slice(0, 3)) { await c.click().catch(() => {}); await sleep(500); }
      const built = await page.evaluate(() => {
        const t = document.querySelector('.md-board-detail-sentence-bar__text');
        return t ? t.innerText.trim() : '';
      });
      if (!built || built.startsWith('Tap symbols')) { console.log(`[INFO] vw=${vw}: could not build a sentence`); continue; }
      /* Below ~640 the sentence-bar tools consolidate behind a chevron. */
      let opener = await page.$('[data-bd-action="open_speak_menu"]');
      if (!opener) {
        const chev = await page.$('[data-bd-action="toggle_quick_actions"]');
        if (chev) { await chev.click().catch(() => {}); await sleep(800); }
        opener = await page.$('[data-bd-action="open_speak_menu"]');
      }
      if (!opener) { console.log(`[INFO] vw=${vw}: no speak-options control`); continue; }
      await opener.click().catch(() => {});
      await page.waitForSelector('#speak_menu', { timeout: 15000 }).catch(() => {});
      await sleep(800);
      const share = await page.$('#menu_share_button');
      if (!share) { console.log(`[INFO] vw=${vw}: no Share control in the speak menu`); continue; }
      await share.click().catch(() => {});
      await page.waitForSelector('.la-share-text-modal-wrap', { timeout: 15000 }).catch(() => {});
      await sleep(1200);
      const m = await page.evaluate(MEASURE);
      if (!m.open) { console.log(`[INFO] vw=${vw}: share modal did not open`); continue; }
      rows.push(m);
      const pct = ((m.dialogW / m.vw) * 100).toFixed(0);
      console.log(
        `vw=${String(m.vw).padStart(4)}  dialog ${String(m.dialogW).padStart(4)}px (${pct}% of vw)` +
        `  left ${String(m.dialogLeft).padStart(4)} right ${String(m.dialogRight).padStart(4)}` +
        `  tiles ${m.tileCount}@${m.tileW}px  rowScrollW ${JSON.stringify(m.widestTileRow)}` +
        `  contactCols ${m.contactsCols}  bodyW ${m.bodyW}/scroll ${m.bodyScrollW}` +
        `  pageOverflowX ${m.horizontalOverflow}` +
        `\n         vh=${m.vh} dialog ${m.dialogTop}..${m.dialogBottom} (h ${m.dialogH})  belowFold ${m.dialogBottom - m.vh}px` +
        `  content h ${m.contentH}/scroll ${m.contentScrollH} inlineMaxH ${m.contentInlineMaxH}`
      );
    }
  } finally { await browser.close(); }
  const bad = rows.filter((r) => r.dialogRight > r.vw + 1 || r.dialogLeft < -1 || r.horizontalOverflow ||
                                 (r.bodyScrollW && r.bodyW && r.bodyScrollW > r.bodyW + 1));
  console.log(bad.length ? `\nRESULT: ${bad.length}/${rows.length} widths overflow.` : `\nRESULT: fits at all ${rows.length} widths.`);
})();
