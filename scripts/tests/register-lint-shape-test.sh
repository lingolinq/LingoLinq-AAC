#!/usr/bin/env bash
#
# register-lint-shape-test.sh - proves the field-shape, enum, and duplicate-id
# rules in scripts/register-lint.rb FIRE.
#
# WHY THIS EXISTS
#   register-lint is the ONLY structural gate on findings rows that runs in CI:
#   citation-check.rb re-resolves every snippet at its sha, but ci.yml states it
#   is deliberately NOT a CI job. The sibling harness
#   scripts/tests/register-lint-sha-test.sh covers the evidence.sha branches.
#   This file covers the rest: object-field shapes (the crash class that took
#   down promote-finding.rb), enum membership, and duplicate ids.
#
#   A rule that has only ever been observed passing on the committed registers
#   is evidence that those registers are clean, not that the rule works. Each
#   branch of the contract is asserted below against a fixture that violates it
#   AND one that does not.
#
#   This harness NEVER touches audit-reports/. It builds fixtures in a temp dir
#   and passes them to register-lint as ARGV, which is how the script already
#   accepts registers.
#
#   REGISTER_LINT, if set, points at an alternate copy of register-lint.rb.
#   Used only by the authoring-time meta-test (neuter a rule family in a copy
#   and confirm this harness goes red). CI and the default local run leave it
#   unset.
#
# Usage: scripts/tests/register-lint-shape-test.sh
# Exit codes: 0 = every branch behaved; 1 = a rule failed to fire, or fired when it should not.

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
LINT="${REGISTER_LINT:-$REPO_ROOT/scripts/register-lint.rb}"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

fails=0
pass() { printf '  ok   %s\n' "$1"; }
fail() { printf '  FAIL %s\n' "$1"; fails=$((fails + 1)); }

DEFAULT_META='{"schemaVersion":"1.1"}'

# A well-formed finding whose evidence is runtime so the sha rules stay quiet.
# Optional object fields (source, disposition, closureEvidence, remediation,
# frameworks) are omitted: that is legal, and it keeps each negative case
# violating exactly one rule.
OK='[{"id":"LL-0000000000","ruleKey":"fixture-rule","title":"fixture","severity":"low","status":"open","evidence":{"type":"runtime"}}]'

# build_register <path> <findings-json> [meta-json]
build_register() {
  cat > "$1" <<JSON
{
  "meta": ${3:-$DEFAULT_META},
  "findings": $2
}
JSON
}

# expect_pass <label> <findings-json> [meta-json]
expect_pass() {
  build_register "$TMP/f.json" "$2" "${3:-$DEFAULT_META}"
  if ruby "$LINT" "$TMP/f.json" >/dev/null 2>&1; then pass "$1"; else
    fail "$1 (expected clean, got: $(ruby "$LINT" "$TMP/f.json" 2>&1 | tail -1))"; fi
}

# expect_fail <label> <findings-json> <must-mention> [meta-json]
expect_fail() {
  build_register "$TMP/f.json" "$2" "${4:-$DEFAULT_META}"
  local out; out="$(ruby "$LINT" "$TMP/f.json" 2>&1)"
  if [ $? -eq 0 ]; then fail "$1 (rule did NOT fire)"; return; fi
  if ! printf '%s' "$out" | grep -qiE "$3"; then
    fail "$1 (failed, but not on the expected rule: $(printf '%s' "$out" | tail -1))"; return
  fi
  pass "$1"
}

echo "register-lint field-shape / enum / duplicate-id contract:"

# ---------------------------------------------------------------------------
# Controls: the shapes that must stay legal.
# ---------------------------------------------------------------------------
expect_pass "well-formed finding with runtime evidence and no optional objects" "$OK"

expect_pass "omitted optional object fields stay legal" \
  '[{"id":"LL-0000000000","ruleKey":"fixture-rule","title":"fixture","severity":"low","status":"open","evidence":{"type":"runtime"},"notes":null}]'

expect_pass "optional object fields present and well-formed stay legal" \
  '[{"id":"LL-0000000000","ruleKey":"fixture-rule","title":"fixture","severity":"low","status":"open","frameworks":["FERPA"],"evidence":{"type":"runtime"},"remediation":{"options":"","timeframe":""},"closureEvidence":{},"disposition":{"state":"untriaged"},"source":{"kind":"manual"},"notes":""}]'

# Meta enums win over FALLBACK_ENUMS: a status that is illegal in the fallback
# but listed in meta.statusEnum must pass. If the linter ignored meta and
# hardcoded the fallback, this control would go red.
expect_pass "meta.statusEnum override makes a custom status legal" \
  '[{"id":"LL-0000000000","ruleKey":"fixture-rule","title":"fixture","severity":"low","status":"provisional","evidence":{"type":"runtime"}}]' \
  '{"schemaVersion":"1.1","statusEnum":["open","provisional"]}'

# ---------------------------------------------------------------------------
# Field shapes. Each fixture violates exactly one rule; needles are unique so
# a failure on the wrong rule does not count as a pass.
# ---------------------------------------------------------------------------
echo "  -- object-field crash class --"

expect_fail "source as a bare String is refused" \
  '[{"id":"LL-0000000000","ruleKey":"fixture-rule","title":"fixture","severity":"low","status":"open","evidence":{"type":"runtime"},"source":"pr-review"}]' \
  'source must be an object'

expect_fail "disposition as a bare String is refused" \
  '[{"id":"LL-0000000000","ruleKey":"fixture-rule","title":"fixture","severity":"low","status":"open","evidence":{"type":"runtime"},"disposition":"untriaged"}]' \
  'disposition must be an object'

expect_fail "remediation as a bare String is refused" \
  '[{"id":"LL-0000000000","ruleKey":"fixture-rule","title":"fixture","severity":"low","status":"open","evidence":{"type":"runtime"},"remediation":"fix it"}]' \
  'remediation must be an object'

expect_fail "closureEvidence as a bare String is refused" \
  '[{"id":"LL-0000000000","ruleKey":"fixture-rule","title":"fixture","severity":"low","status":"open","evidence":{"type":"runtime"},"closureEvidence":"done"}]' \
  'closureEvidence must be an object'

expect_fail "evidence as a bare String is refused" \
  '[{"id":"LL-0000000000","ruleKey":"fixture-rule","title":"fixture","severity":"low","status":"open","evidence":"Gemfile:1"}]' \
  'evidence must be an object'

expect_fail "missing evidence is refused" \
  '[{"id":"LL-0000000000","ruleKey":"fixture-rule","title":"fixture","severity":"low","status":"open"}]' \
  'evidence is required'

echo "  -- other field shapes --"

expect_fail "frameworks as a non-array is refused" \
  '[{"id":"LL-0000000000","ruleKey":"fixture-rule","title":"fixture","severity":"low","status":"open","frameworks":"FERPA","evidence":{"type":"runtime"}}]' \
  'frameworks must be an array'

expect_fail "empty id is refused" \
  '[{"id":"","ruleKey":"fixture-rule","title":"fixture","severity":"low","status":"open","evidence":{"type":"runtime"}}]' \
  'id must be a non-empty string'

expect_fail "non-string id is refused" \
  '[{"id":123,"ruleKey":"fixture-rule","title":"fixture","severity":"low","status":"open","evidence":{"type":"runtime"}}]' \
  'id must be a non-empty string'

expect_fail "empty ruleKey is refused" \
  '[{"id":"LL-0000000000","ruleKey":"","title":"fixture","severity":"low","status":"open","evidence":{"type":"runtime"}}]' \
  'ruleKey must be a non-empty string'

expect_fail "non-string title is refused" \
  '[{"id":"LL-0000000000","ruleKey":"fixture-rule","title":1,"severity":"low","status":"open","evidence":{"type":"runtime"}}]' \
  'title must be a string or null'

expect_fail "non-string notes is refused" \
  '[{"id":"LL-0000000000","ruleKey":"fixture-rule","title":"fixture","severity":"low","status":"open","evidence":{"type":"runtime"},"notes":{}}]' \
  'notes must be a string or null'

expect_fail "string evidence.line is refused" \
  '[{"id":"LL-0000000000","ruleKey":"fixture-rule","title":"fixture","severity":"low","status":"open","evidence":{"type":"runtime","line":"12"}}]' \
  'evidence\.line must be a number'

expect_fail "finding that is not an object is refused" \
  '["not-a-finding"]' \
  'finding must be an object'

expect_fail "findings that is not an array is refused" \
  '{}' \
  'findings must be an array'

# ---------------------------------------------------------------------------
# Enums.
# ---------------------------------------------------------------------------
echo "  -- enums --"

expect_fail "status not in statusEnum is refused" \
  '[{"id":"LL-0000000000","ruleKey":"fixture-rule","title":"fixture","severity":"low","status":"nope","evidence":{"type":"runtime"}}]' \
  'status "nope" not in statusEnum'

expect_fail "severity not in severityEnum is refused" \
  '[{"id":"LL-0000000000","ruleKey":"fixture-rule","title":"fixture","severity":"nope","status":"open","evidence":{"type":"runtime"}}]' \
  'severity "nope" not in severityEnum'

expect_fail "frameworks value not in frameworkEnum is refused" \
  '[{"id":"LL-0000000000","ruleKey":"fixture-rule","title":"fixture","severity":"low","status":"open","frameworks":["NOTAFRAMEWORK"],"evidence":{"type":"runtime"}}]' \
  'not in frameworkEnum'

expect_fail "disposition.state not in dispositionEnum is refused" \
  '[{"id":"LL-0000000000","ruleKey":"fixture-rule","title":"fixture","severity":"low","status":"open","evidence":{"type":"runtime"},"disposition":{"state":"nope"}}]' \
  'disposition\.state "nope" not in dispositionEnum'

expect_fail "source.kind not in sourceEnum is refused" \
  '[{"id":"LL-0000000000","ruleKey":"fixture-rule","title":"fixture","severity":"low","status":"open","evidence":{"type":"runtime"},"source":{"kind":"nope"}}]' \
  'source\.kind "nope" not in sourceEnum'

# Inverse of the meta override control: verified-closed is legal in
# FALLBACK_ENUMS, but this meta.statusEnum does not list it. If the linter
# ignored meta and hardcoded the fallback, this case would stay green.
expect_fail "fallback-legal status missing from meta.statusEnum is refused" \
  '[{"id":"LL-0000000000","ruleKey":"fixture-rule","title":"fixture","severity":"low","status":"verified-closed","evidence":{"type":"runtime"}}]' \
  'status "verified-closed" not in statusEnum' \
  '{"schemaVersion":"1.1","statusEnum":["open"]}'

# ---------------------------------------------------------------------------
# Duplicate ids. A duplicate silently shadows a row: both mergers build by_id
# last-write-wins, so the earlier finding becomes unreachable.
# ---------------------------------------------------------------------------
echo "  -- duplicate ids --"

expect_fail "duplicate id is refused" \
  '[{"id":"LL-0000000000","ruleKey":"fixture-rule","title":"fixture","severity":"low","status":"open","evidence":{"type":"runtime"}},{"id":"LL-0000000000","ruleKey":"fixture-rule-2","title":"other","severity":"low","status":"open","evidence":{"type":"runtime"}}]' \
  'duplicate id'

expect_pass "distinct ids stay legal" \
  '[{"id":"LL-0000000000","ruleKey":"fixture-rule","title":"fixture","severity":"low","status":"open","evidence":{"type":"runtime"}},{"id":"LL-0000000001","ruleKey":"fixture-rule-2","title":"other","severity":"low","status":"open","evidence":{"type":"runtime"}}]'

# The committed registers must satisfy the contract they are gated by.
for reg in "$REPO_ROOT/audit-reports/FINDINGS.json" "$REPO_ROOT/audit-reports/ember-upgrade/FINDINGS-EMBER.json"; do
  if ruby "$LINT" "$reg" >/dev/null 2>&1; then pass "committed register is clean: $(basename "$reg")"
  else fail "committed register FAILS the contract: $(basename "$reg")"; fi
done

if [ "$fails" -ne 0 ]; then printf '\nregister-lint-shape-test: %d failure(s)\n' "$fails"; exit 1; fi
printf '\nregister-lint-shape-test: all branches behaved\n'
