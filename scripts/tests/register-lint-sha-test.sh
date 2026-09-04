#!/usr/bin/env bash
#
# register-lint-sha-test.sh - proves the evidence.sha rules in scripts/register-lint.rb FIRE.
#
# WHY THIS EXISTS
#   register-lint is the ONLY structural gate on findings rows that runs in CI:
#   citation-check.rb re-resolves every snippet at its sha, but ci.yml:153 states it is
#   deliberately NOT a CI job. So if the sha rules here silently stop firing, nothing else
#   catches a findings row whose evidence is unanchored or ambiguously anchored.
#   The same harness also proves unknown evidence.type values are rejected rather
#   than inheriting the runtime/attestation blank-sha exemption (citation-check
#   SKIPs every type other than code/doc, so a mistype would otherwise be
#   unanchored and uninspected).
#
#   A rule that has only ever been observed passing on the committed registers is evidence
#   that those registers are clean, not that the rule works. Each branch of the contract is
#   asserted below against a fixture that violates it AND one that does not.
#
#   This harness NEVER touches audit-reports/. It builds fixtures in a temp dir and passes
#   them to register-lint as ARGV, which is how the script already accepts registers.
#
# Usage: scripts/tests/register-lint-sha-test.sh
# Exit codes: 0 = every branch behaved; 1 = a rule failed to fire, or fired when it should not.

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
LINT="$REPO_ROOT/scripts/register-lint.rb"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

fails=0
pass() { printf '  ok   %s\n' "$1"; }
fail() { printf '  FAIL %s\n' "$1"; fails=$((fails + 1)); }

FULL_SHA="4a0c0ea0389f40c3def95794de1978a3ef25176b"

# build <path> <evidence-json>
build() {
  cat > "$1" <<JSON
{
  "meta": { "schemaVersion": "1.1" },
  "findings": [
    {
      "id": "LL-0000000000",
      "ruleKey": "fixture-rule",
      "title": "fixture",
      "severity": "low",
      "confidence": "high",
      "frameworks": [],
      "status": "open",
      "evidence": $2,
      "firstSeen": "2026-08-27",
      "lastSeen": "2026-08-27",
      "owner": "unassigned",
      "remediation": { "options": "", "timeframe": "" },
      "notes": ""
    }
  ]
}
JSON
}

# expect_pass <label> <evidence-json>
# expect_fail <label> <evidence-json> [must-mention]
# Default must-mention is the sha rule. Pass a pattern when asserting a different branch.
expect_pass() {
  build "$TMP/f.json" "$2"
  if ruby "$LINT" "$TMP/f.json" >/dev/null 2>&1; then pass "$1"; else
    fail "$1 (expected clean, got: $(ruby "$LINT" "$TMP/f.json" 2>&1 | tail -1))"; fi
}
expect_fail() {
  build "$TMP/f.json" "$2"
  local out; out="$(ruby "$LINT" "$TMP/f.json" 2>&1)"
  if [ $? -eq 0 ]; then fail "$1 (rule did NOT fire)"; return; fi
  local needle="${3:-evidence.sha|evidence must carry}"
  if ! printf '%s' "$out" | grep -qiE "$needle"; then
    fail "$1 (failed, but not on the expected rule: $(printf '%s' "$out" | tail -1))"; return
  fi
  pass "$1"
}

echo "register-lint evidence.sha contract:"

# Control: the shapes that must stay legal.
expect_pass "code row with a full 40-hex sha"        "{\"type\":\"code\",\"file\":\"Gemfile\",\"line\":1,\"snippet\":\"x\",\"sha\":\"$FULL_SHA\"}"
expect_pass "doc row with a full 40-hex sha"         "{\"type\":\"doc\",\"file\":\"README.md\",\"line\":1,\"snippet\":\"x\",\"sha\":\"$FULL_SHA\"}"
expect_pass "runtime row with a BLANK sha"           '{"type":"runtime","sha":""}'
expect_pass "attestation row with NO sha key"        '{"type":"attestation"}'

# Rule 1: checkable evidence must be anchored. citation-check falls back to the working
# tree on a blank sha, so an unanchored code/doc row validates against whatever is checked out.
expect_fail "code row with a BLANK sha"              "{\"type\":\"code\",\"file\":\"Gemfile\",\"line\":1,\"snippet\":\"x\",\"sha\":\"\"}"
expect_fail "code row with a NULL sha"               "{\"type\":\"code\",\"file\":\"Gemfile\",\"line\":1,\"snippet\":\"x\",\"sha\":null}"
expect_fail "doc row with a missing sha key"         '{"type":"doc","file":"README.md","line":1,"snippet":"x"}'
expect_fail "typeless row WITH a file and no sha"    '{"file":"Gemfile","line":1,"snippet":"x"}'

# Rule 2: any sha that is present must be full, on every evidence type.
expect_fail "code row with an ABBREVIATED sha"       '{"type":"code","file":"Gemfile","line":1,"snippet":"x","sha":"4a0c0ea03"}'
expect_fail "runtime row with an ABBREVIATED sha"    '{"type":"runtime","sha":"4a0c0ea03"}'
expect_fail "code row with an UPPERCASE sha"         "{\"type\":\"code\",\"file\":\"Gemfile\",\"line\":1,\"snippet\":\"x\",\"sha\":\"$(printf '%s' "$FULL_SHA" | tr 'a-f' 'A-F')\"}"

# Rule 3: unknown types must not inherit the runtime/attestation blank-sha exemption.
# citation-check.rb SKIPs every type other than code/doc, so a mistype would otherwise
# be unanchored and uninspected. Empty-string type with a file derives to code (Ruby
# treats "" as truthy, so `ev['type'] || ...` would have kept it as unknown).
expect_fail "unknown type 'cod' with a file and no sha"   '{"type":"cod","file":"Gemfile","line":1,"snippet":"x"}' 'evidence.type'
expect_fail "unknown type 'cod' with no file and no sha"  '{"type":"cod"}' 'evidence.type'
expect_fail "unknown type with a full sha still rejected" "{\"type\":\"cod\",\"file\":\"Gemfile\",\"sha\":\"$FULL_SHA\"}" 'evidence.type'
expect_fail "empty-string type with a file and no sha"    '{"type":"","file":"Gemfile","line":1,"snippet":"x"}'

# The committed registers must satisfy the contract they are gated by.
for reg in "$REPO_ROOT/audit-reports/FINDINGS.json" "$REPO_ROOT/audit-reports/ember-upgrade/FINDINGS-EMBER.json"; do
  if ruby "$LINT" "$reg" >/dev/null 2>&1; then pass "committed register is clean: $(basename "$reg")"
  else fail "committed register FAILS the contract: $(basename "$reg")"; fi
done

if [ "$fails" -ne 0 ]; then printf '\nregister-lint-sha-test: %d failure(s)\n' "$fails"; exit 1; fi
printf '\nregister-lint-sha-test: all branches behaved\n'
