# EN Schema-2 Parity Gate

This file documents the Phase 1 (EN schema-2 migration) parity hard gate: the requirement
(TEST-01, TEST-02) that the schema-2 dataset and resolver reproduce today's English behavior
exactly, before any later phase in the 9-phase multilingual initiative touches the hardcoded
English fallbacks (`app/models/word_data.rb:773-796`, `word_data.rb:797,940`, and the
`app/frontend/app/utils/i18n.js` grammar helpers).

## What the gate proves

Three spec files together are the hard gate:

1. `spec/lib/language/parity_spec.rb` (lookback parity, TEST-01): `Language::Schema2Resolver`
   reproduces every committed `rules-en.snapshot.json` `tests[]` fixture's expected output by
   routing legacy inflection name to UD feature bundle (via `aliases`) to surface form (via
   `words-en.json` bundle-keyed `forms`, with regular/irregular EN morphology as a fallback), not
   by reading a verbatim `rules[]` surface literal for an alias-covered transformation.
2. `spec/lib/language/slot_parity_spec.rb` (compass-slot parity): a distinct check proving the
   schema-2 `slot_layouts` (independently authored from `aliases` per Plan 02) plus `aliases` plus
   `forms` reproduce the committed golden `inflection_locations` grid, so a materially wrong alias
   or slot mapping cannot cancel out the way a lookback-only check could. See "Limits of the
   mechanical gate" below for what this specific spec can and cannot currently prove given real
   data.
3. `spec/models/board_parity_spec.rb`: with `multilingual_grammar` off (the default), board-level
   `inflection_defaults` stamping is byte-identical to the legacy path across a sample of EN
   boards covering nouns, verbs, adjectives, a `translations` entry, and a manually set per-button
   `inflections` array.

Together these three specs are the required green state before any later phase modifies the
hardcoded English fallbacks.

## How to run the full gate

```
DB_USER=scotw RAILS_ENV=test bundle exec rspec spec/lib/language/parity_spec.rb spec/lib/language/slot_parity_spec.rb spec/models/board_parity_spec.rb
```

As of this plan, all three files pass: 27 examples, 0 failures.

## Committed baselines

- Lookback fixture count: 195, frozen at Plan 01 (`01-01-SUMMARY.md`). `parity_spec.rb` asserts
  this count directly, independent of the snapshot file's own length, so a silently dropped or
  added fixture fails loudly.
- Golden corpus size: 228,749 EN words (`inflection-locations-golden.json`'s
  `_corpus_word_count`), the full live `WordData` corpus snapshotted from staging and cross
  checked against production at Plan 01.
- Alias path share of the 195 lookback fixtures: 149 (76 percent) resolve through the
  aliases-to-bundle-to-form indirection; the remaining fixtures are 36 genuinely idiomatic
  subject-verb-agreement overrides (the "you_are" style to-be/do/have corrections, which have no
  alias equivalent and legitimately stay rule-driven) and 10 fixtures where no rule applies at all
  (the word passes through unchanged). `parity_spec.rb` asserts the alias share stays a material
  majority, guarding against a resolver that quietly stops exercising the alias table.

## The hard gate rule

Both parity suites (`parity_spec.rb` and `slot_parity_spec.rb`), plus `board_parity_spec.rb`, must
be green before any later phase of this initiative modifies `word_data.rb`'s Setting-rules branch
(lines 773-796), either hardcoded EN fallback branch (lines 797 and 940), or the `i18n.js` grammar
helpers (`pluralize`, `tense`, `comparative`, `superlative`, `verb_negation`, and the morphology
they drive). This is the documented entry gate to Roadmap Phase 2.

## Limits of the mechanical gate

The three specs above mechanically prove: alias completeness (every legacy inflection name maps to
a UD bundle, Plan 02), alias and slot_layout structural consistency (a materially wrong entry in
either table fails the compass-slot check rather than cancelling out), and reproduction of the
app's current behavior (the 195 lookback fixtures and the board-level stamping sample). They do
NOT prove the absolute UD-semantic correctness of each bundle string, meaning whether, say,
`present_participle` truly corresponds to `VerbForm=Part|Tense=Pres` in the Universal Dependencies
v2 feature inventory. That is a linguistic judgment call, confirmed by the human sign-off checkpoint
that follows this plan's automated tasks (see the plan's Task 4), not by these specs.

### A confirmed, disclosed data finding that shapes the compass-slot check

Plan 01 confirmed, cross-checked against both staging and production, that 0 of the 228,749 real
EN `WordData` rows have any populated `inflection_overrides`. This means every real word's
committed golden `inflection_locations` entry is uniformly `{"types": [...]}` with no compass-slot
values at all, and every real lexeme's `words-en.json` `forms` hash is also empty. As a direct
consequence, a compass-slot check that only samples real committed words compares an empty
schema-2 result to an empty golden result for every single word today, which is a true and useful
regression guard (it proves the resolver does not hallucinate non-empty slots for uncurated real
words) but cannot by itself prove the alias-to-slot_layout mapping is correct, since a wrong bundle
string would also miss the empty `forms` lookup and also produce an empty slot.

`slot_parity_spec.rb` addresses this directly and transparently: alongside the real-corpus
regression guard, it adds a synthetic-lexeme proof (hand-authored test lexemes with populated
`forms` keyed by the exact bundles `slot_layouts` references, injected via
`Schema2Resolver.resolve_slots`'s `words_index:` override) that a wrong alias or slot_layout entry
would visibly diverge on, and it explicitly demonstrates a corrupted bundle mapping being caught
rather than cancelling out. This synthetic check, not the real-corpus sample, is what currently
carries the T-05-02 (a self-consistent but linguistically wrong table shipping green) mitigation.
Once real curated `inflection_overrides` data exists in the app (via whatever future process
populates it), the real-corpus check becomes a genuine, non-vacuous proof on its own, with no code
change required.

### KNOWN_EXCEPTIONS: multi-type words

`SLOT_LAYOUTS` (Plan 02) models each part of speech's PRIMARY (single-type) compass scheme only,
matching what the legacy fallback grid does for a word that is only that one part of speech. The
legacy grid's secondary/multi-type extensions (word_data.rb lines 806-925), where, for example, a
noun that is also a verb gets extra verb-related slots layered onto the noun's primary scheme, are
not separately modeled by `slot_layouts`. `slot_parity_spec.rb` documents real, multi-type example
words from the committed corpus (`abandon`, verb also tagged noun and transitive verb; `3-d`,
adjective also tagged noun; `aboard`, adverb also tagged preposition, outside the five
`slot_layouts` categories entirely; `anybody`, pronoun also tagged noun; `a battery`, noun also
tagged "noun phrase") as a `KNOWN_EXCEPTIONS` list, with the reason for each. This list is not used
to skip anything mechanically today, because `resolve_slots` only ever considers a word's primary
part of speech (never attempting secondary-type slots), so these words' primary-type slots remain
valid regardless of their secondary types under today's all-empty real data. The list is
forward-looking documentation for whenever real per-word override data exists on a multi-type
word, at which point the legacy grid's secondary-type extensions could diverge from a schema-2
grid that never considers them. If this list ever grows large or surprising as real curated data
appears, that should be surfaced for review rather than silently absorbed into the exceptions list.

## Known gap: flag-ON runtime is a stub

`lib/language/schema2_resolver.rb` is a standalone resolver exercised only by the three parity
specs listed above. It is NOT wired into any flag-ON runtime seam:

- `app/models/word_data.rb`'s `inflection_locations_for` flag-ON branch is a minimal stub
  (`{'schema2_stub' => true}` per word), added in Plan 03.
- `app/models/board.rb` needed no change in Plan 03 and has none.
- `app/frontend/app/utils/i18n.js`'s `schema2_morph` seam and
  `app/frontend/app/utils/edit_manager.js`'s `schema2_rules_override` seam both fall straight
  through to the legacy hardcoded helpers regardless of the flag, added in Plan 04.

Turning `multilingual_grammar` ON today does not invoke this parity-proven resolver anywhere in
the running application. Wiring `Language::Schema2Resolver` into these runtime seams is Roadmap
Phase 2 work, not this milestone's. Any later phase planning should read this section first
rather than assume flag-ON already invokes real schema-2 resolution.
