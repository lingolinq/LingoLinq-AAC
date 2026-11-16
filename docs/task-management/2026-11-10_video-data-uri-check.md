# 2026-11-10: align video URL validation with images

Branch `traci/security/video-data-uri`, cut from `origin/develop` 0d50497.

## Goal

`UserVideo#process_params` accepted a url of any scheme, and a `data:` URI of any MIME type,
and stored it for a video. `ButtonImage#process_params` only keeps `data:image/*` and only passes
`http` urls to `process_url`; `ButtonSound#process_params` only passes `http` urls. Bring videos
in line: keep `http(s)` urls and `data:video/*` URIs, drop everything else.

## Fact sheet

**(a) Where is the url read?**

- CONFIRMED `app/models/user_video.rb:49` (before the change): `process_url(params['url'], ...) if params['url']`, no scheme check.
- CONFIRMED `app/models/concerns/uploadable.rb:91-100`: `process_url` stores a url that is not
  already in our buckets (`Uploader.valid_remote_url?`, `lib/uploader.rb:906`) as
  `settings['pending_url']`.
- CONFIRMED `app/models/concerns/uploadable.rb:102-125`: `check_for_pending` (before_save,
  `uploadable.rb:813`) copies `pending_url` into `url` and schedules `upload_to_remote` whenever
  `@remote_upload_possible` is falsy.
- CONFIRMED `lib/json_api/video.rb:11`: the API returns `video.url` as stored.

**(b) Every shape the url can hold, and its writer**

- `http(s)` url: any API client (`Api::VideosController#create`/`#update`).
- `data:video/...;base64,...`: the Ember app. Recorded videos are a `Blob` typed `video/webm`
  read with `readAsDataURL` (`app/frontend/app/services/content-grabbers.js:2252-2262`); picked
  files are only accepted when `File.type` matches `^video` (`content-grabbers.js:481`) and are
  read the same way (`content-grabbers.js:2073-2083`). The serializer sends `data_url` as `url`
  (`app/frontend/app/models/video.js:77-79`).
- Any other string (other schemes, other `data:` MIME types): only a hand-built API request.
- An S3 url on re-save of an existing video (`video.js` serializer, `url` unchanged).

**(c) Cross-file claims**

- CONFIRMED the only server writers of a video url are `Api::VideosController#create`
  (`app/controllers/api/videos_controller.rb:8`, `UserVideo.process_new`) and `#update`
  (`videos_controller.rb:29`, `video.process`), both through `process_params`
  (`app/models/concerns/processable.rb:20,216-219`). Every other `UserVideo` reference in `app/`
  and `lib/` is a lookup by id (log sessions, goals, units, transcoder, flusher, uploader sweeps).
  `video` in `lib/converters/lingo_linq.rb:4` and `app/models/board.rb` is a board button field,
  not a `UserVideo`, so board/OBF import never creates one. `upload_success`
  (`app/controllers/concerns/remote_uploader.rb:13-41`) sets `url` to our own bucket url only.
- CONFIRMED `ButtonImage#process_params` drops a non-`image/*` `data:` URI and calls
  `process_url` only for `^http` (`app/models/button_image.rb:216-230`).
- CONFIRMED `ButtonSound#process_params` calls `process_url` only for `^http`
  (`app/models/button_sound.rb:305`).
- ASSUMED: a native (Cordova) `captureVideo` file always carries a `video/*` type
  (`content-grabbers.js:2111-2114`). If it ever came through untyped, its `data:` url is now
  dropped; the record still gets an upload form (pending because `url` is nil) and the client
  still uploads from its blob/data URL, so the upload itself does not depend on the url being kept
  (see the end-to-end finding below).

## Candidates considered

1. **Scheme allowlist in `UserVideo#process_params` (chosen).** `UserVideo.acceptable_url?`
   accepts `\A(https?://|data:video/)` (case-insensitive); anything else skips `process_url`. Same
   place and style as the image and sound checks, touches only videos.
2. **Per-file-type allowlist inside `Uploadable#process_url`.** One chokepoint for all three
   media types, but images and sounds already filter before calling it, and changing the shared
   concern widens the blast radius to every image and sound path for no gain here. Rejected for
   this change.
3. **Reject with a processing error (HTTP 400) instead of dropping.** Louder, but differs from
   the image behaviour this change aligns with. Rejected.

## Tests

`spec/models/user_video_spec.rb`, `process_params` / `url scheme`: drops a non-video `data:` URI,
drops a `javascript:` url, keeps a `data:video/webm` URI pending, keeps an `https` url pending,
drops a non-video url sent on update. Three more were added after review (8 in all): drops a url
whose allowed scheme only appears later in the string, drops a non-String url without raising,
keeps an upper-case `HTTPS` url. Each part of the check (the anchor, the case flag, the type check)
was removed in turn and the matching example went red.

- Red before the fix: 10 examples, 3 failures (the three "drops" cases; the two "keeps" cases
  pass, confirming the legitimate shapes behave as before).
- Baseline at 0d50497, develop versions of `spec/models/user_video_spec.rb` and
  `spec/controllers/api/videos_controller_spec.rb`: 24 examples, 0 failures.
- After the fix, same two files: 29 examples, 0 failures (before the three later cases; the
  upload specs listed under the finding below are the current count).
- Neighbouring specs that touch `UserVideo` (log_session, user_goal, button_sound, uploadable,
  media_object, flusher, transcoder, uploader, json_api goal/video/log, units controller):
  840 examples, 0 failures, 9 pending, both with and without the fix.
- Falsification: guard removed (back to `if params['url']`) gives 3 failures; allowlist loosened
  to any `data:` gives 2 failures (the non-video `data:` cases). Restored from a saved copy; green.

## Finding: server-stored `data:video` url breaks the video upload (fixed 2026-11-15, below)

Path for a recorded or picked video with S3 configured:

1. CONFIRMED create: `remote_upload_possible: true` (`videos_controller.rb:8`), so the
   `data:video` URI is kept in `settings['pending_url']`, `url` stays nil, `pending` is true, and
   the response carries `meta.remote_upload` (`lib/json_api/video.rb:20-28`).
2. CONFIRMED the client uploads the blob (or the data URL as a blob) straight to S3 with that form
   and then calls `upload_success` (`content-grabbers.js:250-256, 268-290, 291-344`).
3. CONFIRMED `upload_success` sets `url` and `pending = false` but does not clear `pending_url`
   (`remote_uploader.rb:29-33`). On `record.save`, `check_for_pending` sees `pending_url` and no
   `@remote_upload_possible` on this fresh instance, so it copies the data URI back into `url` and
   schedules `upload_to_remote` with it (`uploadable.rb:104-116`).
4. CONFIRMED `user_videos.url` is `varchar(4096)` (`db/schema.rb:759`). With a 6,000-byte payload
   the save raises `ActiveRecord::ValueTooLong` (reproduced in a throwaway controller spec), so
   `upload_success` fails and the client rejects with "upload not completed"
   (`content-grabbers.js:336-338`), surfaced as "upload failed" (`content-grabbers.js:2414-2419`).
   Any real recording is far larger than 4 KB, so recording or picking a video does not finish
   today; the S3 object is written but the record stays pending with no url.
5. CONFIRMED with a tiny payload (under 4 KB) the save succeeds but `url` ends up as the data URI,
   not the S3 url, and the scheduled `upload_to_remote` then records `invalid_data_uri`, because
   `decode_data_uri_body` handles only audio and image (`uploadable.rb:410-418`,
   `lib/svg_sanitizer.rb:236-238`).
6. CONFIRMED the update path has no `remote_upload_possible`, so a `data:video` url sent on update
   goes straight into `url` (same length limit) and gets the same failed server upload.
7. CONFIRMED a create with no `pending_url` completes `upload_success` normally
   (`spec/controllers/api/videos_controller_spec.rb:127-138`). The client always has the bytes
   itself (blob or data URL), so the server never needs the data URI for the upload.

Fixed 2026-11-15 (Traci's go): `upload_success` now clears `pending_url` when it is a `data:` URI
(`remote_uploader.rb`). The first version cleared it for every type; a local red-team pass showed
that images and sounds picked by web address rely on that pending_url: the save in
`upload_success` schedules `upload_to_remote` with it, which fetches and sanitizes the source and
records `source_url` and size (`uploadable.rb:272-302`). A web address is now left alone, so that
flow is unchanged. Pinned by `spec/controllers/api/images_controller_spec.rb` "should still
schedule the server fetch for an image picked by web address", which failed against the first
version and passes now.
Red test first: `spec/controllers/api/videos_controller_spec.rb` "should keep the S3 url for a
video created from a data URI" failed with `ActiveRecord::ValueTooLong` before the fix and passes
after. Upload-related specs (videos, sounds, images controllers, remote_uploader, user_video,
uploadable, media_object): 244 examples, 0 failures. Falsified: with the line disabled the video
example fails with `ActiveRecord::ValueTooLong` again; restored.

Seen, not fixed (pre-existing): any other save of a still-pending record on a fresh instance (an
update before the client confirms) takes the server-upload branch of `check_for_pending` and copies
pending_url into url; for a video that is the same too-long failure (`uploadable.rb:106-116`).

## Canonical review of PR #1317 (2026-11-15)

`REVIEWED=PR lingolinq/LingoLinq-AAC#1317 at 4cdc99e5bee89ecafe72528714d2f6e1d1b961ff`, after the PII
preflight (`review-preflight.sh pr 1317`, exit 0). Both passes read only the preflight diff.
`/review-pr`: request changes (one High). `/adversary-review`: ship with conditions (no Critical or
High).

1. High (senior-dev) / Medium (red team): the `data:` clear in `upload_success` would change images
   and sounds created from a `data:image` or `data:audio` URI. REFUTED outside the diff:
   `Uploadable#process_url` (`uploadable.rb:96`) is the only writer of `pending_url`, and
   `ButtonImage` and `ButtonSound` call it only for a url matching `/^http/`
   (`button_image.rb:230`, `button_sound.rb:305`); their `data:` content goes to
   `settings['data_uri']`. Both reviewers recommended narrowing anyway; the clear now matches
   `\Adata:video/` only, which keeps the change visibly inside the video bug.
2. Medium (both): a `data:video` url sent on update still reached `url` and raised `ValueTooLong`.
   `UserVideo#process_params` now keeps a `data:` url only when `remote_upload_possible` is set
   (create, `videos_controller.rb:8`, the only other caller being update at `:30`); on update it is
   dropped and the save succeeds. Red first: "drops a data:video url sent on update, without
   failing the save" raised `ValueTooLong`; green after; red again with the previous
   `user_video.rb`.
3. Medium (senior-dev): confirm-time edge cases. Added "should keep the S3 url when the pending data
   URI is written in upper case" (passes; pins the `/i`). A nil `pending_url` at confirm is the
   existing "should succeed for valid confirmation key that is found on server".
4. Low (senior-dev): the non-String example now also asserts `errored?` is false.
5. Seen, not fixed (pre-existing, red team): until the client confirms, the whole `data:video`
   payload sits in `settings['pending_url']`, with no expiry for an abandoned upload. The client
   already holds the bytes, so storing a marker instead would remove it; a separate change.
6. Seen, not fixed (pre-existing, both): an `http(s)` video url still reaches the server-side fetch,
   the same as images.

Upload specs after: 246 examples, 0 failures.

