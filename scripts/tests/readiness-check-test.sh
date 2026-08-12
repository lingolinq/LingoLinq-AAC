#!/usr/bin/env bash
# readiness-check-test.sh - regression coverage for the strategy-layer validator/generator
# in scripts/readiness-check.rb.
#
# Why a shell harness rather than an rspec spec (same rationale as
# attestation-hash-guard-test.sh): the checks under test are properties of the real strategy
# JSONs plus the real findings register, and a synthetic fixture would rot. Each case copies
# the live audit-reports/strategy/ directory to a per-PID scratch directory, points the script
# at the copy via READINESS_STRATEGY_DIR, mutates one thing, and asserts the expected FAILURE
# text appears. The live strategy directory and FINDINGS.json are never written to.
#
# Usage: scripts/tests/readiness-check-test.sh
# Exit: 0 = every guard fired as expected; 1 = at least one guard is missing or misworded.

set -u
cd "$(git rev-parse --show-toplevel)" || exit 1

LIVE_DIR=audit-reports/strategy
WORK_DIR=audit-reports/strategy-test.$$
export READINESS_STRATEGY_DIR="$WORK_DIR"

LIVE_SNAPSHOT=$(mktemp -d)
cp -r "$LIVE_DIR/." "$LIVE_SNAPSHOT/"
FINDINGS_SNAPSHOT=$(mktemp)
cp audit-reports/FINDINGS.json "$FINDINGS_SNAPSHOT"

cleanup() { rm -rf "$WORK_DIR" "$LIVE_SNAPSHOT" "$FINDINGS_SNAPSHOT"; }
trap cleanup EXIT
trap 'cleanup; exit 130' INT
trap 'cleanup; exit 143' TERM

fails=0
pass() { echo "  ok   $1"; }
fail() { echo "  FAIL $1"; fails=$((fails + 1)); }

reset_work() {
  rm -rf "$WORK_DIR"
  cp -r "$LIVE_DIR" "$WORK_DIR"
}

# $1 = case name, $2 = target file basename (empty for no mutation),
# $3 = ruby mutation (local: doc = parsed JSON of the target), $4 = expected failure substring.
# An empty $4 asserts the opposite: the copy must validate cleanly under --check.
expect() {
  local name="$1" file="$2" mutation="$3" want="$4" out rc
  reset_work
  if [ -n "$file" ]; then
    ruby -rjson -e "doc=JSON.parse(File.read('$WORK_DIR/$file')); ${mutation}; File.write('$WORK_DIR/$file', JSON.pretty_generate(doc)+\"\n\")" || {
      fail "$name (mutation raised)"; return
    }
  fi
  # Re-render first so a failing case reports its validation failure, not render-drift noise.
  # (If validation fails, the render is not written and --check reports the same failure.)
  ruby scripts/readiness-check.rb >/dev/null 2>&1
  out=$(ruby scripts/readiness-check.rb --check 2>&1); rc=$?

  if [ -z "$want" ]; then
    [ $rc -eq 0 ] && pass "$name" || { fail "$name (expected clean, got failures)"; echo "$out" | grep -F -- '- [' | head -3; }
    return
  fi
  if [ $rc -eq 0 ]; then
    fail "$name (guard did not fire)"
  elif echo "$out" | grep -qF "$want"; then
    pass "$name"
  else
    fail "$name (fired with the wrong message)"
    echo "$out" | head -5
  fi
}

echo "readiness-check-test: the strategy layer as committed"
expect "live strategy passes unmutated" "" "" ""

echo "readiness-check-test: stored-status governance"
expect "derived-only status cannot be stored" "READINESS-MILESTONES.json" \
  "doc['requirements'].find{|r| r['id']=='adult-beta-release-safety'}['humanStatus']='done'" \
  "is derived-only and must never be stored"

expect "off-enum humanStatus rejected" "READINESS-MILESTONES.json" \
  "doc['requirements'].find{|r| r['id']=='adult-beta-release-safety'}['humanStatus']='nearly-there'" \
  "not in in-progress/blocked/accepted-for-milestone/not-required/future/claimed-done"

expect "invariant cannot store a completion status" "READINESS-MILESTONES.json" \
  "doc['requirements'].find{|r| r['id']=='adult-beta-no-critical'}['humanStatus']='claimed-done'" \
  "invariant must not store humanStatus"

expect "requirement count assertion" "READINESS-MILESTONES.json" \
  "doc['meta']['directRequirementCount']=41" \
  "meta.directRequirementCount=41 but 40 requirements are encoded"

echo "readiness-check-test: reference integrity"
expect "dangling finding ref fails" "READINESS-MILESTONES.json" \
  "doc['requirements'].find{|r| r['id']=='adult-beta-ai-cache'}['findingIds']=['LL-doesnotexist']" \
  "dangling finding ref: LL-doesnotexist"

expect "condition referencing unknown decision fails" "READINESS-MILESTONES.json" \
  "doc['requirements'].find{|r| r['id']=='adult-beta-ai-cache'}['appliesWhen']['condition']='flyingCarsEnabled'" \
  "unknown launch-profile key: flyingCarsEnabled"

expect "retired flat decisions form fails" "READINESS-MILESTONES.json" \
  "doc['requirements'].find{|r| r['id']=='adult-beta-ai-cache'}['appliesWhen']['decisions']=['aiWordPredictionEnabled']" \
  "retired flat any-of form"

expect "malformed condition node fails" "READINESS-MILESTONES.json" \
  "doc['requirements'].find{|r| r['id']=='adult-beta-ai-cache'}['appliesWhen']['condition']={'allOf'=>['minorsIncluded'],'anyOf'=>['euUsersIncluded']}" \
  "must have exactly one key"

expect "superseded-evidence without correctedBy fails" "WORK-LEDGER.json" \
  "doc['work'].find{|w| w['id']=='WORK-2026-07-30-PR697'}.delete('correctedBy')" \
  "requires correctedBy referencing the corrective work record"

expect "dangling correctedBy fails" "WORK-LEDGER.json" \
  "doc['work'].find{|w| w['id']=='WORK-2026-07-30-PR697'}['correctedBy']='WORK-9999-01-01-PR0'" \
  "does not resolve to a work record"

expect "missing schemaVersion fails" "WORK-LEDGER.json" \
  "doc['meta'].delete('schemaVersion')" \
  "meta.schemaVersion missing"

echo "readiness-check-test: human vs AI provenance (extensible identities)"
expect "AI tool as accountableOwner fails" "WORK-LEDGER.json" \
  "doc['work'][0]['accountableOwner']='Claude Code'" \
  "is an AI tool; accountable owners must be human"

expect "unknown identity as accountableOwner fails" "WORK-LEDGER.json" \
  "doc['work'][0]['accountableOwner']='drive-by-contributor'" \
  "is not a declared identity"

expect "newly added kind=human identity passes" "WORK-LEDGER.json" \
  "doc['meta']['identities'] << {'id'=>'NewTeammate','kind'=>'human','display'=>'New Teammate'}; doc['work'][0]['accountableOwner']='NewTeammate'" \
  ""

expect "human listed as implementationTool fails" "WORK-LEDGER.json" \
  "doc['work'][0]['people']={'implementationTools'=>['swahlquist']}" \
  "must resolve to a kind=ai-tool identity"

echo "readiness-check-test: append-only snapshots"
expect "falsified snapshot flow fails" "SNAPSHOTS.json" \
  "doc['snapshots'][0]['findingFlowSincePrior']['movedOutOfOpen']=['LL-16ef84ad9a']" \
  "disagrees with flow recomputed from adjacent openFindingIds sets"

# Mutating a prior snapshot is only detectable against an ADJACENT snapshot's stored flow,
# so build a two-snapshot chain first, then rewrite history in snapshot #0.
reset_work
ruby scripts/readiness-check.rb --snapshot >/dev/null 2>&1
ruby -rjson -e "
  doc=JSON.parse(File.read('$WORK_DIR/SNAPSHOTS.json'))
  doc['snapshots'][0]['openFindingIds']=doc['snapshots'][0]['openFindingIds'][0..-2]
  doc['snapshots'][0]['findings']['open']=doc['snapshots'][0]['openFindingIds'].size
  File.write('$WORK_DIR/SNAPSHOTS.json', JSON.pretty_generate(doc)+\"\n\")
"
ruby scripts/readiness-check.rb >/dev/null 2>&1
if ruby scripts/readiness-check.rb --check 2>&1 | grep -qF "disagrees with flow recomputed"; then
  pass "mutated prior snapshot open set fails (with an adjacent snapshot to cross-check)"
else
  fail "prior-snapshot mutation not detected against the adjacent stored flow"
fi

expect "duplicate snapshot identity fails" "SNAPSHOTS.json" \
  "doc['snapshots'] << doc['snapshots'][0].dup" \
  "duplicate snapshot identity"

expect "snapshot timestamp regression fails" "SNAPSHOTS.json" \
  "s=JSON.parse(JSON.generate(doc['snapshots'][0])); s['generatedAt']='2020-01-01T00:00:00Z'; doc['snapshots'] << s" \
  "does not advance past prior snapshot"

expect "openFindingIds referencing unknown finding fails" "SNAPSHOTS.json" \
  "doc['snapshots'][0]['openFindingIds'][0]='LL-doesnotexist'" \
  "references unknown finding: LL-doesnotexist"

echo "readiness-check-test: allOf/anyOf applicability (Kleene tri-state)"
# allOf false-dominates: with minorsIncluded=false, seat-reclaim (allOf schoolManagedAccounts +
# minorsIncluded) resolves not-required even though schoolManagedAccounts stays undecided,
# so it must vanish from the dashboard entirely (no blocker row, no pending-decision listing).
reset_work
ruby -rjson -e "
  doc=JSON.parse(File.read('$WORK_DIR/LAUNCH-PROFILE.json'))
  doc['decisions']['minorsIncluded']=false
  File.write('$WORK_DIR/LAUNCH-PROFILE.json', JSON.pretty_generate(doc)+\"\n\")
"
ruby scripts/readiness-check.rb >/dev/null 2>&1
if ruby scripts/readiness-check.rb --check >/dev/null 2>&1 \
   && ! grep -qF 'school-beta-seat-reclaim' "$WORK_DIR/READINESS-DASHBOARD.md"; then
  pass "allOf with a false operand resolves not-required (false dominates undecided)"
else
  fail "allOf false-domination broken: seat-reclaim still rendered with minorsIncluded=false"
fi

# anyOf true-dominates: with only aiFocusWordsEnabled=true, adult-beta-ai-master-consent
# (anyOf of the three AI decisions) resolves APPLICABLE despite two undecided operands,
# and its claimed-done derives done-awaiting-verification.
reset_work
ruby -rjson -e "
  doc=JSON.parse(File.read('$WORK_DIR/LAUNCH-PROFILE.json'))
  doc['decisions']['aiFocusWordsEnabled']=true
  File.write('$WORK_DIR/LAUNCH-PROFILE.json', JSON.pretty_generate(doc)+\"\n\")
"
ruby scripts/readiness-check.rb >/dev/null 2>&1
# Resolution is visible two ways: ai-focus-consent (leaf true) renders its claimed-done
# substate in top blockers, and ai-master-consent (anyOf with two operands still undecided)
# disappears from the pending-decisions table because its condition is already resolved.
if ruby scripts/readiness-check.rb --check >/dev/null 2>&1 \
   && grep -qF '`adult-beta-ai-focus-consent` (Done, awaiting verification)' "$WORK_DIR/READINESS-DASHBOARD.md" \
   && ! grep -qF 'adult-beta-ai-master-consent' "$WORK_DIR/READINESS-DASHBOARD.md"; then
  pass "anyOf with a true operand resolves applicable (true dominates undecided)"
else
  fail "anyOf true-domination broken: focus-words=true did not resolve the anyOf conditions"
fi

echo "readiness-check-test: reconciliation is a warning, not a failure"
reset_work
# org-ai-control's condition is allOf(schoolManagedAccounts, anyOf(AI features)), so both
# operands must be true for the requirement to be applicable at all.
ruby -rjson -e "
  doc=JSON.parse(File.read('$WORK_DIR/LAUNCH-PROFILE.json'))
  doc['decisions']['schoolManagedAccounts']=true
  doc['decisions']['aiWordPredictionEnabled']=true
  File.write('$WORK_DIR/LAUNCH-PROFILE.json', JSON.pretty_generate(doc)+\"\n\")
  doc=JSON.parse(File.read('$WORK_DIR/READINESS-MILESTONES.json'))
  doc['requirements'].find{|r| r['id']=='school-beta-org-ai-control'}['findingIds']=['LL-16ef84ad9a']
  File.write('$WORK_DIR/READINESS-MILESTONES.json', JSON.pretty_generate(doc)+\"\n\")
"
ruby scripts/readiness-check.rb >/dev/null 2>&1
recon_out=$(ruby scripts/readiness-check.rb --check 2>&1); recon_rc=$?
if [ $recon_rc -eq 0 ] && echo "$recon_out" | grep -qF "rendered done-awaiting-reconciliation, not done"; then
  if grep -qF "Done, awaiting reconciliation" "$WORK_DIR/READINESS-DASHBOARD.md"; then
    pass "claimed-done + open finding warns and renders done-awaiting-reconciliation (exit 0)"
  else
    fail "reconciliation state missing from the render"
  fi
else
  fail "claimed-done + open finding should warn and exit 0 (rc=$recon_rc)"
  echo "$recon_out" | head -5
fi

echo "readiness-check-test: check mode behavior"
reset_work
ruby scripts/readiness-check.rb >/dev/null 2>&1
printf '\nhand edit\n' >> "$WORK_DIR/READINESS-DASHBOARD.md"
if ruby scripts/readiness-check.rb --check 2>&1 | grep -qF "out of sync with the strategy JSONs"; then
  pass "hand-edited render fails --check as drift"
else
  fail "render drift not detected by --check"
fi

reset_work
ruby scripts/readiness-check.rb >/dev/null 2>&1
before=$(mktemp -d); cp -r "$WORK_DIR/." "$before/"
ruby scripts/readiness-check.rb --check >/dev/null 2>&1
if diff -r "$before" "$WORK_DIR" >/dev/null 2>&1; then
  pass "--check writes nothing"
else
  fail "--check modified files"
fi
rm -rf "$before"

echo "readiness-check-test: snapshot mode behavior"
reset_work
ruby -rjson -e "
  doc=JSON.parse(File.read('$WORK_DIR/SNAPSHOTS.json'))
  \$stdout.write(JSON.generate(doc['snapshots'][0]))
" > /tmp/readiness-test-prior.$$ 2>/dev/null
snap_count_before=$(ruby -rjson -e "puts JSON.parse(File.read('$WORK_DIR/SNAPSHOTS.json'))['snapshots'].size")
if ruby scripts/readiness-check.rb --snapshot >/dev/null 2>&1; then
  snap_count_after=$(ruby -rjson -e "puts JSON.parse(File.read('$WORK_DIR/SNAPSHOTS.json'))['snapshots'].size")
  prior_after=$(ruby -rjson -e "\$stdout.write(JSON.generate(JSON.parse(File.read('$WORK_DIR/SNAPSHOTS.json'))['snapshots'][0]))")
  if [ "$snap_count_after" -eq $((snap_count_before + 1)) ] && [ "$prior_after" = "$(cat /tmp/readiness-test-prior.$$)" ]; then
    pass "--snapshot appends exactly one record and leaves prior snapshots byte-identical"
  else
    fail "--snapshot mutated prior snapshots or appended wrong count (before=$snap_count_before after=$snap_count_after)"
  fi
  # A second same-day snapshot must be ACCEPTED (multiple snapshots/day by design; only an
  # exact generatedAt identity collision is refused, which a sequential run cannot hit).
  sleep 1
  if ruby scripts/readiness-check.rb --snapshot >/dev/null 2>&1 \
     && ruby scripts/readiness-check.rb --check >/dev/null 2>&1; then
    pass "second same-day snapshot accepted and validates"
  else
    fail "second same-day snapshot rejected or left the layer invalid"
  fi
else
  fail "--snapshot failed on a clean copy"
fi
rm -f /tmp/readiness-test-prior.$$

echo "readiness-check-test: determinism"
reset_work
ruby scripts/readiness-check.rb >/dev/null 2>&1
first=$(mktemp); cp "$WORK_DIR/READINESS-DASHBOARD.md" "$first"
ruby scripts/readiness-check.rb --render >/dev/null 2>&1
if cmp -s "$first" "$WORK_DIR/READINESS-DASHBOARD.md"; then
  pass "two consecutive renders are byte-identical"
else
  fail "render is not deterministic"
fi
rm -f "$first"

echo "readiness-check-test: live inputs untouched"
if diff -r "$LIVE_SNAPSHOT" "$LIVE_DIR" >/dev/null 2>&1; then
  pass "live strategy directory untouched"
else
  fail "live strategy directory was modified by the test run"
fi
if cmp -s "$FINDINGS_SNAPSHOT" audit-reports/FINDINGS.json; then
  pass "FINDINGS.json untouched (strategy layer is read-only against the register)"
else
  fail "FINDINGS.json was modified by the test run"
fi

echo
if [ "$fails" -eq 0 ]; then
  echo "readiness-check-test: OK (all guards fired)"
  exit 0
fi
echo "readiness-check-test: $fails guard(s) missing or misworded"
exit 1
