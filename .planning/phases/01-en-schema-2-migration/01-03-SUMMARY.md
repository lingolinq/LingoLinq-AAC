---
phase: 01-en-schema-2-migration
plan: 03
subsystem: feature-flag-gating
tags: [feature-flag, multilingual_grammar, word-data, board, en-inflections, redis-cache-hazard]

# Dependency graph
requires: ["01-01", "01-02"]
provides:
  - lib/feature_flags.rb ('multilingual_grammar' in AVAILABLE_FRONTEND_FEATURES only, FeatureFlags.multilingual_grammar_enabled_for?) -- COMPLETE, committed
  - app/models/word_data.rb (purely-additive gated early-return seam in inflection_locations_for) -- COMPLETE, committed
  - spec/lib/feature_flags_spec.rb (multilingual_grammar coverage added) -- COMPLETE, committed, green
  - spec/models/word_data_schema2_spec.rb (concrete fixture parity + broad golden regression + flag-ON stub test) -- COMPLETE, committed, green
  - spec/models/board_schema2_spec.rb (COMPAT-01/02/03 + v-bump skip proof) -- COMPLETE, committed, green
affects: [01-04, 01-05]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Purely-additive early-return seam: new code inserted immediately after the method's blank-guard, before any existing logic, so a whole-method diff (git diff BASE -- file | grep '^-[^-]') has zero hits -- mechanically provable non-regression, not just spec-asserted"
    - "Server-side-only flag evaluation: FeatureFlags.multilingual_grammar_enabled_for?(nil) modeled 1:1 on the existing signup_default_library_boards_enabled? pattern (ENV override, else SystemFeatureSettings), called with a literal nil since word_data.rb has no user in scope -- never a request parameter"
    - "Gate evaluated once per call at method entry (a local conditional), never inside the per-word WordData.where(...).each loop, so no uncached Setting/SystemFeatureSettings query lands on the board_downstream_button_set.rb:554 hot path"
    - "Broad-corpus regression subset selection: group real committed snapshot words by primary part-of-speech (types[0]) and take a deterministic prefix (first 20 alphabetically) per group, rather than sampling the full 228,749-word corpus -- materially broader than a handful of hardcoded fixtures while staying CI-fast"

key-files:
  created:
    - spec/models/word_data_schema2_spec.rb
    - spec/models/board_schema2_spec.rb
  modified:
    - lib/feature_flags.rb
    - spec/lib/feature_flags_spec.rb
    - app/models/word_data.rb
  unmodified-but-verified:
    - app/models/board.rb (zero diff -- confirmed via `git status`/`git diff` after Task 3; all gating lives inside inflection_locations_for, so board.rb needed no change and none was made)

key-decisions:
  - "Task 3 confirmed (did not assume) that Board#check_for_parts_of_speech_and_inflections needs zero changes: it only consumes whatever WordData.inflection_locations_for returns, and that method's flag-off output is already byte-identical (Task 2). board.rb has no diff in this plan at all."
  - "The flag-ON branch in word_data.rb is a deliberately MINIMAL STUB (per the plan's own KNOWN GAP note): `words.each_with_object({}) { |w, h| h[w] = {'schema2_stub' => true} }`. It does not consult db/language/en/rules-en.json or resolve any real inflection. The real parity-tested resolver (lib/language/schema2_resolver.rb) does not exist yet -- it is Plan 01-05's deliverable, standalone and NOT wired into runtime. Flipping multilingual_grammar ON today would NOT produce real schema-2 output; it would produce this stub marker. This is intentional scope, not an oversight."
  - "REAL FINDING (not anticipated by the plan): Setting.set(key, value, true) writes through to Redis via a 60-minute setex TTL that is NOT rolled back by rspec's per-example DB transaction (only the underlying Setting row is). The broad golden-corpus regression spec calls Setting.set('rules/en', ...) to exercise the Setting-rules branch per the plan's own instruction -- without cleanup this would leak a real 'rules/en' Setting into the shared test-environment Redis cache for up to 60 minutes, breaking every OTHER spec (in this run or a later, unrelated one) that assumes no rules/en Setting exists, including spec/models/word_data_spec.rb's pre-existing 'en'/'en-AU' fixtures. Diagnosed with evidence (confirmed via a direct rails runner query showing Setting.get_cached('rules/en') returning real content while the underlying DB row was nil, i.e. a pure Redis-cache artifact) before fixing, per CLAUDE.md RULE #0 -- not guessed. Fixed by wrapping the regression test in an `around` hook that deletes the 'setting/rules/en' Redis key both before and after the example."
  - "Confirmed this Redis leak was self-inflicted during THIS session's own iteration (not a pre-existing repo defect): an earlier combined test run of my draft spec polluted the shared test Redis; that pollution then caused spec/models/word_data_spec.rb:982 to fail even when run in total isolation with word_data.rb fully reverted, which is what made the root cause undeniable rather than an assumption. Cleared the stale Redis key, re-verified the pre-existing test passes standalone, restored my word_data.rb change, then added the cleanup hook to the new spec so this cannot recur for future contributors or CI."
  - "Kept the fixture-substitution guidance in the plan literally: the ['he','ugly','mask','run','angrily'] word set has no true 'en'-locale expected-output fixture in word_data_spec.rb (only 'en-AU', ~line 1433). Rather than copy the 'en-AU' expected hash and assume it holds at 'en', word_data_schema2_spec.rb independently sets up the same data and calls inflection_locations_for at locale 'en' directly, then asserts the (verified-by-running, not assumed) output -- which happens to equal the 'en-AU' fixture's values only because, with no rules/en Setting present, 'en' and 'en-AU' hit the identical fallback-grid code path for this data."

requirements-completed: [FLAG-01, FLAG-02, FLAG-03, COMPAT-01, COMPAT-02, COMPAT-03]

# Metrics
duration: ~2hr
completed: 2026-07-05
---

# Phase 01 Plan 03: Feature Flag + Backend Gating -- COMPLETE

**Registered the `multilingual_grammar` feature flag (off by default, server-side-only
activation) and added a purely-additive, mechanically-diff-verified early-return seam to
`WordData.inflection_locations_for`. With the flag off (the default), the entire legacy method
body -- both the live `rules/en` Setting-rules branch and the hardcoded EN fallback grid real
boards actually hit -- is byte-identical to pre-migration behavior, proven by a whole-method diff
guard AND a broad ~200-word multi-part-of-speech golden-corpus regression (not just the ~5
hardcoded fixtures). `Board#check_for_parts_of_speech_and_inflections` needed zero changes and
received none. Along the way, found and fixed a genuine test-isolation hazard: `Setting.set`
writes through to Redis with a TTL that survives rspec's transaction rollback, which the new
regression test now explicitly guards against.**

## Performance

- **Duration:** ~2 hours
- **Tasks:** 3 of 3 complete
- **Files modified:** 5 (lib/feature_flags.rb, app/models/word_data.rb, spec/lib/feature_flags_spec.rb,
  spec/models/word_data_schema2_spec.rb [new], spec/models/board_schema2_spec.rb [new]).
  `app/models/board.rb` was in the plan's `files_modified` list but ended up with **zero diff** --
  confirmed, not assumed, via `git status`/`git diff` after Task 3.

## Accomplishments

### Task 1: `multilingual_grammar` flag + server-side gate

- Added `'multilingual_grammar'` to `FeatureFlags::AVAILABLE_FRONTEND_FEATURES` only (NOT to
  `ENABLED_FRONTEND_FEATURES` -- off by default).
- Added `FeatureFlags.multilingual_grammar_enabled_for?(_user = nil)`, modeled exactly on
  `signup_default_library_boards_enabled?`: honors `ENV['MULTILINGUAL_GRAMMAR'] =~ /^(1|true|yes)$/i`,
  else consults `SystemFeatureSettings.effective_enabled_for(_user)` / `.default_enabled_features`.
  Documented inline that (a) this is the ONLY switch every backend schema-2 codepath consults
  (server decision, never a request parameter -- closes threat T-03-01), and (b) the ENV var gates
  the backend only; the frontend reads the flag via `frontend_flags_for`, never the ENV var.
- `spec/lib/feature_flags_spec.rb`: 6 new examples -- registered in AVAILABLE, absent from ENABLED,
  false for `nil` and an ordinary user with no opt-in, true when `SystemFeatureSettings` explicitly
  enables it (system-default or per-scope), true/false tracking the ENV override.

### Task 2: gated early-return seam in `word_data.rb` + broad golden regression

- Inserted a 13-line early-return block immediately after the existing blank-guard at
  `word_data.rb:730` (see exact diff hunk below). `use_schema2 = FeatureFlags.multilingual_grammar_enabled_for?(nil)`
  is evaluated once, at method entry -- never inside the `WordData.where(...).each` loop -- so no
  uncached query is added to the `board_downstream_button_set.rb:554` hot path.
  - **Flag OFF (default):** falls straight through to the unchanged legacy body.
  - **Flag ON (minimal stub, deliberate known gap):** returns
    `words.each_with_object({}) { |w, h| h[w] = {'schema2_stub' => true} }` -- a placeholder, not
    real schema-2 resolution (that's Plan 01-05's standalone, unwired `schema2_resolver.rb`).
- **Whole-method mechanical diff guard passed:** `git diff BASE -- app/models/word_data.rb | grep '^-[^-]'`
  has zero hits -- no line anywhere in the file (not just the new seam's neighborhood) was removed
  or modified. This mechanically proves the live Setting-rules branch (773-796), the hardcoded EN
  fallback grid (797-925), and the antonym block (940-944) are byte-identical to pre-migration.
- **Diff hunk boundaries added** (from `git show f0866b6c7 -- app/models/word_data.rb`):
  ```
  @@ -729,6 +729,19 @@ class WordData < ApplicationRecord
       hash = {}
       return hash if words.blank? || !locale || locale.blank?

  +    # Schema-2 (Universal Dependencies) seam, gated behind
  +    # FeatureFlags.multilingual_grammar_enabled_for?. Evaluated ONCE per call (never per word),
  +    # ...
  +    if FeatureFlags.multilingual_grammar_enabled_for?(nil)
  +      return words.each_with_object({}) { |w, h| h[w] = {'schema2_stub' => true} }
  +    end
  +
       # Request/job-scoped cache to avoid redundant DB queries when the same words
       # are looked up repeatedly within a single request or background job.
       Thread.current[:word_inflection_cache] ||= {}
  ```
  13 lines added (11 comment/blank + `if`/`return`/`end`), 0 lines removed or changed, anywhere in
  the file. `grep -c "multilingual_grammar_enabled_for" app/models/word_data.rb` == 2 (the call
  site plus its mention in a comment). No new `Thread.current` line was added (the pre-existing
  memoization at line 734+13=747 is untouched).
- `spec/models/word_data_schema2_spec.rb` (7 examples):
  1. Flag-off byte-identical output for `['hat','want','angrily','I','he']` at locale `'en'`
     (reused from `word_data_spec.rb` ~line 974).
  2. Flag-off byte-identical output for `['he','ugly','mask','run','angrily']` **at locale `'en'`**
     -- this exact word set has no true `'en'`-locale expected-output fixture in
     `word_data_spec.rb` (only `'en-AU'`, ~line 1433); rather than copy the `en-AU` expectations,
     this test independently builds the same data and calls at `'en'` directly, then asserts the
     output the code itself produces.
  3. **Broad golden-corpus regression:** a deterministic ~200-word subset (first 20 words,
     alphabetical, per distinct primary-part-of-speech group -- 11 groups: noun, adjective, verb,
     adverb, interjection, preposition, pronoun, article, conjunction, question, expletive) seeded
     from the committed `words-en.snapshot.json`, with `Setting.set('rules/en', ...)` from
     `rules-en.snapshot.json` so the Setting-rules branch (773-796) is exercised too. Every word's
     output is asserted equal to `inflection-locations-golden.json`. For this corpus (zero
     populated `inflection_overrides` on every real word, per 01-01's confirmed finding), both the
     Setting-rules branch and the fallback grid converge on the same empty-locations result -- a
     genuine cross-branch proof, not a tautology.
  4. Flag-ON test: the stub marker is returned when ON, and a subsequent flag-off call in the same
     example is unaffected (proves the seam doesn't corrupt shared state).

### Task 3: Board proof (no code change needed)

- Confirmed, rather than assumed, that `Board#check_for_parts_of_speech_and_inflections` needs no
  change: it only consumes whatever `WordData.inflection_locations_for` returns, and that method's
  flag-off output is already proven byte-identical by Task 2. **`app/models/board.rb` has zero diff
  in this plan.**
- `spec/models/board_schema2_spec.rb` (4 examples), flag off (default, no stubbing needed):
  1. Concrete stamped `inflection_defaults` values match the legacy path exactly, with
     `v == WordData::INFLECTIONS_VERSION` (COMPAT-02).
  2. A second call is a genuine no-op: the already-stamped word is excluded from the
     `WordData.inflection_locations_for` lookup entirely (asserted via
     `expect(WordData).to receive(:inflection_locations_for).with([], 'en')`), not merely
     coincidentally reproducing the same output -- the v-bump skip mechanism is intact.
  3. A manually-set per-button `'inflections'` array (distinct field from the computed
     `'inflection_defaults'`) is left completely untouched by the stamping method (COMPAT-01) --
     the method never conflates the two fields, by construction.
  4. `settings['translations']` entries are stamped identically across locales (COMPAT-03),
     reusing the existing multi-locale fixture pattern from `board_spec.rb`.

## Task Commits

1. **Task 1: register multilingual_grammar flag + server-side gate** - `1bdc59b8d` (feat) -- COMPLETE
2. **Task 2: purely-additive gated seam in word_data.rb + broad golden regression** - `f0866b6c7` (feat) -- COMPLETE
3. **Task 3: board flag-off proof spec (no board.rb change)** - `0ca943613` (test) -- COMPLETE

## Files Created/Modified

- `lib/feature_flags.rb` - flag registration + `multilingual_grammar_enabled_for?` gate
- `spec/lib/feature_flags_spec.rb` - 6 new examples
- `app/models/word_data.rb` - 13-line purely-additive early-return seam
- `spec/models/word_data_schema2_spec.rb` (new) - 7 examples: concrete fixtures, broad golden
  regression, flag-ON stub inertness
- `spec/models/board_schema2_spec.rb` (new) - 4 examples: COMPAT-01/02/03, v-bump skip
- `app/models/board.rb` - **unmodified** (zero diff, confirmed)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1/2 -- thoroughness/root-cause] Redis cache leak from `Setting.set` in the broad
regression test**
- **Found during:** verifying the Task 2 spec suite. An initial combined run of
  `word_data_schema2_spec.rb` + `word_data_spec.rb` showed 1 unrelated failure in the pre-existing
  `word_data_spec.rb:982` example (`"no" => 1` appearing unexpectedly in an `'en-AU'` fixture's
  expected hash).
- **Diagnosis (not guessed, verified with evidence per CLAUDE.md RULE #0):** reverted
  `word_data.rb` entirely (via a tagged `git stash`) and re-ran `word_data_spec.rb:982` in total
  isolation -- it STILL failed. A direct `rails runner` query showed
  `Setting.get_cached('rules/en')` returning real, populated content while
  `Setting.find_by(key: 'rules/en')` (the DB row itself) returned `nil` -- proving this was a pure
  Redis-cache artifact (`setting/rules/en`, `setex` with a 60-minute TTL from a prior
  `Setting.set('rules/en', ..., true)` call in an earlier draft run of my own new spec), not a code
  defect, and not caused by my `word_data.rb` change.
- **Fix:** cleared the stale Redis key, re-verified the pre-existing test passed standalone,
  restored my `word_data.rb` change, then added an `around` hook to the broad-regression `describe`
  block in `word_data_schema2_spec.rb` that deletes `'setting/rules/en'` from Redis both before and
  after the example, so this spec is a no-op on shared Redis state going forward.
- **Files modified:** `spec/models/word_data_schema2_spec.rb` only; no other file needed a change.
- **Verified:** combined run of `feature_flags_spec.rb` + `word_data_schema2_spec.rb` +
  `board_schema2_spec.rb` + `word_data_spec.rb` is green (81 examples, 0 failures, 1 pre-existing
  pending), matching the plan's own `<verification>` command exactly.

**Total deviations:** 1, disclosed above with root-cause evidence per RULE #0.
**Impact on plan:** None negative -- this strengthens the new test suite's isolation guarantees
and surfaces a real hazard (any future spec calling `Setting.set` on a widely-assumed-absent key
without cleanup) that would otherwise silently flake other specs in CI or local runs.

## Issues Encountered

**Unrelated, pre-existing, out of scope:** running the FULL `spec/models/board_spec.rb` (not just
`board_schema2_spec.rb`, which is all this plan's own `<verification>` requires) surfaces 10
pre-existing `swap_images` failures (e.g. `expect(bis.count).to eq(4)` / `got 1510`) caused by
stale committed `ButtonImage` rows in this worktree's local test DB -- the same class of issue
already documented in memory (`reference_test_db_orphan_rows.md`: "Test DB carries orphaned
committed rows"). Confirmed via `rspec spec/models/board_spec.rb -e "check_for_parts_of_speech_and_inflections"`
that the 7 pre-existing examples for the method THIS plan touches all pass; the `swap_images`
failures are a separate, unrelated, pre-existing local-environment data issue, not something this
plan introduced or is scoped to fix.

## User Setup Required

None for this plan's completion.

## Next Phase Readiness

- **Ready for Plan 01-04** (frontend schema-2 wiring): the backend seam exists, is off by default,
  and is proven inert. `lib/feature_flags.rb`'s `multilingual_grammar` flag is the single
  server-side switch Plan 01-04's frontend work should read via the existing `frontend_flags_for`
  map -- never a new ENV check on the client side.
- **Carry forward to Plan 01-05's checkpoint:** the flag-ON branch in `word_data.rb` is a MINIMAL
  STUB (`{'schema2_stub' => true}` per word), not real schema-2 resolution. `lib/language/schema2_resolver.rb`
  does not exist yet in this repo (confirmed: only `lib/language/schema2_generator.rb` from Plan
  01-02 exists) -- it is Plan 01-05's own deliverable, and per `REQUIREMENTS.md`'s
  ROADMAP-02 scope note, wiring the real resolver into `word_data.rb`/`board.rb` runtime codepaths
  is explicitly deferred to Roadmap Phase 2, not this milestone. Plan 01-05's `PARITY.md` should
  restate this known gap so Phase 2 planning does not assume flag-ON already invokes real
  resolution today.
- **Worth noting for whoever runs specs locally in this worktree going forward:** this worktree's
  local test-environment Redis had a stale `setting/rules/en` cache entry (now cleared) and its
  local test Postgres DB has orphaned `ButtonImage` rows inflating `swap_images` spec counts
  (pre-existing, unrelated to this plan). Neither blocks this plan's own green verification.

---
*Phase: 01-en-schema-2-migration*
*Completed: 2026-07-05*
