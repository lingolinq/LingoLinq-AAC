# Speak sidebar Light/Dark links removed

GitHub #1097 / KAN-108. The Speak Mode sidebar no longer has Light or Dark items. Board colour is chosen on board-detail.

## Decision

Traci Day, 2026-10-23, on PR #1164: remove the sidebar Light/Dark links and drop everything else the first version of this PR added (a colour-only action, new computeds, theme classes and a stylesheet colour split). The PR's first version kept the labels and changed colour only; that approach is dropped.

## What was removed, and why

The sidebar ended with a Light or Dark `LinkTo` between the classic board page (route `board`) and Board Alt (route `user.board-alt`). It was built from the current board key split on `/` (`board_alt_username` and `board_alt_boardname` in `controllers/application.js`). Any key with a slash got an item, so an `obf/` board such as `obf/stars` was treated as user `obf`, board `stars`, and also showed a link to a Board Alt page for it. Nothing else read those two computeds.

Removed:
- the Light/Dark `LinkTo` block in `app/frontend/app/templates/application.hbs`;
- `board_alt_username` and `board_alt_boardname` in `app/frontend/app/controllers/application.js`;
- the three `sidebar_item--board-alt` rules in `app/frontend/app/styles/app.scss`, after a grep showed no other user of that class.

Kept:
- `on_board_alt`. It still drives the `board-alt-view` class on `#within_ember`, the eval controls (`show_eval_pause`, `show_eval_prev`) and `on_board_or_alt`, which `application.hbs` also reads.
- The locale keys `board_alt_return` and `board_alt`, which are harmless.
- The Predict Y/N row at the end of the sidebar.

Board colour lives on board-detail: Edit Board, expand the left Action Panel, Board Display, Light or Dark. The template calls `set_dark_mode` (`controllers/user/board-detail.js:7852`). The collapsed rail pill calls `toggle_dark_mode` (`:7836`). Both store `preferences.board_dark_mode` through `_persist_board_dark_mode` (`:6835`). `board_dark_mode` is an allowlisted preference at `app/models/user.rb:2608`.

## Tests and their mutations

1. `tests/acceptance/speak-sidebar-no-theme-links-test.js`. It boots the app, then puts the real application controller and template in Speak Mode on board-alt (`user.board-alt.index`, key `tester/empty`) and on the classic board page (`board.index`, key `obf/stars`) with two sidebar boards. It asserts that the count of `#sidebar a.sidebar_item` equals `sidebar_boards.length` and that `.sidebar_item--board-alt` does not exist. It does not read English text.
   Mutation that must fail it: restore develop's `application.hbs`, `application.js` and `app.scss`. Run: both tests fail on the count (3 items, 2 expected), not on a render error.
2. `tests/unit/controllers/board-detail-set-dark-mode-test.js`. `set_dark_mode(true)` and `set_dark_mode(false)` set `dark_mode`, store `preferences.board_dark_mode`, set `preferences.device.updated` and save.
   Mutation that must fail it: delete the `_persist_board_dark_mode` call in `set_dark_mode`. Run: both tests fail on the stored preference.

The first version of the sidebar test was an integration test with a stand-in component. It passed on develop too, because the stand-in never defined `board_alt_username`, so it was replaced.

## Baseline

Deleting the two computeds moved 20 existing `app/controllers/application.js` rows in `app/frontend/.eslint-todo` up by 12 lines. Traci approved changing only those line numbers, by hand (PR #1164 comment, 2026-10-25). `lint:js:todo` was not run.
