# MediaConvert jobs rejected client-side by misspelled SDK setting keys

Date: 2026-09-18. Parent issue: #981 (MediaConvert go-live). Branch:
`fix/scot-mediaconvert-sdk-setting-keys-5d62a7f8`.

## Symptom

First staging smoke test after the go-live wiring (#997, #1000). Between 22:03 and 22:37 UTC on
2026-09-18 the staging worker logged `performing Transcoder . convert_audio ()` five times with no matching
`done performing` line. `aws mediaconvert list-jobs` returned no jobs, and CloudTrail
(`EventSource=mediaconvert.amazonaws.com`, us-west-2) showed no `CreateJob` event from the app
principal, not even a denied one. The browser kept polling four sound records that never left
`transcoding_in_progress`.

Resque records a failed job in Redis, not on stdout, so the missing `done performing` line is the
only log signature of this failure.

## Fact sheet

- **(a) Where is the value read?** CONFIRMED. The job hash is read by the AWS SDK's parameter
  validator inside `config.create_job(...)` at `lib/transcoder.rb:79` (audio) and
  `lib/transcoder.rb:90` (video). `Transcoder.config` (`lib/transcoder.rb:94`) builds the client
  without `validate_params: false`, and nothing in `app`, `lib` or `config` sets it, so the
  validator runs and raises `ArgumentError` before any network call. That is why CloudTrail is
  empty.
- **(b) What shapes can it hold?** CONFIRMED. Both hashes are static literals with one writer each:
  `mp3_output` (`lib/transcoder.rb:262`, used only by `audio_job`, line 121) and `mp4_output`
  (`lib/transcoder.rb:303`, used only by `video_job`, line 146). No other code builds a
  MediaConvert job (`grep -rn "Aws::MediaConvert\|mp3_settings\|mp4_settings" app lib config`
  hits only `lib/transcoder.rb`).
- **(c) Cross-file claims.** CONFIRMED against `aws-sdk-mediaconvert 1.194.0` (`Gemfile.lock`,
  identical on `develop` and `staging`):
  `Aws::MediaConvert::Types::AudioCodecSettings.members` includes `:mp_3_settings`, not
  `:mp3_settings`; `ContainerSettings.members` includes `:mp_4_settings`, not `:mp4_settings`;
  `VideoCodecSettings.members` includes `:h264_settings` and `:frame_capture_settings` as
  written. `aac_settings`, `wav_settings`, `file_group_settings` also match. So exactly two keys
  are wrong. CONFIRMED: `spec/lib/transcoder_spec.rb` hands `create_job` an `OpenStruct` and
  asserts `[:mp3_settings]` on the hash, so it proves the hash matches itself and never meets
  the SDK.

## Red test (written before the fix)

`spec/lib/transcoder_spec.rb`, new `describe "SDK parameter validation"`: calls
`Transcoder.convert_audio` and `Transcoder.convert_video` with `Transcoder.config` returning a
real `Aws::MediaConvert::Client` built with `stub_responses: true`. The SDK validator runs, no
network is used. Before the fix both fail with the same `ArgumentError: unexpected value at
...[:mp3_settings]` / `...[:mp4_settings]` that staging hit, raised from `transcoder.rb:79` and
`:90`.

Weakest passing state: a hash the 1.194.0 validator accepts. That state cannot contain this bug.
It can still contain a job the MediaConvert SERVICE rejects (see unresolved questions).

## Candidate fixes

1. **Rename the two keys** to `mp_3_settings` and `mp_4_settings`; correct the existing spec
   assertion at the old `[:mp3_settings]` line. Smallest change that keeps the intended settings.
2. **Rename `mp3_settings`, delete the empty `mp4_settings: {}`.** Also validates (the member is
   optional and the hash is empty). Rejected: it changes what is sent for no benefit, and an
   explicit empty `mp_4_settings` is harmless.
3. **Disable SDK validation (`validate_params: false`).** Rejected: the service would reject or
   ignore the unknown member instead, and it removes the only offline check we have.

## Known blocking follow-up: the completion path cannot work (found by the proposal review)

CONFIRMED offline, same technique as fact (c): `Transcoder.output_files` reads
`out.output_file_paths` (`lib/transcoder.rb`, `def self.output_files`), but
`Aws::MediaConvert::Types::OutputDetail.members` is `[:duration_in_ms, :video_details]` and the
string `output_file_paths` appears nowhere in the 1.194.0 gem. `respond_to?` is false, so
`output_files` returns `[]` for every real `get_job` response, `handle_event` returns false at
`return false unless mp3` / `unless mp4`, the callback answers `400 event not handled`, and the
record stays `transcoding_in_progress`. The file paths are a property of the EventBridge
COMPLETE event (`detail.outputGroupDetails[].outputDetails[].outputFilePaths`), not of GetJob.

This PR does NOT fix that, on purpose. The event payload shape is known here only from AWS
documentation, so it is ASSUMED, and nothing ASSUMED may carry a fix. Once this rename deploys,
the first real staging job makes `Api::CallbacksController` log the real notification body
(`Rails.logger.warn(json_body.to_json)`), which turns the shape into a CONFIRMED fact for the
follow-up. The `handle_event` specs mock `get_job` with `OpenStruct`, which answers
`respond_to?` for anything, so they share the blind spot the write-side specs had; the follow-up
should move them to `stub_responses(:get_job, ...)`.

**So this PR makes jobs submit. It does not make the smoke test pass.**

## Risks and unresolved questions

- The offline validator checks member names and types only, and does not check enum values.
  The review checked every enum string against the gem's `sig/params.rbs` unions: all valid.
  It cannot prove the service accepts the settings combination. Watch items for the first real
  job: no `extension:` is set on the RAW-container outputs while `handle_event` matches on
  `.mp3` / `.wav` / `.jpg`; the MP3 and WAV outputs share one `name_modifier`; a video with no
  audio track leaves `Audio Selector 1` unsatisfied (that one errors visibly).
- IAM `PassRole`, the S3 role policy, the EventBridge rule and the SNS callback have still never
  been exercised by a real job. This fix unblocks them; it does not verify them.
- The new spec replaces `Transcoder.config`, so it would stay green if someone later added
  `validate_params: false` to the real client. Low; follow-up.
- The four staging sound records from the failed test stay `transcoding_in_progress`.
  `ButtonSound.schedule_missing_transcodings` skips an in-progress record whose `updated_at` is
  under 48 hours old, so the 06:00 UTC sweep will not retry them before 2026-09-21. Test data
  only; re-record after the follow-up lands.
- Production: `APP_MEDIACONVERT_ROLE_ARN` is unset there, so this code path is inert in
  production today. It must stay unset until the follow-up is deployed and the staging smoke
  test passes end to end.

## Mutation that must turn the test red

Revert either key to its old spelling: the matching new spec fails with `ArgumentError`.

Falsified 2026-09-18 from a saved copy: reverting `mp_3_settings` alone fails the new audio spec
and the corrected existing assertion (2 failures); reverting `mp_4_settings` alone fails the new
video spec (1 failure); restored file byte-identical (`cmp`), 30 examples, 0 failures across
`spec/lib/transcoder_spec.rb` and `spec/controllers/api/callbacks_controller_spec.rb`.
