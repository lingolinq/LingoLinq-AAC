---
phase: 01-en-schema-2-migration
plan: 05
subsystem: language-schema
tags: [schema-2, universal-dependencies, ud, parity, resolver, en-inflections, hard-gate]

# Dependency graph
requires:
  - phase: 01-en-schema-2-migration
    provides: "01-01 (snapshot + golden baseline), 01-02 (LEGACY_ALIASES/SLOT_LAYOUTS + rules-en.json/words-en.json), 01-03 (multilingual_grammar flag + backend gating), 01-04 (frontend gating)"
provides:
  - "lib/language/schema2_resolver.rb (Language::Schema2Resolver) -- COMPLETE, committed, standalone parity resolver"
  - "spec/lib/language/parity_spec.rb -- COMPLETE, committed, green (8 examples), proves all 195 lookback fixtures"
  - "spec/lib/language/slot_parity_spec.rb -- COMPLETE, committed, green (13 examples), proves compass-slot parity (real-corpus + synthetic)"
  - "spec/models/board_parity_spec.rb -- COMPLETE, committed, green (6 examples), board-level flag-off parity"
  - "db/language/en/PARITY.md -- COMPLETE, committed, documents the hard gate + UD-caveat + known-gap"
  - "Human UD-semantic sign-off -- APPROVED (Scot, Task 4 checkpoint)"
affects: [phase-2-and-beyond (concept-id layer, es/fr/pt/de/fi/ar locale phases, code-switching, fallback retirement)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Resolver dispatches surface-form generation on the UD BUNDLE string, never the legacy inflection name directly, so a wrong aliases[name] entry changes the bundle and visibly breaks the fixture/spec that exercises it -- this is the mechanical fix for the near-tautology finding this plan exists to close"
    - "Rule selection mirrors the real app's two-mechanism design: an override-type rule only wins if its OWN overrides hash keys the literal current word (to-be/do/have subject-verb-agreement idioms); otherwise a verb/noun/pronoun-type rule only wins if its type equals the CURRENT WORD's own part of speech (not the prior context's) -- this is what makes a pronoun word never get inflected by a competing verb-type rule that also happens to structurally match the lookback"
    - "Curated-form-first, generated-fallback-second: words-en.json's bundle-keyed forms win over generated morphology when populated (true today only in spec-injected synthetic fixtures, since 0/228,749 real words have any populated inflection_overrides per Plan 01's confirmed finding)"
    - "A synthetic-lexeme injection seam (resolve_slots(word, words_index:)) lets a spec prove the slot_layouts/aliases/forms traversal mechanism against hand-authored data when the REAL committed corpus is too data-poor (uniformly empty) to prove anything about alias correctness on its own -- disclosed explicitly rather than left as a silent tautology"

key-files:
  created:
    - lib/language/schema2_resolver.rb
    - spec/lib/language/parity_spec.rb
    - spec/lib/language/slot_parity_spec.rb
    - spec/models/board_parity_spec.rb
    - db/language/en/PARITY.md
  modified: []

key-decisions:
  - "Confirmed (not guessed, per CLAUDE.md RULE #0) that the 195 committed tests[] fixtures are NOT literal rules[] substitutions to be copy-transcribed: the resolver had to actually implement the lookback-matching algorithm (word-list vs. part-of-speech-type checks, optional-item skip semantics, greedy first-match) against the committed rules-en.json rules[] array, then route non-override matches through aliases -> UD bundle -> a real EN morphology generator (regular pluralization/tense suffixing plus a small, intentionally partial irregular-verb table and a full personal-pronoun paradigm table), because words-en.json's forms are empty for every real lexeme today. This is substantially more implementation than 'aliases[name]' lookup alone -- verified against all 195 fixtures iteratively, not assumed."
  - "The word-type classifier (WORD_TYPES) needed for lookback part-of-speech matching was derived by cross-referencing the existing app/frontend/tests/utils/edit_manager-test.js lookups fixture (the closest prior art in the codebase) and then adjusted where the real committed rules-en.json rules[] array's matching behavior required a DIFFERENT classification than that JS test file uses (e.g. 'still' classified adverb here, not the JS test file's 'adjective', because the committed fixture 'is it still looking' requires it) -- every adjustment was verified against the full 195-fixture run, not guessed."
  - "resolve_slots (Task 2) deliberately does NOT apply regular-generation fallback, unlike resolve (Task 1) -- it mirrors WordData.inflection_locations_for's real legacy behavior, which is 100% curated-override-driven with zero general morphology generation. This was a genuine architectural finding made mid-execution (not anticipated by the plan's literal text), disclosed in both the resolver's file header and PARITY.md rather than silently implemented either way."
  - "Given Plan 01's confirmed 0/228,749-real-words-have-populated-overrides finding also means the real-corpus half of the compass-slot check compares empty-to-empty for every word (a true but non-alias-proving regression guard), a SYNTHETIC-lexeme consistency proof was added as a necessary complement (Rule 2 -- auto-add missing critical functionality), not an optional nicety, because without it T-05-02's mitigation (a wrong alias/slot_layout table cannot cancel out) would not actually hold for this dataset's real-world state."
  - "Two disclosed, pre-existing local-test-DB isolation hazards were fixed, scoped only to spec/models/board_parity_spec.rb (Rule 1/3, verified with evidence before fixing): a stale, previously-committed admin:true Organization row that survives RSpec's per-example transaction rollback (collides with index_organizations_on_admin) and a cross-example Thread.current[:word_inflection_cache] leak (the same class of hazard as 01-03-SUMMARY.md's documented Redis-cache leak, one layer up the stack, in-process rather than Redis). Confirmed both by reproducing spec/models/board_schema2_spec.rb (Plan 03's own committed spec) failing identically on the admin-org issue in this same local environment -- not introduced by this plan."

requirements-completed: [TEST-01, TEST-02]

# Metrics
duration: ~4hr
completed: 2026-07-06
---

# Phase 01 Plan 05: Parity Test Suite (Hard Gate) Summary

**Built `Language::Schema2Resolver`, a standalone parity resolver that reproduces all 195 committed
lookback fixtures by routing through the alias-to-UD-bundle-to-form indirection (149/195, 76%, via
the alias path), added a distinct compass-slot parity check with an honestly-disclosed synthetic
complement given today's real data is uniformly empty, proved board-level flag-off stamping is
byte-identical across a noun/verb/adjective/translations/manual-inflections sample, and documented
the whole three-spec hard gate plus its UD-semantic limits in `PARITY.md`. Scot approved the human
UD-semantic sign-off (Task 4 checkpoint). The Phase 1 hard gate (TEST-01, TEST-02) is GREEN.**

## Performance

- **Duration:** ~4 hours
- **Tasks:** 4 of 4 complete (3 automated + 1 human checkpoint, approved)
- **Files modified:** 5 (all committed)

## Accomplishments

- **`lib/language/schema2_resolver.rb`** (`module Language::Schema2Resolver`): loads
  `db/language/en/rules-en.json`/`words-en.json` via `JSON.parse` only (zero dynamic code
  execution on that data, verified via `grep -c 'eval\|instance_eval\|Kernel.load'` returning 0).
  Implements `resolve(prior, word, locale)` (lookback parity, TEST-01) and
  `resolve_slots(word, locale:, words_index:)` (compass-slot parity), both routing through
  `aliases`/`slot_layouts` -> UD bundle -> bundle-keyed `forms` so a wrong alias or slot mapping
  visibly breaks a fixture/spec rather than cancelling out.
- **`spec/lib/language/parity_spec.rb`** (8 examples): asserts the 195-fixture count is pinned to
  the Plan 01 baseline, aggregates every fixture mismatch into one failure message (0 mismatches),
  asserts the alias path carries 149/195 (76%) of the fixtures (a material majority, not the
  minority idiomatic-override path), and asserts the resolver's source routes through `aliases` and
  `forms` with zero dynamic-eval usage.
- **`spec/lib/language/slot_parity_spec.rb`** (13 examples): a real-corpus regression guard (20
  words per pos across noun/verb/adjective/adverb/pronoun, honestly documented as currently vacuous
  re: alias correctness given Plan 01's confirmed 0/228,749-populated-overrides finding) PLUS a
  synthetic-lexeme consistency proof (hand-authored lexemes covering every bundle each pos's
  `SLOT_LAYOUTS` page references, injected via `resolve_slots`'s `words_index:` override) that
  demonstrably catches a corrupted bundle mapping. `KNOWN_EXCEPTIONS` documents 5 real multi-type
  words (`abandon`, `3-d`, `aboard`, `anybody`, `a battery`) the primary-pos-only `slot_layouts`
  scheme does not model secondary-type slots for.
- **`spec/models/board_parity_spec.rb`** (6 examples): byte-identical `inflection_defaults`
  stamping (flag off) across a noun board (bacon), a verb board (run), an adjective board (ugly), a
  `translations`-entry board, and a manual-per-button-`inflections` board, plus the v-bump no-op
  skip proof. Fixed two disclosed, pre-existing local-test-DB isolation hazards (scoped to this
  file only) that blocked verification: a stale committed `admin: true` Organization row and a
  cross-example `Thread.current[:word_inflection_cache]` leak.
- **`db/language/en/PARITY.md`**: documents the three-spec hard gate, the exact rerun command, the
  195-fixture/228,749-word baselines, the 76% alias-path share, the "Limits of the mechanical gate"
  UD-semantic caveat, the `KNOWN_EXCEPTIONS` list, and the "Known gap: flag-ON runtime is a stub"
  section. No em dashes in the prose (CLAUDE.md rule).
- **Human UD-semantic sign-off: APPROVED.** Scot reviewed the `LEGACY_ALIASES`/`SLOT_LAYOUTS` UD
  bundle strings against the Universal Dependencies v2 feature inventory and the
  `KNOWN_EXCEPTIONS` list, and typed "approved" for the Task 4 checkpoint.

## Task Commits

1. **Task 1: Build resolver routing through aliases; prove all 195 lookback fixtures (TEST-01)** -
   `df59616b9` (feat) -- COMPLETE
   - `lib/language/schema2_resolver.rb`, `spec/lib/language/parity_spec.rb`
2. **Task 2: Compass-slot parity via resolve_slots (real-corpus guard + synthetic proof)** -
   `e32724736` (test) -- COMPLETE
   - `spec/lib/language/slot_parity_spec.rb`
3. **Task 3: Board-level flag-off parity proof + PARITY.md hard-gate documentation** -
   `f79ee3f26` (feat) -- COMPLETE
   - `spec/models/board_parity_spec.rb`, `db/language/en/PARITY.md`
4. **Task 4: Human UD-semantic sign-off checkpoint** - APPROVED (no code commit; a decision, not a
   code change)

## Files Created/Modified

- `lib/language/schema2_resolver.rb` - the standalone parity resolver
- `spec/lib/language/parity_spec.rb` - lookback parity spec, green (8 examples)
- `spec/lib/language/slot_parity_spec.rb` - compass-slot parity spec, green (13 examples)
- `spec/models/board_parity_spec.rb` - board-level parity spec, green (6 examples)
- `db/language/en/PARITY.md` - hard-gate documentation

## Decisions Made

See `key-decisions` in the frontmatter above for full detail. Summary:
- The resolver required a real lookback-matching + EN-morphology-generation implementation, not a
  thin alias lookup, verified iteratively against all 195 fixtures.
- `resolve_slots` intentionally omits regular-generation fallback (curated-data-only, matching the
  real legacy backend), a finding made and disclosed mid-execution.
- A synthetic-lexeme complement to the compass-slot check was added as necessary (not optional)
  given the real corpus is uniformly empty of populated overrides.
- Two pre-existing local-test-DB isolation hazards were fixed, scoped to the one new spec file that
  needed them.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1/3 - thoroughness/blocking] Stale committed `admin: true` Organization row collides with a unique index**
- **Found during:** Task 3, first run of `spec/models/board_parity_spec.rb`
- **Issue:** `Organization.create(admin: true)` raised `PG::UniqueViolation` on
  `index_organizations_on_admin` in every example. Root-caused (not guessed) by querying the test DB
  directly: a previously-committed `admin: true` Organization row (id 1289) exists outside any
  RSpec transaction, and confirmed this is pre-existing (not introduced by this plan) by reproducing
  the identical failure against `spec/models/board_schema2_spec.rb`, Plan 03's own already-committed
  spec, in this same local environment.
- **Fix:** added a `before(:each) { Organization.where(admin: true).delete_all }` hook scoped to
  `board_parity_spec.rb` only (the deletion is itself inside each example's own transaction, so it
  has no effect on the DB outside this file's examples).
- **Files modified:** `spec/models/board_parity_spec.rb`
- **Verified:** all 6 examples green.

**2. [Rule 1 - bug] Cross-example `Thread.current[:word_inflection_cache]` leak**
- **Found during:** Task 3, after fixing #1, two examples reusing the word "bacon" with different
  seeded `inflection_overrides` were reading back an earlier example's stale cached result (missing
  the `se` antonym key). Root-caused with evidence (a direct `rails runner` reproduction of the same
  word/overrides combination in isolation produced the correct result, isolating the cause to
  cross-example state, not the seeding logic itself) before fixing, per CLAUDE.md RULE #0.
- **Fix:** added a `before(:each) { Thread.current[:word_inflection_cache] = nil }` hook, mirroring
  the class of fix 01-03-SUMMARY.md documented for an analogous Redis-cache leak.
- **Files modified:** `spec/models/board_parity_spec.rb`
- **Verified:** all 6 examples green, including the two that reuse "bacon".

**Total deviations:** 2, both disclosed above with root-cause evidence per RULE #0.
**Impact on plan:** None negative -- both fixes are scoped to the one new spec file that needed
them and strengthen test isolation; neither touches Plan 03's own (still-unfixed, out of scope for
this plan) `board_schema2_spec.rb`.

## Issues Encountered

**Significant, disclosed architectural finding (not a blocker, handled transparently):** the
compass-slot parity check (Task 2) cannot, using only the real committed corpus, prove
`aliases`/`slot_layouts` correctness on its own, because Plan 01 confirmed 0 of the 228,749 real EN
words have any populated `inflection_overrides` -- so both `resolve_slots` and the golden baseline
are empty for every real word today, and a wrong bundle string would never surface as a visible
mismatch against real data alone. This is exactly the "near-tautology" problem this whole plan
exists to prevent, recurring one level deeper because of Plan 01's real-data finding. Resolved by
adding an honestly-labeled synthetic-lexeme consistency proof (see Task 2's spec and `PARITY.md`'s
"Limits of the mechanical gate" section) rather than silently shipping a check that looks
meaningful but is not. See `db/language/en/PARITY.md` for the full writeup.

## User Setup Required

None for this plan's completion.

## Next Phase Readiness

**The Phase 1 hard gate is GREEN.** `DB_USER=scotw RAILS_ENV=test bundle exec rspec
spec/lib/language/parity_spec.rb spec/lib/language/slot_parity_spec.rb
spec/models/board_parity_spec.rb` passes (27 examples, 0 failures), and Scot has approved the human
UD-semantic sign-off. Per `db/language/en/PARITY.md`'s explicit hard-gate rule, this must stay green
before any later phase modifies `word_data.rb`'s Setting-rules branch, either hardcoded EN fallback
branch, or the `i18n.js` grammar helpers.

**Carry forward to Roadmap Phase 2 and beyond:**
- `db/language/en/PARITY.md`'s "Limits of the mechanical gate" section: the gate proves alias
  completeness, alias/slot_layout structural consistency, and current-behavior reproduction, but NOT
  absolute UD-semantic correctness beyond what Scot's Task 4 sign-off covered.
- `db/language/en/PARITY.md`'s "Known gap: flag-ON runtime is a stub" section:
  `lib/language/schema2_resolver.rb` is standalone and parity-only; turning `multilingual_grammar`
  ON today does NOT invoke real schema-2 resolution anywhere in the running app (`word_data.rb`,
  `board.rb`, `i18n.js`, `edit_manager.js` all remain minimal stubs from Plans 03/04). Wiring this
  resolver into runtime is Roadmap Phase 2 work.
- The `KNOWN_EXCEPTIONS` multi-type-word list in `slot_parity_spec.rb`/`PARITY.md` is
  forward-looking: it becomes load-bearing (not just documentation) once real per-word
  `inflection_overrides` data exists on a multi-type word.

This closes Phase 01 (en-schema-2-migration) -- all 5 plans (01-01 through 01-05) complete.

## Self-Check: PASSED

- FOUND: `lib/language/schema2_resolver.rb`
- FOUND: `spec/lib/language/parity_spec.rb`
- FOUND: `spec/lib/language/slot_parity_spec.rb`
- FOUND: `spec/models/board_parity_spec.rb`
- FOUND: `db/language/en/PARITY.md`
- FOUND: commit `df59616b9`
- FOUND: commit `e32724736`
- FOUND: commit `f79ee3f26`

---
*Phase: 01-en-schema-2-migration*
*Completed: 2026-07-06*
