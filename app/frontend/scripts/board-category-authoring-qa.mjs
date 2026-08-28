/**
 * Categorize panel: authoring a board's category layout.
 *
 * `board.settings['category_layout']` shipped with storage, rendering and an ownership
 * gate, but nothing WROTE it — the panel's editing controls were parked. This probe drives
 * the three writers end to end on the real edit page and, crucially, checks the LIFECYCLE
 * rather than just the write: the picker opens, the preview regroups, Undo reverts, Reset
 * confirms and clears, Save persists across a full reload.
 *
 * Why the DOM alone is not enough: every in-page assertion here would also pass if nothing
 * ever reached the server, because the preview is bound to the locally-set value. Check 9
 * reads the layout off the RE-FETCHED board record after a reload, which is the only thing
 * that proves the attribute made the round trip.
 *
 * The chosen destination is deliberately a COLOURLESS category. The move used to be a
 * recolour, so `swatch_for_category` returning null (board_categories.js:537) made seven of
 * the seventeen registry entries unreachable — they were filtered out of the picker
 * entirely. Moving into one of them is the regression this feature exists to fix, so
 * picking a paintable category here would test the one case that always worked.
 *
 * Usage:
 *   node scripts/board-category-authoring-qa.mjs --user marcus_williams_slp --pass 'demo2025!'
 */
/* eslint-env node */
import { cliArgs, launch, login } from './qa-helpers.mjs';

const OPTS = cliArgs(process.argv);
const results = [];
const pass = (n, d) => { results.push({ n, ok: true }); console.log(`  PASS  ${n}\n        ${d}`); };
const fail = (n, d) => { results.push({ n, ok: false }); console.log(`  FAIL  ${n}\n        ${d}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* A colourless category — see the header. */
const TARGET = 'yes';

/* THROWS on a miss. An earlier version returned false and callers ignored it, so a
   selector that matched nothing (or an off-screen element) read as a completed click —
   and two probe-driving mistakes were reported as product failures. A probe that cannot
   perform its own steps must say so, not carry on and assert. */
const clickEl = async (page, sel) => {
  const h = await page.$(sel);
  if (!h) { throw new Error(`click target not found: ${sel}`); }
  const b = await h.boundingBox();
  if (!b) { throw new Error(`click target not visible: ${sel}`); }
  await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
  return true;
};

/* The non-throwing variant, for the ONE step that legitimately has a fallback: entering
   edit mode is reachable either from the toolbar button or from the actions menu, and
   which one is on screen depends on viewport. Every other step is required, so it uses
   clickEl and a miss is an error. */
const tryClick = async (page, sel) => {
  try { return await clickEl(page, sel); } catch (e) { return false; }
};

/* Edit mode. The toolbar button is only on screen at some viewports; otherwise it lives
   inside the actions menu, and once the board renders GROUPED (which it does as soon as a
   layout exists) the toolbar reflows and the visible button can move out from under a
   coordinate click. So: try the real pointer click first, and fall back to a DOM click on
   every matching node. Entering edit mode is a precondition here, not the thing under
   test, so a robust fallback is right — but it still goes through the page's own action. */
const enterEditMode = async (page) => {
  const inEdit = async () => !!(await page.$('[data-bd-action="toggle_category_order"]'));
  if (await inEdit()) { return; }
  await tryClick(page, '[data-bd-action="enter_edit_mode"]');
  await sleep(4000);
  if (await inEdit()) { return; }
  await page.evaluate(() => {
    document.querySelectorAll('[data-bd-action="toggle_options_menu"]').forEach((n) => n.click());
  });
  await sleep(1500);
  await page.evaluate(() => {
    document.querySelectorAll('[data-bd-action="enter_edit_mode"]').forEach((n) => n.click());
  });
  await sleep(5000);
};

/* Undo/Redo live in the RIGHT edit panel's history group, and that panel auto-collapses
   whenever edit mode turns on (`_auto_collapse_panels_on_edit`), so the buttons are in the
   DOM but not on screen. Expanding it is a step the user has to take too — this is not a
   shortcut around the UI. */
const openHistoryPanel = async (page) => {
  const already = await page.evaluate(() => {
    const b = document.querySelector('[data-bd-action="undo_edit"]');
    return !!(b && b.getClientRects().length);
  });
  if (already) { return; }
  await clickEl(page, '[data-bd-action="toggle_right_panel"]');
  await page.waitForFunction(() => {
    const b = document.querySelector('[data-bd-action="undo_edit"]');
    return !!(b && b.getClientRects().length);
  }, { timeout: 15000 });
};

/* Closing the Categorize panel needs the DONE button specifically. `data-bd-action=
   "toggle_category_order"` matches TWO elements — the edit-rail entry and Done — and
   `page.$` returns the rail entry, which sits BEHIND the panel: the panel is
   `position:absolute; inset:0` and opaque, so a click at the rail entry's coordinates
   lands on the takeover instead and the panel stays open. Everything clicked afterwards
   then hits the overlay too. */
const closePanel = async (page) => {
  await clickEl(page, '.md-board-category-order__close');
  await page.waitForFunction(() => !document.querySelector('.md-board-category-order'),
    { timeout: 15000 });
};

const settleToggle = async (page, ms = 20000) => {
  try {
    await page.waitForFunction(
      () => !document.querySelector('.md-board-category-order__preview-loading'),
      { timeout: ms, polling: 100 }
    );
  } catch (e) { /* the assertion that follows reports the real state */ }
};

/* Read the layout off the Ember-Data record, not off the DOM: the DOM shows what is
   RENDERED, and the point of several checks below is what is STORED. */
const LAYOUT = (key) => {
  const rec = window.LingoLinq.store.peekAll('board').find((b) => b.get('key') === key);
  if (!rec) { return { found: false }; }
  const v = rec.get('category_layout');
  return { found: true, raw: JSON.stringify(v === undefined ? 'undefined' : v), buttons: (v || {}).buttons || null, order: (v || {}).order || null };
};

const PANEL = () => {
  const q = (s) => document.querySelector(s);
  const vis = (el) => !!(el && el.getClientRects().length > 0);
  const grid = q('.md-board-category-order__preview .md-board-detail-grid');
  return {
    panel: vis(q('.md-board-category-order')),
    checked: !!(q('[data-bd-control="categorize"]') || {}).checked,
    reset: vis(q('.md-board-category-order__reset')),
    picker: vis(q('.md-board-category-order__picker')),
    pickerItems: document.querySelectorAll('.md-board-category-order__picker-item').length,
    pickerKeys: [...document.querySelectorAll('.md-board-category-order__picker-item')]
      .map((b) => b.getAttribute('data-bd-category')).filter(Boolean),
    listItems: document.querySelectorAll('.md-board-category-order__item').length,
    grouped: !!(grid && (grid.classList.contains('md-board-detail-grid--grouped') ||
                         grid.classList.contains('md-board-detail-grid--compact'))),
    modalTitle: (q('.md-modal-title') || {}).textContent || null
  };
};

/* The first non-empty button in the preview, with its id and painted colour. Colour is
   captured so the move can be shown NOT to repaint it — the whole point of storing the
   assignment as data. */
const FIRST_BTN = () => {
  const card = [...document.querySelectorAll('.md-board-category-order__preview .md-board-detail-symbol-card')]
    .filter((c) => !c.classList.contains('md-board-detail-symbol-card--empty'))[0];
  if (!card) { return null; }
  return {
    id: card.getAttribute('data-id'),
    bg: getComputedStyle(card).backgroundColor,
    border: getComputedStyle(card).borderTopColor
  };
};

const BTN_IN_GROUP = (id, key) => {
  const card = document.querySelector(`.md-board-category-order__preview .md-board-detail-symbol-card[data-id="${id}"]`);
  if (!card) { return { present: false }; }
  const group = card.closest('.md-board-detail-grid__group');
  return {
    present: true,
    inTarget: !!(group && group.classList.contains(`md-board-detail-grid__group--${key}`)),
    groupClass: group ? group.className : null,
    bg: getComputedStyle(card).backgroundColor
  };
};

(async () => {
  const { browser, page } = await launch(OPTS);
  page.on('pageerror', (e) => console.log('  [pageerror] ' + e.message));
  const u = OPTS.USER;
  let key = null;
  try {
    console.log(`\nBASE ${OPTS.BASE}  USER ${OPTS.USER}  TARGET CATEGORY "${TARGET}"`);
    await login(page, OPTS);

    await page.goto(`${OPTS.BASE}/${u}/boards`, { waitUntil: 'domcontentloaded' });
    await sleep(6000);
    key = OPTS.arg('--board', null) || await page.evaluate(() =>
      (window.appState && window.appState.get && window.appState.get('currentUser.preferences.home_board.key')) || null);
    if (!key) { fail('precondition — found a board to edit', 'no home_board.key; pass --board <owner/key>'); throw new Error('no board'); }
    const name = key.split('/').pop();
    console.log(`   board: ${key}`);

    /* The ownership gate: grouping only renders on a board the SUBJECT owns, so a probe
       run against someone else's board would find an ungrouped page and no panel. */
    if (key.split('/')[0] !== u) {
      fail('precondition — the subject owns this board', `${key} is not owned by ${u}; the ownership gate will keep grouping off`);
      throw new Error('not owned');
    }

    await page.goto(`${OPTS.BASE}/${u}/board-detail/${name}`, { waitUntil: 'domcontentloaded' });
    await sleep(8000);

    await enterEditMode(page);
    const entry = await page.$('[data-bd-action="toggle_category_order"]');
    if (!entry) {
      const diag = await page.evaluate(() => ({
        url: location.pathname,
        editMode: !!(window.appState && window.appState.get && window.appState.get('edit_mode')),
        editPanel: !!document.querySelector('.md-board-edit-panel'),
        modal: (document.querySelector('.md-modal-title') || {}).textContent || null,
        actions: [...document.querySelectorAll('[data-bd-action]')].map((n) => n.getAttribute('data-bd-action')).slice(0, 30)
      }));
      fail('precondition — Categorize entry reachable', JSON.stringify(diag));
      throw new Error('no entry');
    }

    await clickEl(page, '[data-bd-action="toggle_category_order"]');
    await page.waitForSelector('.md-board-category-order', { visible: true, timeout: 20000 }).catch(() => {});
    await sleep(2000);

    let s = await page.evaluate(PANEL);
    if (!s.checked) { await clickEl(page, '.md-board-category-order__switch'); await settleToggle(page); await sleep(1200); s = await page.evaluate(PANEL); }
    if (!s.panel || !s.checked) { fail('precondition — panel open with grouping ON', JSON.stringify(s)); throw new Error('panel'); }
    pass('precondition — panel open with grouping ON', `${s.listItems} categories listed, preview grouped=${s.grouped}`);

    /* 1. A board nobody has arranged offers no Reset. Gating it on "is there anything to
       reset" is why this has to be checked BEFORE anything is written. */
    const before = await page.evaluate(LAYOUT, key);
    /* EMPTY, not absent. A board that has been arranged and then Reset stores
       `{order: [], buttons: {}}` — `process_params` cannot write nil back
       (board.rb:1958) — and that is unarranged in every sense the UI cares about. Testing
       for absence would make this probe pass only on its own first run. */
    const unarranged = !(before.order || []).length && !Object.keys(before.buttons || {}).length;
    if (!s.reset && unarranged) {
      pass('1. an unarranged board shows no Reset', `category_layout=${before.raw}, Reset hidden`);
    } else {
      fail('1. an unarranged board shows no Reset', JSON.stringify({ reset: s.reset, layout: before.raw }));
    }

    /* 2. The picker opens (this was parked — begin_category_move's write was commented
       out, so a click did nothing) and offers EVERY category, not just paintable ones. */
    const btn = await page.evaluate(FIRST_BTN);
    if (!btn) { fail('2. tapping a preview button opens the picker', 'no non-empty button in the preview'); throw new Error('no btn'); }
    await page.evaluate((id) => {
      document.querySelector(`.md-board-category-order__preview .md-board-detail-symbol-card[data-id="${id}"]`).click();
    }, btn.id);
    await sleep(1500);
    const opened = await page.evaluate(PANEL);
    if (opened.picker && opened.pickerItems === opened.listItems && opened.pickerKeys.includes(TARGET)) {
      pass('2. the picker opens and offers every category',
        `${opened.pickerItems} destinations = ${opened.listItems} listed categories; colourless "${TARGET}" among them`);
    } else {
      fail('2. the picker opens and offers every category', JSON.stringify(opened));
    }

    /* 3. THE MOVE. Recorded on the board as data. */
    await clickEl(page, `[data-bd-category="${TARGET}"]`);
    await sleep(2500);
    const moved = await page.evaluate(LAYOUT, key);
    if (moved.buttons && moved.buttons[String(btn.id)] === TARGET) {
      pass('3. the move is recorded on the board, keyed by button id',
        `category_layout.buttons["${btn.id}"] = "${TARGET}"`);
    } else {
      fail('3. the move is recorded on the board, keyed by button id', JSON.stringify({ id: btn.id, layout: moved.raw }));
    }

    /* 4. and the preview regroups — the assignment is not just stored, it is applied. */
    const placed = await page.evaluate(BTN_IN_GROUP, btn.id, TARGET);
    if (placed.present && placed.inTarget) {
      pass('4. the preview regroups the button into that category', `card sits inside .md-board-detail-grid__group--${TARGET}`);
    } else {
      fail('4. the preview regroups the button into that category', JSON.stringify(placed));
    }

    /* 5. and it does NOT repaint the button. The old mechanism expressed the category BY
       recolouring, which destroyed whatever the board's own colour meant. */
    if (placed.bg === btn.bg) {
      pass('5. the button keeps its own colour', `background stayed ${btn.bg}`);
    } else {
      fail('5. the button keeps its own colour', `background went ${btn.bg} -> ${placed.bg}`);
    }

    /* 6. Reset appears now that there IS an arrangement. */
    const after = await page.evaluate(PANEL);
    if (after.reset) { pass('6. Reset appears once the board is arranged', 'a board customized only by a button move still reaches Reset'); }
    else { fail('6. Reset appears once the board is arranged', JSON.stringify(after)); }

    /* 7. UNDO. The Categorize panel is an opaque takeover (position:absolute; inset:0), so
       the toolbar's Undo is behind it — Done first is the path a user actually has. */
    await closePanel(page);
    await sleep(1500);
    await openHistoryPanel(page);
    await clickEl(page, '[data-bd-action="undo_edit"]');
    await sleep(2000);
    const undone = await page.evaluate(LAYOUT, key);
    if (!undone.buttons || undone.buttons[String(btn.id)] !== TARGET) {
      pass('7. Undo reverts the category move', `category_layout=${undone.raw}`);
    } else {
      fail('7. Undo reverts the category move', `still ${undone.raw} — the layout is not on the undo stack`);
    }

    /* 8. RESET, confirmed. Re-apply a move first so there is something to clear. */
    await clickEl(page, '[data-bd-action="redo_edit"]');
    await sleep(2000);
    const redone = await page.evaluate(LAYOUT, key);
    if (redone.buttons && redone.buttons[String(btn.id)] === TARGET) { pass('7b. Redo re-applies it', `category_layout=${redone.raw}`); }
    else { fail('7b. Redo re-applies it', `expected the move back, got ${redone.raw}`); }

    await clickEl(page, '[data-bd-action="toggle_category_order"]');
    await page.waitForSelector('.md-board-category-order', { visible: true, timeout: 20000 });
    await sleep(2000);
    await clickEl(page, '[data-bd-action="reset_category_layout"]');
    await sleep(1800);
    const confirming = await page.evaluate(PANEL);
    if (confirming.modalTitle && /reset/i.test(confirming.modalTitle)) {
      pass('8. Reset asks before clearing', `confirmation shown ("${confirming.modalTitle.trim()}")`);
    } else {
      fail('8. Reset asks before clearing', `no confirmation modal; title=${JSON.stringify(confirming.modalTitle)}`);
    }
    await page.evaluate(() => {
      const b = [...document.querySelectorAll('.md-modal-btn--danger')].pop();
      if (b) { b.click(); }
    });
    await sleep(2500);
    const cleared = await page.evaluate(LAYOUT, key);
    const emptied = !cleared.buttons || !Object.keys(cleared.buttons).length;
    if (emptied) { pass('8b. confirming clears the whole arrangement', `category_layout=${cleared.raw}`); }
    else { fail('8b. confirming clears the whole arrangement', `still ${cleared.raw}`); }

    /* 9. PERSISTENCE. Everything above is local state. Write one more move, SAVE, reload,
       and read the layout off the record the server sent back. */
    const btn2 = await page.evaluate(FIRST_BTN);
    await page.evaluate((id) => {
      document.querySelector(`.md-board-category-order__preview .md-board-detail-symbol-card[data-id="${id}"]`).click();
    }, btn2.id);
    await sleep(1500);
    await clickEl(page, `[data-bd-category="${TARGET}"]`);
    await sleep(2000);
    await closePanel(page);
    await sleep(1500);
    /* The edit bar's Save is `back_to_boards`, not `save_board` — it always presents the
       Save / Discard modal so no one leaves with unsaved work by accident, and the SAVE
       branch is what calls save_board. Driving `save_board` directly would skip the modal
       a real user cannot skip. */
    await clickEl(page, '[data-bd-action="back_to_boards"]');
    await page.waitForSelector('.md-leave-edit-btn--save', { visible: true, timeout: 20000 });
    await clickEl(page, '.md-leave-edit-btn--save');
    await sleep(14000);

    await page.goto(`${OPTS.BASE}/${u}/board-detail/${name}`, { waitUntil: 'domcontentloaded' });
    await sleep(10000);
    const persisted = await page.evaluate(LAYOUT, key);
    if (persisted.found && persisted.buttons && persisted.buttons[String(btn2.id)] === TARGET) {
      pass('9. the layout survives Save and a full reload',
        `re-fetched record carries buttons["${btn2.id}"]="${TARGET}" (${persisted.raw})`);
    } else {
      fail('9. the layout survives Save and a full reload',
        `expected buttons["${btn2.id}"]="${TARGET}", re-fetched record says ${persisted.raw}`);
    }
    /* TEARDOWN. Check 9 has to leave a layout SAVED on a real board to prove persistence,
       so without this the probe arranges a dev board once and then fails its own check 1
       on every later run. Clear it through the same UI path and save again. */
    try {
      await page.goto(`${OPTS.BASE}/${u}/board-detail/${name}`, { waitUntil: 'domcontentloaded' });
      await sleep(8000);
      await enterEditMode(page);
      await clickEl(page, '[data-bd-action="toggle_category_order"]');
      await page.waitForSelector('.md-board-category-order', { visible: true, timeout: 20000 });
      await sleep(2000);
      await clickEl(page, '[data-bd-action="reset_category_layout"]');
      await sleep(1500);
      await page.evaluate(() => {
        const b = [...document.querySelectorAll('.md-modal-btn--danger')].pop();
        if (b) { b.click(); }
      });
      await sleep(2000);
      await closePanel(page);
      await sleep(1200);
      await clickEl(page, '[data-bd-action="back_to_boards"]');
      await page.waitForSelector('.md-leave-edit-btn--save', { visible: true, timeout: 20000 });
      await clickEl(page, '.md-leave-edit-btn--save');
      await sleep(12000);
      const left = await page.evaluate(LAYOUT, key);
      console.log(`  teardown — board left unarranged (${left.raw})`);
    } catch (e) {
      console.log('  teardown FAILED (' + e.message + ') — the board may still carry a test layout');
    }
  } catch (e) {
    if (!/no board|not owned|no entry|panel|no btn/.test(e.message)) {
      console.log('\nERROR ' + e.message);
      results.push({ n: 'probe completed', ok: false });
    }
  } finally {
    await browser.close();
  }
  const bad = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - bad}/${results.length} checks passed`);
  process.exit(bad ? 1 : 0);
})();
