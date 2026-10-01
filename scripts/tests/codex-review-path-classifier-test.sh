#!/usr/bin/env bash
#
# codex-review-path-classifier-test.sh - proves scripts/codex-review-path-classifier.sh
# routes each path shape the way its consumer (codex-review.yml) depends on.
#
# WHY THIS EXISTS
#   The classifier decides whether a PR diff may go to an external reviewer with no
#   BAA. A pattern that silently stops matching, or a failure that reads as "no
#   match", sends a data-bearing diff out. Every case below runs the real script
#   against a real two-commit range (or a stubbed git or grep for shapes git cannot
#   produce) and checks the route it writes to GITHUB_OUTPUT, or that it exits 3
#   and writes nothing.
#
#   Add a case here for every classifier defect found from now on, block AND pass side.
#
# Usage: scripts/tests/codex-review-path-classifier-test.sh
#   CLASSIFIER=<path> overrides the script under test (used to show a case fails
#   against a copy with a rule removed).
# Exit codes: 0 = every case behaved; 1 = a case mismatched.

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CLASSIFIER="${CLASSIFIER:-$REPO_ROOT/scripts/codex-review-path-classifier.sh}"

fails=0
total=0

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
REPO="$WORK/repo"
STUBS="$WORK/stubs"
mkdir -p "$REPO" "$STUBS"

git -C "$REPO" init -q
git -C "$REPO" config user.email test@example.invalid
git -C "$REPO" config user.name test
git -C "$REPO" config commit.gpgsign false
printf 'base\n' > "$REPO/README.md"
git -C "$REPO" add README.md
git -C "$REPO" commit -q -m base
BASE="$(git -C "$REPO" rev-parse HEAD)"

# classify <base> <head> [env assignments...]: runs the classifier in $REPO and sets
# RESULT to blocked, codex, claude-deep, or ERR3. Any other outcome (another exit
# code, a missing or malformed route, a route written alongside exit 3) is reported
# as BAD:<detail> so it can never match an expectation by accident.
classify() {
  local base="$1" head="$2" out rc route data
  shift 2
  out="$WORK/github_output"
  : > "$out"
  rc=0
  (cd "$REPO" && env GITHUB_OUTPUT="$out" "$@" bash "$CLASSIFIER" "$base" "$head") >/dev/null 2>&1 || rc=$?
  route="$(sed -n 's/^reviewer_route=//p' "$out")"
  data="$(sed -n 's/^data_bearing=//p' "$out")"
  if [ "$rc" = 3 ]; then
    if [ -s "$out" ]; then RESULT="BAD:exit3-but-route-written"; else RESULT=ERR3; fi
  elif [ "$rc" != 0 ]; then
    RESULT="BAD:exit$rc"
  elif [ "$route" = blocked ] && [ "$data" = true ]; then
    RESULT=blocked
  elif { [ "$route" = codex ] || [ "$route" = claude-deep ]; } && [ "$data" = false ]; then
    RESULT="$route"
  else
    RESULT="BAD:route=$route,data_bearing=$data"
  fi
}

report() {
  local expect="$1" label="$2"
  total=$((total + 1))
  if [ "$RESULT" = "$expect" ]; then
    printf '  ok   %-8s %s\n' "$RESULT" "$label"
  else
    printf '  FAIL %-8s (expected %s) %s\n' "$RESULT" "$expect" "$label"
    fails=$((fails + 1))
  fi
}

# commit_paths <path...>: one commit on top of $BASE adding each path; prints its SHA.
commit_paths() {
  local p
  git -C "$REPO" checkout -q --detach "$BASE"
  for p in "$@"; do
    mkdir -p "$REPO/$(dirname "$p")"
    printf '{}\n' > "$REPO/$p"
    git -C "$REPO" add -- "$p"
  done
  git -C "$REPO" commit -q -m case
  git -C "$REPO" rev-parse HEAD
}

# real_case <expect> <path...>: the diff BASE...<commit adding the paths>.
real_case() {
  local expect="$1" head
  shift
  head="$(commit_paths "$@")"
  classify "$BASE" "$head"
  report "$expect" "$*"
}

# stub_case <expect> <label> <git-diff-output> [git-diff-exit]: a git stub prints the
# given listing for `git ... diff`, for path shapes git itself never emits. The
# listing goes through a file, not the environment, so a large one fits.
stub_case() {
  local expect="$1" label="$2"
  printf '%s' "$3" > "$WORK/stub_diff_output"
  cat > "$STUBS/git" <<'STUB'
#!/usr/bin/env bash
for a in "$@"; do
  if [ "$a" = diff ]; then cat "$STUB_DIFF_FILE"; exit "${STUB_DIFF_EXIT:-0}"; fi
done
echo "git stub: unexpected call: $*" >&2
exit 99
STUB
  chmod +x "$STUBS/git"
  classify x y PATH="$STUBS:$PATH" STUB_DIFF_FILE="$WORK/stub_diff_output" STUB_DIFF_EXIT="${4:-0}"
  report "$expect" "$label"
}

V='db/language/vendor/openaac-demo-tools-0977e83f'

echo "== classifier parses =="
total=$((total + 1))
if bash -n "$CLASSIFIER"; then echo "  ok   bash -n"; else echo "  FAIL bash -n"; fails=$((fails + 1)); fi

echo "== db/language: data-bearing =="
real_case blocked 'db/language/en/vocab-en.json'
real_case blocked 'db/language/README.md'
real_case blocked "$V/extra-en.json"
real_case blocked "$V/sub/words-en.json"
real_case blocked 'db/language/vendorx/openaac-demo-tools-0977e83f/words-en.json'
real_case blocked 'db/language/VENDOR/openaac-demo-tools-0977e83f/words-en.json'
real_case blocked 'DB/Language/en/vocab-en.json'
real_case blocked 'db/language/vendor/openaac-demo-tools-2026-10-01/words-en.json'
real_case blocked 'db/language/vendor/OpenAAC-demo-tools-0977e83f/words-en.json'
real_case blocked "$V/words-en.json" 'db/language/en/vocab-en.json'
stub_case blocked 'db/language/vendor/../en/vocab-en.json (stubbed git)' \
  $'README.md\ndb/language/vendor/../en/vocab-en.json\n'
stub_case blocked "$V/../../en/vocab-en.json (stubbed git)" \
  "$V/../../en/vocab-en.json"$'\n'
stub_case blocked "$V/NOTICE.md/../../../en/x.json (stubbed git)" \
  "$V/NOTICE.md/../../../en/x.json"$'\n'

echo "== db/language: the pinned vendor files pass =="
real_case codex "$V/NOTICE.md"
real_case codex "$V/rules-en.json"
real_case codex "$V/words-en.json"
real_case codex "$V/NOTICE.md" "$V/rules-en.json" "$V/words-en.json"

echo "== db/language: a rename into the vendor tree is classified by its old name too =="
git -C "$REPO" checkout -q --detach "$BASE"
mkdir -p "$REPO/db/language/en"
printf '{"rows":[1,2,3]}\n' > "$REPO/db/language/en/vocab-en.json"
git -C "$REPO" add db/language/en/vocab-en.json
git -C "$REPO" commit -q -m 'rename base'
RBASE="$(git -C "$REPO" rev-parse HEAD)"
mkdir -p "$REPO/$V"
git -C "$REPO" mv db/language/en/vocab-en.json "$V/words-en.json"
git -C "$REPO" commit -q -m 'rename head'
classify "$RBASE" "$(git -C "$REPO" rev-parse HEAD)"
report blocked "git mv db/language/en/vocab-en.json -> $V/words-en.json"

echo "== a large listing (far past a pipe buffer) classifies end to end =="
BIG="$(for i in $(seq 1 20000); do printf 'app/models/generated_%05d.rb\n' "$i"; done)"
stub_case codex '20000 ordinary paths (stubbed git)' "$BIG"$'\n'
stub_case blocked '20000 ordinary paths, then db/language/en/vocab-en.json (stubbed git)' \
  "$BIG"$'\ndb/language/en/vocab-en.json\n'
stub_case blocked 'db/language/en/vocab-en.json, then 20000 ordinary paths (stubbed git)' \
  $'db/language/en/vocab-en.json\n'"$BIG"$'\n'

echo "== unrelated paths still route to the reviewer =="
real_case codex 'lib/language/schema2_generator.rb'
real_case codex 'app/models/user.rb'
real_case blocked 'spec/fixtures/users.json'

echo "== fail closed: nothing classified means exit 3 and no route =="
classify "$BASE" "$BASE"
report ERR3 'empty diff (base == head)'
classify "$BASE" 0000000000000000000000000000000000000000
report ERR3 'git diff fails (unknown head)'
stub_case ERR3 'empty listing from git (stubbed git)' ''
stub_case ERR3 'git diff exits non-zero after printing paths (stubbed git)' $'README.md\n' 128
stub_case ERR3 'git-quoted path (stubbed git)' $'README.md\n"db/language/en/a\\tb.json"\n'
# Its own directory: $STUBS still holds the git stub, which would turn this case into
# the empty-listing case above and prove nothing about grep.
GREP_STUB="$WORK/grep-stub"
mkdir -p "$GREP_STUB"
cat > "$GREP_STUB/grep" <<'STUB'
#!/usr/bin/env bash
exit 2
STUB
chmod +x "$GREP_STUB/grep"
head="$(commit_paths 'app/models/user.rb')"
classify "$BASE" "$head" PATH="$GREP_STUB:$PATH"
report ERR3 'grep fails (exit 2) during classification'

echo
if [ "$fails" -eq 0 ]; then
  echo "codex-review-path-classifier-test: OK ($total cases)"
  exit 0
fi
echo "codex-review-path-classifier-test: $fails of $total cases FAILED"
exit 1
