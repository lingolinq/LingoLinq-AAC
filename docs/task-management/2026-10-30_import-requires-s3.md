# 2026-10-30: server-side imports and uploads refuse to run without S3 in deployed environments

Part of lingolinq_mobile#3. The diagnosis, Proposal D2, its adversarial review and the decision
are in the `traci/fix/sync-bounded-reads` branch's log,
`docs/task-management/2026-10-30_sync-bounded-reads.md` (Problem C, Production check, D2).

## Problem
`Uploadable#upload_to_remote` (`app/models/concerns/uploadable.rb`) falls back to storing the
picture's data URI in the database when the S3 post fails. Library imports run through the
migrate Jobs, which have boot secrets only (no S3), so every picture took that fallback:
35,689 staging images and 946 production images (822 dated 2026-06-29, most likely the Phase 5
rehearsal seed; inferred from the date) are embedded instead of uploaded. Devices then sync the
pictures inside the board data, which is what grew staging's board table to 153 MB.

## Decision (Traci asked for best practice, 2026-10-30)
Seeds and imports are one-off admin processes and run in the same environment as the app
(Twelve-Factor): the scheduler Job pattern, full secret set and app env. The migrate Job stays
migrations-only. No "skip imports when S3 is missing" mode, which would leave an environment
without its library and without an error.

## Change
- `Uploader.ensure_deployed_uploads_configured!` (`lib/uploader.rb`): in `Rails.env.production?`
  (every Cloud Run surface) without S3 credentials and bucket, raises the existing
  `Uploader::RemoteCredentialsMissing`. Development and test keep the fallback.
- Called before anything is created: `Converters::LingoLinq.from_external` (covers `from_obf`)
  and `from_external_nested` (covers `from_obz`; it preloads every board before any picture).
- Backstop at the top of `upload_to_remote`, before it changes the record.
- Runbooks: `PHASE5-CLEAN-DB-REHEARSAL.md` 3b seeds with the full secret set and app env;
  `PHASE5-CUTOVER-RUNBOOK.md` points there; `docs/INFRASTRUCTURE.md` states the rule.

## Callers checked
`upload_to_remote` server-side: the importer (guarded at entry), `Board` suggested sounds (not
guarded: inline it runs only without `GOOGLE_TTS_TOKEN`, where `Tts.generate_audio` returns nil
(`lib/tts.rb:21-28`), so it never saves or uploads; with the token it runs on the worker),
`ButtonSound.import_for` (runs only on the worker via `Progress.schedule`,
`sounds_controller.rb:43`), `Uploadable#assert_cached_copy` (web/worker), and scheduled
`upload_to_remote` jobs (worker). Web requests that hit the raise get the existing
`rescue_from Uploader::RemoteCredentialsMissing` (`application_controller.rb:12`).

## Tests and falsification
New examples stub `Uploader.client_uploads_configured?` and `Rails.env` explicitly both ways,
because `spec/spec_helper.rb:128-136` fakes S3 as configured whenever `AWS_SECRET` is blank (CI).
Red before the fix: the nested import posted a picture, the single-board import raised nothing,
`upload_to_remote` posted. Mutations, each red (run with `AWS_SECRET` blank): raise in every env
(2), ignore the configuration (3), drop the nested preflight (1), drop the single-board
preflight (1), drop the backstop (1). Full suite (`AWS_SECRET` blank): 8316 examples, 4 failures,
the same 4 failing on the develop-based worktree (they need the built frontend `vendor.js`,
absent in fresh worktrees).

## Review (2026-10-30, local adversary, verified by me)
No Critical or High. Acted on:
- I had also guarded `Board#process_suggested_sounds_async`, claiming the inline path would call
  TTS and save a sound per button. Wrong: CONFIRMED it never produces audio there (above), and
  the guard added a raise inside `before_save :process_suggested_sounds` (`board.rb:66`), which
  could abort a board update. Reverted with its examples; `board.rb` is unchanged on this branch.
- Rehearsal 3b now says where `APP_ENV_VARS` values come from, and that `db:seed` stops at its
  first import after the baseline accounts and starter boards (`lib/beta_seed.rb:25-30`), not
  before anything.
Checked clean by the reviewer and spot-checked by me: credentials come only from env
(`lib/uploader.rb:12-18`), so no surface that uploads today reads as unconfigured; every import
entry point goes through the guarded methods; no rescue loops on the raise.

## Not covered here (added to lingolinq_mobile#3 on 2026-10-30 after a reproduction)
Each reproduced with a throwaway spec (not committed), S3 faked as configured, post failing:
- A PNG/JPEG whose upload fails stays embedded and `pending`, and a later save queues nothing:
  never retried, on any surface.
- An SVG whose upload fails reschedules itself on every attempt (3 of 3), with no limit.
- The 35,689 staging and 946 production embedded pictures are not repaired here.
Not added: duplicate boards on re-running an interrupted import. Callers skip a set whose root
key exists (`CuratedVocabularySources`, `SystemBoardSources`), so it needs an interruption
between the import and the re-key; not reproduced, and this branch removes the known cause.
