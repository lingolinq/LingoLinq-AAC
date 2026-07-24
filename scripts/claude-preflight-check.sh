#!/usr/bin/env bash
#
# claude-preflight-check.sh — mechanical subset of CLAUDE.md's "PR Preflight
# (P1-P6)" gate (added in PR #604), run automatically after claude-fix.yml's
# headless fix pass and before it pushes.
#
# HONEST SCOPE: only P3 is fully mechanical (it mirrors CI's
# audit-artifacts-integrity job exactly). P1, P2, P4, P5, P6 require human or
# model judgment (claim verification, entry-point enumeration, cross-doc
# consistency, the honest-status block, behavioral click-testing) and are NOT
# something a shell script can verify. This script runs what's checkable and
# prints an explicit reminder for the rest so claude-fix.yml's own PR comment
# can carry the judgment-based items forward instead of silently skipping them.
set -euo pipefail

FAILED=0

run_check() {
  local desc="$1"; shift
  echo "--- P3: $desc ---"
  if "$@"; then
    echo "PASS: $desc"
  else
    echo "FAIL: $desc" >&2
    FAILED=1
  fi
}

run_check "compliance calendar render matches JSON" ruby scripts/compliance-calendar-render.rb --check
run_check "Notion compliance page matches register" ruby scripts/compliance-notion-publish.rb --check
run_check "document register render + hashes + bundle" ruby scripts/document-register-render.rb --check
run_check "compliance publication status report" ruby scripts/compliance-publication-status.rb --check
run_check "capability ledger evidence resolves at HEAD" ruby scripts/capability-check.rb --check

echo "--- P3: whitespace / conflict markers ---"
if git diff --check; then
  echo "PASS: git diff --check"
else
  echo "FAIL: git diff --check" >&2
  FAILED=1
fi

cat <<'REMINDER' >&2

--- Judgment-based preflight items NOT covered by this script ---
P1 (claim verification), P2 (entry-point enumeration for auth/access changes),
P4 (cross-doc consistency sweep), P5 (honest status block in PR body), and
P6 (behavioral definition of done for UI flows) require re-reading CLAUDE.md's
"PR Preflight" section and applying judgment to THIS fix's diff. claude-fix.yml's
PR comment step must address these explicitly, not assume this script covered them.
REMINDER

exit "$FAILED"
