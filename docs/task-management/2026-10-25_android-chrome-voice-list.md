# 2026-10-25 Android Chrome voice list shows only the backup voices

Brief: `agent-router-exports/district-dfd/prompts/2026-10-25-android-chrome-voice-list.md`.
Branch: `fix/scot-android-chrome-voice-list-93cb58f8` (base `develop` at `3d76b374a`).

## Symptom

Android phone, Chrome, dev.lingolinq.com: Preferences > Voice Settings offers about five
voices ("Default Voice", the English "*Internet Required*" pair, "Ukranian Female *Internet
Required*", "English Low-Quality Male Voice"); none of the phone's Google voices. Windows Chrome
lists the Windows and Google voices. CoughDrop on Android listed 100+ Google voices.

## Fact sheet

(a) Where is the voice list READ?

- Every picker reads `speecher.get('voiceList')`, a computed on `voices`: CONFIRMED
  `app/utils/speecher.js` `voiceList: computed('voices', ...)`; consumers
  `controllers/user/preferences.js` `user_voice_list` (`'speecher.voiceList'`),
  `controllers/setup.js` `user_voice_list` (`'speecher.voiceList'`),
  `components/voice-output.js` `user_voice_list` (`computed('appState.refresh_voices', ...)`, a key
  nothing sets, so it computes once per component instance). No other file lists voices
  (`grep -rln "user_voice_list\|voice_list\|voiceList" app`).
- Speech reads `speecher.voices` through `find_voice_by_uri` (`speak_raw_text`), `set_voice`, and
  `models/user.js` `update_voice_uri`.

(b) Every shape `speecher.voices` can hold, by writer.

1. Default `[]` (prototype).
2. `refresh_voices()` sync list: `getVoices()` result (forced `[]` on the iOS installed app), then
   a `"Default Voice"` placeholder with `voiceURI: ""` only when that is empty, then the cloud
   `remote:` entries (English pair when the navigator language is not English; the
   `cloud_locales` matches for the navigator language; Ukrainian unless the language is `uk`),
   then `speak_js:<loc>` "Low-Quality Male Voice" when `window.speak || window.meSpeak`. Stored
   ONLY when `voices` is empty: `if(!this.get('voices') || this.get('voices').length === 0)`.
   CONFIRMED `app/utils/speecher.js` `refresh_voices`.
3. Async writers in `refresh_voices`, each `more.concat(current)` then `Utils.uniq(.., voiceURI)`:
   iOS `window.TTS.checkLanguage` (`tts:` entries), Windows `window.TTS.getAvailableVoices`,
   `capabilities.tts.available_voices()` (`extra:` premium voices; rejects on the web:
   `capabilities.js` `tts_exec` "platform-level tts not available").
4. Tests set it directly (`speecher.set('voices', ...)` in several test files).

`window.speak` is always defined on the web: `ember-cli-build.js` imports
`vendor/speak_js/speakClient.js`, whose top level is `function speak(text, args)`. So the
Low-Quality voice is always listed. `window.meSpeak` is loaded nowhere (grep of app, vendor,
public). CONFIRMED.

`Utils.uniq` drops every item whose key is falsy (`if(value && !key[value])`,
`app/utils/misc.js`), so the `"Default Voice"` placeholder (`voiceURI: ""`) is removed by any
writer that runs `uniq` on voiceURI. CONFIRMED.

(c) Cross-file claims.

- Nothing listens for `voiceschanged`: CONFIRMED (`grep -rn "voiceschanged\|onvoiceschanged" app`
  returns nothing).
- The app-state retry ("Android Chrome seems to have a short delay before voices get loaded",
  `services/app-state.js`) fires only when `voices.length == 1 && voices[0].voiceURI == ""`.
  The backup entries make the list at least two long on every web device, so it never fires;
  if it did, `refresh_voices` would not store the result (guard above). CONFIRMED.
- `refresh_voices` is called by `routes/application.js` `setupController` (first, at boot), the
  app-state retry, and the premium-voices component/controller. CONFIRMED.
- The server never stores `voice_uri`: `app/models/user.rb` `process_device` moves it to the front
  of `voice_uris` (last 10) and deletes it. The client derives
  `preferences.device.voice.voice_uri` in `models/user.js` `update_voice_uri` by walking
  `voice_uris` against `speecher.voices`, and sets it to `undefined` when none is listed.
  `update_voice_uri` runs from `utterance.update_voice`, which observes `currentUser` and voice
  preference keys only (`utils/utterance.js` `setup`), never `speecher.voices`. CONFIRMED.
  Consequence: if the device voices arrive after the user loads, the saved voice is not applied
  until a preference changes.
- Scot's phone: the stored list held no device voices, so `getVoices()` returned nothing at the
  one call. CONFIRMED by device (brief).
- Chrome on Android fills `getVoices()` later and fires `voiceschanged`: ASSUMED (standard Chrome
  behaviour). Load-bearing for the fix, so the PR must ask for a real-phone check.
- Android Chrome voiceURIs unique per voice: ASSUMED; the design below does not depend on it (it
  never de-duplicates the device list itself).

## Server TTS (for the PR body, not changed)

`lib/tts.rb` `generate_audio` uses Google Cloud Text-to-Speech
(`texttospeech.googleapis.com`) when `GOOGLE_TTS_TOKEN` is set; `api/v1/search/audio`
(`SearchController#audio`) does the same, Irish disabled. The client `remote:` voices play
through `window.cloud_speak` (`vendor/speech/speech.js`), which loads `/api/v1/search/audio`.

## Diagnosis

Chrome on Android returns `[]` from `getVoices()` at boot (`routes/application.js`
`setupController` -> `speecher.refresh_voices()`). `refresh_voices` stores the placeholder plus
backup entries, and nothing ever replaces them: no `voiceschanged` listener, the only-if-empty
guard blocks later `refresh_voices` calls, and the app-state retry never matches. Windows Chrome
works because its voices are already loaded at the one call. Pre-fork code, not a regression.

## Red test (written before the fix)

`tests/utils/speecher-test.js` `describe("refresh_voices")`:
1. `adds device voices that load after the first getVoices call`: fake `speechSynthesis` whose
   `getVoices()` is `[]` at the first call; fill it, fire `voiceschanged` (dispatched to both
   `addEventListener` listeners and `onvoiceschanged`, so it does not dictate the registration
   style); assert `voiceList` ids contain the device voices. Mutation that must turn it red: remove
   the listener registration (or restore the only-if-empty guard).
2. `keeps the Default Voice entry when the device never reports a voice`: guard against the
   `Utils.uniq` falsy-key drop if the merge used `uniq` on voiceURI.

## Candidate fixes

A. (Proposed) Listen and merge.
   - `device_voices()`: the `getVoices()` read with the iOS-installed-app rule, shared by both
     paths.
   - Split `refresh_voices` into `build_voice_list()` (the sync list) and
     `store_voice_list(list)`. Store always merges instead of storing only-if-empty: entries the
     async writers added (anything in `voices` that is not an object from the previous sync list,
     compared by identity so the `""` placeholder is handled) are kept in front, the new sync list
     replaces the old one, and extras whose voiceURI appears in the new list are dropped. The new
     sync list itself is never de-duplicated (no dependence on Android voiceURI uniqueness).
   - Register one `voiceschanged` listener per `speechSynthesis` object (`addEventListener` when
     present; tracked so repeated `refresh_voices` calls do not stack listeners). On the event,
     rebuild and store only when the device-voice URIs differ from the last read (no-op in
     headless test Chrome, which reports no voices).
   - `utils/utterance.js` `setup`: also observe `speecher` `voices` with `update_voice`, so the
     saved voice (`voice_uris`) is re-applied once device voices arrive.
   - Remove the `remote:` entries from the sync list (Scot's decision).
B. Listener that empties `voices` and calls `refresh_voices()` again. Smaller, but it drops the
   iOS `tts:` / premium `extra:` entries until their native calls answer again, re-runs those
   native calls on every event, and leaves the saved-voice problem. Rejected.
C. Make the app-state retry match (poll after boot). Polling a timer for an event the browser
   already fires, and it only runs on entering Speak Mode. Rejected.

## Risks

- Dropping the only-if-empty guard changes what a second `refresh_voices` call does (premium-voices
  screens, app-state retry): it now refreshes the device list instead of being a no-op. Extras are
  preserved by the merge.
- `update_voice` now runs on every `voices` write (a few at boot). It calls
  `user.update_voice_uri()`, which `unshift`s into the `voice_uris` array in place (pre-existing);
  more calls add duplicate URIs to that in-memory array. The server `uniq!`s it on save. Not
  changed here.
- If Preferences is already open when voices arrive, `pending_preferences` was copied with
  `voice_uri` undefined, so the picker may show "[ Select A Voice ]" until reopened. Voices
  normally arrive within a second of boot.
- The real `window.speechSynthesis` keeps one listener for the page lifetime. In a headed local
  test browser with voices, a late `voiceschanged` could change `voices` during an unrelated test.

## Unresolved (for Scot)

1. `find_voice_by_uri` online fallback to a cloud voice (used only when the device has no usable
   local voice): keep as a hidden last resort, or remove (device then uses the browser default or
   stays silent).
2. The Low-Quality Male Voice (speak.js; always listed on the web; `window.meSpeak` is never
   loaded): keep or remove. It is the only voice on a device with no speech engine.
3. Saved `remote:` voices: no migration proposed. `update_voice_uri` walks `voice_uris` to the next
   listed voice; if none, speech uses the best local voice for the locale (Google first).

## Mutation for the PR

Remove the listener registration in `refresh_voices` -> test 1 red. Restore -> green.

## Scot's answers (2026-10-25)

- Cloud fallback in `find_voice_by_uri`: keep the speech fallbacks as they are. Wanted: a
  disclaimer when no voice matches a language, so users know why it speaks with an English
  pronunciation. Filed as a follow-up brief (new UI text; separate review), not in this PR.
- Low-Quality (speak.js) voice: offer it only when the device has no voice of its own.

## Adversary review (2026-10-25) and what changed

Findings checked against the code before acting:
- High, accepted: `update_voice_uri` (`models/user.js`) re-tries the current `voice_uri` before the
  saved `voice_uris`, so a value matched before the device voices arrived stays applied. Fixed in
  `speecher.reapply_user_voice`: it clears the derived `voice_uri` and walks the saved list again.
  `models/user.js` is not changed.
- Medium, accepted: an observer on the `speecher` singleton would outlive every test app. Dropped
  the `utterance.js` observer; the re-apply runs only from the `voiceschanged` handler and reads
  `live_service(speecher.appState)` with no global fallback.
- Medium, accepted: a later call that briefly sees no voices no longer replaces a device list.
- Medium, accepted: more tests (Default Voice gone once voices arrive, speak.js once, extras kept,
  one listener, saved voice applied, empty-call guard).
- Low, accepted: `.eslint-todo` is line-anchored. `speecher.js` keeps every line above the first
  baselined row (498) at net zero: two helpers live below the last baselined row as
  `speecher.x = function` statics. The new tests sit below the test file's baselined rows.
  `npm run lint:js:ci`: `new=0`.
- Low, carried to the PR body: ask for an airplane-mode check on the phone.

## Falsification (targeted run, `--filter "refresh_voices"`, 9 tests)

| Mutation | Red |
|---|---|
| Whole fix reverted (`HEAD~1` speecher.js) | 7 of 9 (tests 3 and 8 guard behaviour the old code already had) |
| No `addEventListener('voiceschanged')` | 5: tests 1, 2, 6, 7, 9 |
| `reapply_user_voice` without clearing `voice_uri` | 1: test 9 |
| No keep-on-empty guard in `refresh_voices` | 1: test 8 |

## Trace to the read

- `voiceschanged` listener: registered in `refresh_voices`, which `routes/application.js`
  `setupController` calls at boot, before any picker reads `speecher.voiceList`.
- `device_voices_changed` writes `voices` through `store_voice_list`; every picker reads
  `voiceList`, a computed on `voices`, so they update.
- `reapply_user_voice` clears `preferences.device.voice.voice_uri` before calling
  `update_voice_uri`, which reads it first (`models/user.js` `update_voice_uri`).

## Not changed, noted

- The app-state Android retry (`voices.length == 1 && voiceURI == ""`) is still unreachable on the
  web (the speak.js entry makes the list two long). Harmless; left in place.
- The `no_local_voices` warning in `services/app-state.js` cannot fire on the web before or after
  this change (the list always holds a non-remote entry).
- Locale keys `female_ukranian_internet_required` and `male_internet_required` are no longer
  used by JS; `female_internet_required` is still used by the `find_voice_by_uri` fallback.
- iOS installed app: `getVoices()` is forced empty there, so speak.js is still listed beside the
  native `tts:` voices, as before.
- Pickers filter premium voices on `voice.voiceURI`, which `voiceList` entries do not carry (they
  have `id`), so that filter never matches. Pre-existing; out of scope.
