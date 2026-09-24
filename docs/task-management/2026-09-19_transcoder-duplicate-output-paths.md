# MediaConvert rejects every audio job at execution time: duplicate output paths

Date: 2026-09-19. Parent: #981 (MediaConvert go-live). Found during Scot's first real staging
smoke test after #1016/#1017 shipped (account `scotw`, two recorded sounds).

## Symptom

Two independent recordings, two independent MediaConvert jobs, same failure both times:

```
jobId 1789855178463-xw2g13: status ERROR, errorCode 1040,
  "Duplicate output paths [s3://lingolinq-dev-uploads/sounds/1/7/...v1789854837] found in input job."
jobId 1789856386401-7lemzf: status ERROR, errorCode 1040,
  "Duplicate output paths [s3://lingolinq-dev-uploads/sounds/1/8/...v1789856385] found in input job."
```

Both confirmed from the actual notification body logged by `Api::CallbacksController`
(`Rails.logger.warn(json_body.to_json)`, staging web log, 2026-09-19T21:59:41Z and 22:19:48Z).

## What this rules out

- **Not the #1016 bug.** `create_job` returned HTTP 201 both times (`[Aws::MediaConvert::Client 201
  ... create_job(...)]`, staging worker log): the job hash validates and AWS accepts it. The SDK
  key rename holds.
- **Not the #1017 gates.** `scotw` is a fresh account with no COPPA/EU/org/pref restriction, so
  none of those gates fired; the job was correctly allowed to submit.
- **Not yet reached: the known output_file_paths read-side bug.** `handle_event`'s `ERROR` branch
  (`error_status?(status)`) returns before ever calling `output_files`, so that bug is still
  unverified end-to-end; a COMPLETE event has still never been observed on this account.
- **The app's error-handling path itself works correctly.** Both callbacks got `200 OK` with a
  clean 3-query `ActiveRecord` save (`record.media_object_error(...)`), no crash, no 500. This is
  the first live proof that the ERROR branch of `handle_event` functions as designed.

## Fact sheet

- **(a) Where is the value read?** CONFIRMED. AWS MediaConvert's own execution-time validation,
  external to this codebase, rejects the job when the two outputs in one output group resolve to
  the same destination file path. This is not the SDK's local `ParamValidator` (which already
  passed at `create_job`): it is a business-logic check the AWS service performs after a job is
  accepted, so it cannot be reproduced by the `stub_responses: true` technique used for the #1016
  bug.
- **(b) What shapes can it hold?** CONFIRMED. `Transcoder.audio_job` (`lib/transcoder.rb`) builds
  exactly two outputs, `mp3_output(modifier)` and `wav_output(modifier)`, from the SAME `modifier`
  (`name_modifier_for(prefix, button_sound.full_filename)`, computed once in `audio_job` and
  passed to both). Both outputs use `container_settings: {container: 'RAW'}` and neither sets
  `extension:`. `grep -n "mp3_output\|wav_output"` shows exactly one call site, `audio_job`, so
  there is one writer of this shape.
- **(c) Cross-file claims.** CONFIRMED against the installed `aws-sdk-mediaconvert` gem's own
  inline documentation for `Types::Output#extension`: "Use Extension to specify the file extension
  for outputs in File output groups. If you do not specify a value, the service will use default
  extensions by container type as follows ... No Container, the service will use codec extensions
  (e.g. AAC, H265, H265, AC3)." MP3 and WAV are not named in that list, and the real service's
  behavior on two live jobs contradicts the promise of a working default for this pair: it did not
  produce two distinct paths. Relying on the undocumented-for-this-codec fallback is not safe;
  setting `extension:` explicitly is the field the SDK names for exactly this purpose.

## Red test

The defect is an AWS execution-time uniqueness check, not a local shape-validation error, so the
`stub_responses` technique that proved the #1016 fix cannot reproduce it. The test instead encodes
the invariant directly: the two outputs in one `audio_job` output group must resolve to distinct
file identifiers. Before the fix, neither output sets `:extension`, so both are `nil` and the test
fails on the same equality the AWS-side check enforces. `spec/lib/transcoder_spec.rb`, new example
under `describe "audio_job"` (see the diff): builds a real `audio_job` hash and asserts the two
outputs' `:extension` values are both present and different.

## Fix

Set `extension: 'mp3'` on `mp3_output` and `extension: 'wav'` on `wav_output`. This is the
smallest change that removes the ambiguity: it does not depend on whichever undocumented default
the RAW container was applying, and it also makes `Transcoder.output_files`/`handle_event`'s
`.end_with?('.mp3')` / `.end_with?('.wav')` suffix matching deterministic rather than incidental
(a watch item the #1016 dual review already flagged and left unfixed pending exactly this kind of
evidence).

**This is the probable fix, not a certain one (adversary review, 2026-09-19).** AWS's error
message names a path, and there are two readings of what made the two paths equal: (A) both RAW
outputs got an empty extension, so distinct `extension:` values fix it; (B) MediaConvert's dedupe
key is `destination + basename + name_modifier` and ignores extension, in which case the shared
`name_modifier` (both outputs use the same one, `lib/transcoder.rb:107,121-122`) is the real
cause and this fix changes nothing. Nothing offline distinguishes A from B: AWS's error-code
reference documents only a sibling 1040 message with a full path that already includes an
extension, which is weak support for A, not proof. **Treat the next real recording as the
experiment.** If 1040 repeats with the same shape, the fallback (not shipped here, to keep this
change's blast radius to one fix at a time) is to differentiate `name_modifier` between the two
outputs, not to re-open the diagnosis from scratch.

## Candidate fixes considered

1. **Set `extension:` on each output** (chosen). Minimal, SDK-documented, addresses the root cause
   named in AWS's own error message (the paths, not the modifier).
2. **Differentiate `name_modifier`** (e.g. append `_mp3`/`_wav`) instead of or in addition to
   setting `extension`. Would also produce distinct paths, but changes the on-disk filename shape
   for no reason the AWS docs point to, and leaves the suffix-matching in `output_files` still
   dependent on an unset, implicit extension. Rejected as a solo fix; not needed in addition to 1.
3. **Do nothing, rely on AWS's documented default.** Rejected: the default has now failed twice on
   real jobs; the doc's own extension list does not name MP3 or WAV, so nothing here was ever
   confirmed to work for this pair.

## Not in scope: `video_job` is PREDICTED to hit the same error, not merely unverified

CORRECTED (adversary review caught that my first pass had this backwards). `video_job`'s two
outputs were not exercised by this smoke test, so nothing here is proven broken, but the evidence
now points to a collision, not away from one: `frame_capture_output` sets `name_modifier:
"#{name_modifier}.mp4"` (`lib/transcoder.rb`) with `container: 'RAW'` and no extension.
`mp4_output` uses `container: 'MP4'`, whose documented default extension is `mp4`. Under the exact
mechanism reading (A) above, the frame-capture output's computed path is `<base><modifier>.mp4`,
which is byte-identical to the mp4 output's own `<base><modifier>` plus its default `.mp4`
extension. The `.mp4` embedded in the frame-capture modifier, which looked like a differentiator,
is what makes them collide under that reading. This is not fixed here: it has never run against
real MediaConvert (`frame_capture_output` shipped in #982 and every real job run so far has been
audio only), so writing a fix now would be exactly the ASSUMED-carrying-a-fix Rule #0 forbids.
Smoke-test one video recording before relying on this path; if it 1040s, the diagnosis is likely
already known from this note.

## Risks and unresolved questions

- The AWS side of this incident is not fully explained; the doc's fallback-extension list simply
  does not name MP3/WAV, so I cannot say why the two chosen codecs specifically failed to get
  distinct implicit extensions rather than confirm a mechanism. The fix does not depend on knowing
  why, only on using the documented, deterministic override.
- The two failed ButtonSound records (`1_17_a63f9dfe1c291535e766a71e`, `1_18_c15561ee2b571d585906ee1f`)
  are not touched by this PR. `transcoding_attempted` is already `true` on both, so the automatic
  `after_save` hook will not retry them; only the daily sweep (`schedule_missing_transcodings`,
  which forces a retry) will, and both are within its 2-week/2-attempt window. Fastest manual
  verification after this ships is a fresh recording, not waiting on those two.
- **This fix still does not touch the `output_file_paths` read-side bug, and that bug's shape is
  more solidly known than my first pass here said.** `Aws::MediaConvert::Types::OutputDetail` is
  `Struct.new(:duration_in_ms, :video_details)` in the installed gem (confirmed, no
  `output_file_paths` member exists there), and AWS's own docs
  (docs.aws.amazon.com/mediaconvert/latest/ug/output-file-names-and-paths.html, read 2026-09-19)
  document `outputFilePaths` as a property of the EventBridge job-state-change event's `detail`,
  with a worked example for exactly the FILE_GROUP-with-frame-capture case LingoLinq uses:
  `s3://amzn-s3-demo-bucket/file/file.mp4` for the main output,
  `s3://amzn-s3-demo-bucket/frameoutput/file.0000036.jpg` for the frame capture. That is a
  documented, not an ASSUMED, shape; calling it "needs a real COMPLETE event to write against" in
  the first version of this log overstated the blocker. A real event from THIS system is still
  the stronger evidence and has not been seen, so a fix should still be reviewed against one
  before being called proven, but it no longer needs to be treated as pure guesswork.
- A fresh recording after this fix ships is expected to reach the read-side bug next (assuming
  reading A above holds), not to fully complete transcription end to end, unless the read-side fix
  ships first or in the same release.
