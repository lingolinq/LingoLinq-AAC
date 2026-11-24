# A destroyed row deletes only its own unused media file (2026-11-23)

Branch `traci/security/upload-delete-in-use-check`, from develop 003c22753. Found by the adversarial review of the
sync proposal's erasure-helper design (branch `traci/docs/offline-sync-research-proposal`); Traci chose a separate PR
(2026-11-23). Not in `audit-reports/FINDINGS.json`; registering it is Scot's call. Details beyond this log are kept
out of the public repo.

## Fact sheet

- (a) Where the decision is read: `Uploadable#schedule_remote_removal_if_unique` (`app/models/concerns/uploadable.rb`,
  after_destroy at develop) decided whether to schedule `Uploader.remote_remove(url)`, counting only rows of the
  destroyed row's own class with exactly the same url. `Uploader.remote_remove` (`lib/uploader.rb`) deletes any key its
  shape guard accepts, with no in-use check of its own; only the deferred-retry path asks `remote_path_in_use?`.
  CONFIRMED.
- (b) Shapes: rows of different kinds (picture, sound, video) can name the same uploads-bucket file, in the bucket's
  two S3 forms or the CDN form; the bucket also holds non-media files under `extras/` (button sets, logs) that no
  media row names; `user_videos` has no `removable` column. CONFIRMED.
- (c) Cross-file claims checked: `remote_path_in_use?` checks ButtonImage, ButtonSound and UserVideo in the three
  address forms; an upload key is `<images|sounds|videos>/<row id digits>/<global id>-<sha512><ext or transcode
  suffix>` (`Uploadable#full_filename`, `lib/transcoder.rb`); the committed `.env.op.template` gives tests the bucket
  name (CI sets no S3 values). CONFIRMED.

**Defect:** destroying a row could delete a file that was not its own to delete: one another kind of row still used,
or a non-media file in the same bucket. Reproduced through the API in `spec/controllers/api/sounds_controller_spec.rb`
(red before the fix).

## Fix

- `Uploader.remote_key_for(url)`: the key stripping `remote_remove` already did, extracted so the check and the
  delete agree on the key.
- `Uploader.media_key_owner(key)`: the row an upload-shaped key was uploaded for (kind and id, cross-checked against
  the folder digits); nil for any other key.
- `Uploader.removable_by_destroyed_row?(url, class_name, id)`: only a key in a media folder; for an upload-shaped key,
  only the row's own upload or one whose uploading row is gone (a media-folder key in an older shape gets the in-use
  check alone, so older rows' files are still deleted); and only when no picture, sound or video row names it.
- `Uploader.remote_remove_if_unused(url, class_name, id)`: the job; the same decision again when it runs.
- `schedule_remote_removal_if_unique` runs `after_destroy_commit` (the job never sees the row before its destroy
  commits) and uses the decision above.

Candidates considered: the in-use check alone (first version; the adversarial pass showed it leaves non-media files
and other rows' derived files deletable); refusing other people's addresses at create (not in this PR: it changes
what clients may send and needs its own review of legitimate reuse).

## Tests

- `spec/models/concerns/uploadable_removal_spec.rb` (new, 14): own unused file deleted; a file another kind names
  kept (and no job queued); a file named by CDN address kept; a non-media file never deleted; another existing row's
  upload never deleted (named by a sound, and by another person's picture); a file whose uploading row is gone
  deleted once the last row naming it goes; the job checks again; removal scheduled only after the destroy commits
  and never for a rolled-back destroy; a scheduling failure is logged and the derived-file cleanup still runs; keys
  with dot segments, escapes or control characters refused; key forms; key ownership parsing.
- `spec/controllers/api/sounds_controller_spec.rb`: the API path.
- Existing specs changed: `button_image_spec.rb` and `button_sound_spec.rb` "should remove from remote storage if no
  longer in use" used the address `asdf`, not a media-folder key; now the row's own upload address, assertions
  unchanged (Traci approved, 2026-11-23). `uploadable_spec.rb`'s stand-in class gains an `after_destroy_commit` stub.
- Falsified: the old same-class gate, no media-folder gate, no ownership rule, a class-only ownership rule, no
  job-time check, and `after_destroy` instead of `after_destroy_commit` each turn a different spec red.
- Affected suites (uploader, button image, button sound, user video, media object, uploadable, flusher, sounds and
  images controllers): 617 examples, 0 failures, 5 pending (pre-existing).

## Not covered

- Files already deleted this way cannot be detected from the database alone.
- A row naming another person's file keeps that file when its owner deletes it (it was already so for rows of the
  same kind). That matches the hand-over policy Traci set for copied boards' pictures (sync proposal 12.6), but the
  retention document's wording ("when the URL is unique") does not say it: Scot's and legal's call.
- Whether create should refuse another person's address is a separate question.
- `user_videos.url` has no index, so each check scans that table (the retry path already did the same lookup).
- Deploy: dev and staging share a worker; a job queued under the new name by a newer build fails on an older worker
  until promotion (the delete then fails safe, the file stays). Requeue failed jobs after promotion.
- Rubocop is not a CI gate.

## Review

- `/review-pr` (senior-dev pass), `REVIEWED=range origin/develop (003c227536963b4a2aad8f0136b0b41b24418a40) ...
  traci/security/upload-delete-in-use-check (5b6e5479d7b54e6e56680b221a7ac34a581535db)`: approve with comments; the CDN
  spec now restores the prior setting; a stale line citation fixed.
- `/adversary-review` at 2063cb187: block. High: the in-use check alone left non-media files deletable (fixed: the
  media-folder gate). Medium: the job could run before the destroy committed and drop the delete (fixed:
  `after_destroy_commit`). Medium: another row can keep a file through its owner's deletion (recorded above, not
  changed). Low: other rows' derived files (fixed: the ownership rule); the public log's wording (trimmed); deploy,
  test and index loose ends (recorded above; a key-form spec added; a vacuous assertion removed).

## Learnings

- An "is this file still used, and is it mine to delete" check must ask every table that can name the file, in every
  address form, and must also refuse files that are not the row's own kind of upload.
- `/adversary-review` round 2 at 4fa735e64: approve with comments. The round-1 High and the job-timing Medium are
  confirmed closed; regex probes, unset-bucket behaviour and legitimate deletions (copied rows, restored urls,
  transcoded addresses) checked with no regression.

## Round 2 items (done 2026-11-23)

1. A failure scheduling the removal is logged, not raised, so the derived-file cleanup still runs (spec red first).
2. Media-folder keys with dot segments, escapes or control characters are refused (spec red first).
3. The after-commit timing is pinned (commit and rollback cases), and the claim that it could not be tested is
   corrected.
4. The ownership rule is tested for one person's picture naming another picture's derived file.
5. The `media_object.rb` comments now say `after_destroy_commit`.
6. The PR body carries the revert note.
Not done: a durable retry for a scheduling failure. The plain `delete_retry` path would skip the ownership rule; a
retry that goes back through `removable_by_destroyed_row?` is a follow-up if Redis outages during deletes turn out to
matter (the failure is logged with the record's id).
- `/review-pr` (senior-dev pass) on the PR head, `REVIEWED=PR lingolinq/LingoLinq-AAC#1370 at
  cc52b9f8d29eab0c9282cdf57bc21df2b174043d`: approve with comments. No Critical, High or Medium. Fixed: a stale line
  citation in the retry comment. The Codex connector reviewed the same head with no findings.
