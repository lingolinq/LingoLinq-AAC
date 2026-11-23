# Delete an uploaded file only when nothing still uses it (2026-11-23)

Branch `traci/security/upload-delete-in-use-check`, from develop 003c22753. Found by the adversarial review of the
sync proposal's erasure-helper design (branch `traci/docs/offline-sync-research-proposal`, task log
`2026-11-20_sync-proposal-implementation.md`); Traci chose a separate PR (2026-11-23). Not in
`audit-reports/FINDINGS.json`; registering it is Scot's call.

## Fact sheet

- (a) Where the decision is read: `Uploadable#schedule_remote_removal_if_unique` (after_destroy,
  `app/models/concerns/uploadable.rb:144-152` at develop) decided whether to schedule `Uploader.remote_remove(url)`.
  It counted only rows of the destroyed row's own class with exactly the same url. `Uploader.remote_remove`
  (`lib/uploader.rb:614-650`) deletes with no in-use check of its own; only the deferred-retry path calls
  `remote_path_in_use?` (`:86-91`). CONFIRMED.
- (b) Shapes: a picture, sound or video row can name any uploads-bucket address. `Uploadable#process_url`
  (`uploadable.rb:91-95`) keeps an address `Uploader.valid_remote_url?` accepts (`lib/uploader.rb:908-915`: any
  uploads-bucket address), and `check_for_removable` marks it removable by bucket prefix (`uploadable.rb:137-142`).
  The same file can therefore be named by rows of different classes, in the bucket's two S3 forms or the CDN form.
  `user_videos` has no `removable` column. CONFIRMED.
- (c) Cross-file claims checked: `remote_path_in_use?` builds the three address forms and checks ButtonImage,
  ButtonSound and UserVideo (`lib/uploader.rb:105-111`); jobs already queued under the old method name
  (`remote_remove`) still run after deploy, since the method is unchanged. CONFIRMED.

**Defect:** destroying a row could delete a file that a row of another kind still used, including another person's.
Reproduced through the API in `spec/controllers/api/sounds_controller_spec.rb` (red before the fix).

## Fix

- `Uploader.remote_key_for(url)`: the key stripping `remote_remove` already did, extracted so the check and the
  delete agree on the key.
- `Uploader.remote_url_in_use?(url)`: `remote_path_in_use?` on that key (three kinds, three address forms).
- `Uploader.remote_remove_if_unused(url)`: the job a destroy schedules; checks again when it runs, then
  `remote_remove`.
- `schedule_remote_removal_if_unique` uses `remote_url_in_use?` instead of the same-class count. The new check is a
  superset of the old one (a removable row's own url is one of the three forms).

Candidates considered: refusing another person's bucket address at create (rejected for this PR: it changes what
existing clients may send and needs its own review of legitimate cross-user reuse); a check only in the job (kept as
well, but alone it queues a job for every in-use file).

## Tests

- `spec/models/concerns/uploadable_removal_spec.rb` (new): deletes when unused; keeps a file a picture uses when a
  sound is destroyed (and schedules no job); keeps a file a sound uses when a picture is destroyed; keeps a file a
  video names by its CDN address; checks again when the job runs.
- `spec/controllers/api/sounds_controller_spec.rb`: the API path (create a sound with another row's address, delete
  it; the other row's file is not deleted).
- Red before the fix: 5 of 6 (the "deletes when unused" baseline passed).
- Falsified after: the old same-class gate turns "schedules no job" red; dropping the job-time check turns "checks
  again when the job runs" red. Restored from the commit.
- Affected suites (uploader, button image, button sound, user video, media object, uploadable, flusher, sounds and
  images controllers): 612 examples, 0 failures, 5 pending (pre-existing).

## Not covered

- Files already deleted this way cannot be detected from the database alone.
- A row may still be created naming another person's bucket address (it now keeps that file alive instead of
  deleting it). Whether create should refuse it is a separate question.
- `user_videos.url` has no index, so each check scans that table (the retry path already did the same lookup).
- A row that takes the address after the job's check but before the delete is not protected (a narrow window; the
  job-time check is what narrows it).
- Rubocop is not a CI gate; the change adds one style offense to `lib/uploader.rb` (388 to 389).

## Learnings

- An "is this file still used" check must ask every table that can name the file, in every address form it can be
  stored in, not only the destroyed row's own table.

## Review

- `/review-pr` (senior-dev pass), `REVIEWED=range origin/develop (003c227536963b4a2aad8f0136b0b41b24418a40) ...
  traci/security/upload-delete-in-use-check (5b6e5479d7b54e6e56680b221a7ac34a581535db)`: approve with comments.
  Fixed: the CDN spec restores the prior `UPLOADS_S3_CDN`; a stale line citation in the retry path. Recorded above:
  the unindexed `user_videos.url` lookup and the narrow window after the job's check.
