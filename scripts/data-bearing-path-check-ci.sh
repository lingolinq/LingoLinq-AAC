#!/usr/bin/env bash
#
# data-bearing-path-check-ci.sh - the GitHub Actions entry point for
# scripts/data-bearing-path-check.sh. It reads the PR's current state from the API at
# decision time and passes it to the check.
#
# WHY A SEPARATE SCRIPT
#   The decision depends on live state, not the event payload: a re-run reuses the
#   original payload, so a label removed since would still count. Keeping this logic
#   out of the workflow YAML lets scripts/tests/data-bearing-path-check-test.sh run it
#   against a stubbed `gh`.
#
#   The synthetic-data label counts only when it was applied after the PR's current
#   head ARRIVED on GitHub. Arrival is the creation time of the earliest check suite
#   GitHub made for the head commit, which happens when the commit is pushed. The
#   commit's own committer time is not used: it comes from the author's machine, and a
#   commit made before review but pushed after it would carry an earlier time.
#   Arrival is per commit, not per PR: a commit first pushed to another branch carries
#   that earlier time. So a push (synchronize), a reopen, or a base change REMOVES the
#   label before anything is read, and the reviewer re-applies it for the new head.
#   The removal uses the workflow's token, and an event caused by that token starts no
#   new workflow run, so it cannot cancel this one. The time check stays for the race
#   between a push and its own run.
#
#   The PR's commits must already be in the checkout (the workflow fetches
#   refs/pull/<n>/head); a missing commit makes the check fail closed.
#
# ENV (required unless noted)
#   REPO            owner/name
#   PR_NUMBER       the pull request number
#   EVENT_HEAD_SHA  the head SHA in the triggering event
#   EVENT_ACTION    the pull_request_target activity type (opened, synchronize, ...)
#   BASE_FROM       optional; the previous base ref when an edited event changed it
#   GH_TOKEN        token for gh (pull-requests: write, to remove the label; issues and
#                   checks: read)
#   CHECK           optional; path to data-bearing-path-check.sh (tests override it)
#
# EXIT CODES
#   whatever the check returns (0, 1, 3); 3 from this script when any lookup fails or
#   the head moved, before the check runs
#
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CHECK="${CHECK:-$REPO_ROOT/scripts/data-bearing-path-check.sh}"
EXEMPT_LABEL="synthetic-data"

fail3() { echo "data-bearing-path-check: $*; failing closed." >&2; exit 3; }

for v in REPO PR_NUMBER EVENT_HEAD_SHA EVENT_ACTION; do
  [ -n "${!v:-}" ] || fail3 "$v is not set"
done

# read_pr: read the PR's live state into pr, head_sha, base_sha, base_ref and labels,
# and stop unless the head is still the event's head (the run for a newer head decides,
# and a stale run must not touch a label applied for that newer head).
read_pr() {
  pr="$(gh api "repos/$REPO/pulls/$PR_NUMBER")" || fail3 "could not read PR $PR_NUMBER"
  head_sha="$(jq -er '.head.sha' <<<"$pr")" || fail3 "no head sha"
  base_sha="$(jq -er '.base.sha' <<<"$pr")" || fail3 "no base sha"
  base_ref="$(jq -er '.base.ref' <<<"$pr")" || fail3 "no base ref"
  [ "$head_sha" = "$EVENT_HEAD_SHA" ] \
    || fail3 "the PR head moved to $head_sha; the run for that head decides"
  labels="$(jq -c '[.labels[].name]' <<<"$pr")" || fail3 "could not read labels"
}

# has_label: is the exemption label in $labels? jq exit 1 is "no"; anything else stops.
has_label() {
  local rc=0
  jq -e --arg l "$EXEMPT_LABEL" 'index($l) != null' >/dev/null <<<"$labels" || rc=$?
  case "$rc" in
    0) return 0 ;;
    1) return 1 ;;
    *) fail3 "could not read labels (jq exit $rc)" ;;
  esac
}

read_pr

reset=false
case "$EVENT_ACTION" in
  synchronize|reopened) reset=true ;;
  edited) [ -z "${BASE_FROM:-}" ] || reset=true ;;
esac
if [ "$reset" = true ] && has_label; then
  gh api -X DELETE "repos/$REPO/issues/$PR_NUMBER/labels/$EXEMPT_LABEL" --silent \
    || fail3 "could not remove the '$EXEMPT_LABEL' label after $EVENT_ACTION"
  echo "data-bearing-path-check: removed the '$EXEMPT_LABEL' label ($EVENT_ACTION); a reviewer re-applies it for the new head." >&2
  read_pr
fi

applied=""
arrived=""
if has_label; then
  events="$(gh api --paginate "repos/$REPO/issues/$PR_NUMBER/events" \
    --jq ".[] | select(.event == \"labeled\" and .label.name == \"$EXEMPT_LABEL\") | .created_at")" \
    || fail3 "could not read label events"
  # sed -n reads all of its input, so sort never meets a closed pipe (SIGPIPE).
  applied="$(printf '%s\n' "$events" | sed '/^$/d' | sort | sed -n '$p')"
  [ -n "$applied" ] || fail3 "the '$EXEMPT_LABEL' label is present but no labeled event was found"
  suites="$(gh api --paginate "repos/$REPO/commits/$head_sha/check-suites" \
    --jq '.check_suites[].created_at')" \
    || fail3 "could not read check suites for $head_sha"
  arrived="$(printf '%s\n' "$suites" | sed '/^$/d' | sort | sed -n '1p')"
  [ -n "$arrived" ] || fail3 "no check suite found for $head_sha"
fi

# The API's base.sha is the base as of the PR's last update. If the base branch has
# since been force-pushed (to scrub real data, say), that sha may no longer be on it,
# and a range from it would hide the scrubbed commit. It must still be an ancestor of
# the live base branch in this checkout.
case "$base_ref" in
  develop|staging|main) ;;
  *) fail3 "unexpected base branch '$base_ref'" ;;
esac
live_base="$(git rev-parse --verify --quiet "refs/remotes/origin/$base_ref")" \
  || fail3 "origin/$base_ref is not in the checkout"
git merge-base --is-ancestor "$base_sha" "$live_base" \
  || fail3 "the PR's base $base_sha is not on the live $base_ref ($live_base); update the PR branch"

develop_sha=""
if [ "$base_ref" != develop ]; then
  develop_sha="$(git rev-parse --verify --quiet refs/remotes/origin/develop)" \
    || fail3 "origin/develop is not in the checkout"
fi

PR_LABELS_JSON="$labels" LABEL_APPLIED_AT="$applied" HEAD_ARRIVED_AT="$arrived" \
  PR_BASE_REF="$base_ref" DEVELOP_SHA="$develop_sha" \
  bash "$CHECK" "$base_sha" "$head_sha"
