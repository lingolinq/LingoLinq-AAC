/**
 * Supervisor on a COMMUNICATOR's boards page -> "Change Home Board" -> picker -> preview ->
 * "Pick this Board". Whose home board changes?
 *
 * The picker assigns to `app_state.setup_user || app_state.currentUser`, so the whole thing
 * turns on whether this entry point carries `?user_id=<communicator>`. That comes from
 * available-boards-section#boardPickerQuery, which compares `boardsCtrl.model.id` against
 * `appState.currentUser.id` — and currentUser.id is sometimes the 'self' sentinel rather
 * than a global id, which is a known trap in this codebase.
 *
 * Reports the LINK's href before clicking, so a missing param is visible as the cause rather
 * than inferred from the outcome.
 *
 * Usage:
 *   node scripts/change-home-board-qa.mjs --user <supervisor> --pass <p> --subject <communicator>
 */
/* eslint-env node */
import { cliArgs, launch, login } from './qa-helpers.mjs';

const OPTS = cliArgs(process.argv);
const SUBJECT = OPTS.arg('--subject', null);
const CARD = parseInt(OPTS.arg('--card', '2'), 10);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const { browser, page } = await launch(OPTS);
  page.on('pageerror', (e) => console.log('  [pageerror]', e.message));
  try {
    await login(page, OPTS);
    await page.goto(`${OPTS.BASE}/${SUBJECT}/boards`, { waitUntil: 'networkidle2', timeout: 60000 });
    await sleep(6000);

    const link = await page.evaluate(() => {
      const a = document.querySelector('.ub-boards-page__set-home-btn');
      const ids = (() => {
        try {
          const cu = window.appState.get('currentUser');
          return { currentUser_id: cu && cu.get('id'), currentUser_name: cu && cu.get('user_name') };
        } catch (e) { return { err: true }; }
      })();
      return a ? { text: (a.textContent || '').replace(/\s+/g, ' ').trim(), href: a.getAttribute('href'), ids } : { none: true, ids };
    });
    if (link.none) { console.log('  "Set/Change Home Board" button not found on the page'); return; }
    console.log(`1. button "${link.text}"`);
    console.log(`   href = ${link.href}`);
    console.log(`   appState.currentUser.id = ${JSON.stringify(link.ids.currentUser_id)} (${link.ids.currentUser_name})`);
    console.log(`   -> carries user_id? ${String(link.href || '').indexOf('user_id') >= 0 ? 'YES' : 'NO  <-- the pick will fall back to currentUser'}`);

    await page.evaluate(() => { document.querySelector('.ub-boards-page__set-home-btn').click(); });
    await sleep(6000);
    const s = await page.evaluate(() => {
      const a = window.appState;
      const u = (p) => { try { const v = a.get(p); return v && v.get ? v.get('user_name') : String(v); } catch (e) { return '(err)'; } };
      return { path: window.location.pathname + window.location.search, setup_user: u('setup_user'), currentUser: u('currentUser') };
    });
    console.log(`2. picker  path=${s.path}`);
    console.log(`   setup_user=${s.setup_user}  currentUser=${s.currentUser}`);

    /* Pick a card by INDEX and report which one. The first run clicked card 0 twice across
       two runs and the subject's home board was already that board — "nothing changed" then
       means "re-picked the same board", not "the feature is broken". */
    const picked = await page.evaluate((idx) => {
      const cards = [...document.querySelectorAll('.simple_board_icon')];
      const c = cards[idx];
      if (!c) { return null; }
      const label = (c.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 40);
      c.click();
      return { label, of: cards.length };
    }, CARD);
    console.log(`   previewing card #${CARD}: ${picked ? '"' + picked.label + '" (of ' + picked.of + ')' : 'NONE FOUND'}`);
    await sleep(4500);
    const btn = await page.evaluate(() => {
      const b = document.querySelector('.md-board-preview__action--primary');
      if (!b) { return null; }
      const t = (b.textContent || '').trim();
      b.click();
      return t;
    });
    console.log(`3. clicked "${btn}"`);
    for (let i = 0; i < 20; i++) {
      await sleep(1000);
      const p = await page.evaluate(() => window.location.pathname);
      if (p.indexOf('board-picker') === -1) { console.log(`   landed on ${p} after ~${i}s`); break; }
    }
  } finally { await browser.close(); }
})();
