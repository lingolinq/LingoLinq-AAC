# 2026-10-11: Set Home Board as a mode on the Boards page, with copy, progress and cancel

Branch: `traci/fix/scots-review-fixes`. Committed as 115deca0f (this feature) and 590736629 (the
folders fix found while testing it), pushed 2026-10-12. The smaller items committed alongside (focus
ring, rail spacing, tour, home Boards card) are logged in
`2026-10-10_modern-home-polish-and-compressed-view-removal.md` ("2026-10-11 follow-ups").

## What was asked, in order
1. The Boards page's Set Home Board button no longer goes to the board picker. It turns on a mode:
   a different pointer, a tooltip "click any board to make it your home board", kept while
   switching tabs. Someone else's board: say it isn't theirs and offer to copy it; on Yes, copy
   with a progress message (no copy-board modal), then offer to open the new home board.
2. Cancel lives in the tooltip; leaving the Boards page cancels the mode.
3. Ask to open the new home board for EVERY assignment, including boards they own. On "Not now",
   show the board moving to the top of My Boards smoothly, so it does not seem to vanish.
4. "Not now" did not scroll to the board: fix.
5. While copying, change the message every 30 seconds, and add Cancel.

## Decisions (Traci, 2026-10-11)
- **A cancelled copy is deleted**, not left in My Boards ("Delete it", over "Keep it").
- **Folders panel**: no collapsed state in the side-by-side layout (see 590736629).
- **Test change approved**: tests/integration/available-boards-folders-test.js pins
  `foldersLayout.sideBySide = false` in setup (three accordion tests ran at 1440px, now
  side-by-side). No assertion changed.

## How it works (pointers, not a re-statement of the commit message)
- Mode: `AvailableBoardsSection.reopen` in components/available-boards-section.js (after the class,
  imports at the end, so `.eslint-todo` rows hold). House cursor through BoardIcon's `@pickCursor`.
- Dialog: components/confirm-home-board-copy.js/.hbs, stages ask, copying, done, error,
  cancelling, cancelled. An owned board opens straight at `done` with `copied: false`.
- Movement: utils/home-move.js (`snapshotTiles` at the click, `playHomeMove` on Not now,
  `whenTile` waits until the tile is marked home). Tiles carry `data-board-key`.
- Cancel: utils/board-copy.js `copy_or_reuse_as_home(..., {isCancelled})` passes `skip_home` into
  `editManager.copy_board`, checked on the one line where copy_board would save the home board
  (edit_manager.js, the `as_home` branch of done_callback). `discard_cancelled_copy` removes what
  the copy made. Callers without `isCancelled` (picker, Basic try-home) are unchanged.

## Bugs found in the browser, each fixed with a red test first
| # | What happened | Cause | Fix |
|---|---|---|---|
| 1 | The new button still went to /board-picker | The template used `ctrlAction`, which sends to the boards CONTROLLER; controllers/user/index.js still has a legacy `toggleSetHomeMode` that goes to the picker | Dispatch with the component's `sendAction`. The unit tests had called `comp.send`, so they could not see it |
| 2 | Tooltip said "example's home board" on example's own page | After a home change the session user is keyed `'self'`, the page's record `'1_1'` | Compare through utils/backend_user_id.js (tooltip and dialog) |
| 3 | The app kept showing the old home until a reload | Saved on the page's record, a separate instance from the session user | Save on the session user on your own page, as board-preview-overlay.js#pick_for_home does |
| 4 | After a copy, My Boards still sorted the OLD home first | copy_board reloads only the record it was given; the list sorts from the page's record | Reload the page's record on done |
| 5 | "Not now" did not scroll to the board | The visibility check ran after the FLIP transforms, when the board is still drawn at its old (visible) place; and `#content` scrolls, not the window | Measure the final rect before the glide; scroll the real scroll parent |
| 6 | With Cancel added, the app showed the old home after a successful copy | Moving the home save after copy_board resolved raced copy_board's own user reload (~100ms after the job, edit_manager.js:2828) | Keep the save where copy_board makes it; cancel only skips it (`skip_home`) |
| 7 | One copied board survived a cancel (98-board set) | The job reports `new_board_ids` from the source's STORED downstream list, which lacked a board the copy reached through a real link | The cleanup also follows links from each board it deletes, under the same checks |

## Verification
- Unit tests (all new): boards-set-home-mode-test, confirm-home-board-copy-test, home-move-test,
  home-copy-cancel-test, folders-side-by-side-test. Last targeted run: 34 set-home tests plus the
  folders tests, green; `lint:js:ci` no new findings; template lint clean.
- Browser (Playwright against `ember serve`, example account, Modern): mode on/off, Escape,
  keyboard (Tab to the tooltip's Cancel, focus returns to the button), tab switch, navigate away;
  owned board and copied board, Open and Not now; the glide at 1280, 390 and 520px-tall viewports
  and with reduced motion; the 30s messages (timer shortened to 1s in the page only); Cancel
  mid-copy of a 98-board set: home unchanged in the app and on the server, account back to 100
  boards with nothing new.
- NOT run: the full Ember suite (the dev server was running). CI runs it on the PR.

## Open items
- The full Ember suite on this tree.
- `toggleSetHomeMode` on controllers/user/index.js now has no caller. Removing it is a separate
  change.
- Server: `new_board_ids` from User#copy_board_links comes from the source's stored
  `downstream_board_ids`, which can be stale (seen: lingolinq/vocal-flair-84-w-keyboard lacks
  lingolinq/core-blocks-84-categories-home_1, linked from vocal-flair-84-categories_1). Worth its
  own look, since other callers of that list may be affected.
- Cancel cleanup deletes one board per request (98 boards took about 14s). A single server
  endpoint would be faster; not proposed yet.
- Not tested in the browser: a supervisor assigning a communicator's home board (no such pair
  locally).
- Translations: 21 new en.json keys; other locales fall back to English until translated.
