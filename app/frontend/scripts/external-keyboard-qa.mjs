/**
 * Does typing on a physical keyboard populate the vocalization box in speak mode?
 *
 * The path under test: raw_events.js keydown -> `buttonTracker.check('keyboard_listen')`
 * (speak mode only) -> `appState.activate_button({}, {vocalization: '+<char>'})`. The gate
 * is `preferences.device.external_keyboard`, which has no server-side default, so this
 * reports the SAME typing test twice — with the preference left as the account has it, and
 * again with it forced on — because "it does not work" and "it is switched off" look
 * identical from the outside.
 *
 * Reads `app_state.button_list` (what the sentence bar renders from) rather than the DOM,
 * so a styling change cannot make a working feature look broken.
 *
 * Usage:
 *   node scripts/external-keyboard-qa.mjs --user <u> --pass <p> --board <slug>
 */
/* eslint-env node */
import { cliArgs, launch, login } from './qa-helpers.mjs';

const OPTS = cliArgs(process.argv);
const BOARD = OPTS.arg('--board', null);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const STATE = () => ({
  speak_mode: !!(window.appState && window.appState.get('speak_mode')),
  current_mode: window.stashes ? window.stashes.get('current_mode') : '(no stashes)',
  /* raw_events.js exposes buttonTracker as `window.buttons` (raw_events.js:3283). */
  keyboard_listen: window.buttons ? window.buttons.keyboard_listen : '(no buttonTracker)',
  check_says: window.buttons && window.buttons.check ? window.buttons.check('keyboard_listen') : '(n/a)',
  pref: (function() {
    try {
      const u = window.appState.get('currentUser');
      return u && u.get('preferences.device.external_keyboard');
    } catch (e) { return '(unreadable)'; }
  })(),
  sentence: (function() {
    try {
      return (window.appState.get('button_list') || []).map((b) => b.label).join('|');
    } catch (e) { return '(unreadable)'; }
  })()
});

async function typeAndRead(page, text) {
  await page.evaluate(() => {
    try { window.appState.activate_button({vocalization: ':clear'}, {vocalization: ':clear', label: 'clear', prevent_return: true, type: 'speak'}); } catch (e) { /* nothing to clear */ }
  });
  await sleep(400);
  for (const ch of text) { await page.keyboard.press(ch === ' ' ? 'Space' : `Key${ch.toUpperCase()}`); await sleep(120); }
  await sleep(600);
  return page.evaluate(STATE);
}

(async () => {
  const { browser, page } = await launch(OPTS);
  page.on('pageerror', (e) => console.log('  [pageerror]', e.message));
  try {
    await login(page, OPTS);
    await page.goto(`${OPTS.BASE}/${OPTS.USER}/board-detail/${BOARD}`, { waitUntil: 'networkidle2', timeout: 60000 });
    await page.waitForSelector('.md-board-detail-grid', { timeout: 30000 });
    await sleep(3000);

    console.log('--- as the account currently stands ---');
    let s = await typeAndRead(page, 'cat');
    console.log(`  speak_mode=${s.speak_mode}  current_mode=${s.current_mode}`);
    console.log(`  preferences.device.external_keyboard=${JSON.stringify(s.pref)}  keyboard_listen=${JSON.stringify(s.keyboard_listen)}  check('keyboard_listen')=${JSON.stringify(s.check_says)}`);
    console.log(`  typed "cat" -> sentence box: [${s.sentence}]`);

    /* Turn the PREFERENCE on in memory and let the real path propagate it — no save, so
       the account is left exactly as it was. This is the difference between "the feature is
       broken" and "the feature is switched off". */
    await page.evaluate(() => {
      const u = window.appState.get('currentUser');
      const p = Object.assign({}, u.get('preferences'));
      p.device = Object.assign({}, p.device, { external_keyboard: true });
      u.set('preferences', p);
      window.appState.check_scanning();
    });
    await sleep(600);
    console.log('--- with preferences.device.external_keyboard = true (in memory, not saved) ---');
    s = await typeAndRead(page, 'cat');
    console.log(`  keyboard_listen=${JSON.stringify(s.keyboard_listen)}  check('keyboard_listen')=${JSON.stringify(s.check_says)}`);
    console.log(`  typed "cat" -> sentence box: [${s.sentence}]`);
    /* RELOAD before testing the other path. The in-memory `external_keyboard` above was
       never saved, so a reload drops it — and it has to be dropped, because the keydown
       handler does NOT skip input elements (raw_events.js:452, the guard is commented out),
       so with it on, typing into the Phrase Builder's search box ALSO appends to the
       vocalization box and neither result can be trusted. */
    await page.reload({ waitUntil: 'networkidle2', timeout: 60000 });
    await page.waitForSelector('.md-board-detail-grid', { timeout: 30000 });
    await sleep(3000);
    const clean = await page.evaluate(STATE);
    console.log('--- Phrase Builder (clean reload) ---');
    console.log(`  keyboard_listen back to ${JSON.stringify(clean.keyboard_listen)}, sentence box [${clean.sentence}]`);
    const nav = await page.evaluate(() => {
      const btn = [...document.querySelectorAll('[data-bd-action="nav_select"]')]
        .find((b) => b.getAttribute('data-bd-arg') === 'phrase-builder');
      return {
        present: !!btn,
        visible: btn ? !!(btn.offsetWidth || btn.offsetHeight || btn.getClientRects().length) : false,
        label: btn ? (btn.textContent || '').trim() : '(none)'
      };
    });
    console.log(`  nav item present=${nav.present} visible=${nav.visible} label="${nav.label}"`);
    if (nav.present) {
      await page.evaluate(() => {
        [...document.querySelectorAll('[data-bd-action="nav_select"]')]
          .find((b) => b.getAttribute('data-bd-arg') === 'phrase-builder').click();
      });
      await sleep(1500);
      const box = await page.$('#bd-phrase-builder-search');
      console.log(`  after clicking it, the type-a-word input exists: ${!!box}`);
      if (box) {
        await box.type('want');
        await sleep(2500);
        const res = await page.evaluate(() => {
          const q = (sel) => document.querySelectorAll(sel).length;
          const panel = document.querySelector('.md-board-detail-phrase-builder');
          return {
            chips: q('.md-board-detail-phrase-builder__chip'),
            sentence_match: q('.md-board-detail-phrase-builder__sentence-chip--match'),
            sentence_missing: q('.md-board-detail-phrase-builder__sentence-chip--missing'),
            empty: (document.querySelector('.md-board-detail-phrase-builder__empty') || {}).textContent || '',
            /* Whatever the panel is actually showing, so a wrong selector cannot be read as
               a broken feature (it was, once — see the working log). */
            text: panel ? (panel.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 220) : '(no panel)'
          };
        });
        console.log(`  typed "want" -> chips=${res.chips} sentence_match=${res.sentence_match} sentence_missing=${res.sentence_missing}`);
        console.log(`  panel says: "${res.text}"`);

        /* And does selecting one actually reach the vocalization box? */
        const picked = await page.evaluate(() => {
          const btn = document.querySelector('.md-board-detail-phrase-builder__sentence-chip--match, .md-board-detail-phrase-builder__chip');
          if(!btn) { return null; }
          btn.click();
          return (btn.textContent || '').trim();
        });
        await sleep(1400);
        /* Read the SENTENCE BAR the user sees. board-detail renders it from the controller's
           own `sentence_parts` (board-detail.hbs:703), NOT from `app_state.button_list` — so
           reading button_list here reports a working feature as broken. */
        const after = await page.evaluate(() => ({
          bar: [...document.querySelectorAll('.md-board-detail-sentence-bar__chip')]
            .map((c) => (c.textContent || '').replace(/\s+/g, ' ').trim()).join('|'),
          button_list: (window.appState.get('button_list') || []).map((b) => b.label).join('|')
        }));
        console.log(`  clicked "${picked}" -> sentence BAR: [${after.bar}]`);
        console.log(`  ${''.padEnd(20)}app_state.button_list: [${after.button_list}]`);
      }
    }
  } finally { await browser.close(); }
})();
