#!/usr/bin/env bash
#
# data-bearing-path-check-test.sh - proves scripts/data-bearing-path-check.sh blocks a
# PR that changes a data-bearing path unless it carries the synthetic-data label, and
# fails closed when it cannot decide.
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

# run_check <expect-exit> <label> <head> <labels-json|UNSET> [env assignments...]
# UNSET runs the check with PR_LABELS_JSON removed from the environment. The PR base
# is $BASE unless the caller sets CHECK_BASE for the call.
run_check() {
  local expect="$1" label="$2" head="$3" labels="$4" rc=0
  shift 4
  total=$((total + 1))
  if [ "$labels" = UNSET ]; then
    (cd "$REPO" && env -u PR_LABELS_JSON "$@" bash "$CHECK" "$BASE" "$head") >/dev/null 2>&1 || rc=$?
  else
    (cd "$REPO" && env PR_LABELS_JSON="$labels" "$@" bash "$CHECK" "${CHECK_BASE:-$BASE}" "$head") >/dev/null 2>&1 || rc=$?
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
run_check 0 'code-only change passes with no label'                 "$CODE" '[]'
run_check 1 'new fixture with no label fails'                        "$FIX"  '[]'
run_check 0 'new fixture with a fresh synthetic-data label passes'   "$FIX"  '["synthetic-data"]' LABEL_APPLIED_AT=2099-01-01T00:00:00Z HEAD_ARRIVED_AT=2026-01-01T00:00:00Z
run_check 0 'label found among several labels'                       "$FIX"  '["bug","synthetic-data","ui"]' LABEL_APPLIED_AT=2099-01-01T00:00:00Z HEAD_ARRIVED_AT=2026-01-01T00:00:00Z
run_check 1 'label applied before the head arrived does not exempt'   "$FIX"  '["synthetic-data"]' LABEL_APPLIED_AT=2000-01-01T00:00:00Z HEAD_ARRIVED_AT=2026-01-01T00:00:00Z
run_check 1 'label at the same second as arrival does not exempt'    "$FIX"  '["synthetic-data"]' LABEL_APPLIED_AT=2026-01-01T00:00:00Z HEAD_ARRIVED_AT=2026-01-01T00:00:00Z
run_check 0 'label one second after arrival exempts (offsets parsed)' "$FIX" '["synthetic-data"]' LABEL_APPLIED_AT=2025-12-31T17:00:01-07:00 HEAD_ARRIVED_AT=2026-01-01T00:00:00Z
run_check 3 'label with no head arrival time fails closed'           "$FIX"  '["synthetic-data"]' LABEL_APPLIED_AT=2099-01-01T00:00:00Z
run_check 3 'label with no applied time fails closed'                "$FIX"  '["synthetic-data"]'
run_check 3 'label with an unparseable applied time fails closed'    "$FIX"  '["synthetic-data"]' LABEL_APPLIED_AT=yesterday-ish HEAD_ARRIVED_AT=2026-01-01T00:00:00Z
run_check 1 'a different label does not exempt'                      "$FIX"  '["bug"]' LABEL_APPLIED_AT=2099-01-01T00:00:00Z HEAD_ARRIVED_AT=2026-01-01T00:00:00Z
run_check 1 'a label that only contains the name does not exempt'    "$FIX"  '["not-synthetic-data"]' LABEL_APPLIED_AT=2099-01-01T00:00:00Z HEAD_ARRIVED_AT=2026-01-01T00:00:00Z
run_check 1 'edited existing fixture with no label fails'            "$EDIT" '[]'
run_check 1 'fixture renamed out of spec/fixtures fails'             "$MOVE" '[]'
run_check 1 'csv data file fails'                                    "$CSV"  '[]'
run_check 1 'db/language file fails'                                 "$LANG_" '[]'
run_check 1 'fixture in an earlier commit of the PR fails'           "$MULTI" '[]'
run_check 0 'PR_LABELS_JSON unset is treated as no labels'           "$CODE" UNSET
run_check 1 'PR_LABELS_JSON unset with a fixture fails'              "$FIX"  UNSET
run_check 3 'malformed labels JSON fails closed'                     "$FIX"  'not json'
run_check 3 'labels JSON that is not an array fails closed'          "$FIX"  '{"name":"synthetic-data"}'

# A classifier that cannot decide must stop the check, label or not.
STUB="$WORK/classifier-exit3.sh"
printf '#!/usr/bin/env bash\nexit 3\n' > "$STUB"
run_check 3 'classifier exit 3 fails closed'                         "$CODE" '[]' CLASSIFIER="$STUB"
run_check 3 'classifier exit 3 fails closed even with the label'     "$FIX"  '["synthetic-data"]' LABEL_APPLIED_AT=2099-01-01T00:00:00Z HEAD_ARRIVED_AT=2026-01-01T00:00:00Z CLASSIFIER="$STUB"
# A classifier that exits 0 but writes no verdict is not a clean result.
STUB0="$WORK/classifier-silent.sh"
printf '#!/usr/bin/env bash\nexit 0\n' > "$STUB0"
run_check 3 'classifier with no verdict fails closed'                "$CODE" '[]' CLASSIFIER="$STUB0"
# A verdict followed by a failing exit is still a failure: the exit code decides.
STUBF="$WORK/classifier-verdict-then-exit3.sh"
printf '#!/usr/bin/env bash\necho data_bearing=false >> "$GITHUB_OUTPUT"\nexit 3\n' > "$STUBF"
run_check 3 'classifier verdict with a failing exit fails closed'    "$CODE" '[]' CLASSIFIER="$STUBF"

# An empty range has nothing to publish.
run_check 0 'empty range passes'                                     "$BASE" '[]'

# Editing the check's own files needs the label, so the control gets a reviewer's look.
CTRL="$(commit_change control bash -c 'mkdir -p scripts && printf "# edit\n" > scripts/data-bearing-path-check.sh')"
run_check 1 "editing the check's own script needs the label"        "$CTRL" '[]'
run_check 0 "editing the check's own script with a fresh label"      "$CTRL" '["synthetic-data"]' LABEL_APPLIED_AT=2099-01-01T00:00:00Z HEAD_ARRIVED_AT=2026-01-01T00:00:00Z

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
run_check 0 'PR to main carrying only develop content passes'        "$FIX"      '[]' PR_BASE_REF=main DEVELOP_SHA="$FIX"
run_check 0 'PR to main: code beyond develop passes'                 "$REL_CODE" '[]' PR_BASE_REF=main DEVELOP_SHA="$FIX"
run_check 1 'PR to staging: fixture beyond develop fails'            "$REL_FIX"  '[]' PR_BASE_REF=staging DEVELOP_SHA="$FIX"
run_check 3 'PR to main without DEVELOP_SHA fails closed'            "$REL_FIX"  '[]' PR_BASE_REF=main

# Add then delete inside the PR: develop is squash-only, so only the net diff merges;
# staging and main take merge commits, so every commit not in develop is checked.
git -C "$REPO" checkout -q -B add-del "$FIX"
printf 'name: real-looking\n' > "$REPO/spec/fixtures/gone.yml"
git -C "$REPO" add -A && git -C "$REPO" commit -q -m 'add a fixture'
git -C "$REPO" rm -q spec/fixtures/gone.yml
mkdir -p "$REPO/app/models" && printf 'class D; end\n' > "$REPO/app/models/d.rb"
git -C "$REPO" add -A && git -C "$REPO" commit -q -m 'delete it, add code'
ADDDEL="$(git -C "$REPO" rev-parse HEAD)"
run_check 1 'PR to staging: fixture added then deleted still fails'  "$ADDDEL" '[]' PR_BASE_REF=staging DEVELOP_SHA="$FIX"
run_check 1 'PR to main: fixture added then deleted still fails'     "$ADDDEL" '[]' PR_BASE_REF=main DEVELOP_SHA="$FIX"
# An empty commit in the range is skipped, not treated as an error.
git -C "$REPO" checkout -q -B with-empty "$REL_CODE"
git -C "$REPO" commit -q --allow-empty -m 'empty'
WEMPTY="$(git -C "$REPO" rev-parse HEAD)"
run_check 0 'PR to main: an empty commit in the range is skipped'    "$WEMPTY" '[]' PR_BASE_REF=main DEVELOP_SHA="$FIX"
# A classifier failure inside the per-commit loop must stop the check.
run_check 3 'per-commit classifier failure fails closed'             "$REL_FIX" '[]' PR_BASE_REF=staging DEVELOP_SHA="$FIX" CLASSIFIER="$STUB"
run_check 3 'per-commit classifier with no verdict fails closed'     "$REL_FIX" '[]' PR_BASE_REF=staging DEVELOP_SHA="$FIX" CLASSIFIER="$STUB0"

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
run_check 0 'PR to main: a release merge of develop passes'          "$RELMERGE"  '[]' PR_BASE_REF=main DEVELOP_SHA="$FIX"
run_check 1 'PR to main: a fixture added inside a merge commit fails' "$EVILFIX"  '[]' PR_BASE_REF=main DEVELOP_SHA="$FIX"
run_check 0 'PR to main: code added inside a merge commit passes'    "$EVILCODE"  '[]' PR_BASE_REF=main DEVELOP_SHA="$FIX"
run_check 1 'PR to staging: a fixture on a merged side branch fails' "$SIDEMERGE" '[]' PR_BASE_REF=staging DEVELOP_SHA="$FIX"
run_check 3 'PR to main: classifier failure on a merge fails closed' "$EVILCODE"  '[]' PR_BASE_REF=main DEVELOP_SHA="$FIX" CLASSIFIER="$STUB"
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
run_check 1 'PR to main: a fixture from a merged orphan branch fails' "$ORPHANMERGE" '[]' PR_BASE_REF=main DEVELOP_SHA="$FIX"
# Commits already on the base branch are not the PR's: a staging-only fixture (reviewed
# when it landed on staging) does not trip a later PR to staging that contains it.
git -C "$REPO" checkout -q -B staging-tip "$BASE"
printf 'name: hotfix\n' > "$REPO/spec/fixtures/hotfix.yml"
git -C "$REPO" add -A && git -C "$REPO" commit -q -m 'staging-only fixture'
STAGING_TIP="$(git -C "$REPO" rev-parse HEAD)"
mkdir -p "$REPO/app/models" && printf 'class S; end\n' > "$REPO/app/models/s.rb"
git -C "$REPO" add -A && git -C "$REPO" commit -q -m 'code on top of staging'
ON_STAGING="$(git -C "$REPO" rev-parse HEAD)"
CHECK_BASE="$STAGING_TIP" run_check 0 'PR to staging: a fixture already on staging does not count' "$ON_STAGING" '[]' PR_BASE_REF=staging DEVELOP_SHA="$FIX"

# Any workflow change needs the label: a PR could add its own pull_request job with
# this check's name and post a green result beside the real one.
WF="$(commit_change workflow bash -c 'mkdir -p .github/workflows && printf "on: pull_request\n" > .github/workflows/shadow.yml')"
run_check 1 'adding a workflow needs the label'                      "$WF" '[]'
run_check 0 'adding a workflow with a fresh label passes'            "$WF" '["synthetic-data"]' LABEL_APPLIED_AT=2099-01-01T00:00:00Z HEAD_ARRIVED_AT=2026-01-01T00:00:00Z
git -C "$REPO" checkout -q -B wf-add-del "$FIX"
mkdir -p "$REPO/.github/workflows" && printf 'on: pull_request\n' > "$REPO/.github/workflows/shadow.yml"
git -C "$REPO" add -A && git -C "$REPO" commit -q -m 'add a workflow'
git -C "$REPO" rm -q .github/workflows/shadow.yml && git -C "$REPO" commit -q -m 'remove it'
WFADDDEL="$(git -C "$REPO" rev-parse HEAD)"
run_check 1 'PR to staging: a workflow added then removed needs the label' "$WFADDDEL" '[]' PR_BASE_REF=staging DEVELOP_SHA="$FIX"
git -C "$REPO" checkout -q -B ctrl-beyond "$FIX"
mkdir -p "$REPO/scripts" && printf '# edit\n' > "$REPO/scripts/data-bearing-path-check.sh"
git -C "$REPO" add -A && git -C "$REPO" commit -q -m 'edit the check'
CTRLREL="$(git -C "$REPO" rev-parse HEAD)"
run_check 1 "PR to main: editing the check's script beyond develop needs the label" "$CTRLREL" '[]' PR_BASE_REF=main DEVELOP_SHA="$FIX"

# --- The CI entry script, against a stubbed gh. The stub applies the real --jq
# filter to canned JSON, so the filters are tested too. ---
CI="${CI_SCRIPT:-$REPO_ROOT/scripts/data-bearing-path-check-ci.sh}"
GHBIN="$WORK/ghbin"
GH_STUB="$WORK/ghstub"
mkdir -p "$GHBIN"
cat > "$GHBIN/gh" <<'GHEOF'
#!/usr/bin/env bash
# gh api [--paginate] <url> [--jq <expr>]
shift
url="" expr="" method=GET
while [ $# -gt 0 ]; do
  case "$1" in
    --paginate|--silent) shift ;;
    --jq) expr="$2"; shift 2 ;;
    -X|--method) method="$2"; shift 2 ;;
    *) url="$1"; shift ;;
  esac
done
# DELETE on the label endpoint: record it and drop the label from the canned PR.
if [ "$method" = DELETE ]; then
  case "$url" in */issues/*/labels/*) ;; *) echo "gh stub: unexpected DELETE $url" >&2; exit 9 ;; esac
  echo "$url" >> "$GH_STUB/deleted"
  if [ -e "$GH_STUB/delete.fail" ]; then cat "$GH_STUB/delete.fail"; exit 1; fi
  jq '.labels |= map(select(.name != "synthetic-data"))' "$GH_STUB/pr.json" > "$GH_STUB/pr.tmp" \
    && mv "$GH_STUB/pr.tmp" "$GH_STUB/pr.json"
  exit 0
fi
[ "$method" = GET ] || { echo "gh stub: unexpected method $method" >&2; exit 9; }
case "$url" in
  */pulls/*) f=pr ;;
  */issues/*/events) f=events ;;
  */check-suites) f=suites ;;
  *) echo "gh stub: unexpected url $url" >&2; exit 9 ;;
esac
if [ -e "$GH_STUB/$f.fail" ]; then cat "$GH_STUB/$f.fail"; exit 1; fi
if [ -n "$expr" ]; then jq -r "$expr" < "$GH_STUB/$f.json"; else cat "$GH_STUB/$f.json"; fi
GHEOF
chmod +x "$GHBIN/gh"
MARK="$WORK/check-ran"
SPY="$WORK/check-spy.sh"
printf '#!/usr/bin/env bash\ntouch "%s"\nexec bash "%s" "$@"\n' "$MARK" "$CHECK" > "$SPY"
git -C "$REPO" update-ref refs/remotes/origin/develop "$FIX"
git -C "$REPO" update-ref refs/remotes/origin/staging "$BASE"
git -C "$REPO" update-ref refs/remotes/origin/main "$BASE"

# stub_pr <head> <base-ref> <labels-json-array-of-names> [base-sha, default $BASE]
stub_pr() {
  rm -rf "$GH_STUB"; mkdir -p "$GH_STUB"
  jq -n --arg h "$1" --arg b "${4:-$BASE}" --arg r "$2" --argjson l "$3" \
    '{head:{sha:$h}, base:{sha:$b, ref:$r}, labels:($l|map({name:.}))}' > "$GH_STUB/pr.json"
  printf '[]\n' > "$GH_STUB/events.json"
  printf '{"check_suites":[]}\n' > "$GH_STUB/suites.json"
}
labeled_at() { jq -n --args '[ $ARGS.positional[] | {event:"labeled", label:{name:"synthetic-data"}, created_at:.} ] + [{event:"labeled", label:{name:"bug"}, created_at:"2099-01-01T00:00:00Z"}]' "$@" > "$GH_STUB/events.json"; }
suites_at() { jq -n --args '{check_suites: [ $ARGS.positional[] | {created_at:.} ]}' "$@" > "$GH_STUB/suites.json"; }

# run_ci <expect-exit> <expect-check-ran:yes|no> <label> <event-head> [env assignments...]
# EVENT_ACTION defaults to opened; a later assignment overrides it.
run_ci() {
  local expect="$1" ran="$2" label="$3" ehead="$4" rc=0 did=no
  shift 4
  total=$((total + 1))
  rm -f "$MARK"
  (cd "$REPO" && env PATH="$GHBIN:$PATH" GH_STUB="$GH_STUB" REPO=o/r PR_NUMBER=7 EVENT_HEAD_SHA="$ehead" CHECK="$SPY" EVENT_ACTION=opened "$@" bash "$CI") >/dev/null 2>&1 || rc=$?
  [ -e "$MARK" ] && did=yes
  if [ "$rc" = "$expect" ] && [ "$did" = "$ran" ]; then
    printf '  ok   exit %s  ci: %s\n' "$rc" "$label"
  else
    printf '  FAIL exit %s ran=%s (expected %s ran=%s)  ci: %s\n' "$rc" "$did" "$expect" "$ran" "$label"
    fails=$((fails + 1))
  fi
}

stub_pr "$FIX" develop '[]'
run_ci 1 yes 'no label, fixture fails' "$FIX"
stub_pr "$CODE" develop '[]'
run_ci 0 yes 'no label, code only passes' "$CODE"
stub_pr "$FIX" develop '["synthetic-data"]'; labeled_at 2026-05-02T00:00:00Z; suites_at 2026-05-01T00:00:00Z 2026-05-03T00:00:00Z
run_ci 0 yes 'label after the earliest check suite passes' "$FIX"
stub_pr "$FIX" develop '["synthetic-data"]'; labeled_at 2026-04-30T00:00:00Z; suites_at 2026-05-03T00:00:00Z 2026-05-01T00:00:00Z
run_ci 1 yes 'label before the earliest check suite fails' "$FIX"
stub_pr "$FIX" develop '["synthetic-data"]'; labeled_at 2026-04-01T00:00:00Z 2026-05-02T00:00:00Z; suites_at 2026-05-01T00:00:00Z
run_ci 0 yes 'the latest labeled event is the one that counts' "$FIX"
stub_pr "$FIX" develop '["synthetic-data"]'; suites_at 2026-05-01T00:00:00Z
run_ci 3 no 'label present, no labeled event: fails closed before the check' "$FIX"
stub_pr "$FIX" develop '["synthetic-data"]'; labeled_at 2026-05-02T00:00:00Z
run_ci 3 no 'label present, no check suite: fails closed before the check' "$FIX"
stub_pr "$FIX" develop '[]'
run_ci 3 no 'head moved since the event: fails closed before the check' "$CODE"
stub_pr "$FIX" develop '[]'; printf 'boom\n' > "$GH_STUB/pr.fail"
run_ci 3 no 'PR lookup fails: fails closed before the check' "$FIX"
stub_pr "$FIX" develop '["synthetic-data"]'; suites_at 2026-05-01T00:00:00Z; printf '2099-01-01T00:00:00Z\n' > "$GH_STUB/events.fail"
run_ci 3 no 'events lookup fails after partial output: fails closed' "$FIX"
stub_pr "$FIX" develop '["synthetic-data"]'; labeled_at 2026-05-02T00:00:00Z; printf 'boom\n' > "$GH_STUB/suites.fail"
run_ci 3 no 'check-suite lookup fails: fails closed' "$FIX"
stub_pr "$REL_FIX" staging '[]'
run_ci 1 yes 'PR to staging uses origin/develop: fixture beyond develop fails' "$REL_FIX"
stub_pr "$REL_CODE" main '[]'
run_ci 0 yes 'PR to main uses origin/develop: code beyond develop passes' "$REL_CODE"
stub_pr "$RELMERGE" main '[]'
run_ci 0 yes 'PR to main: a release merge of develop passes' "$RELMERGE"

# The earliest of many check suites. `sort | head -n 1` under pipefail could die of
# SIGPIPE once sort's output outgrew the pipe buffer.
stub_pr "$FIX" develop '["synthetic-data"]'; labeled_at 2026-05-02T00:00:00Z
seq 1 10000 | sed 's/.*/2026-05-03T00:00:00Z/' | jq -R . | jq -s '{check_suites: map({created_at: .})} | .check_suites += [{created_at: "2026-05-01T00:00:00Z"}]' > "$GH_STUB/suites.json"
run_ci 0 yes 'earliest of 10,001 check suites is found (no SIGPIPE)' "$FIX"

# A push, a reopen or a new base resets the label: an earlier review does not cover
# the new head, whatever time its commits carry.
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
fresh() { labeled_at 2026-05-02T00:00:00Z; suites_at 2026-05-01T00:00:00Z; }
stub_pr "$FIX" develop '["synthetic-data"]'; fresh
run_ci 1 yes 'synchronize removes the label, then the fixture fails' "$FIX" EVENT_ACTION=synchronize
deleted_case yes 'synchronize removed the synthetic-data label'
stub_pr "$FIX" develop '["synthetic-data"]'; fresh
run_ci 1 yes 'reopened removes the label' "$FIX" EVENT_ACTION=reopened
deleted_case yes 'reopened removed the label'
stub_pr "$FIX" develop '["synthetic-data"]'; fresh
run_ci 1 yes 'edited with a base change removes the label' "$FIX" EVENT_ACTION=edited BASE_FROM=main
deleted_case yes 'a base change removed the label'
stub_pr "$FIX" develop '["synthetic-data"]'; fresh
run_ci 0 yes 'edited without a base change keeps a fresh label' "$FIX" EVENT_ACTION=edited BASE_FROM=
deleted_case no 'a title or body edit leaves the label'
stub_pr "$FIX" develop '["synthetic-data"]'; fresh
run_ci 0 yes 'labeled keeps a fresh label' "$FIX" EVENT_ACTION=labeled
deleted_case no 'labeled leaves the label'
stub_pr "$CODE" develop '[]'
run_ci 0 yes 'synchronize with no label: nothing to remove, code passes' "$CODE" EVENT_ACTION=synchronize
deleted_case no 'no label, no removal call'
stub_pr "$FIX" develop '["synthetic-data"]'; fresh; printf 'boom\n' > "$GH_STUB/delete.fail"
run_ci 3 no 'label removal fails: fails closed before the check' "$FIX" EVENT_ACTION=synchronize
stub_pr "$FIX" develop '[]'
run_ci 3 no 'EVENT_ACTION unset fails closed' "$FIX" EVENT_ACTION=
# The API's base.sha is the base as of the PR's last update. If the base branch was
# force-pushed (say, to scrub real data), that sha may no longer be on it, and a range
# from it would hide the scrubbed commit. It must be an ancestor of the live branch.
stub_pr "$FIX" develop '[]' "$CODE"
run_ci 3 no 'base.sha not on the live base branch fails closed' "$FIX"
# The ref exists here, so only the allowlist can stop it.
git -C "$REPO" update-ref refs/remotes/origin/release "$BASE"
stub_pr "$CODE" release '[]'
run_ci 3 no 'a base branch other than develop, staging or main fails closed' "$CODE"
git -C "$REPO" update-ref -d refs/remotes/origin/release
git -C "$REPO" update-ref -d refs/remotes/origin/main
stub_pr "$REL_CODE" main '[]'
run_ci 3 no 'live base branch missing from the checkout fails closed' "$REL_CODE"
git -C "$REPO" update-ref refs/remotes/origin/main "$BASE"
# A stale run (the head moved on) must not remove a label applied for the newer head.
stub_pr "$CODE" develop '["synthetic-data"]'; fresh
run_ci 3 no 'stale synchronize run fails closed before touching the label' "$FIX" EVENT_ACTION=synchronize
deleted_case no 'a stale run leaves the label'

echo
if [ "$fails" -eq 0 ]; then
  echo "data-bearing-path-check-test: OK ($total cases)"
  exit 0
fi
echo "data-bearing-path-check-test: $fails of $total cases FAILED"
exit 1
