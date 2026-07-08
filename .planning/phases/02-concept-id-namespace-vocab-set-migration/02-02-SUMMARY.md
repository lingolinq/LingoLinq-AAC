---
phase: 02-concept-id-namespace-vocab-set-migration
plan: 02
subsystem: data
tags: [vocab, concept-id, core-lists, fringe-lists, rake, rspec, tdd]

# Dependency graph
requires:
  - phase: 02-concept-id-namespace-vocab-set-migration
    provides: "Plan 01's committed vocab snapshot (core_lists.snapshot.json, fringe_suggestions.snapshot.json) and the human-approved VOCAB-03/VOCAB-04 decision manifests (non-concept-classification.json, duplicate-concepts.json)"
provides:
  - "Language::VocabGenerator pure-module transform: snapshot + manifests -> concept-keyed vocab hash"
  - "rake vocab:schema2 task that writes/commits db/language/en/vocab-en.json deterministically"
  - "db/language/en/vocab-en.json: schema-2 vocab file (_schema:2, _type:'vocab'), 4 core sets + 58 fringe sets, 2285-concept registry, verbatim ext_members per set"
affects: [02-03, 02-04]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Additive concept layer over verbatim legacy arrays: every set carries both a clean 'concepts' view and a byte-identical 'ext_members' copy of the source, so a forward-looking transform never loses the ability to reconstruct legacy reader output exactly (mirrors Phase 1's alias-table-over-verbatim-rules discipline)"
    - "Registry dedup by construction: concept-id collapse (VOCAB-04) falls out naturally from building a Hash keyed by surface string across all sets in order, rather than needing a separate merge/lookup step against the duplicate manifest"
    - "Fail-closed accounting pass: after building sets, every ext_members surface is asserted to be either a classified non-concept or a registry concept, catching any future silent-drop regression"

key-files:
  created:
    - lib/language/vocab_generator.rb
    - lib/tasks/vocab_schema2.rake
    - db/language/en/vocab-en.json
    - spec/lib/language/vocab_generator_spec.rb
  modified: []

key-decisions:
  - "duplicate-concepts.json (VOCAB-04) is read per the plan's stated inputs but not consulted for merge logic: a cross/intra-set duplicate is, by definition, the identical surface string, so building the concepts registry as a straightforward ordered-dedup Hash collapses it automatically without needing occurrence-list lookups."
  - "NON_CONCEPT lookup matches both the exact original string (curly-apostrophe forms as they appear in the source) and a case-insensitive form, as a belt-and-suspenders safeguard against a future case-variant slipping through as a false concept."
  - "external_refs is left as an empty {} on every registry entry in this plan (CONCEPT-02 is explicitly optional/never-required); no wikidata_sense or cili_synset enrichment attempted here."

patterns-established:
  - "vocab_schema2_deep_sort / vocab_schema2_write_json in lib/tasks/vocab_schema2.rake mirror vocab_snapshot.rake's and language_snapshot.rake's determinism helpers for any future schema-emitting rake task."

requirements-completed: [CONCEPT-01, CONCEPT-02, VOCAB-01, VOCAB-02]

# Metrics
duration: ~45min
completed: 2026-07-07
---

# Phase 02 Plan 02: Concept-ID Namespace + Vocab-Set Generator Summary

**Built `Language::VocabGenerator` and `rake vocab:schema2`, minting LingoLinq's `concept_id` namespace (2285 distinct concepts) and migrating the 4 core arrays + 58 fringe categories from `lib/core_lists.json`/`lib/fringe_suggestions.json` into the concept-keyed `db/language/en/vocab-en.json` per schema Section 4.6 — every set carries both a clean `concepts` view and a byte-verbatim `ext_members` copy of the original source array.**

## Performance

- **Duration:** ~45 min
- **Completed:** 2026-07-07
- **Tasks:** 2 of 2
- **Files modified:** 4 (3 commits: RED spec, GREEN generator, rake task + generated JSON)

## Accomplishments

- `Language::VocabGenerator.vocab_for('en')` transforms the Plan 01 snapshot + manifests into a schema-2 vocab hash: 4 core sets (`default`, `project_core`, `unc_common_core`, `basic_core`, in source order) + 58 fringe sets (one per `fringe_suggestions.snapshot.json` category), each with `id`/`name`(/`url` for core)/`category` preserved verbatim from the source.
- Concept ids are literal surface strings, seeded from the core/fringe lists; the top-level `concepts` registry has 2285 distinct entries, each with an empty `external_refs: {}` (CONCEPT-02: optional, not populated in this plan).
- VOCAB-03: 40 non-concept entries (`+ed`, `adjectives`, `don't`, `do/does`, etc., per Plan 01's classification manifest) excluded from every `concepts` array and the registry, while remaining present in `ext_members`.
- VOCAB-04: 360 duplicate surfaces (e.g. `more`, `i`, `you`, `help` — each appearing in all 4 core lists) collapse to a single registry key each, by construction (ordered-dedup over surface strings).
- Every set carries a verbatim `ext_members` array — confirmed byte-identical to the corresponding `core_lists.snapshot.json`/`fringe_suggestions.snapshot.json` array for the `default` core set and the `animal` fringe category (spec assertion + rake verification one-liner) — the compatibility anchor Plan 03 reconstructs legacy reader output from and Plan 04 diffs against the golden.
- Fail-closed accounting: the generator raises if any source surface is neither a registry concept nor a classified non-concept; verified via a synthetic-data spec example.
- `rake vocab:schema2` produces a zero-byte `git diff` on re-run (determinism confirmed).

## Task Commits

Each task was committed atomically, following the plan's `tdd="true"` RED/GREEN gate for Task 1:

1. **Task 1 (RED): failing spec for Language::VocabGenerator** — `32d0e207c` (test)
2. **Task 1 (GREEN): Language::VocabGenerator implementation** — `5de9b0584` (feat)
3. **Task 2: rake vocab:schema2 + committed vocab-en.json** — `1c27f5e84` (feat)

## Files Created/Modified

- `lib/language/vocab_generator.rb` — pure module `Language::VocabGenerator`; `.vocab_for(locale, dir)` reads the 4 snapshot/manifest JSON files (`JSON.parse` only, no eval/Kernel#load/send — confirmed via grep) and returns the schema-2 vocab hash.
- `spec/lib/language/vocab_generator_spec.rb` — 11 examples covering set structure/order, verbatim `ext_members` byte-equality (core + fringe sample), concept-id literalness, VOCAB-03 exclusion, VOCAB-04 collapse, CONCEPT-02 empty `external_refs`, determinism, and fail-closed accounting.
- `lib/tasks/vocab_schema2.rake` — `namespace :vocab`, `task :schema2, [:locale]`; wraps the generator and writes `db/language/#{locale}/vocab-en.json` with the same deep_sort/pretty_generate determinism helpers as `vocab_snapshot.rake`/`language_snapshot.rake`; prints core/fringe/concept/excluded/collapsed counts.
- `db/language/en/vocab-en.json` — generated artifact: `_locale:'en'`, `_schema:2`, `_type:'vocab'`, 4 core sets + 58 fringe sets, 2285-entry `concepts` registry, every set carrying `concepts` + `ext_members`.

## Decisions Made

See `key-decisions` in frontmatter: (1) duplicate manifest read but not needed for merge logic since dedup is definitional; (2) non-concept matching is exact-string + case-insensitive for defense-in-depth; (3) `external_refs` intentionally left `{}` this plan.

## Deviations from Plan

None — plan executed exactly as written, including the `tdd="true"` RED/GREEN gate for Task 1 (spec committed failing first, confirmed `NameError: uninitialized constant Language::VocabGenerator`, then the implementation committed to turn it green).

## TDD Gate Compliance

- RED gate commit: `32d0e207c` (test) — spec committed while failing (`Language::VocabGenerator` did not yet exist).
- GREEN gate commit: `5de9b0584` (feat) — implementation added, all 11 examples pass.
- No REFACTOR commit was needed (no cleanup required after GREEN).

## Issues Encountered

None.

## Known Stubs

None. `external_refs: {}` is an intentional, documented CONCEPT-02 no-op for this plan (never a runtime dependency, per the design doc and this plan's objective), not a stub blocking the plan's goal — later phases may enrich it.

## Threat Flags

None. This plan's threat register (T-02.02-01 through T-02.02-04) covers exactly the surface introduced: static JSON-in/JSON-out transform, no network endpoints, no auth paths, no schema/trust-boundary changes beyond the already-reviewed snapshot/manifest inputs.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- `db/language/en/vocab-en.json` is committed, deterministic, and conforms to schema Section 4.6, with the concept namespace minted and the verbatim `ext_members` compatibility anchor in place.
- Plan 03 can now build the legacy-reader reconstruction (`WordData.core_lists`/`fringe_lists` byte-identical from `ext_members`) and wire in the concept-keyed view; Plan 04 can diff against the Plan 01 golden.
- No blockers identified.

## Self-Check: PASSED

- FOUND: lib/language/vocab_generator.rb
- FOUND: lib/tasks/vocab_schema2.rake
- FOUND: db/language/en/vocab-en.json
- FOUND: spec/lib/language/vocab_generator_spec.rb
- FOUND commit: 32d0e207c
- FOUND commit: 5de9b0584
- FOUND commit: 1c27f5e84

## Note on SUMMARY.md location

This project's `.planning/` directory is gitignored in the LingoLinq-AAC repo (`/.planning` in
`.gitignore`) per `PROJECT.md`'s documented "isolated GSD workspace" decision, and is normally
NOT committed except at milestone-archive time (`chore(v1.0): archive phase 1 SUMMARY.md
files...`). This plan was executed as a worktree-isolated parallel agent, which requires
SUMMARY.md to be committed before the worktree is torn down; it is force-added here as a
deliberate, documented exception to that convention (the same content should be reconciled with
the authoritative isolated GSD workspace at
`/home/scotw/gsd-workspaces/multilingual-language-layer/LingoLinq-AAC/.planning/` once this
worktree branch is merged back). The code deliverables
(`lib/language/vocab_generator.rb`, `lib/tasks/vocab_schema2.rake`, `db/language/en/vocab-en.json`,
the spec file) are committed normally (not gitignored), per the three commits listed above.

---
*Phase: 02-concept-id-namespace-vocab-set-migration*
*Completed: 2026-07-07*
