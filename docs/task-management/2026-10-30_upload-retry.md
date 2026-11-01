# 2026-10-30: failed server-side uploads are retried, with a limit

Part of lingolinq_mobile#3 ("Still open" items 1 and 2). Both were reproduced on 2026-10-30 with
a throwaway spec (S3 faked as configured, the S3 post failing):
- a PNG/JPEG whose upload fails stays embedded and `pending`, and a later save queues nothing;
- an SVG whose upload fails schedules another upload on every attempt (3 of 3), with no limit.

## Proposal E (for review)

### Fact sheet
- (a) Where the retry decision is read. CONFIRMED:
  - The only automatic re-upload is `Uploadable#check_for_pending` (`app/models/concerns/uploadable.rb:96-118`), a `before_save` (`:767`).
  - Its SVG branch (`:110-112`) schedules `upload_to_remote(UPLOAD_FROM_STORED_DATA_URI)` whenever there is no url, `settings['data_uri']` is present and `requires_server_sanitized_upload?` (`:121-127`) is true. The job is enqueued by `upload_after_save` (`:161-165`).
  - For PNG/JPEG nothing ever schedules a retry.
- (b) Shapes after a failed S3 post (`upload_to_remote` `:335-352`), with their writers. CONFIRMED:
  1. A `data:` source of at most `DATA_URI_STORE_MAX_BYTES`:
     - writes `data = url`, `pending = false`, saves; `settings['data_uri']` is left as it was.
     - `check_for_pending` then recomputes `pending = true`, because url is nil.
     - SVG: it re-schedules, which is the loop. PNG/JPEG: nothing happens, and it stays pending forever.
  2. A `data:` source over the limit: `errored_pending_url = url`; no data; no retry.
  3. An `http` source:
     - `store_downloaded_file_fallback!` (`:420-432`) embeds the bytes (`data`, `settings['data_uri']`), which gives shape 1;
     - otherwise `errored_pending_url`.
  4. The other writer of "url nil, data present" is not a failure. A client-created image (`button_image.rb:213-227`, `images_controller.rb:11` with `remote_upload_possible`) stores its `data_url` while the client uploads to S3 itself.
- (c) Cross-file claims. CONFIRMED:
  - `settings` is `secure_serialize`d (`button_image.rb:19`, `button_sound.rb:19`), so it cannot be queried.
  - `url` is indexed on both tables (`db/schema.rb:248`, `:267`).
  - Resque here has no delayed jobs (`boy_band` 0.1.16 has only immediate `schedule`/`schedule_for`).
  - The precedent for "retry later, with a counter" is `ButtonSound.schedule_missing_transcodings` (`button_sound.rb:147-167`). It is driven daily from `scheduler:dispatch` (`lib/tasks/scheduler.rake:152-155`), which also has an hourly section.

### Candidate fixes
- **A (proposed): the fallback marks the failure; an hourly sweep retries with back-off and a cap.**
  1. On a failed post that takes the embed fallback, set `settings['upload_failures'] += 1` and `settings['upload_failed_at'] = now`.
  2. `check_for_pending`'s SVG branch does not schedule when `upload_failed_at` is set. The sweep owns retries, which ends the loop where it starts.
  3. A new `Uploadable` class method, `retry_failed_uploads`, for `ButtonImage` and `ButtonSound`, run in the hourly section of `scheduler:dispatch`.
     - Candidates: `url IS NULL AND data IS NOT NULL AND updated_at > 2.weeks.ago`, in id batches.
     - Each candidate's settings are decrypted in Ruby. It is kept only when it has `upload_failed_at`, `upload_failures < 6`, and `upload_failed_at` older than `2**(failures-1)` hours.
     - It schedules `upload_to_remote(UPLOAD_FROM_STORED_DATA_URI)` on `slow`, at most 500 per run.
  4. A successful upload clears both markers.
     - Unmarked records are never touched: client uploads in progress, and the records stuck before this change. The later repair task can mark those, so this sweep drains them at a bounded rate.
- **B: a bounded immediate retry inside the job.** It ends the loop, but Resque has no delay. A short S3 outage would use up every attempt within seconds, and PNG would still need a first retry from somewhere. Rejected.
- **C (simplest): mark and stop the loop only; leave retries to a manual repair.** Rejected: new production failures would pile up with nothing visible, which is issue item 1 itself.

### Risks and open questions
- **Cost of the sweep:**
  - Rows with url null and data present that were updated in the last 2 weeks: on staging the 35,689 stuck rows are older (Sept), so they are excluded.
  - The cost scales with recent failures plus client uploads in progress.
  - Not measured on production. Is the 2-week window, decrypting every candidate, acceptable?
- **Devices that already synced the embedded version:**
  - When a retry succeeds, the board JSON changes. Devices re-fetch a board only when its revision changes.
  - Is a board's revision bumped when one of its images gets a url? Unresolved. It belongs to the repair task too.
- **No limit on `upload_failures`:** after 6 failures the record stays embedded and still displays. That is the current behaviour, now visible in settings.
- **The new D2 raise:** in deployed environments the scheduler and worker have S3. Locally without S3 (development), the fallback repeats on each back-off. That is harmless, and the cap ends it.
- **Data:** nothing is deleted. The embedded data stays until an upload succeeds, as today.

### Tests (red first), and the mutation each must fail under
1. SVG: after a failed upload, a later save schedules no upload. Mutation: drop the `upload_failed_at` check in `check_for_pending`.
2. After a failed upload:
   - `retry_failed_uploads` schedules nothing before the back-off has elapsed;
   - it schedules one upload after it, for PNG and for SVG;
   - it schedules nothing once failures reach 6.

   Mutations: drop the back-off; drop the cap.
3. A successful retry clears `data`, `data_uri` and both markers. Mutation: do not clear the markers.
4. An unmarked "url nil, data present" record (a client upload in progress) is never scheduled. Mutation: drop the marker filter.
5. The per-run limit holds. Mutation: drop the limit.
6. The sweep is wired into the hourly section of `scheduler:dispatch` (the existing scheduler spec pattern).

## Proposal E review (2026-10-30): two independent local adversary reviews, each checked by me

CONFIRMED by me in the code, and acted on:
- **The oversize SVG loop stays open under A.**
  - SVGs up to 5 MB are accepted (`lib/svg_sanitizer.rb:12`), but the embed limit is 512 KB (`uploadable.rb:13`).
  - A failed post over the limit sets `errored_pending_url`, keeps `data_uri` and saves (`:342-351`). `check_for_pending` then re-schedules.
  - So the marker must be set on every failed non-raster post, not only on the embed branch.
- **Running the sweep inside the scheduler Job is unsafe.**
  - The Job has 512Mi and `--max-retries 0` (`deploy-cloudrun.yml:1211-1214`).
  - Each candidate row holds the picture twice (`data` plus `settings['data_uri']`), and an out-of-memory kill is not rescued by `run_task` (`scheduler.rake:105`).
  - It would also skip the 06:00 retention purges that run after the hourly tasks.
  - So dispatch only enqueues the sweep, and the sweep loads one record at a time from plucked ids.
- **The back-off is keyed on the time of the failure,** so a slow queue enqueues the same record again, and a raise before the failure branch (D2's `ensure_deployed_uploads_configured!`) never moves it toward the cap.
  - So the attempt is counted when it is scheduled (`upload_failures` +1, `upload_retry_at` stamped), not when it fails.
- **A stale marker would block a later legitimate upload.** `process_params` can write a new `data_uri` on a url-nil record (`button_image.rb:213-228`). So it clears the markers when it does.
- **With an hourly cron, a 1-hour back-off is really 2 hours.** So the comparison allows 5 minutes of slack.

Claims withdrawn from the fact sheet:
- (b)3: http-sourced fallbacks keep their url.
  - `check_for_pending` sets `url = pending_url` (`:106`), and `store_downloaded_file_fallback!` never clears it. So they are never "url nil, data present".
  - They display through their source url (`lib/json_api/image.rb:49`) and do not bloat board JSON.
  - Not retried by this change, and stated as such.

Recorded, not acted on here:
- **Devices that already synced keep the embedded picture.**
  - `current_revision` hashes the grid and buttons, not image urls (`board.rb:969-974`). Board JSON is not cached (`board.rb:2532-2561`). The client reuses a board whose revision matches (`persistence.js:2773-2775`).
  - The embedded copy still displays offline, so nothing breaks; only size and staleness are affected.
  - The button set stores `image.url` (`board_downstream_button_set.rb:590`), which is nil for an embedded picture. A button-set refresh after a successful upload belongs with the repair task.
- **Staging's scheduler Job has no trigger** (`scheduler.rake:5`, as of 2026-09-13), so the sweep runs only where the scheduler fires.
- **Pre-existing, outside this change (reproduced 2026-10-30):** `Api::ImagesController#update` checks only `view` (`images_controller.rb:43`), which every user has (`button_image.rb:21`).
  - A different signed-in user changed another user's image license and replaced its picture data (status 200).
  - Reported to Traci separately. Not posted on the public issue.

## Proposal E2 (implemented below)
1. On a failed non-raster post (the embed branch, the oversize branch, and the http branch that ends in `errored_pending_url`), set `settings['upload_failed_at']`.
2. `check_for_pending`'s SVG branch schedules nothing while `upload_failed_at` is set.
3. `process_params` clears `upload_failed_at`, `upload_failures` and `upload_retry_at` when it stores a new `data_uri`. A successful upload clears them too.
4. `Uploadable.retry_failed_uploads` (`ButtonImage`, `ButtonSound`):
   - plucks ids where `url IS NULL AND data IS NOT NULL AND updated_at > 2.weeks.ago`, and loads one record at a time;
   - keeps those with `upload_failed_at`, `upload_failures < 6`, and `upload_retry_at` (or `upload_failed_at`) older than `2**failures` hours minus 5 minutes;
   - for each kept record, sets `upload_failures += 1` and `upload_retry_at = now`, saves, and schedules `upload_to_remote(UPLOAD_FROM_STORED_DATA_URI)` on `slow`;
   - schedules at most 500 per class per run.
5. `scheduler:dispatch` hourly: `run_task "retry_failed_uploads"` only enqueues the sweep for each class, through `Worker.schedule_for(:slow, ...)`.

## Implemented (2026-10-30)

### Found while implementing
- **The SVG reschedule also comes from a save before the post.**
  - `full_filename` (`uploadable.rb:57-65`) saves the record on its first upload. That save runs `check_for_pending`, which queued another upload before the post had even been tried.
  - Traced with a throwaway spec: the job came from `upload_after_save` <- `full_filename` <- `remote_upload_params` <- `upload_to_remote`.
  - The marker alone could not stop it, because it is set after the post fails.
  - So `upload_to_remote` sets `@uploading_to_remote` for its own duration (cleared in a method-level `ensure`), and `check_for_pending` schedules nothing while it is set. This also removes the duplicate upload that followed every successful SVG upload.
- **An existing example caught a side effect of my first attempt.** `uploadable_spec.rb:349` ("stores downloaded image bytes when S3 upload fails") expects `pending == false`.
  - I had gated the whole SVG branch, which also skipped its `pending = false`.
  - The fallback code means `pending` to be false (`:339`, `:429`), and clients read it (`lib/json_api/image.rb:42`).
  - Fixed in the code, not the test: the branch still sets `pending = false` and skips only the scheduling.

### Tests
- **Unit tests:** `spec/models/concerns/uploadable_spec.rb`, "failed upload retries", 15 examples. 12 were red before the code; the three that passed already were:
  - "a successful retry clears the failure state" (nothing set the markers yet);
  - "no second SVG upload while the first runs", added after the trace;
  - "runs when the scheduler enqueues it".
- **Scheduler tests:** `spec/lib/tasks/scheduler_spec.rb` has 2 new examples: the sweep is enqueued, and not run inline, at 14:00 and at 06:00. Both were red before the code.
- **Green after the fix:**
  - uploadable, button_image, button_sound and lingo_linq specs: 278 examples, 0 failures;
  - scheduler plus uploadable: 104 examples, 0 failures.
- **Mutations:** each turned the suite red:
  - drop the marker check (2);
  - drop the in-flight check (3);
  - do not set the marker (2);
  - no back-off (2);
  - no cap (1);
  - no per-run limit (1);
  - no marker filter (1);
  - no 2-week window (1);
  - no clear on success (1);
  - no clear on new data (1);
  - no retry stamp (1);
  - run the sweep inline in dispatch (2).
- **Full suite (`AWS_SECRET` blank):** 8327 examples, 4 failures. They are the same 4 that fail on the develop-based worktree (three `boards_controller_spec` examples that need the built frontend `vendor.js`, and `throttling_spec.rb:87`). None is in the changed code.

## Implementation review (2026-10-30, local adversary)
No Critical or High. The earlier review's fixes are implemented as written.

Low findings, recorded and not changed:
- **A merge conflict with D2 is certain** (`traci/fix/import-requires-s3`). Both branches insert a line after `raise "must have id first"`.
  - Either order is correct: the `ensure` belongs to the whole method, so the flag is reset either way.
  - A D2 raise in a job the sweep scheduled still moves the record toward the cap, because the attempt is counted at scheduling time.
- **Two sweeps running at once could schedule one record twice.** That needs two slow workers and an hour of backlog. It is bounded, not a loop. PLAUSIBLE.
- **Each hour the sweep loads and decrypts every recent url-nil row with data.** That includes unfinished client uploads and records that hit the cap. It loads one row at a time, so memory stays bounded. Production volume is unmeasured.
- **A suggested-sound TTS clip whose upload fails is retried even though no button uses it** (`board.rb:1572-1575` skips it). This only wastes storage.

Acted on:
- The reviewer's one test gap: the in-progress flag resetting after an exception.
  - Added "lets later saves schedule again after an upload raised".
  - Removing the `ensure` makes it fail (1 of 16).

## Proposal F (for review): picture updates require edit permission (Traci: same branch, one PR)

Reproduced 2026-10-30 with a throwaway controller spec: a signed-in user who does not own an image changed its license and replaced its picture data through `PUT /api/v1/images/:id` (status 200).

### Fact sheet
- (a) Where the permission is read: `Api::ImagesController#update` checks `allowed?(image, 'view')` (`images_controller.rb:45`). Every user has `view` (`button_image.rb:21`, `['*']`). `edit` is the owner, or a user the owner `allows?` to edit, i.e. a supervisor (`button_image.rb:22`). CONFIRMED.
- (b) The sibling controllers check `edit`: `sounds_controller.rb:65`, `videos_controller.rb:27`, with the same permission blocks (`button_sound.rb:21-22`, `user_video.rb:16-17`). Images has checked `view` since the first public commit (2016). CONFIRMED.
- (c) Frontend callers of an image update:
  1. **License edit:** `content-grabbers.js:1701`, already gated on `model.image.permissions.edit`.
  2. **"Set as Library Default":** `set_alternate` at `:1569`. Its only UI entry is gated on `model.image.permissions.edit` (`components/button-settings.hbs:365`).
  3. **Picking a picture whose URL matches a record already loaded:** `save_image_preview` (`:1500-1533`).
     - It reuses any loaded record with that URL. That includes a library picture owned by the system account, loaded from a library board, whose JSON carries no permissions (`board.rb:2544`).
     - If metadata is missing, it fills it in and calls `existing_image.save()`, and the pick fails if that save rejects.
     - Today that save rewrites a shared record for every user. After the server fix it would reject, so this caller needs a fallback. CONFIRMED.

### Change
- Server: `allowed?(image, 'edit')` in `#update`, matching sounds and videos.
- Frontend: in `save_image_preview`, a rejected save of an existing record rolls back its unsaved changes and resolves with the record as it was, so the pick still works, as it does today when nothing is dirty. The owner's save behaves as before.

### Alternatives
- **Server only:** rejected, because picking a picture would fail whenever a loaded library record lacks metadata.
- **Frontend creates a new own record instead of reusing a non-owned one:** rejected for now. The frontend cannot tell who owns a record loaded from a board. A failed save already shows that the user is not the owner.

### Tests
- **RSpec:**
  - a non-owner gets "not authorized", and the record is unchanged (license and data);
  - a supervisor with edit rights can update;
  - the existing owner example still passes.

  Mutation: revert to `view`.
- **QUnit:** a loaded record with the same URL whose save rejects. The pick resolves with that record, and its attributes are rolled back. Mutation: remove the fallback.

### Proposal F review (2026-10-30, local adversary, each checked by me)
- **High, CONFIRMED: a refused image update would stick in the offline sync queue.**
  - `sync_changed` (`services/persistence.js:3607-3634`) replays a queued change to an existing image with `record.save()`. One rejection fails `RSVP.all_wait`, which skips the `re_updates` that swap `tmp_` ids on boards, and nothing clears the refused record's `changed` flag. So every later sync fails.
  - The mobile app bundles its own frontend, so builds already installed would keep queueing these edits whatever the web frontend does.
  - **Design changed:** a viewer's update gets the image unchanged with 200 instead of an error. The queued change then clears on the next sync, and nothing is applied.
- **High, CONFIRMED (pre-existing): the upload form went to every viewer.**
  - `JsonApi::Json` adds `meta` for every wrapped response (`lib/json_api/json.rb:15-17`). `meta` hands out the signed S3 form and the confirmation key for any pending image, sound or video (`lib/json_api/image.rb:98-104`, `sound.rb:33-41`, `video.rb:22-30`).
  - `upload_success` trusts that key alone (`remote_uploader.rb:13-41`), so a viewer could replace the file.
  - **Fixed:** `meta` takes the call's args and gives the form only to an editor.
- **(c)3 understated:** reusing a loaded image sets `preserve_source_image` whenever it is unset (`content-grabbers.js:1510-1512`), so the PUT is the common path. The 200-unchanged design keeps that path working for clients; no frontend change.

Recorded, not fixed here:
- **PLAUSIBLE: non-owners lose "keep my picked image" on reused records.** The server now ignores the `preserve_source_image` they used to set on a shared record, so label-search enrichment may swap it for them. The fix would be a per-user copy in `save_image_preview`.
- **CONFIRMED (pre-existing), metadata only:**
  - board import sets `preserve_source_image` and drops `library_url_for_skin` on any image found by its URL (`lib/converters/lingo_linq.rb:349`, `:371-377`);
  - `Board#swap_images` adds fallback data to another user's image (`board.rb:2998-3000`).

  Neither replaces a picture.

### Implemented
- `Api::ImagesController#update` requires `edit`; a viewer gets 200 with the image unchanged.
- `JsonApi::{Image,Sound,Video}.meta(obj, args)` gives the upload form only to someone who can edit the record.
- **Tests:**
  - New examples: images update by a non-owner (unchanged, 200) and by a supervisor with edit (applied); upload form given to the owner and not to another user, for images, sounds and videos. The four non-owner examples were red before the fix.
  - Four existing specs updated with Traci's approval (2026-10-30), because they encoded the old contract: the `image`, `sound` and `video` json_api specs now pass the owner as `permissions`, and `json_spec` expects `meta(obj, args)`.
  - Green: controllers plus json_api, 381 examples, 0 failures.
- **Mutations**, each red:
  - form to everyone, for each of image, sound and video (1 each);
  - update guard never applies (1);
  - update refused for everyone, including owner and supervisor (3);
  - view is enough to update (1).

### Implementation review of F (2026-10-30, local adversary, checked by me)
- **High, CONFIRMED: a read-only supervisor recording for a communicator lost the upload form.**
  - `sounds#create` requires only `supervise` on the communicator (`sounds_controller.rb:30`) and creates the sound under them. Edit comes only from `edit_permission_for?` (`user.rb:61-62`), so `meta` withheld the form.
  - The recording page offers recording to supervisors (`templates/user/recordings.hbs:3`), so the recording would never upload.
  - **Fixed:** the three create actions pass `:upload_form => true`, so the response to the create that just made the record carries its form (that action's own permission check has passed). `show` still needs edit.
  - New example: a read-only supervisor creates a sound for a communicator and gets `meta.remote_upload`. Red before the fix. Mutations, each red: create omits the flag (1); `meta` ignores it (1); form to everyone (1).
- **Low: tokens without the `full` scope would have created pending media with no form.** The create flag returns it, so this is resolved.
- **Checked clean by the reviewer:**
  - no other route to the form or the key: board JSON, sound lists and paginate render without `:wrapper`;
  - a nil user is handled;
  - valet owners keep the form;
  - the 200-unchanged reply clears the sync queue's `changed` flag;
  - the 4 approved spec edits loosened no assertion.
- **Pre-existing, noted:** the confirmation key is deterministic (`uploadable.rb:41-43`), and `upload_success` does not check `pending`. Re-running it is harmless once the signed form has expired.

## Canonical review passes (2026-10-30)
Preflight `review-preflight.sh range origin/develop traci/fix/upload-retry` exited 0:
`REVIEWED=range origin/develop (e4be8b26a657c8d64a573ae6ef0eae66d2ef03a8) ... traci/fix/upload-retry (f5bcf9dc6d23b00dfdedc8d38a713182a26be429) in /Users/traciday/Documents/GitHub/lingolinq/LingoLinq-AAC-upload-retry`.
Both passes read only that diff file. They ran as subagents following
`~/ai-company-brain/commands/review-pr.md` and `agents/adversary.md`, because neither command is
registered on this machine.

### Senior-dev pass: request changes (1 High, 3 Medium)
- **High, REFUTED by me: "an oversized SVG that fails is never retried".**
  - Every writer of an image's `data_uri` also stores `data` (`button_image.rb:226-227`, `uploadable.rb:447-448`), so the record stays a sweep candidate. The reviewer could see only the diff, and my earlier test built the record in a shape the app never creates.
  - Added "retries a failed SVG too large to embed, created the way the app creates it". It goes red if the oversize branch drops `data`.
  - Related but not a regression: sound imports store `data_uri` without `data` (`board.rb:1572`, `button_sound.rb:283`). An oversized failed sound was never retried before this branch either, and still is not.
- **Medium, fixed: refused updates left no trace.** A refused image update now writes a `Rails.logger.warn`; the test goes red without it.
- **Medium, added: the missing permission examples.**
  - A read-only supervisor's image update is refused and the image is unchanged.
  - The image and video create responses carry the form.
  - Dropping the create flag does not turn the last two red, because the creator of an image or video is always its owner, so ownership alone gives the form. The flag matters for sounds, where the read-only supervisor example covers it.
- **Medium, open: non-owners lose `preserve_source_image` on reused records** (also raised by the adversary pass).

### Canonical adversary pass: ship with conditions (0 Critical, 0 High, 3 Medium, 2 Low)
- **Medium: the hole is described on a public branch before production is patched.** That is a decision for Traci (hotfix to `main`, and/or trimming this log).
- **Medium: `preserve_source_image` for non-owners.** Open, as above.
- **Medium: no log on refused updates.** Fixed, as above.
- **Low, CONFIRMED and fixed: a sound retried successfully was never transcoded.**
  - `full_filename`'s first save fires `MediaObject#schedule_transcoding` (`media_object.rb:83-94`, `:194`) against a file not yet in S3 and sets `transcoding_attempted`.
  - The success branch now clears `transcoding_attempted` when the record had failed, so its save schedules transcoding again.
  - Test "transcodes a sound once a retried upload succeeds": red before, green after.
- **Low: the sweep loads whole rows to filter them.** Recorded, as before.

## "Keep my chosen picture" for non-owners: first attempt reverted (2026-10-30)
Traci asked for it in this PR.

**The attempt:** `save_image_preview` would prefer an editable match, skip the PUT for a known non-editable record, and save a new own record with `preserve_source_image`.

**Review result:** CONFIRMED by me to do nothing in production.
1. **The copy collapses back into the shared record.** `save_image_preview` saves new records through `save_record`. For an http(s) image, `save_record` first looks for an already-saved record with the same normalised URL (`content-grabbers.js:161-177`), unloads the new record and resolves with that one, which is the shared record. My five QUnit tests stubbed `save_record`, so they never ran that dedupe and passed for the wrong reason.
2. **The "server refused" check can never fire.** `JsonApi::Image` writes `preserve_source_image` only when it is true (`lib/json_api/image.rb:45`), so a refused update's response leaves the client's local `true` in place.

**Reverted from the working tree; nothing was committed.** The diff is kept outside the repo. This was the second test in this branch that passed for the wrong reason (after the oversize-SVG shape), so I stopped here under rule 13.

**What a working fix needs (open):**
- The new record must not be collapsed into the shared one. That means a `save_record` path that keeps same-URL records separate when the match cannot be edited. The server already creates a new id for each POST.
- Or the choice moves to the button rather than the shared image.
- The tests must run the real `save_record` (stub the request with `persistence.ajax` or `queryLog`, not `save_record`), so the dedupe is exercised.
- Offline picks, where permissions are unknown, stay out of scope.

### Decision and handoff (2026-10-30, Traci: "follow best practice")
Copy-on-write: a user's choice never changes a record they cannot edit; they get their own record.
The work goes on this branch in a fresh session (rule 13 stop in this one).

**For the next session (fix-proposal discipline; facts below are CONFIRMED in this log):**
1. **Red test first.** In `tests/utils/picture_grabber-test.js`, do NOT stub `contentGrabbers.save_record`; stub the request instead (`queryLog.defineFixture` POST image, as the license tests near line 470 do).
   - Case: a loaded record with the same URL and `permissions: {edit: false}`, no `preserve_source_image`.
   - Expect a POST for a new image with `preserve_source_image: true`, no PUT of the shared record, and the resolved record being the new one.
   - Owner case: PUT in place, unchanged.
2. **The fix:**
   - `save_record`'s same-URL dedupe (`services/content-grabbers.js:161-177`) must not collapse a new record into a saved one the user cannot edit (`permissions.edit === false`).
   - `save_image_preview` must skip the PUT for a known non-editable match and create the own record. The reverted diff is a starting point for this part only.
   - The "server refused" check must decide from the response's `permissions.edit`, never from `preserve_source_image` (the server omits it when false, `lib/json_api/image.rb:45`).
3. **Check before claiming it works:**
   - the parallel same-URL saves the dedupe exists for (the comment at `:128-130`) still share one record when the user can edit it;
   - one copy per URL per session (later picks prefer the editable copy).
4. **Out of scope:** offline picks with unknown permissions (the server ignores the change, as now).
5. **Then:** mutation-test each piece, run the picture-grabber and create-board-new modules and the full Ember suite (Node 22, `app/frontend/CLAUDE.md` run-shape rules), have it adversarially reviewed, and push.

## Copy-on-write implemented (2026-10-30, same session at Traci's request)
- **`f58019d97`:**
  - `save_image_preview` saves a new record of the user's own for a known non-editable match, without a PUT, and does the same when the PUT response has `permissions.edit === false`.
  - `save_record`'s same-URL dedupe no longer merges a record that keeps its picture into a non-editable one.
  - Tests run the real `save_record`; only the adapter is faked (queryLog fixtures).
  - The three tests for the new behaviour, and dedupe test 3, failed on the base code for the right reasons. Six mutations, each red. The "no editable preference" mutation first survived, so test 4 was tightened to assert the PUT and the kept flag.
- **Review of `f58019d97`** (local adversary): no Critical or High. One Medium, CONFIRMED by me:
  - the copy could still merge into a sibling same-URL record whose permissions are unknown, which is the usual state for board-loaded images (`board.rb:2544`), and such a record may be someone else's.
- **`8e203e54d` fixes it:**
  - When the new record keeps its picture, the dedupe shares only a record the user can edit, or one of unknown ownership that keeps its picture too.
  - Matches are ranked editable, then unknown, then not editable.
  - Two dedupe tests and one picking test: the "unknown" ones were red before.
  - Four mutations, each red.
  - Picking plus dedupe: 11 examples, 0 failures.
- **Recorded, not changed:**
  - **Low:** after a refused PUT, the shared record keeps a stale local `preserve_source_image: true` until reload. The user's new copy is in the store and preferred, so a later pick uses the copy.
  - **Low, by design:** a known non-editable record that already keeps its picture is reused rather than copied.
  - **Low, pre-existing:** an in-flight save of the same URL wins.
  - **Out of scope:** offline picks with unknown permissions.
- **Lint:** the touched files have the same 15 `ember/no-runloop` errors as the base code, none in changed lines.
- Full Ember suite (Node 22) at 8e203e54d: 3870 tests, 3828 pass, 37 skip, 5 todo, 0 fail; no browser timeouts (complete run).

## Combined with the other issue #3 branches (2026-10-30, at Traci's request: one PR)
- Committed each worktree's fix on its own branch, then cherry-picked onto this one, one commit each:
  `9067b3cba` (migrate-job-namespace, log `2026-10-30_migrate-job-namespace.md`), `d4be75036`
  (sync-bounded-reads, log `2026-10-30_sync-bounded-reads.md`), `4bc12a07b` (import-requires-s3, log
  `2026-10-30_import-requires-s3.md`). All four branches shared the base `e4be8b26a`.
- One conflict, `upload_to_remote` (`app/models/concerns/uploadable.rb`): both added a first line. Order
  chosen: `Uploader.ensure_deployed_uploads_configured!`, then `@uploading_to_remote = true`, so a refusal
  leaves the flag unset (the method-level `ensure` clears it anyway).
- Interaction checked: in a deployed environment without S3, a retried upload raises at that check; the
  sweep counts the attempt before scheduling (`retry_failed_uploads`), so it stops after
  `UPLOAD_RETRY_LIMIT`.
- The workflow change means the PR needs the `synthetic-data` label from a reviewer (an agent never adds it).
- Tests on the combined head `4bc12a07b`:
  - touched RSpec files: 887 examples, 0 failures.
  - full Ember (Node 22): 3876 tests, 3834 pass, 37 skip, 5 todo, 0 fail (3870 before plus the 6 sqlite
    batch tests); complete run.
  - full RSpec before `rails extras:assert_js`: 8366 examples, 4 failures. CONFIRMED all four are the
    missing build placeholder `vendor.js`: in a throwaway worktree at the same head they failed without the
    setup step (the test log shows `couldn't find file 'vendor.js'` for the throttling spec's `GET "/"`) and
    passed after it. CI runs that step (`ci.yml:79`) and its rspec job passed on `e4be8b26a`; README.md:67
    lists it. The earlier "4 baseline failures" in these logs were this setup gap, not code failures.
  - full RSpec after the setup step: one run had 52 failures (seed, import, sidebar, deduper, board and
    button-set specs); three of them passed when run alone; an immediate rerun of the full suite, same head,
    same defined order, had 8366 examples, 0 failures. No other checkout's test log changed in that window.
    Cause not found and not reproduced; its error output was not kept (filtered to the summary). Recorded
    as unexplained; CI is the next independent run.
  - four more full runs at `b7d677a29` (Traci asked), sequential, complete output kept: 8366 examples,
    0 failures each (22:23, 22:27, 22:31, 22:35). Totals after the setup step: 1 failing run of 6. The
    failing run's cause is still unknown.

## Staging never runs the sweep yet (found 2026-10-30, read-only)
`lingolinq-scheduler-staging` is deployed with the current staging image, but nonprod has no Cloud
Scheduler trigger and no `scheduler-invoker` service account; the Job has one execution
(2026-09-14). The workflow leaves the trigger to an operator (`deploy-cloudrun.yml:1259-1261`).
So `retry_failed_uploads` will not run on staging until a trigger exists. Production has
`lingolinq-scheduler-hourly` (`0 * * * *`, enabled). The post-merge steps, including the trigger
commands and the decision it needs, are in lingolinq_mobile#3 (S1 to S7, P1 to P5).

## Senior-dev pass on the combined branch (2026-11-01)
`REVIEWED=range origin/develop (5ca1e4731edb05ecb3317e5928de61e00b5dc9c8) ... traci/fix/upload-retry (5e120c4740dc07459efcde21f3e93e5ae54e19f1) in /Users/traciday/Documents/GitHub/lingolinq/LingoLinq-AAC-upload-retry`
(preflight exit 0; subagent following `~/ai-company-brain/commands/review-pr.md`, read only the
DIFF_FILE). Verdict: approve with comments, 0 Critical, 0 High, 3 Medium, 10 Low. Checked by me:
- **M1, CONFIRMED gap, no defect today:** after a refused update the shared record keeps the local
  `preserve_source_image: true`, and the non-editable early branch (`content-grabbers.js`) reuses a
  record with that flag. Today the user's editable copy ranks first, so a second pick uses the copy.
  Added "reuses the user's copy when they pick the same picture again after a refused update" (7/7
  pass); mutation (rank `edit === false` first) turns it and the two ranking tests red; file restored
  from a copy and compared. Not taken: resetting the local flag by hand-pushing server data (more
  regression risk than the gap).
- **M2, CONFIRMED, to fix next:** a row over `read_budget` is read in separate `substr` statements;
  a rewrite of that row between them gives a broken string, `JSON.parse` fails silently
  (`dbman.js` add_rows) and the row is missing from that read. The old single read could not tear
  (iOS). Planned fix: after the last piece, re-read `length(data)` and retry the row (bounded) when it
  differs from the size query or the joined length; correct the header comment; test that rewrites
  the row between pieces.
- **M3, REFUTED as a defect:** `steps.guard.outputs.deploy_worker` resolves: the `guard` step
  (`deploy-cloudrun.yml:472`) and the migrate step (`:823`) are in the same `deploy` job, `guard`
  writes `deploy_worker` on every path (`:480`, `:540`, `:543`), and the scheduler step (`:1336`)
  uses the same mapping. The spec does not check the mapping (test-hardening, Low).
- Lows recorded, not changed yet: sweep pre-filter on `upload_failed_at`; concurrent sweeps;
  check_for_pending raise loop only under misconfiguration; secret-backed pool suffix reads as
  `<unset>` in the migrate readback; `set -euo pipefail` over the old deploy body; `mktemp` not
  removed; `meta(obj, args)` arity (to grep); dbman result order; `read_budget` counts characters
  not native bytes; pre-branch failures never retried.
- Stopped here under rule 13 after two of my own slips (an Edit before reading the file, and a
  filter that hid which tests failed in the first mutation run; both redone).
