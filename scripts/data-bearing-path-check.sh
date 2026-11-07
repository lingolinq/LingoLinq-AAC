#!/usr/bin/env bash
#
# data-bearing-path-check.sh - fails a pull request whose data-bearing changes look like
# real personal data, or that changes this check's own files, unless its head commit
# carries a reviewer's approval.
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
#   migrations are synthetic. So a data-bearing change passes on its own unless a content
#   scan of the lines it ADDS finds something that looks like real personal data (Scot,
#   2026-11-06). The scan is the automated check, and the approval is the exemption for
#   what it flags: a reviewer with write access looks at the data and adds the
#   `synthetic-data` label only when none of it is real.
#   scripts/data-bearing-path-check-ci.sh records that as a commit status on
#   the PR's head commit, named for its base, with the scope of the change
#   set it covers, and passes APPROVED=true to this script only when that status is
#   present and its scope matches the range below. A new push is a new commit with no
#   approval, so nothing has to be reset.
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
#     either range changes here, change scope_of to match.
#   - Inside those ranges, each data-bearing path is judged on its own (scan_entry):
#     - db/language/ and VCR cassettes (a cassettes/, vcr_cassettes/ or vcr/ directory
#       inside a path the classifier already calls data-bearing: spec/ or test/ cassette
#       directories, or one under fixtures/) always need an approval, a deletion included
#       (Scot, 2026-11-06): a scan cannot see names, free text, or a vocabulary built from
#       a user's buttons. A cassette directory the classifier does not know (for example
#       spec/support/vcr_cassettes/) is not data-bearing, as before.
#     - A file that cannot be scanned as text needs one: a binary file type (by
#       extension), a file holding a NUL byte, or a submodule or other non-file entry.
#     - Otherwise the lines it adds are scanned (scan_text). An email address on a domain
#       not reserved for examples, a US phone number outside the fictional 555-0100 to
#       555-0199 range, a number shaped like a Social Security number, or an image,
#       audio or video file inlined as a base64 data: URI (a voice recording is student
#       data; Scot, 2026-11-07) needs an approval. Reserved: example.com, example.net and example.org with their
#       subdomains, and the .test, .example, .invalid and .localhost top-level domains
#       (RFC 2606).
#     - Removed and unchanged lines are never scanned. For a merge commit only the lines
#       new to EVERY parent count, so a release merge does not scan develop's lines again.
#     The scan sees shapes, not meaning. These pass it: a name, a street address, a
#     birth date, a free-text note; a phone number in another format (international,
#     unseparated, space-separated, mixed separators, "(NNN)-NNN-NNNN", or glued to a
#     word); an SSN without dashes; a URL-encoded email; media inlined any way other
#     than a base64 data: URI; and a file name, since only content is scanned. A JSON or YAML
#     escape (\n, \t) before a value does not hide it. That is why test data must be
#     generated or obviously fake (CLAUDE.md). Blobs are read from git objects only: git cat-file, and git diff
#     between two blob ids, which reads no .gitattributes and runs no diff driver.
#     Nothing from the PR is checked out or run. Matched values are never printed, only
#     the path and the kind of value: the CI log is public.
#   - Any change to the check's own files (CONTROL_FILES), its workflow among them,
#     needs an approval, so the control gets a reviewer's look before it merges. Other
#     workflow files are not gated here (Scot, 2026-11-06): the required check is pinned
#     to the App, so a PR's own workflow token cannot post a status that satisfies it.
#     The exception (check_workflow; Scot, 2026-11-07): the App key sits in the
#     data-bearing-status environment, which a workflow running on develop can enter,
#     so a workflow merged to develop that names it could post this check's statuses on
#     any PR. A workflow file whose new content names that environment,
#     DATA_BEARING_APP_PRIVATE_KEY or DATA_BEARING_APP_CLIENT_ID (as a whole name, in any
#     letter case) needs an approval; the whole file counts, since an edit to any of its
#     jobs changes what runs with the key. Residual: the match is on text, so a name
#     built at run time (an expression that assembles it) is not seen.
#
#   The path patterns are not duplicated here. This script asks
#   scripts/codex-review-path-classifier.sh, which holds the list vendored from the
#   brain guard, lists renames as delete plus add, and fails closed. It is asked once
#   for the whole change set and, when that is data-bearing, once per changed path.
#
# USAGE
#   scripts/data-bearing-path-check.sh <base-sha> <head-sha>
#
# ENV
#   APPROVED          true when the head commit carries an approval for this PR and
#                     base, false when not (default: false; any other value is exit 3)
#   PR_BASE_REF       the PR's base branch (default: develop)
#   DEVELOP_SHA       develop's tip; required when PR_BASE_REF is not develop
#   CLASSIFIER        path to the classifier (tests override it)
#   Needs python3 on PATH for the content scan (a missing python3 is exit 3).
#
# EXIT CODES
#   0  nothing needs an approval (no data-bearing path changed, or the scan found
#      nothing and no control file changed), or an approval exempts it
#   1  something needs an approval and there is none
#   3  nothing could be decided (classifier or scanner failure, an unreadable blob, no
#      verdict, bad input); fail closed. An approval cannot clear exit 3. If a PR is
#      stuck there (a git-quoted path, a missing commit), rename the file or rebuild the
#      branch.
#
set -uo pipefail
# Byte semantics everywhere: a path or a file may hold any bytes (a Latin-1 name).
export LC_ALL=C

BASE_SHA="${1:?usage: $0 <base-sha> <head-sha>}"
HEAD_SHA="${2:?usage: $0 <base-sha> <head-sha>}"
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
# Matched in any letter case, against a path the classifier already called data-bearing.
ALWAYS_LABEL_RE='(^|/)db/language(/|$)|(^|/)(cassettes|vcr_cassettes|vcr)/'
BINARY_EXT_RE='\.(png|jpe?g|gif|bmp|webp|tiff?|ico|heic|heif|mp3|wav|ogg|oga|m4a|aac|flac|opus|mp4|m4v|mov|webm|avi|mkv|pdf|docx?|xlsx?|pptx?|odt|ods|zip|gz|tgz|7z|rar|sqlite3?|db|parquet)$'
ZERO_SHA_RE='^0+$'
# A workflow file whose new content names the App's environment, its key or its client id
# (each as a whole name, in any letter case) needs an approval (Scot, 2026-11-07).
WORKFLOW_RE='^\.github/workflows/'
APP_NAMES_RE='(^|[^A-Za-z0-9_-])(data-bearing-status|DATA_BEARING_APP_PRIVATE_KEY|DATA_BEARING_APP_CLIENT_ID)([^A-Za-z0-9_-]|$)'

# The content scan. Reads one file of added lines as bytes and prints one line per kind
# of value found that is not reserved for examples (email, phone, ssn), then "done". It
# never prints a matched value. Edges: a phone or SSN shape preceded by a letter, digit
# or "+", or by a digit and "." or "-", or followed by a digit or a "." or "-" and a
# digit, is part of something longer (SVG path data, a version, a UUID) and is skipped.
SCANNER_PY='
import re, sys
data = open(sys.argv[1], "rb").read()
# A JSON or YAML escape (\n, \t, ...) is a boundary, not a letter before the value.
data = re.sub(rb"\\[nrtfv]", b" ", data)
found = set()
# Bounded parts keep the scan linear on a long run with no "@".
for m in re.finditer(rb"[A-Za-z0-9._%+-]{1,64}@([A-Za-z0-9-]{1,63}(?:\.[A-Za-z0-9-]{1,63}){0,8}\.[A-Za-z]{2,63})", data):
    d = m.group(1).lower()
    tld = d.rsplit(b".", 1)[-1]
    if tld in (b"test", b"example", b"invalid", b"localhost"):
        continue
    if any(d == r or d.endswith(b"." + r) for r in (b"example.com", b"example.net", b"example.org")):
        continue
    found.add("email")
left = rb"(?<![0-9A-Za-z+])(?<![0-9][.-])"
right = rb"(?![0-9]|[.-][0-9])"
phone = left + rb"(?:\+?1[ .-]?)?(?:\([0-9]{3}\) ?([0-9]{3})-([0-9]{4})|[0-9]{3}-([0-9]{3})-([0-9]{4})|[0-9]{3}\.([0-9]{3})\.([0-9]{4}))" + right
for m in re.finditer(phone, data):
    g = m.groups()
    exchange, line = (g[0], g[1]) if g[0] else ((g[2], g[3]) if g[2] else (g[4], g[5]))
    if not (exchange == b"555" and 100 <= int(line) <= 199):
        found.add("phone")
if re.search(left + rb"[0-9]{3}-[0-9]{2}-[0-9]{4}" + right, data):
    found.add("ssn")
if re.search(rb"data:(?:image|audio|video)/[^;,\s\x22\x27]*(?:;[^;,\s\x22\x27]*)*;base64,", data, re.I):
    found.add("media")
for kind in sorted(found):
    print(kind)
print("done")
'

die3() { echo "data-bearing-path-check: ERROR: $*. Nothing was decided; failing closed." >&2; exit 3; }

case "$APPROVED" in
  true|false) ;;
  *) die3 "APPROVED is '$APPROVED', not true or false" ;;
esac

OUT="$(mktemp)" || die3 "mktemp failed"
LIST="$(mktemp)" || die3 "mktemp failed"
RAW="$(mktemp)" || die3 "mktemp failed"
ONE="$(mktemp)" || die3 "mktemp failed"
NEWF="$(mktemp)" || die3 "mktemp failed"
DIFF="$(mktemp)" || die3 "mktemp failed"
PART="$(mktemp)" || die3 "mktemp failed"
ADDED="$(mktemp)" || die3 "mktemp failed"
ACC="$(mktemp)" || die3 "mktemp failed"
trap 'rm -f "$OUT" "$LIST" "$RAW" "$ONE" "$NEWF" "$DIFF" "$PART" "$ADDED" "$ACC"' EXIT

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

# matches_ci <text> <ERE>: a bash regex match in any letter case.
matches_ci() {
  local rc=0
  shopt -s nocasematch
  [[ "$1" =~ $2 ]] || rc=1
  shopt -u nocasematch
  return "$rc"
}

# note <path> <reason>: record something that needs an approval. The "- " prefix keeps a
# PR-controlled path from starting a log line (where "::" would be a workflow command).
FINDINGS=""
note() { FINDINGS+="  - $1: $2"$'\n'; }

# is_data_path <path>: does the classifier call this one path data-bearing?
is_data_path() {
  local v
  printf '%s\n' "$1" > "$ONE" || die3 "could not write the path list"
  v="$(classify --paths-from "$ONE")" || exit 3
  [ "$v" = true ]
}

# has_nul <file>: does it hold a NUL byte (git's own sign of a binary file)?
has_nul() {
  local n
  n="$(tr -cd '\000' < "$1" | wc -c)" || die3 "could not read a blob"
  [ "$((n))" -gt 0 ]
}

# hunk_lines <diff-file> <out>: the added lines of a one-pair `git diff -U0`, without
# their leading "+". Everything before the first hunk header is the file header. A diff
# with no hunk (git judged one side binary) gives the whole new blob instead.
hunk_lines() {
  local rc=0
  awk 'h && /^\+/ { print substr($0, 2); next } /^@@/ { h = 1 } END { exit h ? 0 : 4 }' "$1" > "$2" || rc=$?
  case "$rc" in
    0) ;;
    4) cp -- "$NEWF" "$2" || die3 "could not copy a blob" ;;
    *) die3 "awk failed (exit $rc)" ;;
  esac
}

# added_lines <new-blob> <old-blob>...: write to $ADDED the lines of the new blob (already
# in $NEWF) that are new to every old blob: one old blob for a plain commit, one per
# parent for a merge. An all-zero old blob means the path did not exist on that side, so
# every line is new to it.
added_lines() {
  local new="$1" old first=true
  shift
  for old in "$@"; do
    if [[ "$old" =~ $ZERO_SHA_RE ]]; then
      cp -- "$NEWF" "$PART" || die3 "could not copy a blob"
    else
      $GITQ diff -U0 --no-color --no-ext-diff --no-textconv "$old" "$new" > "$DIFF" \
        || die3 "git diff $old $new failed"
      hunk_lines "$DIFF" "$PART"
    fi
    if [ "$#" -eq 1 ]; then
      cp -- "$PART" "$ADDED" || die3 "could not copy the added lines"
      return 0
    fi
    sort -u -o "$PART" "$PART" || die3 "sort failed"
    if [ "$first" = true ]; then
      cp -- "$PART" "$ADDED" || die3 "could not copy the added lines"
      first=false
    else
      comm -12 "$ADDED" "$PART" > "$ACC" || die3 "comm failed"
      cp -- "$ACC" "$ADDED" || die3 "could not copy the added lines"
    fi
  done
}

# scan_text <file> <path>: scan the added lines in <file> and note each kind of value
# found. A scanner failure, a missing "done", or an answer it should not give stops the
# check (exit 3).
scan_text() {
  local rc=0 out kind answered=false
  out="$(python3 -I -c "$SCANNER_PY" "$1")" || rc=$?
  [ "$rc" = 0 ] || die3 "the content scanner exited $rc on $2"
  while IFS= read -r kind; do
    case "$kind" in
      email) note "$2" "adds an email address on a domain not reserved for examples" ;;
      phone) note "$2" "adds a phone number outside the fictional 555-0100 to 555-0199 range" ;;
      ssn) note "$2" "adds a number shaped like a Social Security number" ;;
      media) note "$2" "adds a base64 data: URI holding an image, audio or video" ;;
      done) answered=true ;;
      *) die3 "the content scanner gave an unexpected answer on $2" ;;
    esac
  done <<<"$out"
  [ "$answered" = true ] || die3 "the content scanner gave no answer on $2"
}

# check_workflow <path> <new-blob>: note a workflow file whose new content names the App's
# environment, key or client id. The whole file counts, not only added lines: an edit to
# any job of such a workflow changes what runs with the key. A deleted file runs nothing.
check_workflow() {
  local rc=0
  if [[ "$2" =~ $ZERO_SHA_RE ]]; then return 0; fi
  $GITQ cat-file blob "$2" > "$NEWF" || die3 "could not read blob $2"
  grep -a -i -E -- "$APP_NAMES_RE" "$NEWF" > /dev/null || rc=$?
  case "$rc" in
    0) note "$1" "is a workflow that names the App's environment, key or client id" ;;
    1) ;;
    *) die3 "grep failed (exit $rc)" ;;
  esac
}

# scan_entry <path> <new-mode> <new-blob> <old-blob>...: judge one changed path.
scan_entry() {
  local path="$1" mode="$2" new="$3" o
  shift 3
  if [[ "$path" =~ $WORKFLOW_RE ]]; then check_workflow "$path" "$new"; fi
  is_data_path "$path" || return 0
  if matches_ci "$path" "$ALWAYS_LABEL_RE"; then
    note "$path" "is under db/language/ or a VCR cassette directory, which always needs an approval"
    return 0
  fi
  # Deleted, or identical to a side it came from: nothing new.
  if [[ "$new" =~ $ZERO_SHA_RE ]]; then return 0; fi
  for o in "$@"; do [ "$o" != "$new" ] || return 0; done
  case "$mode" in
    100644|100755|120000) ;;
    *) note "$path" "is not a regular file (mode $mode), so its content cannot be scanned"; return 0 ;;
  esac
  if matches_ci "$path" "$BINARY_EXT_RE"; then
    note "$path" "is a binary file type, so its content cannot be scanned"
    return 0
  fi
  $GITQ cat-file blob "$new" > "$NEWF" || die3 "could not read blob $new"
  if has_nul "$NEWF"; then
    note "$path" "is binary (it holds a NUL byte), so its content cannot be scanned"
    return 0
  fi
  added_lines "$new" "$@"
  scan_text "$ADDED" "$path"
}

# scan_raw <file>: judge every path in a `--raw -z --no-abbrev` listing. A plain record
# is ":<old-mode> <new-mode> <old-blob> <new-blob> <status>"; a merge's combined record
# has one colon, mode and blob per parent ("::<m1> <m2> <mR> <b1> <b2> <bR> <status>").
# Read on fd 9, so nothing run per path can read the listing from stdin.
scan_raw() {
  local meta path n
  local -a fields
  while IFS= read -r -d '' -u 9 meta; do
    IFS= read -r -d '' -u 9 path || die3 "a raw diff record has no path"
    [[ "$meta" =~ ^(:+)([^:].*)$ ]] || die3 "unexpected raw diff record"
    n="${#BASH_REMATCH[1]}"
    read -r -a fields <<<"${BASH_REMATCH[2]}"
    [ "${#fields[@]}" -eq $((2 * n + 3)) ] || die3 "unexpected raw diff record"
    case "$path" in *$'\n'*) die3 "a changed path holds a newline" ;; esac
    scan_entry "$path" "${fields[$n]}" "${fields[$((2 * n + 1))]}" "${fields[@]:$((n + 1)):$n}"
  done 9< "$1"
}

verdict=false
if [ "$PR_BASE_REF" = develop ]; then
  paths="$($GITQ diff --name-only --no-renames --no-relative "$BASE_SHA...$HEAD_SHA")" \
    || die3 "git diff $BASE_SHA...$HEAD_SHA failed"
  if nonblank "$paths"; then
    verdict="$(classify "$BASE_SHA" "$HEAD_SHA")" || exit 3
  fi
  # Read each path when a data-bearing path or a workflow file changed.
  if [ "$verdict" = true ] || has_line -E "$WORKFLOW_RE"; then
    $GITQ diff --raw -z --no-abbrev --no-color --no-renames --no-relative "$BASE_SHA...$HEAD_SHA" > "$RAW" \
      || die3 "git diff --raw $BASE_SHA...$HEAD_SHA failed"
    scan_raw "$RAW"
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
  if [ "$verdict" = true ] || has_line -E "$WORKFLOW_RE"; then
    for c in $commits; do
      $GITQ diff-tree -r -c --root --raw -z --no-abbrev --no-commit-id --no-renames "$c" > "$RAW" \
        || die3 "git diff-tree --raw $c failed"
      scan_raw "$RAW"
    done
  fi
fi

control_touched=false
for f in "${CONTROL_FILES[@]}"; do
  if has_line -xF "$f"; then control_touched=true; fi
done

if [ -z "$FINDINGS" ] && [ "$control_touched" = false ]; then
  if [ "$verdict" = true ]; then
    echo "data-bearing-path-check: data-bearing paths changed; the content scan found nothing that looks like real personal data."
  else
    echo "data-bearing-path-check: no data-bearing path changed."
  fi
  exit 0
fi

if [ -n "$FINDINGS" ]; then
  what="has data-bearing changes that need a reviewer's look:"$'\n'"$FINDINGS"
  [ "$control_touched" = false ] || what+="It also changes this check's own files."
else
  what="changes this check's own files."
fi

if [ "$APPROVED" = true ]; then
  echo "data-bearing-path-check: this PR $what"
  echo "data-bearing-path-check: exempted by a reviewer's approval recorded on this head commit (the reviewer confirmed the data is synthetic)."
  exit 0
fi

cat >&2 <<EOF
data-bearing-path-check: FAIL. This PR $what
This repo is public, so real user data must never be committed here. The matched values
are not printed, because this log is public: open each file above to see them.
Test data should be generated or obviously fake: example.com addresses, phone numbers
from 555-0100 to 555-0199, "Test Student".
If every flagged value is synthetic, a reviewer with write access confirms that and
adds the 'synthetic-data' label. That records an approval for the current head commit
only, so a later push needs the label added again. The label is removed once the
approval is recorded. The path patterns are in scripts/codex-review-path-classifier.sh;
the content scan is scan_text in scripts/data-bearing-path-check.sh.
EOF
exit 1
