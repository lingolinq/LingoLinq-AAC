# create-board-new: a board made in another language must speak that language

Requested by Traci 2026-11-06. Direction chosen: keep #908's "author in the chosen language"
model, bring the Language picker back while `english_first_board_generation` is on, fix the
gaps below. Rejected: running Translate Boards on typed labels (wrong for people who type in
their own language, reverts #908).

Learnings consulted: "user create boards author in the communicator language", "create-board
label caches are keyed by label text", "Translate Boards must not send action tokens".

## Fact sheet

(a) Where the value is read
- Speech text: `button.vocalization || button.label`. CONFIRMED `utils/utterance.js:138`.
- Voice: `vocalization_locale` in `speak_raw_text`. CONFIRMED `utils/speecher.js:632,652`.
- Session locale on board load: stash wins in `routes/user/board-alt/index.js:85-96` and
  `routes/board/index.js:91-105`; only `override_*` wins in `routes/user/board-detail.js:502-510`.
- Server rewrite to `en`: only when `translations.blank?`. CONFIRMED `boards_controller.rb` create.

(b) Shapes of `model.locale` on create-board-new
- preferred_locale or 'en' from init (`create-board-new.js:112`, flag on).
- supervisee locale, or preferred on going back to self (`_apply_supervisee_authoring_locale`).
- NEW with the picker: any id in `locales`, including '' for "[Choose a Language]" and
  "Unspecified" (`create-board-new.js:759-767`).

(c) Cross-file claims, checked by running code (characterization spec, local test DB)
- `translate_set` ends with locale es, current_label/current_vocalization es, labels and
  vocalizations rewritten, `:space` kept. CONFIRMED.
- #908 payload ends with the same locale state; the button has no vocalization, which is fine
  because speech falls back to label. CONFIRMED.
- Header-only translations keep a blank board at es at model level. CONFIRMED.
- No `speak_text` caller passes `opts.locale`. CONFIRMED by grep; line 870 is a local iOS copy.

## Proposal

G1 blank board flips to en. `_build_authoring_translations` returns null for no buttons, and
it is only called inside the buttons block, so the server rewrite fires.
- A (chosen): return the header blob for no buttons and call it outside the buttons block.
- B: relax the server rewrite. Rejected: spec "rewrites ... when translations are blank"
  encodes that for legacy clients (Rule 14) and #908 kept it on purpose.

G2 speak language not saved for the session. create sets appState only; done_translating also
persists stashes. A stale `en` stash then wins in board-alt/board because the board carries en.
- A (chosen): `stashes.persist` both keys beside the existing appState sets, as `done_translating`.
- B: a shared appState helper. Rejected for now: six call sites to migrate, and the existing
  test's appState stub has no such method.

G3 no picker with the flag on. Render the existing ModernSelect in both flag states, keep the
hint when the flag is on. No new strings.
- Blank options: `setLocale('')` falls back to preferred or 'en' so '' is never saved.
- A deliberate pick is not overwritten by a later "who is this for" change (`authoring_locale_chosen`).

G4 preview speaks in the session voice. Add `opts.locale` to `speak_raw_text`, used only when
passed; preview passes `model.locale`.

## Risks
- After creating a Spanish board the session stays Spanish, so bilingual boards opened next show
  Spanish until something resets it. Same as Translate Boards.
- A Switch Languages override to en is not cleared, same as Translate Boards.
- Language lives under Advanced, below AI generation: generating first, then changing language,
  leaves labels in the old language.

## Open questions
- Should the picker move above AI generation? UI call for Traci.

## Tests and mutations
- Blank es board: model.translations header present. Mutation: restore `return null`.
- Session: stashes persisted. Mutation: drop the persist lines.
- setLocale('') keeps a real locale. Mutation: pass value straight through.
- Chosen locale survives supervisee change. Mutation: drop the early return.
- Picker renders with the flag on. Mutation: restore the {{else}}.
- speak_raw_text honours opts.locale, unchanged without it. Mutation: drop `opts.locale ||`.
- RSpec: create keeps es with header-only translations. Mutation: restore the rewrite condition
  to ignore translations.

## After adversarial review (2026-11-06)

Each finding checked against the code. Changes made to the proposal:
- G2 writes the stash only for non-English boards: every-create write defeated Switch Languages.
- Language moved to wizard step 1 (Advanced only appears after AI generation, so AI labels could
  never follow the pick). `advanced_hint_language` removed from all locales.
- Google notice shown beside the picker when the lookup applies, reusing the translate keys.
- Dropped images survive a language change (`dropped: true`).
- Blank boards send no English name, so `en` does not join their locales.
- `model.translations` always assigned, so a failed Spanish save cannot leak into a retry.
- Correction to fact (b): `JsonApi::User` sends no `locale`, so the supervisee branch never fires
  in production; supervisee boards stay in the creator's language unless picked.

Not changed, flagged to Traci:
- Basic view and the legacy board page treat the plain stash as an override, so going Home on an
  English home board then reopening shows English. Translate Boards behaves the same, and home
  state writes that stash (`app-state.js:1370`), so changing the route risks other flows.
- `WordData` translation does not use `PiiScrubber`, by decision: `docs/legal/SUBPROCESSORS.md` 5.8
  (LL-c38e7da48e) relies on the Google BAA plus disclosure, because scrubbing corrupts translation.
  An earlier note here called this an open gap; that was wrong. No change needed.

## Second round (2026-11-06): consistency work, after a second adversarial review

- Fix 1: `session_board_locale` is the one rule for Basic, Modern and legacy. The "stash wins in
  board-alt" line in the fact sheet above no longer applies.
- The session write on create is removed: routes now ignore the plain stash, so it only disturbed
  Switch Languages. Gap G2 is solved by the route rule instead.
- Home board saved language is not honoured, as in Modern: Speak Mode used to copy the viewed language
  onto it (now only on the home board, see Round 4), and other writers still pass the session language.
- `has_voice_for` asks `find_voice_by_uri`; a list check said yes on English-only online devices.
- Boards with no language (obf/stars, integrations) stay unset rather than being forced to `en`.
- Owner language shows on the owner step with both notices, and a supervisee with no language
  returns to the creator's language. Not sent on org rosters.

## Third round (2026-11-06): browser journeys and the final review

- Playwright (`board-language` project, local only) drove the real app. It found the owner dropdown
  never reached setForUserId: a write to the setter-less `for_user_id` threw first.
- Final red team found `speech: speecher` silenced board speech after leaving create-board in browsers
  without webkitSpeechRecognition. Renamed to `speech_output`; test covers teardown.
- The Language picker is one-way (`readonly`), so a change really clears lookups. A language change after
  labels exist now says the words stay. Supervisee language and owner rows need edit permission.
- Known and left: on the owner path the English lookup fires in the same render as the Google notice.
- Real Google lookup checked on 2026-11-06 with made-up words through `WordData.translate_batch`: es to en
  returned hat and cat, en to es returned sombrero. A no-token run minutes earlier returned nothing, so
  these did not come from cache. Under `op run`, load local test settings after 1Password resolves, or
  Rails stops at boot with `bad decrypt`.

## Round 4: full review and deep dive (2026-11-06)

The fact sheet, risks and open questions near the top were written first and are superseded here: the
session is no longer written on create, Language is on step 1 not under Advanced, and `JsonApi::User` now
sends `locale` to people with edit rights.

Two reviewers read the whole branch, then each claim was run. Results:
- Language on supervisee rows is not a new disclosure: view-only and modeling-only people already get
  `preferences.home_board.locale` from `GET /users/:id`. Only the code comment was wrong.
- Goal summaries do reach a modeling-only caller through another supporter's caseload. Older than this
  branch, narrow, filed as #1277.
- Speak Mode wrote the viewed language onto the home board in two places, though the comment at the second
  says this is for the home board only. Both are now guarded on the home board's key.
- A copy with no translations was rewritten to `en` by boards#create; copies are now exempt.
- The copy dialog seeded from the leftover session language, which crashed `create_copy` on a plain English
  board. The dialog now uses the session rule, and `create_copy` changes language only if something was
  translated, buttons or name, matching `Relinking#update_default_locale!`.
- A blank board no longer sends its name to Google.
- Switch Languages losing at Speak Mode entry is unchanged from `develop`. A guard in `home_in_speak_mode` was
  tried and removed: it put a supporter's Switch language on a communicator under Speak As, and left the plain
  stash null, which switches off the level block at `app-state.js:1688`. The reorder in `session_board_locale`
  was rejected for the same Speak As reason. Traci decided Switch Languages follows the person; the reviewed
  owner design for that is recorded below.

Not done, and why:
- Clamping `home_board.locale` on the server: `spec/models/user_spec.rb:4871` pins storing a language the
  board lacks, and tests are not edited to fit a fix. Seven other client writers still pass `label_locale`.
- Route test for board-detail: its setup starts the board build and shared edit state, so it leaks. The
  local Modern journeys cover that page.

`board-language-rule-test` leaked its stand-in controller through `editManager`, which failed unrelated speak
tests when run together. Targeted runs had hidden this. It now restores the shared state.
