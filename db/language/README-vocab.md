# db/language/en/ (vocab files) -- Phase 2 (concept-id namespace + vocab-set migration), Plan 01

This documents the vocab-specific files committed under `db/language/en/` by `rake vocab:snapshot`.
(The Phase 1 EN schema-2 migration files -- `words-en.snapshot.json`, `rules-en.snapshot.json`,
`rules-en.upstream.json`, `inflection-locations-golden.json` -- are documented separately in
`db/language/README.md` and are untouched by this task.)

## Files

| File | What it is | Source |
|------|------------|--------|
| `en/core_lists.snapshot.json` | Verbatim pinned copy of `lib/core_lists.json` (the 4 named core vocab-set arrays: `default`, `project_core`, `unc_common_core`, `basic_core`). Key-sorted for determinism; array/word ORDER preserved exactly (order is load-bearing -- `default_core_list` is positional priority). | `lib/core_lists.json`, via `rake vocab:snapshot`. |
| `en/fringe_suggestions.snapshot.json` | Verbatim pinned copy of `lib/fringe_suggestions.json` (the `common_fringe` category-nested fringe word list). Same determinism/order guarantees. | `lib/fringe_suggestions.json`, via `rake vocab:snapshot`. |
| `en/vocab-golden/core_lists.reader-golden.json` | Captured, pre-migration `WordData.core_lists` output verbatim -- the before-baseline for Plan 04's flag-off/flag-on parity gate. | Live `WordData.core_lists` (after `WordData.clear_lists`), via `rake vocab:snapshot`. |
| `en/vocab-golden/fringe_lists.reader-golden.json` | Captured, pre-migration `WordData.fringe_lists` output verbatim. | Live `WordData.fringe_lists`, via `rake vocab:snapshot`. |
| `en/vocab-golden/derived-readers.reader-golden.json` | Captured `WordData.default_core_list`, `WordData.basic_core_list`, and the sorted key list of `WordData.standardized_words` -- the readers *derived* from `core_lists`. | Live `WordData` derived readers, via `rake vocab:snapshot`. |
| `en/non-concept-classification.json` | **VOCAB-03 decision manifest.** Every entry in the `default` list that is NOT an ordinary vocabulary concept, enumerated (never hardcoded) and bucketed into `morpheme_marker` (leading/trailing `+`), `pos_label` (exact POS category label), `contraction` (contains an apostrophe), or `slash_form` (contains `/`, e.g. `do/does`). Authoritative input to Plan 02's generator -- it excludes these by data reference, never by silent heuristic. | Derived from `core_lists.snapshot.json`'s `default` list, via `rake vocab:snapshot`. |
| `en/duplicate-concepts.json` | **VOCAB-04 decision manifest.** Every surface string occurring in more than one `(list_id, index)` position across or within the 4 core arrays, with its full `occurrences` list and `count`. Entries already classified as non-concept are excluded from the main `duplicates` map and recorded separately under `non_concept_repeats`. Authoritative input to Plan 02's generator for single-`concept_id` resolution. | Derived from `core_lists.snapshot.json`, via `rake vocab:snapshot`. |

## Regeneration

All seven files above are regenerated ONLY by:

```
DB_USER=scotw RAILS_ENV=development bundle exec rake vocab:snapshot
```

Re-running on unchanged inputs (unchanged `lib/core_lists.json` / `lib/fringe_suggestions.json`,
unchanged `WordData` reader behavior) produces byte-identical output on all seven files
(deterministic, key-sorted serialization, array order preserved) -- any `git diff` after a re-run
is a real, reviewable data or behavior change, never formatting noise.

## Why the classification/duplicate manifests are data, not generator logic

Per CLAUDE.md RULE #0, correctness must be verified against evidence, not guessed. The VOCAB-03
non-concept classification and VOCAB-04 duplicate resolution are real-data decisions with
consequences (a wrong classification silently mis-mints a concept; a wrong duplicate merge
silently collapses two distinct concepts). Emitting them as committed, human-reviewable JSON --
gated by this plan's blocking human checkpoint -- means Plan 02's generator is a pure, auditable
application of already-approved decisions, not a place where classification bugs can hide.

## Privacy

Source is static AAC core/fringe vocabulary word lists only. No student, patient, board, or
account data exists in `lib/core_lists.json` / `lib/fringe_suggestions.json` or in any reader
output captured here.
