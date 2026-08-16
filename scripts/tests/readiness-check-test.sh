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
# verify_base_append_only! requires a resolvable base in --check mode. Tests
# below that are NOT specifically exercising base-compare set this to a path
# that never exists, which resolves to the legitimate no-base case (nothing to
# compare yet - this layer's own reality on origin/staging today). The
# base-compare tests override this per-invocation to exercise the real paths.
export READINESS_BASE_SNAPSHOTS_FILE="$PWD/audit-reports/strategy-test-no-base-sentinel.$$.json"

LIVE_SNAPSHOT=$(mktemp -d)
cp -r "$LIVE_DIR/." "$LIVE_SNAPSHOT/"
FINDINGS_SNAPSHOT=$(mktemp)
cp audit-reports/FINDINGS.json "$FINDINGS_SNAPSHOT"
PRIOR_SCRATCH=$(mktemp)
FINDINGS_SCRATCH=$(mktemp)
BASE_SCRATCH=$(mktemp)
BASE_SCRATCH2=$(mktemp)
REWRITE_SCRIPT=$(mktemp)

cleanup() { rm -rf "$WORK_DIR" "$LIVE_SNAPSHOT" "$FINDINGS_SNAPSHOT" "$PRIOR_SCRATCH" "$FINDINGS_SCRATCH" "$BASE_SCRATCH" "$BASE_SCRATCH2" "$REWRITE_SCRIPT"; }
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

expect "row ratification with a non-ratified status fails" "READINESS-MILESTONES.json" \
  "doc['requirements'].find{|r| r['id']=='adult-beta-ai-cache'}['ratification']['status']='approved-ish'" \
  "ratification.status must be \"ratified\" when the object is present"

expect "row ratification without ratifiedBy fails" "READINESS-MILESTONES.json" \
  "doc['requirements'].find{|r| r['id']=='adult-beta-ai-cache'}['ratification'].delete('ratifiedBy')" \
  "ratification requires ratifiedBy"

# The load-bearing governance case: a one-line meta edit must not be able to
# suppress the PROPOSED banner while rows remain unratified.
expect "matrix flipped to ratified with unratified rows fails" "READINESS-MILESTONES.json" \
  "doc['meta']['ratification']['status']='ratified'; doc['meta']['ratification']['ratifiedBy']='anyone'; doc['meta']['ratification']['ratifiedDate']='2026-08-12'; doc['requirements'].first.delete('ratification')" \
  "status is ratified but 1 row(s) carry no ratification"

expect "matrix ratification with unknown status fails" "READINESS-MILESTONES.json" \
  "doc['meta']['ratification']['status']='mostly-ratified'" \
  "must be proposed or ratified"

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

expect "severity-map tampering fails" "SNAPSHOTS.json" \
  "k=doc['snapshots'][0]['openFindingSeverities'].keys.first; doc['snapshots'][0]['openFindingSeverities'][k]=(doc['snapshots'][0]['openFindingSeverities'][k]=='low' ? 'high' : 'low')" \
  "disagrees with openFindingSeverities"

# Colluding history rewrite: build a 2-snapshot chain, then rewrite snapshot #0
# (the naive flow check alone cannot see this - #0's own flow is trivially
# empty - but #1's priorSnapshotSha pins #0's exact bytes).
reset_work
ruby scripts/readiness-check.rb --snapshot >/dev/null 2>&1
ruby -rjson -e "
  doc=JSON.parse(File.read('$WORK_DIR/SNAPSHOTS.json'))
  dropped=doc['snapshots'][0]['openFindingIds'].pop
  doc['snapshots'][0]['openFindingSeverities'].delete(dropped)
  doc['snapshots'][0]['findings']['open']=doc['snapshots'][0]['openFindingIds'].size
  File.write('$WORK_DIR/SNAPSHOTS.json', JSON.pretty_generate(doc)+\"\n\")
"
ruby scripts/readiness-check.rb >/dev/null 2>&1
if ruby scripts/readiness-check.rb --check 2>&1 | grep -qF "priorSnapshotSha does not match"; then
  pass "rewriting the first snapshot breaks the successor's hash chain"
else
  fail "hash chain did not catch a rewrite of the first snapshot"
fi

echo "readiness-check-test: append-only ENFORCEMENT (base-branch comparison, not the hash chain)"
# The load-bearing case Codex asked for: a coordinated rewrite that regenerates
# EVERY subsequent record's chain sha and flow in lockstep is internally
# self-consistent (the hash chain alone cannot see it - proven first below),
# so append-only must be enforced by comparing against what the base branch
# actually committed, not by re-deriving internal consistency.
reset_work
ruby scripts/readiness-check.rb --snapshot >/dev/null 2>&1   # now 2 snapshots: seed + new
cp "$WORK_DIR/SNAPSHOTS.json" "$BASE_SCRATCH"                # the valid, un-rewritten "base" version

cat > "$REWRITE_SCRIPT" <<'RUBY'
require 'json'
require 'digest'
require 'set'

def recompute_flow(prior_snaps, snap)
  cur = (snap['openFindingIds'] || []).to_set
  prior = prior_snaps.last
  return { 'new' => [], 'movedOutOfOpen' => [], 'reopened' => [], 'severityChanged' => [] } if prior.nil?
  prior_open = (prior['openFindingIds'] || []).to_set
  ever_open = prior_snaps.flat_map { |s| s['openFindingIds'] || [] }.to_set
  newly_open = cur - prior_open
  reopened = newly_open.select { |id| ever_open.include?(id) }.sort
  new_ids = (newly_open - reopened).sort
  moved = (prior_open - cur).sort
  cur_sev = snap['openFindingSeverities'] || {}
  prior_sev = prior['openFindingSeverities'] || {}
  sev_changed = (cur & prior_open).select { |id| cur_sev[id] != prior_sev[id] }.sort
  { 'new' => new_ids, 'movedOutOfOpen' => moved, 'reopened' => reopened, 'severityChanged' => sev_changed }
end

path = ARGV[0]
doc = JSON.parse(File.read(path))
snaps = doc['snapshots']

# Rewrite snapshot #0: drop one open finding id and fix ITS OWN internal
# fields, exactly as an attacker covering their tracks would.
dropped = snaps[0]['openFindingIds'].pop
snaps[0]['openFindingSeverities'].delete(dropped)
snaps[0]['findings']['open'] = snaps[0]['openFindingIds'].size
snaps[0]['findings']['openBySeverity'].each_key do |sev|
  snaps[0]['findings']['openBySeverity'][sev] = snaps[0]['openFindingSeverities'].values.count(sev)
end

# Cascade the cover-up into every subsequent record: recompute its chain sha
# and its flow against the (now mutated) history, so the WHOLE file stays
# internally self-consistent - no naive per-record check can see this.
(1...snaps.size).each do |i|
  snaps[i]['priorSnapshotSha'] = Digest::SHA256.hexdigest(JSON.generate(snaps[i - 1]))
  snaps[i]['findingFlowSincePrior'] = recompute_flow(snaps[0...i], snaps[i])
end

File.write(path, JSON.pretty_generate(doc) + "\n")
RUBY
ruby "$REWRITE_SCRIPT" "$WORK_DIR/SNAPSHOTS.json"

ruby scripts/readiness-check.rb >/dev/null 2>&1
if ruby scripts/readiness-check.rb --check >/dev/null 2>&1; then
  pass "fully-cascaded history rewrite is internally self-consistent (hash chain alone cannot detect it - this is the property base-comparison exists for)"
else
  fail "the fabricated rewrite was not internally self-consistent; test fixture is wrong, re-check REWRITE_SCRIPT against recompute_flow"
fi

base_check_out=$(READINESS_BASE_SNAPSHOTS_FILE="$BASE_SCRATCH" ruby scripts/readiness-check.rb --check 2>&1)
if echo "$base_check_out" | grep -qF "does not match this branch's record at the same position"; then
  pass "base-branch comparison catches the fully-cascaded rewrite that the hash chain missed"
else
  fail "base-branch comparison did NOT catch the fully-cascaded history rewrite"
  echo "$base_check_out" | head -5
fi

# A base with MORE snapshots than current (a deletion) must also fail.
reset_work
ruby scripts/readiness-check.rb --snapshot >/dev/null 2>&1
cp "$WORK_DIR/SNAPSHOTS.json" "$BASE_SCRATCH2"
ruby -rjson -e "
  doc=JSON.parse(File.read('$WORK_DIR/SNAPSHOTS.json'))
  doc['snapshots'].pop
  File.write('$WORK_DIR/SNAPSHOTS.json', JSON.pretty_generate(doc)+\"\n\")
"
ruby scripts/readiness-check.rb >/dev/null 2>&1
if READINESS_BASE_SNAPSHOTS_FILE="$BASE_SCRATCH2" ruby scripts/readiness-check.rb --check 2>&1 | grep -qF "is missing from this branch"; then
  pass "removing a base snapshot (not just editing one) is caught by base comparison"
else
  fail "a deleted base snapshot was not caught"
fi

# Unresolvable base ref must hard-fail --check (never a silent pass presented
# as protection). `env -u` UNSETS the harness-wide FILE default so the script
# actually falls through to the REF path instead of short-circuiting to :no_base.
reset_work
if env -u READINESS_BASE_SNAPSHOTS_FILE READINESS_BASE_REF=refs/does-not-exist-anywhere \
     ruby scripts/readiness-check.rb --check 2>&1 | grep -qF "Refusing to pass --check without it"; then
  pass "an unresolvable base ref hard-fails --check rather than silently skipping enforcement"
else
  fail "an unresolvable base ref did not hard-fail --check"
fi

# A resolvable base ref where the file legitimately does not exist yet (this
# layer's own first-introduction case) must pass cleanly.
reset_work
if READINESS_BASE_SNAPSHOTS_FILE=/definitely/does/not/exist.json ruby scripts/readiness-check.rb --check >/dev/null 2>&1; then
  pass "a base with no SNAPSHOTS.json file yet is treated as legitimate (nothing to compare)"
else
  fail "a legitimately-absent base file was wrongly treated as a failure"
fi

# Outside --check (local dev), an unresolvable base must warn, never claim protection silently.
reset_work
local_out=$(env -u READINESS_BASE_SNAPSHOTS_FILE READINESS_BASE_REF=refs/does-not-exist-anywhere \
              ruby scripts/readiness-check.rb 2>&1)
if echo "$local_out" | grep -qF "base-history comparison skipped" && ! echo "$local_out" | grep -qF "FAILURE"; then
  pass "local (non --check) mode warns instead of silently claiming append-only protection"
else
  fail "local mode did not warn on an unresolvable base ref"
fi

# --snapshot must refuse to append behind a future-dated prior record.
reset_work
ruby -rjson -e "
  doc=JSON.parse(File.read('$WORK_DIR/SNAPSHOTS.json'))
  doc['snapshots'][0]['generatedAt']='2100-01-01T00:00:00Z'
  File.write('$WORK_DIR/SNAPSHOTS.json', JSON.pretty_generate(doc)+\"\n\")
"
if ruby scripts/readiness-check.rb --snapshot 2>&1 | grep -qF "does not advance past the latest snapshot"; then
  pass "--snapshot refuses a non-monotonic append behind a future-dated prior"
else
  fail "--snapshot appended behind a future-dated prior snapshot"
fi

echo "readiness-check-test: unmapped Critical/High governance exception (distinct from the informational list)"
# Baseline: LL-522c1a6d13 (high, masquerade AuditEvent) is unlinked in the live
# data today and must already appear in the dedicated exception section, not
# merely folded into the larger informational count.
reset_work
ruby scripts/readiness-check.rb >/dev/null 2>&1
if grep -qF '## ⚠️ Unmapped Critical/High findings (governance exception)' "$WORK_DIR/READINESS-DASHBOARD.md" \
   && sed -n '/## ⚠️ Unmapped Critical\/High/,/## Current finding baseline/p' "$WORK_DIR/READINESS-DASHBOARD.md" | grep -qF 'LL-522c1a6d13'; then
  pass "the live unmapped High (LL-522c1a6d13) renders in its own governance-exception section today"
else
  fail "LL-522c1a6d13 is not in the dedicated exception section"
fi

# LL-16ef84ad9a (high) is currently linked via adult-beta-ai-cache. Removing
# that link must move it into the dedicated exception section specifically -
# not just the larger informational list - proving the split reacts to a live
# findingIds edit rather than being frozen prose.
reset_work
ruby -rjson -e "
  doc=JSON.parse(File.read('$WORK_DIR/READINESS-MILESTONES.json'))
  doc['requirements'].find{|r| r['id']=='adult-beta-ai-cache'}['findingIds']=[]
  File.write('$WORK_DIR/READINESS-MILESTONES.json', JSON.pretty_generate(doc)+\"\n\")
"
ruby scripts/readiness-check.rb >/dev/null 2>&1
dashboard="$WORK_DIR/READINESS-DASHBOARD.md"
exception_section=$(sed -n '/## ⚠️ Unmapped Critical\/High/,/## Current finding baseline/p' "$dashboard")
if echo "$exception_section" | grep -qF 'LL-16ef84ad9a' \
   && grep -qF '**Unmapped Critical/High:** 2' "$dashboard"; then
  pass "unlinking a currently-linked High moves it into the exception section and the header count updates"
else
  fail "unlinking a High did not move it into the exception section / update the header count"
fi

# When every open Critical/High is linked, the exception section must state
# "None" EXPLICITLY - never simply omit the section, so absence-of-content can
# never be mistaken for absence-of-check.
reset_work
ruby -rjson -e "
  doc=JSON.parse(File.read('$WORK_DIR/READINESS-MILESTONES.json'))
  findings=JSON.parse(File.read('audit-reports/FINDINGS.json'))['findings']
  ch_ids=findings.select{|f| f['status']=='open' && %w[critical high].include?(f['severity'])}.map{|f| f['id']}
  r=doc['requirements'].find{|r| r['id']=='adult-beta-ai-cache'}
  r['findingIds']=(r['findingIds']+ch_ids).uniq
  File.write('$WORK_DIR/READINESS-MILESTONES.json', JSON.pretty_generate(doc)+\"\n\")
"
ruby scripts/readiness-check.rb >/dev/null 2>&1
dashboard="$WORK_DIR/READINESS-DASHBOARD.md"
exception_section=$(sed -n '/## ⚠️ Unmapped Critical\/High/,/## Current finding baseline/p' "$dashboard")
if echo "$exception_section" | grep -qF 'None - every open Critical/High finding is linked' \
   && grep -qF '**Unmapped Critical/High:** 0 - none' "$dashboard"; then
  pass "the exception section states None explicitly (and the header count is 0) when every Critical/High is linked"
else
  fail "the exception section did not state an explicit None when all Critical/High findings are linked"
fi

# The general informational section still exists for Medium/Low context, its
# heading remains unconditional, and it correctly cross-references the
# dedicated exception section rather than duplicating a bare severity list.
reset_work
ruby -rjson -e "
  doc=JSON.parse(File.read('$WORK_DIR/READINESS-MILESTONES.json'))
  findings=JSON.parse(File.read('audit-reports/FINDINGS.json'))['findings'].select{|f| f['status']=='open'}.map{|f| f['id']}
  doc['requirements'].find{|r| r['id']=='adult-beta-ai-cache'}['findingIds']=findings
  File.write('$WORK_DIR/READINESS-MILESTONES.json', JSON.pretty_generate(doc)+\"\n\")
"
ruby scripts/readiness-check.rb >/dev/null 2>&1
if grep -qF '### Open findings not linked to any requirement (informational)' "$WORK_DIR/READINESS-DASHBOARD.md" \
   && grep -qF 'None - every open finding is linked' "$WORK_DIR/READINESS-DASHBOARD.md"; then
  pass "the informational section heading renders unconditionally, even when the list is empty"
else
  fail "the informational section heading was suppressed when the list became empty"
fi

# Medium/Low unlinked findings must never automatically become a milestone
# blocker: an unlinked finding cannot appear in ANY milestone's Top Blockers
# list, because blocking status derives only from a linked, ratified,
# blocking=true requirement - never from severity alone. Structurally true by
# construction (top_blockers iterates `requirements`, never `findings`
# directly), verified here against the live open Medium/Low set.
reset_work
ruby scripts/readiness-check.rb >/dev/null 2>&1
medium_low_unlinked=$(ruby -rjson -e "
  findings=JSON.parse(File.read('audit-reports/FINDINGS.json'))['findings']
  reqs=JSON.parse(File.read('$WORK_DIR/READINESS-MILESTONES.json'))['requirements']
  linked=reqs.flat_map{|r| r['findingIds']||[]}.to_set
  open_ml=findings.select{|f| f['status']=='open' && %w[medium low].include?(f['severity'])}
  puts open_ml.reject{|f| linked.include?(f['id'])}.map{|f| f['id']}
")
# No unlinked Medium/Low id may appear anywhere under a "Top blockers" heading
# in the render (top_blockers is derived only from linked requirements).
blocker_sections=$(awk '/^### Top blockers/{p=1} /^## /{if($0 !~ /^### Top blockers/) p=0} p' "$WORK_DIR/READINESS-DASHBOARD.md")
leaked=0
for fid in $medium_low_unlinked; do
  if echo "$blocker_sections" | grep -qF "$fid"; then
    leaked=1
  fi
done
if [ -n "$medium_low_unlinked" ] && [ "$leaked" -eq 0 ]; then
  pass "no unlinked Medium/Low finding appears in any milestone's Top Blockers list"
elif [ -z "$medium_low_unlinked" ]; then
  fail "test fixture assumption broken: expected at least one unlinked Medium/Low open finding to exist"
else
  fail "an unlinked Medium/Low finding leaked into a Top Blockers list"
fi

echo "readiness-check-test: canonical register sanity"
# Duplicate finding IDs must hard-fail (lookup would silently collapse one record).
cp audit-reports/FINDINGS.json "$FINDINGS_SCRATCH"
ruby -rjson -e "
  doc=JSON.parse(File.read('$FINDINGS_SCRATCH'))
  doc['findings'] << doc['findings'].first.dup
  File.write('$FINDINGS_SCRATCH', JSON.pretty_generate(doc)+\"\n\")
"
reset_work
if READINESS_FINDINGS_JSON="$FINDINGS_SCRATCH" ruby scripts/readiness-check.rb --check 2>&1 | grep -qF "duplicate finding id"; then
  pass "duplicate finding id in FINDINGS.json fails"
else
  fail "duplicate finding id was silently collapsed"
fi

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
# Self-contained: explicitly reset every other decision to undecided rather than
# relying on the live LAUNCH-PROFILE.json happening to already be undecided -
# once real launch-profile decisions are made, "only touch aiFocusWordsEnabled"
# stops reproducing the two-still-undecided scenario this case is about.
ruby -rjson -e "
  doc=JSON.parse(File.read('$WORK_DIR/LAUNCH-PROFILE.json'))
  doc['decisions']['aiWordPredictionEnabled']='undecided'
  doc['decisions']['aiBoardGenerationEnabled']='undecided'
  doc['decisions']['aiFocusWordsEnabled']=true
  doc['decisions']['euUsersIncluded']='undecided'
  doc['decisions']['minorsIncluded']='undecided'
  doc['decisions']['schoolManagedAccounts']='undecided'
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

echo "readiness-check-test: inheritance-note reflects the actual mvpIncludesMinors state"
# Regression case: the public-mvp inheritance-note sentence used to be a hardcoded
# string claiming "decision-dependent while mvpIncludesMinors is undecided" no
# matter what the decision actually was - once mvpIncludesMinors is genuinely
# decided, that contradicted the "Pending launch decisions: none" line above it.
reset_work
ruby -rjson -e "
  doc=JSON.parse(File.read('$WORK_DIR/LAUNCH-PROFILE.json'))
  doc['decisions']['mvpIncludesMinors']=false
  File.write('$WORK_DIR/LAUNCH-PROFILE.json', JSON.pretty_generate(doc)+\"\n\")
"
ruby scripts/readiness-check.rb >/dev/null 2>&1
if grep -qF 'excluded, since `mvpIncludesMinors` is decided false' "$WORK_DIR/READINESS-DASHBOARD.md" \
   && ! grep -qF 'decision-dependent while `mvpIncludesMinors` is undecided' "$WORK_DIR/READINESS-DASHBOARD.md"; then
  pass "mvpIncludesMinors=false renders 'excluded', not the stale 'undecided' wording"
else
  fail "inheritance note did not update for mvpIncludesMinors=false"
fi

reset_work
ruby -rjson -e "
  doc=JSON.parse(File.read('$WORK_DIR/LAUNCH-PROFILE.json'))
  doc['decisions']['mvpIncludesMinors']=true
  File.write('$WORK_DIR/LAUNCH-PROFILE.json', JSON.pretty_generate(doc)+\"\n\")
"
ruby scripts/readiness-check.rb >/dev/null 2>&1
if grep -qF 'included, since `mvpIncludesMinors` is decided true' "$WORK_DIR/READINESS-DASHBOARD.md"; then
  pass "mvpIncludesMinors=true renders 'included'"
else
  fail "inheritance note did not update for mvpIncludesMinors=true"
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
" > "$PRIOR_SCRATCH" 2>/dev/null
snap_count_before=$(ruby -rjson -e "puts JSON.parse(File.read('$WORK_DIR/SNAPSHOTS.json'))['snapshots'].size")
if ruby scripts/readiness-check.rb --snapshot >/dev/null 2>&1; then
  snap_count_after=$(ruby -rjson -e "puts JSON.parse(File.read('$WORK_DIR/SNAPSHOTS.json'))['snapshots'].size")
  prior_after=$(ruby -rjson -e "\$stdout.write(JSON.generate(JSON.parse(File.read('$WORK_DIR/SNAPSHOTS.json'))['snapshots'][0]))")
  if [ "$snap_count_after" -eq $((snap_count_before + 1)) ] && [ "$prior_after" = "$(cat "$PRIOR_SCRATCH")" ]; then
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
