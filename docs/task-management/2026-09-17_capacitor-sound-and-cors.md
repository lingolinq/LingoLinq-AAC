# Capacitor sound playback and local CORS (2026-09-17)

Follow-up branch for two 2026-08-10 stashes from
`feat/melissa-capacitor-7-kickoff`. Applied onto `develop` as
`melissa/fix/capacitor-sound-and-cors`.

## What landed

- Dev/test CORS allows `capacitor://localhost` and `ionic://localhost`
  so a local WebView can reach local Rails (`config/initializers/cors.rb`).
  This file is not loaded in production.
- `Button#load_sound` reads `board.sound_urls` with both numeric and
  string keys, and uses that map before `findRecord`.
- Speak-mode activate and utterance chip load prefer the map, then
  remote only when online.
- `speecher.assert_audio` prefetches HTTPS audio to a blob URL on
  Capacitor Android.

## Not done

- Browser / device verification of attached-sound playback in a
  Capacitor WebView.
- Dropping the two source stashes (keep until this branch is pushed).
