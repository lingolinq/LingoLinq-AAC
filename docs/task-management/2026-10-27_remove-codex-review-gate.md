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
- CONFIRMED: no live file NEEDS a removed file (the adversary pass checked workflows,
  `.claude/settings.json`, CODEOWNERS, `package.json`, `Rakefile`, hooks, skills and the
  register citations). Files that still NAME one, harmlessly: comments in the two kept
  classifier files; `gh run list --workflow codex-review.yml` command strings in
  `.claude/hooks/audit-readonly-guard.sh`, `.claude/hooks/compliance-officer-write-scope.sh`
  and `scripts/tests/agent-hook-guards-test.sh`; the `scripts/**` exclusion comment in
  `scripts/ai-endpoint-guard.sh`; and dated history under `docs/task-management/` and
  `audit-reports/`. (The first draft of this bullet said none, which was wrong.)
- CONFIRMED: no `codex-review` GitHub environment exists (environment list, all pages), so
  no environment secrets were left behind. Two non-secret repo variables remain:
  `CODEX_REVIEW_CHUNKED_SCOPE` and `CODEX_REVIEW_EVIDENCE_MODE`.

## Removed

- `.github/workflows/codex-review.yml`, `.github/workflows/codex-watchdog.yml`
- `.github/codex/` (prompts, schemas, exec args, evidence policy, README, review memory)
- `docs/ops/codex-review-smoke.md`
- 17 `scripts/codex-review-*` files (every one except `codex-review-path-classifier.sh`):
  11 gate scripts and six test files. 30 files are deleted in all.
- Of the six test files, five tested only removed code: `codex-review-build-envelope.test.py`,
  `codex-review-secret-scan.test.py`, `codex-review-build-evidence.test.py`,
  `codex-review-run-chunks.test.py`, `codex-review-codex-args.test.py`.
- The sixth, `codex-review-chunked-scope.test.py`, mostly tested `codex-review.yml`, but its
  `PathClassifierTest` class tests the kept classifier against a real git repo, with cases the
  shell suite lacks (real git quoting of tab, newline, quote and backslash names; a compliance
  rename; uppercase `.CSV` / `.XLSX` / `.Sql` extensions). The Codex senior-dev pass caught
  this; the adversary pass showed that classifier mutants dropping `sql` or `xlsx|xls` pass
  both kept shell suites and fail only this class. The class was moved unchanged (byte-identical body) to
  `scripts/codex-review-path-classifier-repo.test.py` and runs in `codex-review-tests`.
  Mutation check: against a stub classifier that routes everything to `codex`, it fails
  (`FAILED (failures=10)`); against the real classifier, 7 tests OK.
- from `codex-review-tests`: the steps that ran the five removed tests and the old
  chunked-scope file, the pinned Codex CLI install, and the zizmor scan of `codex-review.yml`

## Verification

Baseline on clean `develop` and again on this branch: frontend-scope classifier 12 tests
OK, path classifier 103 cases OK, data-bearing path check 163 cases OK. The moved
real-repo classifier test: 7 tests OK on this branch.

## Follow-ups (not in this PR)

- Delete the repo variables `CODEX_REVIEW_CHUNKED_SCOPE` and `CODEX_REVIEW_EVIDENCE_MODE`.
- Optionally rename `codex-review-tests` and the path classifier, and refresh the
  classifier's comments that name `codex-review.yml` and `codex-review-assemble-prompt.py`.
  The rename needs branch protection updated on three branches; the classifier files are
  `data-bearing-paths` control files.
- `docs/legal/2026-08-24_ai-governance-memo.md` still says the boundary is enforced
  "CI-side, by its vendored copy" of the classifier. Left unchanged here (compliance doc,
  attested register); it needs an owner (Scot) and a tracked item, not only this bullet.
- The moved real-repo classifier test is not in the gate's `CONTROL_FILES` and the gate's
  self-test does not run it; porting its uppercase-extension and quoting cases into the
  shell suite would put them under the gate's own protection.
- `scripts/ai-endpoint-guard.sh` excludes `scripts/**` because "codex-review and friends"
  read API keys; after this PR only the guard and its test do. Narrow the exclusion or
  restate the reason.
- zizmor only ever scanned the removed workflow; point the same pinned step at
  `data-bearing-paths.yml` (runs on `pull_request_target`) and `deploy-cloudrun.yml`.
