# 2026-11-21: board Save waits for pictures and sounds still uploading, then saves

Branch `traci/fix/save-waits-for-uploads`, cut from `develop` at de6b1052e (PR #1346 merged).
Refs lingolinq/lingolinq_mobile#3 follow-up F4 (a board saved right after a pick saves without
the picture).

## Decisions (Traci, 2026-11-21)

1. Save waits, then saves by itself (chosen over "Save shows Uploading" after the proposal review).
2. "Save without it" is offered after 15 seconds; "Back to editing" is always offered.
3. Save waits for the automatic symbol lookup too.
4. Sounds are in scope (board-button sounds only; batch recording is separate).
5. No feature flag: a bug fix (Save must not lose a picked picture or sound).

## Fact sheet

Read at `origin/fix/scot-image-save-pending-4b5b4ff7` (4b645a772), identical to de6b1052e for
these files. Labels: CONFIRMED (`file:line`) or ASSUMED (to be checked before it carries code).

(a) Where the value is READ
- CONFIRMED: the save guard reads `image_id && pending_image` over `ordered_buttons`, then
  returns after `modal.warning('wait_for_images')`: Basic `controllers/board/index.js:246-261`
  (board-alt routes use this controller, `routes/user/board-alt/index.js:19`), Modern
  `controllers/user/board-detail.js:6143-6157`.
- CONFIRMED: `editManager.process_for_saving()` snapshots the buttons right after the guard
  (`board/index.js:263`, `board-detail.js:6160`); whatever `image_id`/`sound_id` a button holds
  then is what is saved.
- CONFIRMED: callers are fire-and-forget: Basic `application.js:1410-1412`; Modern
  `board-detail.js:9511-9523` (`save_board`), its one live caller `send('save_board')` at
  `:9540` passes no `stay_in_edit`.
- CONFIRMED: Basic runs `process_for_saving`, the `model.buttons` write, `processButtons` and the
  copy_on_save branch (`board/index.js:342`) before `toggle_mode('edit')` (`:346`).
- CONFIRMED: Modern's `board_saving` overlay (`templates/user/board-detail.hbs:1459`) is not
  gated by edit mode; its only writers are `board-detail.js:6282` (true), `6324`, `6400` (false).
  It is not cleared on the early returns (`6141`, `6161`), the copy_on_save return
  (`6255-6262`) or any cancel path. So this change does NOT reuse it.
- CONFIRMED: both controllers are singletons (`board-detail.js:4821`; `board.index`), so a
  deferred callback that re-enters `saveButtonChanges` after a board change runs on the NEW
  board.

(b) Every shape
- `pending_image` true: only `begin_pending_image` (`utils/pending_image.js:33`). false: its
  `finish` (`:43`) and direct writers `content-grabbers.js:1325` (clear_image), `1770-1786`
  (license branch), `edit_manager.js:1306` (rebuild; new objects start false).
- `pending_sound` true: `content-grabbers.js:2737` (select_sound_preview), `2843` (sound license
  PUT); false: `2819`, `2831`, `2845`, `2848`, and the rebuild `edit_manager.js:1307`. Batch
  recording's `pending_sound` lives on its own phrase/category objects
  (`components/batch-recording.js:157-182`), not on board buttons.
- An operation ends one of three ways: landed, failed, abandoned (settings closed or moved on).
  Today the token ends the same way for all three (`content-grabbers.js:1744-1753`,
  `edit_manager.js:2573-2576`); the drop path has no token (`content-grabbers.js:603-631`).
- Ordering: the settings pick writes `image_id` before its finish (`content-grabbers.js:1706-1710`
  vs `1749`); the automatic lookup's finish (`edit_manager.js:2572`) runs before the
  `afterRender` that writes `image_id` (`:2532`), all in one flush. A waiter must resolve after
  `afterRender`.
- Untimed hops: the sound duration probe (`new Audio`, `content-grabbers.js:2757-2769`). S3 POSTs
  go to the regional `post_url` (`lib/uploader.rb:121-122`), which gets the 20 s timeout plus one
  retry (`utils/extras.js:187-191, 360-375`); only stale tabs posting to `upload_url` are untimed.

(c) Cross-file claims checked
- CONFIRMED: `change_button` writes `image_id`/`sound_id` into `board.buttons` in place
  (`edit_manager.js:1517-1531`), as do the afterRender blocks (`content-grabbers.js:1727-1734`,
  `edit_manager.js:2549-2556`). After a rollback `model.buttons` is the committed array
  (`board-detail.js:5024-5031`), so a picture landing after Discard reaches the speak board.
- CONFIRMED: nothing calls `contentGrabbers.unlink`, so the singleton keeps a destroyed
  button-settings component; `clear_sound_work()` (`content-grabbers.js:2812`) runs on the current
  controller and would wipe the next button's preview; `audio-recorder.js:15` takes over the
  soundGrabber singleton (`setup(null, this)`), so a late board sound can land on a recorder
  phrase. `new-sound.js:62-68` relies on the select_sound_preview resolve/reject contract.
- CONFIRMED: Basic's sticky flash is a single slot (`services/modal.js:538`), so it cannot be the
  waiting UI.
- CONFIRMED: the shared `modal-dialog` component sets `role="dialog"` and `aria-modal="true"`
  (`components/modal-dialog.hbs:6`), moves focus in (`modal-dialog.js:61-83`), traps Tab inside
  (`:115-130`) and returns focus to the opener on close (`:44-52`). The waiting dialog uses it.

## Design (revised after the proposal review)

1. **Outcomes, not just ends.** `pending_image.js` becomes `pending_media.js` (re-exporting the
   image API): tokens carry a field (`pending_image` or `pending_sound`) and finish with an
   outcome (`landed`, `failed`, `abandoned`). `when_media_settled(buttons)` resolves with the
   outcomes after `afterRender` + `next`. A field cleared with no live token never blocks.
2. **A waiting dialog, not the overlay or a flash.** Save with media pending opens one modal on
   both views: "Saving when your picture finishes uploading..." (media-neutral copy), with
   "Back to editing" always and "Save without it" from 15 s (timer starts at the first click,
   survives re-checks). Focus moves into it; the background is inert; text AAC-sized.
3. **Identity at re-entry.** At defer time capture the controller, `model.id`, an edit-session
   token (bumped by an `edit_mode` observer and on route exit) and `sessionUser.id`. The settled
   callback saves only if all four still match; otherwise it closes the dialog and does nothing.
4. **Failure cancels.** If any outcome is `failed`, no save: the dialog closes, the user is back
   in edit mode with "A picture or sound did not upload. The board was not saved." (the
   upload-failed alert already explains why).
5. **Back to editing / Discard / route exit** mark the board's in-flight operations
   `abandoned`, so their apply step writes nothing (closes the "picture lands after Discard" path).
6. **Guard = any pending field**, not `image_id && pending_image`, so F4 (empty button) waits too.
7. **Drag-and-drop joins the tokens** (`apply_dropped_image_to_button`).
8. **Sounds:** convert `select_sound_preview` like #1346 did pictures, capturing the start
   controller and `this.button`; attach to a board button only when the start controller was a
   live button-settings owner; gate `clear_sound_work` on still owning the controller; keep the
   resolve/reject contract for `new-sound.js`; the sound license PUT does not hold Save (the
   picture license branch writes no true either).

Rejected: reusing `board_saving` (stuck overlay over the speak board); chaining inside
`board.save()` (the `process_for_saving` snapshot is taken first); "Save shows Uploading"
(simpler and safer, not chosen: Traci wants one click to save).

## Tests (red first), each with its mutation
Unit: outcomes; per-field tokens (finishing an image token never clears `pending_sound`); a
flag with no token never blocks; waiter resolves after afterRender.
Controller, both views, through the real Save paths (Modern: confirm-leave-edit then Save):
F4 empty button waits and saves with the `image_id`; button with a picture waits and saves;
Enter then Save carries the automatic symbol; two Saves, one save; failed upload, no save and
back in edit mode; Back during the wait, no save and no overlay, grid visible; board change
during the wait, the new board is not saved and no transition; Discard during the wait, the
late picture is not applied; 15 s shows "Save without it", which saves at once; drag-and-drop
waits; sound waits and saves `sound_id`; sound with settings closed or moved on lands on the
right button and leaves the next button's preview alone; a recorder takeover gets no board sound.
afterEach clears module waiters and the 15 s timer.
