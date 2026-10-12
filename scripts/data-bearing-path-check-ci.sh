#!/usr/bin/env bash
#
# data-bearing-path-check-ci.sh - the GitHub Actions entry point for
# scripts/data-bearing-path-check.sh. It records a reviewer's approval and the check's
# verdict as commit statuses on the PR's exact head commit.
#
# WHY COMMIT STATUSES
#   An approval has to cover one base branch and one head commit, and nothing else. A
#   commit status sits on exactly one commit, and its name (context) carries the base:
#   data-bearing-approval/<base>. Two PRs with the same head and base merge identical
#   content, so they share it (Scot, 2026-10-11). A push makes a new head commit with
#   no statuses, so nothing has to be reset, and no later event can carry an earlier
#   approval forward to it. The verdict is a status on the same head,
#   data-bearing-paths/<base>, and that context is the required check, one per base
#   branch so a head shared by PRs to different bases cannot overwrite another base's
#   verdict.
#
#   Statuses are posted with a token from a dedicated GitHub App (STATUS_TOKEN), and
#   the required check is pinned to that App. A workflow token, which any workflow in a
#   same-repo PR can hold, posts as github-actions[bot] and cannot satisfy the check or
#   forge an approval. The App's key lives in an environment limited to develop, which
#   only this pull_request_target workflow (running from develop) can enter.
#
#   The decision reads live state from the API, not the event payload (a re-run reuses
#   the payload). It decides only for the PR's current head: a run whose event head has
#   moved on posts nothing, because the run for the newer head decides.
#
# APPROVAL
#   On a `labeled` event for the synthetic-data label, if this is the run's first
#   attempt (GITHUB_RUN_ATTEMPT, set by GitHub), the label is still on the PR, the
#   person who added it has write, maintain or admin access (the API reports write
#   or admin), and the PR's head, base branch and change set are still the ones in the
#   event, this script posts the approval status on the head and then removes the label.
#   The label works as a button: adding it records an approval for the head current at
#   that moment, and a later push needs it added again. A label added by a bot or by
#   someone with read or triage access records nothing and is removed. A re-run
#   replays the same event, so it never records an approval, even when the label is
#   still on (its removal is best effort); a labeled run removes the label on every
#   exit it reaches.
#
#   The approval's description names its scope (scope_of below): the change set the
#   check examines for that base and head. It counts only while the scope computed now
#   is the same, so a base rewrite that changes what the head brings in voids it.
#
#   An approval status counts only when its latest entry is `success` and its creator is
#   the App (STATUS_LOGIN). Agents never add this label: they run under a person's
#   account, and this check cannot tell the two apart. The author may approve their own
#   PR. Anyone with write access can still get past the check deliberately (for example
#   by adding the label without looking, or through a ruleset bypass); it guards against
#   mistakes and fork PRs. Any change under .github/workflows/ needs an approval before
#   it merges.
#
# BASE
#   The base branch must be develop, staging or main. It is fetched live from origin
#   just before the check (the checkout's own remote-tracking refs can point at the
#   event's commit), and the PR's base sha must still be on it, so a run after a base
#   force-push fails closed and replaces an earlier pass with an error. A PR that went
#   green before such a force-push stays green until its check runs again; the re-run
#   computes the new scope, which an earlier approval does not name.
#
#   The PR's commits must already be in the checkout (the workflow fetches
#   refs/pull/<n>/head); a missing commit makes the check fail closed.
#
# USAGE
#   scripts/data-bearing-path-check-ci.sh              decide, and record an approval
#   scripts/data-bearing-path-check-ci.sh --mark pending|error
#       post that state for data-bearing-paths/<EVENT_BASE_REF> on EVENT_HEAD_SHA, by
#       hand. The workflow posts both inline (pending before its checkout, error from its
#       failure step), so neither depends on the checkout.
#
# ENV (required unless noted)
#   REPO            owner/name
#   PR_NUMBER       the pull request number
#   EVENT_HEAD_SHA  the head SHA in the triggering event
#   EVENT_BASE_REF  the base branch in the triggering event
#   EVENT_BASE_SHA  on a labeled event, the PR's base sha in the event
#   GITHUB_RUN_ATTEMPT  set by GitHub; on a labeled event only attempt 1 records
#   EVENT_ACTION    the pull_request_target activity type (opened, labeled, ...)
#   RUN_URL         this workflow run's URL, linked from the statuses
#   LABEL_NAME      on a labeled event, the label that was added (optional otherwise)
#   SENDER_LOGIN    on a labeled event, who added it
#   SENDER_TYPE     on a labeled event, User or Bot
#   GH_TOKEN        the workflow token, for every call except posting statuses
#                   (pull-requests: write, to remove the label)
#   STATUS_TOKEN    the App's installation token (statuses: write), used only to post
#   STATUS_LOGIN    the App's login, <slug>[bot]; an approval must come from it
#   CHECK           optional; path to data-bearing-path-check.sh (tests override it)
#
# EXIT CODES
#   whatever the check returns (0, 1, 3); 0 when the event head has moved on (nothing
#   decided or posted); 3 from this script when any lookup or post fails. --mark: 0
#   posted (or nothing to post for a base outside the allowlist), 3 otherwise.
#
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CHECK="${CHECK:-$REPO_ROOT/scripts/data-bearing-path-check.sh}"
EXEMPT_LABEL="synthetic-data"

head_sha=""
VERDICT_CTX=""
approval_event=false

# post_status <sha> <context> <state> <description>: with the App token only.
post_status() {
  GH_TOKEN="$STATUS_TOKEN" gh api -X POST "repos/$REPO/statuses/$1" -f state="$3" \
    -f context="$2" -f description="$4" -f target_url="$RUN_URL" --silent
}

# fail3: stop. Once the verdict context is known, replace any earlier verdict on the
# head with an error, so a pass from before (a stale base, say) does not stand.
fail3() {
  echo "data-bearing-path-check: $*; failing closed." >&2
  if [ -n "$VERDICT_CTX" ] && [ -n "$head_sha" ]; then
    post_status "$head_sha" "$VERDICT_CTX" error "Could not decide; see the workflow run." \
      || echo "data-bearing-path-check: could not post the error verdict either." >&2
  fi
  # A labeled run removes the label on every exit it reaches, so it can be added again.
  [ "$approval_event" != true ] || remove_label
  exit 3
}

remove_label() {
  gh api -X DELETE "repos/$REPO/issues/$PR_NUMBER/labels/$EXEMPT_LABEL" --silent \
    || echo "data-bearing-path-check: could not remove the '$EXEMPT_LABEL' label; remove it by hand before adding it again." >&2
}

# scope_of <base-ref> <base-sha> <head> [develop-sha]: the change set the check examines
# for that base, as the first 40 hex of a sha256. For develop it hashes the raw diff
# base...head, the range data-bearing-path-check.sh reads with
# `git diff --name-only --no-renames --no-relative "$BASE_SHA...$HEAD_SHA"`; for staging
# and main the sorted commits head ^develop ^base, the list it reads with
# `git rev-list "$HEAD_SHA" "^$DEVELOP_SHA" "^$BASE_SHA"`. An approval records the scope
# it was given for and counts only while the scope is unchanged.
scope_of() {
  local text h
  if [ "$1" = develop ]; then
    text="$(printf '%s\n' "$1"; git diff --raw --no-abbrev --no-renames --no-relative "$2...$3")" || return 1
  else
    text="$(printf '%s\n' "$1"; git rev-list "$3" "^$4" "^$2" | sort)" || return 1
  fi
  h="$(printf '%s\n' "$text" | sha256sum)" || return 1
  h="${h:0:40}"
  [[ "$h" =~ ^[0-9a-f]{40}$ ]] || return 1
  printf '%s' "$h"
}

if [ "${1:-}" = --mark ]; then
  mark="${2:-}"
  for v in REPO EVENT_HEAD_SHA EVENT_BASE_REF RUN_URL STATUS_TOKEN; do
    [ -n "${!v:-}" ] || fail3 "$v is not set"
  done
  case "$mark" in
    pending) desc="Checking data-bearing paths." ;;
    error) desc="The check did not finish; see the workflow run." ;;
    *) fail3 "--mark takes pending or error, not '$mark'" ;;
  esac
  case "$EVENT_BASE_REF" in
    develop|staging|main) ;;
    *) echo "data-bearing-path-check: base '$EVENT_BASE_REF' is not checked; nothing to mark."; exit 0 ;;
  esac
  post_status "$EVENT_HEAD_SHA" "data-bearing-paths/$EVENT_BASE_REF" "$mark" "$desc" \
    || fail3 "could not post $mark"
  exit 0
fi

for v in REPO PR_NUMBER EVENT_HEAD_SHA EVENT_BASE_REF EVENT_ACTION RUN_URL STATUS_TOKEN STATUS_LOGIN; do
  [ -n "${!v:-}" ] || fail3 "$v is not set"
done
[[ "$PR_NUMBER" =~ ^[0-9]+$ ]] || fail3 "PR_NUMBER '$PR_NUMBER' is not a number"
[[ "$STATUS_LOGIN" =~ ^[a-z0-9-]+\[bot\]$ ]] || fail3 "STATUS_LOGIN '$STATUS_LOGIN' is not an App login"

[ "$EVENT_ACTION" = labeled ] && [ "${LABEL_NAME:-}" = "$EXEMPT_LABEL" ] && approval_event=true

pr="$(gh api "repos/$REPO/pulls/$PR_NUMBER")" || fail3 "could not read PR $PR_NUMBER"
live_head="$(jq -er '.head.sha' <<<"$pr")" || fail3 "no head sha"
base_sha="$(jq -er '.base.sha' <<<"$pr")" || fail3 "no base sha"
base_ref="$(jq -er '.base.ref' <<<"$pr")" || fail3 "no base ref"
label_on="$(jq -r --arg l "$EXEMPT_LABEL" 'any(.labels[]?; .name == $l)' <<<"$pr")" || fail3 "could not read the labels"

if [ "$live_head" != "$EVENT_HEAD_SHA" ]; then
  echo "data-bearing-path-check: the PR head moved to $live_head; the run for that head decides. Nothing posted."
  if [ "$approval_event" = true ]; then
    echo "data-bearing-path-check: no approval recorded; add the '$EXEMPT_LABEL' label again for the new head." >&2
    remove_label
  fi
  exit 0
fi
head_sha="$live_head"

case "$base_ref" in
  develop|staging|main) ;;
  *) fail3 "unexpected base branch '$base_ref'" ;;
esac
VERDICT_CTX="data-bearing-paths/$base_ref"
APPROVAL_CTX="data-bearing-approval/$base_ref"

# live_ref <branch>: fetch the branch from origin now and print its tip.
live_ref() {
  git fetch --no-tags --quiet origin "+refs/heads/$1:refs/data-bearing/live/$1" \
    || fail3 "could not fetch the live $1 branch"
  git rev-parse --verify --quiet "refs/data-bearing/live/$1" || fail3 "the live $1 branch did not resolve"
}

live_base="$(live_ref "$base_ref")" || exit 3
git merge-base --is-ancestor "$base_sha" "$live_base" \
  || fail3 "the PR's base $base_sha is not on the live $base_ref ($live_base); update the PR branch"

develop_sha=""
if [ "$base_ref" != develop ]; then
  develop_sha="$(live_ref develop)" || exit 3
fi

scope_now="$(scope_of "$base_ref" "$base_sha" "$head_sha" "$develop_sha")" \
  || fail3 "could not compute the change set of $base_sha...$head_sha"

# Recording an approval, after the base checks above. The label must still be on the
# PR (a re-run replays the labeled event after the label was removed), and the event's
# base must give the same scope as the base now, so a label added before the base
# changed does not approve the changed set.
if [ "$approval_event" = true ]; then
  [ -n "${SENDER_LOGIN:-}" ] || fail3 "SENDER_LOGIN is not set on a labeled event"
  [ -n "${EVENT_BASE_SHA:-}" ] || fail3 "EVENT_BASE_SHA is not set on a labeled event"
  [ -n "${GITHUB_RUN_ATTEMPT:-}" ] || fail3 "GITHUB_RUN_ATTEMPT is not set on a labeled event"
  authorized=false
  if [ "$GITHUB_RUN_ATTEMPT" != 1 ]; then
    echo "data-bearing-path-check: this is attempt $GITHUB_RUN_ATTEMPT of the run; only a first attempt records an approval. No approval recorded; add the label again." >&2
  elif [ "$base_ref" != "$EVENT_BASE_REF" ]; then
    echo "data-bearing-path-check: the label was added while the PR targeted $EVENT_BASE_REF; it now targets $base_ref. No approval recorded; add the label again." >&2
  elif [ "$label_on" != true ]; then
    echo "data-bearing-path-check: the '$EXEMPT_LABEL' label is no longer on the PR (a re-run of an earlier labeled run). No approval recorded; add the label again." >&2
  elif [ "${SENDER_TYPE:-}" != User ]; then
    echo "data-bearing-path-check: the label was added by a ${SENDER_TYPE:-non-user} account; no approval recorded." >&2
  else
    [[ "$SENDER_LOGIN" =~ ^[A-Za-z0-9-]+$ ]] || fail3 "unexpected login '$SENDER_LOGIN'"
    perm="$(gh api "repos/$REPO/collaborators/$SENDER_LOGIN/permission" --jq '.permission')" \
      || fail3 "could not read $SENDER_LOGIN's permission"
    case "$perm" in
      admin|write) authorized=true ;;
      read|none) echo "data-bearing-path-check: $SENDER_LOGIN has $perm access; an approval needs write access. No approval recorded." >&2 ;;
      *) fail3 "unexpected permission '$perm' for $SENDER_LOGIN" ;;
    esac
  fi
  if [ "$authorized" = true ]; then
    event_scope="$(scope_of "$base_ref" "$EVENT_BASE_SHA" "$head_sha" "$develop_sha")" || event_scope=""
    if [ "$event_scope" != "$scope_now" ]; then
      echo "data-bearing-path-check: the base changed between the label and this run, so the change set differs from the one labeled. No approval recorded; add the label again." >&2
    else
      post_status "$head_sha" "$APPROVAL_CTX" success "Synthetic data confirmed by $SENDER_LOGIN; scope $scope_now" \
        || fail3 "could not record the approval"
      echo "data-bearing-path-check: recorded $SENDER_LOGIN's approval on $head_sha ($APPROVAL_CTX, scope $scope_now)."
    fi
  fi
  [ "$label_on" != true ] || remove_label
fi

# The latest status for the approval context comes first (the API lists newest
# first), as "<state> <creator> <scope or none>". The context is built from an
# allowlisted branch, so it is safe inside the filter. sed -n reads all of its input, so
# the writer never meets a closed pipe.
filter='.[] | select(.context == "'"$APPROVAL_CTX"'") | "\(.state) \(.creator.login // "") \(((.description // "") | capture("; scope (?<s>[0-9a-f]{40})$") | .s) // "none")"'
found="$(gh api --paginate "repos/$REPO/commits/$head_sha/statuses?per_page=100" --jq "$filter")" \
  || fail3 "could not read the statuses on $head_sha"
latest="$(printf '%s\n' "$found" | sed -n '1p')"
approved=false
[ "$latest" = "success $STATUS_LOGIN $scope_now" ] && approved=true

rc=0
APPROVED="$approved" PR_BASE_REF="$base_ref" DEVELOP_SHA="$develop_sha" \
  bash "$CHECK" "$base_sha" "$head_sha" || rc=$?

case "$rc" in
  0) state=success; desc="No unapproved data-bearing change." ;;
  1) state=failure; desc="Data-bearing change needs a synthetic-data approval on this commit." ;;
  *) state=error; desc="Could not decide; see the workflow run." ;;
esac
post_status "$head_sha" "$VERDICT_CTX" "$state" "$desc" || fail3 "could not post the verdict"
# The workflow's failure step marks error only when no verdict was posted.
[ -z "${GITHUB_OUTPUT:-}" ] || echo "verdict_posted=true" >> "$GITHUB_OUTPUT"
exit "$rc"
