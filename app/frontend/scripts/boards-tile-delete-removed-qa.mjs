/**
 * The hover trash can is gone from board tiles — and only the DELETE variant is.
 *
 * `available-boards-section.hbs` renders one contextual `.board_action` button per
 * tile, whose icon/label/action come from `board_list.remove_type`
 * (controllers/user/index.js:650-687):
 *
 *   Mine / Public / Private / Root / Prior home -> delete   (glyphicon-trash)
 *   Liked                                       -> unstar   (md-icon-heart)
 *   Shared with Me                              -> unlink   (glyphicon-remove)
 *   a board tag                                 -> untag    (glyphicon-remove)
 *
 * Only `delete` was removed. This probe proves BOTH halves — the trash is absent on
 * Mine, and the non-destructive un-like is still there on Liked. Without the second
 * half, "no .board_action on Mine" would also pass if the button had been deleted
 * outright, which is not the change that was made.
 *
 * Usage:
 *   node scripts/boards-tile-delete-removed-qa.mjs --user marcus_williams_slp --pass 'demo2025!'
 */
/* eslint-env node */
import { cliArgs, launch, login } from './qa-helpers.mjs';

const OPTS = cliArgs(process.argv);
const results = [];
const pass = (n, d) => { results.push({ n, ok: true }); console.log(`  PASS  ${n}\n        ${d}`); };
const fail = (n, d) => { results.push({ n, ok: false }); console.log(`  FAIL  ${n}\n        ${d}`); };

const TILE_STATE = () => {
  const grid = document.querySelector('.ub-boards-page__board-grid');
  const tiles = grid ? Array.from(grid.querySelectorAll('.ub-boards-page__board-item')) : [];
  return {
    tiles: tiles.length,
    actions: tiles.filter((t) => t.querySelector('.board_action')).length,
    trash: tiles.filter((t) => t.querySelector('.glyphicon-trash')).length,
    hearts: tiles.filter((t) => t.querySelector('.board_action .md-icon-heart')).length,
    // `permissions.edit` gates the New Board button AND (previously) the remove
    // button — so this proves the tile button was reachable for this account.
    canEdit: !!document.querySelector('.ub-boards-page__boards-summary-new-btn')
  };
};

const waitForTiles = async (page) => {
  await page.waitForFunction(
    () => !!document.querySelector('.ub-boards-page__board-grid .ub-boards-page__board-item'),
    { timeout: 25000 }
  ).catch(() => {});
};

(async () => {
  const { browser, page } = await launch(OPTS);
  page.on('pageerror', (e) => console.log('  [pageerror] ' + e.message));
  try {
    console.log(`\nBASE ${OPTS.BASE}  USER ${OPTS.USER}`);
    await login(page, OPTS);
    await page.goto(`${OPTS.BASE}/${OPTS.USER}/boards`, { waitUntil: 'domcontentloaded' });
    await waitForTiles(page);

    /* --- Mine tab: real CDP click on the visible "My Boards" tab --- */
    const mineTab = await page.$$('.ub-boards-page__tabs a');
    let clickedMine = false;
    for (const a of mineTab) {
      const t = await page.evaluate((el) => (el.textContent || '').trim(), a);
      const box = await a.boundingBox();
      if (/^My Boards$/.test(t) && box) {
        await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
        clickedMine = true;
        break;
      }
    }
    if (!clickedMine) { fail('precondition — "My Boards" tab clicked', 'tab not found or not visible'); }
    await new Promise((r) => setTimeout(r, 2500));
    await waitForTiles(page);

    const mine = await page.evaluate(TILE_STATE);
    if (mine.tiles === 0 || !mine.canEdit) {
      fail('precondition — Mine tab has tiles and edit permission',
        `tiles=${mine.tiles} canEdit=${mine.canEdit} — the button could not have rendered anyway, so absence proves nothing`);
    } else {
      pass('precondition — Mine tab has tiles and edit permission', `${mine.tiles} tiles, New Board button present`);

      // Hover the first tile: the button was hover-revealed, so hover before asserting.
      const first = await page.$('.ub-boards-page__board-grid .ub-boards-page__board-item');
      const fb = await first.boundingBox();
      if (fb) { await page.mouse.move(fb.x + fb.width / 2, fb.y + fb.height / 2); }
      await new Promise((r) => setTimeout(r, 600));
      const hovered = await page.evaluate(TILE_STATE);

      if (hovered.trash === 0 && hovered.actions === 0) {
        pass('Mine tab — no delete affordance on any tile, hovered',
          `0 .board_action and 0 .glyphicon-trash across ${hovered.tiles} tiles while hovering tile 1`);
      } else {
        fail('Mine tab — no delete affordance on any tile, hovered',
          `.board_action on ${hovered.actions} tiles, .glyphicon-trash on ${hovered.trash}`);
      }
    }

    /* --- Delete is still reachable from this page, one level in: the tile's
       Preview chip opens the board-preview modal, whose contextual remove button
       (board-preview.hbs:97-107) is fed by `board.preview_remove`
       (board-icon.js:330-340). `@removeCallback` on <BoardIcon> was left in place,
       so this path is unaffected — assert that rather than assume it. --- */
    /* Switch OUT of compact first. Compact rows suppress both preview entry points
       (board-icon.hbs) — that is deliberate: the chip is absolutely-positioned tile
       chrome and overlaps the name in a row. So the preview route to delete exists in
       the grid density only; in compact, deleting goes through Board Actions. */
    const densityBtns = await page.$$('.bp-segmented__option');
    if (densityBtns.length >= 2) {
      const b = await densityBtns[1].boundingBox();
      if (b) { await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2); }
      await new Promise((r) => setTimeout(r, 1500));
    }
    const tile = await page.$('.ub-boards-page__board-grid .ub-boards-page__board-item');
    let rm = null;
    if (tile) {
      const tb = await tile.boundingBox();
      if (tb) { await page.mouse.move(tb.x + tb.width / 2, tb.y + tb.height / 2); }
      await new Promise((r) => setTimeout(r, 500));
      const chip = (await tile.$('.board-icon__info')) || (await tile.$('button.info'));
      if (chip) {
        const cb = await chip.boundingBox();
        if (cb) { await page.mouse.click(cb.x + cb.width / 2, cb.y + cb.height / 2); }
        await page.waitForSelector('.md-board-preview__action--remove', { timeout: 25000 }).catch(() => {});
        rm = await page.evaluate(() => {
          const b = document.querySelector('.md-board-preview__action--remove');
          if (!b) { return null; }
          return {
            label: (b.textContent || '').trim(),
            trash: !!b.querySelector('.glyphicon-trash'),
            visible: b.getClientRects().length > 0
          };
        });
      }
    }
    if (rm && rm.visible && rm.trash) {
      pass('delete still reachable — tile info chip -> preview modal',
        `remove button labelled "${rm.label}" carrying the trash icon`);
    } else {
      fail('delete still reachable — tile info chip -> preview modal', `preview remove button: ${JSON.stringify(rm)}`);
    }
    await page.keyboard.press('Escape');
    await new Promise((r) => setTimeout(r, 1200));

    /* --- Liked tab: the control. The entry sits in the tabs dropdown, which needs
       Bootstrap JS to open, so this dispatches the anchor's own click. That runs the
       identical Ember action (`set_selected "starred"`); only hit-testing is skipped,
       and this is the CONTROL, not the assertion under test. --- */
    const wentStarred = await page.evaluate(() => {
      const a = Array.from(document.querySelectorAll('.ub-boards-page__tabs .dropdown-menu a'))
        .find((x) => /^(Liked|Starred)$/.test((x.textContent || '').trim()));
      if (!a) { return false; }
      a.click();
      return true;
    });
    if (!wentStarred) {
      fail('control — Liked tab reachable', 'no "Liked" entry in the tabs dropdown');
    } else {
      await new Promise((r) => setTimeout(r, 3000));
      await waitForTiles(page);
      const liked = await page.evaluate(TILE_STATE);
      if (liked.tiles === 0) {
        fail('control — Liked tab still offers un-like on its tiles',
          'this account has no liked boards, so the control cannot run — like a board and re-run');
      } else if (liked.actions > 0 && liked.trash === 0) {
        pass('control — Liked tab still offers un-like on its tiles',
          `${liked.actions}/${liked.tiles} tiles carry .board_action (hearts on ${liked.hearts}), and 0 show a trash icon`);
      } else {
        fail('control — Liked tab still offers un-like on its tiles',
          `.board_action on ${liked.actions}/${liked.tiles} tiles, trash on ${liked.trash} — the guard is not type-scoped`);
      }
    }
  } catch (e) {
    console.log('\nERROR ' + e.message);
    results.push({ n: 'probe completed', ok: false });
  } finally {
    await browser.close();
  }
  const bad = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - bad}/${results.length} checks passed`);
  process.exit(bad ? 1 : 0);
})();
