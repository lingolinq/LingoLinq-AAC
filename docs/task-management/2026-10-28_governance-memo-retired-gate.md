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

- Memo section 2 (developer code review row), section 4 and section 4.1: dated "Corrected 2026-10-28"
  markers in place, stating the controls as the two-tier policy places them (ai-company-brain
  `instructions/shared/compliance.md`, "Where the control sits"): real data kept out of commits; the
  Codex GitHub connector on a no-BAA consumer account with no path check in front of it; the merge
  check and its deliberate bypasses (author self-approval, a label added without looking, admin merges
  on `develop` and `staging`); the brain guard as a tripwire. 4.1 also flags the n8n bot skip as gone and
  DeepSeek as lapsed. A "Later correction" paragraph under "Corrections in this successor" and a note
  on the register row record it. The memo stays unattested.
- `.claude/rules/data-bearing-paths.md`: an empty diff passes the gate; only a classifier failure fails it.
- `.claude/agents/compliance-officer.md`: the author's check before pushing keeps real data out; the gate
  gates merges, not publication.
- `scripts/tests/codex-review-path-classifier-test.sh`: 27 cases in `--data-bearing-only` mode, every arm
  of the extension pattern in lowercase and uppercase, one diff-mode case, and four pass-side cases
  (`tmp/mysql`, `CHANGELOG`, `tmp/notes.logic`, `tmp/report.csv.md`). The header now names the gate as
  the consumer.
- Register: `contentHash` re-rendered for the two unattested rows (`DOC-506bbe2039`, `DOC-d9f17c6919`).

## Verification

- Classifier suite 130 OK (was 103); data-bearing check 163 OK; real-repo classifier test 7 OK;
  frontend-scope 12 OK; `ruby scripts/document-register-render.rb --check` OK (109 docs).
- Mutants (scratch copies): dropping any one of the 11 extensions fails 2 to 4 new-suite cases; matching
  case-sensitively only in `--data-bearing-only` mode fails 12; dropping the extension pattern's `\.`,
  leaving the dot unescaped, or dropping its `$` anchor fails 2 each. The old 103-case suite caught only
  the `har`, `jsonl` and `log` drops (1 to 2 cases each) and passed every other mutant.

## Follow-ups (not in this PR)

- ai-company-brain `scripts/codex-review-guard.sh` is narrower than this repo's classifier: on stdin,
  `STUDENTS.CSV`, `spec/Fixtures/a.yml`, `exports/a.jsonl`, `x/a.har` and `x/a.log` all pass (rc 0)
  while `students.csv` and `spec/fixtures/a.yml` are blocked (rc 2), 2026-10-28. Needs a brain change.
- The `data-bearing-paths` workflow depends on an Actions policy that allows `pull_request_target`
  from 2026-11-02. A missing status blocks every merge on `main` and every non-admin merge on `develop`
  and `staging` (where `enforce_admins` is false, already stated in the memo), so the memo does not list
  it as a separate gap. Whether the event policy is set was not checked.
- The classifier has no rule for some data-format extensions, for example `.sqlite`, `.sqlite3`, `.db`,
  `.xlsm`, `.gz`, `.zip`, `.obf`, `.obz`. Adding them is a classifier change (a `CONTROL_FILES` edit).
- Memo section 7's vendor-terms item does not name OpenAI, whose consumer ChatGPT account the Codex
  connector runs on.

- The moved real-repo test's docstring and the PR 1225 task log's "still NAME" list are slightly off
  (PR 1225 fix review, Low 4).
