#!/usr/bin/env bash
#
# legal-naming-check-test.sh - proves scripts/legal-naming-check.rb actually FIRES.
#
# WHY THIS EXISTS
#   A guard that has only ever been observed passing on clean data is not evidence that
#   it works; it is evidence that the data is clean. Every check in legal-naming-check.rb
#   is asserted here against a fixture that violates it, and against one that does not, so
#   a future refactor that quietly neuters a rule goes red instead of green.
#
#   This harness NEVER touches audit-reports/DOCUMENT-REGISTER.json. It builds fixtures in
#   a temp dir and points the checker at them with --register. That is the whole reason
#   that flag exists.
#
# Usage: scripts/tests/legal-naming-check-test.sh
# Exit codes: 0 = all guards fired; 1 = a guard failed to fire, or fired when it should not.

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CHECK="$REPO_ROOT/scripts/legal-naming-check.rb"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

fails=0
pass() { printf '  ok   %s\n' "$1"; }
fail() { printf '  FAIL %s\n' "$1"; fails=$((fails + 1)); }

# build_register <output-path> <documents-json> [extra-grandfathered-json]
build_register() {
  local out="$1" docs="$2" grand="${3:-[]}"
  cat > "$out" <<JSON
{
  "meta": {
    "statusEnum": ["draft", "approved", "published", "superseded", "archived"],
    "legalNamingGrandfathered": $grand
  },
  "documents": $docs
}
JSON
}

# expect_fail <name> <register> <substring>
expect_fail() {
  local name="$1" reg="$2" needle="$3" out
  out="$(ruby "$CHECK" --register "$reg" --check 2>&1)"
  if [ $? -eq 0 ]; then
    fail "$name (checker exited 0; it should have refused)"
  elif ! printf '%s' "$out" | grep -qi -- "$needle"; then
    fail "$name (refused, but not for the expected reason; wanted /$needle/)"
    printf '%s\n' "$out" | sed 's/^/         /' | head -5
  else
    pass "$name"
  fi
}

# expect_pass <name> <register>
expect_pass() {
  local name="$1" reg="$2" out
  out="$(ruby "$CHECK" --register "$reg" --check 2>&1)"
  if [ $? -ne 0 ]; then
    fail "$name (checker refused clean data)"
    printf '%s\n' "$out" | sed 's/^/         /' | head -5
  else
    pass "$name"
  fi
}

echo "legal-naming-check-test: CHECK 1, attested records carry no status token"

build_register "$TMP/c1-bad.json" '[
  {"id":"DOC-a","title":"Attested draft path","canonicalSystem":"git",
   "canonicalLocation":"docs/legal/2026-08-12_thing_draft.md","status":"approved",
   "attestation":{"attestedBy":"Scot","attestedDate":"2026-08-12","attestedContentHash":"x"}}
]'
expect_fail "attested record at a _draft path is refused" "$TMP/c1-bad.json" "status component"

build_register "$TMP/c1-ok.json" '[
  {"id":"DOC-a","title":"Unattested draft path","canonicalSystem":"git",
   "canonicalLocation":"docs/legal/2026-08-12_thing_draft.md","status":"draft","attestation":{}}
]'
expect_pass "UNattested record at a _draft path is allowed" "$TMP/c1-ok.json"

# The exemption must expire on attestation with no list edit. Same path, attestation added.
build_register "$TMP/c1-expire.json" '[
  {"id":"DOC-a","title":"Grandfathered draft, now signed","canonicalSystem":"git",
   "canonicalLocation":"docs/legal/2026-08-09_data-retention_draft.md","status":"approved",
   "attestation":{"attestedBy":"Scot","attestedDate":"2026-08-09","attestedContentHash":"x"}}
]'
expect_fail "grandfathered _draft exemption expires automatically on attestation" \
  "$TMP/c1-expire.json" "status component"

# The four cases below all slipped an earlier suffix-blacklist version of CHECK 1.
# They are kept as permanent regression guards so a future "simplification" back to a
# blacklist cannot quietly reopen them.

build_register "$TMP/c1-upper.json" '[
  {"id":"DOC-a","title":"Uppercase token","canonicalSystem":"git",
   "canonicalLocation":"docs/legal/2026-08-12_thing_DRAFT.md","status":"approved",
   "attestation":{"attestedBy":"Scot","attestedDate":"2026-08-12","attestedContentHash":"x"}}
]'
expect_fail "UPPERCASE status token is refused (case-insensitive)" "$TMP/c1-upper.json" "status component"

build_register "$TMP/c1-mid.json" '[
  {"id":"DOC-a","title":"Token mid-slug","canonicalSystem":"git",
   "canonicalLocation":"docs/legal/2026-08-12_draft_thing.md","status":"approved",
   "attestation":{"attestedBy":"Scot","attestedDate":"2026-08-12","attestedContentHash":"x"}}
]'
expect_fail "status token NOT in final position is refused" "$TMP/c1-mid.json" "status component"

build_register "$TMP/c1-case.json" '[
  {"id":"DOC-a","title":"TitleCase slug","canonicalSystem":"git",
   "canonicalLocation":"docs/legal/2026-08-12_Thing-Name.md","status":"approved",
   "attestation":{"attestedBy":"Scot","attestedDate":"2026-08-12","attestedContentHash":"x"}}
]'
expect_fail "non-kebab-case slug is refused even with no status token" \
  "$TMP/c1-case.json" "not\\s*kebab-case"

# Worst row to skip: malformed AND signed. attested? must be the UNION of the fields.
build_register "$TMP/c1-nodate.json" '[
  {"id":"DOC-a","title":"Signed but undated","canonicalSystem":"git",
   "canonicalLocation":"docs/legal/2026-08-12_thing_draft.md","status":"approved",
   "attestation":{"attestedBy":"Scot","attestedContentHash":"x"}}
]'
expect_fail "attestation with no attestedDate still counts as attested" \
  "$TMP/c1-nodate.json" "status component"

build_register "$TMP/c1-good.json" '[
  {"id":"DOC-a","title":"Legitimate","canonicalSystem":"git",
   "canonicalLocation":"docs/legal/2026-08-12_aws-baa-acceptance-record.md","status":"approved",
   "attestation":{"attestedBy":"Scot","attestedDate":"2026-08-12","attestedContentHash":"x"}}
]'
expect_pass "a legitimate attested kebab-case record is allowed" "$TMP/c1-good.json"

# HYPHEN-DELIMITED STATUS TOKENS.
#
# These are valid kebab-case, so an earlier version that folded the status rule into the
# kebab-case test passed every one of them and never consulted the status rule at all.
# Found in independent review. The status check is now independent of kebab-case and splits
# on BOTH separators, so each separator/position variant below is asserted explicitly.
for variant in thing-draft thing-approved draft-thing thing-published thing-superseded \
               thing-archived thing_draft THING-DRAFT; do
  build_register "$TMP/c1a-$variant.json" '[
    {"id":"DOC-a","title":"Hyphen token","canonicalSystem":"git",
     "canonicalLocation":"docs/legal/2026-08-13_'"$variant"'.md","status":"approved",
     "attestation":{"attestedBy":"Scot","attestedDate":"2026-08-13","attestedContentHash":"x"}}
  ]'
  expect_fail "status component in '$variant' is refused" "$TMP/c1a-$variant.json" "status component"
done

# An UNattested record with a hyphen token is still allowed, same as the underscore form:
# the rule engages at attestation, not before.
build_register "$TMP/c1a-unattested.json" '[
  {"id":"DOC-a","title":"Unattested hyphen token","canonicalSystem":"git",
   "canonicalLocation":"docs/legal/2026-08-13_thing-draft.md","status":"draft","attestation":{}}
]'
expect_pass "UNattested record with a hyphen status token is allowed" "$TMP/c1a-unattested.json"

echo "legal-naming-check-test: CHECK 2, a signature cannot predate its record"

build_register "$TMP/c2-bad.json" '[
  {"id":"DOC-a","title":"Backdated signature","canonicalSystem":"git",
   "canonicalLocation":"docs/legal/2026-08-12_thing.md","status":"approved",
   "attestation":{"attestedBy":"Scot","attestedDate":"2026-08-11","attestedContentHash":"x"}}
]'
expect_fail "attestedDate earlier than the filename date is refused" "$TMP/c2-bad.json" "cannot predate"

build_register "$TMP/c2-ok.json" '[
  {"id":"DOC-a","title":"Signed the next day","canonicalSystem":"git",
   "canonicalLocation":"docs/legal/2026-08-11_thing.md","status":"approved",
   "attestation":{"attestedBy":"Scot","attestedDate":"2026-08-12","attestedContentHash":"x"}}
]'
expect_pass "attestedDate LATER than the filename date is allowed" "$TMP/c2-ok.json"

echo "legal-naming-check-test: CHECK 3, a successor is not dated before its predecessor"

build_register "$TMP/c3-bad.json" '[
  {"id":"DOC-p","title":"Predecessor","canonicalSystem":"git",
   "canonicalLocation":"docs/legal/2026-08-12_thing.md","status":"superseded",
   "attestation":{},"supersededBy":"DOC-s"},
  {"id":"DOC-s","title":"Backdated successor","canonicalSystem":"git",
   "canonicalLocation":"docs/legal/2026-08-10_thing.md","status":"approved",
   "attestation":{},"supersedes":"DOC-p"}
]'
expect_fail "successor dated before the record it supersedes is refused" \
  "$TMP/c3-bad.json" "cannot be dated before"

build_register "$TMP/c3-ok.json" '[
  {"id":"DOC-p","title":"Predecessor","canonicalSystem":"git",
   "canonicalLocation":"docs/legal/2026-08-11_thing.md","status":"superseded",
   "attestation":{},"supersededBy":"DOC-s"},
  {"id":"DOC-s","title":"Successor","canonicalSystem":"git",
   "canonicalLocation":"docs/legal/2026-08-12_thing.md","status":"approved",
   "attestation":{},"supersedes":"DOC-p"}
]'
expect_pass "successor dated after its predecessor is allowed" "$TMP/c3-ok.json"

echo "legal-naming-check-test: CHECK 4, new non-dated records barred, existing grandfathered"

build_register "$TMP/c4-bad.json" '[
  {"id":"DOC-a","title":"New SCREAMING_SNAKE","canonicalSystem":"git",
   "canonicalLocation":"docs/legal/BRAND_NEW_POLICY.md","status":"draft","attestation":{}}
]'
expect_fail "new non-dated record is refused" "$TMP/c4-bad.json" "NEW non-dated"

build_register "$TMP/c4-ok.json" '[
  {"id":"DOC-a","title":"Grandfathered","canonicalSystem":"git",
   "canonicalLocation":"docs/legal/BRAND_NEW_POLICY.md","status":"draft","attestation":{}}
]' '["docs/legal/BRAND_NEW_POLICY.md"]'
expect_pass "listed grandfathered record is allowed" "$TMP/c4-ok.json"

build_register "$TMP/c4-stale.json" '[
  {"id":"DOC-a","title":"Dated","canonicalSystem":"git",
   "canonicalLocation":"docs/legal/2026-08-12_thing.md","status":"draft","attestation":{}}
]' '["docs/legal/GONE.md"]'
expect_fail "stale grandfather entry is refused so the list can only shrink" \
  "$TMP/c4-stale.json" "no longer a git-canonical"

echo "legal-naming-check-test: CHECK 5 and scoping"

build_register "$TMP/c5-bad.json" '[
  {"id":"DOC-a","title":"Impossible date","canonicalSystem":"git",
   "canonicalLocation":"docs/legal/2026-13-45_thing.md","status":"draft","attestation":{}}
]'
expect_fail "filename with an impossible date is refused" "$TMP/c5-bad.json" "not a\\s*valid ISO date"

build_register "$TMP/scope.json" '[
  {"id":"DOC-a","title":"Drive doc","canonicalSystem":"drive",
   "canonicalLocation":"https://docs.google.com/document/d/abc/edit","status":"published","attestation":{}},
  {"id":"DOC-b","title":"Outside docs/legal","canonicalSystem":"git",
   "canonicalLocation":"audit-reports/SOMETHING.md","status":"draft","attestation":{}}
]'
expect_pass "non-git and non-docs/legal rows are out of scope" "$TMP/scope.json"

echo "legal-naming-check-test: schema drift guard"

cat > "$TMP/enum.json" <<'JSON'
{
  "meta": {
    "statusEnum": ["draft", "approved", "published", "superseded", "archived", "retired"],
    "legalNamingGrandfathered": []
  },
  "documents": []
}
JSON
expect_fail "a new statusEnum value the token list does not cover is refused" \
  "$TMP/enum.json" "STATUS_WORDS does not cover"

echo "legal-naming-check-test: CHECK 6, wrong-cased docs/legal paths"

build_register "$TMP/c6.json" '[
  {"id":"DOC-a","title":"Wrong case","canonicalSystem":"git",
   "canonicalLocation":"docs/Legal/2026-08-13_thing_draft.md","status":"approved",
   "attestation":{"attestedBy":"Scot","attestedDate":"2026-08-13","attestedContentHash":"x"}}
]'
# Regression guard: this path previously fell OUT of scope entirely and the checker exited 0
# reporting "0 docs/legal rows", so capitalising a directory name stepped around the whole gate.
expect_fail "docs/Legal wrong-case path is in scope and refused" "$TMP/c6.json" "differs in case"

echo "legal-naming-check-test: CHECK 7, the allowlist cannot launder a new record"

# These need real git history, because the baseline is deliberately NOT an in-repo file that
# the same change could edit. Build a throwaway repo with a base commit.
GITFX="$TMP/gitfx"
mkdir -p "$GITFX/audit-reports"
(
  cd "$GITFX" || exit 1
  git init -q .
  cat > audit-reports/DOCUMENT-REGISTER.json <<'JSON'
{"meta":{"statusEnum":["draft","approved","published","superseded","archived"],
 "legalNamingGrandfathered":["docs/legal/LEGACY.md"]},
 "documents":[{"id":"D1","title":"Legacy","canonicalSystem":"git",
  "canonicalLocation":"docs/legal/LEGACY.md","status":"draft","attestation":{}}]}
JSON
  git add -A
  git -c user.email=t@example.invalid -c user.name=test commit -qm base
  git branch -f base HEAD
) || fail "could not build the git fixture"

# expect_fail_git <name> <needle>   (register is always $GITFX's working copy)
expect_fail_git() {
  local name="$1" needle="$2" out
  out="$(ruby "$CHECK" --register "$GITFX/audit-reports/DOCUMENT-REGISTER.json" \
         --base-ref base --repo-root "$GITFX" --check 2>&1)"
  if [ $? -eq 0 ]; then
    fail "$name (checker exited 0; it should have refused)"
  elif ! printf '%s' "$out" | grep -qi -- "$needle"; then
    fail "$name (refused, but not for the expected reason; wanted /$needle/)"
  else
    pass "$name"
  fi
}

# The bypass found in independent review: add a new non-dated row AND allowlist it, same change.
cat > "$GITFX/audit-reports/DOCUMENT-REGISTER.json" <<'JSON'
{"meta":{"statusEnum":["draft","approved","published","superseded","archived"],
 "legalNamingGrandfathered":["docs/legal/LEGACY.md","docs/legal/BRAND_NEW.md"]},
 "documents":[{"id":"D1","title":"Legacy","canonicalSystem":"git",
  "canonicalLocation":"docs/legal/LEGACY.md","status":"draft","attestation":{}},
              {"id":"D2","title":"Laundered","canonicalSystem":"git",
  "canonicalLocation":"docs/legal/BRAND_NEW.md","status":"draft","attestation":{}}]}
JSON
expect_fail_git "a new non-dated row allowlisted in the SAME change is refused" "was NOT a non-dated"

# Adding a properly dated record alongside an unchanged allowlist must still pass.
cat > "$GITFX/audit-reports/DOCUMENT-REGISTER.json" <<'JSON'
{"meta":{"statusEnum":["draft","approved","published","superseded","archived"],
 "legalNamingGrandfathered":["docs/legal/LEGACY.md"]},
 "documents":[{"id":"D1","title":"Legacy","canonicalSystem":"git",
  "canonicalLocation":"docs/legal/LEGACY.md","status":"draft","attestation":{}},
              {"id":"D2","title":"New dated","canonicalSystem":"git",
  "canonicalLocation":"docs/legal/2026-08-13_new-thing.md","status":"draft","attestation":{}}]}
JSON
out="$(ruby "$CHECK" --register "$GITFX/audit-reports/DOCUMENT-REGISTER.json" \
       --base-ref base --repo-root "$GITFX" --check 2>&1)"
if [ $? -eq 0 ]; then
  pass "adding a properly DATED new record is still allowed"
else
  fail "adding a properly DATED new record is still allowed (wrongly refused)"
  printf '%s\n' "$out" | sed 's/^/         /' | head -3
fi

# Unverifiable baseline must REFUSE, not skip.
out="$(ruby "$CHECK" --register "$GITFX/audit-reports/DOCUMENT-REGISTER.json" \
       --base-ref no-such-ref --repo-root "$GITFX" --check 2>&1)"
if [ $? -ne 0 ] && printf '%s' "$out" | grep -qi "cannot be verified as\|cannot read"; then
  pass "an unreadable base revision refuses rather than skipping"
else
  fail "an unreadable base revision refuses rather than skipping"
fi

echo "legal-naming-check-test: the live register still passes"
expect_pass "live DOCUMENT-REGISTER.json passes" "$REPO_ROOT/audit-reports/DOCUMENT-REGISTER.json"

echo
if [ "$fails" -eq 0 ]; then
  echo "legal-naming-check-test: OK (all guards fired)"
  exit 0
fi
echo "legal-naming-check-test: $fails GUARD(S) FAILED"
exit 1
