#!/usr/bin/env bash
#
# register-consumer-smoke-test.sh - prove the committed registers can actually be CONSUMED.
#
# WHY THIS EXISTS
#   scripts/register-lint.rb checks the register against a list of shapes we predicted the
#   consumers care about. This check makes no predictions: it runs the real consumer scripts
#   (scripts/promote-finding.rb and scripts/audit-merge.rb) end to end over each committed
#   register with an EMPTY input set, and asserts two things:
#
#     1. they exit 0 (no crash). A malformed row used to take promote-finding.rb down with
#        `undefined method 'dig' for an instance of String` for the WHOLE register, weeks after
#        the row merged green, because nothing in CI ever executed a consumer.
#     2. the output is byte-identical to the input. A no-op run must be a no-op; a diff here
#        means a consumer silently normalizes or mutates the compliance SSOT on every write.
#
#   The two checks are complementary: register-lint gives a precise, actionable error message,
#   this one catches whatever register-lint's predicate list failed to anticipate.
#
#   audit-merge runs with --no-restamp so the smoke test can never move meta.auditedSha (the
#   audit pointer is a governance field; see audit-reports/README.md).
#
# Read-only: all writes go to a temp dir that is removed on exit. No git history, no network.
#
# Usage: scripts/tests/register-consumer-smoke-test.sh
# Exit:  0 = every register consumable and unchanged; 1 = a consumer crashed or mutated one.

set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

REGISTERS=(
  "audit-reports/FINDINGS.json"
  "audit-reports/ember-upgrade/FINDINGS-EMBER.json"
)

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

printf '{"source":"manual","pr":null,"reviewer":"ci-smoke","findings":[]}\n' > "$TMP/empty-promote.json"
printf '{"domain":"ci-smoke","findings":[]}\n' > "$TMP/empty-merge.json"

# A sha value is required by audit-merge but, with zero incoming findings and --no-restamp, it is
# never written anywhere. Use a literal so the test needs no git history (CI checks out shallow).
SMOKE_SHA="0000000000000000000000000000000000000000"

rc=0

run_case() {  # run_case "<label>" "<register>" "<output>" <cmd...>
  local label="$1" register="$2" out="$3"; shift 3
  local log="$TMP/log.txt"
  if ! "$@" > "$log" 2>&1; then
    printf 'FAIL  %s\n' "$label" >&2
    printf '      consumer exited non-zero against %s:\n' "$register" >&2
    sed 's/^/      /' "$log" >&2
    rc=1
    return
  fi
  if ! diff -q "$register" "$out" > /dev/null 2>&1; then
    printf 'FAIL  %s\n' "$label" >&2
    printf '      a no-op run CHANGED %s (a consumer is mutating the SSOT):\n' "$register" >&2
    diff "$register" "$out" 2>&1 | head -20 | sed 's/^/      /' >&2
    rc=1
    return
  fi
  printf 'ok    %s\n' "$label"
}

for register in "${REGISTERS[@]}"; do
  if [ ! -f "$register" ]; then
    printf 'FAIL  register not found: %s\n' "$register" >&2
    rc=1
    continue
  fi

  run_case "promote-finding no-op: $register" "$register" "$TMP/promote-out.json" \
    ruby scripts/promote-finding.rb --register "$register" \
      --in "$TMP/empty-promote.json" --out "$TMP/promote-out.json"

  run_case "audit-merge no-op: $register" "$register" "$TMP/merge-out.json" \
    ruby scripts/audit-merge.rb --register "$register" --sha "$SMOKE_SHA" --no-restamp \
      --in "$TMP/empty-merge.json" --out "$TMP/merge-out.json"
done

if [ "$rc" -eq 0 ]; then
  printf '\nregister-consumer-smoke: PASS (every register consumable and unchanged by a no-op run)\n'
else
  printf '\nregister-consumer-smoke: FAIL\n' >&2
fi
exit "$rc"
