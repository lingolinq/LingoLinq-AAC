/**
 * Supervisor picks a home board FOR a communicator — does it land on the right user?
 *
 * `board-preview-overlay#pick_for_home` resolves its target as
 * `app_state.setup_user || app_state.currentUser`, so if `setup_user` is null at PICK time
 * the board is silently assigned to the SUPERVISOR. Both `activate` and `deactivate` on
 * routes/board-picker null it, and the controller re-asserts it in `_resolve_setup_user` —
 * this samples the value at each step of the real flow instead of reasoning about hook order.
 *
 * Usage:
 *   node scripts/pick-home-board-qa.mjs --user <supervisor> --pass <p> --for <communicator_id>
 */
/* eslint-env node */
import { cliArgs, launch, login } from './qa-helpers.mjs';

const OPTS = cliArgs(process.argv);
const FOR_ID = OPTS.arg('--for', null);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const STATE = () => {
  const a = window.appState;
  const g = (p) => { try { return a.get(p); } catch (e) { return '(err)'; } };
  const u = (p) => { const v = g(p); return v && v.get ? v.get('user_name') + '/' + v.get('id') : String(v); };
  return {
    path: window.location.pathname + window.location.search,
    setup_user: u('setup_user'),
    currentUser: u('currentUser'),
    preview_open: !!document.querySelector('.md-board-details-modal'),
    /* What gates the ASSIGN footer: board-preview#pick_for_home_mode is
       `tour_board_picker_active || recommend`. If it is false the preview shows the
       ORDINARY footer, whose primary button calls `select`, not `pick_for_home`. */
    tour_active: !!g('tour_board_picker_active'),
    primary_btn: (function() {
      const b = document.querySelector('.md-board-preview__action--primary');
      return b ? (b.textContent || '').replace(/\s+/g, ' ').trim() : '(none)';
    })(),
    footer_btns: [...document.querySelectorAll('.md-board-preview__action')]
      .map((b) => (b.textContent || '').replace(/\s+/g, ' ').trim()).join(' | ')
  };
};

(async () => {
  const { browser, page } = await launch(OPTS);
  page.on('pageerror', (e) => console.log('  [pageerror]', e.message));
  try {
    await login(page, OPTS);
    await page.goto(`${OPTS.BASE}/board-picker?user_id=${FOR_ID}`, { waitUntil: 'networkidle2', timeout: 60000 });
    await sleep(5000);
    let s = await page.evaluate(STATE);
    console.log(`1. picker loaded            path=${s.path}`);
    console.log(`   setup_user=${s.setup_user}   currentUser=${s.currentUser}`);

    /* Open a board's PREVIEW — the step the report says precedes the failure. */
    /* The (i) badge on a board card — board-icon.hbs `button.info`, aria-label "Preview
       board". The first attempt clicked the CARD instead, which navigates rather than
       opening the preview, so nothing was measured. */
    /* Report what the picker actually renders before clicking. Two selector guesses have
       already missed — the card (which navigates) and board-icon's (i) badge (not present
       here) — and a miss reads exactly like a broken feature. */
    const inventory = await page.evaluate(() => ({
      cards: document.querySelectorAll('.simple_board_icon').length,
      info: document.querySelectorAll('button.info').length,
      previewAria: document.querySelectorAll('[aria-label="Preview board"]').length,
      buttons: [...document.querySelectorAll('button')]
        .map((b) => ((b.textContent || '').replace(/\s+/g, ' ').trim() || b.getAttribute('aria-label') || b.className).slice(0, 26))
        .filter(Boolean).slice(0, 18)
    }));
    console.log(`   page has: cards=${inventory.cards} button.info=${inventory.info} [aria-label="Preview board"]=${inventory.previewAria}`);
    console.log(`   buttons: ${inventory.buttons.join(' | ')}`);
    const opened = await page.evaluate(() => {
      const btn = document.querySelector('button.info, [aria-label="Preview board"], .simple_board_icon');
      if (!btn) { return null; }
      btn.click();
      return btn.getAttribute('aria-label') || btn.className;
    });
    await sleep(4000);
    s = await page.evaluate(STATE);
    console.log(`2. after opening a preview  (clicked: ${opened || 'NOTHING FOUND'})`);
    console.log(`   setup_user=${s.setup_user}   preview_open=${s.preview_open}   tour_active=${s.tour_active}`);
    console.log(`   footer buttons: [${s.footer_btns}]`);
    console.log(`   PRIMARY button: "${s.primary_btn}"`);

    /* And what the pick would resolve to, without actually committing it. */
    const target = await page.evaluate(() => {
      const a = window.appState;
      const t = a.get('setup_user') || a.get('currentUser');
      return t && t.get ? t.get('user_name') + '/' + t.get('id') : String(t);
    });
    console.log(`3. pick_for_home would target: ${target}`);

    /* 4. ACTUALLY CLICK IT, and watch what the app does: errors, the in-progress flag,
          where it navigates, and what it says it did. */
    const errs = [];
    page.on('console', (m) => { if (m.type() === 'error') { errs.push((m.text() || '').slice(0, 120)); } });
    const clicked = await page.evaluate(() => {
      const b = document.querySelector('.md-board-preview__action--primary');
      if (!b) { return null; }
      b.click();
      return (b.textContent || '').trim();
    });
    console.log(`4. clicked "${clicked}"`);
    for (let i = 0; i < 24; i++) {
      await sleep(1000);
      const f = await page.evaluate(() => {
        const a = window.appState;
        const g = (k) => { try { return a.get(k); } catch (e) { return '(err)'; } };
        return {
          path: window.location.pathname,
          in_progress: !!g('board_picker_pick_in_progress'),
          modal: (document.querySelector('.md-modal-title, .modal-title') || {}).textContent || '',
          alert: (document.querySelector('[class*="alert"], .flash, [role="alert"]') || {}).textContent || ''
        };
      });
      if (i % 4 === 0 || f.modal || f.alert) {
        console.log(`   ${i}s  path=${f.path.padEnd(30)} in_progress=${f.in_progress}  modal="${f.modal.trim().slice(0, 44)}"  alert="${f.alert.replace(/\s+/g, ' ').trim().slice(0, 60)}"`);
      }
      if (f.path.indexOf('board-picker') === -1) { console.log(`   navigated away at ~${i}s -> ${f.path}`); break; }
    }
    if (errs.length) { console.log('   console errors: ' + errs.slice(0, 4).join(' || ')); }
  } finally { await browser.close(); }
})();
