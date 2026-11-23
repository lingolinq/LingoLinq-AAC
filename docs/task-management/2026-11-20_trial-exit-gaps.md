# 2026-11-20: two gaps in "Try this Board" trials (SLP picker, back gesture after Home)

Branch: `traci/fix/trial-exit-gaps` (from `develop` at `f581c0066`).

## Where these came from
The stash `try-board trial navigation (uncommitted, 2026-10-11)` (branch
`traci/fix/try-board-trial-navigation`) was an earlier fix for the October tablet report, written before the
trial bar. PR #1141 fixed that report another way. Comparing the stash's behaviours with develop's code left
these not covered; both were then confirmed live on develop before any change.

## Reproduced live on develop (1280x800 touch, develop frontend on 8185 + develop Rails on 5001)
1. **An SLP trying boards for a communicator.** Elena (`elena_rodriguez_slp`) opened the picker for Oliver
   (`/board-picker?user_id=1_40`, `setup_user` oliver_harris), tried Vocal Flair 40, tapped "Try another":
   `/board-picker`, `setup_user` elena_rodriguez_slp, `for_self` true. The next board picked would have
   gone to her own account.
2. **The device back gesture after Home.** Aiden: try Vocal Flair 40, open "places", Home (the tried board),
   browser back: `/lingolinq/board-detail/vocal-flair-40-places_2` with no trial bar, marker still set.

## Facts (CONFIRMED in code)
- The picker's supervisor flow keys off its `user_id` query param (`controllers/board-picker.js`), and
  its route clears it when left (`routes/board-picker.js` resetController). Both exits went to
  `board-picker` with no params: `controllers/user/board-detail.js#try_back_to_picker` (Modern, the bar's
  `onExit`) and `components/trial-bar.js#exit` (Basic).
- Both markers record who the trial is for: Modern `board_detail_try_origin.user_id`
  (`components/board-preview-overlay.js#try_board`), Basic `basic_try_home.user_id`
  (`utils/board_picker_landing.js#mark_basic_try`). The trial bar already tests "someone else" with
  `same_person` (`trial-bar.js#forUserName`).
- Trial membership in Modern is `trial_includes`: the tried board, or a board whose trail
  (`board_detail_nav_history`) contains it. `_trial_home` (Home) resets the trail to `[]`, so a folder
  reached again by the browser has no trail.

## Fix
- `utils/board_picker_trials.js#picker_return_args(trial, appState)`: the picker for the trial's person
  when that is someone else (`['board-picker', { queryParams: { user_id } }]`, the shape
  `controllers/user/index.js` already uses), else `['board-picker']` exactly as before. Used by both exits;
  each reads the marker before the trial is ended.
- `app_state.board_detail_trial_boards` (`{ key: <tried board>, boards: [...] }`): a sync observer in
  board-detail (`_recordTrialBoard`, end-of-file `reopen`) records each board shown while it is part of the
  trial; `trial_includes` also accepts a board in that list, for the same tried board only. Cleared when a
  trial starts (`board-preview-overlay.js`) and in `clear_user_state` (`services/app-state.js`). A separate
  slot rather than a field on the marker: existing tests require the marker object itself to be unchanged.
- Edits in files with `.eslint-todo` rows are on existing lines or at the end of the file.

## Tests
- `tests/unit/controllers/user-board-detail-trial-return-test.js` (4) and
  `tests/unit/components/trial-bar-return-test.js` (2), red first: the three gap tests failed, the controls
  passed.
- Falsified one at a time: Modern exit without the helper, Basic exit without the helper, and
  `trial_includes` without the reached boards each fail exactly their own test.
- Related groups green: board-detail 282, board-picker 35, board_picker 10, trial-bar 25, trial through
  folders 9, try-back 5, clear_user_state 10, board-preview 5.
- Live after the fix: Elena's "Try another" returns to `/board-picker?user_id=1_40` (Oliver's picker); Aiden's
  back gesture after Home shows the "places" folder with the trial bar. No page errors.

## Not done / noticed
- Not carried over from the stash: restoring the picker's search text (category and scroll already return),
  and the stash's Basic speak-mode changes (house button and Exit Boards during a trial); develop's Basic
  behaviour there was not checked.
- The back-gesture fix is Modern only; Basic's trail (`get_history`) was not checked for the same case.
- `npm run lint:js:ci` reports 4 new `lingolinq/no-orphaned-action` findings on clean develop too
  (ai-disclosure.js 168 and 226, sync-details.js 229, user/preferences.js 1319); same counts with this
  branch; not touched here. Whether CI sees them was not checked.
