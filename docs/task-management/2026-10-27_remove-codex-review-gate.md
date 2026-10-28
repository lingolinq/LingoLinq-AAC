# Remove the retired CI Codex review gate (2026-10-27)

**Branch:** `chore/scot-remove-codex-review-gate-f290253a` (from `develop` a01becefd)
**Author-Model:** opus-5.5 (Claude Code), for Scot

## Why

Scot retired the CI `codex-review` gate on 2026-10-27 instead of reviving it: the Codex
GitHub connector now reviews every PR on this repo, teammates' included (first shown on
PR #1217). Done outside the repo the same day: the four repo secrets
(`CODEX_OPENAI_API_KEY`, `CLAUDE_REVIEW_API_KEY`, `N8N_CODEX_RESULTS_WEBHOOK_URL`,
`N8N_CODEX_RESULTS_HMAC_SECRET`) and the `pr-review` webhook to n8n deleted, the OpenAI
and Anthropic keys deleted in their consoles, n8n W1 and W2 off. The record is in
ai-company-brain `docs/reviewers/approved-reviewers-history.md`, "The CI row is retired".
This PR removes the files that were left disabled and keyless.

## Fact sheet

- CONFIRMED: `codex-review-tests` is a required status on `develop`, `staging` and `main`
  (`gh api repos/lingolinq/LingoLinq-AAC/branches/<b>/protection/required_status_checks`,
  2026-10-27). So the job name stays; renaming it is a branch-protection change on three
  branches.
- CONFIRMED: three of that job's steps are live and unrelated to the gate:
  `scripts/frontend-scope-classifier.test.py`, `scripts/tests/codex-review-path-classifier-test.sh`
  and `scripts/tests/data-bearing-path-check-test.sh`.
- CONFIRMED: `scripts/codex-review-path-classifier.sh` and its test are live despite the
  name: `scripts/data-bearing-path-check.sh` reads it (`CLASSIFIER=...codex-review-path-classifier.sh`)
  and lists both in `CONTROL_FILES`, and `.github/workflows/data-bearing-paths.yml` runs the
  test. Both are kept unchanged.
- CONFIRMED: no file outside the removed set references a removed file, apart from the
  ci.yml steps removed here, comments in the two kept classifier files, and dated history
  under `docs/task-management/` and `audit-reports/` (`git grep`, 2026-10-27).
- CONFIRMED: no `codex-review` GitHub environment exists (environment list, all pages), so
  no environment secrets were left behind. Two non-secret repo variables remain:
  `CODEX_REVIEW_CHUNKED_SCOPE` and `CODEX_REVIEW_EVIDENCE_MODE`.

## Removed

- `.github/workflows/codex-review.yml`, `.github/workflows/codex-watchdog.yml`
- `.github/codex/` (prompts, schemas, exec args, evidence policy, README, review memory)
- `docs/ops/codex-review-smoke.md`
- every `scripts/codex-review-*` file except `codex-review-path-classifier.sh`, including
  six test files that tested only removed code: `codex-review-build-envelope.test.py`,
  `codex-review-secret-scan.test.py`, `codex-review-build-evidence.test.py`,
  `codex-review-run-chunks.test.py`, `codex-review-chunked-scope.test.py`,
  `codex-review-codex-args.test.py`
- from `codex-review-tests`: the steps that ran those six tests, the pinned Codex CLI
  install, and the zizmor scan of `codex-review.yml`

## Verification

Baseline on clean `develop` and again on this branch: frontend-scope classifier 12 tests
OK, path classifier 103 cases OK, data-bearing path check 163 cases OK.

## Follow-ups (not in this PR)

- Delete the repo variables `CODEX_REVIEW_CHUNKED_SCOPE` and `CODEX_REVIEW_EVIDENCE_MODE`.
- Optionally rename `codex-review-tests` and the path classifier, and refresh the
  classifier's comments that name `codex-review.yml` and `codex-review-assemble-prompt.py`.
  The rename needs branch protection updated on three branches; the classifier files are
  `data-bearing-paths` control files.
- `docs/legal/2026-08-24_ai-governance-memo.md` still says the classifier keeps data-bearing
  paths off the CI Codex route. Left unchanged here (compliance doc, attested register).
