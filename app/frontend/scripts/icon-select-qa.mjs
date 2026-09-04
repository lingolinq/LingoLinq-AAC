/**
 * Board-creation Advanced Options: are the board-icon thumbnails actually selectable?
 *
 * The picker is `components/icon-select`. Each thumbnail is an <img> with
 * `{{on "click" (this.ctrlAction "pick" icon.url)}}`, and `pick` calls the parent's
 * `@action={{mut this.model.image_url}}`. So a click should end up in the URL input above.
 *
 * Checks the two ways this fails apart: whether the click REACHES the img (hit-test, in case
 * something is layered over it or pointer-events is off), and whether picking CHANGES the
 * input (in case the handler runs but writes somewhere the UI does not read).
 *
 * Usage:  node scripts/icon-select-qa.mjs --user <u> --pass <p>
 */
/* eslint-env node */
import { cliArgs, launch, login } from './qa-helpers.mjs';

const OPTS = cliArgs(process.argv);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const { browser, page } = await launch(OPTS);
  page.on('pageerror', (e) => console.log('  [pageerror]', e.message));
  try {
    await login(page, OPTS);
    await page.goto(`${OPTS.BASE}/create-board-new`, { waitUntil: 'networkidle2', timeout: 60000 });
    await sleep(5000);

    /* Advanced Options is collapsed; so is the icon disclosure inside it. */
    const opened = await page.evaluate(() => {
      const hits = [];
      const clickByText = (re) => {
        const b = [...document.querySelectorAll('button, [role="button"]')]
          .find((x) => re.test((x.textContent || '').replace(/\s+/g, ' ').trim()));
        if (b) { b.click(); hits.push((b.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 24)); return true; }
        return false;
      };
      clickByText(/advanced options/i);
      return hits;
    });
    await sleep(1500);
    await page.evaluate(() => {
      const b = [...document.querySelectorAll('button, [role="button"]')]
        .find((x) => /icon for your board/i.test((x.textContent || '')));
      if (b) { b.click(); }
    });
    await sleep(2000);
    console.log(`opened: ${opened.join(' | ') || '(nothing matched)'}`);

    const state = await page.evaluate(() => {
      const panel = document.querySelector('#nb-icon-picker-panel');
      const imgs = [...document.querySelectorAll('.icon_urls img')];
      if (!imgs.length) { return { none: true, panel: !!panel }; }
      const img = imgs[Math.min(3, imgs.length - 1)];
      const r = img.getBoundingClientRect();
      const cx = Math.round(r.left + r.width / 2), cy = Math.round(r.top + r.height / 2);
      const hit = document.elementFromPoint(cx, cy);
      const cs = getComputedStyle(img);
      const input = document.querySelector('#image_url');
      return {
        count: imgs.length,
        panel: !!panel,
        box: Math.round(r.width) + 'x' + Math.round(r.height) + ' @' + cx + ',' + cy,
        pointer_events: cs.pointerEvents,
        hit: hit ? hit.tagName.toLowerCase() + '.' + (typeof hit.className === 'string' ? hit.className.trim().split(/\s+/).join('.') : '') : '(none)',
        reaches_img: hit === img,
        input_before: input ? input.value : '(no input)'
      };
    });
    console.log(JSON.stringify(state, null, 0));
    if (state.none) { return; }

    const after = await page.evaluate(() => {
      const imgs = [...document.querySelectorAll('.icon_urls img')];
      const img = imgs[Math.min(3, imgs.length - 1)];
      const src = img.getAttribute('src');
      img.click();
      return { clicked_src: src.slice(-40) };
    });
    await sleep(1500);
    const result = await page.evaluate(() => {
      const input = document.querySelector('#image_url');
      const prev = document.querySelector('.icon-select__preview-img');
      return { input_after: input ? input.value.slice(-40) : '(no input)', preview: prev ? prev.getAttribute('src').slice(-40) : '(none)' };
    });
    console.log(`clicked ...${after.clicked_src}`);
    console.log(`  input now: ...${result.input_after}`);
    console.log(`  preview:   ...${result.preview}`);
  } finally { await browser.close(); }
})();
