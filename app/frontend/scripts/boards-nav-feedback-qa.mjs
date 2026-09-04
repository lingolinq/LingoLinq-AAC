/**
 * Navigating to /:user/boards — is there ANY indication between the click and the content?
 *
 * `6dc2e62ce` removed the full-viewport "Preparing your workspace" overlay from
 * `templates/user/boards.hbs` so the page shell paints immediately, and gave the boards
 * SECTION its own inline "Loading your boards..." state. That is the only place the message
 * was ever removed (verified: it is the one file that lost `.ll-premium-progress`).
 *
 * This samples the DOM every 100ms from the click onward and reports, per frame, whether the
 * app-level loading overlay, the section's inline loader, or real board content is on screen —
 * so a gap with none of the three is visible as a fact rather than an impression.
 *
 * Usage:
 *   node scripts/boards-nav-feedback-qa.mjs --user <u> --pass <p>
 */
/* eslint-env node */
import { cliArgs, launch, login } from './qa-helpers.mjs';

const OPTS = cliArgs(process.argv);
const SLOW = process.argv.includes('--slow');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const FRAME = () => {
  const vis = (el) => !!(el && (el.offsetWidth || el.offsetHeight || el.getClientRects().length));
  return {
    path: window.location.pathname,
    app_overlay: vis(document.querySelector('.ll-premium-progress')) ||
                 !!(window.appState && window.appState.get('loading_overlay_message')),
    overlay_msg: (window.appState && window.appState.get('loading_overlay_message')) || '',
    section_loader: vis(document.querySelector('.ub-boards-page__loading, .ub-boards-page__loading-label')),
    board_cards: document.querySelectorAll('.ub-board-tile, .board_icon, [class*="board-icon"]').length
  };
};

(async () => {
  const { browser, page } = await launch(OPTS);
  page.on('pageerror', (e) => console.log('  [pageerror]', e.message));
  try {
    await login(page, OPTS);
    await page.goto(`${OPTS.BASE}/`, { waitUntil: 'networkidle2', timeout: 60000 });
    await sleep(4000);

    /* `--slow` throttles the network AFTER login. Locally every navigation measured clean,
       which proves nothing about a real connection: the whole point of a routing indicator is
       the window where the request has not come back yet, and on localhost that window is
       ~0ms. Throttling makes the gap visible if there is one. */
    if (SLOW) {
      const cdp = await page.target().createCDPSession();
      await cdp.send('Network.emulateNetworkConditions', {
        offline: false, latency: 300, downloadThroughput: 400 * 1024 / 8, uploadThroughput: 400 * 1024 / 8
      });
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
      console.log('(throttled: 400kbps, 300ms latency, 4x CPU slowdown)');
    }

    const link = await page.evaluate((u) => {
      const a = [...document.querySelectorAll('a[href]')]
        .find((x) => (x.getAttribute('href') || '').replace(/\/$/, '').endsWith('/' + u + '/boards'));
      if (!a) { return null; }
      a.click();
      return a.getAttribute('href');
    }, OPTS.USER);
    if (!link) { console.log('  no Boards link found on the dashboard — cannot measure'); return; }
    console.log(`clicked ${link}`);

    let gap = 0;
    for (let i = 0; i < 40; i++) {
      const f = await page.evaluate(FRAME);
      const any = f.app_overlay || f.section_loader || f.board_cards > 0;
      if (!any) { gap++; }
      if (i % 2 === 0 || !any) {
        console.log(`  ${String(i * 100).padStart(4)}ms  path=${f.path.padEnd(34)} overlay=${f.app_overlay ? 'YES "' + f.overlay_msg + '"' : 'no '} sectionLoader=${f.section_loader ? 'YES' : 'no '} cards=${f.board_cards}${any ? '' : '   <-- NOTHING ON SCREEN'}`);
      }
      if (f.board_cards > 0 && i > 3) { break; }
      await sleep(100);
    }
    console.log(`frames with no indication at all: ${gap}`);

    /* Second navigation: a BOARD CARD on the boards page -> board-detail. The most common
       "routed to another page" action in the app, and a different code path (board-icon /
       board-preview arm their own overlay) from the boards-page load above. */
    await sleep(1500);
    const card = await page.evaluate(() => {
      const el = document.querySelector('.ub-board-tile, .board_icon, [class*="board-icon"]');
      if (!el) { return null; }
      const label = (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 24);
      el.click();
      return label;
    });
    if (!card) { console.log('\nno board card found to click'); return; }
    console.log(`\nclicked board card "${card}"`);
    let gap2 = 0;
    for (let i = 0; i < 45; i++) {
      const f = await page.evaluate(() => {
        const vis = (el) => !!(el && (el.offsetWidth || el.offsetHeight || el.getClientRects().length));
        return {
          path: window.location.pathname,
          overlay: vis(document.querySelector('.ll-premium-progress')) ||
                   !!(window.appState && window.appState.get('loading_overlay_message')),
          msg: (window.appState && window.appState.get('loading_overlay_message')) || '',
          grid: document.querySelectorAll('.md-board-detail-symbol-card').length
        };
      });
      const any = f.overlay || f.grid > 0;
      if (!any) { gap2++; }
      if (i % 3 === 0 || !any) {
        console.log(`  ${String(i * 100).padStart(4)}ms  path=${f.path.padEnd(40)} overlay=${f.overlay ? 'YES "' + f.msg + '"' : 'no '} buttons=${f.grid}${any ? '' : '   <-- NOTHING ON SCREEN'}`);
      }
      if (f.grid > 0 && i > 3) { break; }
      await sleep(100);
    }
    console.log(`frames with no indication at all: ${gap2}`);
  } finally { await browser.close(); }
})();
