---
phase: 01-en-schema-2-migration
plan: 01
subsystem: database
tags: [rake, word-data, settings, ssrf-safe-http, openaac, json, en-inflections]

# Dependency graph
requires: []
provides:
  - lib/tasks/language_snapshot.rake (namespace :language, task :snapshot) -- COMPLETE, committed
  - db/language/en/rules-en.upstream.json (pinned + SHA-256-verified upstream OpenAAC source) -- COMPLETE, committed
  - db/language/README.md (provenance documentation) -- COMPLETE, committed
  - db/language/en/words-en.snapshot.json / rules-en.snapshot.json / inflection-locations-golden.json -- COMPLETE, committed (staging-sourced, cross-verified against production)
  - spec/tasks/language_snapshot_spec.rb -- COMPLETE, committed, green (11 examples, 0 failures)
affects: [01-02, 01-03, 01-04, 01-05]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "deep_sort + JSON.pretty_generate for deterministic, key-sorted snapshot serialization"
    - "SafeHttp.get (SSRF-safe wrapper) for one-time upstream dataset fetch, mirroring lib/tasks/openaac.rake precedent"
    - "explicit _rules_source label ('live_setting' vs 'upstream_synthetic_no_live_setting') instead of silently emitting nulls when no rules/<locale> Setting exists"
    - "SKIP_VALIDATIONS=true (the same flag the repo's own Rakefile sets unconditionally) as the sanctioned escape hatch for the boot-time GoSecure.validate_encryption_key canary when running rails runner / bare rspec directly against an environment whose local encryption-key state doesn't matter for the task at hand"

key-files:
  created:
    - lib/tasks/language_snapshot.rake
    - db/language/README.md
    - db/language/en/rules-en.upstream.json
    - db/language/en/words-en.snapshot.json
    - db/language/en/rules-en.snapshot.json
    - db/language/en/inflection-locations-golden.json
    - spec/tasks/language_snapshot_spec.rb
  modified: []

key-decisions:
  - "Task 1 (rake task + README) executed and committed in full -- no live-DB dependency, fully verified via static/automated checks."
  - "Task 2's upstream fetch+pin+hash-lock executed and committed in full (200 OK, 195 tests[] fixtures, substitutions.{contractions,default_contractions} present, _license == \"CC By, OpenAAC\")."
  - "Local dev/test DB's WordData rows were undecryptable under this worktree's SECURE_ENCRYPTION_KEY (rows dated 2026-04-28, predating this worktree's key). Rather than fabricate data or guess the historical key, Scot ran the snapshot task himself, in his own terminal, against STAGING's real DATABASE_URL + SECURE_ENCRYPTION_KEY (sourced from Render, never pasted into this chat). Staging's key decrypted all 228,749 EN WordData rows cleanly."
  - "CRITICAL FINDING, confirmed against BOTH staging and production (2026-07-05): no rules/en Setting exists in either reachable environment, AND zero WordData rows in either environment carry a populated inflection_overrides value (checked full corpus on staging: 0/228,749; checked full corpus on production: 0/228,749, identical counts). This means WordData.inflection_locations_for's per-word location output (plural/past-tense/comparative slot placement) is empty for every single word in both live environments today -- not a staging-only data gap, not a decryption artifact, but the actual, verified, current real-world behavior of the live app. The golden baseline file therefore correctly captures 'every word has only `types`, no location slots' as ground truth, which is real but was NOT what the plan's own acceptance criteria assumed (it expected a `src` key on golden entries and 'a noun shows a plural slot' on spot-check -- neither holds for any of the 228,749 words in either environment)."
  - "Did NOT seed/fabricate inflection_overrides data to make the golden baseline 'look right' -- per the plan's explicit no-fabrication instruction, the baseline captures what is real, however unexpected."
  - "rules-en.snapshot.json is labeled _rules_source: 'upstream_synthetic_no_live_setting' (not 'live_setting') because no rules/en Setting exists on staging -- this label was added specifically so nothing downstream mistakes upstream-seeded rules/inflection_locations content for live Setting data."
  - "spec/tasks/language_snapshot_spec.rb intentionally asserts the REAL confirmed shape (every golden entry == {'types': [...]},  no `src` key) rather than the plan's originally-assumed shape, with an inline comment explaining why, so a future contributor doesn't 'fix' the spec back to a fabricated expectation."

requirements-completed: [DATA-01]

# Metrics
duration: ~2.5hr (across two sessions; includes cross-environment verification)
completed: 2026-07-05
---

# Phase 01 Plan 01: EN Language Dataset Snapshot -- COMPLETE

**Deterministic `language:snapshot` rake task built and committed; upstream OpenAAC rules-en
file fetched, verified, and pinned (SHA-256-locked, 195 `tests[]` fixtures, real `substitutions`
block, `_license: "CC By, OpenAAC"`); the live-DB-dependent snapshot (words/rules/golden JSON)
was generated against STAGING (human-run, credentials never entered this chat) after this
worktree's local dev/test DB proved undecryptable; and a mandatory spot-check required by this
plan's own human-verify checkpoint surfaced a major, cross-environment-confirmed finding: neither
staging nor production has any populated per-word inflection override data today, so the golden
pre-migration baseline is uniformly `{"types": [...]}` with no location slots for all 228,749
words. This is real, verified behavior, not a gap -- and it is now the frozen, spec-locked
baseline every later Phase 1 plan builds parity against.**

## Performance

- **Duration:** ~2.5 hours across two sessions (initial build + blocked halt, then staging
  unblock + production cross-check + spec/doc completion)
- **Tasks:** 2 of 2 complete; human-verify checkpoint's core question (provenance/count
  confirmation) substantively answered, formal "approved" sign-off still pending from Scot (see
  Next Phase Readiness)
- **Files modified:** 7 (all committed)

## Accomplishments

- Built `lib/tasks/language_snapshot.rake` (`namespace :language`, `task :snapshot[locale]`):
  emits a PII-free words snapshot (types/inflection_overrides/antonyms only -- no
  `reviews`/`reviewer_ids`), a rules snapshot correctly split between the LIVE `Setting` (for
  `rules`/`inflection_locations`, falling back to the pinned upstream file with an explicit
  `_rules_source` label when no Setting exists) and the pinned upstream file (for
  `substitutions`/`tests`/`_license`), and a golden `inflection_locations_for` baseline capture.
  All output is key-sorted (`deep_sort`) for byte-stable re-runs.
- Wrote `db/language/README.md` documenting the full provenance story, the SHA-256 pin/re-verify
  process, the license attribution, and the golden baseline's purpose.
- Fetched and pinned the real upstream file (`https://tools.openaac.org/inflections/rules-en.json`,
  40,153 bytes, SHA-256 `df71e0c893fac417bf7aea12742642d7a1b5cddd924532cdd2bb2c1803bfcf0b`),
  verified `tests.length == 195`, `substitutions.{contractions,default_contractions}` present,
  `_license == "CC By, OpenAAC"`.
- **Ran `rake language:snapshot` against STAGING** (Scot ran this himself, in his own terminal,
  sourcing staging's real `DATABASE_URL` + `SECURE_ENCRYPTION_KEY` from Render -- no secret value
  was ever pasted into this session). Result:
  `language:snapshot(en): 228749 WordData rows, 195 tests[] fixtures, 228749 golden corpus words.`
  Staging's key decrypted all 228,749 rows cleanly (a wrong key would have raised on the very
  first row, as had happened locally).
- Committed the three generated files: `words-en.snapshot.json` (30.5 MB), `rules-en.snapshot.json`
  (68 KB, `_rules_source: "upstream_synthetic_no_live_setting"`), `inflection-locations-golden.json`
  (17.8 MB).
- **Performed the plan's required golden-baseline spot-check** (Task checkpoint step 4: "a noun
  shows a plural slot, a verb shows past/participle slots") and it FAILED for every word checked.
  Investigated further: `words-en.snapshot.json` shows 0/228,749 words with any non-empty
  `inflection_overrides` (verified via full-corpus scan, not sampling) -- even extremely common
  words like "cat", "run", "big", "want" have real `types` but completely empty
  `inflection_overrides: {}`.
  - This was flagged to Scot rather than silently accepted or silently "fixed" (there was nothing
    to fix -- it's real staging data).
  - Scot asked to cross-check production (read-only, existence/count-only, run by Scot himself in
    his own terminal against production's real credentials, gated behind the repo's own
    `USER_KEY`-audited-runner control (`config/initializers/auditing.rb` /
    `lib/audit/console_guard.rb`) -- production requires this for any `console`/`runner` session
    and refuses an unkeyed one, exactly as designed).
  - **Production confirmed the identical result:** `PROD_CHECK total=228749 with_overrides=0
    rules_en_setting_present=false`, `SAMPLE=[]`.
  - Conclusion: this is not a staging data-quality gap. It is the real, current, cross-environment
    state of the live app's word data. The golden baseline correctly captures it.
- Wrote and ran `spec/tasks/language_snapshot_spec.rb` (11 examples, 0 failures): asserts the
  upstream SHA-256 pin, the frozen 195-fixture count, substitutions/license carry-through,
  absence of `reviews`/`reviewer_ids`, the `_rules_source` label, and the REAL confirmed golden
  shape (every entry is exactly `{"types": [...]}`, no `src` key) -- with an inline comment
  explaining why, so this isn't later "corrected" back to a fabricated expectation.

## Task Commits

1. **Task 1: Build the deterministic language:snapshot rake task** - `adef84cf8` (feat) -- COMPLETE
2. **Task 2 (partial, non-DB): Pin + hash-lock upstream source** - `d7c6076a2` (chore) -- COMPLETE
3. **Fix: label rules snapshot source instead of silently emitting nulls** - `b05582f5e` (fix) --
   addresses a real gap found in review: the original rake task wrote `null` for
   `rules`/`inflection_locations` with no indication when no Setting existed. Now labeled
   `_rules_source`.
4. **Data: commit staging-sourced language snapshot** - `84bfcc609` (data) -- the three
   DB-dependent JSON files, generated against staging, independently verified (file sizes,
   counts, `_rules_source` label, no-secrets scan) before commit.
5. **Test: lock language snapshot artifact shape + upstream SHA-256 pin** -
   `f87e7eacf` (test) -- `spec/tasks/language_snapshot_spec.rb`, green.

## Files Created/Modified

- `lib/tasks/language_snapshot.rake` - the `language:snapshot` rake task (complete, verified)
- `db/language/README.md` - provenance documentation (complete)
- `db/language/en/rules-en.upstream.json` - pinned, SHA-256-verified upstream OpenAAC source
- `db/language/en/words-en.snapshot.json` - 228,749 EN WordData rows, staging-sourced
- `db/language/en/rules-en.snapshot.json` - `_rules_source: "upstream_synthetic_no_live_setting"`
- `db/language/en/inflection-locations-golden.json` - real pre-migration baseline: every entry
  `{"types": [...]}`, confirmed against both staging and production
- `spec/tasks/language_snapshot_spec.rb` - green, 11 examples

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3] Rake task silently emitted nulls instead of labeling missing-Setting mode**
- **Found during:** review of the merged Task 1 output
- **Issue:** `setting = Setting.get(...) || {}` then unconditional
  `setting['rules']`/`setting['inflection_locations']` writes -- would silently null both fields
  with no abort or label when no Setting exists (true of both staging and production).
- **Fix:** detect Setting absence via `.present?`, seed from the pinned upstream file instead of
  nulls in that case, and record which mode was used via `_rules_source`.
- **Files modified:** `lib/tasks/language_snapshot.rake`
- **Verified:** rake loads cleanly; all acceptance-criteria greps still pass; new
  `_rules_source` key present in output.

**2. [Rule 1/2 - thoroughness] Golden-baseline spot-check surfaced a cross-environment data finding**
- **Found during:** the plan's own required checkpoint spot-check (step 4)
- **Issue:** the spot-check ("a noun shows a plural slot...") failed for every one of 228,749
  words. Root-caused (not guessed) to `WordData#inflection_overrides` being universally empty on
  staging.
- **Resolution:** did not fabricate or seed override data to make the check "pass" cosmetically.
  Verified the same emptiness holds on production (independent, human-run, read-only check), then
  wrote the spec to assert the real confirmed shape with an explanatory comment. This is
  documented as a finding for Scot, not silently absorbed.
- **Files modified:** `spec/tasks/language_snapshot_spec.rb` (asserts real shape),
  `.planning/phases/01-en-schema-2-migration/01-01-SUMMARY.md` (this file)

**Total deviations:** 2, both disclosed above with rationale.
**Impact on plan:** None negative -- both deviations strengthen correctness (loud labeling
instead of silent nulls; a verified real baseline instead of an assumed one). The second
deviation is a significant finding for the broader initiative (see Next Phase Readiness) but does
not block this plan's own completion, since DATA-01 requires the snapshot reflect real live EN
content -- which it now verifiably does.

## Issues Encountered

**RESOLVED: local dev/test DB's `WordData.data` / `Setting` rows are undecryptable under this
worktree's `SECURE_ENCRYPTION_KEY`** (rows dated 2026-04-28, predating this worktree's locally
generated key; same root cause independently hit again later when running the spec via bare
`rspec` against the local test DB's stale `encryption_hash` Setting -- resolved there via
`SKIP_VALIDATIONS=true`, the same flag the repo's own `Rakefile` sets unconditionally for every
rake-driven run, so `rspec spec/tasks/language_snapshot_spec.rb` run directly needs it explicitly
too: `DB_USER=scotw RAILS_ENV=test SKIP_VALIDATIONS=true bundle exec rspec
spec/tasks/language_snapshot_spec.rb`).

**Resolution:** rather than guess/rotate/brute-force the historical key or fabricate substitute
data, Scot ran the snapshot task himself against staging, sourcing staging's real credentials
from Render directly into his own terminal (never pasted into this chat). This fully unblocked
Task 2.

**NEW FINDING (not a blocker, but significant): zero live inflection-override data exists
anywhere reachable.** See "Accomplishments" and key-decisions above. Flagging again here because
it has implications beyond this plan -- see Next Phase Readiness.

## User Setup Required

None outstanding for this plan's own completion. For future runs: regenerating the snapshot
requires a human to run `rake language:snapshot` against an environment with readable `WordData`
(staging or production), following the same never-paste-secrets pattern used here.

## Next Phase Readiness

- **Ready for Plan 02** on the mechanical/data-availability front: `words-en.snapshot.json`,
  `rules-en.snapshot.json`, and `inflection-locations-golden.json` are committed, spec-verified,
  and stable.
- **Formal checkpoint sign-off still open:** the plan's blocking human-verify checkpoint asks
  Scot to type "approved" confirming provenance, counts, license, and golden-baseline
  trustworthiness. Provenance/counts/license are confirmed in this document; the golden-baseline
  trustworthiness sub-check technically FAILED the plan's original spot-check criterion (no word
  shows a location slot) -- but was then independently re-verified as REAL rather than broken.
  Scot should explicitly confirm he accepts this real-but-unexpected baseline before Plan 02
  starts, since Plan 02 (schema-2 generator) and Plan 05 (parity suite) should be scoped knowing
  that the "before" state has no per-word location data to preserve parity against -- parity for
  the location-slot dimension is currently vacuous (empty before, must stay empty after, unless a
  separate initiative populates real override data first).
- **Worth raising with whoever owns word-data curation:** if per-word inflection overrides are
  expected to exist somewhere (e.g. via the admin Word Data import tool mentioned in CLAUDE.md)
  and simply haven't been run/imported on either staging or production, that's a separate,
  pre-existing gap this plan surfaced but does not fix.

---
*Phase: 01-en-schema-2-migration*
*Completed: 2026-07-05*
