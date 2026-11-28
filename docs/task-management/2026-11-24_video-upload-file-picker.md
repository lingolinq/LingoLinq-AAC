# Video upload button reloads the page instead of opening the file picker (2026-11-24)

Found during the #1242 (KAN-115) staging smoke test: uploading the synthetic test video from the
New Note modal reloaded the page. Staging web logs show four `GET /<user>/account?video_upload=`
requests between 00:41 and 00:47 UTC on 2026-11-25, the query string the browser builds when it
submits the modal's `<form class="md-modal-form">` natively.

## Cause (verified)

- The upload button in `app/frontend/app/components/video-recorder.hbs` has no click handler. A
  transparent `<input type="file" id="video_upload">` in the same `.file_select_holder` span is laid
  over it by `.file_select_holder input` (absolute, `width: 100%`, opacity 0) and takes the click.
- `.video_buttons .btn { width: 100%; }` makes the upload button full width, so it cannot share a
  line with "Record Video" and wraps. The inline span splits across the two lines and the absolute
  input is sized from the empty first fragment: 0px wide, beside the button.
- So a real pointer click hits the button, which has no `type` inside a form: a native submit and a
  full page reload. "Record Video" is not affected: its `ctrlAction` handler calls `preventDefault`.
- Measured with staging's compiled stylesheet in headless Chrome (`document.elementFromPoint` at the
  button's centre): upload button -> `IMG` inside the button; the sound uploader's identical markup
  (enough room on its line) -> the file input. Removing the Record button alone also made the
  input cover the button, which isolates the line wrap as the cause. A wider column did not help
  (the button is `width: 100%` at any width).
- Same markup on `main`, so production has the bug; no video had ever been uploaded there.

## Fix

`.video_buttons .file_select_holder { display: block; }` next to the `.video_buttons .btn` rule.
The holder then holds the button whole and the input covers it. Button size unchanged
(82x50 at 1280px before and after in the probe). `.video_buttons` is used only by
`video-recorder.hbs`, which renders in record-note, new-goal, user/goal and message-unit.

Rejected: `type="button"` on the upload button alone (suggested by a browser-extension diagnosis).
It stops the reload, but the click still lands on the button, which has no handler, so the picker
still would not open.

## Test

`app/frontend/tests/integration/components/video-recorder-upload-test.js`: renders the real
component inside a `form.md-modal-form` and asserts the file input's box covers the upload
button's box. Red without the fix (`button 771,401,42,25, input 813,378,0,45`), green with it,
also with `timingStrict=1`.

## Follow-up (not in this change)

Keyboard users: every `.file_select_holder` input has `tabindex="-1"`, so Tab reaches the bare
button and Enter or Space presses it. Inside a form that submits; outside one nothing happens.
The upload control needs a keyboard path that opens the input.
