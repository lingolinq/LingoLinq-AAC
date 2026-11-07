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
