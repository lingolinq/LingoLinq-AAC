#!/usr/bin/env bash
#
# data-bearing-path-check.sh - fails a pull request that adds or changes a
# data-bearing path unless its head commit carries a reviewer's approval.
#
# WHY THIS EXISTS
#   Real user data is kept out of commits, not caught at review time (Scot,
#   2026-10-09; ai-company-brain instructions/shared/compliance.md, "Where the control
#   sits"; brain issue #233). This repo is public, so a pushed branch is already
#   published: this check is the merge gate that keeps real data out of develop,
#   staging and main, and flags it when a PR is opened or updated. It cannot unpublish
#   anything, and ruleset bypass actors can merge past a required check.
#
#   A data-bearing path is not proof of real data: most fixtures, factories and schema
#   migrations are synthetic. The approval is the exemption: a reviewer with write
#   access looks at the data and adds the `synthetic-data` label only when none of it
#   is real. scripts/data-bearing-path-check-ci.sh records that as a commit status on
#   the PR's head commit, named for its base, with the scope of the change
#   set it covers, and passes APPROVED=true to this script only when that status is
#   present and its scope matches the range below. A new push is a new commit with no
#   approval, so nothing has to be reset. On a PR to develop the approval covers the data
#   scope (--data-scope below) and the CI script also accepts one recorded on an earlier
#   head whose data scope is the same, so a push that leaves every flagged file unchanged
#   keeps it.
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
#   - The CI entry script fetches the base branch live and fails closed unless the
#     PR's base sha is still on it. That covers a run after a base force-push (to scrub
#     data, say); a PR that went green before the force-push stays green until its
#     check runs again. The CI entry script's scope_of hashes the two ranges below; if
#     either range changes here, change scope_of to match. For develop the verdict and
#     the data scope read the same listing (raw_records), so they cannot disagree on a
#     name.
#   - Any change under .github/workflows/ and any change to the check's own files
#     (CONTROL_FILES) also needs an approval, so the control and any new workflow get a
#     reviewer's look before they merge.
#
#   The path patterns are not duplicated here. This script asks
#   scripts/codex-review-path-classifier.sh, which holds the list vendored from the
#   brain guard, lists renames as delete plus add, and fails closed.
#
# USAGE
#   scripts/data-bearing-path-check.sh <base-sha> <head-sha>
#   scripts/data-bearing-path-check.sh --data-scope <base-sha> <commit>...
#       PRs to develop only: print "<commit> <data scope>" for each commit, in order (see
#       data_scope below). The CI entry script records it in a develop approval and
#       compares it to keep an approval across pushes. Exit 0, or 3 on any failure.
#
# ENV
#   APPROVED          true when the head commit carries an approval for this PR and
#                     base, false when not (default: false; any other value is exit 3)
#   APPROVED_AT       optional; the earlier head whose approval was kept, for the message
#   DATA_SCOPE_CACHE  optional, --data-scope only; a file the per-path verdicts are kept in
#                     across runs (see path_flagged)
#   PR_BASE_REF       the PR's base branch (default: develop)
#   DEVELOP_SHA       develop's tip; required when PR_BASE_REF is not develop
#   CLASSIFIER        path to the classifier (tests override it)
#
# EXIT CODES
#   0  nothing data-bearing (or workflow or control file) changed, or an approval
#      exempts it
#   1  such a path changed and there is no approval
#   3  nothing could be decided (classifier failure, no verdict, bad input); fail
#      closed. An approval cannot clear exit 3. If a PR is stuck there (a git-quoted
#      path, a missing commit), rename the file or rebuild the branch.
#
set -uo pipefail
# Byte semantics, as in the classifier: path names need not be UTF-8.
export LC_ALL=C

MODE=verdict
if [ "${1:-}" = --data-scope ]; then
  MODE=data-scope
  shift
  if [ $# -lt 2 ]; then
    echo "data-bearing-path-check: ERROR: --data-scope takes a base and at least one commit. Nothing was decided; failing closed." >&2
    exit 3
  fi
fi
BASE_SHA="${1:?usage: $0 <base-sha> <head-sha> | --data-scope <base-sha> <commit>...}"
HEAD_SHA="${2:?usage: $0 <base-sha> <head-sha> | --data-scope <base-sha> <commit>...}"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CLASSIFIER="${CLASSIFIER:-$REPO_ROOT/scripts/codex-review-path-classifier.sh}"
APPROVED="${APPROVED-false}"
PR_BASE_REF="${PR_BASE_REF:-develop}"
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

case "$APPROVED" in
  true|false) ;;
  *) die3 "APPROVED is '$APPROVED', not true or false" ;;
esac

OUT="$(mktemp)" || die3 "mktemp failed"
LIST="$(mktemp)" || die3 "mktemp failed"
ONE="$(mktemp)" || die3 "mktemp failed"
CLEAN="$(mktemp)" || die3 "mktemp failed"
trap 'rm -f "$OUT" "$LIST" "$ONE" "$CLEAN"' EXIT

# classify <classifier args...>: run the classifier and print true or false. Any
# classifier failure or a missing verdict stops the script (exit 3). --data-bearing-only:
# this check sends nothing to a reviewer, so the classifier's reviewer-only UTF-8 check
# does not apply here, and no route is written.
classify() {
  local rc=0 v
  : > "$OUT"
  GITHUB_OUTPUT="$OUT" bash "$CLASSIFIER" --data-bearing-only "$@" || rc=$?
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

# raw_records <base> <head>: one raw record per path changed in base...head (the range a
# PR to develop merges), ":<old mode> <new mode> <old blob> <new blob> <status>\t<path>".
# The names are written as the classifier reads them (core.quotepath=false: a non-ASCII
# name stays raw, a name with a tab, newline, quote or backslash is C-quoted and the
# classifier refuses it). The verdict and the data scope both read this one listing.
raw_records() {
  $GITQ diff --raw --no-abbrev --no-renames --no-relative "$1...$2"
}

# path_of <record>: the record's path (after its first tab), in REPLY. A record without
# a tab is not one git writes, so it stops the script.
path_of() {
  [[ "$1" == :*$'\t'?* ]] || die3 "unexpected raw diff line"
  REPLY="${1#*$'\t'}"
}

# is_control <path>: a workflow or one of the check's own files.
is_control() {
  local f
  [[ "$1" =~ $WORKFLOW_DIR_RE ]] && return 0
  for f in "${CONTROL_FILES[@]}"; do [ "$1" = "$f" ] && return 0; done
  return 1
}

# path_flagged <path>: is this one path data-bearing, by the classifier? true or false in
# REPLY, cached by path for this process (a path's verdict depends on its name only). A path
# can hold $(...) or [...]: the key is only ever read as "${DATA_PATH[$key]+set}" or
# "${DATA_PATH[$key]}" and written as DATA_PATH[$key]=, which expand it once as data. Never
# test it with [ -v "DATA_PATH[$key]" ] or inside (( )): bash evaluates the subscript again
# there and runs any command in the name.
#
# DATA_SCOPE_CACHE (optional) names a file that carries the cache across runs of this
# script (the CI script asks for one commit per run): lines "<true|false><tab><path>",
# written only here. A path holds no tab or newline (git C-quotes those, and the
# classifier refuses a quoted name), so a line splits at its one tab.
declare -A DATA_PATH=()
if [ -n "${DATA_SCOPE_CACHE:-}" ] && [ -s "$DATA_SCOPE_CACHE" ]; then
  while IFS= read -r cline; do
    cv="${cline%%$'\t'*}"
    cp="${cline#*$'\t'}"
    case "$cv" in true|false) ;; *) die3 "a DATA_SCOPE_CACHE line is malformed" ;; esac
    [ -n "$cp" ] && [ "$cp" != "$cline" ] || die3 "a DATA_SCOPE_CACHE line is malformed"
    DATA_PATH["p:$cp"]="$cv"
  done < "$DATA_SCOPE_CACHE"
fi
path_flagged() {
  local key="p:$1" v
  if [ -n "${DATA_PATH[$key]+set}" ]; then REPLY="${DATA_PATH[$key]}"; return 0; fi
  printf '%s\n' "$1" > "$ONE" || die3 "could not write the one-path list"
  v="$(classify --paths-from "$ONE")" || exit 3
  DATA_PATH[$key]="$v"
  if [ -n "${DATA_SCOPE_CACHE:-}" ]; then
    printf '%s\t%s\n' "$v" "$1" >> "$DATA_SCOPE_CACHE" || die3 "could not write DATA_SCOPE_CACHE"
  fi
  REPLY="$v"
}

# data_scope <base> <commit>: the change a develop approval covers, in REPLY: the first 40
# hex of the sha256 of "develop" and then every flagged record of base...commit (a
# data-bearing path, a workflow or a control file), one per line, in git's order. The old
# and new blobs and modes are in each record, so a content edit, a mode change, a flagged
# file added or removed, or a different merge-base blob under one gives another scope. With
# nothing flagged it is the hash of "develop" alone. The whole list is classified first, so
# a commit with nothing data-bearing costs one classifier run. If the list verdict and the
# single-path verdicts disagree (data-bearing as a list but no path alone, or the paths
# called clean alone not clean as a list), the scope could miss a path, so it stops.
data_scope() {
  local recs line text p data_path n_data=0 list_verdict=false clean_verdict control=false h
  recs="$(raw_records "$1" "$2")" || die3 "git diff $1...$2 failed"
  text=$'develop\n'
  if nonblank "$recs"; then
    : > "$LIST"
    while IFS= read -r line; do
      path_of "$line"
      printf '%s\n' "$REPLY" >> "$LIST" || die3 "could not write the path list"
      is_control "$REPLY" && control=true
    done <<<"$recs"
    list_verdict="$(classify --paths-from "$LIST")" || exit 3
    if [ "$list_verdict" = true ] || [ "$control" = true ]; then
      : > "$CLEAN"
      while IFS= read -r line; do
        path_of "$line"
        p="$REPLY"
        # A control path can be data-bearing by name too (.github/workflows/data.csv), so
        # it is classified like any other path when the list is data-bearing; each record
        # goes into the scope once either way.
        data_path=false
        if [ "$list_verdict" = true ]; then
          path_flagged "$p"
          data_path="$REPLY"
        fi
        if [ "$data_path" = true ]; then
          n_data=$((n_data + 1))
        elif [ "$list_verdict" = true ] && ! is_control "$p"; then
          printf '%s\n' "$p" >> "$CLEAN" || die3 "could not write the clean-path list"
        fi
        if [ "$data_path" = true ] || is_control "$p"; then
          text+="$line"$'\n'
        fi
      done <<<"$recs"
      # The scope must hold every path the list verdict counts: at least one path is
      # data-bearing alone, and the paths called clean one at a time are clean as a list.
      if [ "$list_verdict" = true ]; then
        [ "$n_data" -gt 0 ] || die3 "the classifier flags $1...$2 as data-bearing but no single path in it"
        if [ -s "$CLEAN" ]; then
          clean_verdict="$(classify --paths-from "$CLEAN")" || exit 3
          [ "$clean_verdict" = false ] \
            || die3 "the classifier flags the paths of $1...$2 it called clean one at a time"
        fi
      fi
    fi
  fi
  h="$(printf '%s' "$text" | sha256sum)" || die3 "sha256sum failed"
  h="${h:0:40}"
  [[ "$h" =~ ^[0-9a-f]{40}$ ]] || die3 "sha256sum gave no hash"
  REPLY="$h"
}

if [ "$MODE" = data-scope ]; then
  [ "$PR_BASE_REF" = develop ] || die3 "--data-scope is for PRs to develop, not $PR_BASE_REF"
  shift
  for c in "$@"; do
    full="$(git rev-parse --verify --quiet "$c^{commit}")" || die3 "commit $c did not resolve"
    data_scope "$BASE_SHA" "$full"
    printf '%s %s\n' "$full" "$REPLY" || die3 "could not write the data scope"
  done
  exit 0
fi

verdict=false
if [ "$PR_BASE_REF" = develop ]; then
  recs="$(raw_records "$BASE_SHA" "$HEAD_SHA")" || die3 "git diff $BASE_SHA...$HEAD_SHA failed"
  paths=""
  if nonblank "$recs"; then
    : > "$LIST"
    while IFS= read -r line; do
      path_of "$line"
      printf '%s\n' "$REPLY" >> "$LIST" || die3 "could not write the path list"
    done <<<"$recs"
    paths="$(cat -- "$LIST")" || die3 "could not read the path list"
    verdict="$(classify --paths-from "$LIST")" || exit 3
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

if [ "$APPROVED" = true ]; then
  if [ -n "${APPROVED_AT:-}" ]; then
    echo "data-bearing-path-check: this PR $what; exempted by a reviewer's approval recorded on the earlier head $APPROVED_AT (the reviewer confirmed the data is synthetic), and no flagged file has changed since."
  else
    echo "data-bearing-path-check: this PR $what; exempted by a reviewer's approval recorded on this head commit (the reviewer confirmed the data is synthetic)."
  fi
  exit 0
fi

cat >&2 <<EOF
data-bearing-path-check: FAIL. This PR $what.
This repo is public, so real user data must never be committed here.
If every changed data file is synthetic, a reviewer with write access confirms that and
adds the 'synthetic-data' label. That records an approval on the current head commit, and
the label is removed once it is recorded. On a PR to develop the approval is kept across
later pushes that leave every flagged file (data, workflow or this check's own) unchanged;
a push that changes one needs the label again. On a PR to staging or main, every later
push needs it again. The path patterns are in scripts/codex-review-path-classifier.sh.
EOF
exit 1
