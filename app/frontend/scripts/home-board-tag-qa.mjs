/**
 * After a supervisor picks a home board for a communicator, does the HOME BOARD tag show on
 * that communicator's boards page?
 *
 * The badge renders on `is-equal board.board.key model.preferences.home_board.key`
 * (available-boards-section.hbs:403). So it needs BOTH: the server value written, and the
 * CLIENT's user record carrying it. A stale cached user record shows no badge even though
 * the pick succeeded — which is indistinguishable, from the outside, from the pick failing.
 *
 * Usage:
 *   node scripts/home-board-tag-qa.mjs --user <supervisor> --pass <p> --subject <communicator>
 */
/* eslint-env node */
import { cliArgs, launch, login } from './qa-helpers.mjs';

const OPTS = cliArgs(process.argv);
const SUBJECT = OPTS.arg('--subject', null);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const { browser, page } = await launch(OPTS);
  page.on('pageerror', (e) => console.log('  [pageerror]', e.message));
  try {
    await login(page, OPTS);
    await page.goto(`${OPTS.BASE}/${SUBJECT}/boards`, { waitUntil: 'networkidle2', timeout: 60000 });
    await sleep(7000);
    const s = await page.evaluate(() => {
      let model_home = '(unreadable)';
      try {
        const c = window.LingoLinq && window.LingoLinq.__container__;
        const ctrl = c && c.lookup('controller:user/index');
        model_home = ctrl ? JSON.stringify(ctrl.get('model.preferences.home_board')) : '(no controller)';
      } catch (e) { model_home = '(err ' + e.message + ')'; }
      return {
        model_home,
        badges: document.querySelectorAll('.ub-boards-page__board-item-home-badge').length,
        homeItems: document.querySelectorAll('.ub-boards-page__board-item--home').length,
        tiles: document.querySelectorAll('.ub-boards-page__board-item').length,
        keys: [...document.querySelectorAll('.ub-boards-page__board-item')]
          .map((t) => (t.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 26)).slice(0, 8)
      };
    });
    console.log(`client model.preferences.home_board = ${s.model_home}`);
    console.log(`tiles=${s.tiles}  HOME BOARD badges=${s.badges}  --home items=${s.homeItems}`);
    console.log(`first tiles: ${s.keys.join(' | ')}`);
  } finally { await browser.close(); }
})();
