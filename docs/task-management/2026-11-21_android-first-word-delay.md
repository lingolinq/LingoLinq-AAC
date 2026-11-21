# The first word spoken on Android starts late (2026-11-21)

Reported by Traci on 2026-11-16 on the Android emulator: the word shows at once, the voice about 3 s late, on the
first tap only. Carried in the 2026-11-16 and 2026-11-19 offline-sync handoffs as "not started".

Learnings consulted: `learnings-archive/2026-10.md` "Read speech voices on `voiceschanged`, not once at boot"
(Chrome on Android reports its voices late, so a warm-up that finds no voices must not count as done), and
`2026-10-25_android-chrome-voice-list.md` (`.eslint-todo` is line-anchored in `speecher.js`).

## Still a problem? Measured on current develop

Android emulator (AVD `ll_trace`, Chrome 124, Google TTS `com.google.android.tts`), started without `-no-audio`
(WSL has no PulseAudio, so the emulator plays to no device; the utterance events still fire). Server: develop with
#1330 (`f581c0066`'s code, speech code identical to develop). Account `e2e_offline_modern`, Modern home board.
Script: `~/offline-sync-handoff/2026-11-21-tts/tts-probe-cdp.js` (drives Chrome over its DevTools socket, real
touch events through `Input.dispatchTouchEvent`, logs every `speechSynthesis.speak()` and its start/end/error).

| Run | First word: speak() / speech starts (ms after the tap) | Second word |
|---|---|---|
| Chrome running, engine running | +92 / +928 | +49 / +90 |
| Chrome and the TTS engine force-stopped first | +74 / +980 | +43 / +119 |

Yes, still a problem: about 0.85 s more on the first word. Not reproduced: 3 s. The emulator has no audio device
here, so a real device's audio start-up is not in these numbers; that may be the rest.

## Cause (CONFIRMED by experiment)

- `speecher.unlock_speech` (`app/utils/speecher.js:332`) is the only warm-up. It runs inside `activateButton`
  (`app/controllers/application.js:1935`), so on the SAME tap as the first word. Its text is a zero-width space,
  which fails before reaching the engine; it names no voice; and it is cancelled at once. It exists for the autoplay
  rule (speech must start in a user gesture), not to load the voice.
- The app speaks with the person's voice (here "English Australia", `en_AU`); the device default was Bulgarian. The
  first `speak()` with a voice makes Android load that voice.

Experiments (each with Chrome and the TTS engine force-stopped; a touch on a blank part of the page 3 s before the
first word, then the word):

| Warm-up on the earlier touch | First word starts |
|---|---|
| the app's own `unlock_speech` (zero-width, cancelled) | +888 ms |
| zero-width space, volume 0, not cancelled | +878 ms (`synthesis-failed`) |
| "a", volume 0, default voice | +646 ms (`synthesis-failed`) |
| **"a", volume 0, the person's voice, not cancelled** | **+88 ms** |
| **",", volume 0, the person's voice, not cancelled** | **+113 ms** |

## Fix

- `app/utils/speech_warmup.js` (new): `warm_voice(synth, Utterance, native_voice)` speaks "," at volume 0 in the
  given device voice, not cancelled, and skips while anything is speaking or queued; `native_voice_for` and
  `is_custom_voice`, moved out of `speak_text` so the warm-up finds the same device voice speech uses.
- `speecher.warm_voice` (end of `speecher.js`): Android only (iOS Safari ignores utterance volume, and the delay was
  measured on Android); resolves the person's voice as `speak_text` does, warms each device voice once, and does not
  count a warm-up that was skipped (engine busy, no voices listed yet).
- `speecher.warm_voice_on_touch`, called from `setup()`: one capture `pointerdown` listener on the document. Every
  touch is a user gesture, so the sign-in tap, opening a board or any touch loads the voice before the first word.
- `speak_text` now calls the two shared helpers; same behaviour (the `voiceURI && (...)` rule is kept exactly).
- Every edit above line 1210 is line-neutral (`.eslint-todo` rows in `speecher.js`).

Limit: when the very first touch in a session is the word itself, the warm-up starts only a few tens of ms before
the word; measured below.

## Tests

- `tests/unit/utils/speech-warmup-test.js` (5) and `tests/utils/speecher-test.js` "speecher warm_voice" (6).
- `ember test --query timingStrict=1 --filter "/speech warmup|speecher/i"`: 82 tests, 78 pass, 4 skipped (existing
  `xit`), 0 fail.

- Mutations (all four at once; each turned exactly its own tests red, 5 of 11): warm-up at volume 1 (the two
  "comma at volume 0" tests); no Android gate (the iOS test); a skipped warm-up counted as warmed (the busy test);
  no listener installed (the pointerdown test). Restored with `git checkout`; `git diff HEAD` empty.
- `npm run lint:js:ci`: no finding in the changed files. It prints 4 `no-orphaned-action` findings in
  `ai-disclosure.js`, `sync-details.js` and `preferences.js`, the known worktree false positive (the lint plugin
  reads the main checkout's templates).

## Verification on the emulator with the fix

This branch built for production and served on :5111 (same database), Chrome and the TTS engine force-stopped
before each run, no warm-up injected by the probe (`WARM=touchonly` only makes the blank touch).

| First word: speech starts after the tap | develop | this branch |
|---|---|---|
| any earlier touch (here a blank spot, 3 s before) | +928, +980 ms | **+103, +88 ms** |
| the very first touch is the word | +928, +980 ms | +688, +596 ms |
| later words | +65 to +252 ms | +65 to +252 ms |

With any earlier touch the first word is as quick as later ones. When the word is the first touch, the warm-up starts
at pointerdown and is cancelled a few ms later by `unlock_speech` and `stop()`, so the gain is about 0.3 s. Not
changed: removing those cancels would let a word queue behind the warm-up.

Not covered: a real Android phone or tablet (audio start-up on real hardware), other TTS engines (Samsung), and the
Android app (Capacitor WebView; same `speechSynthesis` path, not run).

## Review (Codex on #1351, 2026-11-21): two P2 findings, both CONFIRMED and fixed (`4f8c2415c`)

1. The voice was cached as warmed when the warm-up was QUEUED. On a first touch that is a button, `activateButton`
   calls `unlock_speech`, which cancels it ~50 ms later; for a button that speaks nothing (a link, or vocalization
   skipped) the voice never loads, and the cache stopped every later touch from trying again. Now the voice counts
   as warmed only on the warm-up's `start` event (`warm_voice`'s `on_start`); while one is queued, the
   speaking/pending check keeps a second from being added.
2. With the alternate voice on for buttons (`utils/utterance.js` `speak_button`: `alternate_voice.enabled &&
   for_buttons === true`), button speech uses `alternate_voiceURI`, but the warm-up always used the main voice. Now
   `speecher.button_voice_uri()` picks the same voice; `force_default` (no voice named) is skipped.

Tests: 3 new (`cancelled before it started`, `alternate voice`, `force_default`) and 1 unit test for `on_start`;
the "warms each voice once" test now fires `start`, since caching on queue was the defect. 86 tests, 82 pass, 4
skipped (existing). Mutations: caching on queue again (red: the cancelled test); ignoring the alternate voice (red:
the alternate-voice test). The emulator timings above were taken before this change; the warm-up is queued the same
way, only when it is counted changed.
