/**
 * Category grouping pins the folder style to Colored Corner and locks the control.
 *
 * The category PANEL already communicates a button's category, so the folder treatments
 * (tab labels especially) become a second, competing colour/label system on the same
 * cell. While grouping is on the effective style is forced to colored_corner, the three
 * options are disabled, and a note says how to unlock them.
 *
 * The important property is that the user's STORED preference is untouched — the
 * override is derived — so ungrouping restores whatever they had chosen.
 *
 * Usage:
 *   node scripts/board-grouping-folder-lock-qa.mjs --user marcus_williams_slp --pass 'demo2025!'
 */
/* eslint-env node */
import { cliArgs, launch, login } from './qa-helpers.mjs';

const OPTS = cliArgs(process.argv);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const pass = (n, d) => { results.push({ n, ok: true }); console.log(`  PASS  ${n}\n        ${d}`); };
const fail = (n, d) => { results.push({ n, ok: false }); console.log(`  FAIL  ${n}\n        ${d}`); };
/* First VISIBLE match. `enter_edit_mode` appears three times in board-detail.hbs (an
   actions-menu item, the toolbar button and an empty-state button); page.$ returns the
   first in DOM order, which is inside a closed menu — boundingBox() is null there, so
   the click silently no-ops and the probe reports a product failure that isn't one. */
const clickEl = async (page, sel) => {
  const handles = await page.$$(sel);
  for (const h of handles) {
    const b = await h.boundingBox();
    if (b && b.width > 0 && b.height > 0) {
      await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
      return true;
    }
  }
  return false;
};

const STATE = () => {
  const opts = Array.from(document.querySelectorAll('.md-folder-style-option'));
  const grid = document.querySelector('.md-board-detail-grid');
  return {
    options: opts.length,
    disabled: opts.filter((o) => o.disabled).length,
    locked: opts.filter((o) => o.className.indexOf('md-folder-style-option--locked') !== -1).length,
    active: (opts.find((o) => o.className.indexOf('--active') !== -1) || {}).textContent
      ? (opts.find((o) => o.className.indexOf('--active') !== -1).textContent || '').trim().replace(/\s+/g, ' ')
      : null,
    note: ((document.querySelector('.md-folder-style-locked-note') || {}).textContent || '').trim(),
    describedBy: (document.querySelector('.md-folder-style-list') || {}).getAttribute
      ? document.querySelector('.md-folder-style-list').getAttribute('aria-describedby') : null,
    gridColoredCorner: !!(grid && grid.classList.contains('md-board-detail-grid--folder-colored-corner')),
    gridTabLabels: !!(grid && grid.classList.contains('md-board-detail-grid--folder-tab-labels')),
    storedPref: window.appState && window.appState.get('referenced_user.preferences.folder_display_style')
  };
};

/* Turn grouping on/off through the app's OWN action so the probe exercises the real
   path (controller#toggle_categorize -> _save_category_grouping), and wait for the grid
   to actually settle — the toggle paints the switch first and applies the regroup a
   frame later, so a fixed sleep races it. */
const setGrouping = async (page, want) => {
  await page.evaluate(() => {
    const { getOwner } = window.require('@ember/application');
    const ctrl = getOwner(window.appState).lookup('controller:user/board-detail');
    ctrl.send('toggle_categorize');
  });
  try {
    await page.waitForFunction((w) => {
      const g = document.querySelector('.md-board-detail-grid');
      /* `--compact`, NOT `--grouped`. `--grouped` is keyed on `panelLayout`, which is a
         hardcoded `false` (board-detail-grid.js), so it is emitted by nothing and this
         predicate could never become true — the wait timed out at 30s on every run and
         the probe failed its own precondition. The live "grouping is on" marker is
         `--compact` (`compactCategories = groupingEnabled`). */
      return !!g && g.classList.contains('md-board-detail-grid--compact') === w;
    }, { timeout: 30000, polling: 150 }, want);
    return true;
  } catch (e) { return false; }
};

(async () => {
  const { browser, page } = await launch(OPTS);
  /* Tracks whether WE turned grouping on, so it is restored in `finally` and the dev
     account is left exactly as found. */
  let flipped = false;
  page.on('pageerror', (e) => console.log('  [pageerror] ' + e.message));
  try {
    console.log(`\nBASE ${OPTS.BASE}  USER ${OPTS.USER}`);
    await login(page, OPTS);
    const key = await page.evaluate(() => window.appState && window.appState.get('currentUser.preferences.home_board.key'));
    await page.goto(`${OPTS.BASE}/${OPTS.USER}/board-detail/${String(key).split('/').pop()}`, { waitUntil: 'domcontentloaded' });
    await sleep(9000);

    /* Grouping is OPT-IN: board-detail-grid.js#groupingEnabled tests
       `...board_category_grouping.enabled === true`, and the dev account has it
       explicitly FALSE, so the board never renders grouped on its own. The probe used
       to simply assert `grouped` and fail its own precondition — reported as "cannot
       reach the Folders section", but it never got that far. (It would have passed
       under the OLD permissive test, where an absent preference counted as ON.) */
    const alreadyGrouped = await page.evaluate(() => {
      const g = document.querySelector('.md-board-detail-grid');
      return !!(g && g.classList.contains('md-board-detail-grid--compact'));
    });
    if (!alreadyGrouped) {
      /* ARM THE RESTORE *BEFORE* MUTATING, not after. `setGrouping` sends
         `toggle_categorize`, which writes the preference immediately; only the WAIT can
         fail. Setting `flipped` after the throw below meant that on every failing run the
         preference was already flipped and the `finally` restore never ran — leaking
         `enabled: true` into the dev account, which is exactly the contamination the
         restore block further down was written to prevent. */
      flipped = true;
      const ok = await setGrouping(page, true);
      if (!ok) { fail('precondition — grouping could be switched on', 'grid never gained --compact'); throw new Error('not grouped'); }
      console.log('  (grouping switched ON for this run; will be restored)');
    }

    const speak = await page.evaluate(() => {
      const g = document.querySelector('.md-board-detail-grid');
      return { grouped: !!(g && g.classList.contains('md-board-detail-grid--compact')),
               coloredCorner: !!(g && g.classList.contains('md-board-detail-grid--folder-colored-corner')) };
    });
    if (!speak.grouped) { fail('precondition — the board renders grouped', JSON.stringify(speak)); throw new Error('not grouped'); }
    pass('precondition — the board renders grouped', 'grid carries --compact');

    if (speak.coloredCorner) {
      pass('grouped board renders with the Colored Corner folder treatment', 'grid carries --folder-colored-corner');
    } else {
      fail('grouped board renders with the Colored Corner folder treatment', JSON.stringify(speak));
    }

    /* The control lives in the right edit panel's collapsible "Folders" section
       (keyed on right_panel_open_section === 'folders'), so edit mode alone is not
       enough — the section has to be opened. */
    if (!(await page.$('.md-folder-style-option'))) {
      /* The board opens in SPEAK mode, where the toolbar edit button is hidden — its
         boundingBox() is null, so clickEl correctly skips it and returns false, and
         edit mode never engaged. That is the real cause of this probe's long-standing
         "cannot reach the Folders section" failure (the diagnostic showed
         editMode:false with enterBtn:true — the button exists but is not VISIBLE).
         Fall back to the actions menu that also carries the action, exactly as
         board-categorize-toggle-qa.mjs does. */
      const clickedEdit = await clickEl(page, '[data-bd-action="enter_edit_mode"]');
      if (!clickedEdit) {
        await page.evaluate(() => {
          const m = document.querySelector('[data-bd-action="toggle_options_menu"]');
          if (m) { m.click(); }
        });
        await sleep(1500);
        await clickEl(page, '[data-bd-action="enter_edit_mode"]');
      }
      await sleep(6000);
    }
    if (!(await page.$('.md-folder-style-option'))) {
      const opened = await page.evaluate(() => {
        const icon = document.querySelector('.md-board-edit-right-panel__section-icon[data-section="folders"]');
        const btn = icon && icon.closest('button.md-board-edit-right-panel__section-toggle');
        if (btn) { btn.click(); return true; }
        return false;
      });
      if (opened) { await sleep(2500); }
    }
    const found = await page.$('.md-folder-style-option');
    if (!found) {
      const diag = await page.evaluate(() => ({
        editMode: !!(window.appState && window.appState.get && window.appState.get('edit_mode')),
        bodyEdit: !!document.querySelector('body.edit-mode-active'),
        rightPanel: !!document.querySelector('.md-board-edit-right-panel'),
        sections: Array.from(document.querySelectorAll('.md-board-edit-right-panel__section-icon')).map((e) => e.getAttribute('data-section')),
        enterBtn: !!document.querySelector('[data-bd-action="enter_edit_mode"]')
      }));
      fail('precondition — folder style control reachable', JSON.stringify(diag));
      throw new Error('no control');
    }

    const s = await page.evaluate(STATE);
    console.log('  ' + JSON.stringify(s));
    if (s.disabled === s.options && s.options > 0) {
      pass('all folder-style options are disabled while grouped', `${s.disabled}/${s.options} disabled, ${s.locked} painted locked`);
    } else {
      fail('all folder-style options are disabled while grouped', JSON.stringify(s));
    }
    if (s.note && s.describedBy === 'folder-style-locked-note') {
      pass('the lock is explained and announced', `"${s.note}"`);
    } else {
      fail('the lock is explained and announced', JSON.stringify({ note: s.note, describedBy: s.describedBy }));
    }
    if (s.active && /corner/i.test(s.active)) {
      pass('Colored Corner shows as the active option', `active = "${s.active}"`);
    } else {
      fail('Colored Corner shows as the active option', JSON.stringify(s.active));
    }
    if (s.storedPref !== 'colored_corner') {
      pass("the user's stored preference is NOT overwritten",
        `stored folder_display_style is still ${JSON.stringify(s.storedPref)} — ungrouping restores it`);
    } else {
      fail("the user's stored preference is NOT overwritten", 'stored preference was rewritten to colored_corner');
    }
  } catch (e) {
    if (!/not grouped|no control/.test(e.message)) { console.log('\nERROR ' + e.message); results.push({ n: 'probe completed', ok: false }); }
  } finally {
    if (flipped) {
      /* Restore by writing the PREFERENCE and verifying the STORED value — not by
         toggling and watching the grid class. This probe ends in EDIT MODE, where
         groupingEnabled() is false regardless of the preference, so the grid never
         carries --grouped there: the old grid-class check returned success instantly
         while the preference was left ON, which leaked `enabled: true` into the dev
         account and broke board-grouping-overflow-qa (it needs an UNGROUPED control
         run). Cleanup must be deterministic, so it does not depend on UI state. */
      const restored = await page.evaluate(async () => {
        try {
          const u = window.appState.get('referenced_user');
          u.set('preferences.board_category_grouping.enabled', false);
          await u.save();
          return window.appState.get('referenced_user.preferences.board_category_grouping.enabled') === false;
        } catch (e) { return 'ERR ' + e.message; }
      }).catch((e) => 'ERR ' + e.message);
      console.log(restored === true
        ? '  (grouping restored to OFF — stored preference verified)'
        : `  (WARNING: could not restore grouping to OFF: ${restored}) — check the dev account`);
    }
    await browser.close();
  }
  const bad = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - bad}/${results.length} checks passed`);
  process.exit(bad ? 1 : 0);
})();
