# MediaConvert COMPLETE events never update the record (#981 read side)

Date: 2026-10-29. Parent: #981. Branch `traci/fix/transcoder-complete-event-paths` from
`develop` 5766c05b0. Learnings consulted: `learnings-archive/2026-09.md` "a spec that mocks an
AWS client with OpenStruct proves the code matches itself" (the red test uses
`stub_responses`), and "MediaConvert is not a pipeline-id swap".

## Symptom

When MediaConvert finishes a job, `Api::CallbacksController#callback` answers
`400 event not handled` and the ButtonSound or UserVideo stays `transcoding_in_progress`, with
no mp3/wav/mp4. Not yet observed live (no COMPLETE event has reached this system; staging's two
real jobs on 2026-09-19 ended in ERROR 1040, fixed by 4ddfa51b8). Production is unaffected
today: `APP_MEDIACONVERT_ROLE_ARN` is unset on the `production` GitHub environment (checked
2026-10-29), so `Transcoder.configured?` is false and no job is submitted there. Staging has the
role set, so every staging recording that converts will hit this.

## Fact sheet

- **(a) Where is the value read?** CONFIRMED. `Transcoder.output_files(job)`
  (`lib/transcoder.rb:201-214`) reads `out.output_file_paths` at `:207`, where `job` is the
  `GetJob` response fetched in `handle_event` (`:17`). `handle_event` calls it at `:38`, then
  returns false when no `.mp3` / `.mp4` is found (`:45`, `:58`).
- **(b) All shapes.** CONFIRMED. A real `GetJob` `OutputDetail` is
  `Struct.new(:duration_in_ms, :video_details)` (`aws-sdk-mediaconvert-1.194.0
  types.rb:13075-13077`), so `respond_to?(:output_file_paths)` is false and `output_files` is
  always `[]` against a real response. The paths exist only on the EventBridge job-state-change
  event: `detail.outputGroupDetails[].outputDetails[].outputFilePaths` (array of `s3://` URIs)
  with `durationInMs` beside it (AWS docs, `mediaconvert/latest/ug/file-group.html` and
  `file-group-with-frame-capture-output.html`, read 2026-10-29). Frame capture lists the FINAL
  still; `frame_capture_output` sets `max_captures: 1` (`lib/transcoder.rb:358`), so that is
  `.0000001.jpg`. One writer: the EventBridge rule -> SNS -> `callbacks_controller.rb:32`, the
  only caller of `handle_event` (`git grep`).
- **(c) Cross-file claims.**
  - The SNS `Message` is the EventBridge event as a JSON string, and `parse_event_message`
    already extracts `detail` from it. CONFIRMED live by the two staging ERROR callbacks on
    2026-09-19, which parsed `jobId`/`status` and saved the error
    (`2026-09-19_transcoder-duplicate-output-paths.md`).
  - Outputs land in `UPLOADS_S3_BUCKET`: CONFIRMED, `file_group_settings` builds the destination
    with `s3_uri` from that variable (`lib/transcoder.rb`, `s3_uri`).
  - ASSUMED, not load-bearing for the code but load-bearing for "proven": a real COMPLETE event
    from this system carries `outputGroupDetails` in the documented shape. Only a staging smoke
    test can confirm it; the controller already logs the body (`callbacks_controller.rb:31`).

## Red test

`spec/lib/transcoder_spec.rb`, `describe "handle_event against an SDK-shaped GetJob"`: a real
`stub_responses` client for `GetJob` (cannot carry `output_file_paths`) plus a COMPLETE event in
the documented shape. Audio and video examples fail on develop (`handle_event` returns false);
21 existing examples pass. The third example (path outside the uploads bucket is ignored)
passes today vacuously and is a guard for the new code; its mutation is below.

## Candidate fixes

1. **Read paths and durations from the event's `detail`; keep `GetJob` for `user_metadata`**
   (proposed). `handle_event` already holds `detail`. `GetJob` stays the source for which
   record to update, so the record lookup is unchanged. Smallest change to the read.
2. **Drop `GetJob` and use `detail.userMetadata` from the event too.** One fewer AWS call, but
   it changes the ERROR path and the record lookup as well, which work today (proven live
   2026-09-19). Rejected: wider blast radius for no fix.
3. **Rebuild the paths from the job settings** (destination + input basename + name_modifier +
   extension, all present on `GetJob`). Works without the event, but re-implements AWS's file
   naming, which is exactly what failed with errorCode 1040. Rejected.

The first draft guarded only the bucket. The adversary review below replaced that with the
destination-equality guard, and the red-team pass on the finished branch added the name
allowlist and the GetJob status check (see "Red-team pass on the branch").

## Existing specs this changes (needs approval, Rule 14)

The specification these encode changed: paths come from the event, not from `GetJob`.
- `handle_event` examples at `:61`, `:103`, `:140` put `output_file_paths` on an `OpenStruct`
  GetJob and send an event without paths. Proposed: move the paths into the event (same
  expected `update_media_object` arguments), keeping the `OpenStruct` GetJob for metadata only.
- `:174` (ERROR) is unaffected; its paths are never read.
- `:348` "should find no output files on an SDK-shaped GetJob response" is kept unchanged (it
  pins the real SDK shape; see the review below). The positive case sits beside it in
  `describe "handle_event against an SDK-shaped GetJob"`.
- `spec/controllers/api/callbacks_controller_spec.rb:125` "should handle transcoding" put the
  paths on an `OpenStruct` GetJob too. Rewritten the same way (approved 2026-10-30): the fake
  GetJob echoes the destination the real `audio_job` builder submitted, and the paths travel
  in the COMPLETE event. Red against develop's `lib/transcoder.rb`, green with the fix.

Approval: Traci approved the `:61`, `:103`, `:140` rewrites and keeping `:348` on 2026-10-29,
and the controller spec rewrite on 2026-10-30.

## Mutations that must turn the tests red

- Revert `output_files` to read from `job`: audio and video examples red.
- Remove the bucket check: the outside-bucket example red.
- Read `durationInMs` from nowhere (duration nil): audio example red on `'duration' => 12`.

## Adversary review of this proposal (2026-10-29) and what changed

Verdict: proceed with candidate 1, with a stronger guard. Each finding checked by hand:

- **Medium, CONFIRMED, accepted.** "Signature-checked, so defence in depth" was wrong.
  `Aws::SNS::MessageVerifier#authenticate!` verifies the signature and that the signing cert
  is on an `sns.*.amazonaws.com` host (`aws-sdk-sns message_verifier.rb:40,64-75`); it never
  compares the body's `TopicArn`. The controller routes on the `x-amz-sns-topic-arn` header
  (`callbacks_controller.rb:5,26`), which the sender sets. Any AWS account can publish a
  genuinely signed message from its own topic. Today that only lets it log an error on a
  record; once paths come from the event it could repoint a child's button sound. Proposed
  changes: (1) the controller requires the body's `TopicArn` to be in `SNS_ARNS` for
  Notification messages (not done, see below); (2, done) an output path is accepted only when
  its directory exactly equals the destination in the trusted `GetJob` response
  (`job.settings.output_groups[].output_group_settings.file_group_settings.destination`,
  `types.rb:6110-6112`), which also pins the bucket.
- **Medium, CONFIRMED, accepted.** A `start_with?` guard would pass the red test. Add a
  sibling-bucket case (`lingolinq-test-uploads-evil`) and a nested-directory case
  (`some/dir/` vs `some/dir/0/`, since record directories are id digits).
- **Low, CONFIRMED, accepted.** The video example's still equals the fallback guess
  (`transcoder.rb:65`), so a mutant ignoring it passes. Use `.0000003.jpg`.
- **Low, CONFIRMED, accepted.** The stubbed GetJob carries the same 12000 ms, so a mutant
  reading durations from GetJob passes. Give the event a different duration. In the rewritten
  existing specs, remove `output_file_paths` from the OpenStructs entirely. Keep `:348` as is
  (it pins the real SDK shape) and add the positive example beside it instead of inverting.
- **Low, deferred.** Stale or duplicate COMPLETE events can repoint a record to an older
  output: pre-existing `update_media_object` behaviour (`media_object.rb:24-27`), not changed
  here.
- **Low, deferred.** A COMPLETE with no usable outputs returns 400 without
  `media_object_error`. Worth doing once a real event is seen; kept out to keep one change.

## Body `TopicArn` check: not done (accepted Low, 2026-10-30)

Change (1) in the adversary section, requiring the signed body's `TopicArn` to be in
`SNS_ARNS`, was left out by Traci's decision. The first rationale given for that ("only files
inside that job's own folder", "until the real COMPLETE or the daily retry") was WRONG; the
red-team pass below disproved both, and Traci then approved the two checks that make it true.
With them in place, a forged but genuinely signed message from a foreign topic:
- needs a live job ID from our account (not guessable, not in API responses);
- does nothing while the job is SUBMITTED or PROGRESSING, or after ERROR or CANCELED, because
  GetJob's own status must be COMPLETE;
- can name only plain file names inside that record's own folder (`uploadable.rb:72-75`: the
  folder is every digit of the record id, so it is not shared), i.e. that record's own outputs.
Residual: in the seconds between a job really completing and its real event arriving, a forger
could complete the record with its own (real) output names; the real event is then ignored.
Nothing is disclosed. Against the TopicArn check: it would reject every real completion in any
environment whose `SNS_ARNS` is wrong, and needs edits to about five existing controller
examples. Revisit if the callback ever accepts anything less constrained than this.

## Red-team pass on the branch (2026-10-30) and what changed

`REVIEWED=range origin/develop (92195340588aa8d39a28ac7d814e0e5d6aa5aa93) ... HEAD
(03ad24c2ab620cfc1435e025f7cf2291caf3e3c0)`. Senior-dev pass: no Critical/High (one Medium
withdrawn after checking `uploadable.rb:72-75`). Adversary pass, each checked by hand:
- **Medium, CONFIRMED, fixed.** The guard checked the directory, not the name. The stored URL
  is upload_url + key (`media_object.rb:63`), `best_url` unescapes it when it holds `%20`
  (`uploadable.rb:48`), and browsers read `\` as `/` and resolve `..`, so a name like
  `..\..\sounds\9\9\x.mp3` escaped. Fix: names must match `\A[A-Za-z0-9._-]+\z`; every name the
  builders produce does (`<global_id>-<sha512hex>` from `uploadable.rb:67-70` plus the
  `name_modifier_for` suffix and extension).
- **Low, CONFIRMED, fixed.** A forged COMPLETE was permanent: it drops the transcoding key
  (`media_object.rb:33`), so the real event is ignored, and the daily retry skips urls ending
  `.mp3`/`.mp4` (`button_sound.rb:148,158`). Fix: GetJob's `status` must be COMPLETE.
  SUBMITTED/PROGRESSING returns `:retry`, answered 503: SNS retries only 5xx and 429, and treats
  every other error, 400 included, as permanent (AWS SNS "message delivery retries", read
  2026-10-30). ASSUMED: GetJob agrees with the event by the time it arrives; if it lags past the
  retry policy (default HTTP/S policy: 3 retries, 20 s apart, unless the subscription sets its
  own; not checked), the record is left for the daily retry.
- **Low, CONFIRMED, fixed.** A non-numeric, negative or overflowing `durationInMs` raised
  (500) or was stored; now it is ignored (duration nil).
- **Low, CONFIRMED, open pending approval.** The `:348` comment still says "the fix must invert
  this example", and `output_files`' `detail={}` default exists only for that call.

Mutations (each restored from a copy): name check removed, 3 red; `%` allowed, 2 red; GetJob
status check removed, 2 red; `:retry` removed, 2 red; controller 503 removed, 1 red; duration
guard back to nil-only, 5 red.

## Risks and open questions

- A real COMPLETE event has never been seen here (ASSUMED shape above). Staging smoke test with
  synthetic audio is the proof; until then this is "documented shape", not "proven".
- Video is predicted to hit errorCode 1040 before it ever reaches this code (the frame
  capture's `.mp4` name_modifier, see the 2026-09-19 log). Out of scope here; audio can be
  proven on its own.
- Durations: `durationInMs` sits beside each path in the event; today's code reads it from
  `GetJob`, where it does exist. Reading both from the event keeps them paired per output.
