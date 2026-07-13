#!/usr/bin/env bash
#
# regenerate-register.sh - one command to regenerate every derived compliance
# artifact after editing FINDINGS.json (or DOCUMENT-REGISTER.json / the
# compliance calendar JSON), then re-run CI's audit-artifacts-integrity --check
# verifications PLUS a stricter local citation-check evidence gate.
#
# WHY THIS EXISTS
#   The findings register (audit-reports/FINDINGS.json) and the document
#   register (audit-reports/DOCUMENT-REGISTER.json) are the sources of truth.
#   Four+ separate render scripts keep the human-readable / Notion-mirror
#   artifacts in sync, and CI fails the merge if ANY of them drifts. Running
#   them individually, in the right order, and remembering all of them, is the
#   recurring footgun that reddens audit-artifacts-integrity. This wrapper makes
#   "I edited the register, now make everything consistent" a single, ordered,
#   verified step.
#
# WHAT IT DOES (write mode, default)
#   1. citation-check (validate)          - gate: refuse to render onto a register
#                                           whose evidence snippets don't resolve.
#   2. document-register-render           - normalize DOCUMENT-REGISTER.json (id +
#                                           git content hashes) and render its .md.
#                                           Runs BEFORE publication-status, which
#                                           reads the document register.
#   3. citation-check --render            - rebuild audit-reports/FINDINGS.md.
#   4. compliance-calendar-render         - rebuild audit-reports/compliance-calendar.md.
#   5. compliance-notion-publish          - rebuild the LOCAL Notion mirror render
#                                           (audit-reports/notion/compliance-audit-page.md).
#   6. compliance-publication-status      - rebuild the publication status report.
#   7. Re-verify: the four CI artifact --check commands (== audit-artifacts-integrity)
#      PLUS a citation-check evidence gate. citation-check is intentionally NOT a CI
#      job (see ci.yml); running it here is a stricter local gate. Green here means a
#      green audit-artifacts-integrity in CI.
#
# WHAT IT DELIBERATELY DOES NOT DO
#   It never PUSHES to Notion or Drive. The Notion sync scripts
#   (compliance-findings-notion-sync.rb, document-register-notion-sync.rb) need
#   NOTION_TOKEN and have external side effects; they run in their own CI
#   workflows, not here. This wrapper only regenerates the committed local
#   artifacts that the integrity job checks, so it is safe to run any time with
#   no secrets and no network writes.
#
# USAGE
#   scripts/regenerate-register.sh            # regenerate everything, then verify
#   scripts/regenerate-register.sh --check    # verify only (mirror CI), write nothing
#   scripts/regenerate-register.sh --help
#
# EXIT
#   0  = all artifacts regenerated and every verification passed
#   1  = a render or verification failed (details printed; nothing half-committed
#        that CI would not also catch). Fix the reported step and re-run.
#
set -euo pipefail

# --- locate repo root so the script works from any cwd (incl. a worktree) -----
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

MODE="write"
case "${1:-}" in
  --check) MODE="check" ;;
  -h|--help)
    sed -n '2,40p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
    exit 0
    ;;
  "") ;;
  *)
    echo "regenerate-register: unknown argument '$1' (try --help)" >&2
    exit 2
    ;;
esac

FINDINGS="audit-reports/FINDINGS.json"

# --- pretty step runner -------------------------------------------------------
step() {  # step "label" cmd args...
  local label="$1"; shift
  printf '\n\033[1m==> %s\033[0m\n' "$label"
  printf '    $ %s\n' "$*"
  if "$@"; then
    printf '    \033[32mOK\033[0m\n'
  else
    printf '    \033[31mFAILED\033[0m: %s\n' "$label" >&2
    return 1
  fi
}

# --- verification bundle: the four CI artifact --check commands (these ARE
# audit-artifacts-integrity) plus a citation-check evidence gate. citation-check
# is intentionally NOT part of the CI integrity job (ci.yml); gating on it locally
# is a stricter, correct pre-render safeguard. ---------------------------------
verify_all() {
  step "verify: citation-check (evidence resolves; stricter-than-CI local gate)" \
    ruby scripts/citation-check.rb "$FINDINGS"
  step "verify: compliance calendar render matches JSON" \
    ruby scripts/compliance-calendar-render.rb --check
  step "verify: Notion compliance page matches register" \
    ruby scripts/compliance-notion-publish.rb --check
  step "verify: document register render + git hashes + bundle completeness" \
    ruby scripts/document-register-render.rb --check
  step "verify: compliance publication status report" \
    ruby scripts/compliance-publication-status.rb --check
  step "verify: capability ledger (currentEvidence at HEAD + negativeEvidence)" \
    ruby scripts/capability-check.rb --check
}

if [ "$MODE" = "check" ]; then
  echo "regenerate-register: --check (verify only, no writes)"
  if verify_all; then
    printf '\n\033[32mAll checks passed.\033[0m CI audit-artifacts-integrity would be green (plus a stricter local citation gate).\n'
    exit 0
  else
    printf '\n\033[31mIntegrity checks failed.\033[0m Run without --check to regenerate, then re-verify.\n' >&2
    exit 1
  fi
fi

# --- write mode: gate, then render in dependency order, then verify -----------
echo "regenerate-register: regenerating all derived compliance artifacts"

# Gate: never render onto a register whose evidence does not resolve. A red
# citation-check here almost always means a newly-added finding's snippet does
# not match its file at its sha, or the sha is not fetched locally. Fix the
# evidence (see .claude/skills/promote-finding/SKILL.md step 5) and re-run.
if ! step "gate: citation-check (evidence must resolve before rendering)" \
     ruby scripts/citation-check.rb "$FINDINGS"; then
  printf '\n\033[31mRefusing to render onto a register with unresolved evidence.\033[0m\n' >&2
  printf 'Fix the finding evidence (snippet must match file:line at its sha) and re-run.\n' >&2
  exit 1
fi

# document register first: it normalizes DOCUMENT-REGISTER.json (id + git
# content hashes) and publication-status reads the document register downstream.
step "render: document register (.md + normalize JSON hashes)" \
  ruby scripts/document-register-render.rb
step "render: FINDINGS.md from FINDINGS.json" \
  ruby scripts/citation-check.rb --render "$FINDINGS"
step "render: compliance calendar .md" \
  ruby scripts/compliance-calendar-render.rb
step "render: Notion compliance page (local mirror only, no push)" \
  ruby scripts/compliance-notion-publish.rb
step "render: compliance publication status report" \
  ruby scripts/compliance-publication-status.rb
step "render: capability ledger (validate at HEAD + write .md)" \
  ruby scripts/capability-check.rb

# The Notion mirror embeds a wall-clock "Page generated:" line that --check
# ignores by design. Rendering rewrites it every run, so a substantively
# unchanged register would still show a timestamp-only diff here. Suppress that
# churn: if the ONLY difference from HEAD is the volatile line, restore HEAD so
# the caller's diff shows real changes exclusively.
NOTION_PAGE="audit-reports/notion/compliance-audit-page.md"
if git diff --quiet -- "$NOTION_PAGE" 2>/dev/null; then
  : # unchanged, nothing to do
elif git diff -- "$NOTION_PAGE" 2>/dev/null \
       | grep -E '^[+-]' | grep -Ev '^(\+\+\+|---)' \
       | grep -qv 'Page generated'; then
  : # a non-timestamp line changed -> a real content change, keep the render
else
  git checkout -- "$NOTION_PAGE" 2>/dev/null || true  # timestamp-only churn, restore
fi

# Re-verify everything so a green run == green CI.
echo
echo "regenerate-register: re-verifying (mirrors CI audit-artifacts-integrity)"
if ! verify_all; then
  printf '\n\033[31mRegenerated but a verification still failed.\033[0m See the failed step above.\n' >&2
  exit 1
fi

# Show what changed so the caller knows exactly what to stage/commit.
echo
printf '\033[1m==> Regenerated artifacts (git status):\033[0m\n'
git status --short -- audit-reports/ docs/legal/ 2>/dev/null || true

printf '\n\033[32mDone.\033[0m All artifacts regenerated and every integrity check passed.\n'
printf 'Review the diff above, then commit. This wrapper did NOT push to Notion/Drive\n'
printf '(those sync in their own CI workflows). Only Scot closes/downgrades a finding.\n'
