#!/usr/bin/env bash
#
# data-bearing-path-check-test.sh - proves scripts/data-bearing-path-check.sh blocks a
# PR that changes a data-bearing path unless its head commit carries an approval, and
# that scripts/data-bearing-path-check-ci.sh records approvals and verdicts as commit
# statuses on the exact head commit, keeps a develop approval across pushes that leave
# every flagged file unchanged (and nothing else), and fails closed when it cannot decide.
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

# A name that is not UTF-8 is judged on its path like any other: the classifier's UTF-8
# check protects the reviewer steps only, and this check sends nothing to a reviewer.
L1CODE="$(commit_change latin1-code bash -c "mkdir -p app/models && printf 'class C; end\n' > \$'app/models/caf\\351.rb'")"
L1FIX="$(commit_change latin1-fixture bash -c "printf 'name: x\n' > \$'spec/fixtures/caf\\351.yml'")"
run_check 0 'a Latin-1 code name passes with no approval'           "$L1CODE" false
run_check 1 'a Latin-1 fixture name with no approval fails'         "$L1FIX"  false
run_check 0 'a Latin-1 fixture name with an approval passes'        "$L1FIX"  true
run_check 0 'PR to staging: a Latin-1 code name passes'             "$L1CODE" false PR_BASE_REF=staging DEVELOP_SHA="$BASE"
run_check 1 'PR to staging: a Latin-1 fixture name fails'           "$L1FIX"  false PR_BASE_REF=staging DEVELOP_SHA="$BASE"

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
# are prepended to the canned list, newest first, as GitHub returns them, and the
# statuses list is served in pages of 100 unless --paginate is given. Statuses must be
# posted with the App token and every other call must use the workflow token. ---
CI="${CI_SCRIPT:-$REPO_ROOT/scripts/data-bearing-path-check-ci.sh}"
GHBIN="$WORK/ghbin"
GH_STUB="$WORK/ghstub"
APP_LOGIN='data-bearing-gate[bot]'
mkdir -p "$GHBIN"
cat > "$GHBIN/gh" <<'GHEOF'
#!/usr/bin/env bash
# gh api [--paginate] [-X METHOD] <url> [--jq <expr>] [-f key=value ...]
shift
url="" expr="" method=GET paginate=no
fields=()
while [ $# -gt 0 ]; do
  case "$1" in
    --paginate) paginate=yes; shift ;;
    --silent) shift ;;
    --jq) expr="$2"; shift 2 ;;
    -X|--method) method="$2"; shift 2 ;;
    -f|--raw-field) fields+=("$2"); shift 2 ;;
    *) url="$1"; shift ;;
  esac
done
field() { local kv; for kv in "${fields[@]}"; do [ "${kv%%=*}" = "$1" ] && { printf '%s' "${kv#*=}"; return; }; done; }
case "$method $url" in
  "POST "*/statuses/*)
    [ "${GH_TOKEN:-}" = app-token ] || { echo "gh stub: status posted without the App token" >&2; exit 9; } ;;
  "GET "*/commits/*/statuses*)
    # The head's statuses are read with the workflow token, an earlier head's with the App's.
    case "${GH_TOKEN:-}" in app-token|actions-token) ;; *) echo "gh stub: $method $url without a known token" >&2; exit 9 ;; esac ;;
  *)
    [ "${GH_TOKEN:-}" = actions-token ] || { echo "gh stub: $method $url without the workflow token" >&2; exit 9; } ;;
esac
case "$method $url" in
  "DELETE "*/issues/*/labels/*)
    echo "$url" >> "$GH_STUB/deleted"
    if [ -e "$GH_STUB/delete.fail" ]; then cat "$GH_STUB/delete.fail"; exit 1; fi
    exit 0 ;;
  "POST "*/statuses/*)
    sha="${url##*/}"
    ctx="$(field context)"
    case "$ctx" in data-bearing-approval/*) f=approve ;; *) f=verdict ;; esac
    # GitHub's practical description limit (other tools trim to 140; GitHub's docs give none).
    d="$(field description)"
    [ "${#d}" -le 140 ] || { echo "gh stub: description of ${#d} characters" >&2; exit 9; }
    if [ -e "$GH_STUB/$f.fail" ]; then cat "$GH_STUB/$f.fail"; exit 1; fi
    printf '%s %s %s\n' "$sha" "$ctx" "$(field state)" >> "$GH_STUB/posted"
    jq --arg c "$ctx" --arg s "$(field state)" --arg sha "$sha" --arg d "$(field description)" \
      '[{sha:$sha, context:$c, state:$s, description:$d, creator:{login:"data-bearing-gate[bot]"}}] + .' \
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
  printf '%s %s\n' "$sha" "$GH_TOKEN" >> "$GH_STUB/reads"
  if [ -e "$GH_STUB/statuses.fail.$sha" ]; then echo boom; exit 1; fi
  # Without --paginate, gh returns only the first page.
  if [ "$paginate" = yes ]; then sel='[.[] | select(.sha == $sha)]'; else sel='[.[] | select(.sha == $sha)] | .[0:100]'; fi
  jq --arg sha "$sha" "$sel" "$GH_STUB/statuses.json" > "$GH_STUB/sel.json"
  src="$GH_STUB/sel.json"
else
  src="$GH_STUB/$f.json"
fi
if [ -n "$expr" ]; then jq -r "$expr" < "$src"; else cat "$src"; fi
GHEOF
chmod +x "$GHBIN/gh"
MARK="$WORK/check-ran"
SPY="$WORK/check-spy.sh"
# The spy marks the verdict run only; the CI script also runs the check's --data-scope mode.
# It also records any token it was given: the check reads git only and gets neither.
LEAK="$WORK/token-leak"
printf '#!/usr/bin/env bash\n[ -z "${GH_TOKEN+x}${STATUS_TOKEN+x}" ] || echo "$*" >> "%s"\n[ "${1:-}" = --data-scope ] || touch "%s"\nexec bash "%s" "$@"\n' "$LEAK" "$MARK" "$CHECK" > "$SPY"

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

APPROVAL_DEV="data-bearing-approval/develop"

# stub_pr <head> <base-ref> [base-sha, default $BASE]: a fresh PR, no statuses, carrying
# the synthetic-data label (as a labeled run finds it); stub_labels <json> replaces them.
stub_pr() {
  rm -rf "$GH_STUB"; mkdir -p "$GH_STUB"
  jq -n --arg h "$1" --arg b "${3:-$BASE}" --arg r "$2" \
    '{head:{sha:$h}, base:{sha:$b, ref:$r}, labels:[{name:"synthetic-data"}]}' > "$GH_STUB/pr.json"
  printf '[]\n' > "$GH_STUB/statuses.json"
  printf '{"permission":"write"}\n' > "$GH_STUB/perm.json"
}
# scope_of <base-ref> <base-sha> <head> [develop-sha]: the approval scope, computed here
# independently of the CI script: sha256 (first 40 hex) of the base ref, then the raw
# diff base...head (develop) or the sorted commits head ^develop ^base (staging, main).
scope_of() {
  local text
  if [ "$1" = develop ]; then
    text="$(printf '%s\n' "$1"; git -C "$REPO" diff --raw --no-abbrev --no-renames --no-relative "$2...$3")"
  else
    text="$(printf '%s\n' "$1"; git -C "$REPO" rev-list "$3" "^$4" "^$2" | sort)"
  fi
  printf '%s\n' "$text" | sha256sum | cut -c1-40
}
# approval_desc <head>: a valid approval description for that head against the stubbed
# PR's base and the origin's develop, whatever context it is posted under, so the context
# cases still fail on the context alone.
approval_desc() {
  local ref
  ref="$(jq -r .base.ref "$GH_STUB/pr.json")"
  printf 'Synthetic data confirmed by reviewer; scope %s' \
    "$(scope_of "$ref" "$(jq -r .base.sha "$GH_STUB/pr.json")" "$1" "$(git -C "$ORIGIN" rev-parse refs/heads/develop)")"
}
stub_labels() {
  jq --argjson l "$1" '.labels = $l' "$GH_STUB/pr.json" > "$GH_STUB/pr.tmp" && mv "$GH_STUB/pr.tmp" "$GH_STUB/pr.json"
}
# add_status <sha> <context> <state> [creator] [description]: prepend a status (it becomes
# the latest). An approval context gets a valid scope for the stubbed PR by default.
add_status() {
  local desc
  if [ $# -ge 5 ]; then desc="$5"
  else case "$2" in data-bearing-approval/*) desc="$(approval_desc "$1")" ;; *) desc="" ;; esac
  fi
  jq --arg sha "$1" --arg c "$2" --arg s "$3" --arg who "${4:-$APP_LOGIN}" --arg d "$desc" \
    '[{sha:$sha, context:$c, state:$s, description:$d, creator:{login:$who}}] + .' \
    "$GH_STUB/statuses.json" > "$GH_STUB/statuses.tmp" && mv "$GH_STUB/statuses.tmp" "$GH_STUB/statuses.json"
}

# run_ci <expect-exit> <expect-check-ran:yes|no> <label> <event-head> [env assignments...]
# EVENT_ACTION defaults to opened, EVENT_BASE_REF to develop, EVENT_BASE_SHA to the
# stubbed PR's base.sha and GITHUB_RUN_ATTEMPT to 1; a later assignment overrides them. A first argument of --mark-<state> runs the script's --mark mode.
run_ci() {
  local mode=()
  case "$1" in --mark-*) mode=(--mark "${1#--mark-}"); shift ;; esac
  local expect="$1" ran="$2" label="$3" ehead="$4" rc=0 did=no
  shift 4
  total=$((total + 1))
  rm -f "$MARK" "$GH_STUB/posted" "$GH_STUB/deleted"
  local ebase
  ebase="$(jq -r .base.sha "$GH_STUB/pr.json")"
  (cd "$REPO" && env -u GITHUB_OUTPUT PATH="$GHBIN:$PATH" GH_STUB="$GH_STUB" REPO=o/r PR_NUMBER=7 \
    EVENT_HEAD_SHA="$ehead" EVENT_BASE_REF=develop EVENT_BASE_SHA="$ebase" GITHUB_RUN_ATTEMPT=1 CHECK="$SPY" EVENT_ACTION=opened LABEL_NAME= \
    SENDER_LOGIN=reviewer SENDER_TYPE=User RUN_URL=https://example.invalid/run/1 \
    GH_TOKEN=actions-token STATUS_TOKEN=app-token STATUS_LOGIN="$APP_LOGIN" \
    "$@" bash "$CI" "${mode[@]}") >/dev/null 2>&1 || rc=$?
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

# Verdicts: posted with the App token as a commit status on the exact head, one context
# per base branch.
stub_pr "$FIX" develop
run_ci 1 yes 'no approval, fixture fails' "$FIX"
posted_case "$FIX data-bearing-paths/develop failure" 'the failure is posted as a status on the head'
stub_pr "$CODE" develop
run_ci 0 yes 'no approval, code only passes' "$CODE"
posted_case "$CODE data-bearing-paths/develop success" 'the pass is posted as a status on the head'

# Approvals: a success status from the App, for this base, on this exact head. Two PRs
# with the same head and base merge identical content, so they share it.
stub_pr "$FIX" develop; add_status "$FIX" "$APPROVAL_DEV" success
run_ci 0 yes 'an approval for this base and head passes' "$FIX"
stub_pr "$FIX" develop; add_status "$FIX" "$APPROVAL_DEV" success mallory
run_ci 1 yes 'an approval status posted by a person does not count' "$FIX"
stub_pr "$FIX" develop; add_status "$FIX" "$APPROVAL_DEV" success 'github-actions[bot]'
run_ci 1 yes 'an approval status posted with a workflow token does not count' "$FIX"
stub_pr "$FIX" develop; add_status "$FIX" data-bearing-approval/main success
run_ci 1 yes 'an approval for another base does not count' "$FIX"
stub_pr "$FIX" develop; add_status "$FIX" data-bearing-approval/develop-old success
run_ci 1 yes 'a context that only starts with the approval name does not count' "$FIX"
stub_pr "$FIX" develop; add_status "$EDIT" "$APPROVAL_DEV" success
run_ci 1 yes 'an approval on an earlier head does not cover the new head' "$FIX"
stub_pr "$FIX" develop; add_status "$FIX" "$APPROVAL_DEV" success; add_status "$FIX" "$APPROVAL_DEV" failure
run_ci 1 yes 'the latest status for the approval context is the one that counts' "$FIX"
stub_pr "$FIX" develop; add_status "$FIX" "$APPROVAL_DEV" pending
run_ci 1 yes 'a pending approval status does not count' "$FIX"
stub_pr "$FIX" develop
run_ci 0 yes 'PR 7 records an approval on the shared head' "$FIX" EVENT_ACTION=labeled LABEL_NAME=synthetic-data
run_ci 0 yes 'PR 8 with the same head and base shares it' "$FIX" PR_NUMBER=8
posted_case "$FIX data-bearing-paths/develop success" 'PR 8 posts the shared pass'
stub_pr "$FIX" develop
run_ci 1 yes 'PR 8 unapproved, same head: fails' "$FIX" PR_NUMBER=8
run_ci 1 yes 'PR 7 unapproved, same head: fails too' "$FIX"
stub_pr "$FIX" develop; printf 'boom\n' > "$GH_STUB/statuses.fail"
run_ci 3 no 'status lookup fails: fails closed before the check' "$FIX"
posted_case "$FIX data-bearing-paths/develop error" 'a lookup failure posts an error verdict'

# Pagination: 250 older statuses on the head, the only approval the oldest, so it is on
# page three and only a paginated read finds it.
stub_pr "$FIX" develop
add_status "$FIX" "$APPROVAL_DEV" success
for i in $(seq 1 250); do printf '%s\n' "$i"; done \
  | jq -R --arg sha "$FIX" '{sha:$sha, context:("other/" + .), state:"success", creator:{login:"x"}}' \
  | jq -s --slurpfile old "$GH_STUB/statuses.json" '. + $old[0]' > "$GH_STUB/statuses.tmp" \
  && mv "$GH_STUB/statuses.tmp" "$GH_STUB/statuses.json"
run_ci 0 yes 'an approval beyond the first page of statuses is found' "$FIX"
# Many matching statuses: their filtered lines (about 230 KB) outgrow a pipe buffer, so a
# reader that stops at the first line (head -n 1) under pipefail would kill the writer.
stub_pr "$FIX" develop
D8K="$(approval_desc "$FIX")"
for i in $(seq 1 8000); do printf '%s\n' "$i"; done \
  | jq -R --arg sha "$FIX" --arg who "$APP_LOGIN" --arg d "$D8K" '{sha:$sha, context:"data-bearing-approval/develop", state:"success", description:$d, creator:{login:$who}}' \
  | jq -s . > "$GH_STUB/statuses.json"
run_ci 0 yes '8,000 matching statuses: the latest is read without SIGPIPE' "$FIX"

# Recording an approval: the synthetic-data label, added by someone with write access,
# while the PR's head and base are still the ones in the event.
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
stub_pr "$FIX" develop
run_ci 3 no 'a login with shell or path characters fails closed' "$FIX" EVENT_ACTION=labeled LABEL_NAME=synthetic-data 'SENDER_LOGIN=a/../b'
posted_case "$FIX data-bearing-paths/develop error" 'no approval for a malformed login'
stub_pr "$FIX" develop; printf 'boom\n' > "$GH_STUB/approve.fail"
run_ci 3 no 'posting the approval fails: fails closed' "$FIX" EVENT_ACTION=labeled LABEL_NAME=synthetic-data
stub_pr "$FIX" develop; printf 'boom\n' > "$GH_STUB/delete.fail"
run_ci 0 yes 'removing the label fails: the recorded approval still stands' "$FIX" EVENT_ACTION=labeled LABEL_NAME=synthetic-data
# A label added while the PR targeted develop, processed (or re-run) after a retarget
# to staging: the reviewer did not approve the staging range.
stub_pr "$REL_FIX" staging
run_ci 1 yes 'a label from before a retarget records no approval for the new base' "$REL_FIX" EVENT_ACTION=labeled LABEL_NAME=synthetic-data EVENT_BASE_REF=develop
posted_case "$REL_FIX data-bearing-paths/staging failure" 'only the staging verdict is posted after a retarget'
deleted_case yes 'the label from before the retarget is removed'

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
deleted_case yes 'a stale labeled run removes the label so it can be added again'

stub_pr "$FIX" develop; printf 'boom\n' > "$GH_STUB/pr.fail"
run_ci 3 no 'PR lookup fails: fails closed before the check' "$FIX"
stub_pr "$FIX" develop; printf 'boom\n' > "$GH_STUB/verdict.fail"
run_ci 3 yes 'posting the verdict fails: fails closed' "$FIX"
for v in EVENT_ACTION RUN_URL STATUS_TOKEN STATUS_LOGIN EVENT_BASE_REF; do
  stub_pr "$FIX" develop
  run_ci 3 no "$v unset fails closed" "$FIX" "$v="
done
stub_pr "$FIX" develop
run_ci 3 no 'a STATUS_LOGIN that is not an App login fails closed' "$FIX" STATUS_LOGIN=reviewer

# PRs to staging and main are judged against the live develop.
stub_pr "$REL_FIX" staging
run_ci 1 yes 'PR to staging: fixture beyond develop fails' "$REL_FIX" EVENT_BASE_REF=staging
posted_case "$REL_FIX data-bearing-paths/staging failure" 'a staging PR posts the staging context'
stub_pr "$REL_CODE" main
run_ci 0 yes 'PR to main: code beyond develop passes' "$REL_CODE" EVENT_BASE_REF=main
stub_pr "$RELMERGE" main
run_ci 0 yes 'PR to main: a release merge of develop passes' "$RELMERGE" EVENT_BASE_REF=main
stub_pr "$REL_FIX" staging; add_status "$REL_FIX" data-bearing-approval/staging success
run_ci 0 yes 'PR to staging with an approval for staging passes' "$REL_FIX" EVENT_BASE_REF=staging
stub_pr "$REL_FIX" staging; add_status "$REL_FIX" "$APPROVAL_DEV" success
run_ci 1 yes 'PR retargeted to staging: the develop approval does not count' "$REL_FIX" EVENT_BASE_REF=staging

# The base: allowlisted, fetched live, and base.sha still on it.
stub_pr "$FIX" develop "$CODE"
run_ci 3 no 'base.sha not on the live base branch fails closed' "$FIX"
posted_case "$FIX data-bearing-paths/develop error" 'a stale base overwrites any earlier pass with an error'
set_origin develop "$CODE"; set_local develop "$FIX"
stub_pr "$FIX" develop "$FIX"
run_ci 3 no 'base force-pushed after the checkout: the live fetch catches it' "$FIX"
set_origin develop "$FIX"; set_local develop "$FIX"
set_local develop "$BASE"
stub_pr "$REL_CODE" main
run_ci 0 yes 'PR to main uses the live develop, not a stale local ref' "$REL_CODE" EVENT_BASE_REF=main
set_local develop "$FIX"
set_origin release "$BASE"; set_local release "$BASE"
stub_pr "$CODE" release
run_ci 3 no 'a base branch other than develop, staging or main fails closed' "$CODE" EVENT_BASE_REF=release
posted_case NONE 'no status for a base outside the allowlist'
unset_origin release; git -C "$REPO" update-ref -d refs/remotes/origin/release
unset_origin main
stub_pr "$REL_CODE" main
run_ci 3 no 'live base branch missing on the remote fails closed' "$REL_CODE" EVENT_BASE_REF=main
set_origin main "$BASE"

# --- Carrying a develop approval to a later head. A PR to develop keeps its approval
# across pushes that leave every flagged file (data-bearing, workflow, or the check's own)
# exactly as approved: same paths, same old and new blobs and modes, against the same
# merge-base blobs. The approval must sit on an earlier head on the PR's first-parent
# chain, within the newest 50 commits, with no commit in between whose flagged files
# differ. Nothing new is posted as an approval; the verdict names the approved commit.
# chain <start> <n> <tag>: n code-only commits on top of start; prints the last.
chain() {
  local start="$1" n="$2" tag="$3" i
  git -C "$REPO" checkout -q -B "chain-$tag" "$start"
  mkdir -p "$REPO/app/models"
  for i in $(seq 1 "$n"); do
    printf 'class K%s; end\n' "$i" > "$REPO/app/models/k_${tag}_$i.rb"
    git -C "$REPO" add -A && git -C "$REPO" commit -q -m "chain $tag $i"
  done
  git -C "$REPO" rev-parse HEAD
}
# on_top <start> <tag> <cmd...>: one commit running the command on top of start.
on_top() {
  local start="$1" tag="$2"
  shift 2
  git -C "$REPO" checkout -q -B "top-$tag" "$start"
  (cd "$REPO" && "$@")
  git -C "$REPO" add -A && git -C "$REPO" commit -q -m "top $tag"
  git -C "$REPO" rev-parse HEAD
}
# move_head <sha> [base-sha]: a push. The PR's head (and base sha) move; statuses stay.
move_head() {
  local b="${2:-$(jq -r .base.sha "$GH_STUB/pr.json")}"
  jq --arg h "$1" --arg b "$b" '.head.sha = $h | .base.sha = $b' "$GH_STUB/pr.json" > "$GH_STUB/pr.tmp" \
    && mv "$GH_STUB/pr.tmp" "$GH_STUB/pr.json"
}
# approve <head> <base-ref> [base-sha]: a fresh PR whose labeled run records an approval
# on that head (counted as a case, so a broken setup shows), with the label then gone.
approve() {
  stub_pr "$1" "$2" "${3:-$BASE}"
  run_ci 0 yes "setup: the label approves $(git -C "$REPO" log -1 --format=%s "$1") for $2" "$1" \
    EVENT_ACTION=labeled LABEL_NAME=synthetic-data EVENT_BASE_REF="$2"
  stub_labels '[]'
}
# sync_case <expect-exit> <label> <head> [env...]: the run a push triggers.
sync_case() {
  local expect="$1" label="$2" h="$3"
  shift 3
  run_ci "$expect" yes "$label" "$h" EVENT_ACTION=synchronize "$@"
}
# verdict_has <sha> <text> <label>: the newest verdict description on sha contains text.
verdict_has() {
  local d
  total=$((total + 1))
  d="$(jq -r --arg s "$1" '[.[] | select(.sha == $s and (.context | startswith("data-bearing-paths/")))][0].description' "$GH_STUB/statuses.json")"
  case "$d" in
    *"$2"*) printf '  ok   verdict  ci: %s\n' "$3" ;;
    *) printf '  FAIL verdict [%s] (expected to contain [%s])  ci: %s\n' "$d" "$2" "$3"; fails=$((fails + 1)) ;;
  esac
}
# data_scope_for <base> <head> <ERE>: the data scope computed here, independently of the
# check: sha256 (first 40 hex) of "develop", then the raw records (core.quotepath=false)
# whose path matches the ERE, one per line.
data_scope_for() {
  { printf 'develop\n'
    git -C "$REPO" -c core.quotepath=false diff --raw --no-abbrev --no-renames --no-relative "$1...$2" \
      | LC_ALL=C grep -aE -- $'\t'"$3" || true
  } | sha256sum | cut -c1-40
}
# scope_case <label> <expected-line> <check args...>: run the check's --data-scope mode.
scope_case() {
  local label="$1" want="$2" got rc=0
  shift 2
  total=$((total + 1))
  got="$(cd "$REPO" && bash "$CHECK" --data-scope "$@" 2>/dev/null)" || rc=$?
  if [ "$rc" = 0 ] && [ "$got" = "$want" ]; then printf '  ok   scope  %s\n' "$label"
  else printf '  FAIL scope exit %s [%s] (expected [%s])  %s\n' "$rc" "$got" "$want" "$label"; fails=$((fails + 1)); fi
}
scope_fail_case() {
  local label="$1" rc=0
  shift
  total=$((total + 1))
  (cd "$REPO" && env "$@") >/dev/null 2>&1 || rc=$?
  if [ "$rc" = 3 ]; then printf '  ok   exit 3  %s\n' "$label"
  else printf '  FAIL exit %s (expected 3)  %s\n' "$rc" "$label"; fails=$((fails + 1)); fi
}

EMPTY_SCOPE="$(printf 'develop\n' | sha256sum | cut -c1-40)"
C1="$(chain "$FIX" 1 c1)"
C2="$(chain "$FIX" 2 c2)"
C_EDITDATA="$(on_top "$FIX" editdata bash -c 'printf "name: y\n" > spec/fixtures/new.yml')"
C_BACK="$(on_top "$C_EDITDATA" back bash -c 'printf "name: x\n" > spec/fixtures/new.yml; mkdir -p app/models; printf "class Bk; end\n" > app/models/bk.rb')"
C_MODE="$(on_top "$FIX" mode chmod +x spec/fixtures/new.yml)"
C_NEWDATA="$(on_top "$FIX" newdata bash -c 'printf "name: o\n" > spec/fixtures/other.yml')"
C_WF="$(on_top "$FIX" wf bash -c 'mkdir -p .github/workflows && printf "on: push\n" > .github/workflows/x.yml')"
C_CTRL="$(on_top "$FIX" ctrl bash -c 'mkdir -p scripts && printf "# edit\n" > scripts/codex-review-path-classifier.sh')"
C35="$(chain "$FIX" 35 c35)"
C55="$(chain "$FIX" 55 c55)"

echo "data-bearing-path-check --data-scope:"
scope_case 'a fixture commit: its data scope covers the fixture record' \
  "$FIX $(data_scope_for "$BASE" "$FIX" 'spec/fixtures/new\.yml$')" "$BASE" "$FIX"
scope_case 'a code-only push on top: the same data scope' \
  "$C2 $(data_scope_for "$BASE" "$FIX" 'spec/fixtures/new\.yml$')" "$BASE" "$C2"
scope_case 'a code-only commit: the empty data scope' "$CODE $EMPTY_SCOPE" "$BASE" "$CODE"
scope_case 'several commits: one line each, in order' \
  "$C2 $(data_scope_for "$BASE" "$C2" 'spec/fixtures/')
$CODE $EMPTY_SCOPE" "$BASE" "$C2" "$CODE"
scope_case 'a workflow and a control file are in the data scope' \
  "$C_WF $(data_scope_for "$BASE" "$C_WF" '(spec/fixtures/|\.github/workflows/)')" "$BASE" "$C_WF"
scope_case 'a mode-only change is a different record' \
  "$C_MODE $(data_scope_for "$BASE" "$C_MODE" 'spec/fixtures/')" "$BASE" "$C_MODE"
scope_fail_case '--data-scope is develop-only' PR_BASE_REF=staging DEVELOP_SHA="$BASE" bash "$CHECK" --data-scope "$BASE" "$FIX"
scope_fail_case '--data-scope with no commit fails closed' bash "$CHECK" --data-scope "$BASE"
scope_fail_case '--data-scope with an unknown commit fails closed' bash "$CHECK" --data-scope "$BASE" 0123456789abcdef0123456789abcdef01234567
scope_fail_case '--data-scope with a classifier failure fails closed' CLASSIFIER="$STUB" bash "$CHECK" --data-scope "$BASE" "$FIX"
# Drift guard: a classifier that flags the whole list but no single path of it.
STUBDRIFT="$WORK/classifier-drift.sh"
cat > "$STUBDRIFT" <<'EOF'
#!/usr/bin/env bash
f="${3:-}"; n=0
[ -n "$f" ] && n="$(grep -c '' "$f")"
if [ "$n" -gt 1 ]; then echo data_bearing=true >> "$GITHUB_OUTPUT"; else echo data_bearing=false >> "$GITHUB_OUTPUT"; fi
EOF
scope_fail_case 'a list verdict no single path explains fails closed' CLASSIFIER="$STUBDRIFT" bash "$CHECK" --data-scope "$BASE" "$C1"

echo "data-bearing-path-check-ci carry:"
approve "$FIX" develop; move_head "$C2"
sync_case 0 'a code-only push after an approval keeps it' "$C2"
posted_case "$C2 data-bearing-paths/develop success" 'a carried pass posts only the verdict, never an approval'
verdict_has "$C2" "${FIX:0:12}" 'the carried verdict names the approved commit'
sync_case 0 'a re-run (attempt 2) of that push carries too' "$C2" GITHUB_RUN_ATTEMPT=2
stub_labels '[{"name":"synthetic-data"}]'
run_ci 0 yes 'a re-run of a labeled run on the carried head records nothing' "$C2" EVENT_ACTION=labeled LABEL_NAME=synthetic-data GITHUB_RUN_ATTEMPT=2
posted_case "$C2 data-bearing-paths/develop success" 'no approval is posted by a re-run, carried or not'
stub_pr "$C1" develop
run_ci 3 no 'labeled with a classifier that drifts: fails closed, records nothing' "$C1" EVENT_ACTION=labeled LABEL_NAME=synthetic-data CLASSIFIER="$STUBDRIFT"
posted_case "$C1 data-bearing-paths/develop error" 'only an error verdict when the data scope cannot be trusted'
for pair in "C_EDITDATA:a content edit of the approved fixture" "C_MODE:a mode-only change of the approved fixture" \
            "C_NEWDATA:a new fixture" "C_WF:a new workflow" "C_CTRL:an edit to the classifier (a control file)" \
            "C_BACK:a fixture changed and changed back (the run of unchanged commits is broken)" \
            "C55:an approval more than 50 commits back"; do
  var="${pair%%:*}"
  approve "$FIX" develop; move_head "${!var}"
  sync_case 1 "after an approval, ${pair#*:}: not kept" "${!var}"
done
approve "$FIX" develop; move_head "$C35"
sync_case 0 'an approval 35 commits back is kept' "$C35"
approve "$FIX" develop; move_head "$C_EDITDATA"; move_head "$C2"
sync_case 0 'a head reset back past an edit is judged on its own chain: kept' "$C2"

# Latin-1 names: approved through the same listing the verdict reads.
L1C="$(chain "$L1FIX" 1 l1)"
L1E="$(on_top "$L1FIX" l1edit bash -c "printf 'name: y\n' > \$'spec/fixtures/caf\\351.yml'")"
approve "$L1FIX" develop; move_head "$L1C"
sync_case 0 'a Latin-1 fixture name: kept across a code-only push' "$L1C"
approve "$L1FIX" develop; move_head "$L1E"
sync_case 1 'a Latin-1 fixture name: not kept after an edit' "$L1E"

# A fixture moved to a path that is not data-bearing: the delete record is flagged and
# approved; the file at its new path is ordinary code (it would need no approval if it
# were added fresh), so editing it there keeps the approval. Moving it back does not.
MV_EDIT="$(on_top "$MOVE" mvedit bash -c 'printf "name: edited\n" > spec/support/existing.yml')"
MV_BACK="$(on_top "$MV_EDIT" mvback bash -c 'mkdir -p spec/fixtures && git mv spec/support/existing.yml spec/fixtures/existing.yml')"
approve "$MOVE" develop; move_head "$MV_EDIT"
sync_case 0 'a fixture moved out of a data path: editing it at the new path keeps the approval' "$MV_EDIT"
approve "$MOVE" develop; move_head "$MV_BACK"
sync_case 1 'the moved fixture moved back with new content: not kept' "$MV_BACK"

# The classifier (from develop) gains a pattern after the label: the flagged set grows.
GROWN="$WORK/classifier-grown.sh"
awk '{ print } /^DATA_BEARING_PATTERNS=\($/ { print "  '"'"'(^|/)app/models/k_'"'"'" }' "$REPO_ROOT/scripts/codex-review-path-classifier.sh" > "$GROWN"
approve "$FIX" develop; move_head "$C2"
sync_case 1 'the classifier gains a pattern matching the pushed code: not kept' "$C2" CLASSIFIER="$GROWN"

# develop merged into the PR. The data scope reads the PR's base now: a data file whose
# merge-base blob changed is not the change that was approved.
git -C "$REPO" checkout -q -B dev-data "$BASE"
printf 'name: develop\n' > "$REPO/spec/fixtures/existing.yml"
git -C "$REPO" add -A && git -C "$REPO" commit -q -m 'develop edits the fixture'
DEV_DATA="$(git -C "$REPO" rev-parse HEAD)"
git -C "$REPO" checkout -q -B dev-code "$BASE"
mkdir -p "$REPO/app/models" && printf 'class Dv; end\n' > "$REPO/app/models/dv.rb"
git -C "$REPO" add -A && git -C "$REPO" commit -q -m 'develop adds code'
DEV_CODE="$(git -C "$REPO" rev-parse HEAD)"
git -C "$REPO" checkout -q -B pr-merge-code "$EDIT"
git -C "$REPO" merge -q --no-edit "$DEV_CODE" >/dev/null
M_CODE="$(git -C "$REPO" rev-parse HEAD)"
git -C "$REPO" checkout -q -B pr-merge-data "$EDIT"
git -C "$REPO" merge -q -s ours --no-edit "$DEV_DATA" >/dev/null
M_DATA="$(git -C "$REPO" rev-parse HEAD)"
approve "$EDIT" develop; set_origin develop "$DEV_CODE"; move_head "$M_CODE" "$DEV_CODE"
sync_case 0 'develop merged in, its change unrelated to the data: kept' "$M_CODE"
set_origin develop "$FIX"
approve "$EDIT" develop; set_origin develop "$DEV_DATA"; move_head "$M_DATA" "$DEV_DATA"
sync_case 1 'develop merged in, the data file changed under it: not kept' "$M_DATA"
set_origin develop "$FIX"

# Force-push: the same fixture rebuilt on a new commit has the same data scope, but the
# approved commit is no longer in the PR, so nothing is kept.
FIXAGAIN="$(commit_change fixture-again bash -c 'printf "name: x\n" > spec/fixtures/new.yml')"
FP="$(chain "$FIXAGAIN" 1 fp)"
scope_case 'the rebuilt head has the approved data scope (only ancestry refuses it)' \
  "$FP $(data_scope_for "$BASE" "$FIX" 'spec/fixtures/new\.yml$')" "$BASE" "$FP"
approve "$FIX" develop; move_head "$FP"
sync_case 1 'the approved commit force-pushed out of the PR: not kept' "$FP"

# What counts on the earlier head: the newest App success with the data scope now.
approve "$FIX" develop
D_FIX="$(jq -r --arg s "$FIX" --arg c "$APPROVAL_DEV" '[.[] | select(.sha == $s and .context == $c)][0].description' "$GH_STUB/statuses.json")"
add_status "$FIX" "$APPROVAL_DEV" failure "$APP_LOGIN" 'withdrawn'; move_head "$C2"
sync_case 1 'the newest approval status on the earlier head is a failure: not kept' "$C2"
for who in 'github-actions[bot]' mallory; do
  stub_pr "$C2" develop; stub_labels '[]'; add_status "$FIX" "$APPROVAL_DEV" success "$who" "$D_FIX"
  sync_case 1 "a copied approval on the earlier head posted by $who: not kept" "$C2"
done
stub_pr "$C2" develop; stub_labels '[]'; add_status "$FIX" "$APPROVAL_DEV" success "$APP_LOGIN" "$D_FIX"
sync_case 0 'control: the same description from the App is kept' "$C2"
stub_pr "$C2" develop; stub_labels '[]'; add_status "$FIX" "$APPROVAL_DEV" success "$APP_LOGIN" "$D_FIX x"
sync_case 1 'an App approval with trailing text: not kept' "$C2"
stub_pr "$C2" develop; stub_labels '[]'; add_status "$FIX" "$APPROVAL_DEV" success "$APP_LOGIN" "${D_FIX/Synthetic data confirmed/Data confirmed}"
sync_case 1 'an App approval without the label-born prefix: not kept' "$C2"
stub_pr "$C2" develop; stub_labels '[]'; add_status "$FIX" "$APPROVAL_DEV" success
sync_case 1 'an old-form scope approval on an earlier head: not kept (it counts on its own head only)' "$C2"
stub_pr "$C2" develop; stub_labels '[]'; add_status "$FIX" "$APPROVAL_DEV" success "$APP_LOGIN" "$D_FIX"
C2P="$(git -C "$REPO" rev-parse "$C2^")"
add_status "$C2P" "$APPROVAL_DEV" success "$APP_LOGIN" "$D_FIX"
sync_case 0 'two earlier approvals: the newer is found first' "$C2"
verdict_has "$C2" "${C2P:0:12}" 'the verdict names the newer approved commit'
stub_pr "$C2" develop; stub_labels '[]'; add_status "$FIX" "$APPROVAL_DEV" success "$APP_LOGIN" "$D_FIX"
: > "$GH_STUB/statuses.fail.$FIX"
run_ci 3 no 'a status lookup on an earlier head fails: fails closed' "$C2" EVENT_ACTION=synchronize
posted_case "$C2 data-bearing-paths/develop error" 'a walk lookup failure posts an error verdict'

# Staging and main never carry: the approval covers one head.
REL2="$(chain "$REL_FIX" 1 rel2)"
approve "$REL_FIX" staging; move_head "$REL2"
sync_case 1 'PR to staging: a code-only push after an approval needs the label again' "$REL2" EVENT_BASE_REF=staging
approve "$REL_FIX" main; move_head "$REL2"
sync_case 1 'PR to main: a code-only push after an approval needs the label again' "$REL2" EVENT_BASE_REF=main

# Descriptions fit GitHub's practical 140-character limit (the stub refuses longer).
L39="$(printf 'a%.0s' $(seq 1 39))"
stub_pr "$FIX" develop
run_ci 0 yes 'a 39-character login fits the develop approval description' "$FIX" EVENT_ACTION=labeled LABEL_NAME=synthetic-data SENDER_LOGIN="$L39"
posted_case "$FIX $APPROVAL_DEV success|$FIX data-bearing-paths/develop success" 'the long-login approval is posted'
stub_pr "$REL_FIX" staging
run_ci 0 yes 'a 39-character login fits the staging approval description' "$REL_FIX" EVENT_ACTION=labeled LABEL_NAME=synthetic-data EVENT_BASE_REF=staging SENDER_LOGIN="$L39"
total=$((total + 1)); rc=0
GH_TOKEN=app-token GH_STUB="$GH_STUB" "$GHBIN/gh" api -X POST repos/o/r/statuses/abc -f context=x -f state=success \
  -f description="$(printf 'd%.0s' $(seq 1 141))" >/dev/null 2>&1 || rc=$?
if [ "$rc" = 9 ]; then printf '  ok   exit 9  stub: a description over 140 characters is refused\n'
else printf '  FAIL exit %s (expected 9)  stub: a description over 140 characters is refused\n' "$rc"; fails=$((fails + 1)); fi

# Another PR whose head builds on an approved commit keeps it too: the approval binds the
# flagged files and the commit it sits on, not the PR (the 2026-10-11 decision covered
# identical heads; this extends it to heads built on one).
approve "$FIX" develop; move_head "$C2"
sync_case 0 'PR 8 building on PR 7'"'"'s approved commit keeps the approval' "$C2" PR_NUMBER=8

# Withdrawing: editing the data voids the approval for heads built on the edit, but a
# later head back on the approved commit (a force-push from a stale clone, a stacked PR)
# would find it again. A person posting failure on data-bearing-approval/develop at the
# approved commit withdraws it for good: the newest status on that commit is what counts.
approve "$FIX" develop
add_status "$FIX" "$APPROVAL_DEV" failure mallory 'Withdrawn: the fixture holds real data'
move_head "$C2"
sync_case 1 'a person'"'"'s failure on the approved commit withdraws it for a later head' "$C2"
sync_case 1 'and for a stacked PR built on it' "$C2" PR_NUMBER=8
move_head "$FIX"
sync_case 1 'and for the approved head itself' "$FIX"

# A withdrawal stops the walk: the first commit (the head included) whose newest approval
# status is anything but the App's approval for this data ends it, so an older approval
# for the same data behind a withdrawn one does not count.
approve "$FIX" develop
move_head "$C2P"
run_ci 0 yes 'setup: the label approves the same data again on a later head' "$C2P" EVENT_ACTION=labeled LABEL_NAME=synthetic-data
stub_labels '[]'
add_status "$C2P" "$APPROVAL_DEV" failure mallory 'Withdrawn: the fixture holds real data'
move_head "$C2"
sync_case 1 'a withdrawn approval stops the walk before an older one for the same data' "$C2"
move_head "$C2P"
sync_case 1 'a withdrawn head does not start the walk' "$C2P"
# A head that does not build on the withdrawn commit never reaches it: FIX approved, the
# same data approved again on C2P and withdrawn there, and a head built on FIX alone (an
# older clone) still finds FIX's approval. So the docs say to post the withdrawal on every
# commit that holds an approval for that data; withdrawn on both, it is not kept.
approve "$FIX" develop
move_head "$C2P"
run_ci 0 yes 'setup: the same data approved again on a later head' "$C2P" EVENT_ACTION=labeled LABEL_NAME=synthetic-data
stub_labels '[]'
add_status "$C2P" "$APPROVAL_DEV" failure mallory 'Withdrawn'
move_head "$C1"
sync_case 0 'withdrawn only on the later commit, a head built on the older one still keeps it' "$C1"
add_status "$FIX" "$APPROVAL_DEV" failure mallory 'Withdrawn'
sync_case 1 'withdrawn on the older commit too, it is not kept' "$C1"
# A rebase leaves the old heads' approvals in place too: withdrawn on both, a stale push
# of the old chain does not keep it.
approve "$FIXAGAIN" develop
add_status "$FIXAGAIN" "$APPROVAL_DEV" failure mallory 'Withdrawn'
add_status "$FIX" "$APPROVAL_DEV" success "$APP_LOGIN" "$D_FIX"
add_status "$FIX" "$APPROVAL_DEV" failure mallory 'Withdrawn'
move_head "$C2"
sync_case 1 'withdrawn on every approved commit, a stale push of the old chain does not keep it' "$C2"

# The exact data scope binds the approval: after develop is rewritten (to scrub data, say)
# the same head brings in more, and neither the head nor a later head keeps it.
set_origin develop "$FIX"
approve "$REL_FIX" develop "$FIX"
set_origin develop "$BASE"; move_head "$REL_FIX" "$BASE"
sync_case 1 'develop rewritten under a data-form approval: the head does not keep it' "$REL_FIX"
REL3="$(chain "$REL_FIX" 1 rel3)"
move_head "$REL3" "$BASE"
sync_case 1 'develop rewritten under a data-form approval: a later head does not keep it' "$REL3"
set_origin develop "$FIX"

# A workflow path that is also data-bearing by name is both: it can be approved and kept.
WFDATA="$(commit_change wf-data bash -c 'mkdir -p .github/workflows && printf "a,b\n" > .github/workflows/data.csv')"
scope_case 'a workflow path that is also data-bearing is in the data scope once' \
  "$WFDATA $(data_scope_for "$BASE" "$WFDATA" '\.github/workflows/data\.csv$')" "$BASE" "$WFDATA"
WFDATA2="$(chain "$WFDATA" 1 wfdata)"
approve "$WFDATA" develop; move_head "$WFDATA2"
sync_case 0 'a workflow data file: approved, then kept across a code-only push' "$WFDATA2"

# An earlier commit that cannot be scoped (here a git-quoted name, added and then removed)
# ends the walk instead of failing the run: an approval found before it still counts, and
# without one the verdict is the ordinary failure.
git -C "$REPO" checkout -q -B quoted "$BASE"
printf 'name: x\n' > "$REPO/spec/fixtures/new.yml"; mkdir -p "$REPO/app"; printf 'x\n' > "$REPO/app/q\"x.rb"
git -C "$REPO" add -A && git -C "$REPO" commit -q -m 'quoted name'
git -C "$REPO" rm -q 'app/q"x.rb' && git -C "$REPO" commit -q -m 'remove it'
QA="$(git -C "$REPO" rev-parse HEAD)"
QH="$(chain "$QA" 1 qh)"
approve "$QA" develop; move_head "$QH"
sync_case 0 'an unscopable commit behind the approved one does not stop the carry' "$QH"
stub_pr "$QH" develop; stub_labels '[]'
sync_case 1 'an unscopable earlier commit and no approval: the ordinary failure' "$QH"

# Output from --data-scope that does not name the commit asked for is not trusted.
BADSCOPE="$WORK/check-bad-scope.sh"
cat > "$BADSCOPE" <<BEOF
#!/usr/bin/env bash
if [ "\${1:-}" = --data-scope ] && [ "\${3:-}" != "\${FAKE_GOOD:-}" ]; then
  echo "0123456789abcdef0123456789abcdef01234567 $EMPTY_SCOPE"; exit 0
fi
exec bash "$SPY" "\$@"
BEOF
stub_pr "$FIX" develop
run_ci 3 no 'a malformed data scope for the head fails closed' "$FIX" CHECK="$BADSCOPE"
approve "$FIX" develop; move_head "$C2"
run_ci 3 no 'a malformed data scope for an earlier commit fails closed' "$C2" EVENT_ACTION=synchronize CHECK="$BADSCOPE" FAKE_GOOD="$C2"

# The walk reads statuses with the App token (its own rate-limit budget, not the
# repository's workflow-token budget), one read per unchanged commit, newest first.
approve "$FIX" develop; move_head "$C2"; rm -f "$GH_STUB/reads"
sync_case 0 'a carried run (reads counted)' "$C2"
total=$((total + 1))
want_reads="$C2 actions-token|$(git -C "$REPO" rev-parse "$C2^") app-token|$FIX app-token"
got_reads="$(paste -sd'|' "$GH_STUB/reads" 2>/dev/null)"
if [ "$got_reads" = "$want_reads" ]; then printf '  ok   reads  ci: the head is read with the workflow token, the walk with the App token\n'
else printf '  FAIL reads [%s] (expected [%s])  ci: walk reads\n' "$got_reads" "$want_reads"; fails=$((fails + 1)); fi

# A classifier that flags a path inside a list but not alone: the data scope would leave
# that path out, so the paths it calls clean must also be clean as a list.
STUBMISS="$WORK/classifier-miss.sh"
cat > "$STUBMISS" <<'MEOF'
#!/usr/bin/env bash
f="${3:-}"; v=false
grep -q 'spec/fixtures/' "$f" && v=true
[ "$(grep -c '' "$f")" -gt 1 ] && grep -q 'app/models/k_' "$f" && v=true
echo "data_bearing=$v" >> "$GITHUB_OUTPUT"
MEOF
scope_fail_case 'a path flagged in the list but not alone fails closed' CLASSIFIER="$STUBMISS" bash "$CHECK" --data-scope "$BASE" "$C2"

# Names are data, never code: a name holding $(...) or [$(...)] runs nothing, in the
# data scope or the verdict. (A bash [ -v "a[$name]" ] test would run it.)
INJ="$(commit_change inject bash -c 'printf "name: x\n" > "spec/fixtures/\$(touch inj1).yml"; printf "x\n" > "app/a[\$(touch inj2)].rb"; printf "y\n" > "app/b[\$(touch inj3)]"')"
INJ2="$(chain "$INJ" 1 inj)"
approve "$INJ" develop; move_head "$INJ2"
sync_case 0 'names holding $(...): kept across a code-only push' "$INJ2"
total=$((total + 1))
if [ ! -e "$REPO/inj1" ] && [ ! -e "$REPO/inj2" ] && [ ! -e "$REPO/inj3" ] && [ ! -e "$REPO/app/inj2" ]; then
  printf '  ok   no marker  a name holding $(...) ran nothing\n'
else printf '  FAIL marker  a name holding $(...) ran a command\n'; fails=$((fails + 1)); fi

# A trailing space is part of the name: "app/x.csv " is not a .csv file to the classifier,
# so editing it keeps the approval; trimming the name would flag it.
TSP="$(commit_change trailing-space bash -c 'printf "name: x\n" > spec/fixtures/new.yml; mkdir -p app; printf "a\n" > "app/x.csv "')"
TSP2="$(on_top "$TSP" tsp bash -c 'printf "b\n" > "app/x.csv "')"
approve "$TSP" develop; move_head "$TSP2"
sync_case 0 'a name with a trailing space is read whole' "$TSP2"
# A name that is only whitespace cannot be classified alone: fail closed, never open.
WSP="$(commit_change whitespace bash -c 'printf "name: x\n" > spec/fixtures/new.yml; printf "a\n" > " "')"
scope_fail_case 'a whitespace-only name next to a fixture fails closed' bash "$CHECK" --data-scope "$BASE" "$WSP"

# staging still records the scope form.
stub_pr "$REL_FIX" staging
run_ci 0 yes 'labeled for staging: approval recorded' "$REL_FIX" EVENT_ACTION=labeled LABEL_NAME=synthetic-data EVENT_BASE_REF=staging
total=$((total + 1))
got_desc="$(jq -r '[.[] | select(.context == "data-bearing-approval/staging")][0].description' "$GH_STUB/statuses.json")"
want_desc="Synthetic data confirmed by reviewer; scope $(scope_of staging "$BASE" "$REL_FIX" "$FIX")"
if [ "$got_desc" = "$want_desc" ]; then printf '  ok   description  ci: a staging approval still names its scope\n'
else printf '  FAIL description [%s] (expected [%s])  ci: staging description\n' "$got_desc" "$want_desc"; fails=$((fails + 1)); fi

# The approval covers one change set: the scope recorded in it (the merge bases for
# develop, the commits beyond develop and the base for staging and main) must equal the
# scope now. A base rewrite with the same head changes the scope, so the old approval no
# longer counts.
stub_pr "$FIX" develop; add_status "$FIX" "$APPROVAL_DEV" success "$APP_LOGIN" 'Synthetic data confirmed by reviewer'
run_ci 1 yes 'an approval with no scope does not count' "$FIX"
stub_pr "$FIX" develop; add_status "$FIX" "$APPROVAL_DEV" success "$APP_LOGIN" "Synthetic data confirmed by reviewer; scope $(scope_of develop "$FIX" "$FIX")"
run_ci 1 yes 'an approval for another scope does not count' "$FIX"
stub_pr "$FIX" develop; add_status "$FIX" "$APPROVAL_DEV" success "$APP_LOGIN" 'Synthetic data confirmed by reviewer; scope not-a-scope'
run_ci 1 yes 'an approval with a malformed scope does not count' "$FIX"
# develop rewritten: REL_FIX was approved against develop at $FIX (merge base $FIX);
# develop is then reset to $BASE and the PR's base.sha refreshed, so $BASE...REL_FIX now
# also carries $FIX's fixture, which the approval never covered.
stub_pr "$REL_FIX" develop "$FIX"; add_status "$REL_FIX" "$APPROVAL_DEV" success
set_origin develop "$BASE"
jq --arg b "$BASE" '.base.sha = $b' "$GH_STUB/pr.json" > "$GH_STUB/pr.tmp" && mv "$GH_STUB/pr.tmp" "$GH_STUB/pr.json"
run_ci 1 yes 'after a develop rewrite, the old approval does not cover the head' "$REL_FIX"
set_origin develop "$FIX"
# staging, develop rewritten: the commits beyond develop grow, so the scope changes.
stub_pr "$REL_FIX" staging; add_status "$REL_FIX" data-bearing-approval/staging success
set_origin develop "$BASE"
run_ci 1 yes 'PR to staging: after a develop rewrite, the old approval does not count' "$REL_FIX" EVENT_BASE_REF=staging
set_origin develop "$FIX"
# Recording: the approval carries the scope of the change set it was given for.
stub_pr "$REL_FIX" develop "$FIX"
run_ci 0 yes 'labeled: approval recorded with its scope' "$REL_FIX" EVENT_ACTION=labeled LABEL_NAME=synthetic-data
total=$((total + 1))
got_desc="$(jq -r --arg c "$APPROVAL_DEV" '[.[] | select(.context == $c)][0].description' "$GH_STUB/statuses.json")"
want_desc="Synthetic data confirmed by reviewer; data $(data_scope_for "$FIX" "$REL_FIX" 'spec/fixtures/direct\.yml$')"
if [ "$got_desc" = "$want_desc" ]; then printf '  ok   description  ci: the recorded approval names its scope\n'
else printf '  FAIL description [%s] (expected [%s])  ci: the recorded approval names its scope\n' "$got_desc" "$want_desc"; fails=$((fails + 1)); fi
# A label event whose base had another scope (the base changed between the label and the
# run, or a re-run after a rewrite) records nothing and removes the label.
stub_pr "$REL_FIX" develop "$FIX"
run_ci 1 yes 'labeled against another base scope: no approval recorded' "$REL_FIX" EVENT_ACTION=labeled LABEL_NAME=synthetic-data EVENT_BASE_SHA="$BASE"
posted_case "$REL_FIX data-bearing-paths/develop failure" 'no approval when the event base scope differs'
deleted_case yes 'the label is removed so it can be added again'
stub_pr "$REL_FIX" develop "$FIX"
run_ci 1 yes 'labeled with an event base not in the repo: no approval recorded' "$REL_FIX" EVENT_ACTION=labeled LABEL_NAME=synthetic-data EVENT_BASE_SHA=0123456789abcdef0123456789abcdef01234567
posted_case "$REL_FIX data-bearing-paths/develop failure" 'no approval for an unknown event base'
deleted_case yes 'the label is removed for an unknown event base'
# An older event base with the same scope (develop moved on, same merge base) still records.
git -C "$REPO" checkout -q -B dev-later "$FIX"
mkdir -p "$REPO/app/models" && printf 'class L; end\n' > "$REPO/app/models/l.rb"
git -C "$REPO" add -A && git -C "$REPO" commit -q -m 'develop moves on'
DEV_LATER="$(git -C "$REPO" rev-parse HEAD)"
set_origin develop "$DEV_LATER"
stub_pr "$REL_FIX" develop "$DEV_LATER"
run_ci 0 yes 'labeled with an older event base of the same scope: approval recorded' "$REL_FIX" EVENT_ACTION=labeled LABEL_NAME=synthetic-data EVENT_BASE_SHA="$FIX"
posted_case "$REL_FIX $APPROVAL_DEV success|$REL_FIX data-bearing-paths/develop success" 'the approval is recorded when the scopes match'
set_origin develop "$FIX"
stub_pr "$FIX" develop
run_ci 3 no 'EVENT_BASE_SHA unset on a labeled event fails closed' "$FIX" EVENT_ACTION=labeled LABEL_NAME=synthetic-data EVENT_BASE_SHA=
posted_case "$FIX data-bearing-paths/develop error" 'only an error verdict without the event base'
# A replayed labeled run (a re-run reuses the event) records nothing once the label is
# gone: it was removed when the approval was first recorded.
stub_pr "$REL_FIX" staging; stub_labels '[]'
set_origin develop "$BASE"
run_ci 1 yes 'PR to staging: a re-run of a labeled run after the label is gone records nothing' "$REL_FIX" EVENT_ACTION=labeled LABEL_NAME=synthetic-data EVENT_BASE_REF=staging
posted_case "$REL_FIX data-bearing-paths/staging failure" 'no approval from a replayed labeled run (staging)'
set_origin develop "$FIX"
stub_pr "$FIX" develop; stub_labels '[{"name":"bug"}]'
run_ci 1 yes 'a re-run of a labeled run after the label is gone records nothing (develop)' "$FIX" EVENT_ACTION=labeled LABEL_NAME=synthetic-data
posted_case "$FIX data-bearing-paths/develop failure" 'no approval from a replayed labeled run (develop)'
# Only a run's first attempt records an approval: a re-run replays the labeled event,
# and the label may still be on if its removal failed.
stub_pr "$REL_FIX" staging
set_origin develop "$BASE"
run_ci 1 yes 'PR to staging: a re-run (attempt 2) with the label still on records nothing' "$REL_FIX" EVENT_ACTION=labeled LABEL_NAME=synthetic-data EVENT_BASE_REF=staging GITHUB_RUN_ATTEMPT=2
posted_case "$REL_FIX data-bearing-paths/staging failure" 'no approval from a re-run attempt'
deleted_case yes 'a re-run attempt removes the label so it can be added again'
set_origin develop "$FIX"
stub_pr "$FIX" develop
run_ci 3 no 'GITHUB_RUN_ATTEMPT unset on a labeled event fails closed' "$FIX" EVENT_ACTION=labeled LABEL_NAME=synthetic-data GITHUB_RUN_ATTEMPT=
posted_case "$FIX data-bearing-paths/develop error" 'only an error verdict without the run attempt'
# A labeled run removes the label on every exit, including a failure.
stub_pr "$FIX" develop; printf 'boom\n' > "$GH_STUB/perm.fail"
run_ci 3 no 'labeled, permission lookup fails: fails closed' "$FIX" EVENT_ACTION=labeled LABEL_NAME=synthetic-data
deleted_case yes 'the label is removed when a labeled run fails'
# The base is checked before an approval is recorded.
stub_pr "$FIX" develop "$CODE"
run_ci 3 no 'labeled with base.sha not on the live base: no approval, fails closed' "$FIX" EVENT_ACTION=labeled LABEL_NAME=synthetic-data
posted_case "$FIX data-bearing-paths/develop error" 'only an error verdict when the base check fails on a labeled run'
deleted_case yes 'the label is removed when the base check fails'
# A scope that cannot be computed (no merge base) fails closed and records nothing.
stub_pr "$ORPHAN" develop
run_ci 3 no 'labeled with no merge base: the scope fails, fails closed' "$ORPHAN" EVENT_ACTION=labeled LABEL_NAME=synthetic-data
posted_case "$ORPHAN data-bearing-paths/develop error" 'only an error verdict when the scope cannot be computed'

# --mark: the workflow posts pending before any step that can fail, and error from a
# failure step, on the event's head and base, so an earlier pass cannot stand.
stub_pr "$FIX" develop
run_ci --mark-pending 0 no 'mark pending posts pending on the event head' "$FIX"
posted_case "$FIX data-bearing-paths/develop pending" 'pending is posted for the event base'
stub_pr "$FIX" develop; add_status "$FIX" data-bearing-paths/develop success
run_ci --mark-error 0 no 'mark error replaces an earlier pass' "$FIX"
posted_case "$FIX data-bearing-paths/develop error" 'error is posted for the event base'
stub_pr "$FIX" develop
run_ci --mark-error 0 no 'mark for a base outside the allowlist posts nothing' "$FIX" EVENT_BASE_REF=release
posted_case NONE 'no mark for a base outside the allowlist'
stub_pr "$FIX" develop; printf 'boom\n' > "$GH_STUB/verdict.fail"
run_ci --mark-pending 3 no 'a mark that cannot be posted fails' "$FIX"
stub_pr "$FIX" develop
run_ci --mark-success 3 no 'mark accepts only pending or error' "$FIX"
posted_case NONE 'no status for a refused mark'
stub_pr "$FIX" develop
run_ci --mark-pending 3 no 'mark without the App token fails closed' "$FIX" STATUS_TOKEN=

# The per-path cache is shared by the head and the walk: the flagged path is classified
# alone once, not once per commit. Every commit here changes two paths, so no whole-commit
# list is one line; a clean path can be classified again as the one line of the complement
# list (that is the guard), so only the flagged path is counted.
COUNTCLS="$WORK/classifier-count.sh"
CLSLOG="$WORK/classified-alone"
printf '#!/usr/bin/env bash\n[ "$(grep -c "" "$3")" = 1 ] && cat "$3" >> "%s"\nexec bash "%s" "$@"\n' \
  "$CLSLOG" "$REPO_ROOT/scripts/codex-review-path-classifier.sh" > "$COUNTCLS"
approve "$TSP" develop; move_head "$TSP2"; : > "$CLSLOG"
sync_case 0 'a carried run with a counting classifier' "$TSP2" CLASSIFIER="$COUNTCLS"
total=$((total + 1))
n_new="$(grep -cx 'spec/fixtures/new.yml' "$CLSLOG")"
if [ "$n_new" = 1 ]; then printf '  ok   cache  ci: the flagged path was classified alone once across the head and the walk\n'
else printf '  FAIL cache  ci: the flagged path was classified alone %s times (expected 1)\n' "$n_new"; fails=$((fails + 1)); fi

total=$((total + 1))
if [ ! -s "$LEAK" ]; then printf '  ok   tokens  ci: the check never ran with GH_TOKEN or STATUS_TOKEN set\n'
else printf '  FAIL tokens  ci: the check ran with a token set (%s)\n' "$(head -1 "$LEAK")"; fails=$((fails + 1)); fi

echo
if [ "$fails" -eq 0 ]; then
  echo "data-bearing-path-check-test: OK ($total cases)"
  exit 0
fi
echo "data-bearing-path-check-test: $fails of $total cases FAILED"
exit 1
