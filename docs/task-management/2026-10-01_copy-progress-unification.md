# Copy progress unification (2026-10-01)

Branch: `traci/styling/classic-view-overlay`

## Goal (Traci, 2026-10-01)

- Copies made at account creation (signup library boards, org admin "copy board" assignment,
  activation/start codes, eval reset) and copies for import recipients 2..n stay behind the
  scenes: no UI.
- Every other copy uses the SAME process: the `copying-board` window (progress, minimise to the
  drawer) and tells the user when it is complete.
- Home-board copies skip the "choose which linked boards" step and copy the whole set.
- Editing a shared org board (a shallow clone the server materialises into the user's own copy on
  save, `board.rb:846` via `processable.rb:15`) shows a message after the save.
- No regressions.

## Consulted before starting

- `learnings-archive/2026-09.md:352` "`copy_finished` on the copying-board modal fires ONLY when
  the modal is closed": the foreground success path ignores the caller's callback.
- `2026-09-02-copy-progress-defects.md`, item 3: the first reroute of home-board copies through
  `copying-board` (`072036554`) was REVERTED (`34c8aab98`). Read its four defects before
  touching any home-board caller (below).
- `LEARNINGS-2026-01_to_2026-09.md:6402`: copies need a Resque worker running locally.

## Inventory (who copies, what the user sees)

Built from three parallel read-only traces, key claims re-verified directly. Silent today:
basic-try-home-button (S1); `setAsHome('starting')` header + setup footer (S2,
`application.js:1031`, confirmed); board-selection-tool in setup (S3); assign-vocal-flair-home in
setup/tour (S4); board-picker "Set as Home Board" (P1, copy text likely hidden under the
"Preparing your Board" overlay); Edit Sidebar public board (P2, no copy wording). Visible: every
`copy-board` -> `copying-board` path, translate, button-settings "Create editable copy", Quick
Assign, set-as-home "Make a New Copy" (one line of text, no meter), home-boards page. Automatic:
`user_board_provisioner.rb` (confirmed), `organization.rb:2283` (confirmed), `organization.rb:1901`,
`subscription.rb:667`, `board.rb:728/795`. Orphaned: `controllers/copying-board.js`,
`controllers/set-as-home.js`, `controllers/share-board.js`.

## Unit 1 -- DONE: completion notice when the copy is watched to the end

Fact sheet:
- (a) READ: the foreground success branch `components/copying-board.js:277-316` navigated and
  closed the window with no message. CONFIRMED.
- (b) SHAPES: minimised -> drawer "Copy created!" (:262-272); open or translated -> navigate, no
  message (:277); dismissed -> `copy_finished` or notice (:317-322). Only the middle changes.
- (c) CLAIMS: no caller shows its own message after a foreground copy (read
  `copy_and_edit_board`, copy-on-save, `make_a_copy`, translation-select, board-preview).
  CONFIRMED. "A flash survives `jump_to_board`": was ASSUMED, now CONFIRMED live.

Change: `modal.success(i18n.t('copy_ready', "Copy created!"))` after the foreground close. Existing
key, no locale change.

Verification: red test `tests/unit/components/copying-board-completion-notice-test.js` (failed for
the right reason, passes; falsified by removing the line). `--filter "copying-board"` 9/9. Live:
example, Make a Copy -> Copy the Full Board Set: "Copy created!" toast on the new board.

Lint: the two added lines shift the pre-existing `lingolinq/no-orphaned-action` warning for
`confirm_hierarchy` from `copying-board.js:408` to `:410` (+1 "new"). Re-anchoring needs Traci's
approval (Rule 14). Separately, the gate read `new=75` WITHOUT this change (73 earlier tonight)
and `application.js` reported 13 then 12 findings across two runs with no edit: unexplained, not
investigated.

Observed, not caused by this unit, NOT verified: the live copy of Quick Core 40 landed on
`example/core-40-things-at-home_1` (a linked board), not the copied root.

## Remaining units (each its own commit, own red test, own live check)

Hard requirements carried from the reverted attempt (`2026-09-02-copy-progress-defects.md`):
1. `copying-board` must hand completion back to the caller on the FOREGROUND path, not navigate
   itself, for these callers only (a new opt-in model flag; default behaviour unchanged for every
   existing caller). Setup must still advance; the picker must still run `_finishPickForHome`
   (clears `board_picker_pick_in_progress`, `app-state.js:748`); a supervisor picking for a
   communicator must still get their confirmation, not the communicator's board.
2. `skip_hierarchy_picker` for home-board copies (Traci: copy the whole set).
3. A failure signal to the caller: the opener promise never rejects (`utils/modal.js`), so the
   result payload must carry the error.
4. The picker's "Preparing your Board" overlay (z-index above the modal,
   `utils/view_switch_overlay.js`) must not cover the copying window.
5. Reuse-an-existing-copy (`copy_or_reuse_as_home`) must keep working: no copy, no copy window.
6. A scripted setup-wizard click-test before any setup caller is switched.

Order (lowest risk first): 2. copying-board opt-in completion hook + failure payload (pure
addition) -> 3. basic-try-home-button (S1) -> 4. board-picker pick_for_home (P1, overlay) ->
5. set-as-home "Make a New Copy" (V8) -> 6. sidebar-editor (P2) -> 7. content-grabbers (V6) ->
8. org shallow-clone post-save message (S8) -> 9. `user.copy_home_board` callers (S2, S3, V9) and
assign-vocal-flair-home (S4, V7): setup wizard, needs requirement 6 first.
