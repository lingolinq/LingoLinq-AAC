# Codex Review workflow hardening

**Date:** 2026-09-28. **Branch:** `fix/scot-codex-review-workflow-hardening` from `origin/develop` at 29df1a094.
**Scope:** `.github/workflows/codex-review.yml` and the helpers it restores. The workflow
stays disabled; this PR does not re-enable it.

## Asked for

Before re-enabling Codex Review: check the PR out in a subdirectory; run base-ref helpers
with `python3 -I`; `persist-credentials: false`; make sure the Codex key file cannot be read
by later steps; account for cross-step persistence through `$GITHUB_ENV`, `$GITHUB_PATH` and
background processes. Run zizmor and the `codex-review-tests` suites.

## Facts (checked against develop at 29df1a094)

- CONFIRMED `codex-review.yml:178-182`: PR head checked out at the workspace root with the
  default `persist-credentials: true`, so the job token was written to `.git/config` inside
  the tree the read-only reviewer can read. zizmor: `artipacked`.
- CONFIRMED `codex-review.yml:190`: `${{ github.workflow_sha }}` expanded into a run
  script. zizmor: `template-injection` (error).
- CONFIRMED `codex-review.yml:179`: `actions/checkout@v6` not pinned. zizmor: `unpinned-uses`.
- CONFIRMED every helper ran as plain `python3 scripts/...` (and inline `python3 -c`)
  from the PR tree, so `scripts/` (script dir) and the working directory were on
  `sys.path`: a PR adding `scripts/json.py` would have been imported by trusted helpers.
- CONFIRMED `codex-review.yml:334-342`: `codex login` wrote the key to
  `${{ runner.temp }}/codex-home`, which persisted for every later step, including the
  steps holding the W2 secrets.
- CONFIRMED `codex-review.yml:332`: `npm install -g @openai/codex` ran from the PR checkout
  (npm reads a project `.npmrc` from the working directory), unpinned.
- CONFIRMED `codex-review.yml:503-505`: the W2 URL and HMAC secret were expanded into the
  run script and passed on the `curl` / `openssl` command lines.
- CONFIRMED `scripts/codex-review-quiet-exec.py`: the reviewer child inherited the full
  step env, including the job-level `GH_TOKEN` and the runner file-command paths.
- CONFIRMED `@openai/codex@0.158.0` (current latest) declares no npm scripts (`npm view`).
- CONFIRMED `codex exec` authenticates from `CODEX_API_KEY` without writing `auth.json`
  (Codex non-interactive docs; maintainer note on openai/codex#15151).

## Changes

See `.github/codex/README.md`, "Job isolation (hardening, 2026-09-28)".

## Tests

- Red first: `scripts/codex-review-step-guard.test.py` and `scripts/codex-review-quiet-exec.test.py`
  fail against develop (6 workflow-hardening tests, 2 env-scrub tests) and pass after.
- All six `codex-review-*.test.py` suites pass locally (existing four unchanged).
- zizmor 1.30.1 `--offline` on `codex-review.yml`: before 4 findings (2 high), after none
  (1 ignored: `adhoc-packages` on the pinned, script-free Codex install).
- End-to-end simulation of the bounded reviewer step with a hostile fake `codex` that
  appended `BASH_ENV=` / a PATH entry to the file-command files and left a `setsid`
  background process: after the step both files were empty and the processes were killed;
  the child saw no `GH_TOKEN`, `GITHUB_ENV` or `OPENAI_API_KEY`.

## Not covered

- Root escape: hosted runners allow passwordless `sudo`; same-uid controls cannot stop it.
- A guarded step can still read its own credential while it runs.
- The reviewer's handling of repository instruction files (for example `AGENTS.md`) in the
  checkout it reviews.
- zizmor findings in other workflows (pre-existing; not touched).

## Learnings

- A process reaper selected by start time will also hit unrelated same-uid processes
  started after the mark (it killed a `| tail` in a local test pipeline). Arm it only
  where the step owns the uid's new processes (`CODEX_REVIEW_STEP_GUARD=1`), and take
  test marks from a fresh marker process, not the test process's own start time.
