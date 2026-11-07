#!/usr/bin/env bash
# attestation-hash-guard-isolation-test.sh - prove the attestation harness never
# writes docs/legal/ in the live checkout, even transiently (#777).
#
# The sibling harness must edit a real attested tracked file so the render cannot
# launder a pin. That edit belongs in a throwaway worktree, not here. This script
# makes the live legal files immutable, runs the harness, and asserts the live
# files are byte-identical afterwards. If the harness still appends to the live
# memo, the write fails and the harness goes red. CI-only: do not run this from
# regenerate-register.sh --check, because chmod a-w is itself a live docs/legal/
# mutation.
#
# Usage: scripts/tests/attestation-hash-guard-isolation-test.sh
# Exit: 0 = live docs/legal/ untouched and the harness passed; 1 otherwise.

set -u
cd "$(git rev-parse --show-toplevel)" || exit 1

# A leaked env must not skip isolation; the harness fail-closes if it is set
# outside a throwaway worktree.
unset ATTESTATION_GUARD_ISOLATED ATTESTATION_GUARD_LOCK_HELD

echo "attestation-hash-guard-isolation-test: leaked env fail-closes on the live tree"
if ATTESTATION_GUARD_ISOLATED=1 bash scripts/tests/attestation-hash-guard-test.sh >/dev/null 2>&1; then
  echo "  FAIL leaked env passed on the live tree"
  exit 1
fi
echo "  ok   leaked env refused"

MEMO=docs/legal/AI_GOVERNANCE_MEMO.md
UNATTESTED=docs/legal/ACCESSIBILITY_CONFORMANCE_REPORT.md
MEMO_SNAPSHOT=$(mktemp)
UNATTESTED_SNAPSHOT=$(mktemp)
cp "$MEMO" "$MEMO_SNAPSHOT"
cp "$UNATTESTED" "$UNATTESTED_SNAPSHOT"

restore() {
  chmod u+w "$MEMO" "$UNATTESTED" 2>/dev/null || true
  if ! cmp -s "$MEMO_SNAPSHOT" "$MEMO"; then
    cp "$MEMO_SNAPSHOT" "$MEMO"
  fi
  if ! cmp -s "$UNATTESTED_SNAPSHOT" "$UNATTESTED"; then
    cp "$UNATTESTED_SNAPSHOT" "$UNATTESTED"
  fi
  rm -f "$MEMO_SNAPSHOT" "$UNATTESTED_SNAPSHOT"
}
trap restore EXIT
trap 'restore; exit 130' INT
trap 'restore; exit 143' TERM

chmod a-w "$MEMO" "$UNATTESTED"
if [ -w "$MEMO" ] || [ -w "$UNATTESTED" ]; then
  echo "attestation-hash-guard-isolation-test: FAIL chmod a-w did not stick (root or chmod-ignoring filesystem); isolation is unproven" >&2
  exit 1
fi

echo "attestation-hash-guard-isolation-test: live legal files are immutable"
if bash scripts/tests/attestation-hash-guard-test.sh; then
  harness_rc=0
else
  harness_rc=$?
fi

chmod u+w "$MEMO" "$UNATTESTED"

fails=0
if [ "$harness_rc" -ne 0 ]; then
  echo "  FAIL harness exited $harness_rc while live docs/legal/ were not writable"
  fails=$((fails + 1))
else
  echo "  ok   harness passed without writing the live legal files"
fi

if cmp -s "$MEMO_SNAPSHOT" "$MEMO"; then
  echo "  ok   live $MEMO unchanged"
else
  echo "  FAIL live $MEMO was modified"
  fails=$((fails + 1))
fi

if cmp -s "$UNATTESTED_SNAPSHOT" "$UNATTESTED"; then
  echo "  ok   live $UNATTESTED unchanged"
else
  echo "  FAIL live $UNATTESTED was modified"
  fails=$((fails + 1))
fi

if [ "$fails" -eq 0 ]; then
  echo "attestation-hash-guard-isolation-test: OK"
  exit 0
fi
echo "attestation-hash-guard-isolation-test: $fails check(s) failed"
exit 1
