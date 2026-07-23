#!/usr/bin/env bash
# attestation-hash-guard-test.sh - regression coverage for the attestedContentHash gate in
# scripts/document-register-render.rb.
#
# Why a shell harness rather than an rspec spec: the checks under test are properties of the real
# register plus the real repo (git-tracked file bytes, docs/legal completeness, REPO_ROOT
# containment). A synthetic fixture register would have to fake all of that, and the fake is what
# would rot. So each case works on a COPY of the live register placed beside it in audit-reports/
# (same directory, so relative paths and REPO_ROOT still resolve), mutates one thing, and asserts
# the expected [FAIL] text appears. The live register is never written to.
#
# Usage: scripts/tests/attestation-hash-guard-test.sh
# Exit: 0 = every guard fired as expected; 1 = at least one guard is missing or misworded.

set -u
cd "$(git rev-parse --show-toplevel)" || exit 1

LIVE=audit-reports/DOCUMENT-REGISTER.json
WORK=audit-reports/DOCUMENT-REGISTER.attestation-test.json
WORK_MD=audit-reports/DOCUMENT-REGISTER.attestation-test.md

LIVE_SNAPSHOT=$(mktemp)
cp "$LIVE" "$LIVE_SNAPSHOT"

cleanup() { rm -f "$WORK" "$WORK_MD" "$LIVE_SNAPSHOT"; }
trap cleanup EXIT INT TERM

SEED="ex=docs.find{|x| x['canonicalLocation']=='docs/legal/INCIDENT_LOG.md'}; m['attestationBackfillExemptions']=[{'id'=>ex['id'],'canonicalLocation'=>ex['canonicalLocation'],'reason'=>'seeded by the test harness','addedOn'=>'2026-07-23'}]"

fails=0
pass() { echo "  ok   $1"; }
fail() { echo "  FAIL $1"; fails=$((fails + 1)); }

# $1 = case name, $2 = ruby mutation (locals: reg, m = meta, docs), $3 = expected [FAIL] substring.
# An empty $3 asserts the opposite: the register must pass cleanly.
expect() {
  local name="$1" mutation="$2" want="$3" out rc
  cp "$LIVE" "$WORK"
  # The render is compared against a sibling .md derived from the register filename, so seed it
  # from the working copy first; otherwise every case would also report render drift as noise.
  ruby -rjson -e "reg=JSON.parse(File.read('$WORK')); m=reg['meta']; docs=reg['documents']; ${mutation}; File.write('$WORK', JSON.pretty_generate(reg)+\"\n\")" || {
    fail "$name (mutation raised)"; return
  }
  ruby scripts/document-register-render.rb "$WORK" >/dev/null 2>&1
  out=$(ruby scripts/document-register-render.rb --check "$WORK" 2>&1); rc=$?

  if [ -z "$want" ]; then
    [ $rc -eq 0 ] && pass "$name" || { fail "$name (expected clean, got failures)"; echo "$out" | grep '\[FAIL\]' | head -3; }
    return
  fi
  if [ $rc -eq 0 ]; then
    fail "$name (guard did not fire)"
  elif echo "$out" | grep -qF "$want"; then
    pass "$name"
  else
    fail "$name (fired with the wrong message)"
    echo "$out" | grep '\[FAIL\]' | head -3
  fi
}

echo "attestation-hash-guard-test: the register as committed"
# Baseline. If this fails, every case below is meaningless.
expect "live register passes unmutated" "" ""

echo "attestation-hash-guard-test: drift detection"
expect "pinned hash no longer matches the file" \
  "d=docs.find{|x| x['canonicalLocation']=='docs/legal/AI_GOVERNANCE_MEMO.md'}; d['attestation']['attestedContentHash']='0'*64" \
  "attested revision no longer exists"

expect "attested git row pins nothing and is not grandfathered" \
  "docs.find{|x| x['canonicalLocation']=='docs/legal/INCIDENT_LOG.md'}['attestation'].delete('attestedContentHash')" \
  "has no attestation.attestedContentHash"

expect "pin is malformed" \
  "d=docs.find{|x| x['canonicalLocation']=='docs/legal/INCIDENT_LOG.md'}; d['attestation']['attestedContentHash']='NOTAHASH'" \
  "malformed attestation.attestedContentHash"

expect "non-git row carries a pin CI cannot verify" \
  "d=docs.find{|x| x['canonicalSystem']=='drive'}; d['attestation']||={}; d['attestation']['attestedContentHash']='a'*64" \
  "only git rows have bytes this check can verify"

echo "attestation-hash-guard-test: the exemption list cannot become a waiver"
# The load-bearing case. A future unpinned attestation must NOT be clearable by appending an entry.
expect "a new row cannot be exempted into passing" \
  "${SEED}; ex['attestation'].delete('attestedContentHash'); m['attestationBackfillExemptions'][0]['reason']='plausible sounding excuse'" \
  "is not in the closed grandfather set"

expect "exemption left behind after the row was pinned" \
  "${SEED}; ex['attestation']['attestedContentHash']=ex['contentHash']" \
  "stale attestation exemption"

expect "exemption id resolves to nothing" \
  "${SEED}; m['attestationBackfillExemptions'][0]['id']='DOC-deadbeef00'" \
  "does not resolve to a row in this register"

expect "exemption carries no reason" \
  "${SEED}; m['attestationBackfillExemptions'][0].delete('reason')" \
  'is missing "reason"'

expect "exemption date is unparseable" \
  "${SEED}; m['attestationBackfillExemptions'][0]['addedOn']='2026-13-45'" \
  "unparseable addedOn"

expect "exemption is duplicated" \
  "${SEED}; m['attestationBackfillExemptions'] << m['attestationBackfillExemptions'][0].dup" \
  "duplicate attestation exemption"

expect "exemption covers a row with no attestation" \
  "${SEED}; ex['attestation']={}" \
  "covers a row carrying no attestation"

expect "exemption location disagrees with its row" \
  "${SEED}; m['attestationBackfillExemptions'][0]['canonicalLocation']='docs/legal/NOPE.md'" \
  "but the row is"

expect "exemption list is not an array" \
  "m['attestationBackfillExemptions']={}" \
  "must be an array"

echo "attestation-hash-guard-test: the render cannot launder a pin"
# The end-to-end path: edit an attested file, regenerate everything, confirm --check still fails.
# Render recomputes contentHash from current bytes; if it also wrote attestedContentHash, every
# attestation would be self-certifying and this case would silently pass.
cp "$LIVE" "$WORK"
printf '\n' >> docs/legal/AI_GOVERNANCE_MEMO.md
ruby scripts/document-register-render.rb "$WORK" >/dev/null 2>&1
if ruby scripts/document-register-render.rb --check "$WORK" 2>&1 | grep -qF "attested revision no longer exists"; then
  pass "edit an attested file, re-render, guard still fires"
else
  fail "edit an attested file, re-render, guard was laundered by the render"
fi
git checkout -- docs/legal/AI_GOVERNANCE_MEMO.md

# The live register must be byte-identical to how this run found it.
if cmp -s "$LIVE_SNAPSHOT" "$LIVE"; then
  pass "live register untouched"
else
  fail "live register was modified by the test run"
fi

echo
if [ "$fails" -eq 0 ]; then
  echo "attestation-hash-guard-test: OK (all guards fired)"
  exit 0
fi
echo "attestation-hash-guard-test: $fails guard(s) missing or misworded"
exit 1
