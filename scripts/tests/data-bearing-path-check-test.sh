#!/usr/bin/env bash
#
# data-bearing-path-check-test.sh - proves scripts/data-bearing-path-check.sh blocks a
# PR that changes a data-bearing path unless its head commit carries an approval, and
# that scripts/data-bearing-path-check-ci.sh records approvals and verdicts as commit
# statuses on the exact head commit and fails closed when it cannot decide.
#
# WHY THIS EXISTS
#   This repo is public, so a PR's contents are published the moment its branch is
#   pushed. The check is the PR merge gate that keeps real rows out of develop. A
#   check that silently passes is worse than none, so every case below runs the real
#   script against a real two-commit range (or a stubbed classifier for failures git
#   cannot produce) and checks its exit code.
#
# Usage: scripts/tests/data-bearing-path-check-test.sh
#   CHECK=<path> overrides the script under test (used to show a case fails against a
#   copy with a rule removed).
# Exit codes: 0 = every case behaved; 1 = a case mismatched.

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CHECK="${CHECK:-$REPO_ROOT/scripts/data-bearing-path-check.sh}"

fails=0
total=0

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
REPO="$WORK/repo"
mkdir -p "$REPO"

git -C "$REPO" init -q
git -C "$REPO" config user.email test@example.invalid
git -C "$REPO" config user.name test
git -C "$REPO" config commit.gpgsign false
git -C "$REPO" config diff.renames true
printf 'base\n' > "$REPO/README.md"
mkdir -p "$REPO/spec/fixtures"
printf 'name: synthetic\n' > "$REPO/spec/fixtures/existing.yml"
git -C "$REPO" add -A
git -C "$REPO" commit -q -m base
BASE="$(git -C "$REPO" rev-parse HEAD)"

# commit_change <branch> <cmd...>: from BASE, run the command in the repo, commit,
# and print the new head.
commit_change() {
  local branch="$1"
  shift
  git -C "$REPO" checkout -q -B "$branch" "$BASE"
  (cd "$REPO" && "$@")
  git -C "$REPO" add -A
  git -C "$REPO" commit -q -m "$branch"
  git -C "$REPO" rev-parse HEAD
}

# run_check <expect-exit> <label> <head> <approved|UNSET> [env assignments...]
# The fourth argument is passed as APPROVED; UNSET runs the check with APPROVED removed
# from the environment. The PR base is $BASE unless the caller sets CHECK_BASE.
run_check() {
  local expect="$1" label="$2" head="$3" approved="$4" rc=0
  shift 4
  total=$((total + 1))
  if [ "$approved" = UNSET ]; then
    (cd "$REPO" && env -u APPROVED "$@" bash "$CHECK" "${CHECK_BASE:-$BASE}" "$head") >/dev/null 2>&1 || rc=$?
  else
    (cd "$REPO" && env APPROVED="$approved" "$@" bash "$CHECK" "${CHECK_BASE:-$BASE}" "$head") >/dev/null 2>&1 || rc=$?
  fi
  if [ "$rc" = "$expect" ]; then
    printf '  ok   exit %s  %s\n' "$rc" "$label"
  else
    printf '  FAIL exit %s (expected %s)  %s\n' "$rc" "$expect" "$label"
    fails=$((fails + 1))
  fi
}

CODE="$(commit_change code bash -c 'mkdir -p app/models && printf "class A; end\n" > app/models/a.rb')"
FIX="$(commit_change fixture bash -c 'printf "name: x\n" > spec/fixtures/new.yml')"
EDIT="$(commit_change edit bash -c 'printf "name: changed\n" > spec/fixtures/existing.yml')"
MOVE="$(commit_change move bash -c 'mkdir -p spec/support && git mv spec/fixtures/existing.yml spec/support/existing.yml')"
CSV="$(commit_change csv bash -c 'mkdir -p tmp && printf "a,b\n" > tmp/export.csv')"
LANG_="$(commit_change lang bash -c 'mkdir -p db/language/en && printf "{}\n" > db/language/en/words.json')"
# Two commits: a fixture, then a code-only change. A check that looked only at the
# last commit would miss the fixture.
git -C "$REPO" checkout -q -B multi "$BASE"
printf 'name: early\n' > "$REPO/spec/fixtures/early.yml"
git -C "$REPO" add -A && git -C "$REPO" commit -q -m 'multi 1: fixture'
mkdir -p "$REPO/app/models" && printf 'class B; end\n' > "$REPO/app/models/b.rb"
git -C "$REPO" add -A && git -C "$REPO" commit -q -m 'multi 2: code'
MULTI="$(git -C "$REPO" rev-parse HEAD)"

echo "data-bearing-path-check:"
run_check 0 'code-only change passes with no approval'              "$CODE" false
run_check 1 'new fixture with no approval fails'                     "$FIX"  false
run_check 0 'new fixture with an approval passes'                    "$FIX"  true
run_check 1 'edited existing fixture with no approval fails'         "$EDIT" false
run_check 1 'fixture renamed out of spec/fixtures fails'             "$MOVE" false
run_check 1 'csv data file fails'                                    "$CSV"  false
run_check 1 'db/language file fails'                                 "$LANG_" false
run_check 1 'fixture in an earlier commit of the PR fails'           "$MULTI" false
run_check 0 'APPROVED unset is treated as not approved (code passes)' "$CODE" UNSET
run_check 1 'APPROVED unset with a fixture fails'                    "$FIX"  UNSET
run_check 3 'APPROVED that is not true or false fails closed'        "$FIX"  yes
run_check 3 'APPROVED in another letter case fails closed'           "$FIX"  TRUE
run_check 3 'APPROVED empty fails closed'                            "$FIX"  ''

# A classifier that cannot decide must stop the check, label or not.
STUB="$WORK/classifier-exit3.sh"
printf '#!/usr/bin/env bash\nexit 3\n' > "$STUB"
run_check 3 'classifier exit 3 fails closed'                         "$CODE" false CLASSIFIER="$STUB"
run_check 3 'classifier exit 3 fails closed even when approved'      "$FIX"  true CLASSIFIER="$STUB"
# A classifier that exits 0 but writes no verdict is not a clean result.
STUB0="$WORK/classifier-silent.sh"
printf '#!/usr/bin/env bash\nexit 0\n' > "$STUB0"
run_check 3 'classifier with no verdict fails closed'                "$CODE" false CLASSIFIER="$STUB0"
# A verdict followed by a failing exit is still a failure: the exit code decides.
STUBF="$WORK/classifier-verdict-then-exit3.sh"
printf '#!/usr/bin/env bash\necho data_bearing=false >> "$GITHUB_OUTPUT"\nexit 3\n' > "$STUBF"
run_check 3 'classifier verdict with a failing exit fails closed'    "$CODE" false CLASSIFIER="$STUBF"

# An empty range has nothing to publish.
run_check 0 'empty range passes'                                     "$BASE" false

# Editing the check's own files needs an approval, so the control gets a reviewer's look.
CTRL="$(commit_change control bash -c 'mkdir -p scripts && printf "# edit\n" > scripts/data-bearing-path-check.sh')"
run_check 1 "editing the check's own script needs an approval"     "$CTRL" false
run_check 0 "editing the check's own script with an approval"      "$CTRL" true

# PRs to staging or main: only changes that never went through develop count. Here
# develop already holds the fixture commit ($FIX).
git -C "$REPO" checkout -q -B on-develop "$FIX"
mkdir -p "$REPO/app/models" && printf 'class C; end\n' > "$REPO/app/models/c.rb"
git -C "$REPO" add -A && git -C "$REPO" commit -q -m 'code on top of develop'
REL_CODE="$(git -C "$REPO" rev-parse HEAD)"
git -C "$REPO" checkout -q -B on-develop-fix "$FIX"
printf 'name: direct\n' > "$REPO/spec/fixtures/direct.yml"
git -C "$REPO" add -A && git -C "$REPO" commit -q -m 'fixture not in develop'
REL_FIX="$(git -C "$REPO" rev-parse HEAD)"
run_check 0 'PR to main carrying only develop content passes'        "$FIX"      false PR_BASE_REF=main DEVELOP_SHA="$FIX"
run_check 0 'PR to main: code beyond develop passes'                 "$REL_CODE" false PR_BASE_REF=main DEVELOP_SHA="$FIX"
run_check 1 'PR to staging: fixture beyond develop fails'            "$REL_FIX"  false PR_BASE_REF=staging DEVELOP_SHA="$FIX"
run_check 3 'PR to main without DEVELOP_SHA fails closed'            "$REL_FIX"  false PR_BASE_REF=main

# Add then delete inside the PR: develop is squash-only, so only the net diff merges;
# staging and main take merge commits, so every commit not in develop is checked.
git -C "$REPO" checkout -q -B add-del "$FIX"
printf 'name: real-looking\n' > "$REPO/spec/fixtures/gone.yml"
git -C "$REPO" add -A && git -C "$REPO" commit -q -m 'add a fixture'
git -C "$REPO" rm -q spec/fixtures/gone.yml
mkdir -p "$REPO/app/models" && printf 'class D; end\n' > "$REPO/app/models/d.rb"
git -C "$REPO" add -A && git -C "$REPO" commit -q -m 'delete it, add code'
ADDDEL="$(git -C "$REPO" rev-parse HEAD)"
run_check 1 'PR to staging: fixture added then deleted still fails'  "$ADDDEL" false PR_BASE_REF=staging DEVELOP_SHA="$FIX"
run_check 1 'PR to main: fixture added then deleted still fails'     "$ADDDEL" false PR_BASE_REF=main DEVELOP_SHA="$FIX"
# An empty commit in the range is skipped, not treated as an error.
git -C "$REPO" checkout -q -B with-empty "$REL_CODE"
git -C "$REPO" commit -q --allow-empty -m 'empty'
WEMPTY="$(git -C "$REPO" rev-parse HEAD)"
run_check 0 'PR to main: an empty commit in the range is skipped'    "$WEMPTY" false PR_BASE_REF=main DEVELOP_SHA="$FIX"
# A classifier failure inside the per-commit loop must stop the check.
run_check 3 'per-commit classifier failure fails closed'             "$REL_FIX" false PR_BASE_REF=staging DEVELOP_SHA="$FIX" CLASSIFIER="$STUB"
run_check 3 'per-commit classifier with no verdict fails closed'     "$REL_FIX" false PR_BASE_REF=staging DEVELOP_SHA="$FIX" CLASSIFIER="$STUB0"

# Merge commits. A release PR (staging into main) carries merge commits whose
# first-parent diff is a whole release of develop; only what a merge adds beyond ALL
# its parents (its combined diff) is new. Here develop is $FIX and main is $BASE.
# merge_into <branch> <start> <merge-ref> [cmd...]: a staging-only code commit on
# <start>, then <merge-ref> merged with --no-ff; the optional command runs before the
# merge is committed (an "evil" merge). Prints the merge commit.
merge_into() {
  local branch="$1" start="$2" ref="$3"
  shift 3
  git -C "$REPO" checkout -q -B "$branch" "$start"
  mkdir -p "$REPO/app/models" && printf 'class H; end\n' > "$REPO/app/models/h_$branch.rb"
  git -C "$REPO" add -A && git -C "$REPO" commit -q -m "$branch: staging-only code"
  git -C "$REPO" merge -q --no-ff --no-commit "$ref" >/dev/null 2>&1
  if [ $# -gt 0 ]; then (cd "$REPO" && "$@"); git -C "$REPO" add -A; fi
  git -C "$REPO" commit -q --no-edit -m "$branch: merge"
  git -C "$REPO" rev-parse HEAD
}
RELMERGE="$(merge_into rel-merge "$BASE" "$FIX")"
EVILFIX="$(merge_into evil-fix "$BASE" "$FIX" bash -c 'printf "name: evil\n" > spec/fixtures/evil.yml')"
EVILCODE="$(merge_into evil-code "$BASE" "$FIX" bash -c 'mkdir -p app/models && printf "class E; end\n" > app/models/e.rb')"
git -C "$REPO" checkout -q -B side-branch "$BASE"
printf 'name: side\n' > "$REPO/spec/fixtures/side.yml"
git -C "$REPO" add -A && git -C "$REPO" commit -q -m 'side: fixture'
SIDE="$(git -C "$REPO" rev-parse HEAD)"
SIDEMERGE="$(merge_into side-merge "$FIX" "$SIDE")"
run_check 0 'PR to main: a release merge of develop passes'          "$RELMERGE"  false PR_BASE_REF=main DEVELOP_SHA="$FIX"
run_check 1 'PR to main: a fixture added inside a merge commit fails' "$EVILFIX"  false PR_BASE_REF=main DEVELOP_SHA="$FIX"
run_check 0 'PR to main: code added inside a merge commit passes'    "$EVILCODE"  false PR_BASE_REF=main DEVELOP_SHA="$FIX"
run_check 1 'PR to staging: a fixture on a merged side branch fails' "$SIDEMERGE" false PR_BASE_REF=staging DEVELOP_SHA="$FIX"
run_check 3 'PR to main: classifier failure on a merge fails closed' "$EVILCODE"  false PR_BASE_REF=main DEVELOP_SHA="$FIX" CLASSIFIER="$STUB"
# A parentless (orphan) commit merged in with --allow-unrelated-histories: its files
# come from a root commit, which only --root lists.
git -C "$REPO" checkout -q --orphan orphan-data
git -C "$REPO" rm -rq --cached . >/dev/null 2>&1
git -C "$REPO" clean -fdq
mkdir -p "$REPO/spec/fixtures" && printf 'name: orphan\n' > "$REPO/spec/fixtures/orphan.yml"
git -C "$REPO" add -A && git -C "$REPO" commit -q -m 'orphan: fixture'
ORPHAN="$(git -C "$REPO" rev-parse HEAD)"
git -C "$REPO" checkout -q -B orphan-merge "$FIX"
git -C "$REPO" merge -q --no-edit --allow-unrelated-histories "$ORPHAN" -m 'merge an unrelated history'
ORPHANMERGE="$(git -C "$REPO" rev-parse HEAD)"
run_check 1 'PR to main: a fixture from a merged orphan branch fails' "$ORPHANMERGE" false PR_BASE_REF=main DEVELOP_SHA="$FIX"
# Commits already on the base branch are not the PR's: a staging-only fixture (reviewed
# when it landed on staging) does not trip a later PR to staging that contains it.
git -C "$REPO" checkout -q -B staging-tip "$BASE"
printf 'name: hotfix\n' > "$REPO/spec/fixtures/hotfix.yml"
git -C "$REPO" add -A && git -C "$REPO" commit -q -m 'staging-only fixture'
STAGING_TIP="$(git -C "$REPO" rev-parse HEAD)"
mkdir -p "$REPO/app/models" && printf 'class S; end\n' > "$REPO/app/models/s.rb"
git -C "$REPO" add -A && git -C "$REPO" commit -q -m 'code on top of staging'
ON_STAGING="$(git -C "$REPO" rev-parse HEAD)"
CHECK_BASE="$STAGING_TIP" run_check 0 'PR to staging: a fixture already on staging does not count' "$ON_STAGING" false PR_BASE_REF=staging DEVELOP_SHA="$FIX"

# Any workflow change needs an approval: a workflow in a same-repo PR runs with a token
# that can post statuses, so it gets a reviewer's look before it merges.
WF="$(commit_change workflow bash -c 'mkdir -p .github/workflows && printf "on: pull_request\n" > .github/workflows/shadow.yml')"
run_check 1 'adding a workflow needs an approval'                    "$WF" false
run_check 0 'adding a workflow with an approval passes'              "$WF" true
git -C "$REPO" checkout -q -B wf-add-del "$FIX"
mkdir -p "$REPO/.github/workflows" && printf 'on: pull_request\n' > "$REPO/.github/workflows/shadow.yml"
git -C "$REPO" add -A && git -C "$REPO" commit -q -m 'add a workflow'
git -C "$REPO" rm -q .github/workflows/shadow.yml && git -C "$REPO" commit -q -m 'remove it'
WFADDDEL="$(git -C "$REPO" rev-parse HEAD)"
run_check 1 'PR to staging: a workflow added then removed needs an approval' "$WFADDDEL" false PR_BASE_REF=staging DEVELOP_SHA="$FIX"
git -C "$REPO" checkout -q -B ctrl-beyond "$FIX"
mkdir -p "$REPO/scripts" && printf '# edit\n' > "$REPO/scripts/data-bearing-path-check.sh"
git -C "$REPO" add -A && git -C "$REPO" commit -q -m 'edit the check'
CTRLREL="$(git -C "$REPO" rev-parse HEAD)"
run_check 1 "PR to main: editing the check's script beyond develop needs an approval" "$CTRLREL" false PR_BASE_REF=main DEVELOP_SHA="$FIX"

# --- The CI entry script, against a stubbed gh. The stub applies the real --jq
# filter to canned JSON, so the filters are tested too. Statuses it is asked to post
# are prepended to the canned list, newest first, as GitHub returns them. ---
CI="${CI_SCRIPT:-$REPO_ROOT/scripts/data-bearing-path-check-ci.sh}"
GHBIN="$WORK/ghbin"
GH_STUB="$WORK/ghstub"
mkdir -p "$GHBIN"
cat > "$GHBIN/gh" <<'GHEOF'
#!/usr/bin/env bash
# gh api [--paginate] [-X METHOD] <url> [--jq <expr>] [-f key=value ...]
shift
url="" expr="" method=GET
fields=()
while [ $# -gt 0 ]; do
  case "$1" in
    --paginate|--silent) shift ;;
    --jq) expr="$2"; shift 2 ;;
    -X|--method) method="$2"; shift 2 ;;
    -f|--raw-field) fields+=("$2"); shift 2 ;;
    *) url="$1"; shift ;;
  esac
done
field() { local kv; for kv in "${fields[@]}"; do [ "${kv%%=*}" = "$1" ] && { printf '%s' "${kv#*=}"; return; }; done; }
case "$method $url" in
  "DELETE "*/issues/*/labels/*)
    echo "$url" >> "$GH_STUB/deleted"
    if [ -e "$GH_STUB/delete.fail" ]; then cat "$GH_STUB/delete.fail"; exit 1; fi
    exit 0 ;;
  "POST "*/statuses/*)
    sha="${url##*/}"
    ctx="$(field context)"
    case "$ctx" in data-bearing-approval/*) f=approve ;; *) f=verdict ;; esac
    if [ -e "$GH_STUB/$f.fail" ]; then cat "$GH_STUB/$f.fail"; exit 1; fi
    printf '%s %s %s\n' "$sha" "$ctx" "$(field state)" >> "$GH_STUB/posted"
    jq --arg c "$ctx" --arg s "$(field state)" --arg sha "$sha" \
      '[{sha:$sha, context:$c, state:$s, creator:{login:"github-actions[bot]"}}] + .' \
      "$GH_STUB/statuses.json" > "$GH_STUB/statuses.tmp" && mv "$GH_STUB/statuses.tmp" "$GH_STUB/statuses.json"
    exit 0 ;;
  "GET "*/pulls/*) f=pr ;;
  "GET "*/collaborators/*/permission) f=perm ;;
  "GET "*/commits/*/statuses*) f=statuses ;;
  *) echo "gh stub: unexpected $method $url" >&2; exit 9 ;;
esac
if [ -e "$GH_STUB/$f.fail" ]; then cat "$GH_STUB/$f.fail"; exit 1; fi
if [ "$f" = statuses ]; then
  sha="${url#*/commits/}"; sha="${sha%%/*}"
  jq --arg sha "$sha" '[.[] | select(.sha == $sha)]' "$GH_STUB/statuses.json" > "$GH_STUB/sel.json"
  src="$GH_STUB/sel.json"
else
  src="$GH_STUB/$f.json"
fi
if [ -n "$expr" ]; then jq -r "$expr" < "$src"; else cat "$src"; fi
GHEOF
chmod +x "$GHBIN/gh"
MARK="$WORK/check-ran"
SPY="$WORK/check-spy.sh"
printf '#!/usr/bin/env bash\ntouch "%s"\nexec bash "%s" "$@"\n' "$MARK" "$CHECK" > "$SPY"

# A real origin, so the live base is fetched as the workflow fetches it. The local
# remote-tracking refs start out equal to it; some cases make them stale. A push to the
# origin path also updates the matching local ref, so set_local runs after set_origin.
ORIGIN="$WORK/origin.git"
git init -q --bare "$ORIGIN"
git -C "$REPO" remote add origin "$ORIGIN"
set_origin() { git -C "$REPO" push -q -f "$ORIGIN" "$2:refs/heads/$1"; }
unset_origin() { git -C "$REPO" push -q "$ORIGIN" ":refs/heads/$1"; }
set_local() { git -C "$REPO" update-ref "refs/remotes/origin/$1" "$2"; }
set_origin develop "$FIX"; set_origin staging "$BASE"; set_origin main "$BASE"
set_local develop "$FIX"; set_local staging "$BASE"; set_local main "$BASE"

APPROVAL_DEV="data-bearing-approval/pr-7/develop"

# stub_pr <head> <base-ref> [base-sha, default $BASE]: a fresh PR, no statuses.
stub_pr() {
  rm -rf "$GH_STUB"; mkdir -p "$GH_STUB"
  jq -n --arg h "$1" --arg b "${3:-$BASE}" --arg r "$2" \
    '{head:{sha:$h}, base:{sha:$b, ref:$r}}' > "$GH_STUB/pr.json"
  printf '[]\n' > "$GH_STUB/statuses.json"
  printf '{"permission":"write"}\n' > "$GH_STUB/perm.json"
}
# add_status <sha> <context> <state> [creator]: prepend a status (it becomes the latest).
add_status() {
  jq --arg sha "$1" --arg c "$2" --arg s "$3" --arg who "${4:-github-actions[bot]}" \
    '[{sha:$sha, context:$c, state:$s, creator:{login:$who}}] + .' \
    "$GH_STUB/statuses.json" > "$GH_STUB/statuses.tmp" && mv "$GH_STUB/statuses.tmp" "$GH_STUB/statuses.json"
}

# run_ci <expect-exit> <expect-check-ran:yes|no> <label> <event-head> [env assignments...]
# EVENT_ACTION defaults to opened; a later assignment overrides it.
run_ci() {
  local expect="$1" ran="$2" label="$3" ehead="$4" rc=0 did=no
  shift 4
  total=$((total + 1))
  rm -f "$MARK"
  (cd "$REPO" && env PATH="$GHBIN:$PATH" GH_STUB="$GH_STUB" REPO=o/r PR_NUMBER=7 \
    EVENT_HEAD_SHA="$ehead" CHECK="$SPY" EVENT_ACTION=opened LABEL_NAME= SENDER_LOGIN=reviewer \
    SENDER_TYPE=User RUN_URL=https://example.invalid/run/1 "$@" bash "$CI") >/dev/null 2>&1 || rc=$?
  [ -e "$MARK" ] && did=yes
  if [ "$rc" = "$expect" ] && [ "$did" = "$ran" ]; then
    printf '  ok   exit %s  ci: %s\n' "$rc" "$label"
  else
    printf '  FAIL exit %s ran=%s (expected %s ran=%s)  ci: %s\n' "$rc" "$did" "$expect" "$ran" "$label"
    fails=$((fails + 1))
  fi
}
# posted_case <expected posted lines, "|"-separated, or NONE> <label>: the statuses the
# last run posted, in order, as "<sha> <context> <state>".
posted_case() {
  local want="$1" label="$2" got=NONE
  total=$((total + 1))
  [ -s "$GH_STUB/posted" ] && got="$(paste -sd'|' "$GH_STUB/posted")"
  if [ "$got" = "$want" ]; then
    printf '  ok   posted  ci: %s\n' "$label"
  else
    printf '  FAIL posted [%s] (expected [%s])  ci: %s\n' "$got" "$want" "$label"
    fails=$((fails + 1))
  fi
}
# deleted_case <expect:yes|no> <label>: did the last run remove the label?
deleted_case() {
  local want="$1" label="$2" got=no
  total=$((total + 1))
  [ -s "$GH_STUB/deleted" ] && got=yes
  if [ "$got" = "$want" ]; then
    printf '  ok   removed=%s  ci: %s\n' "$got" "$label"
  else
    printf '  FAIL removed=%s (expected %s)  ci: %s\n' "$got" "$want" "$label"
    fails=$((fails + 1))
  fi
}

# Verdicts: posted as a commit status on the exact head, one context per base branch.
stub_pr "$FIX" develop
run_ci 1 yes 'no approval, fixture fails' "$FIX"
posted_case "$FIX data-bearing-paths/develop failure" 'the failure is posted as a status on the head'
stub_pr "$CODE" develop
run_ci 0 yes 'no approval, code only passes' "$CODE"
posted_case "$CODE data-bearing-paths/develop success" 'the pass is posted as a status on the head'

# Approvals: a success status from the workflow, for this PR and base, on this head.
stub_pr "$FIX" develop; add_status "$FIX" "$APPROVAL_DEV" success
run_ci 0 yes 'an approval for this PR, base and head passes' "$FIX"
stub_pr "$FIX" develop; add_status "$FIX" "$APPROVAL_DEV" success mallory
run_ci 1 yes 'an approval status posted by a person, not the workflow, does not count' "$FIX"
stub_pr "$FIX" develop; add_status "$FIX" data-bearing-approval/pr-8/develop success
run_ci 1 yes 'an approval for another PR on the same head does not count' "$FIX"
stub_pr "$FIX" develop; add_status "$FIX" data-bearing-approval/pr-7/main success
run_ci 1 yes 'an approval for another base does not count' "$FIX"
stub_pr "$FIX" develop; add_status "$FIX" data-bearing-approval/pr-70/develop success
run_ci 1 yes 'an approval for PR 70 does not count for PR 7' "$FIX"
stub_pr "$FIX" develop; add_status "$EDIT" "$APPROVAL_DEV" success
run_ci 1 yes 'an approval on an earlier head does not cover the new head' "$FIX"
stub_pr "$FIX" develop; add_status "$FIX" "$APPROVAL_DEV" success; add_status "$FIX" "$APPROVAL_DEV" failure
run_ci 1 yes 'the latest status for the approval context is the one that counts' "$FIX"
stub_pr "$FIX" develop; add_status "$FIX" "$APPROVAL_DEV" pending
run_ci 1 yes 'a pending approval status does not count' "$FIX"
stub_pr "$FIX" develop; printf 'boom\n' > "$GH_STUB/statuses.fail"
run_ci 3 no 'status lookup fails: fails closed before the check' "$FIX"
posted_case "$FIX data-bearing-paths/develop error" 'a lookup failure posts an error verdict'
# The latest of many statuses. `sort | head -n 1` style pipes under pipefail could die
# of SIGPIPE once the list outgrew the pipe buffer.
stub_pr "$FIX" develop
seq 1 5000 | jq -R --arg sha "$FIX" '{sha:$sha, context:("other/" + .), state:"success", creator:{login:"github-actions[bot]"}}' | jq -s . > "$GH_STUB/statuses.json"
add_status "$FIX" "$APPROVAL_DEV" success
add_status "$FIX" "$APPROVAL_DEV" success
run_ci 0 yes 'approval found among 5,002 statuses (no SIGPIPE)' "$FIX"

# Recording an approval: the synthetic-data label, added by someone with write access.
stub_pr "$FIX" develop
run_ci 0 yes 'labeled by a writer: approval recorded, then the fixture passes' "$FIX" EVENT_ACTION=labeled LABEL_NAME=synthetic-data
posted_case "$FIX $APPROVAL_DEV success|$FIX data-bearing-paths/develop success" 'the approval is posted on the head, then the verdict'
deleted_case yes 'the label is removed once the approval is recorded'
stub_pr "$FIX" develop; printf '{"permission":"admin"}\n' > "$GH_STUB/perm.json"
run_ci 0 yes 'labeled by an admin: approval recorded' "$FIX" EVENT_ACTION=labeled LABEL_NAME=synthetic-data
stub_pr "$FIX" develop; printf '{"permission":"read"}\n' > "$GH_STUB/perm.json"
run_ci 1 yes 'labeled by a read or triage user: no approval' "$FIX" EVENT_ACTION=labeled LABEL_NAME=synthetic-data
posted_case "$FIX data-bearing-paths/develop failure" 'no approval status for a read or triage user'
deleted_case yes 'the unauthorized label is removed'
stub_pr "$FIX" develop
run_ci 1 yes 'labeled by a bot: no approval' "$FIX" EVENT_ACTION=labeled LABEL_NAME=synthetic-data SENDER_TYPE=Bot
posted_case "$FIX data-bearing-paths/develop failure" 'no approval status for a bot'
stub_pr "$FIX" develop
run_ci 1 yes 'another label: no approval' "$FIX" EVENT_ACTION=labeled LABEL_NAME=bug
posted_case "$FIX data-bearing-paths/develop failure" 'no approval status for another label'
deleted_case no 'another label is left alone'
stub_pr "$FIX" develop
run_ci 1 yes 'a label merely containing the name: no approval' "$FIX" EVENT_ACTION=labeled LABEL_NAME=not-synthetic-data
stub_pr "$FIX" develop; printf 'boom\n' > "$GH_STUB/perm.fail"
run_ci 3 no 'permission lookup fails: fails closed, no approval' "$FIX" EVENT_ACTION=labeled LABEL_NAME=synthetic-data
posted_case "$FIX data-bearing-paths/develop error" 'only an error verdict when the permission lookup fails'
stub_pr "$FIX" develop; printf '{"permission":"maybe"}\n' > "$GH_STUB/perm.json"
run_ci 3 no 'an unexpected permission value fails closed' "$FIX" EVENT_ACTION=labeled LABEL_NAME=synthetic-data
stub_pr "$FIX" develop
run_ci 3 no 'SENDER_LOGIN unset on a labeled event fails closed' "$FIX" EVENT_ACTION=labeled LABEL_NAME=synthetic-data SENDER_LOGIN=
stub_pr "$FIX" develop; printf 'boom\n' > "$GH_STUB/approve.fail"
run_ci 3 no 'posting the approval fails: fails closed' "$FIX" EVENT_ACTION=labeled LABEL_NAME=synthetic-data
stub_pr "$FIX" develop; printf 'boom\n' > "$GH_STUB/delete.fail"
run_ci 0 yes 'removing the label fails: the recorded approval still stands' "$FIX" EVENT_ACTION=labeled LABEL_NAME=synthetic-data

# A push does not touch labels or approvals: the new head simply has none.
stub_pr "$FIX" develop; add_status "$EDIT" "$APPROVAL_DEV" success
run_ci 1 yes 'synchronize: the earlier head stays approved, the new head is not' "$FIX" EVENT_ACTION=synchronize
deleted_case no 'synchronize removes no label'
stub_pr "$FIX" develop; add_status "$FIX" "$APPROVAL_DEV" success
run_ci 0 yes 'a re-run on an approved head (any event) still passes' "$FIX" EVENT_ACTION=edited
deleted_case no 'an edit removes no label'

# A stale run (the head moved on) decides nothing and posts nothing.
stub_pr "$CODE" develop
run_ci 0 no 'head moved since the event: skipped, nothing posted' "$FIX"
posted_case NONE 'a stale run posts no status'
stub_pr "$CODE" develop
run_ci 0 no 'labeled for a head that has moved: no approval recorded' "$FIX" EVENT_ACTION=labeled LABEL_NAME=synthetic-data
posted_case NONE 'a stale labeled run posts no approval'

stub_pr "$FIX" develop; printf 'boom\n' > "$GH_STUB/pr.fail"
run_ci 3 no 'PR lookup fails: fails closed before the check' "$FIX"
stub_pr "$FIX" develop; printf 'boom\n' > "$GH_STUB/verdict.fail"
run_ci 3 yes 'posting the verdict fails: fails closed' "$FIX"
stub_pr "$FIX" develop
run_ci 3 no 'EVENT_ACTION unset fails closed' "$FIX" EVENT_ACTION=
stub_pr "$FIX" develop
run_ci 3 no 'RUN_URL unset fails closed' "$FIX" RUN_URL=

# PRs to staging and main are judged against the live develop.
stub_pr "$REL_FIX" staging
run_ci 1 yes 'PR to staging: fixture beyond develop fails' "$REL_FIX"
posted_case "$REL_FIX data-bearing-paths/staging failure" 'a staging PR posts the staging context'
stub_pr "$REL_CODE" main
run_ci 0 yes 'PR to main: code beyond develop passes' "$REL_CODE"
stub_pr "$RELMERGE" main
run_ci 0 yes 'PR to main: a release merge of develop passes' "$RELMERGE"
stub_pr "$REL_FIX" staging; add_status "$REL_FIX" data-bearing-approval/pr-7/staging success
run_ci 0 yes 'PR to staging with an approval for staging passes' "$REL_FIX"
stub_pr "$REL_FIX" staging; add_status "$REL_FIX" "$APPROVAL_DEV" success
run_ci 1 yes 'PR retargeted to staging: the develop approval does not count' "$REL_FIX"

# The base: allowlisted, fetched live, and base.sha still on it.
stub_pr "$FIX" develop "$CODE"
run_ci 3 no 'base.sha not on the live base branch fails closed' "$FIX"
posted_case "$FIX data-bearing-paths/develop error" 'a stale base overwrites any earlier pass with an error'
# The local remote-tracking ref still holds the old tip, but develop was force-pushed
# (say, to scrub a fixture). Only an explicit fetch of the live branch catches it.
# (A push to the origin path also moves the local ref, so set it back by hand.)
set_origin develop "$CODE"; set_local develop "$FIX"
stub_pr "$FIX" develop "$FIX"
run_ci 3 no 'base force-pushed after the checkout: the live fetch catches it' "$FIX"
set_origin develop "$FIX"; set_local develop "$FIX"
# Live develop moved for a staging PR: the check uses the live tip, not the local ref.
set_local develop "$BASE"
stub_pr "$REL_CODE" main
run_ci 0 yes 'PR to main uses the live develop, not a stale local ref' "$REL_CODE"
set_local develop "$FIX"
set_origin release "$BASE"; set_local release "$BASE"
stub_pr "$CODE" release
run_ci 3 no 'a base branch other than develop, staging or main fails closed' "$CODE"
posted_case NONE 'no status for a base outside the allowlist'
unset_origin release; git -C "$REPO" update-ref -d refs/remotes/origin/release
unset_origin main
stub_pr "$REL_CODE" main
run_ci 3 no 'live base branch missing on the remote fails closed' "$REL_CODE"
set_origin main "$BASE"

echo
if [ "$fails" -eq 0 ]; then
  echo "data-bearing-path-check-test: OK ($total cases)"
  exit 0
fi
echo "data-bearing-path-check-test: $fails of $total cases FAILED"
exit 1
