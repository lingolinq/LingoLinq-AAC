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

## Design (revised twice: after the proposal review and the re-check)

1. **Outcomes.** `utils/pending_media.js` (with `utils/pending_image.js` re-exporting the image
   API) tracks each picture or sound operation as a token `{button, field, kind}`: `field` is
   `pending_image` or `pending_sound`; `kind` is `user` (settings pick, drop, sound) or `auto`
   (the automatic symbol lookup). A token ends once with one outcome:
   - `landed`: its picture or sound was applied;
   - `failed`: it did not arrive (only a `user` failure blocks a save; an `auto` lookup that errors
     or finds nothing is silent today, `edit_manager.js:2573-2576`, and stays non-blocking);
   - `superseded`: something else replaced it (the automatic symbol after a manual pick);
   - `cancelled`: the edit session it belonged to ended (Discard, route exit, board change,
     "Save without it"). ONLY `cancelled` stops the apply step from writing.
   Closing button settings or moving to the next button is none of these: the operation keeps
   running and applies, as #1346 made it (`content-grabbers.js:1706-1734`).
2. **Registry.** Besides the per-button flag bookkeeping, the module keeps a strong set of live
   tokens, each deleted when it ends. `has_live_media()` and `when_media_settled()` read that set,
   so a button object replaced by undo/redo (`edit_manager.js:1323-1344`) or a rebuild cannot hide
   a running upload. `when_media_settled()` resolves after `afterRender` + `next` with counts per
   outcome (`failed` counts `user` tokens only). `cancel_pending_media()` marks every live token
   `cancelled` and ends it; it runs BEFORE any rebuild on Discard.
3. **Every apply site checks `is_cancelled(token)`** before writing: drop
   (`content-grabbers.js:618-622`), settings pick (`:1706-1710`) and its afterRender
   (`:1716-1734`), automatic lookup (`edit_manager.js:2535-2558`), sound `change_button`. One
   mutation per site.
4. **The waiting dialog.** One modal on both views (the shared `modal-dialog`: `role="dialog"`,
   `aria-modal`, focus in, Tab trap, focus return). Media-neutral, AAC-sized copy: "Saving when
   your picture or recording finishes uploading...". Buttons: "Back to editing" always; "Save
   without it" from 15 s (timer starts at the first Save click and survives re-checks). It is
   opened `uncloseable`, so Escape and the backdrop do nothing. If another modal replaces it
   (`{replaced: true}`, `utils/modal.js:135-145`), the deferred save is cancelled (treated as
   "Back to editing"). Before re-entering `saveButtonChanges` the waiter closes it only if
   `modal.is_open('<its template>')` (`utils/modal.js:232`), so a copy or purchase modal that
   re-entry opens (copy_on_save, `board-detail.js:6255-6262`) is never closed by mistake.
5. **"Back to editing" cancels only the deferred save.** Uploads keep running and apply; the
   user stays in edit mode and the next Save includes them. Discard, route exit and a board
   change call `cancel_pending_media()`. "Save without it" also cancels the pending operations
   on both views, so nothing late reaches the saved board in Basic (which stays on its route).
6. **Identity at re-entry.** At defer time the waiter captures the controller, `model.id`, an
   edit-session counter and `sessionUser.id`; the settled callback saves only if all match. The
   counter is bumped by an observer on each view's own edit flag (Basic: `appState.edit_mode`,
   set at `app-state.js:767` and `:1633`; Modern: the controller's `edit_mode`), by a `model.id`
   observer, and in Modern's edit route `resetController`. Basic checks identity before its own
   `toggle_mode('edit')` (`board/index.js:346`).
7. **Guard = any live token** (not `image_id && pending_image`), so F4's empty button waits too.
8. **Drag-and-drop** begins and ends a `user` token (`apply_dropped_image_to_button`).
9. **Sounds:** convert `select_sound_preview` as #1346 did pictures, capturing the start
   controller and `this.button`; attach to a board button only when the start controller was a
   live button-settings owner; gate `clear_sound_work` on still owning the controller; keep the
   resolve/reject contract for `new-sound.js`; the sound license PUT takes no token.

Rejected: reusing `board_saving` (stuck overlay over the speak board); chaining inside
`board.save()` (the `process_for_saving` snapshot is taken first); "Save shows Uploading"
(simpler and safer, not chosen: Traci wants one click to save).

## Tests (red first), each with its mutation
Unit (`pending-media-test.js`): picture and sound tokens keep separate flags; outcomes counted,
`failed` only for `user`; a flag with no token never blocks; operations begun while waiting are
waited for; a token on a replaced button object is still waited for; `cancel_pending_media`
ends every live token and marks it; the waiter resolves after `afterRender`.
Controller, both views, through the real Save paths (Modern: confirm-leave-edit, then Save):
F4 empty button waits and saves with the `image_id`; button with a picture waits and saves;
Enter then Save carries the automatic symbol; a failed automatic lookup does not block; a
failed user upload, no save, back in edit mode with the message; "Back to editing", then the
upload lands and the next Save includes it; "Back to editing", then Discard while the upload is
in flight, the late picture is not applied; route exit (edit route `resetController`) during the
wait, no save, dialog closed, `board_saving` false; 15 s shows "Save without it", which saves and
cancels the rest; Escape and backdrop do nothing; a replacing modal cancels the deferred save;
copy_on_save re-entry leaves the copy dialog open; drag-and-drop waits; sound waits and saves
`sound_id`; sound with settings closed or moved on lands on the right button and leaves the next
button's preview alone; a recorder takeover gets no board sound. Defensive (UI blocks them): two
Saves, one save; a programmatic board change, no save on the new board.
afterEach clears the registry, waiters and the 15 s timer.

## Verification (2026-11-21)

Red run (tests committed at b0434dab5 and 62cff7449, empty `pending_media.js`/`save_after_media.js`
shells): the new tests failed on their assertions. Two failed for the wrong reason first (a rendering
test with no modal setup; Modern's shift-label observer on a thin stand-in board) and were fixed
before the implementation landed.

Green, targeted (`--filter "/pending media|pending image|save after media|save-waiting|Save waits
for uploads|soundGrabber|pictureGrabber|editManager|contentGrabbers/i"`, Node 22): 330 tests,
327 pass, 3 skip (pre-existing), 0 fail. The green runs caught real defects on the way: the dialog
passed `@uncloseable={{true}}`, which renders an empty attribute that `modal.is_closeable()` reads as
closeable (fixed to `"true"`, the convention); the drop path looked the button up through
`find_button`, tying it to the open board (now a placeholder token).

Lint caught one: removing the old guard also removed `var orderedButtons`, which Basic's save reads
later (`board/index.js`); every Basic save would have thrown. Restored. No test reaches that line
(the Basic tests stop at the wait), so `lint:js:ci` is the gate for it.

Mutations, one build with temporary `window.__mut` switches (never committed), each run on its scoped
filter; every one went red on the intended test:
M1 cancelled not recognised (5 apply-site tests); M2 identity check (1); M3 failure stops the save
(1); M4 Back to editing cancels uploads (1); M5 close without checking the dialog is ours (1, test
added after it first survived); M6 automatic lookup failure counted (2); M7 resolve before
afterRender (1); M8 Modern edit exit (1); M9 Basic edit exit (1); M10 no waiting at all (13); M11 drop
cancel check (1); M12 sound written to the current controller (3); M13 automatic symbol cancel checks
(1); M14 "Save without it" at once (2); M15 picture cancel checks (1).

ESLint: `lint:js:ci` lists the existing `.eslint-todo` rows of board/index.js, board-detail.js,
content-grabbers.js and edit_manager.js as new because they moved down. Linting develop's copy of each
file against the branch gives identical findings (rule, column, message) in all four; the new files
have none. Re-anchoring those rows is a baseline edit and waits for Traci's approval (Rule #0 item 14).

## End-to-end (Playwright, 2026-11-22)

`app/frontend/e2e/save-waits.spec.js` (project `save-waits`), local stack from this worktree (puma
:5000, `ember serve` :8184, `rake extras:assert_js`), synthetic users from
`e2e/support/users-save-waits.rb`. Real Rails creates the image and sound records and saves the
board; the browser answers only the S3 POST (held until the test opens its gate, or failed) and
`upload_success` (a local stack has no S3 credentials). The saved board is read back from the server.

- PR code: 9 passed, 1 skipped. Modern: first picture waits then saves; Back to editing keeps the
  upload and the next Save includes it; a failed upload cancels the save with the message; Save
  without it after 15 s saves without the picture and the late upload never lands; a recording waits
  then saves. Basic: the four picture scenarios, by dropping the picture onto the button.
- develop's app files swapped into the same worktree (served build checked for the old
  `wait_for_images` guard): all nine fail at "the waiting dialog shows".
- Skipped: Basic recording. In a development build Basic's button settings do not close at all, with
  nothing uploading: Ember asserts "You attempted to update `color_key_id` on app-state, but it had
  already been used previously in the same computation" (`editManager.update_color_key_id`,
  `utils/edit_manager.js:1248`). Same on develop, so pre-existing and outside this change; the
  assertion is stripped in production builds, where close may work. Separate follow-up.
- Seen on the drop path: a failed drop's own "Upload failed" error shares the single flash slot with
  this change's "did not upload, so the board was not saved" message, which replaces it.

## After review and merge (2026-11-22 to 11-23)

Merged as c85094b49 on 2026-11-23, after two merges of develop into the branch.

- **Merge conflict (11-22).** Only the 12 non-English locale files conflicted: develop (#1328) had
  replaced the `***` sync strings with translations and added `device_boards_*` keys at the same spot
  as this PR's dialog keys. Resolved by keeping develop's side of every line and adding this PR's six
  keys back; all 13 locales parse and hold both sets. Targeted QUnit on the merge (this PR's filter
  plus the board pages): 617 tests, 614 pass, 3 skip, 0 fail; `lint:js:ci` new=0.
- **Playwright on the merge: the drop helper was flawed, not the app.** The first run failed one Basic
  test with no upload started; the failure was intermittent (about one run in three, a different
  Basic test each time) and reproduced on the unchanged spec. Logging `el.isConnected` at dispatch
  showed the target off the page in every failed run and on it in every passing one: Basic redraws
  its buttons just after entering edit mode, and `locator.evaluate` resolves the element and runs the
  function in two steps, so a redraw in between sent the drop to a detached node, which never
  bubbles to the document listener (`services/content-grabbers.js:3345`). Branch commit a6c016597 (squashed into c85094b49) looks the
  button up and dispatches in one `page.evaluate`; assertions unchanged. Then three full runs in a
  row, each from a fresh seed: 9 passed, 1 skipped each time.
- **Codex review (on 15301de29), two findings, neither needs a change:**
  - "Cancel uploads when the edited board changes" (board-detail.js `_media_on_board_change`):
    claimed that an edit-to-edit board hop keeps `edit_mode` true, so a late picture lands on the
    next board. Disproved in a browser, 3 of 3: a picture held at the bucket, then
    `onSelectBoardFromCollectionEdit` (the Board Collections drawer's in-edit path) to a second
    board. `edit_mode` goes false then true during the hop (the parent route's `setupController`,
    `routes/user/board-detail.js:356`, then `routes/user/board-detail/edit.js:56`); observers run
    synchronously here, so the false cancels the upload, and neither board's button 1 got the
    picture, in memory or on the server. A no-hop control in the same run did apply the picture.
  - "Restore the forbidden ESLint baseline edits": the 91-row re-anchor was approved by Traci on
    2026-11-21 under Rule #0 item 14 and is in the PR body; the reviewer could not see the approval.
