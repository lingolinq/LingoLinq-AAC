#!/usr/bin/env bash
#
# data-bearing-path-check.sh - fails a pull request that adds or changes a
# data-bearing path unless the PR carries a fresh synthetic-data label.
#
# WHY THIS EXISTS
#   Real user data is kept out of commits, not caught at review time (Scot,
#   2026-10-09; ai-company-brain instructions/shared/compliance.md, "Where the control
#   sits"; brain issue #233). This repo is public, so a pushed branch is already
#   published: this check is the merge gate that keeps real data out of develop,
#   staging and main, and flags it when a PR is opened or updated. It cannot unpublish
#   anything, anyone with write access can apply the label, and ruleset bypass actors
#   can merge past a required check.
#
#   A data-bearing path is not proof of real data: most fixtures, factories and schema
#   migrations are synthetic. The label is the exemption: the approving reviewer looks
#   at the data and applies `synthetic-data` only when none of it is real. The label
#   counts only when it was applied AFTER the PR's current head arrived on GitHub
#   (HEAD_ARRIVED_AT, a server time). The CI entry script also removes the label on a
#   push, a reopen or a base change, so the reviewer re-applies it for each new head.
#
#   What is checked:
#   - PRs to develop: the net tree diff (base...head). develop is squash-only (ruleset
#     13689135, 2026-10-09), so what merges is exactly the net diff; a file added and
#     then deleted inside the PR never reaches develop's history. Residual: an admin
#     who can bypass the ruleset, or a change to the repo's merge settings, could
#     merge with a merge commit and keep the PR's intermediate commits.
#   - PRs to staging or main: every commit reachable from the head but from neither
#     develop nor the base (head ^develop ^base), because those branches take merge
#     commits and a file added then deleted inside the PR would stay in their history.
#     A plain commit counts by its diff against its parent. A merge commit counts only
#     by its combined diff: the paths whose merged content differs from EVERY parent,
#     which is what the merge itself added (an "evil" merge). A release merge of
#     develop adds nothing of its own, so a weekly release PR does not trip on
#     develop's content again. This trusts develop's history: it was checked on its
#     way into develop. Residual: content develop added and later reverted is still
#     trusted, so a hotfix branch cut before the revert can carry it to main unflagged.
#   - The CI entry script fails closed unless the PR's base sha is still on the live
#     base branch, so a base force-pushed to scrub data cannot hide the scrubbed commit.
#   - Any change under .github/workflows/ and any change to the check's own files
#     (CONTROL_FILES) also needs the label, so the control gets a reviewer's look and a
#     PR cannot quietly add its own job named like this check.
#
#   The path patterns are not duplicated here. This script asks
#   scripts/codex-review-path-classifier.sh, which holds the list vendored from the
#   brain guard, lists renames as delete plus add, and fails closed.
#
# USAGE
#   scripts/data-bearing-path-check.sh <base-sha> <head-sha>
#
# ENV
#   PR_LABELS_JSON    JSON array of the PR's current label names (default: [])
#   LABEL_APPLIED_AT  ISO-8601 time the synthetic-data label was last applied
#   HEAD_ARRIVED_AT   ISO-8601 server time the head commit first reached GitHub
#                     (both required for the label to count)
#   PR_BASE_REF       the PR's base branch (default: develop)
#   DEVELOP_SHA       develop's tip; required when PR_BASE_REF is not develop
#   CLASSIFIER        path to the classifier (tests override it)
#
# EXIT CODES
#   0  nothing data-bearing (or workflow or control file) changed, or a fresh label
#      exempts it
#   1  such a path changed and there is no fresh label
#   3  nothing could be decided (classifier failure, no verdict, bad input); fail
#      closed. A label cannot clear exit 3. If a PR is stuck there (a git-quoted path,
#      a missing commit), rename the file or rebuild the branch.
#
set -uo pipefail

BASE_SHA="${1:?usage: $0 <base-sha> <head-sha>}"
HEAD_SHA="${2:?usage: $0 <base-sha> <head-sha>}"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CLASSIFIER="${CLASSIFIER:-$REPO_ROOT/scripts/codex-review-path-classifier.sh}"
LABELS_JSON="${PR_LABELS_JSON:-[]}"
LABEL_APPLIED_AT="${LABEL_APPLIED_AT:-}"
HEAD_ARRIVED_AT="${HEAD_ARRIVED_AT:-}"
PR_BASE_REF="${PR_BASE_REF:-develop}"
EXEMPT_LABEL="synthetic-data"
CONTROL_FILES=(
  .github/workflows/data-bearing-paths.yml
  scripts/data-bearing-path-check.sh
  scripts/data-bearing-path-check-ci.sh
  scripts/tests/data-bearing-path-check-test.sh
  scripts/codex-review-path-classifier.sh
  scripts/tests/codex-review-path-classifier-test.sh
)
GITQ='git -c core.quotepath=false'
WORKFLOW_DIR_RE='^\.github/workflows/'

die3() { echo "data-bearing-path-check: ERROR: $*. Nothing was decided; failing closed." >&2; exit 3; }

command -v jq >/dev/null 2>&1 || die3 "jq is not available"
jq -e 'type == "array"' >/dev/null 2>&1 <<<"$LABELS_JSON" \
  || die3 "PR_LABELS_JSON is not a JSON array"

OUT="$(mktemp)" || die3 "mktemp failed"
LIST="$(mktemp)" || die3 "mktemp failed"
trap 'rm -f "$OUT" "$LIST"' EXIT

# classify <classifier args...>: run the classifier and print true or false. Any
# classifier failure or a missing verdict stops the script (exit 3).
classify() {
  local rc=0 v
  : > "$OUT"
  GITHUB_OUTPUT="$OUT" bash "$CLASSIFIER" "$@" || rc=$?
  [ "$rc" = 0 ] || die3 "the path classifier exited $rc on $*"
  v="$(sed -n 's/^data_bearing=//p' "$OUT")"
  case "$v" in
    true|false) printf '%s' "$v" ;;
    *) die3 "the path classifier wrote no data_bearing verdict on $*" ;;
  esac
}

# has_line <grep-flags> <pattern>: does a line of $paths match? grep exit 1 is "no";
# anything above 1 stops the script rather than reading as "no". A here-string, not
# a pipe: under pipefail, grep exiting early can SIGPIPE the writer.
has_line() {
  local rc=0
  grep -a $1 -- "$2" >/dev/null <<<"$paths" || rc=$?
  case "$rc" in
    0) return 0 ;;
    1) return 1 ;;
    *) die3 "grep failed (exit $rc)" ;;
  esac
}

# nonblank <text>: does it hold any non-space character? Pure bash, so no helper
# process can fail and read as "empty".
nonblank() { [[ "$1" =~ [^[:space:]] ]]; }

verdict=false
if [ "$PR_BASE_REF" = develop ]; then
  paths="$($GITQ diff --name-only --no-renames --no-relative "$BASE_SHA...$HEAD_SHA")" \
    || die3 "git diff $BASE_SHA...$HEAD_SHA failed"
  if nonblank "$paths"; then
    verdict="$(classify "$BASE_SHA" "$HEAD_SHA")" || exit 3
  fi
else
  [ -n "${DEVELOP_SHA:-}" ] || die3 "PR_BASE_REF is $PR_BASE_REF but DEVELOP_SHA is not set"
  commits="$(git rev-list "$HEAD_SHA" "^$DEVELOP_SHA" "^$BASE_SHA")" \
    || die3 "git rev-list $HEAD_SHA ^$DEVELOP_SHA ^$BASE_SHA failed"
  # -c lists a plain commit's paths against its parent and a merge commit's paths
  # that differ from all its parents; --root covers a parentless commit.
  for c in $commits; do
    $GITQ diff-tree -r -c --root --no-commit-id --name-only --no-renames "$c" >> "$LIST" \
      || die3 "git diff-tree $c failed"
  done
  paths="$(cat -- "$LIST")" || die3 "could not read the path list"
  if nonblank "$paths"; then
    # Capture first: a failing classify inside a [ ] test would read as "false".
    verdict="$(classify --paths-from "$LIST")" || exit 3
  fi
fi

control_touched=false
for f in "${CONTROL_FILES[@]}"; do
  if has_line -xF "$f"; then control_touched=true; fi
done
if has_line -E "$WORKFLOW_DIR_RE"; then control_touched=true; fi

if [ "$verdict" = false ] && [ "$control_touched" = false ]; then
  echo "data-bearing-path-check: no data-bearing path changed."
  exit 0
fi

what="adds or changes a data-bearing path (a fixture, factory, seed, migration, VCR
cassette, data rake task, data file, or db/language/)"
[ "$verdict" = false ] && what="changes a workflow or this check's own files"

if jq -e --arg l "$EXEMPT_LABEL" 'index($l) != null' >/dev/null 2>&1 <<<"$LABELS_JSON"; then
  [ -n "$LABEL_APPLIED_AT" ] || die3 "the '$EXEMPT_LABEL' label is present but LABEL_APPLIED_AT is not set"
  [ -n "$HEAD_ARRIVED_AT" ] || die3 "the '$EXEMPT_LABEL' label is present but HEAD_ARRIVED_AT is not set"
  label_s="$(date -d "$LABEL_APPLIED_AT" +%s 2>/dev/null)" || die3 "cannot parse LABEL_APPLIED_AT '$LABEL_APPLIED_AT'"
  head_s="$(date -d "$HEAD_ARRIVED_AT" +%s 2>/dev/null)" || die3 "cannot parse HEAD_ARRIVED_AT '$HEAD_ARRIVED_AT'"
  if [ "$label_s" -gt "$head_s" ]; then
    echo "data-bearing-path-check: this PR $what; exempted by the '$EXEMPT_LABEL' label, applied after the head arrived (the reviewer confirms the data is synthetic)."
    exit 0
  fi
  cat >&2 <<EOF
data-bearing-path-check: FAIL. This PR $what,
and the '$EXEMPT_LABEL' label was applied before the current head arrived ($LABEL_APPLIED_AT is
not after $HEAD_ARRIVED_AT). Re-check the data, then remove and re-add the label.
EOF
  exit 1
fi

cat >&2 <<EOF
data-bearing-path-check: FAIL. This PR $what.
This repo is public, so real user data must never be committed here.
If every changed data file is synthetic, a reviewer confirms that and adds the
'$EXEMPT_LABEL' label; this check re-runs when the label is added.
The path patterns are in scripts/codex-review-path-classifier.sh.
EOF
exit 1
