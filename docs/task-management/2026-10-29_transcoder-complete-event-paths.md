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

Guard added with option 1: ignore any output path whose bucket is not `UPLOADS_S3_BUCKET`. The
SNS message is signature-checked (`callbacks_controller.rb:27-29`), so this is defence in depth:
without it, `s3_key_from_uri` strips any bucket and the record's URL would be built from a key
in a bucket we never wrote.

## Existing specs this changes (needs approval, Rule 14)

The specification these encode changed: paths come from the event, not from `GetJob`.
- `handle_event` examples at `:61`, `:103`, `:140` put `output_file_paths` on an `OpenStruct`
  GetJob and send an event without paths. Proposed: move the paths into the event (same
  expected `update_media_object` arguments), keeping the `OpenStruct` GetJob for metadata only.
- `:174` (ERROR) is unaffected; its paths are never read.
- `:348` "should find no output files on an SDK-shaped GetJob response" is the tripwire whose
  own comment says "The fix must invert this example." Proposed: invert it to assert the files
  come from the event when GetJob has none.

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
  record; once paths come from the event it could repoint a child's button sound. Changes:
  (1) the controller requires the body's `TopicArn` to be in `SNS_ARNS` for Notification
  messages (red test in `callbacks_controller_spec`); (2) an output path is accepted only when
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

## Risks and open questions

- A real COMPLETE event has never been seen here (ASSUMED shape above). Staging smoke test with
  synthetic audio is the proof; until then this is "documented shape", not "proven".
- Video is predicted to hit errorCode 1040 before it ever reaches this code (the frame
  capture's `.mp4` name_modifier, see the 2026-09-19 log). Out of scope here; audio can be
  proven on its own.
- Durations: `durationInMs` sits beside each path in the event; today's code reads it from
  `GetJob`, where it does exist. Reading both from the event keeps them paired per output.
