# 2026-10-22 — voice transcription honours an explicit "Allow AI features" opt-out

Branch `traci/fix/transcription-ai-opt-out`, from develop at 4bae48a9c. Asked by Scot (release review of #1130).

## Facts
- READ: `ButtonSound#schedule_transcription` (app/models/button_sound.rb), above the `frd` branch, so both the after_save
  scheduling and the worker re-run pass through it. No other SERVER-side path sends recorded audio to Google (CONFIRMED
  by grep). Browser dictation (webkitSpeechRecognition in the board-creation and focus-word screens) sends microphone
  audio to the browser vendor; it is user-initiated and not part of this check.
- Before: org switch, COPPA, EU under-16, org `disable_ai_features`; the personal preference was removed on purpose in
  #1087 (00e86c9e0), so an explicit opt-out still sent recordings to Google. Main and develop both (the Oct 14 release
  carried #1087).
- SHAPES of the master preference `ai_features_enabled`: absent / never set; true; false; legacy "" (9 production users per
  lib/feature_flags.rb comments); strings or ints on legacy rows. `FeatureFlags.ai_pref_value` reads false/'false'/0/'0'
  as false, true/'true'/1/'1' as true, anything else as nil.
- Whose preference: the recording's owner (`self.user`), as every other check here.

## Change
`return if User.ai_features_opted_out?(self.user)` after the org switch: only a recognizable "off" stops transcription;
never set, blank, or anything else still transcribes. The org switch, COPPA and EU under-16 checks are unchanged. The
helper lives in `User` (lib/feature_flags.rb keeps its line numbers for the capability ledger).

## Tests
Scot approved changing the two specs that pinned the old behaviour; a third example ("should still query Google...")
encoded the same behaviour and was flipped with them. Added: string/int opt-outs, a blank value still transcribes, on
still transcribes; the never-set example is kept. Red before the change (4 failures); red again with the gate removed.

## Open for Scot
- System-written "off" values read as an opt-out. When an under-16 student is removed from an organization or a license
  ends, `apply_eu_ai_offboarding_reset!` (user.rb, called for `attested_under_16 || eu_under_16?`, so not only EU) writes
  every AI preference false, with no confirmation_log entry. This check cannot tell that from the person's choice, so
  transcription stops for those students (the privacy-safe direction). Turning "Allow AI features" on restores it, but
  also turns on the features that follow the master switch. A parental consent grant always sets the master true
  (sanitize_eu_ai_requested_features), so that path is not affected. If they should keep transcription, the reset needs a
  marker this check can read.
- Whose preference: the recording's owner. Usually the person recording; for batch recording on a communicator's
  account the communicator owns the sounds (sounds_controller.rb), so their preference governs.
- Release: Scot asked for the next release; no hotfix.
- Follow-ups: the attested compliance program overview (2026-09-14) says transcription is not gated by individual consent;
  it needs a dated successor. The recordings view keeps polling "checking for transcription..." for a sound that will
  never be transcribed (also true today for the org, COPPA and EU gates).
