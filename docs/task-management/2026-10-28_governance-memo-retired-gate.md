# AI governance memo: stop describing the retired CI gate as a control (2026-10-28)

**Branch:** `compliance/scot-governance-memo-retired-gate-2b76e11e` (from `develop` d40d62480)
**Issue:** #1227
**Author-Model:** opus-5.5 (Claude Code), for Scot

## Why

PR #1225 removed the retired CI Codex review gate. `docs/legal/2026-08-24_ai-governance-memo.md`
still said the data-bearing boundary was enforced "CI-side" by `scripts/codex-review-path-classifier.sh`
and, in section 4, "enforced by `codex-review-guard.sh`". The PR 1225 fix-commit review also left three
Low follow-ups, folded in here.

## Fact sheet

- CONFIRMED: the memo is unattested. Its register row `DOC-506bbe2039` is `status: draft` with
  `attestation: {}`, and its header says "DRAFT - NOT YET ATTESTED"; every attestation it quotes belongs
  to the frozen predecessor `docs/legal/AI_GOVERNANCE_MEMO.md` (`DOC-39f37f8200`), which is not edited.
- CONFIRMED: the repo is public (`gh repo view --json visibility`: PUBLIC), and
  `data-bearing-paths/<base>` is required on `develop`, `staging` and `main` (branch protection, 2026-10-28).
- CONFIRMED: the gate skips the classifier when the diff lists no paths
  (`scripts/data-bearing-path-check.sh`, `if nonblank "$paths"`), and passes an empty range
  (`scripts/tests/data-bearing-path-check-test.sh`, "empty range passes").
- CONFIRMED: the gate runs the classifier only with `--data-bearing-only` (`classify()` in
  `scripts/data-bearing-path-check.sh`).

## Changes

- Memo sections 4 and 4.1: dated "Corrected 2026-10-28" markers in place, stating the controls as the
  two-tier policy places them (ai-company-brain `instructions/shared/compliance.md`, "Where the control
  sits"); a "Later correction" paragraph under "Corrections in this successor". The memo stays unattested.
- `.claude/rules/data-bearing-paths.md`: an empty diff passes the gate; only a classifier failure fails it.
- `.claude/agents/compliance-officer.md`: the author's check before pushing keeps real data out; the gate
  gates merges, not publication.
- `scripts/tests/codex-review-path-classifier-test.sh`: 27 cases in `--data-bearing-only` mode, every arm
  of the extension pattern in lowercase and uppercase, one diff-mode case, and four pass-side cases.
- Register: `contentHash` re-rendered for the two unattested rows (`DOC-506bbe2039`, `DOC-d9f17c6919`).

## Verification

- Classifier suite 130 OK (was 103); data-bearing check 163 OK; real-repo classifier test 7 OK;
  frontend-scope 12 OK; `ruby scripts/document-register-render.rb --check` OK (109 docs).
- Mutants (scratch copies): dropping any one of the 11 extensions fails 2 to 4 new-suite cases; matching
  case-sensitively only in `--data-bearing-only` mode fails 12. The same mutants pass the old 103-case suite.

## Follow-ups (not in this PR)

- The moved real-repo test's docstring and the PR 1225 task log's "still NAME" list are slightly off
  (PR 1225 fix review, Low 4).
- Memo section 4.1 "Current behavior" describes the n8n PR-review bot's DeepSeek skip; not re-verified here.
