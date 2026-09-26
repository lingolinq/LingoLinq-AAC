#!/usr/bin/env bash
#
# minimized-disclosure-guard-test.sh - proves scripts/minimized-disclosure-guard.rb FIRES.
#
# WHY THIS EXISTS
#   The guard is the only mechanical enforcement of the security disclosure policy's
#   minimization. The policy was applied by hand on 2026-09-17 and nothing checked it;
#   on 2026-09-22 a recovered handoff doc restated a minimized Critical finding's
#   mechanism plus its code path, was pushed to this PUBLIC repo, and stayed publicly
#   reachable through refs/pull/<n>/head even after the PR was closed and the branch
#   deleted. So the guard exists, and observing it pass on a clean tree proves the tree
#   is clean, not that the guard works.
#
#   Each branch of its contract is asserted below against a fixture that violates it
#   AND one that does not, including the two ways a guard like this goes wrong: too
#   loose (misses the pairing) and too strict (flags an id published by design, or a
#   row whose disclosure has been approved).
#
#   This harness NEVER touches audit-reports/ and never scans the real tree: it builds
#   a throwaway git repo in a temp dir, because the guard reads `git ls-files`.
#
# Usage: scripts/tests/minimized-disclosure-guard-test.sh
# Exit codes: 0 = every branch behaved; 1 = a rule failed to fire, or fired wrongly.

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
GUARD="$REPO_ROOT/scripts/minimized-disclosure-guard.rb"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

fails=0
pass() { printf '  ok   %s\n' "$1"; }
fail() { printf '  FAIL %s\n' "$1"; fails=$((fails + 1)); }

# register <status> <title> <notes>
register() {
  cat > "$TMP/repo/audit-reports/FINDINGS.json" <<JSON
{
  "meta": { "schemaVersion": "1.1" },
  "findings": [
    {
      "id": "LL-1111111111",
      "severity": "critical",
      "status": "$1",
      "title": "$2",
      "notes": "$3"
    }
  ]
}
JSON
}

# Fresh throwaway repo. The guard reads the index, so fixtures must be added.
reset_repo() {
  rm -rf "$TMP/repo"
  mkdir -p "$TMP/repo/audit-reports" "$TMP/repo/docs/task-management"
  git -C "$TMP/repo" init -q
  git -C "$TMP/repo" config user.email test@example.com
  git -C "$TMP/repo" config user.name test
}

# run [--base-ref REF ...] -> prints exit code
run_guard() {
  git -C "$TMP/repo" add -A >/dev/null 2>&1
  (cd "$TMP/repo" && ruby "$GUARD" --check "$@" >"$TMP/out" 2>&1)
  echo $?
}

# Commits whatever is staged and prints the resulting SHA, for --base-ref fixtures.
commit_base() {
  git -C "$TMP/repo" add -A >/dev/null 2>&1
  git -C "$TMP/repo" commit -q -m base >/dev/null 2>&1
  git -C "$TMP/repo" rev-parse HEAD
}

echo "minimized-disclosure-guard-test:"

# 1. The real failure shape: minimized open finding id beside a file:line citation.
reset_repo
register "open" "Example authorization weakness (details withheld until remediation is verified)" "Minimized 2026-09-17 under the security disclosure policy."
printf '| Critical | LL-1111111111 | overwrites the field unconditionally (widget.rb:42) |\n' \
  > "$TMP/repo/docs/task-management/handoff.md"
rc=$(run_guard)
if [ "$rc" -eq 1 ] && grep -q 'LL-1111111111' "$TMP/out"; then
  pass "fires on id beside a file:line citation"
else
  fail "did NOT fire on id beside a file:line citation (exit $rc)"
  cat "$TMP/out"
fi

# 2. Same, with a repo-relative source path instead of file:line.
reset_repo
register "open" "Weakness (details withheld until remediation is verified)" "Minimized 2026-09-17 under the security disclosure policy."
printf -- '- LL-1111111111 is in app/models/widget.rb\n' \
  > "$TMP/repo/docs/task-management/handoff.md"
rc=$(run_guard)
[ "$rc" -eq 1 ] && pass "fires on id beside a repo-relative code path" \
  || { fail "did NOT fire on id beside a repo-relative code path (exit $rc)"; cat "$TMP/out"; }

# 3. Citation on the NEXT line still counts (markdown bullets wrap).
reset_repo
register "open" "Weakness (details withheld until remediation is verified)" "Minimized 2026-09-17 under the security disclosure policy."
printf -- '- LL-1111111111 remains open\n  see app/models/widget.rb for the gap\n' \
  > "$TMP/repo/docs/task-management/handoff.md"
rc=$(run_guard)
[ "$rc" -eq 1 ] && pass "fires across the one-line window" \
  || { fail "did NOT fire across the one-line window (exit $rc)"; cat "$TMP/out"; }

# 4. NOT too strict: the id alone is published by design (the register itself shows it).
reset_repo
register "open" "Weakness (details withheld until remediation is verified)" "Minimized 2026-09-17 under the security disclosure policy."
printf -- '- LL-1111111111 is still open; details withheld, see the private evidence store.\n' \
  > "$TMP/repo/docs/task-management/handoff.md"
rc=$(run_guard)
[ "$rc" -eq 0 ] && pass "allows a bare id with no code path" \
  || { fail "flagged a bare id with no code path (exit $rc)"; cat "$TMP/out"; }

# 5. NOT too strict: an unminimized row may carry its path freely.
reset_repo
register "open" "Ordinary finding with a normal title" "Surfaced by the monthly audit run."
printf -- '- LL-1111111111 is in app/models/widget.rb\n' \
  > "$TMP/repo/docs/task-management/handoff.md"
rc=$(run_guard)
[ "$rc" -eq 0 ] && pass "ignores rows that are not minimized" \
  || { fail "flagged a row that is not minimized (exit $rc)"; cat "$TMP/out"; }

# 6. Policy boundary: verified-closed means remediation shipped and disclosure was
#    decided, so the row is no longer protected.
reset_repo
register "verified-closed" "Weakness (details withheld until remediation is verified)" "Minimized 2026-09-17 under the security disclosure policy."
printf -- '- LL-1111111111 was in app/models/widget.rb\n' \
  > "$TMP/repo/docs/task-management/handoff.md"
rc=$(run_guard)
[ "$rc" -eq 0 ] && pass "stops protecting a verified-closed row" \
  || { fail "still protected a verified-closed row (exit $rc)"; cat "$TMP/out"; }

# 7. The register and its mirrors are allowed to pair id and path.
reset_repo
register "open" "Weakness (details withheld until remediation is verified)" "Minimized 2026-09-17 under the security disclosure policy."
printf -- '| LL-1111111111 | app/models/widget.rb |\n' > "$TMP/repo/audit-reports/FINDINGS.md"
rc=$(run_guard)
[ "$rc" -eq 0 ] && pass "allows the pairing inside audit-reports/" \
  || { fail "flagged the pairing inside audit-reports/ (exit $rc)"; cat "$TMP/out"; }

# 8. Untracked files are out of scope: the guard gates what is committed.
reset_repo
register "open" "Weakness (details withheld until remediation is verified)" "Minimized 2026-09-17 under the security disclosure policy."
git -C "$TMP/repo" add -A >/dev/null 2>&1
printf -- '- LL-1111111111 is in app/models/widget.rb\n' \
  > "$TMP/repo/docs/task-management/untracked.md"
(cd "$TMP/repo" && ruby "$GUARD" --check >"$TMP/out" 2>&1)
rc=$?
[ "$rc" -eq 0 ] && pass "ignores untracked files" \
  || { fail "flagged an untracked file (exit $rc)"; cat "$TMP/out"; }

# 9. SELF-LICENSING. A change must not be able to un-protect a row and disclose in the
#    same commit. Without --base-ref that bypass was real: measured exit 1 -> exit 0.
#    With --base-ref the row stays protected because the BASE revision minimized it.
reset_repo
register "open" "Weakness (details withheld until remediation is verified)" "Minimized 2026-09-17 under the security disclosure policy."
BASE=$(commit_base)
python3 - "$TMP/repo/audit-reports/FINDINGS.json" <<'PY'
import json,sys
p=sys.argv[1]; d=json.load(open(p))
d['findings'][0]['status']='verified-closed'
json.dump(d,open(p,'w'))
PY
printf -- '- LL-1111111111 is in app/models/widget.rb\n' > "$TMP/repo/docs/task-management/handoff.md"
rc=$(run_guard --base-ref "$BASE")
[ "$rc" -eq 1 ] && pass "refuses to let a change un-protect its own disclosure" \
  || { fail "self-licensing bypass is open with --base-ref (exit $rc)"; cat "$TMP/out"; }

# 10. The same fixture WITHOUT --base-ref is the bypass, kept as a regression witness:
#     if this ever returns 1, the base-ref plumbing stopped being what closes case 9.
rc=$(run_guard)
[ "$rc" -eq 0 ] && pass "head-only read is the bypass that --base-ref closes" \
  || { fail "expected the head-only read to miss it (exit $rc)"; cat "$TMP/out"; }

# 11. A row legitimately closed BEFORE this change is no longer protected, even with
#     --base-ref. Otherwise approved disclosure could never be published.
reset_repo
register "verified-closed" "Weakness (details withheld until remediation is verified)" "Minimized 2026-09-17 under the security disclosure policy."
BASE=$(commit_base)
printf -- '- LL-1111111111 was in app/models/widget.rb\n' > "$TMP/repo/docs/task-management/handoff.md"
rc=$(run_guard --base-ref "$BASE")
[ "$rc" -eq 0 ] && pass "allows disclosure for a row already closed at the base" \
  || { fail "blocked a row already closed at the base (exit $rc)"; cat "$TMP/out"; }

# 12. Case variation. `ll-` lowercase is ordinary authoring, not an attack.
reset_repo
register "open" "Weakness (details withheld until remediation is verified)" "Minimized 2026-09-17 under the security disclosure policy."
printf -- '- ll-1111111111 is in app/models/widget.rb\n' > "$TMP/repo/docs/task-management/handoff.md"
rc=$(run_guard)
[ "$rc" -eq 1 ] && pass "matches the id case-insensitively" \
  || { fail "missed a lowercased id (exit $rc)"; cat "$TMP/out"; }

# 13. Three-line separation, the documented window. The one-line window missed this.
reset_repo
register "open" "Weakness (details withheld until remediation is verified)" "Minimized 2026-09-17 under the security disclosure policy."
printf -- '- LL-1111111111 remains open\n\nSome intervening prose.\nThe gap is in app/models/widget.rb\n' \
  > "$TMP/repo/docs/task-management/handoff.md"
rc=$(run_guard)
[ "$rc" -eq 1 ] && pass "fires across the documented three-line window" \
  || { fail "missed a three-line separation (exit $rc)"; cat "$TMP/out"; }

# 13b. REWRITTEN 2026-09-25, because the specification changed: WINDOW moved from 3 to 7.
#      This case previously ASSERTED that a four-line separation is not detected, which
#      certified a one-keystroke evasion as correct behaviour. The original criterion was
#      "widen while false positives stay at zero on the tree"; re-measured, zero holds at
#      4, 5, 6 and 7, and the nearest real pairing is 8 lines apart. So four lines is now
#      caught, and the far side is asserted at EIGHT, which is where widening would start
#      flagging attested docs/legal records that cannot be edited in place.
reset_repo
register "open" "Weakness (details withheld until remediation is verified)" "Minimized 2026-09-17 under the security disclosure policy."
printf -- '- LL-1111111111 remains open\n\nSome intervening prose.\n\nThe gap is in app/models/widget.rb\n' \
  > "$TMP/repo/docs/task-management/handoff.md"
rc=$(run_guard)
[ "$rc" -eq 1 ] && pass "four lines apart IS detected (window widened to 7)" \
  || { fail "four-line separation slipped through (exit $rc)"; cat "$TMP/out"; }

# 13c. The NEW far side. Eight lines apart is not detected, and that limit is deliberate:
#      widening further flags docs/legal records carrying an attestedContentHash, which
#      policy forbids editing in place, so a pairing there would be unfixable by design.
reset_repo
register "open" "Weakness (details withheld until remediation is verified)" "Minimized 2026-09-17 under the security disclosure policy."
printf -- '- LL-1111111111 remains open\n\n\n\n\n\n\n\nThe gap is in app/models/widget.rb\n' \
  > "$TMP/repo/docs/task-management/handoff.md"
rc=$(run_guard)
[ "$rc" -eq 0 ] && pass "documents its limit: eight lines apart is NOT detected" \
  || { fail "window is wider than documented (exit $rc)"; cat "$TMP/out"; }

# 13d. REGRESSION FIXTURE for the first-match bug. A line naming TWO protected ids was
#      evaluated against only ONE of them, chosen in register order, so the id-bound
#      signals of the other were never checked. That mattered because CODE_PATH excludes
#      .sh by design, leaving the id-bound signal as the only cover for the protected rows
#      whose evidence is scripts/gcp/*.sh. Register order here puts the DECOY first.
reset_repo
cat > "$TMP/repo/audit-reports/FINDINGS.json" <<'JSON'
{ "findings": [
  { "id": "LL-0000000000", "status": "open", "severity": "high",
    "title": "Decoy (details withheld until remediation is verified)",
    "notes": "Minimized 2026-09-17 under the security disclosure policy.",
    "evidence": { "file": "app/models/decoy.rb" } },
  { "id": "LL-1111111111", "status": "open", "severity": "high",
    "title": "Weakness (details withheld until remediation is verified)",
    "notes": "Minimized 2026-09-17 under the security disclosure policy.",
    "evidence": { "file": "scripts/gcp/phase1-setup.sh" } }
] }
JSON
printf -- '- LL-0000000000 and LL-1111111111 remain open\n  the grant is at scripts/gcp/phase1-setup.sh:251\n' \
  > "$TMP/repo/docs/task-management/handoff.md"
rc=$(run_guard)
[ "$rc" -eq 1 ] && pass "every protected id on a line is checked, not just the first" \
  || { fail "first-match shadowing is back (exit $rc)"; cat "$TMP/out"; }

# 13e. REGRESSION FIXTURE: an unparseable register must not read as "nothing to protect".
#      rows_from used to rescue JSON::ParserError to [], so a truncated register made the
#      protected set empty and every disclosure passed. Run WITHOUT --base-ref, which is
#      the guard's own documented Usage line and the shape the companion pre-push hook uses.
reset_repo
register "open" "Weakness (details withheld until remediation is verified)" "Minimized 2026-09-17 under the security disclosure policy."
printf -- '- LL-1111111111 is in app/models/widget.rb\n' > "$TMP/repo/docs/task-management/handoff.md"
printf '{ "findings": [ TRUNCATED' > "$TMP/repo/audit-reports/FINDINGS.json"
rc=$( cd "$TMP/repo" && ruby "$GUARD" --check >"$TMP/out" 2>&1; echo $? )
[ "$rc" -ne 0 ] && pass "an unreadable register aborts instead of passing" \
  || { fail "malformed register still reads as an empty protected set (exit $rc)"; cat "$TMP/out"; }

# 14. An extension outside any allowlist. Scanning every tracked text file is what
#     closes "rename it to .html".
reset_repo
register "open" "Weakness (details withheld until remediation is verified)" "Minimized 2026-09-17 under the security disclosure policy."
printf -- '<p>LL-1111111111 is in app/models/widget.rb</p>\n' > "$TMP/repo/docs/leak.html"
rc=$(run_guard)
[ "$rc" -eq 1 ] && pass "scans a file type no allowlist would name" \
  || { fail "missed a disclosure in an unlisted extension (exit $rc)"; cat "$TMP/out"; }

# 15. A tracked symlink to a character device must be skipped BEFORE being read.
#     Unbounded File.read here would hang the runner rather than fail it.
reset_repo
register "open" "Weakness (details withheld until remediation is verified)" "Minimized 2026-09-17 under the security disclosure policy."
ln -s /dev/zero "$TMP/repo/docs/task-management/evil.md"
rc=$(timeout 30 bash -c "$(declare -f run_guard); TMP='$TMP' GUARD='$GUARD' run_guard" 2>/dev/null)
if [ -z "$rc" ]; then
  fail "guard hung or timed out on a symlink to /dev/zero"
elif [ "$rc" -eq 0 ]; then
  pass "skips a tracked symlink instead of reading it"
else
  fail "unexpected exit on a tracked symlink (exit $rc)"; cat "$TMP/out"
fi

# 15b. An unusable --base-ref must FAIL, not quietly fall back to a head-only read.
#      A silent fallback would print OK while no longer checking what the flag is for.
reset_repo
register "open" "Weakness (details withheld until remediation is verified)" "Minimized 2026-09-17 under the security disclosure policy."
printf -- '- LL-1111111111 is still open; details withheld.\n' > "$TMP/repo/docs/task-management/handoff.md"
rc=$(run_guard --base-ref "")
[ "$rc" -eq 1 ] && pass "fails closed on an empty --base-ref" \
  || { fail "accepted an empty --base-ref (exit $rc)"; cat "$TMP/out"; }
rc=$(run_guard --base-ref deadbeefdeadbeefdeadbeefdeadbeefdeadbeef)
[ "$rc" -eq 1 ] && pass "fails closed on an unresolvable --base-ref" \
  || { fail "accepted an unresolvable --base-ref (exit $rc)"; cat "$TMP/out"; }

# 15c. THE TWO-COMMIT CHAIN. The base-ref union shields one commit; a first change that
#      just rewords a title out of the marker, disclosing nothing, would pass and leave
#      the row unprotected for the next change. Measured: both commits passed. So marker
#      removal while the status still withholds detail is itself blocked.
reset_repo
register "open" "Weakness (details withheld until remediation is verified)" "Minimized 2026-09-17 under the security disclosure policy."
BASE=$(commit_base)
register "open" "Weakness in the organization claim path" "Surfaced by the audit run."
printf -- '- nothing disclosed here.\n' > "$TMP/repo/docs/task-management/handoff.md"
rc=$(run_guard --base-ref "$BASE")
[ "$rc" -eq 1 ] && pass "blocks stripping the marker while the row stays open" \
  || { fail "let the marker be stripped silently (exit $rc)"; cat "$TMP/out"; }

# 15d. The GOVERNED path must still work: closing the finding is how detail gets
#      published, and only the status field licenses it. Must not be blocked.
reset_repo
register "open" "Weakness (details withheld until remediation is verified)" "Minimized 2026-09-17 under the security disclosure policy."
BASE=$(commit_base)
register "verified-closed" "Weakness in the organization claim path" "Remediated and verified; disclosure approved."
rc=$(run_guard --base-ref "$BASE")
[ "$rc" -eq 0 ] && pass "allows the governed close-then-disclose path" \
  || { fail "blocked a governed closure (exit $rc)"; cat "$TMP/out"; }

# 15e. Stripping the marker from the LAST protected row must still be caught. Without
#      ordering the demotion check ahead of the empty-set exit, this lands in the
#      "nothing to protect" branch and passes: the hole inside the fix for 15c.
reset_repo
register "open" "Weakness (details withheld until remediation is verified)" "Minimized 2026-09-17 under the security disclosure policy."
BASE=$(commit_base)
register "open" "Weakness with every trace of the marker gone" "Surfaced by the audit run."
rc=$(run_guard --base-ref "$BASE")
[ "$rc" -eq 1 ] && pass "catches stripping the marker from the last protected row" \
  || { fail "empty-set branch swallowed the last-row strip (exit $rc)"; cat "$TMP/out"; }

# 15f. An empty protected set with no base ref PASSES, reversing a stricter rule tried
#      first: it broke four legitimate fixtures and would wedge CI permanently once every
#      finding has been disclosed. Kept as a witness that the reversal is deliberate.
reset_repo
register "open" "Ordinary finding with no marker at all" "Surfaced by the audit run."
printf -- '- LL-1111111111 is in app/models/widget.rb\n' > "$TMP/repo/docs/task-management/handoff.md"
rc=$(run_guard)
[ "$rc" -eq 0 ] && pass "an unminimized register is not a failure on its own" \
  || { fail "failed on a register with nothing minimized (exit $rc)"; cat "$TMP/out"; }

# 15g. DELETING the row must not be the lenient path. Measured as a working bypass: the
#      deletion produced a green run with a note, and the next change published freely.
#      Deleting a row is more destructive than rewording its title, so it cannot be
#      treated as governed. Renumbering an id lands here too, as the old id going missing.
reset_repo
register "open" "Weakness (details withheld until remediation is verified)" "Minimized 2026-09-17 under the security disclosure policy."
BASE=$(commit_base)
cat > "$TMP/repo/audit-reports/FINDINGS.json" <<'JSON'
{ "meta": { "schemaVersion": "1.1" }, "findings": [] }
JSON
rc=$(run_guard --base-ref "$BASE")
[ "$rc" -eq 1 ] && pass "blocks deleting a protected row outright" \
  || { fail "row deletion passed as a governed change (exit $rc)"; cat "$TMP/out"; }

# 15h. ID-BOUND DETECTION. A row's own evidence path is caught even when the generic
#      regex cannot see it: one real protected row's evidence is a scripts/*.sh file, and
#      neither that directory nor that extension is in the regex, because measuring that
#      widening produced false positives on attested legal records.
reset_repo
cat > "$TMP/repo/audit-reports/FINDINGS.json" <<'JSON'
{
  "meta": { "schemaVersion": "1.1" },
  "findings": [
    {
      "id": "LL-1111111111",
      "severity": "high",
      "status": "open",
      "title": "Example weakness (details withheld until remediation is verified)",
      "notes": "Minimized 2026-09-17 under the security disclosure policy.",
      "evidence": { "type": "code", "file": "scripts/example/setup.sh", "line": 249 }
    }
  ]
}
JSON
printf -- '- LL-1111111111 is at scripts/example/setup.sh:249\n' > "$TMP/repo/docs/task-management/handoff.md"
rc=$(run_guard)
if [ "$rc" -eq 1 ] && grep -q 'its own evidence path' "$TMP/out"; then
  pass "catches a row's own evidence path the regex cannot match"
else
  fail "missed an id-bound evidence path (exit $rc)"; cat "$TMP/out"
fi

# 15i. The id-bound signal must not fire on an unrelated path near the id, which is the
#      false-positive shape that ruled out widening the regex.
reset_repo
cat > "$TMP/repo/audit-reports/FINDINGS.json" <<'JSON'
{
  "meta": { "schemaVersion": "1.1" },
  "findings": [
    {
      "id": "LL-1111111111",
      "severity": "high",
      "status": "open",
      "title": "Example weakness (details withheld until remediation is verified)",
      "notes": "Minimized 2026-09-17 under the security disclosure policy.",
      "evidence": { "type": "code", "file": "scripts/example/setup.sh", "line": 249 }
    }
  ]
}
JSON
printf -- '- LL-1111111111 is tracked; see docs/legal/2026-09-17_snapshot.md for the policy.\n' \
  > "$TMP/repo/docs/task-management/handoff.md"
rc=$(run_guard)
[ "$rc" -eq 0 ] && pass "ignores an unrelated document citation beside the id" \
  || { fail "flagged an unrelated citation (exit $rc)"; cat "$TMP/out"; }

# 15j. A STALE BRANCH must not look like a deletion. The base branch tip is not the fork
#      point, so rows added to the register after the fork are absent from this branch
#      without anything having been deleted. Measured on real open PR 909: comparing
#      against develop's tip reported two protected rows as deleted; against the merge
#      base it passes. The guard resolves the merge base itself.
reset_repo
register "open" "First weakness (details withheld until remediation is verified)" "Minimized 2026-09-17 under the security disclosure policy."
FORK=$(commit_base)
git -C "$TMP/repo" checkout -q -b feature
printf -- '- unrelated branch work.\n' > "$TMP/repo/docs/task-management/work.md"
git -C "$TMP/repo" add -A >/dev/null 2>&1
git -C "$TMP/repo" commit -q -m "branch work"
# Meanwhile the base branch gains a SECOND protected row the branch never saw.
git -C "$TMP/repo" checkout -q master 2>/dev/null || git -C "$TMP/repo" checkout -q main
cat > "$TMP/repo/audit-reports/FINDINGS.json" <<'JSON'
{
  "meta": { "schemaVersion": "1.1" },
  "findings": [
    { "id": "LL-1111111111", "severity": "critical", "status": "open",
      "title": "First weakness (details withheld until remediation is verified)",
      "notes": "Minimized 2026-09-17 under the security disclosure policy." },
    { "id": "LL-3333333333", "severity": "high", "status": "open",
      "title": "Later weakness (details withheld until remediation is verified)",
      "notes": "Minimized 2026-09-17 under the security disclosure policy." }
  ]
}
JSON
git -C "$TMP/repo" add -A >/dev/null 2>&1
git -C "$TMP/repo" commit -q -m "base gains a row"
BASE_TIP=$(git -C "$TMP/repo" rev-parse HEAD)
git -C "$TMP/repo" checkout -q feature
rc=$(run_guard --base-ref "$BASE_TIP")
if [ "$rc" -eq 0 ]; then
  pass "a stale branch is not mistaken for a deletion"
else
  fail "stale branch reported as a deletion (exit $rc)"; cat "$TMP/out"
fi

# 16. A binary file with an id-shaped byte sequence is not prose; skipping it is what
#     makes whole-tree scanning affordable.
reset_repo
register "open" "Weakness (details withheld until remediation is verified)" "Minimized 2026-09-17 under the security disclosure policy."
printf 'LL-1111111111 app/models/widget.rb\000\001\002binary' > "$TMP/repo/docs/blob.bin"
rc=$(run_guard)
[ "$rc" -eq 0 ] && pass "skips binary files" \
  || { fail "flagged a binary file (exit $rc)"; cat "$TMP/out"; }

echo ""
if [ "$fails" -eq 0 ]; then
  echo "minimized-disclosure-guard-test: all branches behaved."
  exit 0
fi
echo "minimized-disclosure-guard-test: $fails branch(es) misbehaved."
exit 1
