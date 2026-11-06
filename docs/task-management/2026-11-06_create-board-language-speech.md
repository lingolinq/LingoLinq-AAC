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
- `WordData` translation does not use `PiiScrubber`. Pre-existing; a compliance decision.
