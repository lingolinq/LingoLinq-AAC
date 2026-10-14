# 2026-09-29: bring #909 back to develop and fix the privacy locale pins it broke

## Problem

Staging release PR #1082 failed `rspec` with 3 failures, all in
`spec/lib/privacy_locale_english_pins_spec.rb`. The staging tip itself (`6052b894a`, the #909
merge) was already red on `rspec`; `develop` alone was green.

#909 (district-sponsored AI privacy and consent language) was opened against `staging` on
2026-09-02 and was green then. #1027 added the pins spec on 2026-09-19. #909 merged into `staging`
on 2026-09-28 without a re-run against the current base, so the combination was never tested.

## Facts

- CONFIRMED: #909 changed three `privacy.hbs` keys in `public/locales/en.json`:
  `privacy_special_coppa_v2`, `privacy_special_ai_consent_intro`, `privacy_special_ai_consent_outro`
  (`git diff origin/develop HEAD -- public/locales/en.json`).
- CONFIRMED: the 12 non-English locales still carried translations of the old English for the two
  `ai_consent` keys, and the old English fallback for `coppa_v2`, a key in
  `WordData::ENGLISH_PINNED_LOCALE_KEYS` (spec failure output, CI job 109273661412).
- CONFIRMED: the spec's `PRIVACY_LOCALE_CONTENT_PINS` entry for `coppa_v2` still held the old English.
  Scot confirmed on 2026-09-29 that #909's English is the approved wording, which is what
  authorizes changing the pin.
- CONFIRMED: `config/locales/es.yml` has none of the seven `ai_consent` disclosure keys #909 changed
  in `en.yml`, and neither `lib/lingo_linq/article50_disclosures.rb` nor
  `lib/lingo_linq/ai_consent_disclosures.rb` carries the old wording (grep, 2026-09-29).

## Change

1. Merge `origin/staging` into a branch from `develop`, so #909 reaches `develop`.
2. Set the three keys to `*** ` + the new English in all 12 non-English locales (the #1027 pattern:
   `i18n.js` renders the template's English for a `*** ` value).
3. Update the `coppa_v2` content pin to the approved English.

## Verification

- Before: the pins spec failed locally with the same 3 failures as CI.
- After: the pins, `ai_disclosure_surfaces` and `feature_flags` specs pass (75 examples, 0 failures).
- Falsified: restoring the old `de.json` makes the pins spec fail again (2 failures naming `de.json`).
