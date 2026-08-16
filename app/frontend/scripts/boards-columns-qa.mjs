/**
 * Boards page column-split probe — verifies FOLDERS sits at 1/4 on the left and
 * BOARDS at 3/4 on the right, in BOTH Gentle and Focused View, and that the split
 * collapses back to stacked below the 1024px breakpoint.
 *
 * Reports the measured width RATIO rather than raw pixels, so the assertion holds
 * at any viewport: folders should be ~0.25 of the content row, boards ~0.75.
 *
 *   nvm use 22 && node scripts/boards-columns-qa.mjs [--user example --pass password]
 */
/* eslint-env node */
import { cliArgs, launch, login } from './qa-helpers.mjs';

const opts = cliArgs(process.argv);
const WIDTHS = [1440, 1280, 1100, 1024, 900, 700];

async function setLayout(page, layout) {
  return page.evaluate((l) => {
    if (!window.appState) { return 'window.appState missing'; }
    window.appState.set('sessionUser.preferences.dashboard_layout', l);
    if (window.LingoLinq && window.LingoLinq.set_layout_scope) { window.LingoLinq.set_layout_scope(l); }
    return true;
  }, layout);
}

function probe() {
  const body = document.querySelector('.ub-boards-page__boards-body');
  const folders = document.querySelector('.ub-boards-page__folders-section');
  const boards = document.querySelector('.ub-boards-page__boards-summary-section');
  if (!body) { return { err: 'no .ub-boards-page__boards-body' }; }
  const r = (el) => {
    if (!el) { return null; }
    const b = el.getBoundingClientRect();
    return { left: Math.round(b.left), top: Math.round(b.top + window.scrollY), w: Math.round(b.width) };
  };
  return {
    focused: document.body.classList.contains('ll-layout-focused'),
    display: getComputedStyle(body).display,
    cols: getComputedStyle(body).gridTemplateColumns,
    bodyW: Math.round(body.getBoundingClientRect().width),
    folders: r(folders),
    boards: r(boards),
    hasBoth: !!(folders && boards)
  };
}

(async () => {
  const { browser, page } = await launch(opts);
  try {
    await login(page, opts);
    for (const layout of ['gentle', 'focused']) {
      await page.setViewport({ width: WIDTHS[0], height: 900 });
      await page.goto(opts.BASE + '/' + opts.USER + '/boards', { waitUntil: 'networkidle2', timeout: 45000 });
      await setLayout(page, layout);
      await page.waitForSelector('.ub-boards-page__boards-body', { timeout: 20000 }).catch(() => {});
      await new Promise((rr) => setTimeout(rr, 2000));

      console.log('\n=== ' + layout.toUpperCase() + ' VIEW ===');
      for (const w of WIDTHS) {
        await page.setViewport({ width: w, height: 900 });
        await new Promise((rr) => setTimeout(rr, 400));
        const m = await page.evaluate(probe);
        if (m.err) { console.log(String(w).padStart(5) + '  ' + m.err); continue; }
        if (!m.hasBoth) {
          console.log(String(w).padStart(5) + '  both subsections NOT present (folders=' +
            !!m.folders + ' boards=' + !!m.boards + ') — grid intentionally not applied');
          continue;
        }
        const fRatio = (m.folders.w / m.bodyW), bRatio = (m.boards.w / m.bodyW);
        const sideBySide = m.folders.top === m.boards.top;
        console.log(
          String(w).padStart(5) + '  display=' + m.display.padEnd(6) +
          ' folders ' + String(m.folders.w).padStart(4) + 'px (' + fRatio.toFixed(2) + ')' +
          ' boards ' + String(m.boards.w).padStart(4) + 'px (' + bRatio.toFixed(2) + ')' +
          '  ' + (sideBySide ? 'SIDE-BY-SIDE (tops aligned)' : 'stacked')
        );
      }
    }
  } finally {
    await browser.close();
  }
})();
