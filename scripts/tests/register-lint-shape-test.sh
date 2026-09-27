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
#   down promote-finding.rb), enum membership, duplicate ids, and the
#   self-referencing withheld ruleKey form. It also exercises citation-check.rb's
#   id-integrity branch against synthetic fixtures, since citation-check itself
#   is not a CI job.
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
#   and confirm this harness goes red). CITATION_CHECK does the same for
#   citation-check.rb. CI and the default local run leave both unset.
#
# Usage: scripts/tests/register-lint-shape-test.sh
# Exit codes: 0 = every branch behaved; 1 = a rule failed to fire, or fired when it should not.

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
LINT="${REGISTER_LINT:-$REPO_ROOT/scripts/register-lint.rb}"
CITATION_CHECK="${CITATION_CHECK:-$REPO_ROOT/scripts/citation-check.rb}"
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

# ---------------------------------------------------------------------------
# The self-referencing withheld ruleKey form. A row may carry
# "minimized-finding-" + its own id, lowercased, as its ruleKey, and only on
# an id of the canonical LL-<10 lowercase hex> shape.
# ---------------------------------------------------------------------------
echo "  -- withheld ruleKey form --"

expect_pass "withheld form naming the row's own id stays legal" \
  '[{"id":"LL-0000000000","ruleKey":"minimized-finding-ll-0000000000","title":"fixture","severity":"low","status":"open","evidence":{"type":"runtime"}}]'

expect_fail "withheld form naming a DIFFERENT id is refused" \
  '[{"id":"LL-0000000000","ruleKey":"minimized-finding-ll-0000000001","title":"fixture","severity":"low","status":"open","evidence":{"type":"runtime"}}]' \
  'withheld form'

expect_fail "withheld form with an uppercase prefix is refused" \
  '[{"id":"LL-0000000000","ruleKey":"MINIMIZED-FINDING-ll-0000000000","title":"fixture","severity":"low","status":"open","evidence":{"type":"runtime"}}]' \
  'withheld form'

expect_fail "withheld form with leading whitespace is refused" \
  '[{"id":"LL-0000000000","ruleKey":" minimized-finding-ll-0000000000","title":"fixture","severity":"low","status":"open","evidence":{"type":"runtime"}}]' \
  'withheld form'

expect_fail "withheld form with text between the prefix and the id is refused" \
  '[{"id":"LL-0000000000","ruleKey":"minimized-finding-x-ll-0000000000","title":"fixture","severity":"low","status":"open","evidence":{"type":"runtime"}}]' \
  'withheld form'

expect_fail "withheld form with trailing whitespace on the ruleKey only is refused" \
  '[{"id":"LL-0000000000","ruleKey":"minimized-finding-ll-0000000000 ","title":"fixture","severity":"low","status":"open","evidence":{"type":"runtime"}}]' \
  'withheld form'

expect_fail "withheld form on a non-canonical id is refused" \
  '[{"id":"LL-ABCDEF0123","ruleKey":"minimized-finding-ll-abcdef0123","title":"fixture","severity":"low","status":"open","evidence":{"type":"runtime"}}]' \
  'withheld form'

expect_fail "withheld form on an id with trailing whitespace is refused" \
  '[{"id":"LL-0000000000 ","ruleKey":"minimized-finding-ll-0000000000 ","title":"fixture","severity":"low","status":"open","evidence":{"type":"runtime"}}]' \
  'withheld form'

expect_fail "withheld form on an 11-digit id is refused" \
  '[{"id":"LL-00000000000","ruleKey":"minimized-finding-ll-00000000000","title":"fixture","severity":"low","status":"open","evidence":{"type":"runtime"}}]' \
  'withheld form'

expect_fail "withheld form on an id with a leading character is refused" \
  '[{"id":"xLL-0000000000","ruleKey":"minimized-finding-xll-0000000000","title":"fixture","severity":"low","status":"open","evidence":{"type":"runtime"}}]' \
  'withheld form'

# Ids carrying a newline: a line-anchored id pattern (^...$) would accept each of these.
expect_fail "withheld form on an id with a trailing newline is refused" \
  '[{"id":"LL-0000000000\n","ruleKey":"minimized-finding-ll-0000000000\n","title":"fixture","severity":"low","status":"open","evidence":{"type":"runtime"}}]' \
  'withheld form'

expect_fail "withheld form on an id with a leading line of junk is refused" \
  '[{"id":"junk\nLL-0000000000","ruleKey":"minimized-finding-junk\nll-0000000000","title":"fixture","severity":"low","status":"open","evidence":{"type":"runtime"}}]' \
  'withheld form'

expect_fail "withheld form on an id with an embedded newline is refused" \
  '[{"id":"LL-0000000000\njunk","ruleKey":"minimized-finding-ll-0000000000\njunk","title":"fixture","severity":"low","status":"open","evidence":{"type":"runtime"}}]' \
  'withheld form'

expect_fail "case-twin ids sharing one withheld form are refused" \
  '[{"id":"LL-abcdef0123","ruleKey":"minimized-finding-ll-abcdef0123","title":"fixture","severity":"low","status":"open","evidence":{"type":"runtime"}},{"id":"LL-ABCDEF0123","ruleKey":"minimized-finding-ll-abcdef0123","title":"other","severity":"low","status":"open","evidence":{"type":"runtime"}}]' \
  'withheld form'

# A missing id must be reported as such, not crash the withheld-form rule.
expect_fail "withheld form on a row with no id reports the id, without crashing" \
  '[{"ruleKey":"minimized-finding-ll-0000000000","title":"fixture","severity":"low","status":"open","evidence":{"type":"runtime"}}]' \
  'id must be a non-empty string'

# The form is not used in the Ember upgrade register.
build_register "$TMP/FINDINGS-EMBER.json" \
  '[{"id":"LL-0000000000","ruleKey":"minimized-finding-ll-0000000000","title":"fixture","severity":"low","status":"open","evidence":{"type":"runtime"}}]'
ember_out="$(ruby "$LINT" "$TMP/FINDINGS-EMBER.json" 2>&1)"
if [ $? -eq 0 ]; then fail "withheld form in FINDINGS-EMBER.json is refused (rule did NOT fire)"
elif ! printf '%s' "$ember_out" | grep -qiE 'withheld form'; then
  fail "withheld form in FINDINGS-EMBER.json is refused (failed, but not on the expected rule: $(printf '%s' "$ember_out" | tail -1))"
else pass "withheld form in FINDINGS-EMBER.json is refused"; fi

# ---------------------------------------------------------------------------
# Id integrity in citation-check.rb. citation-check is not a CI job of its own
# (see the comment above the audit-artifacts-integrity job in ci.yml), so its id
# branch is exercised here, against the same kind of temp-dir fixture. Runtime
# evidence keeps each case on the id branch: citation-check SKIPs a runtime row
# after the id check, without calling git. The code-evidence cases carry no sha,
# so citation-check reads the cited path from the working tree (it runs from the
# repo root here); one of them cites a file that does not exist on purpose.
# ---------------------------------------------------------------------------
echo "  -- citation-check id integrity --"

# cc_expect_pass <label> <findings-json>
cc_expect_pass() {
  build_register "$TMP/cc.json" "$2"
  if (cd "$REPO_ROOT" && ruby "$CITATION_CHECK" "$TMP/cc.json") >/dev/null 2>&1; then pass "$1"; else
    fail "$1 (expected clean, got: $(cd "$REPO_ROOT" && ruby "$CITATION_CHECK" "$TMP/cc.json" 2>&1 | grep -E '\[FAIL\]' | head -1))"; fi
}

# cc_expect_fail <label> <findings-json> <must-mention> [meta-json]
cc_expect_fail() {
  build_register "$TMP/cc.json" "$2" "${4:-$DEFAULT_META}"
  local out; out="$(cd "$REPO_ROOT" && ruby "$CITATION_CHECK" "$TMP/cc.json" 2>&1)"
  if [ $? -eq 0 ]; then fail "$1 (check did NOT fire)"; return; fi
  if ! printf '%s' "$out" | grep -qiE "$3"; then
    fail "$1 (failed, but not on the expected check: $(printf '%s' "$out" | grep -E '\[FAIL\]' | head -1))"; return
  fi
  pass "$1"
}

# Control: an ordinary row whose id is derived from its own ruleKey passes.
DERIVED_ID="$(ruby -rdigest -e 'print "LL-" + Digest::SHA256.hexdigest("fixture-rule|fixture-rule")[0, 10]')"
cc_expect_pass "row whose id derives from its ruleKey passes" \
  "[{\"id\":\"$DERIVED_ID\",\"ruleKey\":\"fixture-rule\",\"title\":\"fixture\",\"severity\":\"low\",\"status\":\"open\",\"evidence\":{\"type\":\"runtime\"}}]"

cc_expect_pass "row whose ruleKey is the self-referencing withheld form passes" \
  '[{"id":"LL-0000000000","ruleKey":"minimized-finding-ll-0000000000","title":"fixture","severity":"low","status":"open","evidence":{"type":"runtime"}}]'

cc_expect_fail "withheld form naming a DIFFERENT id is refused" \
  '[{"id":"LL-0000000000","ruleKey":"minimized-finding-ll-0000000001","title":"fixture","severity":"low","status":"open","evidence":{"type":"runtime"}}]' \
  'id mismatch'

cc_expect_fail "ordinary ruleKey with a mismatched id is refused" \
  '[{"id":"LL-0000000000","ruleKey":"fixture-rule","title":"fixture","severity":"low","status":"open","evidence":{"type":"runtime"}}]' \
  'id mismatch'

cc_expect_fail "withheld form with text between the prefix and the id is not exempt" \
  '[{"id":"LL-0000000000","ruleKey":"minimized-finding-x-ll-0000000000","title":"fixture","severity":"low","status":"open","evidence":{"type":"runtime"}}]' \
  'id mismatch'

cc_expect_fail "withheld form on a non-canonical id is not exempt" \
  '[{"id":"LL-ABCDEF0123","ruleKey":"minimized-finding-ll-abcdef0123","title":"fixture","severity":"low","status":"open","evidence":{"type":"runtime"}}]' \
  'id mismatch'

cc_expect_fail "withheld form on an id with trailing whitespace is not exempt" \
  '[{"id":"LL-0000000000 ","ruleKey":"minimized-finding-ll-0000000000 ","title":"fixture","severity":"low","status":"open","evidence":{"type":"runtime"}}]' \
  'id mismatch'

cc_expect_fail "withheld form on an 11-digit id is not exempt" \
  '[{"id":"LL-00000000000","ruleKey":"minimized-finding-ll-00000000000","title":"fixture","severity":"low","status":"open","evidence":{"type":"runtime"}}]' \
  'id mismatch'

cc_expect_fail "withheld form on an id with a leading character is not exempt" \
  '[{"id":"xLL-0000000000","ruleKey":"minimized-finding-xll-0000000000","title":"fixture","severity":"low","status":"open","evidence":{"type":"runtime"}}]' \
  'id mismatch'

cc_expect_fail "withheld form on an id with a trailing newline is not exempt" \
  '[{"id":"LL-0000000000\n","ruleKey":"minimized-finding-ll-0000000000\n","title":"fixture","severity":"low","status":"open","evidence":{"type":"runtime"}}]' \
  'id mismatch'

cc_expect_fail "withheld form on an id with a leading line of junk is not exempt" \
  '[{"id":"junk\nLL-0000000000","ruleKey":"minimized-finding-junk\nll-0000000000","title":"fixture","severity":"low","status":"open","evidence":{"type":"runtime"}}]' \
  'id mismatch'

cc_expect_fail "withheld form on an id with an embedded newline is not exempt" \
  '[{"id":"LL-0000000000\njunk","ruleKey":"minimized-finding-ll-0000000000\njunk","title":"fixture","severity":"low","status":"open","evidence":{"type":"runtime"}}]' \
  'id mismatch'

cc_expect_fail "withheld form with an uppercase prefix is not exempt" \
  '[{"id":"LL-0000000000","ruleKey":"MINIMIZED-FINDING-ll-0000000000","title":"fixture","severity":"low","status":"open","evidence":{"type":"runtime"}}]' \
  'id mismatch'

cc_expect_fail "withheld form with leading whitespace is not exempt" \
  '[{"id":"LL-0000000000","ruleKey":" minimized-finding-ll-0000000000","title":"fixture","severity":"low","status":"open","evidence":{"type":"runtime"}}]' \
  'id mismatch'

cc_expect_fail "withheld form with trailing whitespace is not exempt" \
  '[{"id":"LL-0000000000","ruleKey":"minimized-finding-ll-0000000000 ","title":"fixture","severity":"low","status":"open","evidence":{"type":"runtime"}}]' \
  'id mismatch'

# Only the id recomputation is waived: a withheld-form row with code evidence
# still has to pass every evidence check that follows it.
cc_expect_fail "withheld form still runs the evidence checks" \
  '[{"id":"LL-0000000000","ruleKey":"minimized-finding-ll-0000000000","title":"fixture","severity":"low","status":"open","evidence":{"type":"code","file":"","snippet":""}}]' \
  'missing evidence.file or evidence.snippet'

cc_expect_fail "withheld form still needs its snippet present in the cited file" \
  '[{"id":"LL-0000000000","ruleKey":"minimized-finding-ll-0000000000","title":"fixture","severity":"low","status":"open","evidence":{"type":"code","file":"Gemfile","snippet":"fixture-snippet-absent-0000"}}]' \
  'snippet not present'

cc_expect_fail "withheld form still needs its cited file to exist" \
  '[{"id":"LL-0000000000","ruleKey":"minimized-finding-ll-0000000000","title":"fixture","severity":"low","status":"open","evidence":{"type":"code","file":"fixture-missing-file.rb","snippet":"x"}}]' \
  'file not found'

cc_expect_fail "withheld form still needs its snippet near the cited line" \
  '[{"id":"LL-0000000000","ruleKey":"minimized-finding-ll-0000000000","title":"fixture","severity":"low","status":"open","evidence":{"type":"code","file":"Gemfile","line":9000,"snippet":"source"}}]' \
  'not at cited line'

cc_expect_fail "withheld form still needs evidence.sha when the register is pinned" \
  '[{"id":"LL-0000000000","ruleKey":"minimized-finding-ll-0000000000","title":"fixture","severity":"low","status":"open","evidence":{"type":"code","file":"Gemfile","snippet":"source","sha":""}}]' \
  'empty evidence.sha' \
  '{"schemaVersion":"1.1","auditedSha":"0000000000000000000000000000000000000000"}'

cc_expect_pass "withheld form with a present snippet passes" \
  '[{"id":"LL-0000000000","ruleKey":"minimized-finding-ll-0000000000","title":"fixture","severity":"low","status":"open","evidence":{"type":"code","file":"Gemfile","snippet":"source"}}]'

# The committed registers must satisfy the contract they are gated by.
for reg in "$REPO_ROOT/audit-reports/FINDINGS.json" "$REPO_ROOT/audit-reports/ember-upgrade/FINDINGS-EMBER.json"; do
  if ruby "$LINT" "$reg" >/dev/null 2>&1; then pass "committed register is clean: $(basename "$reg")"
  else fail "committed register FAILS the contract: $(basename "$reg")"; fi
done

if [ "$fails" -ne 0 ]; then printf '\nregister-lint-shape-test: %d failure(s)\n' "$fails"; exit 1; fi
printf '\nregister-lint-shape-test: all branches behaved\n'
