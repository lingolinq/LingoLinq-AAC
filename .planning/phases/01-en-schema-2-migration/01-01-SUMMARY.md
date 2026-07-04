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
  - words-en.snapshot.json / rules-en.snapshot.json / inflection-locations-golden.json -- NOT PRODUCED (BLOCKED, see below)
  - spec/tasks/language_snapshot_spec.rb -- NOT WRITTEN (would assert against files that do not exist yet)
affects: [01-02, 01-03, 01-04, 01-05]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "deep_sort + JSON.pretty_generate for deterministic, key-sorted snapshot serialization"
    - "SafeHttp.get (SSRF-safe wrapper) for one-time upstream dataset fetch, mirroring lib/tasks/openaac.rake precedent"

key-files:
  created:
    - lib/tasks/language_snapshot.rake
    - db/language/README.md
    - db/language/en/rules-en.upstream.json
  modified: []

key-decisions:
  - "Task 1 (rake task + README) executed and committed in full -- no live-DB dependency, fully verified via static/automated checks."
  - "Task 2's upstream fetch+pin+hash-lock executed and committed in full -- independent of the DB blocker below, fully verified (200 OK, 195 tests[] fixtures, substitutions.{contractions,default_contractions} present, _license == \"CC By, OpenAAC\")."
  - "Task 2's DB-dependent steps (words snapshot, rules snapshot, golden baseline, spec) could NOT be completed: local dev DB's WordData rows are undecryptable under the currently configured SECURE_ENCRYPTION_KEY. Per explicit plan-specific-notes guidance (\"do NOT fabricate data -- stop at the earliest blocking point\"), execution HALTS here rather than working around the gap."
  - "Did NOT attempt to route around the blocker by wiping/re-seeding WordData from an upstream words-en source -- that would replace real (if currently unreadable) curated word data with fabricated upstream substitute content, which is exactly the kind of fabrication the plan forbids and would defeat DATA-01's requirement that the snapshot reflect real live EN content."
  - "Did NOT attempt to guess, brute-force, or rotate the encryption key -- out of scope, high-risk, and not resolvable without human input (no matching entry found in this repo's .env.op.template for SECURE_ENCRYPTION_KEY, implying it is a locally-generated, non-vaulted dev secret)."

requirements-completed: []  # DATA-01 NOT complete -- see below. Do not mark complete; Task 2's DB-dependent deliverables are outstanding.

# Metrics
duration: 25min
completed: 2026-07-04
---

# Phase 01 Plan 01: EN Language Dataset Snapshot -- PARTIAL / BLOCKED

**Deterministic `language:snapshot` rake task built and committed; upstream OpenAAC rules-en
file fetched, verified, and pinned (SHA-256-locked, 195 `tests[]` fixtures, real
`substitutions` block, `_license: "CC By, OpenAAC"`) -- but the live-DB-dependent snapshot
generation (words/rules/golden JSON + parity spec) is BLOCKED by a local dev-environment
encryption-key mismatch that makes the existing ~228,749 EN `WordData` rows undecryptable, so
execution halts here for human input rather than fabricating or substituting data.**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-07-04T09:41:00-06:00 (approx.)
- **Completed (halted):** 2026-07-04T10:10:00-06:00 (approx.)
- **Tasks:** 1 of 2 complete; Task 2 partially complete (upstream pin done, DB-dependent steps blocked)
- **Files modified:** 3 (all committed)

## Accomplishments

- Built `lib/tasks/language_snapshot.rake` (`namespace :language`, `task :snapshot[locale]`):
  emits a PII-free words snapshot (types/inflection_overrides/antonyms only -- no
  `reviews`/`reviewer_ids`), a rules snapshot correctly split between the LIVE `Setting` (for
  `rules`/`inflection_locations`) and the pinned upstream file (for
  `substitutions`/`tests`/`_license`), and a golden `inflection_locations_for` baseline capture.
  All output is key-sorted (`deep_sort`) for byte-stable re-runs. Aborts loudly if the pinned
  upstream file is missing.
- Wrote `db/language/README.md` documenting the full provenance story (why rules/inflection_locations
  and substitutions/tests/license are sourced differently), the SHA-256 pin/re-verify process, the
  license attribution, and the golden baseline's purpose.
- Fetched the real upstream file via `SafeHttp.get` (SSRF-safe wrapper, matching the
  `lib/tasks/openaac.rake` precedent -- NOT a bare Net::HTTP/open-uri/Typhoeus call):
  `https://tools.openaac.org/inflections/rules-en.json` returned HTTP 200, 40,153 bytes.
  Verified top-level keys `_locale, _version, _license, _type, rules, inflection_locations,
  substitutions, tests`; `_license == "CC By, OpenAAC"`; `tests.length == 195`; `substitutions`
  contains both `contractions` and `default_contractions`.
- Pinned the file verbatim as `db/language/en/rules-en.upstream.json`. Computed and recorded its
  SHA-256 in `db/language/README.md`:
  `df71e0c893fac417bf7aea12742642d7a1b5cddd924532cdd2bb2c1803bfcf0b`
  Retrieval date: 2026-07-04 (UTC), from a local development shell.

## Task Commits

1. **Task 1: Build the deterministic language:snapshot rake task** - `adef84cf8` (feat) -- COMPLETE
   - `lib/tasks/language_snapshot.rake`, `db/language/README.md`
   - Verified: `bundle exec ruby -e "require 'rake'; Rake.application.init; Rake.application.load_rakefile"` succeeds; `rake -T language` lists `language:snapshot[locale]`; all acceptance-criteria greps pass (`task :snapshot`, `reviewer_ids` count 0, `rules-en.upstream.json` literal present, `substitutions` present, `deep_sort`/`sort` present, `inflection_locations_for` present, `inflection-locations-golden` present).
2. **Task 2: Pin + hash-lock the upstream file...** - `d7c6076a2` (chore) -- PARTIAL / BLOCKED
   - `db/language/en/rules-en.upstream.json` (new), `db/language/README.md` (updated with real SHA-256 + retrieval date)
   - The upstream fetch/pin/hash-lock/README-update portion is complete and verified.
   - The remainder of Task 2 (running `rake language:snapshot` to produce
     `words-en.snapshot.json`, `rules-en.snapshot.json`, `inflection-locations-golden.json`, and
     writing/running `spec/tasks/language_snapshot_spec.rb`) is **NOT DONE** -- see Blocker below.

**No plan-metadata commit was made** (worktree mode; STATE.md/ROADMAP.md are the orchestrator's responsibility, and this plan has not reached a completable state).

## Files Created/Modified

- `lib/tasks/language_snapshot.rake` - the `language:snapshot` rake task (complete, verified)
- `db/language/README.md` - provenance documentation (complete; SHA-256 now filled in)
- `db/language/en/rules-en.upstream.json` - pinned, SHA-256-verified upstream OpenAAC source (complete)
- `db/language/en/words-en.snapshot.json` - **NOT CREATED** (blocked)
- `db/language/en/rules-en.snapshot.json` - **NOT CREATED** (blocked)
- `db/language/en/inflection-locations-golden.json` - **NOT CREATED** (blocked)
- `spec/tasks/language_snapshot_spec.rb` - **NOT CREATED** (blocked -- nothing real to assert against yet)

## Decisions Made

- Ran the upstream fetch via `SafeHttp.get` from a `rails runner` invocation with
  `SKIP_VALIDATIONS=true` (the same flag the project's own `Rakefile` sets unconditionally for
  every rake task -- this is an existing, intentional, documented escape hatch for the
  boot-time `GoSecure.validate_encryption_key` canary check, not a new bypass I introduced).
  This let the fetch run without hitting the (unrelated) boot-time encryption-key canary check
  that a bare `rails runner` invocation otherwise fails on in this environment.
- Confirmed the local dev DB (`lingolinq-development`) had 228,749 EN `WordData` rows (created
  2026-04-28) but **zero** `settings` rows matching `rules/en%` -- the `rules/en` `Setting` did
  not exist locally at all. To test whether the rake task's Setting-vs-upstream sourcing split
  works correctly, I seeded a local-only `rules/en` `Setting` by replicating
  `WordData.ingest`'s exact write path (`Setting.set("rules/en", json.slice('rules',
  'inflection_locations', 'contractions', 'default_contractions'), true)`) against the pinned
  upstream file -- this is local DB state only, not committed to git, and does not affect the
  actual snapshot output determination described below (the whole snapshot run failed before
  reaching the rules-writing step; see Blocker).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking, partially applied] Missing `rules/en` Setting seeded locally for testing**
- **Found during:** Task 2 investigation (pre-flight check before running `rake language:snapshot`)
- **Issue:** Local dev DB had EN `WordData` rows but no `rules/en` `Setting` record at all.
- **Fix:** Seeded a local-only `Setting` via the app's own real `WordData.ingest` write-path logic
  against the pinned upstream file (not fabricated data -- the app's documented round-trip
  mechanism, run against the real upstream source). This is DB-only state, not committed.
- **Files modified:** none (DB-only)
- **Note:** This turned out not to matter for the actual blocker below -- the snapshot task fails
  on the WORDS step (which runs before the rules step), so the seeded Setting was never reached in
  a completed run. Flagging so a human knows local dev DB state now differs slightly from before
  this session.

**Total deviations:** 1 (informational; did not change any committed output)
**Impact on plan:** None on committed files. All committed content (Task 1 + Task 2's upstream pin) is real, verified, unmodified by the DB-seeding investigation.

## Issues Encountered

**BLOCKER (unresolved): local dev DB's `WordData.data` is undecryptable under the current
`SECURE_ENCRYPTION_KEY`.**

Running `DB_USER=scotw RAILS_ENV=development bundle exec rake language:snapshot` fails:

```
rake aborted!
OpenSSL::Cipher::CipherError: bad decrypt (OpenSSL::Cipher::CipherError)
lib/tasks/language_snapshot.rake:55:in 'block (3 levels) in <top (required)>'
```

This happens on the very first `WordData` row read (`wd.data`, via `secure_serialize`), during
the WORDS step of the snapshot task -- i.e. before the rules or golden steps even run. I sampled
the first 20 EN `WordData` rows individually (`wd.data`) outside the rake task: **all 20 (100%)
raised the same `OpenSSL::Cipher::CipherError: bad decrypt`.** This is not a transient or
partial issue -- the entire local corpus is unreadable under the currently configured key.

Root cause (verified, not guessed): the app's boot-time canary check
(`GoSecure.validate_encryption_key` in `config/environment.rb:27`, which itself calls
`Setting.get('encryption_hash')`) also fails with the identical `bad decrypt` error on a bare
`rails runner`/`rails console` invocation (this is what first surfaced the issue, before I even
got to `WordData`). The project's own `Rakefile` sets `ENV['SKIP_VALIDATIONS'] = "true"`
unconditionally, which bypasses that *boot-time canary check* for rake/rspec invocations -- but
it does **not** fix actual column decryption, which fails independently, per-row, whenever
`secure_serialize` tries to decrypt real ciphertext with the wrong key. Both failures (the boot
canary and the real `WordData` rows) point to the same root cause: the `SECURE_ENCRYPTION_KEY`
currently configured in this worktree's `.env` does not match the key that was active when this
local dev DB's `WordData` corpus (and `encryption_hash` canary) were originally written (rows
are dated 2026-04-28; the current key is presumably a since-rotated/regenerated local value).

I checked `.env.op.template` in this repo for a 1Password-vaulted canonical value for
`SECURE_ENCRYPTION_KEY` -- there is none (the `.env.example` comment describes it as "random
string, used for encrypting data at rest," implying it is meant to be a fresh per-environment
secret, not a shared/vaulted one). I did not attempt to guess, brute-force, or rotate the key,
and did not attempt to wipe/re-seed the local `WordData` table from an upstream source (that
would silently replace real, currently-unreadable curated data with fabricated/upstream
substitute content -- exactly the kind of fabrication the plan explicitly forbids, and it would
defeat DATA-01's requirement that the snapshot reflect the actual real live EN dataset, not a
fresh copy of the same upstream file already pinned separately).

**What would unblock this:**
1. Scot supplies the correct historical `SECURE_ENCRYPTION_KEY` for this local dev DB (if
   recoverable from a backup/previous `.env`, or from wherever the dev DB dump/restore
   originally came from), OR
2. Scot points execution at a different environment where the live EN `WordData` + `rules/en`
   Setting ARE readable under the currently configured key (per the plan, staging/production
   access must not be taken autonomously -- this would need to be an explicit, human-directed
   action, e.g. via `bin/audit_console` run BY Scot, or a fresh authenticated local restore), OR
3. Scot confirms it is acceptable to discard the currently-unreadable local `WordData` rows and
   re-derive a "real" EN dataset from some other named, human-approved source (this changes what
   "the live EN dataset" means for DATA-01 and should be an explicit decision, not an assumption
   made by the executor).

Once the correct data source is available, the remaining Task 2 work is mechanical: run
`DB_USER=scotw RAILS_ENV=development bundle exec rake language:snapshot`, write
`spec/tasks/language_snapshot_spec.rb` per the plan's acceptance criteria, run
`DB_USER=scotw RAILS_ENV=test bundle exec rspec spec/tasks/language_snapshot_spec.rb`, and commit.
The rake task itself (Task 1) is already built, committed, and verified -- no code changes should
be needed to unblock, only a working data source.

## User Setup Required

**Yes -- this is the human-action item blocking Task 2's completion.** See "Issues Encountered"
above for the three options. No committed code requires setup; this is purely an environment/data
provenance decision only Scot can make (per the plan's own explicit prohibition on autonomous
privileged prod-console access, and per the instruction not to fabricate data).

## Next Phase Readiness

- **NOT ready for Plan 02.** Plan 02 (schema-2 generation) depends on the committed
  `words-en.snapshot.json` / `rules-en.snapshot.json` / `inflection-locations-golden.json`, none
  of which exist yet.
- The plan's Task 3 checkpoint (human-verify of provenance/counts) was never reached -- this halt
  occurs earlier, exactly as the plan's own guidance anticipates ("do NOT fabricate data -- stop
  at the earliest blocking point... let the checkpoint **or an earlier explicit halt** carry that
  back to the orchestrator/user").
- What IS safely reusable once the blocker clears: the rake task (Task 1, fully done) and the
  pinned/verified upstream file + its recorded SHA-256 (Task 2's non-DB portion, fully done). No
  rework needed there.

---
*Phase: 01-en-schema-2-migration*
*Halted (not completed): 2026-07-04*
