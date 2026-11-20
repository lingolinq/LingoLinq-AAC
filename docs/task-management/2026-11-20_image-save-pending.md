# 2026-11-20: board save blocked by "Please wait for all images to finish loading before saving."

Branch `fix/scot-image-save-pending-4b5b4ff7`, cut from `develop` at b441d2055.

## Reproduction

The source-level harness from the earlier session (`/tmp/lingolinq-save-warning-repro.cjs`,
written against 46dddb591) was re-pointed at b441d2055. Both defects still reproduce, and
the three files it extracts (`services/content-grabbers.js`, `utils/edit_manager.js`,
`controllers/board/index.js`) are unchanged between the two commits:

```
CONTROL settings open: savedImage=test-new-image; pending=false; boardSave=allowed
REPRO settings closed: savedImage=test-new-image; pending=true; boardSave=BLOCKED
WARNING: Please wait for all images to finish loading before saving.
CONTROL auto-symbol save normal completion: pending=false; image=test-auto-image
REPRO auto-symbol save superseded by manual image: pending=true; image=test-manual-image
```

## Fact sheet

(a) Where `pending_image` is READ
- CONFIRMED: the board-save guard, `controllers/board/index.js` `saveButtonChanges`
  ("btn.get('image_id') && btn.get('pending_image')"), and the same loop in
  `controllers/user/board-detail.js`. Both iterate `ordered_buttons`.
- CONFIRMED: button settings is opened on `editManager.find_button(id)`
  (`controllers/board/index.js` buttonSelect / symbolSelect / actionSelect,
  `board-detail.js` `_open_button_settings`). `find_button` returns the object in
  `ordered_buttons` (`edit_manager.js` "res = ob[idx][jdx]"). So the settings
  component's `model` is the exact object the guard reads.
- CONFIRMED: `utils/button.js` `pending` is a computed on `pending_image`/`pending_sound`;
  `button-settings.hbs` shows a spinner on `model.pending_image`.

(b) Every writer
- `true`: only `select_image_preview` (`content-grabbers.js`) and `lucky_symbols`
  (`edit_manager.js`).
- `false`: `select_image_preview` editor branch (right after the synchronous recursive
  save starts), its success and failure handlers (both skipped when the settings
  component is destroyed or destroying); `lucky_symbols` save success (only when the
  result still applies), save failure, no-result, search failure; `clear_image`;
  the license branch of `pictureGrabber.save_pending`; the rebuild in
  `edit_manager.js` ("raw.pending_image = false").

(c) Cross-file claims checked
- CONFIRMED: `contentGrabbers.save_pending` resolves before the image save finishes
  (its own comment: "the returned promise isn't saying everything is done saving").
  `button-settings.js` `close` closes the modal on that promise, so the component is
  destroyed while the save is still running. The save still applies the image to the
  board (`editManager.change_button` is not guarded), but the `pending_image = false`
  is guarded on the component being alive, so it never runs. Defect 1.
- CONFIRMED: in `lucky_symbols`, when the automatic result no longer applies
  (`!button.image || force_refresh` is false because a manual image arrived), the save
  success branch writes nothing, so `pending_image` stays true. Defect 2.
- CONFIRMED: with `force_refresh` (placeholder `empty_22_g` image), the same condition
  is true even after a manual pick, so the automatic symbol overwrites the manual
  image in its `afterRender`. A third defect in the same path.
- CONFIRMED: one operation's completion writes `false` even while another operation on
  the same button is still running (manual save finishing while the automatic one is
  in flight, the editor branch clearing right after its recursive save starts). That
  lowers the guard early.

## Proposal

Candidate A (chosen): per-operation tokens on the originating button.
`utils/pending_image.js` keeps a WeakMap from button object to the set of operations
still running. `begin_pending_image(button)` adds a token and sets `pending_image`;
`finish_pending_image(button, token)` removes it and clears `pending_image` only when
none remain. `select_image_preview` captures `controller.model` at the start and
finishes on it in both success and failure, whether or not the component is still
alive. `lucky_symbols` captures the button and its starting `image_id`, treats any
change of `image_id` as "superseded" (checked both when the save resolves and again
in its `afterRender`), and finishes its token on every exit. The board-save guard is
unchanged.

Candidate B (rejected): drop the "component alive" checks and write `false` on the
captured model; add a `false` write to the superseded branch of `lucky_symbols`. Fewer
lines, but it keeps last-writer-wins: a manual save finishing clears the flag while
the automatic save is still running, so the guard can let a board save through with
an image in flight.

Candidate C (rejected): make `save_pending` wait for the image upload before the modal
closes. It changes the documented contract of `save_pending` and the closing UX (a
slow upload holds the modal open), and does nothing for defect 2.

Risks seen
- The remaining direct `false` writers (`clear_image`, the license branch, the rebuild)
  do not go through the tokens. They are unchanged by this fix; the rebuild creates new
  button objects, so old tokens finish against the old object and are no-ops.
- `find_button` can swap a plain object for a `Button.create` copy; an operation begun
  on one object does not mark the other. Pre-existing, not made worse.

Questions not resolved
- Whether `clear_image` should also cancel an in-flight automatic symbol (it currently
  lets it land on a cleared button). Left as is: out of scope.

Tests (red before the fix)
- `tests/utils/picture_grabber-test.js` "pending_image on the button the save started
  from": success and failure with settings open; success and failure with settings
  closed (the component destroyed) before the save settles.
- `tests/utils/edit_manager-test.js` "when a manual image supersedes the automatic
  symbol": pending cleared after a superseded automatic save; manual image kept over a
  placeholder refresh; pending stays true until both a manual and an automatic save on
  the same button finish.
- Mutation: revert the content-grabbers / edit_manager hunks; the closed-settings tests
  and all three supersede tests go red.
