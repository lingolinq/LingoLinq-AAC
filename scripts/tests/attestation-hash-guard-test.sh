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
# Resolve this script's own path BEFORE the cd, so the flock re-exec below still
# finds it when the harness was invoked by a relative path from another directory.
SELF="$(cd "$(dirname "$0")" && pwd)/$(basename "$0")"
cd "$(git rev-parse --show-toplevel)" || exit 1

# Serialize concurrent runs. This harness edits a REAL attested file in place
# (see MEMO below) and snapshots it to restore afterwards, so two overlapping runs
# race: B snapshots the bytes A already modified, then "restores" the file to A's
# edit and leaves a tracked attested legal document dirty. Overlap stopped being
# hypothetical when the harness was added to scripts/regenerate-register.sh - it
# used to run only in CI, one job at a time, and now runs in the wrapper everyone
# uses, including from several agent sessions sharing one checkout. Observed
# concurrently: 5-6 spurious "fired with the wrong message" failures per run. A
# false red on the anti-laundering harness is the failure most likely to be
# "fixed" by weakening the assertion, which is the one thing that must not happen.
# The lock lives in this worktree's own git dir, NOT under $TMPDIR: two callers with different
# TMPDIR (routine in agent sandboxes and CI containers) would take different locks and silently
# not serialize at all. --absolute-git-dir is per-worktree, which is the right grain - separate
# worktrees have their own MEMO file and must not block each other.
if [ -z "${ATTESTATION_GUARD_LOCK_HELD:-}" ] && command -v flock >/dev/null 2>&1; then
  export ATTESTATION_GUARD_LOCK_HELD=1
  exec flock "$(git rev-parse --absolute-git-dir)/ll-attestation-guard.lock" "$SELF" "$@"
fi

LIVE=audit-reports/DOCUMENT-REGISTER.json
# Per-PID scratch names: the fixed names these replaced were clobbered by any concurrent run,
# which is what produced the spurious failures. NOTE this protects the scratch register ONLY.
# The MEMO snapshot/edit/restore race below is not addressed by unique filenames - it relies on
# the flock above, so on a host with no flock(1) concurrent runs can still leave MEMO dirty.
WORK=audit-reports/DOCUMENT-REGISTER.attestation-test.$$.json
WORK_MD=audit-reports/DOCUMENT-REGISTER.attestation-test.$$.md

LIVE_SNAPSHOT=$(mktemp)
cp "$LIVE" "$LIVE_SNAPSHOT"

# One end-to-end case must edit a real attested file in place (see below). Snapshot its exact bytes
# now - NOT its committed version - so the trap can restore whatever the working tree held when this
# run started, including any pre-existing uncommitted edits. `git checkout` would discard those.
MEMO=docs/legal/AI_GOVERNANCE_MEMO.md
MEMO_SNAPSHOT=$(mktemp)
cp "$MEMO" "$MEMO_SNAPSHOT"

restore_failed=0
restore_memo() {
  # Only touch the file if this run changed it; restore from the byte snapshot and verify.
  if ! cmp -s "$MEMO_SNAPSHOT" "$MEMO"; then
    if ! cp "$MEMO_SNAPSHOT" "$MEMO" || ! cmp -s "$MEMO_SNAPSHOT" "$MEMO"; then
      echo "  FAIL could not restore $MEMO from snapshot; it is left modified" >&2
      restore_failed=1
    fi
  fi
}

cleanup() { restore_memo; rm -f "$WORK" "$WORK_MD" "$LIVE_SNAPSHOT" "$MEMO_SNAPSHOT"; }
# INT/TERM must EXIT, not just clean up. A bare `trap cleanup INT` runs the handler and then
# RESUMES the script: the memo is restored and its snapshot deleted, the next drift block appends
# to the file again, and restore_memo can no longer put it back - leaving a tracked, attested legal
# document modified in the working tree. That was survivable while this ran only in CI; it is not
# now that scripts/regenerate-register.sh runs it in both modes and then prints the dirty file
# under "Review the diff above, then commit."
trap cleanup EXIT
trap 'cleanup; exit 130' INT
trap 'cleanup; exit 143' TERM

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

echo "attestation-hash-guard-test: drift on an attested row routes away from the render"
# The contributor-facing path, and the one the `expect` helper cannot cover: `expect` always
# renders before --check (so the drift branch never fires there). Here the register is rendered
# CONSISTENT first, and only then is the attested file edited - exactly the state a contributor
# lands in. The message must NOT tell them to re-render: doing so bumps contentHash, re-fails as
# "attested revision no longer exists", and leaves a mutated register in the diff (PR #721).
cp "$LIVE" "$WORK"
ruby scripts/document-register-render.rb "$WORK" >/dev/null 2>&1   # consistent baseline
printf '\n' >> "$MEMO"                                             # now drift the attested file
drift_out=$(ruby scripts/document-register-render.rb --check "$WORK" 2>&1)
if echo "$drift_out" | grep -qF "Do NOT run render to clear this"; then
  pass "attested drift routes to re-attest, not to the render"
else
  fail "attested drift still advises re-rendering (that mutates the register and re-fails)"
  echo "$drift_out" | grep '\[FAIL\]' | head -3
fi
restore_memo

# The negative half: an ORDINARY doc must still be routed to the render. Without this, any change
# that widens the attested branch tells every contributor editing an unattested doc to stop and
# escalate to Scot, which is the likelier regression and was previously untested.
# (Deleting `attested?(doc)` alone does NOT regress this - verified by mutation. The pin match is
# the real gate, since an unattested row has no attestedContentHash to match. The condition is
# kept for intent, not because it is load-bearing.)
UNATTESTED=docs/legal/ACCESSIBILITY_CONFORMANCE_REPORT.md
UNATTESTED_SNAPSHOT=$(mktemp)
cp "$UNATTESTED" "$UNATTESTED_SNAPSHOT"
cp "$LIVE" "$WORK"
ruby scripts/document-register-render.rb "$WORK" >/dev/null 2>&1
printf '\n' >> "$UNATTESTED"
unatt_out=$(ruby scripts/document-register-render.rb --check "$WORK" 2>&1)
cp "$UNATTESTED_SNAPSHOT" "$UNATTESTED"; rm -f "$UNATTESTED_SNAPSHOT"
if echo "$unatt_out" | grep -qF "(run render)" && ! echo "$unatt_out" | grep -qF "Do NOT run render to clear this"; then
  pass "unattested drift still routes to the render"
else
  fail "unattested drift got the attested-row treatment (escalates ordinary edits to Scot)"
  echo "$unatt_out" | grep '\[FAIL\]' | head -3
fi

# The post-#721 recovery state: the register carries a bumped contentHash but the FILE is back at
# the attested bytes. Nothing is owed and render reconciles it, so the stop-message must NOT fire
# here. Comparing against `stored` instead of the pin used to report a hash the attestation never
# covered and dead-end the contributor.
cp "$LIVE" "$WORK"
ruby scripts/document-register-render.rb "$WORK" >/dev/null 2>&1
ruby -rjson -e "reg=JSON.parse(File.read('$WORK')); reg['documents'].find{|x| x['canonicalLocation']=='$MEMO'}['contentHash']='d'*64; File.write('$WORK', JSON.pretty_generate(reg)+\"\n\")"
revert_out=$(ruby scripts/document-register-render.rb --check "$WORK" 2>&1)
if echo "$revert_out" | grep -qF "Do NOT run render to clear this"; then
  fail "stale register row after a revert is misreported as an attested-file edit"
  echo "$revert_out" | grep '\[FAIL\]' | head -3
elif echo "$revert_out" | grep -qF "dddddddddddd. Do NOT"; then
  fail "the drift message reports the stored hash as the attested one"
else
  pass "stale register row after a revert is not misreported as an attested edit"
fi

echo "attestation-hash-guard-test: the render cannot launder a pin"
# The end-to-end path: edit an attested file, regenerate everything, confirm --check still fails.
# Render recomputes contentHash from current bytes; if it also wrote attestedContentHash, every
# attestation would be self-certifying and this case would silently pass.
cp "$LIVE" "$WORK"
printf '\n' >> "$MEMO"
ruby scripts/document-register-render.rb "$WORK" >/dev/null 2>&1
if ruby scripts/document-register-render.rb --check "$WORK" 2>&1 | grep -qF "attested revision no longer exists"; then
  pass "edit an attested file, re-render, guard still fires"
else
  fail "edit an attested file, re-render, guard was laundered by the render"
fi
restore_memo   # restore before the untouched-tree assertions below; the trap is the backstop

# Both source files this run edited in place must be byte-identical to how it found them.
if cmp -s "$LIVE_SNAPSHOT" "$LIVE"; then
  pass "live register untouched"
else
  fail "live register was modified by the test run"
fi
if cmp -s "$MEMO_SNAPSHOT" "$MEMO"; then
  pass "attested test file restored"
else
  fail "attested test file was left modified"
fi

echo
if [ "$fails" -eq 0 ] && [ "$restore_failed" -eq 0 ]; then
  echo "attestation-hash-guard-test: OK (all guards fired)"
  exit 0
fi
echo "attestation-hash-guard-test: $fails guard(s) missing or misworded; restore_failed=$restore_failed"
exit 1
