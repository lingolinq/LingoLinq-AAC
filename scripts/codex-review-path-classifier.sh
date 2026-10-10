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
#   DATA_BEARING_PATTERNS to match, and the same for LANGUAGE_PATTERN, which is
#   copied verbatim.
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
#   Writes these `key=value` lines to $GITHUB_OUTPUT (with GITHUB_OUTPUT unset they
#   are discarded; the one-line summary on stderr shows the result for local runs):
#     data_bearing=true|false
#     compliance_path=true|false
#     reviewer_route=codex|claude-deep|blocked
#
#   reviewer_route resolution:
#     data_bearing=true                        -> blocked   (Tier 1, no external reviewer, regardless of any flag)
#     compliance_path=true AND CODEX_COMPLIANCE_PATHS=block -> claude-deep
#     otherwise                                -> codex
#
# EXIT CODES
#   0  classified; the route above was written
#   3  nothing was classified: a git diff failure, an empty diff, a git-quoted
#      path the patterns cannot read, or a grep failure. No route is written and
#      the step fails, so the job stops before any reviewer runs (fail closed).
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
# Matched in any letter case (grep -i below): an export named STUDENTS.CSV or a
# Fixtures/ directory is the same data to the reviewer.
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

# db/language/ holds generated vocabulary, which is data-bearing (matched in any
# letter case, since a case-insensitive checkout serves DB/Language/ as db/language/).
# Every path under it is data-bearing, the vendored upstream files included.
# Vendored from the brain guard's LANGUAGE_PATTERN.
LANGUAGE_PATTERN='(^|/)[dD][bB]/[lL][aA][nN][gG][uU][aA][gG][eE](/|$)'

# Guard B patterns — compliance-path Tier 2 confidentiality preference.
COMPLIANCE_PATTERNS=(
  '(^|/)docs/legal/'
  '(^|/)audit-reports/'
)

# Byte semantics for every grep below: in a UTF-8 locale one invalid byte in a path
# makes grep treat the list as binary and stops `.` matching it.
export LC_ALL=C

GITQ='git -c core.quotepath=false'   # keep non-ASCII paths literal so patterns match

die3() { echo "classifier: ERROR: $*. Nothing was classified; failing closed." >&2; exit 3; }

# --no-renames lists a rename as a delete plus an add, so both the old and the new
# name are classified. --no-relative keeps a diff.relative setting from trimming
# the paths the anchored patterns read.
paths="$($GITQ diff --name-only --no-renames --no-relative "$BASE_SHA...$HEAD_SHA")" \
  || die3 "git diff $BASE_SHA...$HEAD_SHA failed"

# An empty listing is not evidence of a clean diff, so it cannot route to a reviewer.
if [ -z "$(printf '%s' "$paths" | tr -d '[:space:]')" ]; then
  die3 "the diff lists no changed files"
fi

# select_paths <out-var> <input> <grep-flags> <ERE>: grep exit 1 means "no lines";
# anything above 1 is a classifier failure and stops the script rather than
# reading as "no match". grep runs without -q, so it reads the whole list and
# its own status is the one pipefail reports.
select_paths() {
  local rc=0 out
  out="$(printf '%s\n' "$2" | grep -a $3 -E -- "$4")" || rc=$?
  case "$rc" in
    0) printf -v "$1" '%s' "$out" ;;
    1) printf -v "$1" '%s' "" ;;
    *) die3 "the path classifier failed (grep exit $rc)" ;;
  esac
}

# git C-quotes a path it cannot print literally (a tab, a quote, a backslash, a
# newline): "db/language/en/a\tb.json". Anchored patterns cannot see through the
# leading quote, so a quoted line is unreadable input, not a clean one.
select_paths quoted "$paths" "" '^"'
[ -z "$quoted" ] || die3 "a path in the diff is git-quoted and cannot be classified reliably"

data_bearing=false
for pat in "${DATA_BEARING_PATTERNS[@]}"; do
  select_paths match "$paths" "-i" "$pat"
  if [ -n "$match" ]; then
    data_bearing=true
    break
  fi
done
if [ "$data_bearing" = "false" ]; then
  select_paths match "$paths" "" "$LANGUAGE_PATTERN"
  [ -z "$match" ] || data_bearing=true
fi

compliance_path=false
for pat in "${COMPLIANCE_PATTERNS[@]}"; do
  select_paths match "$paths" "-i" "$pat"
  if [ -n "$match" ]; then
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
