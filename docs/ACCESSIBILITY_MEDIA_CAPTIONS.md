# Media captions — known accessibility gap + opportunity

**Status:** open gap. `require-media-caption` is currently **disabled** in
`app/frontend/.template-lintrc.js` (see rationale below). Raised 2026-07-16 during the
ember-template-lint convention migration.

## The gap (real, user-facing)

Deaf and hard-of-hearing users cannot access the content of any user-recorded audio or video
in the app. There are 23 `<audio>`/`<video>` elements and none carry a `<track kind="captions">`.

## Why the lint rule was disabled rather than "fixed"

`require-media-caption` is satisfied only by a `<track kind="captions" src="…">` pointing at a
VTT file containing **the words being said**. For a meaningful share of our media we do not have
those words, and the rule is unsatisfiable no matter what we type:

| Media | Transcript source | Captionable today? |
|---|---|---|
| Recorded sounds **with** a transcription | ✅ Google Speech-to-Text, stored + user-editable | **Yes** |
| Recorded sounds **without** one | ❌ confidence ≤ 0.3 → `transcription_uncertain`, or not yet processed | No |
| App sound effects (badge chime) | ❌ non-speech | Only as a `[chime]`-style description |
| Videos (9): goal videos, beta-feedback recordings, webcam preview | ❌ **no transcription field exists** | No |

Leaving it grandfathered would simply fail CI at the expiry date without anything having improved.
**A stub/empty `<track>` was explicitly rejected**: it advertises "captions available" to a deaf
user and then delivers nothing — worse than honestly having none.

What we *could* honestly do was done instead: every exposed player now has a descriptive
`aria-label` (commit `ecb5a9625`), so a screen-reader user at least knows what each player *is*
("Selected sound preview", "Goal video") rather than just hearing "audio".

## The opportunity — we already transcribe sounds and don't surface it

This is the part worth a roadmap slot. **The transcription pipeline already exists:**

- `app/models/button_sound.rb:14` — `after_save :schedule_transcription`
- `button_sound.rb:43-78` — sends the sound to Google Speech-to-Text; on `confidence > 0.3`
  stores `settings['transcription']` + `settings['transcription_confidence']`; otherwise sets
  `settings['transcription_uncertain']`
- `app/frontend/app/models/sound.js:30` — `transcription: attr('string')`
- `app/frontend/app/components/audio-recorder.hbs:21` — the transcription is **user-editable**
- `app/frontend/app/components/audio-browser.hbs:32-33` — already displayed under each sound

So for a large share of recorded sounds **we already have the spoken words** — we just never
expose them as captions. Turning that into real captions would be a genuine accessibility win,
not a lint workaround.

### Sketch of the work (not yet scoped/approved)
1. Generate a VTT from `sound.transcription` (single cue spanning the clip, or timed cues if we
   ever keep word offsets) and attach `<track kind="captions">` to the sound players.
2. Decide the honesty rules:
   - **Do not** caption when `transcription_uncertain` is set — a wrong caption of someone's
     speech is its own harm, especially for an AAC user's recorded voice.
   - Consider surfacing confidence, or only captioning user-confirmed/edited transcriptions.
3. Videos need a separate answer (no transcript source at all) — either a transcript feature or
   an accepted, documented exemption.
4. Re-enable `require-media-caption` for the sound players once they carry real tracks.

## Re-enabling the rule
Once sound players carry real caption tracks, re-enable `require-media-caption` in
`app/frontend/.template-lintrc.js` and let it grandfather only the remaining video cases.
