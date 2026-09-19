#!/usr/bin/env bash
#
# scot-owned-regression-test.sh - proves the SCOT_OWNED_CLOSED regression trigger in
# scripts/audit-merge.rb and scripts/promote-finding.rb actually FIRES for every status a
# finder or PR reviewer must never silently re-anchor over, and that the fix does not turn a
# legitimate same-day re-find into a false-positive abort.
#
# WHY THIS EXISTS
#   Both scripts gate the regression branch on TWO axes: `scot_owned_status` (the finding's
#   `status` is verified-closed / accepted-risk / superseded) OR `scot_owned_disp` (its
#   `disposition.state` is accepted / fixed / dismissed-false-positive / wontfix). A finding
#   at status `remediated-unverified` with disposition null or `untriaged` (neither axis
#   satisfied) was silently re-anchored on re-find instead of flagged: evidence moved to the
#   new run's value, the row stayed `remediated-unverified`, no regression note, no summary
#   entry (issue #1014). Of the register's ten `remediated-unverified` rows at the time this
#   was filed, three carried disposition `accepted`/`fixed` and were already caught by the
#   disposition axis; the other seven were exposed. Neither `register-lint.rb` nor
#   `register-consumer-smoke-test.sh` would have caught this: lint has no rule comparing
#   evidence across runs, and the smoke test's own contract (see its header) is an
#   EMPTY-input no-op check, which this scenario is not (a real re-find must mutate the row).
#
#   audit-merge.rb and promote-finding.rb carry byte-identical `SCOT_OWNED_CLOSED` /
#   `SCOT_OWNED_DISPOSITIONS` constants and branch logic by design (audit-merge.rb's own
#   header: "Mirrors scripts/promote-finding.rb; kept in lockstep by hand"), so both are
#   covered here rather than just the one issue #1014 named.
#
#   FIXING THE GAP EXPOSES A SECOND ONE, caught by adversary review before merge:
#   promote-finding.rb has a separate, end-of-run invariant that also reads
#   SCOT_OWNED_CLOSED, scoped by `finding.source.promotedDate == run_date` -- a proxy for
#   "this script just created this row this run" that also matches a row an EARLIER
#   invocation created today whose status was since changed out of band (by Scot, or by a
#   direct register edit -- exactly what this session did to LL-676f91f26b hours before
#   writing this test). Adding remediated-unverified to SCOT_OWNED_CLOSED without fixing that
#   scoping turns a legitimate same-day re-find into a fatal die() that discards the whole
#   promotion batch under a diagnostic the run did not earn. The fix scopes the invariant to
#   `created_ids`, the ids THIS invocation actually created; case 3 below proves it.
#
# FIXTURE DESIGN
#   audit-merge.rb: runtime-type evidence (no file), which needs no git call at all
#   (checkable = !file.empty? && ..., always false when file is empty) -- fully hermetic. The
#   register row's evidence.source and the re-finder's evidence.source/snippet are given
#   DIFFERENT values so a silent re-anchor is observable: a non-regressing reseen must show
#   the RE-FINDER's values; a regression must leave the ORIGINAL row's evidence untouched.
#   promote-finding.rb: requires real checkable file+snippet+sha evidence for EVERY incoming
#   finding, existing or new (no runtime path), and its reseen branch never touches evidence
#   by design (a PR-branch sha would go unreachable after merge/rebase) -- so there is nothing
#   to assert about re-anchoring there; the note and the regressions summary entry are the
#   observable signal instead. Uses this script's own repo at `git rev-parse HEAD` plus the
#   shebang line of a committed script, so the fixture needs no fixed historical sha.
#
#   Five register rows per script, id = LL- + sha256("<ruleKey>|<anchor>")[0,10] (anchor =
#   ruleKey for audit-merge's runtime rows, the fixture file for promote-finding's):
#     open/no-disposition            -> must NEVER regress (negative control)
#     verified-closed/no-disposition -> must regress before AND after (already covered)
#     remediated-unverified/null           -> THE GAP: red before the fix, green after
#     remediated-unverified/untriaged      -> THE GAP: red before the fix, green after
#     remediated-unverified/fixed          -> already covered via the disposition axis
#                                              (must regress before AND after; proves the
#                                              fix does not depend on this axis)
#   Each regressing case also asserts: the note contains "REGRESSION:", the finding's own id
#   appears in --summary's `regressions` array, and (audit-merge only) evidence is untouched.
#
#   Case 3 is a separate two-invocation sequence proving the invariant fix: promote a finding
#   today, flip its status to remediated-unverified out of band (simulating a direct register
#   edit or a Scot decision between review passes), re-find it via promote-finding.rb again
#   the same day. Must exit 0, not die().
#
#   AUDIT_MERGE / PROMOTE_FINDING env overrides point at alternate copies, matching the
#   REGISTER_LINT convention in scripts/tests/register-lint-shape-test.sh (used to prove this
#   harness goes red against the pre-fix scripts; not used by CI or the default local run).
#
# Usage: scripts/tests/scot-owned-regression-test.sh
# Exit:  0 = every case behaved; 1 = a case did not.

set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

AUDIT_MERGE="${AUDIT_MERGE:-$ROOT/scripts/audit-merge.rb}"
PROMOTE_FINDING="${PROMOTE_FINDING:-$ROOT/scripts/promote-finding.rb}"

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

fails=0
ok()  { printf '  ok   %s\n' "$1"; }
bad() { printf '  FAIL %s\n' "$1"; fails=$((fails + 1)); }

id_of() { ruby -rdigest -e 'print "LL-" + Digest::SHA256.hexdigest(ARGV[0])[0,10]' "$1|$2"; }

# field <out.json> <id> <ruby-expr-on-f>
field() {
  ruby -rjson -e '
    j = JSON.parse(File.read(ARGV[0]))
    f = j["findings"].find { |x| x["id"] == ARGV[1] }
    abort "missing" unless f
    puts(eval(ARGV[2]))
  ' "$1" "$2" "$3" 2>/dev/null
}

assert_regression() {  # assert_regression <label> <out.json> <id> <expected true|false>
  local label="$1" out="$2" id="$3" expected="$4"
  local got
  got="$(field "$out" "$id" 'f["regression"] ? "true" : "false"')"
  if [ "$got" = "$expected" ]; then
    ok "$label (regression=$got)"
  else
    bad "$label: expected regression=$expected, got ${got:-missing}"
  fi
}

assert_note_and_summary() {  # assert_note_and_summary <label> <out.json> <summary.json> <id>
  local label="$1" out="$2" summary="$3" id="$4"
  local note has_summary
  note="$(field "$out" "$id" 'f["notes"].to_s')"
  case "$note" in
    *REGRESSION:*) ;;
    *) bad "$label: notes missing 'REGRESSION:' (got: ${note:0:80})"; return ;;
  esac
  has_summary="$(ruby -rjson -e 'j=JSON.parse(File.read(ARGV[0])); print j["regressions"].any? { |r| r["id"] == ARGV[1] }' "$summary" "$id")"
  if [ "$has_summary" = "true" ]; then
    ok "$label (note + summary.regressions entry present)"
  else
    bad "$label: id not in --summary regressions array"
  fi
}

assert_evidence_unchanged() {  # audit-merge only: regression must not re-anchor evidence
  local label="$1" out="$2" id="$3"
  local src
  src="$(field "$out" "$id" 'f.dig("evidence","source")')"
  if [ "$src" = "original-evidence" ]; then
    ok "$label (evidence.source still 'original-evidence', not re-anchored)"
  else
    bad "$label: evidence.source is ${src:-missing}, expected untouched 'original-evidence'"
  fi
}

echo "-- audit-merge.rb: SCOT_OWNED_CLOSED / SCOT_OWNED_DISPOSITIONS regression trigger --"

RK_OPEN='fx-am-open'
RK_VC='fx-am-verified-closed'
RK_RU_NULL='fx-am-remediated-null-disp'
RK_RU_UNTRIAGED='fx-am-remediated-untriaged-disp'
RK_RU_FIXED='fx-am-remediated-fixed-disp'

ID_OPEN="$(id_of "$RK_OPEN" "$RK_OPEN")"
ID_VC="$(id_of "$RK_VC" "$RK_VC")"
ID_RU_NULL="$(id_of "$RK_RU_NULL" "$RK_RU_NULL")"
ID_RU_UNTRIAGED="$(id_of "$RK_RU_UNTRIAGED" "$RK_RU_UNTRIAGED")"
ID_RU_FIXED="$(id_of "$RK_RU_FIXED" "$RK_RU_FIXED")"

ruby -rjson -e '
  ev = {"type"=>"runtime","source"=>"original-evidence"}
  rows = [
    {"id"=>ARGV[0],"ruleKey"=>ARGV[10],"title"=>"fx open","severity"=>"low","status"=>"open",
     "evidence"=>ev,"firstSeen"=>"2026-01-01","lastSeen"=>"2026-01-01"},
    {"id"=>ARGV[1],"ruleKey"=>ARGV[11],"title"=>"fx verified-closed","severity"=>"low","status"=>"verified-closed",
     "evidence"=>ev,"firstSeen"=>"2026-01-01","lastSeen"=>"2026-01-01"},
    {"id"=>ARGV[2],"ruleKey"=>ARGV[12],"title"=>"fx remediated null disp","severity"=>"low","status"=>"remediated-unverified",
     "evidence"=>ev,"firstSeen"=>"2026-01-01","lastSeen"=>"2026-01-01"},
    {"id"=>ARGV[3],"ruleKey"=>ARGV[13],"title"=>"fx remediated untriaged disp","severity"=>"low","status"=>"remediated-unverified",
     "disposition"=>{"state"=>"untriaged"},
     "evidence"=>ev,"firstSeen"=>"2026-01-01","lastSeen"=>"2026-01-01"},
    {"id"=>ARGV[4],"ruleKey"=>ARGV[14],"title"=>"fx remediated fixed disp","severity"=>"low","status"=>"remediated-unverified",
     "disposition"=>{"state"=>"fixed"},
     "evidence"=>ev,"firstSeen"=>"2026-01-01","lastSeen"=>"2026-01-01"},
  ]
  File.write(ARGV[5], JSON.pretty_generate({"meta"=>{"schemaVersion"=>"1.1"},"findings"=>rows}))
' "$ID_OPEN" "$ID_VC" "$ID_RU_NULL" "$ID_RU_UNTRIAGED" "$ID_RU_FIXED" "$TMP/am-register.json" \
  "$RK_OPEN" "$RK_VC" "$RK_RU_NULL" "$RK_RU_UNTRIAGED" "$RK_RU_FIXED"

OUTFILE="$TMP/am-finder.json" ruby -rjson -e '
  keys = ARGV
  findings = keys.map { |k| {"ruleKey"=>k,"title"=>"refind","severity"=>"low",
    "evidence"=>{"type"=>"runtime","source"=>"refinder-evidence","snippet"=>"refound"}} }
  File.write(ENV["OUTFILE"], JSON.pretty_generate({"domain"=>"ci-smoke","findings"=>findings}))
' "$RK_OPEN" "$RK_VC" "$RK_RU_NULL" "$RK_RU_UNTRIAGED" "$RK_RU_FIXED"

if ! ruby "$AUDIT_MERGE" --register "$TMP/am-register.json" --sha "0000000000000000000000000000000000000000" \
    --no-restamp --in "$TMP/am-finder.json" --out "$TMP/am-out.json" --summary "$TMP/am-summary.json" > "$TMP/am-log.txt" 2>&1; then
  bad "audit-merge.rb exited non-zero on the fixture:"
  sed 's/^/      /' "$TMP/am-log.txt" >&2
else
  assert_regression "open, no disposition: never regresses"            "$TMP/am-out.json" "$ID_OPEN"          false
  assert_regression "verified-closed: regresses (status axis)"         "$TMP/am-out.json" "$ID_VC"             true
  assert_regression "remediated-unverified + null disposition"         "$TMP/am-out.json" "$ID_RU_NULL"        true
  assert_regression "remediated-unverified + untriaged disposition"    "$TMP/am-out.json" "$ID_RU_UNTRIAGED"   true
  assert_regression "remediated-unverified + fixed disposition (already covered)" "$TMP/am-out.json" "$ID_RU_FIXED" true

  assert_note_and_summary "verified-closed note+summary"      "$TMP/am-out.json" "$TMP/am-summary.json" "$ID_VC"
  assert_note_and_summary "remediated+null note+summary"      "$TMP/am-out.json" "$TMP/am-summary.json" "$ID_RU_NULL"
  assert_note_and_summary "remediated+untriaged note+summary" "$TMP/am-out.json" "$TMP/am-summary.json" "$ID_RU_UNTRIAGED"

  assert_evidence_unchanged "verified-closed evidence not re-anchored"      "$TMP/am-out.json" "$ID_VC"
  assert_evidence_unchanged "remediated+null evidence not re-anchored"      "$TMP/am-out.json" "$ID_RU_NULL"
  assert_evidence_unchanged "remediated+untriaged evidence not re-anchored" "$TMP/am-out.json" "$ID_RU_UNTRIAGED"

  got_open_source="$(field "$TMP/am-out.json" "$ID_OPEN" 'f.dig("evidence","source")')"
  if [ "$got_open_source" = "refinder-evidence" ]; then
    ok "open row DOES re-anchor on a normal reseen (fixture sanity: distinguishes re-anchor from no-op)"
  else
    bad "fixture sanity failed: expected the OPEN row's evidence to re-anchor to 'refinder-evidence', got ${got_open_source:-missing}"
  fi
fi

echo "-- promote-finding.rb: same trigger, PR-review path --"

FIXTURE_FILE='scripts/audit-merge.rb'
FIXTURE_SNIPPET='#!/usr/bin/env ruby'
FIXTURE_SHA="$(git rev-parse HEAD 2>/dev/null)"
if [ -z "$FIXTURE_SHA" ]; then
  bad "could not resolve git rev-parse HEAD; promote-finding.rb cases skipped (needs real git history)"
else

RK2_OPEN='fx-pf-open'
RK2_VC='fx-pf-verified-closed'
RK2_RU_NULL='fx-pf-remediated-null-disp'
RK2_RU_UNTRIAGED='fx-pf-remediated-untriaged-disp'
RK2_RU_FIXED='fx-pf-remediated-fixed-disp'

ID2_OPEN="$(id_of "$RK2_OPEN" "$FIXTURE_FILE")"
ID2_VC="$(id_of "$RK2_VC" "$FIXTURE_FILE")"
ID2_RU_NULL="$(id_of "$RK2_RU_NULL" "$FIXTURE_FILE")"
ID2_RU_UNTRIAGED="$(id_of "$RK2_RU_UNTRIAGED" "$FIXTURE_FILE")"
ID2_RU_FIXED="$(id_of "$RK2_RU_FIXED" "$FIXTURE_FILE")"

ruby -rjson -e '
  file, snippet, sha = ARGV[5], ARGV[6], ARGV[7]
  ev = {"type"=>"code","file"=>file,"line"=>1,"snippet"=>snippet,"sha"=>sha}
  rows = [
    {"id"=>ARGV[0],"ruleKey"=>ARGV[8],"title"=>"fx open","severity"=>"high","status"=>"open",
     "evidence"=>ev,"firstSeen"=>"2026-01-01","lastSeen"=>"2026-01-01"},
    {"id"=>ARGV[1],"ruleKey"=>ARGV[9],"title"=>"fx verified-closed","severity"=>"high","status"=>"verified-closed",
     "evidence"=>ev,"firstSeen"=>"2026-01-01","lastSeen"=>"2026-01-01"},
    {"id"=>ARGV[2],"ruleKey"=>ARGV[10],"title"=>"fx remediated null disp","severity"=>"high","status"=>"remediated-unverified",
     "evidence"=>ev,"firstSeen"=>"2026-01-01","lastSeen"=>"2026-01-01"},
    {"id"=>ARGV[3],"ruleKey"=>ARGV[11],"title"=>"fx remediated untriaged disp","severity"=>"high","status"=>"remediated-unverified",
     "disposition"=>{"state"=>"untriaged"},
     "evidence"=>ev,"firstSeen"=>"2026-01-01","lastSeen"=>"2026-01-01"},
    {"id"=>ARGV[4],"ruleKey"=>ARGV[12],"title"=>"fx remediated fixed disp","severity"=>"high","status"=>"remediated-unverified",
     "disposition"=>{"state"=>"fixed"},
     "evidence"=>ev,"firstSeen"=>"2026-01-01","lastSeen"=>"2026-01-01"},
  ]
  File.write(ARGV[13], JSON.pretty_generate({"meta"=>{"schemaVersion"=>"1.1"},"findings"=>rows}))
' "$ID2_OPEN" "$ID2_VC" "$ID2_RU_NULL" "$ID2_RU_UNTRIAGED" "$ID2_RU_FIXED" \
  "$FIXTURE_FILE" "$FIXTURE_SNIPPET" "$FIXTURE_SHA" \
  "$RK2_OPEN" "$RK2_VC" "$RK2_RU_NULL" "$RK2_RU_UNTRIAGED" "$RK2_RU_FIXED" \
  "$TMP/pf-register.json"

OUTFILE="$TMP/pf-finder.json" ruby -rjson -e '
  keys = ARGV[3..]
  file, snippet, sha = ARGV[0], ARGV[1], ARGV[2]
  findings = keys.map { |k| {"ruleKey"=>k,"title"=>"refind","severity"=>"high",
    "evidence"=>{"type"=>"code","file"=>file,"line"=>1,"snippet"=>snippet,"sha"=>sha}} }
  File.write(ENV["OUTFILE"], JSON.pretty_generate({"source"=>"manual","pr"=>nil,"reviewer"=>"ci-smoke","findings"=>findings}))
' "$FIXTURE_FILE" "$FIXTURE_SNIPPET" "$FIXTURE_SHA" \
  "$RK2_OPEN" "$RK2_VC" "$RK2_RU_NULL" "$RK2_RU_UNTRIAGED" "$RK2_RU_FIXED"

if ! ruby "$PROMOTE_FINDING" --register "$TMP/pf-register.json" \
    --in "$TMP/pf-finder.json" --out "$TMP/pf-out.json" --summary "$TMP/pf-summary.json" > "$TMP/pf-log.txt" 2>&1; then
  bad "promote-finding.rb exited non-zero on the fixture:"
  sed 's/^/      /' "$TMP/pf-log.txt" >&2
else
  assert_regression "open, no disposition: never regresses"            "$TMP/pf-out.json" "$ID2_OPEN"        false
  assert_regression "verified-closed: regresses (status axis)"         "$TMP/pf-out.json" "$ID2_VC"           true
  assert_regression "remediated-unverified + null disposition"         "$TMP/pf-out.json" "$ID2_RU_NULL"      true
  assert_regression "remediated-unverified + untriaged disposition"    "$TMP/pf-out.json" "$ID2_RU_UNTRIAGED" true
  assert_regression "remediated-unverified + fixed disposition (already covered)" "$TMP/pf-out.json" "$ID2_RU_FIXED" true

  assert_note_and_summary "verified-closed note+summary"      "$TMP/pf-out.json" "$TMP/pf-summary.json" "$ID2_VC"
  assert_note_and_summary "remediated+null note+summary"      "$TMP/pf-out.json" "$TMP/pf-summary.json" "$ID2_RU_NULL"
  assert_note_and_summary "remediated+untriaged note+summary" "$TMP/pf-out.json" "$TMP/pf-summary.json" "$ID2_RU_UNTRIAGED"
fi

echo "-- promote-finding.rb: same-day invariant must not false-positive-abort (issue #1014 fix review) --"

RK3='fx-pf-same-day-flip'
cat > "$TMP/pf-empty-register.json" <<'JSON'
{"meta":{"schemaVersion":"1.1"},"findings":[]}
JSON
ruby -rjson -e '
  File.write(ARGV[4], JSON.pretty_generate({"source"=>"manual","pr"=>456,"reviewer"=>"ci-smoke","findings"=>[
    {"ruleKey"=>ARGV[0],"title"=>"same-day flip repro","severity"=>"high",
     "evidence"=>{"type"=>"code","file"=>ARGV[1],"line"=>1,"snippet"=>ARGV[2],"sha"=>ARGV[3]}}
  ]}))
' "$RK3" "$FIXTURE_FILE" "$FIXTURE_SNIPPET" "$FIXTURE_SHA" "$TMP/pf-flip-in.json"

if ! ruby "$PROMOTE_FINDING" --register "$TMP/pf-empty-register.json" \
    --in "$TMP/pf-flip-in.json" --out "$TMP/pf-flip-r1.json" --date "$(date -u +%F)" > "$TMP/pf-flip-log1.txt" 2>&1; then
  bad "promote-finding.rb (step 1, create) exited non-zero:"
  sed 's/^/      /' "$TMP/pf-flip-log1.txt" >&2
else
  ID3="$(id_of "$RK3" "$FIXTURE_FILE")"
  # Simulate an out-of-band status change between review passes (exactly what a direct
  # register edit, or this session's own work, does routinely the same day).
  ruby -rjson -e '
    j = JSON.parse(File.read(ARGV[0]))
    f = j["findings"].find { |x| x["id"] == ARGV[1] }
    abort "fixture setup failed: row not found" unless f
    f["status"] = "remediated-unverified"
    File.write(ARGV[0], JSON.pretty_generate(j))
  ' "$TMP/pf-flip-r1.json" "$ID3"

  if ruby "$PROMOTE_FINDING" --register "$TMP/pf-flip-r1.json" \
      --in "$TMP/pf-flip-in.json" --out "$TMP/pf-flip-r2.json" --date "$(date -u +%F)" > "$TMP/pf-flip-log2.txt" 2>&1; then
    ok "same-day re-find after an out-of-band status flip does NOT abort the batch"
    assert_regression "same-day flip: re-find is flagged as a regression, not silently reseen" "$TMP/pf-flip-r2.json" "$ID3" true
  else
    bad "same-day re-find after an out-of-band status flip ABORTED the batch (false-positive invariant):"
    sed 's/^/      /' "$TMP/pf-flip-log2.txt" >&2
  fi
fi

fi  # FIXTURE_SHA guard

if [ "$fails" -eq 0 ]; then
  echo
  echo "scot-owned-regression-test: PASS (regression fires for every Scot-owned status, both consumers, no false-positive abort)"
else
  echo >&2
  echo "scot-owned-regression-test: FAIL ($fails case(s))" >&2
  exit 1
fi
