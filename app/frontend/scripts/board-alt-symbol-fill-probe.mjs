#!/usr/bin/env node
/**
 * Measurement probe: on the classic (board-alt) grid, how much of the symbol band
 * does the symbol actually cover, and where does the leftover space come from?
 *
 * Three candidates produce "there is still room around the picture", and they need
 * different fixes, so guessing between them is not an option:
 *
 *   1. the BAND is smaller than the space below the label   -> --ll-symbol-band / insets
 *   2. the IMG BOX is smaller than the band                 -> a width/height/transform rule
 *   3. the ARTWORK is smaller than the img box              -> object-fit letterboxing, or
 *                                                              whitespace baked into the file
 *
 * For each button it reports the button box, the label footprint, the holder box, the
 * img box, and the image's intrinsic aspect — so (1) is band vs label-bottom, (2) is
 * img box vs holder box, and (3) is the contain-fit of naturalWidth/Height inside the
 * img box. Where the image is same-origin enough to read back, it also reports the
 * INK box (non-transparent, non-white pixels) as a fraction of the file, which is the
 * only way to tell "the symbol has a margin drawn into it" from a CSS gap.
 *
 * Run from app/frontend under Node 22 with the dev stack up (ember 8184 -> rails 5000):
 *   node scripts/board-alt-symbol-fill-probe.mjs --user marcus_williams_slp --pass 'demo2025!'
 *   node scripts/board-alt-symbol-fill-probe.mjs --board marcus_williams_slp/vocal-core --headed
 *
 * Read-only: it navigates and measures, it never edits a board.
 * Exit 0 when measurements were taken, 2 on harness error.
 */
/* eslint-env node */
import { cliArgs, launch } from './qa-helpers.mjs';

const opts = cliArgs(process.argv);
const BOARD = opts.arg('--board', null);
const HEIGHT = parseInt(opts.arg('--height', '729'), 10);
const WIDTH = parseInt(opts.arg('--width', '1280'), 10);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function measure(page) {
  return page.evaluate(() => {
    const round = (n) => Math.round(n * 100) / 100;
    const shell = document.getElementById('within_ember');
    const board = document.querySelector('.board');
    if (!board) { return { error: 'no .board on ' + location.pathname }; }
    const buttons = Array.from(board.querySelectorAll('a.button')).filter((b) => b.querySelector('img.symbol'));
    if (!buttons.length) { return { error: 'board has no buttons carrying img.symbol' }; }

    const inkBox = (img) => {
      try {
        const c = document.createElement('canvas');
        c.width = img.naturalWidth; c.height = img.naturalHeight;
        const ctx = c.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(img, 0, 0);
        const { data } = ctx.getImageData(0, 0, c.width, c.height);
        let minX = c.width, minY = c.height, maxX = -1, maxY = -1;
        for (let y = 0; y < c.height; y++) {
          for (let x = 0; x < c.width; x++) {
            const i = (y * c.width + x) * 4;
            const a = data[i + 3];
            if (a < 16) { continue; }
            // treat near-white as background too: these symbols ship on white plates
            if (data[i] > 245 && data[i + 1] > 245 && data[i + 2] > 245) { continue; }
            if (x < minX) { minX = x; } if (x > maxX) { maxX = x; }
            if (y < minY) { minY = y; } if (y > maxY) { maxY = y; }
          }
        }
        if (maxX < 0) { return 'blank'; }
        return {
          left_pct: round((minX / c.width) * 100),
          right_pct: round(((c.width - 1 - maxX) / c.width) * 100),
          top_pct: round((minY / c.height) * 100),
          bottom_pct: round(((c.height - 1 - maxY) / c.height) * 100)
        };
      } catch (e) {
        return 'unreadable (' + e.name + ')';
      }
    };

    const rows = buttons.slice(0, 6).map((btn) => {
      const holder = btn.querySelector('.img_holder');
      const img = btn.querySelector('img.symbol');
      const label = btn.querySelector('.button-label-holder');
      const b = btn.getBoundingClientRect();
      const h = holder && holder.getBoundingClientRect();
      const i = img.getBoundingClientRect();
      const l = label && label.getBoundingClientRect();
      const cs = getComputedStyle(img);
      const fit = (() => {
        if (!img.naturalWidth || !img.naturalHeight) { return null; }
        const scale = Math.min(i.width / img.naturalWidth, i.height / img.naturalHeight);
        return { w: round(img.naturalWidth * scale), h: round(img.naturalHeight * scale) };
      })();
      // The label BOX is not the label's ink: the line box inside it is what the symbol
      // actually has to clear. Measure it with a Range over the text node.
      const lineRect = (() => {
        const span = btn.querySelector('span.button-label');
        const node = span && span.firstChild;
        if (!node || node.nodeType !== 3) { return null; }
        const r = document.createRange();
        r.selectNodeContents(span);
        const rr = r.getBoundingClientRect();
        return rr && rr.height ? rr : null;
      })();
      return {
        label_text: (btn.textContent || '').trim().slice(0, 12),
        button: { w: round(b.width), h: round(b.height) },
        label_holder: l ? { top: round(l.top - b.top), h: round(l.height), bottom_in_btn: round(l.bottom - b.top) } : null,
        label_line: lineRect ? { top: round(lineRect.top - b.top), bottom: round(lineRect.bottom - b.top) } : null,
        holder: h ? { top: round(h.top - b.top), left: round(h.left - b.left), w: round(h.width), h: round(h.height) } : 'NO .img_holder',
        img_box: { top: round(i.top - b.top), left: round(i.left - b.left), w: round(i.width), h: round(i.height) },
        img_transform: cs.transform === 'none' ? 'none' : cs.transform,
        object_fit: cs.objectFit,
        natural: { w: img.naturalWidth, h: img.naturalHeight },
        contain_fit_px: fit,
        ink_margin_pct_of_file: inkBox(img),
        src: (img.currentSrc || img.src).slice(0, 300)
      };
    });

    return {
      path: location.pathname,
      shell_classes: shell ? shell.className : '(no #within_ember)',
      board_classes: board.className,
      viewport: { w: window.innerWidth, h: window.innerHeight },
      band_var: getComputedStyle(buttons[0]).getPropertyValue('--ll-symbol-band').trim(),
      buttons: rows
    };
  });
}

/*
 * qa-helpers#login waits on `waitForFunction(() => !document.querySelector('#identification'))`,
 * which rejects with "Execution context was destroyed" when the app navigates to
 * /login/device at just the wrong moment and reports it as a credential failure. Poll the
 * URL instead — same flow, no execution-context dependency.
 */
async function signIn(page) {
  console.error('[probe] login…');
  await page.goto(opts.BASE + '/login', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await sleep(2000);
  if (!(await page.$('#identification'))) { return; }
  await page.type('#identification', opts.USER);
  await page.type('#password', opts.PASS);
  await page.keyboard.press('Enter');
  for (let i = 0; i < 60; i++) {
    await sleep(500);
    const url = page.url();
    if (/\/login\/device/.test(url)) {
      const trust = await page.$('button.login-btn--device');
      if (trust) { await trust.click().catch(() => {}); }
    } else if (!/\/login/.test(url)) {
      await sleep(1500);
      return;
    }
  }
  throw new Error('never left ' + page.url());
}

(async () => {
  let browser;
  try {
    let page;
    ({ browser, page } = await launch(opts));
    await page.setViewport({ width: WIDTH, height: HEIGHT });
    await signIn(page);

    const target = BOARD ? opts.BASE + '/' + BOARD : null;
    if (target) {
      console.error('[probe] opening ' + target);
      await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 60000 });
      for (let i = 0; i < 40; i++) {
        await sleep(500);
        const ready = await page.evaluate(() => !!document.querySelector('.board a.button img.symbol')).catch(() => false);
        if (ready) { break; }
      }
    }
    await sleep(2000);
    console.error('[probe] measuring at ' + page.url());

    /*
     * The band is derived from the label's font size, so it has to hold for every
     * `button_text` preference, not just the one this account happens to have. Swap the
     * size class the controller would have put on `.board` and re-measure the one number
     * that matters: the gap between the bottom of the label's ink and the top of the band.
     * Negative = the symbol is sitting on the text.
     */
    const sweep = await page.evaluate(() => {
      const board = document.querySelector('.board');
      if (!board) { return null; }
      const sizes = ['text_small', 'text_medium', 'text_large', 'text_huge', 'text_none'];
      const had = sizes.filter((c) => board.classList.contains(c));
      const out = {};
      for (const size of sizes) {
        sizes.forEach((c) => board.classList.remove(c));
        board.classList.add(size);
        board.getBoundingClientRect();
        const btn = Array.from(board.querySelectorAll('a.button')).find((b) => b.querySelector('img.symbol'));
        const holder = btn.querySelector('.img_holder');
        const span = btn.querySelector('span.button-label');
        const r = document.createRange();
        r.selectNodeContents(span);
        const line = r.getBoundingClientRect();
        const h = holder.getBoundingClientRect();
        const b = btn.getBoundingClientRect();
        out[size] = {
          band: getComputedStyle(btn).getPropertyValue('--ll-symbol-band').trim(),
          label_px: getComputedStyle(span).fontSize,
          line_bottom: Math.round((line.bottom - b.top) * 10) / 10,
          band_top: Math.round((h.top - b.top) * 10) / 10,
          gap: Math.round((h.top - line.bottom) * 10) / 10,
          symbol_h: Math.round(h.height * 10) / 10
        };
      }
      sizes.forEach((c) => board.classList.remove(c));
      had.forEach((c) => board.classList.add(c));
      return out;
    });
    console.error('[probe] text-size sweep: ' + JSON.stringify(sweep, null, 1));

    let res = await measure(page);
    if (res.error && !BOARD) {
      console.log('[info] no board at ' + page.url() + ' — pass --board <user>/<key>');
    }
    console.log(JSON.stringify(res, null, 2));
    process.exit(0);
  } catch (e) {
    console.error('[harness] ' + (e && e.stack ? e.stack : e));
    process.exit(2);
  } finally {
    if (browser) { await browser.close().catch(() => {}); }
  }
})();
