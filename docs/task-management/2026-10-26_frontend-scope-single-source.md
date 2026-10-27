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
3. **Fail toward running.** `lint-and-build` sets `run=false` only when `ember-shard-scope` succeeded
   AND its `run` output is exactly `false`. In every other case it runs lint and build: the scope job
   failed, was skipped, or left the output empty. `lint-and-build` still runs when the scope job
   fails (`!cancelled()`), so the gate never sees it as skipped.
4. **Classification.** The one classifier gives the specified answer on every `CASES` row.

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
  `20261023.334.3`). Without it the test fails with an error, never passes.
