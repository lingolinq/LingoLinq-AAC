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

(async () => {
  const { browser, page } = await launch(OPTS);
  page.on('pageerror', (e) => console.log('  [pageerror] ' + e.message));
  try {
    console.log(`\nBASE ${OPTS.BASE}  USER ${OPTS.USER}`);
    await login(page, OPTS);
    const key = await page.evaluate(() => window.appState && window.appState.get('currentUser.preferences.home_board.key'));
    await page.goto(`${OPTS.BASE}/${OPTS.USER}/board-detail/${String(key).split('/').pop()}`, { waitUntil: 'domcontentloaded' });
    await sleep(9000);

    const speak = await page.evaluate(() => {
      const g = document.querySelector('.md-board-detail-grid');
      return { grouped: !!(g && g.classList.contains('md-board-detail-grid--grouped')),
               coloredCorner: !!(g && g.classList.contains('md-board-detail-grid--folder-colored-corner')) };
    });
    if (!speak.grouped) { fail('precondition — the board renders grouped', JSON.stringify(speak)); throw new Error('not grouped'); }
    pass('precondition — the board renders grouped', 'grid carries --grouped');

    if (speak.coloredCorner) {
      pass('grouped board renders with the Colored Corner folder treatment', 'grid carries --folder-colored-corner');
    } else {
      fail('grouped board renders with the Colored Corner folder treatment', JSON.stringify(speak));
    }

    /* The control lives in the right edit panel's collapsible "Folders" section
       (keyed on right_panel_open_section === 'folders'), so edit mode alone is not
       enough — the section has to be opened. */
    if (!(await page.$('.md-folder-style-option'))) {
      await clickEl(page, '[data-bd-action="enter_edit_mode"]');
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
    await browser.close();
  }
  const bad = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - bad}/${results.length} checks passed`);
  process.exit(bad ? 1 : 0);
})();
