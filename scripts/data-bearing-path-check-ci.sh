#!/usr/bin/env bash
#
# data-bearing-path-check-ci.sh - the GitHub Actions entry point for
# scripts/data-bearing-path-check.sh. It records a reviewer's approval and the check's
# verdict as commit statuses on the PR's exact head commit.
#
# WHY COMMIT STATUSES
#   An approval has to cover one PR, one base branch and one head commit, and nothing
#   else. A commit status sits on exactly one commit, and its name (context) carries the
#   PR number and base: data-bearing-approval/pr-<n>/<base>. A push makes a new head
#   commit with no statuses, so nothing has to be reset, and no later event can carry an
#   earlier approval forward to it. The verdict is a status on the same head,
#   data-bearing-paths/<base>, and that context is the required check, one per base
#   branch so a head shared by PRs to different bases cannot overwrite another base's
#   verdict.
#
#   The decision reads live state from the API, not the event payload (a re-run reuses
#   the payload). It decides only for the PR's current head: a run whose event head has
#   moved on posts nothing, because the run for the newer head decides.
#
# APPROVAL
#   On a `labeled` event for the synthetic-data label, if the person who added it has
#   write, maintain or admin access (the API reports write or admin) and the head has
#   not moved, this script posts the approval status on the head and then removes the
#   label. The label works as a button: adding it records an approval for the head
#   current at that moment, and a later push needs it added again. A label added by a
#   bot or by someone with read or triage access records nothing and is removed.
#
#   An approval status counts only when its latest entry is `success` and its creator is
#   github-actions[bot]. That excludes a status a person posts with their own token. It
#   does not exclude a workflow in a same-repo PR, whose token can also post statuses as
#   github-actions[bot]: anyone with write access can get past this check, so it guards
#   against mistakes and fork PRs, not against a collaborator set on bypassing it. Any
#   change under .github/workflows/ needs an approval before it merges.
#
# BASE
#   The base branch must be develop, staging or main. It is fetched live from origin
#   just before the check (the checkout's own remote-tracking refs can point at the
#   event's commit), and the PR's base sha must still be on it, so a run after a base
#   force-push fails closed and replaces an earlier pass with an error. A PR that went
#   green before such a force-push stays green until its check runs again.
#
#   The PR's commits must already be in the checkout (the workflow fetches
#   refs/pull/<n>/head); a missing commit makes the check fail closed.
#
# ENV (required unless noted)
#   REPO            owner/name
#   PR_NUMBER       the pull request number
#   EVENT_HEAD_SHA  the head SHA in the triggering event
#   EVENT_ACTION    the pull_request_target activity type (opened, labeled, ...)
#   RUN_URL         this workflow run's URL, linked from the statuses
#   LABEL_NAME      on a labeled event, the label that was added (optional otherwise)
#   SENDER_LOGIN    on a labeled event, who added it
#   SENDER_TYPE     on a labeled event, User or Bot
#   GH_TOKEN        token for gh (statuses: write; pull-requests: write, to remove the
#                   label)
#   CHECK           optional; path to data-bearing-path-check.sh (tests override it)
#
# EXIT CODES
#   whatever the check returns (0, 1, 3); 0 when the event head has moved on (nothing
#   decided or posted); 3 from this script when any lookup or post fails
#
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CHECK="${CHECK:-$REPO_ROOT/scripts/data-bearing-path-check.sh}"
EXEMPT_LABEL="synthetic-data"
WORKFLOW_LOGIN="github-actions[bot]"

head_sha=""
VERDICT_CTX=""

# post_status <sha> <context> <state> <description>
post_status() {
  gh api -X POST "repos/$REPO/statuses/$1" -f state="$3" -f context="$2" \
    -f description="$4" -f target_url="$RUN_URL" --silent
}

# fail3: stop. Once the verdict context is known, replace any earlier verdict on the
# head with an error, so a pass from before (a stale base, say) does not stand.
fail3() {
  echo "data-bearing-path-check: $*; failing closed." >&2
  if [ -n "$VERDICT_CTX" ] && [ -n "$head_sha" ]; then
    post_status "$head_sha" "$VERDICT_CTX" error "Could not decide; see the workflow run." \
      || echo "data-bearing-path-check: could not post the error verdict either." >&2
  fi
  exit 3
}

remove_label() {
  gh api -X DELETE "repos/$REPO/issues/$PR_NUMBER/labels/$EXEMPT_LABEL" --silent \
    || echo "data-bearing-path-check: could not remove the '$EXEMPT_LABEL' label; remove it by hand before adding it again." >&2
}

for v in REPO PR_NUMBER EVENT_HEAD_SHA EVENT_ACTION RUN_URL; do
  [ -n "${!v:-}" ] || fail3 "$v is not set"
done
[[ "$PR_NUMBER" =~ ^[0-9]+$ ]] || fail3 "PR_NUMBER '$PR_NUMBER' is not a number"

approval_event=false
[ "$EVENT_ACTION" = labeled ] && [ "${LABEL_NAME:-}" = "$EXEMPT_LABEL" ] && approval_event=true

pr="$(gh api "repos/$REPO/pulls/$PR_NUMBER")" || fail3 "could not read PR $PR_NUMBER"
live_head="$(jq -er '.head.sha' <<<"$pr")" || fail3 "no head sha"
base_sha="$(jq -er '.base.sha' <<<"$pr")" || fail3 "no base sha"
base_ref="$(jq -er '.base.ref' <<<"$pr")" || fail3 "no base ref"

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
APPROVAL_CTX="data-bearing-approval/pr-$PR_NUMBER/$base_ref"

if [ "$approval_event" = true ]; then
  [ -n "${SENDER_LOGIN:-}" ] || fail3 "SENDER_LOGIN is not set on a labeled event"
  authorized=false
  if [ "${SENDER_TYPE:-}" != User ]; then
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
    post_status "$head_sha" "$APPROVAL_CTX" success "Synthetic data confirmed by $SENDER_LOGIN" \
      || fail3 "could not record the approval"
    echo "data-bearing-path-check: recorded $SENDER_LOGIN's approval on $head_sha ($APPROVAL_CTX)."
  fi
  remove_label
fi

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

# The latest status for the approval context comes first (the API lists newest
# first). The context is built from a number and an allowlisted branch, so it is safe
# inside the filter. sed -n reads all of its input, so gh never meets a closed pipe.
found="$(gh api --paginate "repos/$REPO/commits/$head_sha/statuses?per_page=100" \
  --jq ".[] | select(.context == \"$APPROVAL_CTX\") | \"\(.state) \(.creator.login // \"\")\"")" \
  || fail3 "could not read the statuses on $head_sha"
latest="$(printf '%s\n' "$found" | sed -n '1p')"
approved=false
[ "$latest" = "success $WORKFLOW_LOGIN" ] && approved=true

rc=0
APPROVED="$approved" PR_BASE_REF="$base_ref" DEVELOP_SHA="$develop_sha" \
  bash "$CHECK" "$base_sha" "$head_sha" || rc=$?

case "$rc" in
  0) state=success; desc="No unapproved data-bearing change." ;;
  1) state=failure; desc="Data-bearing change needs a synthetic-data approval on this commit." ;;
  *) state=error; desc="Could not decide; see the workflow run." ;;
esac
post_status "$head_sha" "$VERDICT_CTX" "$state" "$desc" || fail3 "could not post the verdict"
exit "$rc"
