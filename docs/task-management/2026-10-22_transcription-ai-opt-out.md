# 2026-10-22 — voice transcription honours an explicit "Allow AI features" opt-out

Branch `traci/fix/transcription-ai-opt-out`, from develop at 4bae48a9c. Asked by Scot (release review of #1130).

## Facts
- READ: `ButtonSound#schedule_transcription` (app/models/button_sound.rb), above the `frd` branch, so both the after_save
  scheduling and the worker re-run pass through it. No other path sends audio to Google (CONFIRMED by grep).
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
- An EU under-16 account has its AI preferences forced to false at creation and on revoke, which this check cannot tell
  apart from the person's own choice. A parent who grants consent without turning the master switch on leaves it false,
  so transcription stays off for that child. Kept (the conservative reading); say if it should transcribe.
- A supervisor recording on a communicator's board is gated by the supervisor's preference (the recording's owner).
