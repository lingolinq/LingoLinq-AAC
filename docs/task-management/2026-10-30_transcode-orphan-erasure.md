# Transcode outputs no record points at survive erasure (LL-c4566fa37f)

Date: 2026-10-30. Finding: LL-c4566fa37f (`audit-reports/FINDINGS.json`, medium, open, untriaged;
disposition and closure are Scot's). Branch `traci/fix/transcode-orphan-erasure` from `develop`
e4be8b26a. Found again by the red-team pass on #1239 (task log
`2026-10-29_transcoder-complete-event-paths.md`, "Open items triage"). Learnings consulted:
LEARNINGS.md "`after_all_transactions_commit` is not a durable outbox" (write a same-transaction
RemoteAction), "`Worker.process_queues` destroys the RemoteActions it processes", "log opaque
global_ids or nothing".

## Symptom

A ButtonSound or UserVideo can have MediaConvert (or legacy Elastic Transcoder) outputs in S3 that
no settings field records. `MediaObject#remove_derivative_remote_data` deletes only keys held in
settings, so account erasure (Flusher -> destroy) leaves those files: a child's recorded voice or
video outliving GDPR Art. 17 / COPPA deletion.

## Fact sheet

- **(a) Where is the value read?** CONFIRMED. Erasure reads only settings:
  `remove_derivative_remote_data` (`app/models/concerns/media_object.rb:113-187`) collects
  `secondary_output`, `thumbnail_filename`, `prior_thumbnail_stems`, `prior_full_filenames` and an
  abandoned `full_filename`; Uploadable's `after_destroy` removes `url` if no same-class row uses it
  (`uploadable.rb:137-145`). Output keys reach settings only through `update_media_object`
  (`media_object.rb:24-74`), called from `Transcoder.handle_event` (`lib/transcoder.rb`, `if record`).
- **(b) All shapes (writers of an unrecorded output).** CONFIRMED.
  1. Record destroyed while its job runs: the COMPLETE finds `record` nil and returns true; nothing
     is written (`lib/transcoder.rb`, `record.update_media_object(new_record) if record`).
  2. COMPLETE never handled: 400 (no usable outputs, or every COMPLETE on develop, since
     `output_files` reads paths GetJob lacks, fixed by #1239), 503 retries exhausted (#1239), or SNS
     delivery lost. The daily retry (`button_sound.rb:147-166`) then re-transcodes up to 2 more times
     within 2 weeks, so one recording can leave up to 3 jobs' outputs.
  3. Outputs written before a job ERRORs (MediaConvert behaviour; PLAUSIBLE, not observed).
  The prefix of every job is `file_path + file_prefix + "v" + ts` (`media_object.rb:87`), a local
  variable that is never saved.
- **(c) Cross-file claims.**
  - Output names. CONFIRMED by reading `lib/transcoder.rb` `name_modifier_for`: the input stem is
    the basename of `full_filename` without its extension; on a first transcode that is
    `file_prefix`, so the modifier is `v<ts>` and outputs are `<file_prefix>v<ts>.mp3`, `.wav`,
    `.mp4`, and the still `<file_prefix>v<ts>.mp4.0000001.jpg`. Legacy Elastic Transcoder used
    `"#{prefix}.mp3"` (first commit b26af61fa) and 5-digit stills
    (`Uploader.transcoded_thumbnail_key?`, `lib/uploader.rb:352-354`).
  - Key shape. CONFIRMED by a test-DB run: `sounds/8/1/8/1_818_b89ddf69ef0d0500994e3a3b-<128 hex>.wav`.
    `file_path` is every digit of the id (`uploadable.rb:72-75`); `file_prefix` is
    `global_id + "-" + sha512(global_id, created_at)` (`uploadable.rb:67-70`), and that sha512
    includes `SECURE_ENCRYPTION_KEY` (`go_secure.rb`), so a recomputed `file_prefix` differs from
    the stored one if the key was ever rotated.
  - Another record using one of these keys: only through `url` (copies share `url`,
    `board.rb:1607-1615`); `full_filename` and `secondary_output` are written only from the record's
    own id/hash or its own job (`uploadable.rb:58`, `media_object.rb:34,68`). Checked by the #1239
    adversary pass.
  - `RemoteAction#process_action` keeps (`:keep`) a row whose action the running build does not
    know (`app/models/remote_action.rb`, final `else`); `Uploader.remote_remove_batch` processes due
    rows hourly (`act_at < now`) and purges rows older than 3 months, reporting
    `KEPT_UNTIL_DONE_ACTIONS` counts (`lib/uploader.rb:302-322`).
  - Dev web and staging worker share Redis and the database; a new job method is runnable only
    once it reaches `staging` (`docs/INFRASTRUCTURE.md` "Staging and dev").
  - Production: `s3:ListBucket` on the uploads bucket is granted to the deployed credential
    (FINDINGS.json, LL-854b1d3853 notes, verified 2026-08-17). Nonprod: not in the repo.

## Red test

`spec/models/concerns/media_object_spec.rb`: destroying a ButtonSound that has had a transcode
scheduled writes one `RemoteAction` (`transcode_family_sweep`, path = the record's stem) in the
destroy's own transaction. Fails on develop (no row). `spec/lib/uploader_spec.rb`, new
`describe "remote_remove_transcode_family"` with a `stub_responses` S3 client listing: deletes
`<stem>v1.mp3`, `<stem>v1.wav`, `<stem>v2.mp4`, `<stem>v2.mp4.0000001.jpg`, `<stem>v3.mp4.00001.png`;
keeps the original upload `<stem>.wav`, a key in a nested folder (`<dir>0/...`), another record's
key, a key still in use by another row's `url`, and names that only start like ours
(`<stem>vx.mp3`, `<stem>v1.mp3.bak`). Fails on develop (no method).

## Candidate fixes

**D (proposed): a durable tombstone swept twice.**
- In `MediaObject`, an `after_destroy` (inside the destroy transaction, so it commits or rolls back
  with the delete) writes `RemoteAction(action: 'transcode_family_sweep', path: stem,
  extra: "<Class>::<global_id>", act_at: now)` when the record ever had a transcode
  (`settings['transcoding_attempted']`, or any `transcoding_keys`/`prior_transcoding_keys`). One row
  per stem (find_or_initialize, as `record_remote_delete_retry` does).
- Stems: from the stored keys first (`full_filename`, `prior_full_filenames`, `secondary_output`
  basenames, cut at `-<128 hex>`), plus the recomputed `file_path + file_prefix`; uniq. Covers a
  rotated key.
- `RemoteAction#process_action`, new branch: schedule
  `Uploader.remote_remove_transcode_family(path, extra, created_at)` and return `:keep`, moving
  `act_at` a day out first (as the delete retries do) so the hourly batch does not enqueue it again
  while the job is pending.
- `Uploader.remote_remove_transcode_family(stem, owner, created_at)`: skip (row kept) when S3 is not
  configured or has no credentials; `list_remote_keys_with_prefix(stem)`; keep only keys matching
  `\A<escaped stem>v\d+\.(?:mp3|wav|mp4|mp4\.(?:\d{5}|\d{7})\.(?:jpg|png))\z` (no `/` possible
  after the stem, so no nested folder); skip any key `remote_path_in_use?` (`uploader.rb:105-111`);
  `remote_remove` the rest (its scary-delete guard still applies). The row is deleted only when the
  listing succeeded, every delete succeeded, and the row is at least `SETTLE` (1 day) old, so a job
  that finishes after the destroy is caught by the second sweep. Otherwise the row stays and runs
  again a day later; after 3 months the existing purge drops and reports it (add the action to
  `KEPT_UNTIL_DONE_ACTIONS`). Logs carry the owner global_id and counts, never keys.
- Deploy order: a row written by a dev-web destroy before staging knows the action is kept by the
  final `else` and processed once it does, but only by a build that has that `else` (#1117,
  6192c55a8, on develop only; origin/main cbfeb2043 and origin/staging a9bfdd703 delete every due
  row). Nonprod is safe in practice because the staging scheduler has no trigger
  (`lib/tasks/scheduler.rake:2-6`); see "Rollback" below. No job is enqueued for an unknown method.

**A: list and delete at destroy only (queued job).** Rejected: misses outputs written after the
destroy (shape 1), has no retry when listing fails, and dev web would enqueue a method the staging
worker lacks until promotion.

**B: save each job's prefix at schedule time; delete `prefix.*` at destroy.** Rejected alone: same
timing gap as A, and the prefix still lives only in settings that die with the record. Its
exact-keys advantage is folded into D (stems read from stored keys).

**E: a COMPLETE for a destroyed record deletes the event's outputs.** Rejected as the mechanism: it
deletes on the say-so of an SNS body (only as trusted as its sender) and misses lost webhooks. D
covers the same case from our own data.

**F: cancel the in-flight MediaConvert job on destroy.** Rejected alone: the job id is not stored,
and outputs already written still need the sweep.

## Risks and open questions

- `SETTLE` = 1 day assumes a job finishes within a day of the destroy. Short audio and video jobs
  on the on-demand queue take minutes; a job delayed past a day leaves its outputs. Longer windows
  keep the tombstone (which holds a stem with an opaque global_id) longer.
- Listing needs `s3:ListBucket`: granted in production; nonprod unverified. Without it the row
  retries daily and is purged, reported, at 3 months: no deletion, no regression.
- Mass erasure: one row per transcoded record, one listing call each, spread by the hourly batch.
- Spec impact: the destroy writes a RemoteAction instead of enqueuing or calling S3, so the
  `media_object_spec` examples that use an `instance_double` S3 client or `match_array` the
  scheduled keys should be unaffected; anything that counts RemoteAction rows after a destroy may
  change. Rule 14 approval: Traci, 2026-10-30, "show me after".
- Out of scope, found alongside: bucket versioning without a noncurrent-version expiry (needs a
  read of the bucket's lifecycle configuration); a ButtonSound may take another user's file URL
  with no owner check, which keeps that file "in use" past its owner's erasure.

## Adversary review of the proposal (2026-10-30) and what changed

Verdict "implement with changes". Each finding checked by hand; all accepted:
- **Medium, CONFIRMED.** An `after_destroy` runs after Uploadable's `after_destroy` has already
  queued the url delete (Uploadable is included first, `button_sound.rb:4-5`), so a raise there
  would roll back the destroy but not that job. Now a `before_destroy`, inside
  `RemoteAction.transaction(requires_new: true)` with a rescue; unreadable settings still write the
  recomputed stem.
- **Medium, CONFIRMED.** Three existing examples go red: `media_object_spec.rb:274,342,356` use a
  strict `instance_double` S3 client and `Worker.process_queues`, which runs every RemoteAction
  regardless of `act_at`. Fixed in the shared `stub_real_s3_removal` helper (an empty
  `list_objects_v2`), the only existing-spec edit. Approved by Traci 2026-10-30 ("show me after").
- **Medium, CONFIRMED.** An empty or unrecognised listing looked like success, video names are
  unverified, and the staging scheduler has no trigger (`lib/tasks/scheduler.rake:2-6`), so the
  first real run would be production. Now: names under the stem that are neither an output nor the
  original upload are counted (`unmatched`), logged at error and keep the row; and the sweep ships
  report-only (Traci chose a dark launch, 2026-10-30): `Setting 'transcode_sweep_delete'` must be
  `'true'` before anything is deleted. A Setting, not an ENV var, because every Cloud Run variable
  is listed by hand in `deploy-cloudrun.yml` (`--set-env-vars` replaces the set).
- **Medium, accepted.** Forward-only: outputs of records destroyed before this ships are not
  covered. The backlog cleanup (a dry-run-first rake task with the same matcher) is the next PR
  (Traci, 2026-10-30). LL-c4566fa37f must not be proposed closed on this PR alone; closure also
  depends on the uploads bucket's noncurrent-version lifecycle (versioning is on,
  `docs/INFRASTRUCTURE.md:171`).
- **Low, CONFIRMED.** Per-class names (sounds mp3/wav; videos mp4 and 5- or 7-digit stills), the
  re-transcode chain `v<ts>(_<global_id>-<hex>v<ts>)*`, and a stem-shape guard on write and sweep.
  The chain names fail `remote_remove`'s generic guard, so a narrow anchored exception was added
  (`Uploader.transcoded_output_chain_key?`, beside `transcoded_thumbnail_key?`).
- **Low, CONFIRMED.** `list_remote_keys_with_prefix` logged the prefix; it takes a `log_label` now,
  and the sweep logs the owner's global_id and counts, never a key (delete errors log the class).
- **Low, CONFIRMED.** A blank bucket drops the row, as `remote_delete_ready?` does; a bucket without
  credentials keeps it.
- **Low.** Tests added for every failure branch (listing fails, a delete fails, credentials
  missing, blank bucket, bad stem, untranscoded record, rotated key, purge report).
The retry-dispatch trap from the #1239 review does not arise: the new action is not a
`REMOTE_DELETE_RETRY_ACTIONS` entry and `record_remote_delete_retry` is never called for it.

## Mutations (each restored from a copy; all killed)

M1 in-use check removed, 1 red; M2 prefix match instead of the name grammar, 3; M3 any tail after
the stem, 2; M4 settle window ignored, 1; M5 written in `after_destroy_commit`, 1; M6 no savepoint,
1; M7 delete switch ignored, 6; M8 stored-key stems dropped, 1; M9 unexpected names ignored, 2;
M10 guard exception removed, 1; M11 stem logged by the listing, 1; M12 blank bucket keeps the row, 1.

Local run: `media_object_spec`, `remote_action_spec`, `uploader_spec`, `flusher_spec`,
`button_sound_spec`, `user_video_spec`, `transcoder_spec`, `setting_spec`: 413 examples, 0
failures, 2 pending (both pending on develop). Baseline before the change: the same files, 406
examples, only the 16 new examples failing.

## Going live (after the release reaches production)

1. Read the report lines for a few days: `Uploader.remote_remove_transcode_family report-only
   owner=... matched=N unmatched=M`. Any `unmatched` above 0 means a name this code does not know:
   stop and look before enabling.
2. Enable through the audited console: `Setting.set('transcode_sweep_delete', 'true')` (it busts
   the Redis cache `Setting.get_cached` reads). Each kept row is swept when its `act_at` comes due,
   within a day of the flip. Rows not swept within 3 months are purged and reported
   (`kept_remote_actions_purged`), so keep the report-only period to days or weeks, not months.

## Rollback

The delete kill switch is the Setting (`Setting.set('transcode_sweep_delete', nil)`), not a code
rollback. A rollback of production below #1117 (any build without `RemoteAction#process_action`'s
unknown-action `else`, such as main cbfeb2043) deletes every due `transcode_family_sweep` row
without a log line, losing the backlog. Before such a rollback, export the rows
(`RemoteAction.where(action: 'transcode_family_sweep')`) and restore them afterwards.

## Red-team pass on the implementation (2026-10-30) and what changed

`REVIEWED=range origin/develop (e4be8b26a657c8d64a573ae6ef0eae66d2ef03a8) ... HEAD
(ff79ed26fbdbafe50626fa3b4a83d4ebaf98adcf)`. Senior-dev pass: no Critical/High/Medium.
Adversary pass, no Critical/High; each finding checked by hand:
- **Medium, CONFIRMED, fixed.** Report-only rows never settle, so each was re-dispatched and
  re-listed daily for 3 months. Now `process_action` dispatches a row while deletes are off only
  in its first day (`created_at` within `TRANSCODE_SWEEP_SETTLE`), then just pushes `act_at` a
  day. Rows still live up to 3 months on `remote_actions`, which has only a primary-key index
  (`db/schema.rb:565-572`); an `(action, path)` index is a schema change left to Traci's call.
- **Low, CONFIRMED, fixed in this doc.** The deploy-order claim and the rollback hazard above.
- **Low, CONFIRMED, fixed.** A re-transcoded video still matched the sweep but failed every
  `remote_remove` guard; `transcoded_output_chain_key?` now covers stills (videos only).
- **Low, PLAUSIBLE, fixed.** Stems from stored keys must start with `file_path + global_id + '-'`,
  and a row whose owner is live again with the same stem is dropped without listing.
- Test gap closed: `'false'` stays report-only (a `.present?` mutant now fails).
- Pre-existing, outside this diff (High on its own, PLAUSIBLE): `Uploadable#process_url` adopts
  any uploads-bucket URL and `schedule_remote_removal_if_unique` counts only same-class rows, so a
  ButtonSound created with another user's image or video URL and then destroyed deletes it. Not in
  FINDINGS.json; it goes with the URL owner check already planned (#1239 triage).

Mutations for these (each restored from a copy; all killed): report-only re-listing restored, 1
red; own-stem pinning removed, 1; live-owner check removed, 1; stills left out of the chain guard,
1; switch read with `.present?`, 1. Local run: the same eight spec files, 417 examples, 0
failures, 2 pending (pending on develop).

## Codex review: destroy racing the first transcode save (accepted Low, 2026-10-30)

Codex P2 on `media_object.rb:203`. CONFIRMED mechanism: `schedule_transcoding` enqueues before
the flags are saved (`media_object.rb:83-96`), and erasure loads every sound and video, then
destroys them one by one (`flusher.rb:456-459`). A copy loaded before the first upload's save
is destroyed with no transcode flags, so no tombstone is written, while the job, which bails
only if the record is already gone (`transcoder.rb:72-74`), may still submit. The outputs are
then orphaned. Reaching it needs a new recording uploaded during that user's own erasure;
production has MediaConvert off today, so it cannot happen there yet. Codex's suggested fix
(persist before enqueue) does not close it, since the stale copy predates both. The full fix
(always tombstone ButtonSound/UserVideo destroys; the stem comes from the id and key, not
settings) was proposed and not taken: Traci, 2026-10-30, very low likelihood, accepted.
