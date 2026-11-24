# #777 isolate attestation harness mutation

## Fact sheet

- **(a) READ.** `scripts/tests/attestation-hash-guard-test.sh` appends to
  `docs/legal/AI_GOVERNANCE_MEMO.md` (drift case and launder case) and to
  `docs/legal/ACCESSIBILITY_CONFORMANCE_REPORT.md` (unattested-routing case).
  `scripts/regenerate-register.sh` `--check` and write mode both call that
  harness from `verify_all`. CI `audit-artifacts-integrity` runs the same
  script. CONFIRMED (`attestation-hash-guard-test.sh:180,201,233`,
  `regenerate-register.sh:139`, `.github/workflows/ci.yml` attestedContentHash
  step).
- **(b) SHAPES.** Live checkout path after `cd` to toplevel. INT/TERM restore
  the snapshot; SIGKILL/OOM does not. Scratch register copies in
  `audit-reports/` are per-PID. CONFIRMED (header comments and traps in the
  harness).
- **(c)** `load_domain` claim N/A. The render hashes git-tracked bytes under
  `REPO_ROOT`; a synthetic fixture would not exercise the pin. CONFIRMED
  (`document-register-render.rb` REPO_ROOT containment and attested hash
  compare).

## Candidates

1. Re-exec the whole harness inside a throwaway `git worktree` (issue preferred).
2. Copy only the two legal files to `/tmp` and point MEMO at them — rejected:
   the render requires a real tracked path inside REPO_ROOT.
3. `git clone --local` into `/tmp` — fallback if `worktree add` is unavailable.

## Red test

`scripts/tests/attestation-hash-guard-isolation-test.sh`: chmod a-w on the two
live legal files, run the harness, assert exit 0 and byte identity. Fails
today because the harness still appends to the live memo.

## Review follow-up (senior-dev and adversary passes on 81549038e)

The throwaway worktree is checked out at HEAD, so the harness judged committed files, not the files on disk. Two regressions against develop, both reproduced:

- **False green:** with the pin check disabled by an uncommitted edit to `scripts/document-register-render.rb`, develop's harness reports 5 failures and this branch said OK.
- **False red:** after committing an edit to an attested doc and reverting it on disk (the routine fix in `docs/legal/COMPLIANCE_DOCS_GUIDE.md`), develop passes and this branch failed 2 guards.

Fix: after `git worktree add`, copy the caller's uncommitted state of `docs/legal`, `audit-reports` and `scripts` (modified, deleted and untracked non-ignored paths) into the throwaway. It reads the live tree only. After the fix both scenarios match develop. A full `--check` on a clean tree passes, and with an uncommitted legal-doc edit present only the render's expected contentHash step fails; in both runs no file under `docs/legal/` changed.

Also: `unset GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE GIT_COMMON_DIR GIT_OBJECT_DIRECTORY` now runs before `git worktree add`, so a git hook's environment cannot make it write the caller's index. A run with a hook-style `GIT_INDEX_FILE` left both indexes unchanged.

Not automated: a test for the copy step would have to edit the live tree, which is what #777 removes. Verified by hand as above.

Still open: acceptance criterion 5 (`--check` as a superset of CI) is not met by the CI-only isolation step; that is a decision for the issue owner.
