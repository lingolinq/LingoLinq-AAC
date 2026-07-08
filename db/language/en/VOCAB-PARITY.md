# Concept-ID Namespace + Vocab-Set Migration Parity Gate

This file documents the Phase 2 (concept-id namespace + vocab-set migration) parity hard gate:
the requirement (TEST-01, TEST-02) that the concept-keyed `vocab-en.json` reproduces every legacy
core/fringe vocabulary surface with zero behavior change, before any later locale phase in the
9-phase multilingual initiative builds core-vocabulary transfer on the concept-id layer.

## What the gate proves

Two spec files together are the hard gate:

1. `spec/lib/language/vocab_parity_spec.rb` (concept-attribution + reachability, TEST-01):
   iterates every word/phrase in every legacy core array (`core_lists.snapshot.json`) and every
   fringe category (`fringe_suggestions.snapshot.json`), the exhaustive source surface set, not a
   sample, and asserts each surface is EITHER a key in `vocab-en.json`'s `concepts` registry
   (attributed to exactly one `concept_id`) OR a member of the Plan 01 non-concept classification
   manifest (`non-concept-classification.json`). It also asserts every set's `ext_members` deep
   equals its source array (verbatim preservation), every duplicate-manifest surface
   (`duplicate-concepts.json`) collapses to exactly one registry entry (VOCAB-04), every
   non-concept-manifest entry is absent from the registry (VOCAB-03), and a closed coverage
   equation (`registry_concept_count + distinct_non_concept_count ==
   distinct_source_surface_count`) with the counts frozen as constants independent of the
   committed files' own lengths, so a corrupted or truncated baseline fails loudly rather than
   silently redefining the baseline.
2. `spec/models/word_data_vocab_parity_spec.rb` (reader-output parity, COMPAT confirmation):
   asserts `WordData.core_lists`, `fringe_lists`, `default_core_list`, `basic_core_list`, and
   `standardized_words` are deep-equal to the committed Plan 01 pre-migration reader golden
   (`vocab-golden/core_lists.reader-golden.json`, `fringe_lists.reader-golden.json`,
   `derived-readers.reader-golden.json`) on BOTH the flag OFF (unchanged `File.read`) and flag ON
   (`Setting['vocab/en']` reconstruction) paths, and that the two direct-file callers
   (`PredictionLibrary.export_spelling_words!`, `AiPredictionGenerator`'s starter list) produce
   identical output across both flag states.

Together these two specs are the required green state before any later locale phase (Spanish
onward) builds core-vocabulary transfer on the concept-id layer.

## How to run the full gate

```
DB_USER=scotw RAILS_ENV=test bundle exec rspec spec/lib/language/vocab_parity_spec.rb spec/models/word_data_vocab_parity_spec.rb
```

As of this plan, both files pass: 21 examples, 0 failures.

## Coverage counts

Sourced from Plan 01 (`02-01-SUMMARY.md`) and Plan 02 (`02-02-SUMMARY.md`), and asserted directly
by `vocab_parity_spec.rb`'s frozen constants:

- Distinct registry concepts: 2285
- Distinct classified non-concepts (VOCAB-03: contraction, morpheme_marker, pos_label,
  slash_form): 40
- Distinct source surfaces (union of every core array entry and every fringe category entry):
  2325 (2285 + 40, the closed coverage equation)
- Core sets: 4 (`default`, `project_core`, `unc_common_core`, `basic_core`)
- Fringe sets: 58 (one per `fringe_suggestions.snapshot.json` category)
- Collapsed-duplicate surfaces (VOCAB-04, a surface occurring in more than one core-array
  position, collapsed to a single registry entry): 360, plus 2 non-concept repeats (`+er`,
  `don't`) tracked separately in `duplicate-concepts.json`'s `non_concept_repeats` since they are
  already excluded from the registry by VOCAB-03 and are not concept duplicates.

## The hard gate rule (TEST-02)

Both parity specs (`vocab_parity_spec.rb` and `word_data_vocab_parity_spec.rb`) must be green
before any later phase of this initiative (Spanish onward, Roadmap Phases 3 to 7) builds
core-vocabulary transfer on top of the `concept_id` namespace, or modifies `WordData.core_lists`,
`fringe_lists`, the `vocab-en.json` format, or the flag-gated reconstruction seam in
`app/models/word_data.rb`. This is the documented entry gate to those later phases, mirroring
Phase 1's `PARITY.md` hard-gate rule for the schema-2 inflection migration.

## Known limits of the mechanical gate

The two specs above mechanically prove: full reachability of every legacy surface (nothing
silently lost), single-id attribution or explicit non-concept classification for every surface,
verbatim preservation of the source arrays, and byte-identical reader output on both flag states
for every vocab reader and the two direct callers. They do NOT certify:

- The semantic correctness of the concept-id CHOICES themselves, that is, whether a given literal
  lemma string is the right language-neutral concept identifier for later locale phases to key
  their own vocabulary onto. That is a linguistic and product judgment call, confirmed by the
  human sign-off checkpoint that follows this plan's automated tasks, not by these specs.
- The completeness of `external_refs` (wikidata_sense, cili_synset). `external_refs` is
  intentionally left as an empty object on every registry entry in this phase (CONCEPT-02 is
  explicitly optional, never a required dependency per the design doc's Section 8 resolution).
  Populating it, if ever done, is a future-phase concern and does not affect this gate.
- The VOCAB-03 non-concept classification's semantic completeness for any future dataset growth.
  The gate confirms the CURRENT committed classification is internally consistent (no classified
  non-concept in the registry, no unclassified surface silently dropped); it cannot detect a real
  vocabulary word that a human misclassified as non-concept when the manifest was authored. That
  review is also part of the human sign-off checkpoint.

## Note on the reader golden's live shape

The `vocab-golden/*.reader-golden.json` files use a top-level `lists` key (not `payload`) holding
the exact `WordData.core_lists` / `WordData.fringe_lists` array. Both parity specs, and Plan 03's
own specs, read `JSON.parse(...)['lists']` when comparing against these files.
