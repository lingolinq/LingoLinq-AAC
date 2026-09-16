# MediaConvert transcoding migration (2026-09-15)

Issue: https://github.com/lingolinq/LingoLinq-AAC/issues/966

## Fact sheet

(a) READ: `Transcoder.convert_audio` / `convert_video` are scheduled from
`MediaObject#schedule_transcoding` (`after_save`) and
`ButtonSound.schedule_missing_transcodings` (daily `transcode_errored_records`).
Completion is SNS `POST /api/v1/callback` -> `Transcoder.handle_event` ->
`update_media_object` / `media_object_error`.
CONFIRMED: `lib/transcoder.rb`, `app/models/concerns/media_object.rb:81-94`,
`app/controllers/api/callbacks_controller.rb:26-37`,
`app/models/button_sound.rb:114-133`.

(b) Shapes: input is an S3 key in `settings['full_filename']` (not an `s3://`
URI). ETS implied the bucket via a pipeline; MediaConvert `FileInput` must be
`s3://#{UPLOADS_S3_BUCKET}/#{key}`. Completion payload is EventBridge
(`detail.status` `COMPLETE`/`ERROR`, `detail.jobId`); duration is
`durationInMs`. Thumbnails: leftover ETS `videos/.../.mp4.<5 digits>.(jpg|png)`
plus MediaConvert Frame Capture 7-digit counters.
CONFIRMED: `lib/transcoder.rb` (pre-migration), `lib/uploader.rb:232-234`,
`app/models/concerns/media_object.rb:14`.

(c) Restoring `TRANSCODER_*_PIPELINE` cannot revive transcoding. AWS
discontinued Elastic Transcoder on 2025-11-13. Custom WAV preset
`1493160167887-5xkjsb` is gone; reconstruct 44100 Hz / 16-bit / mono for
`ButtonSound#schedule_transcription`.
CONFIRMED: issue #966; `app/models/button_sound.rb:61-64`.
ASSUMED (issue evidence, not re-checked this session): `lingolinq-app` has no
MediaConvert IAM.

## Candidates

1. MediaConvert (chosen; #966). Fail closed when Role/bucket are unset.
2. In-worker ffmpeg: rejected. No ffmpeg in the Cloud Run image; video is
   heavy on a pool with OOM history; not the issue's replacement.

## Out of scope

Retry of the 53 failed jobs. Backfill older than the two-week window.
`Pusher`'s `TRANSCODER_KEY` SNS fallback. Attested `AWS_BAA_ACCEPTED.md` rewrite.

## PR body notes (for #966)

**Scot IAM checklist (blocks live jobs, not this merge):**
1. `lingolinq-app`: `mediaconvert:CreateJob`, `GetJob`, `DescribeEndpoints`; `iam:PassRole` on the new role only.
2. MediaConvert service role: S3 GetObject/PutObject on `lingolinq-{dev,staging,prod}-uploads`.
3. On-demand queue in `us-west-2` (default is fine).
4. EventBridge rule (`source=aws.mediaconvert`, status COMPLETE/ERROR) to an SNS topic matching `audio_conversion_events`, `video_conversion_events`, or `mediaconvert`; HTTPS subscribe `POST /api/v1/callback`; add the topic to `SNS_ARNS`.
5. Set GitHub env vars `APP_MEDIACONVERT_ROLE_ARN` (and optional `APP_MEDIACONVERT_QUEUE_ARN`, `APP_MEDIACONVERT_ENDPOINT`).
6. Confirm output encryption matches the uploads bucket.

**Attested follow-up:** `docs/legal/AWS_BAA_ACCEPTED.md` still names Elastic Transcoder. Do not edit attested bytes here; Scot `/re-attest-record` after this merges.
