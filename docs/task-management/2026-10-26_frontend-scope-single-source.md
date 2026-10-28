# Frontend-scope classifier: one copy instead of two

PR #1217. Rule 14 approval: Traci Day, 2026-10-26, for `lint-and-build` reading
`ember-shard-scope`'s `run` output and deleting its own `Classify frontend impact` step.

## Why

#1166 left two copies of the classifier in `.github/workflows/ci.yml`: one in `lint-and-build`, one
in `ember-shard-scope`. #1217 tried to keep them in step with a test that compares the two texts.
Four review rounds each broke that comparison in a new way (predicate-only scope, region-only scope,
heuristic log stripping, YAML header slicing, `//` stripping, name-based extraction). A text
comparison of two JS programs embedded in YAML cannot hold. Removing the second copy makes drift
impossible by construction.

## Guarantee

1. **One classifier.** `ci.yml` contains exactly one step that classifies frontend impact. It is the
   `frontend-scope` step of `ember-shard-scope`.
2. **One decision.** Every consumer reads the decision from `ember-shard-scope`'s `run` output:
   - `lint-and-build`'s frontend steps, through its own `frontend` step;
   - `ember-shard`, `ember-shard-coverage` and the `build-and-test` gate, directly.

   No step outside `ember-shard-scope` reads `steps.frontend-scope`.
3. **Fail toward running.**
   - `lint-and-build` sets `run=false` only when `ember-shard-scope` succeeded AND its `run` output is
     exactly `false`. In every other case it runs lint and build: the scope job failed, was skipped,
     or left the output empty.
   - `lint-and-build` still runs when the scope job fails (`!cancelled()`), so the gate never sees it
     as skipped.
   - Both Decide steps run unconditionally, and `frontend` is the scope job's last step.
   - In `lint-and-build`, the fast-path step is the only one that runs on `false`. Setup, cache,
     install, both lints and the build all run on `true`, and none has `continue-on-error`.
4. **Classification.** The one classifier gives the specified answer on every `CASES` row, and runs the
   suite for one file in each app area (`MUST_RUN_PATHS`).
5. **The gate.** `build-and-test` runs `always()` and needs exactly lint-and-build, the scope job, the
   shards and coverage. Over every combination of their results and the scope output, it passes only when:
   - `lint-and-build` succeeded; and
   - either the scope job succeeded and said `false`, or the shards and coverage both succeeded.

## Threat model

- **In scope:** accidental edits, meaning anything someone does without trying to fool CI. For
  example:
  - changing the classifier logic;
  - re-adding a second copy;
  - pointing a consumer back at its own classifier;
  - changing a `Decide` step so an empty or failed result skips;
  - dropping the `needs` edge or the `!cancelled()` condition.
- **Out of scope:** deliberate edits designed to fool the test, such as YAML a different parser
  reads differently, or extra action inputs (`base-url`) that change what the classifier sees.
  Every such edit changes `.github/workflows/`. Those changes go through the `data-bearing-paths`
  human review and Rule 14.

## Known residual differences

- **Parser:** the test reads `ci.yml` with Ruby's Psych, not GitHub's own parser. Psych keeps the
  last of two duplicate keys; GitHub's handling is not checked here.
- **Ruby:** the test needs system Ruby on the runner (Ruby 3.2.3 on `ubuntu-24.04`, image
  `20261023.334.3`). Without it the test fails with an error, never passes. `codex-review-tests` runs on
  `ubuntu-latest` and is required, so if GitHub moves `ubuntu-latest` to an image without Ruby, every PR
  blocks until the job gets `ruby/setup-ruby` or a pinned image. Not changed here: it is outside this
  approval.
- **Second classifier:** found by what it does (`listFiles`, `pull_number`, `/files`, `compareCommits`,
  `paths-filter`, `changed-files`, `git diff --name-only|--name-status`). A classifier built some other
  way would not be found, though every consumer's wiring is still pinned.
- **Admins:** required checks on `develop` use `enforcement_level: non_admins`, so an admin merge bypasses
  the gate entirely. No test can cover that.
