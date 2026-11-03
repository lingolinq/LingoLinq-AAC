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

## Canonical adversary pass on the combined branch (2026-11-01)
Same `REVIEWED=` line and diff file as the senior-dev pass above; subagent following
`~/ai-company-brain/agents/adversary.md`. Verdict: ship with conditions, 0 Critical, 0 High,
1 Medium, 2 Low. Checked by me:
- **Medium, CONFIRMED: the copy-on-write never fires against the real server.** The permissions
  library adds an action key only when its rule grants it
  (`permissable-coughdrop-0.3.4/lib/permissable.rb:116-127`); a non-editor gets
  `{'user_id' => ..., 'view' => true}` with no `edit` key (pinned by `spec/models/button_image_spec.rb:12`),
  and `lib/json_api/image.rb:57-58` passes it through. Board-loaded images carry no `permissions`
  at all (`board.rb:2544`). Every copy-on-write branch tests `permissions.edit === false`, which the
  server does not send, so a non-owner's pick still PUTs, is refused, and gets the shared record
  back. Not a regression (same as before the branch). **Correction:** the "Copy-on-write
  implemented" section above and commits `f58019d97`, `8e203e54d` describe the non-owner
  "keep my chosen picture" problem as fixed; it is NOT fixed yet. The tests passed because every
  fixture used `permissions: {edit: false}`, a shape the server cannot produce.
  Planned fix: known not editable = a `permissions` object is present and `edit !== true`; unknown =
  no `permissions` object; rebuild the fixtures from the serializer's real shapes
  (`{user_id, view: true}`, `{user_id, view: true, edit: true}`, absent), red first, then mutations.
- **Low, CONFIRMED (same as senior-dev M2):** a torn oversized-row read is dropped silently. Fix planned above.
- **Low, CONFIRMED by reading:** the narrower `save_record` dedupe now POSTs a new record for a URL
  loaded from a board (no `permissions`) when the new record keeps its picture; one extra row per
  URL per session, no functional break. To decide with the predicate fix.
- Clean per the reviewer and spot-checked: S3 guard order and `ensure`, the sweep cannot reschedule
  through `check_for_pending`, Resque does not retry (no raise loop), every `meta` takes `args`,
  production migrate env unchanged, only NOT_FOUND skips the live comparison.

## Proposal G (for review): decide "cannot edit" from the shapes the server sends
**Fact sheet.**
- (a) Where read: `content-grabbers.js` `save_record` `can_share` (`permissions.edit === true`, else
  `!== false` plus `preserve_source_image`); `save_image_preview` ranking (`=== true`, then
  `!== false`), the early non-editable branch (`=== false`), and the after-PUT check (`=== false`).
  CONFIRMED by reading.
- (b) Shapes of `img.permissions` (writers): absent, for board-loaded images
  (`board.rb:2544`, no `:permissions`) and records created on the client before their save;
  `{user_id, view: true}` for someone who cannot edit (show `images_controller.rb:27`, refused
  update `:52`, update `:58`; `permissable.rb:116-127` writes only granted actions, pinned by
  `spec/models/button_image_spec.rb:12`); `{user_id, view: true, edit: true}` for an editor (and the
  create response, `:18`); `{..., edit: false}` only when the edit rule matches but the token's
  scopes do not include it (`permissable.rb:122-125`). Anonymous: `{user_id: nil, view: true}`.
- (c) Cross-file: the image model declares `permissions: attr('raw')` (`models/image.js:57`), so a
  later payload without `permissions` keeps the earlier value. CONFIRMED.

**Red tests (written, failing for the right reason):** `save_record` with a saved record
`{user_id, view: true}` that keeps its picture is shared (should not be); a pick of a loaded record
`{user_id, view: true}` sends a PUT (should POST a copy, no PUT); a refused PUT answering
`{user_id, view: true}` returns the shared record (should POST a copy). The existing `edit: false`
tests stay: that shape occurs for limited-scope tokens.

**Candidates.**
1. **Client: one helper for the three states (recommended).** `image_edit_state(img)`: editable
   when `permissions.edit === true`; not editable when a `permissions` object is present otherwise;
   unknown when there is no `permissions` object. Used by the ranking (editable, unknown, not
   editable), the early branch and the after-PUT check (not editable), and `can_share` (editable
   shares; unknown shares only if it keeps its picture; not editable never shares when the new
   record keeps its picture). One unit for an idea used in two functions.
2. **Server: always emit `edit: false`** in `JsonApi::Image`. Rejected: changes a public payload
   shape for every client, and the client would still be wrong against an older server.
3. **Simplest: `edit !== true` means not editable.** Rejected: board-loaded records (no
   permissions, including the user's own) would always be copied, turning the recorded extra-record
   Low into the normal path.

**Risks and open questions.** A record's `permissions` describes the user it was fetched for; an
account switch without reload would carry stale permissions (same before and after; ASSUMED the app
reloads on sign-out, not checked). Anonymous users get "not editable" and a POST, which fails as
it would today. The extra-record Low for board-loaded URLs is unchanged.

**Mutations that must turn the tests red:** the helper treats a missing `edit` key as unknown; the
ranking drops the unknown tier; `can_share` lets a not-editable record share.

## Where this stopped (2026-11-01, rule 13)
Stopped after a third slip of my own today (an Edit sent before the file was read, twice, and a
filter that hid failing test names); each was caught and nothing wrong landed, but the rate is up.
- **Proposal G (copy-on-write from real permission shapes):** written above; red tests written and
  failing for the right reason, NOT committed (`content_grabbers-test.js` "...whose permissions have
  no edit key"; `picture_grabber-test.js` "...permissions have no edit key", "...refused update
  answers with no edit key"). Adversarial review of the proposal requested; code not changed.
- **Torn oversized-row read (senior-dev M2, adversary Low):** chosen fix: read one row's pieces
  inside one `db.transaction` (the bridge's single queue keeps other calls out,
  `lingolinq_mobile www/sqlite_bridge.js` `enqueue` and `transaction`), with
  `SELECT id, length(data) AS len ... WHERE id IN (?)` first in the same transaction; if the length
  differs from the size query, retry with the new length (bounded), skip if the row is gone. Red tests
  designed (a fake `transaction` that runs its statements together; a rewrite before top-level call 2
  and before call 3; the row must equal the old or the new data exactly) but NOT yet in the file.
- **New, pre-existing, not on this branch's lines:** `store_internal` checks existence with
  `SELECT * ... WHERE ref_id=?` (`dbman.js:454`), a full read of the existing row on every store; the
  same unbounded native read as the crash, for one row. Candidate: `SELECT id`.

## Proposal G review (2026-11-01, local adversary, checked by me)
Verdict: proceed with changes. The three-state classification holds for every shape the server
sends (writers only `images_controller.rb` create/show/refused update/update via
`json_api/image.rb:57-58`; board images and `persistence.js:736-740` store none; nothing on the
client writes an image's `permissions`; `{edit: false}` only for integration and developer-key
tokens, `device.rb:134-137`; the "anonymous" shape cannot occur, every image endpoint needs a token).
- **Medium, CONFIRMED by reading, to fix with G:** the early non-editable branch reuses the record
  when its local `preserve_source_image` is true (`content-grabbers.js:1545-1546`); after a refused
  update that flag is stale (`true` locally, key absent in the reply). Under G every `{view: true}`
  record takes that branch, so: refused update, copy POST fails (network), pick again -> the shared
  record is returned as success and the choice is lost. Options: reset the local flag from the
  reply after a refusal, or stop trusting the local flag in that branch (reuse only a record the
  server said keeps its picture). Either changes the assertion I added at
  `picture_grabber-test.js:727` (it pins the stale flag): needs Traci's approval (rule 14).
- **Low, CONFIRMED, tests to add:** a board-loaded record (no permissions) whose PUT answers
  `edit: true` is updated in place, no POST (guards "my own picture is not copied"; catches the
  mutation "after-PUT uses `edit !== true`"); the unknown-versus-not-editable ranking with the real
  `{user_id, view: true}` shape.
- **Low, PLAUSIBLE, pre-existing, to record or confirm:** an `incomplete` same-URL placeholder
  (`button.js:619-625`) ranks as unknown and may win more often under G, then `save_record` POSTs a
  record that already has an id; offline picks of a no-permissions picture still lose the choice at
  sync (refused quietly); local-DB records may carry another user's permissions (guard: a
  `permissions.user_id` that is not the current user's counts as unknown).
- Candidate 2's "older server" reason is weak (server and web client deploy together), but the
  rejection holds: board images arrive without permissions, so the client helper is needed anyway.

## Proposal G implemented (2026-11-01, Traci approved the `:727` assertion change)
- `content-grabbers.js`: `image_edit_state(img)` (module level): `editable` when
  `permissions.edit === true`, `not_editable` when `permissions` is present otherwise, `unknown`
  when absent. Used by `save_record`'s `can_share` (editable shares; unknown shares only if it keeps
  its picture), the `save_image_preview` ranking (editable, unknown but not an `incomplete`
  placeholder, not editable, then anything), the early branch and the after-update check. After a
  refused update, if the picker had set `preserve_source_image` itself, it pushes
  `preserve_source_image: false` into the store (the server's value; the record is not left dirty),
  so a later pick cannot reuse the shared record on a stale flag (the review's Medium).
- Tests: the 3 red tests now pass; added "updates the user's own picture loaded with a board in
  place, without a copy", "tries a match of unknown ownership before one the server sent without an
  edit key", "prefers a saved picture to a placeholder for the same URL"; the approved change at the
  refused-update test now expects the flag reset and the record not dirty. Same-URL tests: 18/18.
- Mutations, each restored from a copy and compared: missing `edit` key counts as unknown (5 red);
  ranking without the unknown tier (2 red); `can_share` lets not-editable share (1 red); no flag reset
  (1 red); placeholder not ranked last (1 red, after adding the "placeholder left alone" assertions;
  green before them). "After-update check uses `edit !== true`" stays green and is equivalent for
  every reply the server sends (update replies always carry `permissions`).
- Not kept: an end-to-end test "copy save fails after a refusal, then pick again". With a rejected
  POST fixture, Ember Data raised a global `Error` in the test runner (source not traced). The two
  halves are covered (flag reset and not dirty; a not-editable record without the flag gets a copy).
  Open question: whether a failed image POST also raises an unhandled error in the app.
- Recorded, not changed: offline picks of a no-permissions picture still lose the choice at sync;
  local-DB records may carry another user's permissions.
- Lint: same counts as HEAD for all three files (only `ember/no-runloop`, pre-existing).

## Torn oversized-row read fixed (2026-11-01)
- `dbman.js` `read_sqlite_rows`: an oversized row's pieces are read in one `db.transaction`, which
  keeps every other call out until they are done (the bridge runs one call or transaction at a
  time; dbman already reads in a transaction for the schema version, and the bridge's own test covers
  that, `lingolinq_mobile test/sqlite_bridge.test.js:47`, `:87`). The transaction measures the row
  again first; a changed length means the pieces were cut for the old row, so it is read again (up to
  3 tries, then skipped with a warning); a row gone since the size query is skipped as before.
- Red first: "returns the row whole when the write lands right after the size query" and "...between
  its pieces", with a fake `transaction` that, like the bridge, runs its statements together and a
  rewrite before top-level call 2 or 3. Both failed (the row was missing, 0 of 1) on the old code.
- With the fix: dbman tests 18/18. Mutation: drop the re-measure check -> the first test red;
  restored from a copy and compared. Lint: 0 errors, as at HEAD.
- **Recorded, not changed (Low):** two single-row reads still use `SELECT *`: the existence check in
  `store_internal` (`dbman.js:470`, only the row count is used, so `SELECT id` would do) and the read
  by key (`:242`, needs the data). The crash needed a ~37 MB native allocation for a whole table; the
  largest staging board row is ~2.3 MB, so one row would need to be more than 10 times that. Not
  changed here: no evidence it occurs, and changing the read by key could alter which row it returns
  when duplicates exist.

## Review of the two new fixes (2026-11-01, local adversary, checked by me)
Diff `40c9e051a..045169e7a -- app/`. Verdict: ship with conditions; 0 Critical, High or Medium; 4 Low.
Full suites at `13e2b5e9c` before these follow-ups: RSpec 8366 examples, 0 failures; Ember 3885
tests, 3843 pass, 37 skip, 5 todo, 0 fail (complete run).
- **Low, fixed:** the flag reset was gated on "this pick set the flag", so a flag left unsaved by an
  earlier failed update was not put back after a refusal. Now gated on whether the save sends an
  unsaved `preserve_source_image` (`changedAttributes`). Test "puts the flag back after a refused
  update when an earlier pick left it unsaved" (also checks `url` and `permissions` unchanged): red
  on the old gate, green now. Confirmed by the reviewer in `@ember-data/json-api` `cacheUpsert`: a
  partial `store.push` merges attributes.
- **Low, test added:** "reports one error and no success when reading a piece fails".
- **Low, comment:** the memory bound depends on the bridge running each statement of a transaction
  as its own native call (true of `@capacitor-community/sqlite` via the shell bridge; a plugin that
  batches a transaction into one result would not hold it).
- **Low, PLAUSIBLE, recorded:** a fast double pick while the first in-place update is in flight
  could make two copies (`existing_image.save()` is not registered in `_pendingImageSavesByUrl`).
  Not traced; candidate fix: register the in-place save there as `save_record` does.
- Same-URL tests 19/19, dbman 19/19; lint unchanged.

## Canonical passes on the final code (2026-11-01)
`REVIEWED=range origin/develop (c248887db96ecaeab142756e6b64a106f006031c) ... traci/fix/upload-retry (cb07dc23293225acc5602de1457eb4d96bcc13cb) in /Users/traciday/Documents/GitHub/lingolinq/LingoLinq-AAC-upload-retry`
(preflight exit 0). Full suites at `cb07dc232`: Ember 3887 tests, 3845 pass, 37 skip, 5 todo,
0 fail (complete run); RSpec at `13e2b5e9c` (no backend change since) 8366 examples, 0 failures;
merged with `origin/develop` in a throwaway worktree, the uploader, media_object, uploadable,
remote_action, button image and sound, scheduler and converter specs: 553 examples, 0 failures.
- **Senior-dev:** approve with comments; 0 Critical, 0 High, 2 Medium, 5 Low. Previous M1 and M2
  resolved, M3 still refuted; no regression for owners, board-loaded pictures, sync or offline reads.
  - Medium, known and recorded above: an offline pick of someone else's board-loaded picture loses
    the choice when the refused update replays at sync. Follow-up (lingolinq_mobile#3): when offline,
    treat an unknown match as not editable and save a copy, or have sync make the copy.
  - Medium, fixed: the new "skip after 3 length changes" and "deleted after the size query" paths had
    no tests. Added both (success once, no row; 4 top-level calls for the first). Mutation: allow 4
    tries -> red; restored and compared. Dbman batch tests 11/11.
  - Lows: the reset pushes `false` even if a refused reply carried `true` (local only; worst case an
    extra copy); the "between its pieces" test guards a revert to per-piece calls only (comment added,
    test not renamed); two unknown same-URL records can rank another user's first (extra record);
    other `save_record` callers sending `preserve_source_image: true` are not checked.
- **Adversary:** ship; 1 Low, CONFIRMED by its reading: a board-loaded record that already keeps
  its picture but lacks width, height or license is PUT, refused, then copied, though the server
  already keeps it (extra row and re-upload, the choice not lost). Recorded with the other extra-record
  Lows; candidate: after a refusal, when this save did not send the flag and the reply still has it,
  return the record.

## PR #1255 CI, first run (2026-11-01)
- `lint-and-build` failed: the ESLint todo gate fingerprints a finding by file, rule, LINE, column,
  severity and message (`app/frontend/scripts/eslint-todo-gate.js:11`), so the 15 pre-existing
  `ember/no-runloop` findings in `content-grabbers.js` and `content_grabbers-test.js` read as new
  once this branch's added lines moved them. My local check had compared counts with the branch's
  own HEAD, not the gate. With Traci's approval (rule 14), updated only the line numbers of those 15
  rows in `.eslint-todo`; each was paired with its finding and checked to have the same file, rule,
  column, severity and message hash. Gate: `baseline=1549 grandfathered=1549 new=0`.
  Lesson: run `npm run lint:js:ci` (the gate), not a per-file count, before pushing a change that
  adds lines above existing findings.
- `data-bearing-paths/develop` failed as expected (the workflow change): needs a reviewer's
  `synthetic-data` label.
- Codex review, P2, CONFIRMED by reading, pre-existing gap, not a regression: a server upload that
  starts from a web address sets `url` to it first (`uploadable.rb` `check_for_pending`), and sounds
  and some large images keep an outside address on purpose (`store_downloaded_file_fallback!`); when
  the copy to S3 then fails, the sweep's `url: nil` filter skips the record, so it is never copied
  and depends on the outside address. Follow-up on lingolinq_mobile#3: retry those from their
  `url`/source as well.

## Manual click-test, run with Playwright (2026-11-01)

Local stack from this worktree at `2a59e90a1` (Rails :5000, one Resque worker, Ember :8184), seeded `example` user plus a
local-only second user `clicktestb`. Scripts and screenshots stayed in the session scratchpad. Baseline: develop
`68e1513c8` frontend served on :8185 against the same Rails server (the create path the comparison exercises,
`images_controller#create` and `check_for_pending`'s pending-URL branch, is unchanged by this branch).

- **Step 1, a fresh library pick (sclera `cellar.png` for "cellar"):** works. One `POST /api/v1/images` (200, a new
  record owned by `example`, `preserve_source_image: true`), the dialog shows the new picture, the board `PUT` saves
  and the button points at the new record after a reload.
- **Step 2, the picture after a reload:** FAILS, on develop too. The new record has `url: null, pending: true` and
  the button renders text only. The create answers with `meta.remote_upload`, but `save_record`'s by-URL branch
  (`content-grabbers.js:201-205`) resolves after `object.save()` and returns before the client upload at line 216,
  so nothing uploads. The server leaves the picture to the client because `Uploader.valid_remote_url?`
  (`lib/uploader.rb:802`) only treats the opensymbols CDN as stored when `OPENSYMBOLS_S3_CDN` is set, and it is set
  neither locally nor on `lingolinq-web-staging` or `lingolinq-web-dev` (read-only `gcloud run services describe`).
  Production not checked. PRE-EXISTING (code on develop since `67138f2e4`, #723).
- **Picking a picture already on the open board (arasaac `home.png` for "cellar"):** FAILS, identically on develop.
  The only loaded record for that URL is the placeholder `utils/button.js:621-625` makes with `createRecord` and an
  id, so `save_image_preview` picks it (`matching_images[0]`) and POSTs it with no `content_type`; the server answers
  400 "content type required", the page throws "Converting circular structure to JSON", and the button keeps its old
  picture. PRE-EXISTING.
- **Step 3, user B against A's picture `1_39806`:** passes. `GET` gives `permissions {user_id, view: true}` and no
  `meta.remote_upload` (the record is still pending, so before this branch B would have received A's upload form);
  `PUT` with a new url, license and `preserve_source_image: false` answers 200 with the record unchanged, the row is
  unchanged in the database, and the server logged "image update refused".
- **Copy-on-write in the UI:** not reached. Board pictures load as placeholders with no permissions, so the
  not-editable branch needs a fully loaded record of someone else's in the store; covered by the picture_grabber tests
  only.
- Local only: the dev S3 settings fail every worker upload ("region 'us-east-1' is wrong; expecting 'us-west-2'").
  Test rows left in the dev DB: user `clicktestb`, images `1_39805` to `1_39810`, and "cellar" on
  `example/communikate-home` now points at one of them.

## Fix: a picture picked by URL is never uploaded (2026-11-01)

Requested by Traci after the click-test: fix it in #1255.

- **Fact sheet.** (a) The client upload is read only in `save_record`'s generic `object.save().then` (content-grabbers.js
  generic path); the by-URL branch every https image takes returned before it. CONFIRMED; it came in with
  `1f88a4a87` (2026-02-06), which replaced a fall-through to the generic path. (b) A create answers stored (url set),
  pending with `meta.remote_upload` (owner, `:upload_form`), or 503 when S3 is not configured (the record is destroyed,
  `RemoteUploader#ensure_upload_form_available!`). (c) The form is pushed per record id by the ajax wrapper
  (`utils/extras.js:345-352`) and read with `window.lingoLinqExtras.upload_params_take` (assigned at extras.js:560;
  I first misread it as never assigned because a `head -5` cut the grep, corrected before the proposal).
- **Red test first.** `content_grabbers-test.js` "an image saved by URL" / "uploads the picture when the server answers
  pending": red on the base code (no upload).
- **Proposal and review.** Proposal in the session scratchpad; independent read-only review (adversary-local). Accepted:
  the upload must use only the record's own form (the time-windowed meta can be another create's, extras.js:547-551);
  a failed upload must not reject, because offline sync sends `tmp_` images through `save_record`
  (persistence.js:3610-3613) and would create another record on every retry; a no-op handler on the shared deferred.
  Considered and not taken: resolving after the create and uploading in the background (the board stores the image
  urls the client sends, board.rb:2088, so a board saved before the upload could keep the old address; unverified,
  so not relied on); a server-side download (changes the create contract for every client).
  Accepted risks, not changed: the pick now settles after the proxy fetch and S3 POST, so the window in which a board
  can be saved before `change_button` sets the new image_id is longer (pre-existing race,
  controllers/board/index.js saveButtonChanges); create-board-new now stores the S3 URL rather than the library URL;
  later picks of the same library URL still make a new record each time (url matching, pre-existing).
- **Change.** `save_record`'s by-URL first-saver path takes the record's own form and uploads with the new
  `upload_saved_record` (the generic path's upload steps, moved unchanged); a failed upload is logged and the record
  resolves pending, as before. The generic path calls the same helper.
- **Tests.** Five in "an image saved by URL": uploads when pending; no upload when stored; never another create's form;
  two same-URL saves share one create and one upload; a failed upload leaves the record pending and the next save tries
  again. Two slips in writing them (an eagerly built rejection tripped RSVP's error hook; the first fixture answered the
  retry) were test-setup errors, fixed before the green run.
- **Mutations.** No upload: 3 red. Fall back to the shared meta: 1 red. Reject on a failed upload: 1 red. Restored by
  `cmp` against a copy.
- **End to end (Playwright, local).** With the fix, a pick now does the proxy fetch and the S3 POST with the record's
  form. S3 answered 403 InvalidAccessKeyId: this machine's AWS key is dead, so the success path was not observed end to
  end; the failure path behaved as designed (pick and board save complete, record pending).
- **Lint.** The ESLint gate first reported 15 "new" rows, all existing `ember/no-runloop` rows whose lines moved
  (findings 1549 = baseline 1549). Three were in the test file because the new tests sat mid-file with a new import,
  against app/frontend/CLAUDE.md ("Placing new code so rows do not shift"); the tests moved to the end of the file and
  read the params store through `window.lingoLinqExtras.upload_params_by_id`, so that file no longer shifts. The 12
  in content-grabbers.js cannot be held still: the fix is in `save_record` above all of them. With Traci's approval
  ("proceed", 2026-11-01) their line numbers moved by +16 (444, 638, 726, 754, 835, 1432, 1437, 1444, 1705, 2361,
  2450, 2716); the gate then reported baseline=1549 new=0.
- **Full Ember** (Node 22), before the tests moved to the end of the file (code unchanged since): 3894 tests, 3852
  pass, 37 skip, 5 todo, 0 fail, complete. After the move, the five tests pass in a filtered run.

### Canonical review passes on the by-URL upload fix (2026-11-01)

PII preflight exit 0. Both passes reviewed
`REVIEWED=range 2a59e90a1 (2a59e90a1bd6223841932a0c60a7af7f1624142b) ... traci/fix/upload-retry (f5a6e2a7fc591bfa714c36ec907a6230d96b58a6) in /Users/traciday/Documents/GitHub/lingolinq/LingoLinq-AAC-upload-retry`.

- **Senior-dev pass (`commands/review-pr.md`): approve with comments.** No Critical or High. Medium: an upload that
  never settles would hold the URL's pending entry, so later saves of it wait. Checked: the proxy GET and the confirm
  GET time out (utils/extras.js:186-191); the S3 POST is exempt only when its URL matches `/s3\.amazonaws/`
  (extras.js:192-195), and the post_url observed in the click-test is the regional form
  (`lingolinq-uploads.s3.us-west-2.amazonaws.com`), which does not match, so it takes the 20 s timeout. Bounded; not
  changed. Lows not taken: the generic path's meta fallback (pre-existing), a `{confirmed: false}` test, single quotes
  on the console.warn string, orphan pending records on failure (pre-existing), `upload_saved_record` mutating its
  argument.
- **Adversary pass (`agents/adversary.md`): ship with conditions.** No Critical or High. Mediums: a failed upload still
  loses the picture silently, with no retry for pending records that have no data (pre-existing; not a regression);
  every library pick now copies the picture to S3 through the proxy while `OPENSYMBOLS_S3_CDN` is unset. Low: the pick
  waits for the upload chain (same timeout analysis as above). Conditions: observe one successful by-URL pick on
  staging (the picture survives a reload); check production's `OPENSYMBOLS_S3_CDN` and decide whether the client copy
  is the intended path; log the no-retry gap for failed uploads in lingolinq_mobile#3.
