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
# Rename detection on in this repo, whatever the caller's git config says, so the rename
# preconditions below hold on any machine. GIT_CONFIG_* in the environment still overrides it.
git -C "$REPO" config diff.renames true
printf 'base\n' > "$REPO/README.md"
git -C "$REPO" add README.md
git -C "$REPO" commit -q -m base
BASE="$(git -C "$REPO" rev-parse HEAD)"

# classify <base> <head> [env assignments...]: runs the classifier in $REPO (or in
# $CLASSIFY_DIR when the caller sets it) and sets
# RESULT to blocked, codex, claude-deep, or ERR3. Any other outcome (another exit
# code, a missing or malformed route, a route written alongside exit 3) is reported
# as BAD:<detail> so it can never match an expectation by accident.
classify() {
  local base="$1" head="$2" out rc route data
  shift 2
  out="$WORK/github_output"
  : > "$out"
  rc=0
  (cd "${CLASSIFY_DIR:-$REPO}" && env GITHUB_OUTPUT="$out" "$@" bash "$CLASSIFIER" "$base" "$head") >/dev/null 2>&1 || rc=$?
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
real_case blocked "x/$V/words-en.json"
real_case blocked 'db/language'
real_case blocked 'DB/LANGUAGE/EN/X.JSON'

echo "== db/language: the vendored upstream files block too =="
real_case blocked "$V/NOTICE.md"
real_case blocked "$V/rules-en.json"
real_case blocked "$V/words-en.json"
real_case blocked "$V/NOTICE.md" "$V/rules-en.json" "$V/words-en.json"

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

echo "== a rename out of a data-bearing path is classified by its old name too =="
git -C "$REPO" checkout -q --detach "$BASE"
mkdir -p "$REPO/spec/fixtures"
printf 'kid: test\n' > "$REPO/spec/fixtures/x.yml"
git -C "$REPO" add spec/fixtures/x.yml
git -C "$REPO" commit -q -m 'rename-out base'
OBASE="$(git -C "$REPO" rev-parse HEAD)"
mkdir -p "$REPO/app"
git -C "$REPO" mv spec/fixtures/x.yml app/x.yml
git -C "$REPO" commit -q -m 'rename-out head'
OHEAD="$(git -C "$REPO" rev-parse HEAD)"
# Precondition: the listing the classifier would make without --no-renames (git's own
# rename config, no -M) holds only app/x.yml, or the case below proves nothing.
total=$((total + 1))
if [ "$(git -C "$REPO" diff --name-only "$OBASE...$OHEAD")" = "app/x.yml" ]; then
  echo "  ok   precondition, git detects the rename out of spec/fixtures/"
else
  echo "  FAIL precondition, git detects the rename out of spec/fixtures/"
  fails=$((fails + 1))
fi
classify "$OBASE" "$OHEAD"
report blocked "git mv spec/fixtures/x.yml -> app/x.yml"

echo "== a rename out of db/language/, and a deletion there, are classified by the old name =="
git -C "$REPO" checkout -q --detach "$BASE"
mkdir -p "$REPO/db/language/en"
printf '{"rows":[1]}\n' > "$REPO/db/language/en/x.json"
git -C "$REPO" add db/language/en/x.json
git -C "$REPO" commit -q -m 'language base'
LBASE="$(git -C "$REPO" rev-parse HEAD)"
mkdir -p "$REPO/lib"
git -C "$REPO" mv db/language/en/x.json lib/x.json
git -C "$REPO" commit -q -m 'language rename-out'
LHEAD="$(git -C "$REPO" rev-parse HEAD)"
total=$((total + 1))
if [ "$(git -C "$REPO" diff --name-only "$LBASE...$LHEAD")" = "lib/x.json" ]; then
  echo "  ok   precondition, git detects the rename out of db/language/"
else
  echo "  FAIL precondition, git detects the rename out of db/language/"
  fails=$((fails + 1))
fi
classify "$LBASE" "$LHEAD"
report blocked "git mv db/language/en/x.json -> lib/x.json"
git -C "$REPO" checkout -q --detach "$LBASE"
git -C "$REPO" rm -q db/language/en/x.json
git -C "$REPO" commit -q -m 'language delete'
classify "$LBASE" "$(git -C "$REPO" rev-parse HEAD)"
report blocked "git rm db/language/en/x.json"

echo "== a large listing (far past a pipe buffer) classifies end to end =="
BIG="$(for i in $(seq 1 20000); do printf 'app/models/generated_%05d.rb\n' "$i"; done)"
total=$((total + 1))
if [ "${#BIG}" -gt 65536 ]; then
  echo "  ok   listing is ${#BIG} bytes (more than 65536)"
else
  echo "  FAIL listing is ${#BIG} bytes, not more than 65536; the large-listing cases prove nothing"
  fails=$((fails + 1))
fi
stub_case codex '20000 ordinary paths (stubbed git)' "$BIG"$'\n'
stub_case blocked '20000 ordinary paths, then db/language/en/vocab-en.json (stubbed git)' \
  "$BIG"$'\ndb/language/en/vocab-en.json\n'
stub_case blocked 'db/language/en/vocab-en.json, then 20000 ordinary paths (stubbed git)' \
  $'db/language/en/vocab-en.json\n'"$BIG"$'\n'
# The same shape through the data-bearing patterns: the match is on the first line and
# far more than a pipe buffer of paths follows it.
stub_case blocked 'db/migrate/20260101000000_add.rb, then 20000 ordinary paths (stubbed git)' \
  $'db/migrate/20260101000000_add.rb\n'"$BIG"$'\n'

echo "== paths are read byte for byte and from the repo root =="
# Under a UTF-8 locale `.` does not match an invalid byte, so db/migrate/.*\.rb cannot
# see this path unless the classifier reads bytes. The probe proves C.UTF-8 really is
# a multibyte locale on this machine, so the case cannot pass on a silent fallback to C.
total=$((total + 1))
if [ "$(printf 'a\377b\n' | LC_ALL=C.UTF-8 /usr/bin/grep -ac 'a.b')" = 0 ]; then
  echo "  ok   C.UTF-8 is a multibyte locale here"
else
  echo "  FAIL C.UTF-8 is not a multibyte locale here; the invalid-byte case proves nothing"
  fails=$((fails + 1))
fi
head="$(commit_paths $'db/migrate/20260101\377_add.rb')"
classify "$BASE" "$head" LC_ALL=C.UTF-8 LANG=C.UTF-8
report blocked 'db/migrate/20260101<0xff>_add.rb under LC_ALL=C.UTF-8'
# With diff.relative set, a listing made from db/ would read language/en/vocab-en.json,
# which the anchored patterns cannot see.
head="$(commit_paths 'db/language/en/vocab-en.json')"
git -C "$REPO" config diff.relative true
CLASSIFY_DIR="$REPO/db" classify "$BASE" "$head"
git -C "$REPO" config --unset diff.relative
report blocked 'db/language/en/vocab-en.json with diff.relative=true, run from db/'

echo "== unrelated paths still route to the reviewer =="
real_case codex 'lib/language/schema2_generator.rb'
real_case codex 'app/models/user.rb'
real_case blocked 'spec/fixtures/users.json'

echo "== letter case: data-bearing and compliance patterns match in any case =="
real_case blocked 'SPEC/FIXTURES/users.json'
real_case blocked 'spec/Fixtures/users.json'
head="$(commit_paths 'Docs/Legal/policy.md')"
classify "$BASE" "$head" CODEX_COMPLIANCE_PATHS=block
report claude-deep 'Docs/Legal/policy.md with CODEX_COMPLIANCE_PATHS=block'
head="$(commit_paths 'AUDIT-REPORTS/findings.json')"
classify "$BASE" "$head" CODEX_COMPLIANCE_PATHS=block
report claude-deep 'AUDIT-REPORTS/findings.json with CODEX_COMPLIANCE_PATHS=block'
head="$(commit_paths 'docs/legal/control.md')"
classify "$BASE" "$head" CODEX_COMPLIANCE_PATHS=block
report claude-deep 'docs/legal/control.md with CODEX_COMPLIANCE_PATHS=block (lowercase control)'

echo "== fail closed: nothing classified means exit 3 and no route =="
classify "$BASE" "$BASE"
report ERR3 'empty diff (base == head)'
classify "$BASE" 0000000000000000000000000000000000000000
report ERR3 'git diff fails (unknown head)'
stub_case ERR3 'empty listing from git (stubbed git)' ''
stub_case ERR3 'git diff exits non-zero after printing paths (stubbed git)' $'README.md\n' 128
stub_case ERR3 'git-quoted path (stubbed git)' $'README.md\n"db/language/en/a\\tb.json"\n'
# The reviewer steps read the names as UTF-8 (codex-review-assemble-prompt.py read_required), so a
# name that is not UTF-8 would crash them; it must stop here instead. A data-bearing name of the
# same shape stays blocked (the db/migrate case above). Control: a valid non-ASCII name still routes.
head="$(commit_paths $'app/models/caf\351.rb')"
classify "$BASE" "$head"
report ERR3 'app/models/caf<0xe9>.rb (Latin-1 name)'
head="$(commit_paths $'docs/legal/caf\351.md')"
classify "$BASE" "$head" CODEX_COMPLIANCE_PATHS=block
report ERR3 'docs/legal/caf<0xe9>.md with CODEX_COMPLIANCE_PATHS=block'
real_case codex 'app/models/café.rb'
# The UTF-8 check must fail closed when the checker itself fails.
ICONV_STUB="$WORK/iconv-stub"
mkdir -p "$ICONV_STUB"
printf '#!/usr/bin/env bash\nexit 1\n' > "$ICONV_STUB/iconv"
chmod +x "$ICONV_STUB/iconv"
head="$(commit_paths 'app/models/user.rb')"
classify "$BASE" "$head" PATH="$ICONV_STUB:$PATH"
report ERR3 'iconv fails during the UTF-8 check'
# glibc iconv accepts byte sequences that are not UTF-8 (a code point past U+10FFFF, the old
# 5-byte form); the reviewer steps decode with Python, which rejects them, so the check must too.
head="$(commit_paths $'app/models/a\364\220\200\200.rb')"
classify "$BASE" "$head"
report ERR3 'app/models/a<f4 90 80 80>.rb (past U+10FFFF)'
head="$(commit_paths $'app/models/a\370\210\200\200\200.rb')"
classify "$BASE" "$head"
report ERR3 'app/models/a<f8 88 80 80 80>.rb (5-byte form)'
# Every name is checked, not only the first one listed.
head="$(commit_paths 'app/models/a.rb' $'app/models/z\351.rb')"
classify "$BASE" "$head"
report ERR3 'a valid name, then app/models/z<0xe9>.rb'
# The same with a name only the Python check rejects (iconv accepts it), so a Python check that
# reads only the first name fails here.
head="$(commit_paths 'app/models/a.rb' $'app/models/z\364\220\200\200.rb')"
classify "$BASE" "$head"
report ERR3 'a valid name, then app/models/z<f4 90 80 80>.rb'
PY_STUB="$WORK/python-stub"
mkdir -p "$PY_STUB"
printf '#!/usr/bin/env bash\nexit 1\n' > "$PY_STUB/python3"
chmod +x "$PY_STUB/python3"
head="$(commit_paths 'app/models/user.rb')"
classify "$BASE" "$head" PATH="$PY_STUB:$PATH"
report ERR3 'python3 fails during the UTF-8 check'
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
# The stub above fails at the first grep, so it never reaches a later call site. This
# one fails only when its pattern contains $GREP_FAIL_ON and otherwise runs the real
# grep, so each call site is reached after the earlier ones ran cleanly.
SITE_STUB="$WORK/grep-site-stub"
mkdir -p "$SITE_STUB"
cat > "$SITE_STUB/grep" <<'STUB'
#!/usr/bin/env bash
case "${!#}" in *"$GREP_FAIL_ON"*) exit 2 ;; esac
exec /usr/bin/grep "$@"
STUB
chmod +x "$SITE_STUB/grep"
# site_case <expect> <pattern-substring> <label> <path...>
site_case() {
  local expect="$1" on="$2" label="$3" head
  shift 3
  head="$(commit_paths "$@")"
  classify "$BASE" "$head" PATH="$SITE_STUB:$PATH" GREP_FAIL_ON="$on"
  report "$expect" "$label"
}
# Control: a substring no pattern contains, so every grep passes through. Without it,
# a stub that could not run the real grep would fail everywhere and pass the cases below.
site_case codex 'no-pattern-contains-this' 'grep site stub passes through when nothing fails' 'app/models/user.rb'
site_case ERR3 '^"' 'grep fails only at the git-quoted check' 'app/models/user.rb'
site_case ERR3 'fixtures' 'grep fails only at the data-bearing patterns' 'app/models/user.rb'
site_case ERR3 '[lL][aA]' 'grep fails only at the db/language pattern' 'app/models/user.rb'
site_case ERR3 'docs/legal' 'grep fails only at the compliance patterns' 'app/models/user.rb'

echo
if [ "$fails" -eq 0 ]; then
  echo "codex-review-path-classifier-test: OK ($total cases)"
  exit 0
fi
echo "codex-review-path-classifier-test: $fails of $total cases FAILED"
exit 1
