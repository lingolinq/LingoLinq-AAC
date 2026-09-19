# Age-18 retention claim regressed in 12 locales

**Date:** 2026-09-19. **Branch:** `compliance/scot-age18-locale-regression-de4f7378` from
`origin/develop` at 7c3549a01.
**Status:** fixed on this branch; guard falsified; awaiting PR review. Scope widened from one key to
three (see "Adversary review of the proposal").

## Problem

The public privacy page tells visitors in 12 non-English locales that children's data is
"automatically deleted at 18 or after two years of inactivity". That claim was retracted: the
English sentence says accounts and content are **not** automatically deleted solely because a user
turns 18. PR #922 (merged `ec03932e28bd`, 2026-09-03) fixed all 13 locales by setting the 12
non-English values to the `*** ` English fallback. The fix is gone on `develop`, `staging` and
`main` (production), and in the open release PR #1011.

## Diagnosis

The fix was undone inside a long-lived feature branch, then carried to develop. At `1c2bb2333`
(2026-09-04, "Merge origin/staging into traci/fix/restore-speak-options") the first parent had the
machine translation, the second parent (staging) had #922's `*** ` fix, and the conflict resolution
kept the translation. PR #963 squash-merged that branch into develop as `4104b657b` on 2026-09-13
(one parent: a squash, not a merge), and the value reached staging and then `main` via release #978
on 2026-09-15. Tracing `privacy_security_retention_children` in `es.json` on develop:

| Commit | Value after |
|---|---|
| `9aa0007c0` (#625, 2026-07-17) | `*** ` + old English claim |
| `eec90591a` (#927, 2026-09-03) | `*** ` + corrected English (#922's content) |
| `4104b657b` (#963 squash, 2026-09-13) | Spanish machine translation of the retracted claim |

Blast radius of that squash across the 12 locales, per locale: 58 keys added, 0 removed, 3 board-UI
strings reworded, and exactly **one** key went from a `*** ` fallback back to a translation:
`privacy_security_retention_children`. No other corrected key was reverted.

Nothing caught it because no test pins this key. The disclosure guard
(`spec/lib/lingo_linq/ai_disclosure_surfaces_spec.rb`) matches English claim phrases, and a
translated claim matches none of them.

## Fact sheet

**(a) Where is the value read?**
- `app/frontend/app/utils/i18n.js:447-451`: `lang_str` is the preferred locale's value, else the
  fallback locale's. If it starts with `*** `, it is ignored and `str` (the template's inline English
  default) is rendered. CONFIRMED (`i18n.js:448`).
- The only template call is `app/frontend/app/templates/privacy.hbs:105`. Its inline default is
  byte-identical to `public/locales/en.json`'s value. CONFIRMED (compared programmatically).
- The fallback locale is the base language (`es` for `es-MX`). CONFIRMED
  (`app/frontend/app/initializers/attempt_lang.js:37`).
- The server-rendered page `app/views/shared/_privacy.html.erb:87` is hard-coded English and already
  corrected. CONFIRMED (grep on develop).

**(b) What shapes can the value hold, and who writes each?**
1. `*** <English>`: renders the English default. Writer: `i18n_generator.rb:337,349` for missing
   keys; #922 by hand.
2. A translation: renders the translation. Writers: the #901 machine-translation pass, and merges
   that take a branch's copy (#963).
3. `translation [[ English`: renders the part before `[[`. Writer: annotated translations.
4. Key absent: falls back to the base-language file, then to the template default.
   `i18n_generator.rb` re-adds it as shape 1 on the next run.
The generator never overwrites an existing value (`json[key] || "*** ..."`), so shapes 2 and 3
persist through every regenerate. CONFIRMED (`i18n_generator.rb:337,349`).

**(c) Cross-file claims.**
- "#963 carried the revert of #922 to develop": CONFIRMED by the value trace above; the revert itself
  is the conflict resolution at `1c2bb2333` (parents `4201a31fb`, `cf5004909`).
- "No other corrected key was reverted": CONFIRMED by classifying every key #963's squash changed in
  all 12 locale files.
- "Other surfaces already carry the corrected text": CONFIRMED for `en.json`, `privacy.hbs:105`,
  `_privacy.html.erb:87` and `config/locales/*.yml` (the `retention_children` keys there describe AI
  log retention, a different topic). `docs/legal/DATA_RETENTION.md:50` still states the old claim.
  CORRECTED after review: it is not only a frozen predecessor. It is the git mirror and "living
  source" of DOC-52c8c33583, "Data Retention Schedule (branded)", status `published` in the
  `school-dpa-package`, `soc2-evidence` and `compliance-records-set-2026-06` bundles
  (`audit-reports/DOCUMENT-REGISTER.json`). Attested; Scot-only; not changed here. The counsel review
  (`docs/legal/2026-08-30_minimum-necessary-privacy-retention-ai-use-counsel-review.md:237`) quotes
  the old claim in order to analyse it.
- "No open PR touches this key": CONFIRMED for #1026, #1011 and #909 (the three open PRs touching
  locales or privacy files).

## Proposal (as written before the adversary review; see the review section below for changes)

**Candidate A (proposed): restore #922's shape.** Set all 12 non-English values to `*** ` + the
current `en.json` value. Visitors in those locales see the corrected English sentence. This is the
shape the generator itself writes, it is mechanically checkable, and it avoids shipping an
unreviewed machine translation of compliance text (the LL-400adcead5 class).

**Candidate B: translate the corrected sentence into 12 languages.** Better for non-English
readers, but every translation of a legal claim needs human review in that language, which no
one on the team can do for most of the 12. An unreviewed translation of retention copy is how the
wrong claim was introduced in the first place. Rejected for this fix; a reviewed translation can
replace the fallback later, together with an update to the guard.

**Candidate C: delete the key from the 12 files.** Also renders English (shape 4). Rejected: the
next generator run re-adds it as `*** ` + the template default, so C converges on A with extra churn,
and an absent key is harder to guard than a pinned value.

**Guard (the part that stops a recurrence).** A new spec,
`spec/lib/privacy_locale_english_pins_spec.rb`, pins a list of compliance keys (one today) so that in
every non-English `public/locales/*.json` the value must equal `*** ` + the `en.json` value. It also
pins that the `en.json` value equals the `privacy.hbs` inline default, since that default is what
non-English visitors actually see. CI runs the full RSpec suite (`.github/workflows/ci.yml`, the
`rspec` job). CORRECTED after review: this fails any PR whose CI runs after the spec lands. It does
not stop a long-lived PR whose last green run predates it, because neither `develop` nor `main`
requires branches to be up to date (`required_status_checks.strict` is false on both; `main` has
`enforce_admins` on, `develop` does not). That is the #963 shape.

**Test and mutation.** Red: the spec fails on the current tree, naming all 12 locales. After the
fix: green. Mutation that must fail: restore one locale (for example `pl.json`) to its translation;
the spec must go red naming only that locale.

**Risks.**
- Non-English visitors see one English sentence in an otherwise translated section. Accepted; it is
  the state #922 shipped and the product already does this for untranslated keys.
- A future legitimate edit to the English sentence now fails CI until the 12 fallbacks are updated
  too. Intended: that propagation is exactly what failed here.

**Unresolved (pre-review; superseded by "Unresolved (for Scot)" at the end).**
- Production (`main`) shows the false claim now.
- `docs/legal/DATA_RETENTION.md` still states the old claim.

## Adversary review of the proposal (2026-09-19)

Verdict: proceed with Candidate A, with changes. 7 findings; each checked here.

1. **High, applied.** Two more keys on the same page were stale the same way (English corrected on
   2026-07-17 by #625; the machine-translation pass translated the old English, which the generator
   never refreshes). Verified by comparing each translation's recorded `[[ ` source with `en.json`:
   - `privacy_security_retention_ai_logs`, 11 locales (all but `es`): "audit record retained for 2
     years"; English says it is deleted with the account.
   - `privacy_special_coppa_v2`, all 12: "any use of AI features, including AI-assisted board
     generation, requires verifiable parental consent"; English limits that to AI word prediction and
     AI-drafted evaluation summaries and says board suggestions are handled separately, which the
     adjacent `privacy_special_ai_board_suggestions_note` then states. `es` for `ai_logs` had a current
     source, but it came from the #927 alignment commit, not a reviewed translation, so it is pinned too.
   Three `pp_third_party_*` keys also have stale sources, with cosmetic wording changes only; not
   changed.
2. **High, flagged for Scot.** DOC-52c8c33583 (published retention schedule sent to districts) is
   sourced from `DATA_RETENTION.md`, which still says "automatic purge at age 18".
3. **High, flagged for Scot.** Production serves the false claim (`main` since release #978,
   2026-09-15), and release PR #1011 carries it.
4. **Medium, applied.** The guard pinned propagation, not content. Added `CONTENT_PINS`: what each
   English sentence must and must not say.
5. **Medium, applied.** `WordData.translate_locale_batch` machine-translates every `*** ` value, the
   exact pinned shape. Added `WordData::ENGLISH_PINNED_LOCALE_KEYS` and a skip, with a red test.
   Kept on the model rather than in `lib/`, because Zeitwerk does not autoload `lib/` in Resque workers
   (`config/application.rb`, the `RESQUE_WORKER` guard) and workers load `WordData`.
6. **Low, applied.** "Merge commit" was wrong: `4104b657b` is a squash; see Diagnosis.
7. **Low, applied as a stated choice.** The guard is stricter than the runtime for a locale file
   missing the key; the spec header says so on purpose.

Not applied: an evidence note on finding LL-933e61efd7. Open PR #1026 is editing that same finding
(retitle), and the register is high-contention; the evidence goes in this PR's body instead.

## Verification

- Red first: guard failed naming all 12 locales for the age-18 key (a26856743), then all three
  fallback checks once extended; rake test failed with the pinned key in the translation request.
- Green: `privacy_locale_english_pins_spec`, `word_data_spec`, `ai_disclosure_surfaces_spec`:
  103 examples, 0 failures, 1 pre-existing pending (a body-less `it` in `word_data_spec.rb`, line 974
  at this branch's head).
- Falsified on the committed tree, restored from a saved copy after each:

| Mutation | Result |
|---|---|
| `pl.json` age-18 value back to its translation | 1 failure naming only `pl.json` |
| `de.json` COPPA value back to its translation | 1 failure naming only `de.json` |
| retracted English in `privacy.hbs`, `en.json` and all 12 fallbacks together | 1 failure, content pin |
| translator skip removed | rake test red, pinned key sent |

- Locale diff: 36 lines in 12 files, 3 per file; `en.json` unchanged. The age-18 lines are
  byte-identical to #922's.

## Unresolved (for Scot)

- **Production.** `main` has served the false claims since 2026-09-15. Recommendation: once this
  merges to develop, cherry-pick it onto release PR #1011's branch before #1011 merges, so the next
  release carries it; or use the CONTRIBUTING hotfix path off `main` if the release is not imminent.
  Not done here: #1011 is another session's release branch.
- **DOC-52c8c33583 / `DATA_RETENTION.md`.** Published district-facing schedule still states the
  age-18 purge. Needs a successor or withdrawal from the bundles, and the attested compliance program
  (`docs/legal/2026-09-14_compliance-program.md`) still points to `DATA_RETENTION.md` as the schedule.
- **LL-933e61efd7.** Already names the age-18 transition and says it must cover the 12 locale files.
  Evidence for it is this PR; closing it is Scot's call.
- **Reviewed translations.** The three keys show English to non-English visitors until someone
  reviews a translation; then remove the key from `WordData::ENGLISH_PINNED_LOCALE_KEYS` in that PR.

## PR review round 1 (senior-dev, head b1f0977c9)

- **High, fixed.** My translator skip made `extras:translate_ui_locales` loop forever. The loop in
  `lib/tasks/extras.rake` (the `extras:translate_ui_locales` task) stops only when no eligible `*** `
  value is left, and eligibility excludes only keys in `nopes`. The batch skipped pinned keys before
  building its request, so they never reached `nopes`, and every locale holds three of them. My test
  exercised one batch call, never the loop. Red first: a rake-level spec in
  `spec/lib/tasks/translate_ui_locales_spec.rb` failed with "did not terminate: 6 batches,
  nopes=[]". Fix: `translate_locale_batch` seeds `nopes` with the pinned keys, so they are skipped and
  returned; the separate condition was removed, leaving one mechanism. Falsified: with the seeding
  removed, both the rake test and the batch test fail.
- **Low, fixed.** Stale pending locator (the line moved when this branch added tests).
- **Low, fixed.** `CONTENT_PINS` renamed `PRIVACY_LOCALE_CONTENT_PINS` (it is a top-level constant).
- **Low, fixed.** Shipping a reviewed translation no longer drops the English content check: content
  pins are a separate list that must cover every pinned key; the fallback example is defined only for
  pinned keys. Falsified: unpinning the age-18 key and restoring the retracted English everywhere
  still fails the content check (13 examples, 1 failure).

## Adversary review of the PR (batch 1, head b1f0977c9)

- **Medium, already fixed in 32e1b98b3.** The translator loop hang (same finding as the senior-dev
  High). Cosmetic, not changed: the rake's final "leftover *** (Google echo/fail)" count now includes
  the three pinned keys.
- **Medium, applied.** The guard covered 3 keys; the root cause (English corrected, translation left
  stale) is open for every privacy string. Added a page-wide check: every `{{t}}` key in
  `privacy.hbs`, in every non-English locale, must be a `*** ` value or a translation whose recorded
  `[[ ` source equals the current `en.json` value. Measured first: 102 keys x 12 locales = 50 `*** `,
  1,174 current translations, 0 stale, 0 unsourced, 0 missing. Falsified: the pre-fix locale files
  make it list all 35 stale entries (12 + 11 + 12); correcting the English of the unrelated `legal`
  key without re-translating makes it fail naming 11 locales, with the pinned checks still green.
- **Medium, applied.** Overclaim about the gate; see the corrected paragraph under Proposal.

## Adversary review of the PR (batch 2, head b1f0977c9)

Verdict: request changes, one blocker (the loop, fixed in 32e1b98b3) plus softened gate wording (done).

- **Medium (legal judgment), for Scot and counsel.** The English fallback is better than a false
  translation but is not a translation: EDPB WP260 rev.01 expects translations where the site targets
  speakers of a language, and the de/fr/pl/ga UI suggests it does. For non-English readers the
  retention statement also moves from "deleted at 18" to "not deleted at 18" (less protective), while
  `privacy.hbs` keeps "Last Updated: August 30, 2026" and promises notice of material changes. The
  page has no "English version governs" clause. Needs: an owner and date for reviewed translations
  of the three keys, and counsel on whether this needs a Last Updated bump, a notice, or a
  governing-language clause.
- **Low, applied.** Pattern pins passed English paraphrases that restate the retracted claims. Now
  the exact reviewed English is pinned. Falsified in a scratch export of be5f6c31c: the reviewer's
  paraphrases, applied consistently to the template, `en.json` and all 12 fallbacks, fail 2 examples.
- **Low, applied to the PR body.** Production steps: a scratch cherry-pick of the code commits applied
  cleanly onto #1011's head and onto `main`; the task-log and learnings files conflict, so drop those
  hunks; the loop fix must travel too; pushing to #1011 resets its required review and re-runs CI.
  Also, already-shipped Cordova and Electron builds carry a copy of `public/locales` (copied by
  `extras:mobile` and `extras:desktop`) and keep the false JSON until rebuilt.

Dismissed by the reviewer after checking: `coppa_parent_email_required` translations hard-code 13,
which is correct.
