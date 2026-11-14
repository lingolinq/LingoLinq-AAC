# 2026-11-09: Piper voices behind a feature flag (proof of concept)

## Goal

Offer free, on-device voices in more languages than devices ship with, without new vendor
contracts. Behind `piper_voices`, off for everyone (canary included) until a person turns it on.
Context: Scot's voice strategy review (Acapela cost, kid voices, voice banking) on 2026-11-09.

## What changed

- `app/frontend/app/utils/piper_tts.js` (new): curated list of 13 single-speaker Piper voices in
  12 languages, an engine that runs espeak-ng (WebAssembly) plus onnxruntime-web in the browser,
  model caching in Cache Storage, and `speak_text` / `stop_text` with the same contract as
  `capabilities.tts`.
- `app/frontend/app/utils/speecher.js`: five same-line edits (no line moves, so the
  `.eslint-todo` rows keep their numbers) plus new code at the end of the file:
  `with_piper_voices`, `apply_piper_voices`, `watch_piper_flag`.
- `lib/feature_flags.rb`, `lib/system_feature_registry.rb`: flag registered on existing lines
  (other files cite `feature_flags.rb` line numbers).
- `public/locales/en.json`: two keys, added by hand (see Lessons).

## Decisions

- **Own engine, not `@mintplex-labs/piper-tts-web`.** That library hard-codes a third-party model
  mirror (`huggingface.co/diffusionstudio/piper-voices`). Ours takes a model base URL, pinned to
  one commit of `rhasspy/piper-voices` (`cf910fb5...`), so moving to our own storage is a
  one-line change.
- **Runtime from jsDelivr as scripts, no npm dependency.** `cdn.jsdelivr.net` is already in the
  CSP `script-src` and `connect-src`; nothing is added to the app bundle.
- **`piper:` prefix, not `extra:`.** `components/voice-output.js` shows only `extra:` voices the
  user has claimed as premium; free voices must not go through that check.
- **`remote_voice: true`.** Reuses the rule in `speecher.find_voice_by_uri` that keeps remote
  voices out of automatic locale fallbacks, so nobody gets a 63 MB download they did not pick.
- **Never wait on a download.** A voice that is not loaded rejects at once (speecher speaks with
  the device voice) and starts loading; one notice per voice per session.

## Verified

- Engine in headless Chrome 153: model load about 5 s from network and 1 s from Cache Storage; a
  two-sentence phrase synthesizes in under 1 s; both sentences come out; rate changes length.
- Phoneme IDs match the Python `piper-tts` output except where the WASM phonemizer's older
  espeak-ng differs (`more` comes out as `moːɹ`, not `mɔːɹ`). Whisper heard "You want mayor,
  please?" for "I want more, please." Follow-up: a newer phonemizer build.
- 13 new QUnit tests pass; mutation (Piper routing removed) fails 2 of them. 276 existing
  speecher, voice, utterance and capabilities tests pass. `npm run lint:js:ci`: new=0.
- Not run here: `spec/lib/feature_flags_spec.rb` (the repo pins Ruby 3.4.4; this machine had
  3.3.6). The flag constants were loaded with plain Ruby and checked instead.

## Not done (follow-ups)

- Host models and runtime files on our own storage before production; the CSP will report
  `huggingface.co` downloads until then (report-only, nothing blocked).
- Offline: models are cached, but the runtime scripts and WASM rely on the HTTP cache.
- Native speaker or SLP review of each language; newer phonemizer build.
- No child or teen voices exist in the Piper catalog.
- A voice choice saved while the flag is on falls back if the flag is turned off.
