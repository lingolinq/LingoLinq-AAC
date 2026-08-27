/*
 * Where does the folders CARET actually render on the Boards page in side-by-side?
 *
 * Written because the same element was "fixed" three times from CSS reasoning alone and
 * landed in the wrong place each time. Reasoning about which rules SHOULD win is not
 * evidence — this reports what the browser actually computed: the container width (which
 * decides whether the @container hoist is live), the display mode of the header, and the
 * measured rectangles of the caret against the FOLDERS label.
 *
 *   node scripts/folders-caret-qa.mjs [--base http://localhost:8184] [--user example]
 */
import { cliArgs, launch, login } from './qa-helpers.mjs';

const args = cliArgs(process.argv);
const { browser, page } = await launch(args);

try {
  await login(page, args);
  await page.goto(args.BASE + '/example/boards', { waitUntil: 'networkidle2', timeout: 60000 });
  await page.waitForSelector('.ub-boards-page__folders-header', { timeout: 30000 });

  // Force side-by-side the way the toggle does, then let the grid settle.
  await page.evaluate(() => { document.body.setAttribute('data-boards-layout', 'side-by-side'); });
  await new Promise(r => setTimeout(r, 800));

  // Make sure the folders accordion is expanded — the caret and the action pills only
  // render meaningfully when it is.
  const expanded = await page.evaluate(() => {
    const t = document.querySelector('.ub-boards-page__folders-toggle');
    return t ? t.getAttribute('aria-expanded') : null;
  });
  if (expanded === 'false') {
    await page.click('.ub-boards-page__folders-toggle').catch(() => {});
    await new Promise(r => setTimeout(r, 600));
  }

  const out = await page.evaluate(() => {
    const q = s => document.querySelector(s);
    const box = el => {
      if (!el) { return null; }
      const r = el.getBoundingClientRect();
      return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
    };
    const section = q('.ub-boards-page__folders-section');
    const header = q('.ub-boards-page__folders-header');
    const toggle = q('.ub-boards-page__folders-toggle');
    const title = q('.ub-boards-page__folders-title');
    const caret = q('.ub-boards-page__folders-chevron-btn');
    const actions = q('.ub-boards-page__folders-actions--header');
    const cs = el => (el ? getComputedStyle(el) : null);

    return {
      containerWidth: section ? Math.round(section.getBoundingClientRect().width) : null,
      containerQueryLive: section ? Math.round(section.getBoundingClientRect().width) <= 420 : null,
      header: { display: cs(header) && cs(header).display, box: box(header) },
      section: {
        display: cs(section) && cs(section).display,
        columns: cs(section) && cs(section).gridTemplateColumns,
        areas: cs(section) && cs(section).gridTemplateAreas
      },
      toggle: { box: box(toggle), gridArea: cs(toggle) && cs(toggle).gridArea, order: cs(toggle) && cs(toggle).order },
      title: { box: box(title), text: title && title.textContent.trim().slice(0, 24) },
      caret: {
        box: box(caret),
        gridArea: cs(caret) && cs(caret).gridArea,
        order: cs(caret) && cs(caret).order,
        justifySelf: cs(caret) && cs(caret).justifySelf
      },
      actions: { box: box(actions), gridArea: cs(actions) && cs(actions).gridArea, order: cs(actions) && cs(actions).order }
    };
  });

  console.log(JSON.stringify(out, null, 1));

  // The verdict, stated plainly rather than left to be eyeballed.
  const t = out.title.box, c = out.caret.box;
  if (t && c) {
    const sameRow = Math.abs((c.y + c.h / 2) - (t.y + t.h / 2)) < 24;
    console.log('\nCARET ON THE SAME ROW AS "FOLDERS": ' + (sameRow ? 'YES' : 'NO'));
    console.log('  caret centre y=' + Math.round(c.y + c.h / 2) + ', label centre y=' + Math.round(t.y + t.h / 2));
    console.log('  horizontal gap from label right edge: ' + Math.round(c.x - (t.x + t.w)) + 'px');
  }
} finally {
  await browser.close();
}
