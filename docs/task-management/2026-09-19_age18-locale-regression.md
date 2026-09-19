# Age-18 retention claim regressed in 12 locales

**Date:** 2026-09-19. **Branch:** `compliance/scot-age18-locale-regression-de4f7378` from
`origin/develop` at 7c3549a01.
**Status:** fact sheet and proposal written; red test next; proposal under adversary review.

## Problem

The public privacy page tells visitors in 12 non-English locales that children's data is
"automatically deleted at 18 or after two years of inactivity". That claim was retracted: the
English sentence says accounts and content are **not** automatically deleted solely because a user
turns 18. PR #922 (merged `ec03932e28bd`, 2026-09-03) fixed all 13 locales by setting the 12
non-English values to the `*** ` English fallback. The fix is gone on `develop`, `staging` and
`main` (production), and in the open release PR #1011.

## Diagnosis

The fix was reverted by PR #963's merge commit `4104b657b` (Traci Day, 2026-09-13), a merge of a
long-lived feature branch. Tracing `privacy_security_retention_children` in `es.json` through every
commit that touched it on develop:

| Commit | Value after |
|---|---|
| `9aa0007c0` (#625, 2026-07-17) | `*** ` + old English claim |
| `eec90591a` (#927, 2026-09-03) | `*** ` + corrected English (#922's content) |
| `4104b657b` (#963, 2026-09-13) | Spanish machine translation of the retracted claim |

Blast radius of that merge across the 12 locales, per locale: 58 keys added, 0 removed, 3 board-UI
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
- "#963's merge reverted #922": CONFIRMED by the value trace above.
- "No other corrected key was reverted": CONFIRMED by classifying every key #963's merge changed in
  all 12 locale files.
- "Other surfaces already carry the corrected text": CONFIRMED for `en.json`, `privacy.hbs:105`,
  `_privacy.html.erb:87` and `config/locales/*.yml` (the `retention_children` keys there describe AI
  log retention, a different topic). `docs/legal/DATA_RETENTION.md:50` still states the old claim;
  it is the frozen predecessor #922 deliberately left, so it is out of scope. The counsel review
  (`docs/legal/2026-08-30_minimum-necessary-privacy-retention-ai-use-counsel-review.md:237`) quotes
  the old claim in order to analyse it.
- "No open PR touches this key": CONFIRMED for #1026, #1011 and #909 (the three open PRs touching
  locales or privacy files).

## Proposal

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
`rspec` job), so a merge like #963 would fail the PR.

**Test and mutation.** Red: the spec fails on the current tree, naming all 12 locales. After the
fix: green. Mutation that must fail: restore one locale (for example `pl.json`) to its translation;
the spec must go red naming only that locale.

**Risks.**
- Non-English visitors see one English sentence in an otherwise translated section. Accepted; it is
  the state #922 shipped and the product already does this for untranslated keys.
- A future legitimate edit to the English sentence now fails CI until the 12 fallbacks are updated
  too. Intended: that propagation is exactly what failed here.

**Unresolved.**
- Production (`main`) shows the false claim now. This PR follows the normal flow (develop, then
  staging, then a release PR). Whether to also hotfix `main` is Scot's call.
- `docs/legal/DATA_RETENTION.md` still states the old claim as the frozen predecessor; unchanged.
