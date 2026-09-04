/**
 * Regression gate for the `currentUser` notify guard (services/app-state.js#set_current_user).
 *
 * The guard drops the deferred notifyPropertyChange('currentUser') when the user did not
 * actually change. That removes a full <BoardDetailGrid> re-render per board open. The
 * risk it must not create: a REAL user switch, or an in-place preference change, failing
 * to propagate to preference-derived UI.
 *
 * These assertions exercise the real observer (`set_current_user` keys off `sessionUser`),
 * not a synthetic property.
 *
 * Usage (from app/frontend):
 *   node scripts/current-user-notify-qa.mjs --user marcus_williams_slp --pass 'demo2025!' \
 *        --board vocal-flair-84
 */
/* eslint-env node */
import { cliArgs, launch, login } from './qa-helpers.mjs';

const OPTS = cliArgs(process.argv);
const BOARD = OPTS.arg('--board', 'vocal-flair-84');
let pass = 0, fail = 0;
const check = (name, ok, detail) => {
  if (ok) { pass++; console.log(`   PASS  ${name}`); }
  else { fail++; console.log(`   FAIL  ${name}${detail ? '  -> ' + detail : ''}`); }
};

const run = async () => {
  const { browser, page } = await launch(OPTS);
  try {
    await login(page, OPTS);
    const u = OPTS.USER;
    await page.goto(`${OPTS.BASE}/${u}/board-detail/${BOARD}`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.md-board-detail-grid__cell', { timeout: 45000 });
    await new Promise((r) => setTimeout(r, 2500));

    await page.evaluate(() => {
      const { getOwner } = window.require('@ember/application');
      window.__owner = getOwner(window.modal._getService());
      const as = window.__owner.lookup('service:app-state');
      const { addObserver } = window.require('@ember/object/observers');
      window.__fires = 0;
      addObserver(as, 'currentUser', () => { window.__fires++; });
    });

    // 1. A REAL change must still notify. Drive it through the real observer by
    //    replacing sessionUser, which is what find_user does.
    const real = await page.evaluate(async () => {
      const as = window.__owner.lookup('service:app-state');
      const { run } = window.require('@ember/runloop');
      const original = as.get('sessionUser');
      const before = window.__fires;
      run(() => as.set('sessionUser', null));           // user -> null  (a real change)
      await new Promise((r) => setTimeout(r, 60));
      const afterNull = window.__fires;
      run(() => as.set('sessionUser', original));       // null -> user  (a real change)
      await new Promise((r) => setTimeout(r, 60));
      const afterRestore = window.__fires;
      /* Settle before asserting identity. `sessionUser` is re-asserted asynchronously by
         the app (find_user / session plumbing), so a fixed short wait races that restore
         and made this assertion flaky. Poll for the invariant instead of timing it. */
      let settled = false;
      for (let i = 0; i < 40 && !settled; i++) {
        await new Promise((r) => setTimeout(r, 50));
        settled = as.get('currentUser') === as.get('sessionUser') && !!as.get('currentUser');
      }
      return {
        before, afterNull, afterRestore,
        settled,
        isOriginal: as.get('currentUser') === original
      };
    });
    check('real change user -> null notifies', real.afterNull > real.before, `fires ${real.before}->${real.afterNull}`);
    check('real change null -> user notifies', real.afterRestore > real.afterNull, `fires ${real.afterNull}->${real.afterRestore}`);
    /* The invariant that matters in this branch of set_current_user is
       currentUser === sessionUser once settled — not identity with a reference captured
       before the app had a chance to re-resolve the record. */
    check('currentUser settles equal to sessionUser', real.settled);
    check('settled currentUser is the original record', real.isOriginal);

    // 2. A REDUNDANT re-set must NOT notify — this is the optimisation.
    const redundant = await page.evaluate(async () => {
      const as = window.__owner.lookup('service:app-state');
      const { run } = window.require('@ember/runloop');
      const same = as.get('sessionUser');
      const before = window.__fires;
      run(() => as.set('sessionUser', same));
      run(() => as.notifyPropertyChange('sessionUser'));  // force the observer to re-run
      await new Promise((r) => setTimeout(r, 120));
      return { before, after: window.__fires };
    });
    check('redundant re-set does NOT notify', redundant.after === redundant.before,
      `fires ${redundant.before}->${redundant.after}`);

    // 3. An in-place PREFERENCE change must still reach preference-derived UI.
    //    high_contrast_class is one of the ~13 grid arguments in the invalidated cluster.
    const pref = await page.evaluate(async () => {
      const as = window.__owner.lookup('service:app-state');
      const c = window.__owner.lookup('controller:user/board-detail');
      const before = c.get('high_contrast_class');
      const prior = as.get('currentUser.preferences.high_contrast');
      as.set('currentUser.preferences.high_contrast', !prior);
      await new Promise((r) => setTimeout(r, 200));
      const after = c.get('high_contrast_class');
      as.set('currentUser.preferences.high_contrast', prior);   // restore
      await new Promise((r) => setTimeout(r, 200));
      const restored = c.get('high_contrast_class');
      return { before, after, restored };
    });
    check('preference change propagates to high_contrast_class', pref.before !== pref.after,
      `"${pref.before}" -> "${pref.after}"`);
    check('preference restore propagates back', pref.restored === pref.before,
      `"${pref.after}" -> "${pref.restored}"`);

    // 4. The board itself must still be rendered and correct.
    const grid = await page.evaluate(() => ({
      cells: document.querySelectorAll('.md-board-detail-main .md-board-detail-grid__cell').length,
      labelled: document.querySelectorAll('.md-board-detail-symbol-card__label').length
    }));
    check('board still rendered after all of the above', grid.cells > 0, `cells=${grid.cells}`);

    console.log(`\n   ${pass}/${pass + fail} passed`);
    if (fail) { process.exitCode = 1; }
  } finally {
    await browser.close();
  }
};

run().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
