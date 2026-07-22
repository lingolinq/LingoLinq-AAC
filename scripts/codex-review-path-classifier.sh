#!/usr/bin/env bash
#
# codex-review-path-classifier.sh — CI-side path classifier for the automated
# Codex review pipeline (codex-review.yml).
#
# WHY THIS EXISTS / RELATIONSHIP TO THE BRAIN GUARD
#   This is a vendored copy of ai-company-brain's
#   scripts/codex-review-guard.sh RISKY_PATTERNS list (Guard A: PII /
#   data-bearing paths). It is duplicated here rather than sourced from the
#   brain path because CI runners do not have the brain checkout available
#   (see the build spec's FLAG-2). Keep the pattern list in sync by hand;
#   if the brain guard's RISKY_PATTERNS changes, update this file's
#   DATA_BEARING_PATTERNS to match.
#
#   This script additionally classifies Guard B: whether the diff touches a
#   compliance-path (docs/legal/**, audit-reports/**). Guard B is a Tier 2
#   confidentiality PREFERENCE (instructions/shared/compliance.md), not a
#   regulatory control — see CODEX_COMPLIANCE_PATHS below.
#
# USAGE
#   scripts/codex-review-path-classifier.sh <base-sha> <head-sha>
#   (in GitHub Actions: pass github.event.pull_request.base.sha / head.sha)
#
# OUTPUT
#   Writes reviewer_route to $GITHUB_OUTPUT (or stdout as `key=value` lines
#   if GITHUB_OUTPUT is unset, e.g. for local testing):
#     data_bearing=true|false
#     compliance_path=true|false
#     reviewer_route=codex|claude-deep|blocked
#
#   reviewer_route resolution:
#     data_bearing=true                        -> blocked   (Tier 1, no external reviewer, regardless of any flag)
#     compliance_path=true AND CODEX_COMPLIANCE_PATHS=block -> claude-deep
#     otherwise                                -> codex
#
# ENV
#   CODEX_COMPLIANCE_PATHS=allow|block   (default: allow, per Tier 2 policy)
#
set -euo pipefail

BASE_SHA="${1:?usage: $0 <base-sha> <head-sha>}"
HEAD_SHA="${2:?usage: $0 <base-sha> <head-sha>}"
CODEX_COMPLIANCE_PATHS="${CODEX_COMPLIANCE_PATHS:-allow}"

# ---------------------------------------------------------------------------
# Guard A patterns — vendored from ai-company-brain/scripts/codex-review-guard.sh
# RISKY_PATTERNS. Keep in sync by hand (FLAG-2: no cross-repo `source`).
# Bias toward OVER-blocking: a false positive costs a manual re-route to
# claude-deep; a false negative would leak PHI/PII to a no-BAA model.
# ---------------------------------------------------------------------------
DATA_BEARING_PATTERNS=(
  '(^|/)(spec|test)/.*fixtures/'
  '(^|/)fixtures/'
  '(^|/)(spec|test)/.*factories/'
  '(^|/)factories/'
  '(^|/)(spec|test)/.*factories\.rb$'
  '(^|/)factories\.rb$'
  '(^|/)db/seeds(\.rb)?(/|$)'
  '(^|/)db/migrate/.*\.rb$'
  '(^|/)db/data/'
  '(^|/)lib/tasks/.*(seed|import|export|backfill|load|sync).*\.rake$'
  '(^|/)(spec|test)/(cassettes|vcr_cassettes|vcr)/'
  '(^|/)db/.*\.sql$'
  '\.(sql|dump|csv|tsv|ndjson|xlsx|xls|parquet)$'
  '(^|/)(fixtures|seeds|sample_data|test_data|data|exports?)/.*\.(json|ya?ml|xml)$'
  '(^|/)(fixtures|seeds|sample_data|test_data)/'
)

# Guard B patterns — compliance-path Tier 2 confidentiality preference.
COMPLIANCE_PATTERNS=(
  '(^|/)docs/legal/'
  '(^|/)audit-reports/'
)

GITQ='git -c core.quotepath=false'

paths="$($GITQ diff --name-only "$BASE_SHA...$HEAD_SHA")" \
  || { echo "classifier: git diff $BASE_SHA...$HEAD_SHA failed" >&2; exit 3; }

data_bearing=false
for pat in "${DATA_BEARING_PATTERNS[@]}"; do
  if printf '%s\n' "$paths" | grep -qE "$pat"; then
    data_bearing=true
    break
  fi
done

compliance_path=false
for pat in "${COMPLIANCE_PATTERNS[@]}"; do
  if printf '%s\n' "$paths" | grep -qE "$pat"; then
    compliance_path=true
    break
  fi
done

if [ "$data_bearing" = "true" ]; then
  reviewer_route="blocked"
elif [ "$compliance_path" = "true" ] && [ "$CODEX_COMPLIANCE_PATHS" = "block" ]; then
  reviewer_route="claude-deep"
else
  reviewer_route="codex"
fi

{
  echo "data_bearing=$data_bearing"
  echo "compliance_path=$compliance_path"
  echo "reviewer_route=$reviewer_route"
} | tee -a "${GITHUB_OUTPUT:-/dev/stdout}" >/dev/null

echo "classifier: data_bearing=$data_bearing compliance_path=$compliance_path (CODEX_COMPLIANCE_PATHS=$CODEX_COMPLIANCE_PATHS) -> reviewer_route=$reviewer_route" >&2
