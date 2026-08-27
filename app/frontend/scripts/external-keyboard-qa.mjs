/**
 * Does typing on a physical keyboard populate the vocalization box in speak mode?
 *
 * The path under test: raw_events.js keydown -> `buttonTracker.check('keyboard_listen')`
 * (speak mode only) -> `appState.activate_button({}, {vocalization: '+<char>'})`. The gate
 * is `preferences.device.external_keyboard`.
 *
 * CORRECTED 2026-08-26: this header used to say that preference "has no server-side
 * default". It has one now — `User.preference_defaults['device']['external_keyboard'] = true`
 * (app/models/user.rb), and `generate_defaults` backfills it onto EVERY device of EVERY
 * existing user. The two-pass "as the account has it / forced on" structure below therefore
 * measures the same thing twice on a default account; it is kept only for an account whose
 * device hash explicitly turned it OFF.
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

/* This file was console.log-only, so a total regression of the guarded path exited 0. The
   field-guard checks below are real assertions and gate the exit code. */
let passN = 0, failN = 0;
function check(name, ok, detail) {
  if (ok) { passN++; console.log(`  [PASS] ${name}${detail ? ' — ' + detail : ''}`); }
  else { failN++; console.log(`  [FAIL] ${name}${detail ? ' — ' + detail : ''}`); }
}

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
    /* RELOAD before testing the other path, so the in-memory `external_keyboard` set above
       (never saved) is dropped and the Phrase Builder is exercised in the account's real state.

       CORRECTED 2026-08-26: this used to claim "the keydown handler does NOT skip input
       elements (raw_events.js:452, the guard is commented out)". That is false. The guard is
       live — `typing_into_a_field()` is defined at raw_events.js:383 and applied at the
       character-typing gate (~:508) and, as of today, at the Escape and Backspace gates too
       (~:569 / ~:587). Line 452 is inside the `special_keys` array literal, not a guard. The
       reload is still worth doing, but not for the reason previously given. */
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

        /* THE REGRESSION THIS FILE MOST NEEDS TO COVER, and did not until 2026-08-26.
           raw_events.js has THREE `check('keyboard_listen')` gates, not one. The
           character-typing gate returns early for everything in `special_keys` — which
           CONTAINS "Escape" and "Backspace" — so typing letters proves nothing about the
           other two gates, which is where those keys are actually processed:
             Escape    -> activate_button(':clear')     wipes the WHOLE utterance
             Backspace -> activate_button(':backspace') deletes the last chip
           Neither carried the `typing_into_a_field` guard, so a communicator fixing a typo
           in this very search box (a plain <input>, not in a modal) destroyed the sentence
           they were composing. Assert the utterance is UNCHANGED across both keys. */
        console.log('\n--- field guard: Escape / Backspace must not reach the utterance ---');
        await page.evaluate(() => {
          const el = document.getElementById('bd-phrase-builder-search');
          if (el) { el.focus(); }
        });
        const focused = await page.evaluate(() => document.activeElement && document.activeElement.id);
        if (focused !== 'bd-phrase-builder-search') {
          check('precondition — the search input holds focus', false, `activeElement is "${focused}"`);
        } else {
          check('precondition — the search input holds focus', true);
          const before = await page.evaluate(STATE);
          await page.keyboard.press('Backspace');
          await sleep(600);
          const afterBk = await page.evaluate(STATE);
          check('Backspace in a text field does NOT delete an utterance chip',
            afterBk.sentence === before.sentence, `[${before.sentence}] -> [${afterBk.sentence}]`);

          await page.keyboard.press('Escape');
          await sleep(600);
          const afterEsc = await page.evaluate(STATE);
          check('Escape in a text field does NOT clear the utterance',
            afterEsc.sentence === before.sentence, `[${before.sentence}] -> [${afterEsc.sentence}]`);

          /* POSITIVE CONTROL. The two assertions above are negative, so on their own they
             cannot distinguish "the guard works" from "the utterance was empty" or "the
             keys never reached the app at all". Blur the field and press Backspace: with
             focus on the body the guard must NOT apply and the utterance MUST change. If
             this does not fire, the two passes above mean nothing. */
          if (before.sentence) {
            await page.evaluate(() => { document.activeElement && document.activeElement.blur(); });
            await sleep(300);
            await page.keyboard.press('Backspace');
            await sleep(700);
            const outside = await page.evaluate(STATE);
            check('POSITIVE CONTROL — Backspace OUTSIDE a field still edits the utterance',
              outside.sentence !== before.sentence, `[${before.sentence}] -> [${outside.sentence}]`);
          } else {
            check('POSITIVE CONTROL — Backspace OUTSIDE a field still edits the utterance',
              false, 'utterance was empty, so the control could not run — the two passes above are unproven');
          }
        }
    }
  } finally {
    if (passN + failN) {
      console.log(`\n${passN} passed, ${failN} failed`);
    }
    await browser.close();
    if (failN) { process.exitCode = 1; }
  }
})();
