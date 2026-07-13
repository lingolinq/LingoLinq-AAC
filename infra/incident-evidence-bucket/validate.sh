#!/usr/bin/env bash
# Validate that an incident-evidence bucket is configured per the breach runbook.
# Read-mostly: it asserts config and (optionally) attempts a delete that MUST fail.
# Run against the THROWAWAY test bucket first. Safe to run against the real bucket
# too (the delete probe is locked out by design), but the upload probe writes an
# object, so only pass --probe-write against the TEST bucket.
#
# Usage:
#   ./validate.sh <bucket-name> [--probe-write]
#
# Requires: awscli v2, jq. Uses whatever AWS credentials are in the environment.
set -euo pipefail

BUCKET="${1:?usage: validate.sh <bucket-name> [--probe-write]}"
PROBE_WRITE="${2:-}"
fail=0

check() { # description, condition-already-evaluated ("ok"/"bad"), detail
  if [ "$2" = "ok" ]; then printf '  [PASS] %s\n' "$1"
  else printf '  [FAIL] %s -- %s\n' "$1" "$3"; fail=1; fi
}

echo "Validating s3://$BUCKET"

# 1. Object Lock enabled + COMPLIANCE/years
olc=$(aws s3api get-object-lock-configuration --bucket "$BUCKET" 2>/dev/null || echo '{}')
mode=$(echo "$olc" | jq -r '.ObjectLockConfiguration.Rule.DefaultRetention.Mode // "NONE"')
yrs=$(echo "$olc" | jq -r '.ObjectLockConfiguration.Rule.DefaultRetention.Years // "0"')
[ "$mode" != "NONE" ] && check "Object Lock enabled (mode=$mode, years=$yrs)" ok || check "Object Lock enabled" bad "no lock configuration"

# 2. Versioning on
ver=$(aws s3api get-bucket-versioning --bucket "$BUCKET" --query Status --output text 2>/dev/null || echo "None")
[ "$ver" = "Enabled" ] && check "Versioning enabled" ok || check "Versioning enabled" bad "status=$ver"

# 3. Public access fully blocked
pab=$(aws s3api get-public-access-block --bucket "$BUCKET" 2>/dev/null \
  | jq -r '.PublicAccessBlockConfiguration | [.BlockPublicAcls,.IgnorePublicAcls,.BlockPublicPolicy,.RestrictPublicBuckets] | all' 2>/dev/null || echo "false")
[ "$pab" = "true" ] && check "All public access blocked" ok || check "All public access blocked" bad "one or more flags false"

# 4. Default encryption present
enc=$(aws s3api get-bucket-encryption --bucket "$BUCKET" \
  --query 'ServerSideEncryptionConfiguration.Rules[0].ApplyServerSideEncryptionByDefault.SSEAlgorithm' \
  --output text 2>/dev/null || echo "NONE")
[ "$enc" != "NONE" ] && check "Default encryption ($enc)" ok || check "Default encryption" bad "none configured"

# 5. TLS-only + restricted-write policy present
pol=$(aws s3api get-bucket-policy --bucket "$BUCKET" --query Policy --output text 2>/dev/null || echo "{}")
echo "$pol" | grep -q "DenyInsecureTransport" && check "TLS-only deny statement present" ok || check "TLS-only deny statement present" bad "missing"
echo "$pol" | grep -q "DenyWriteFromOthers"   && check "Restricted-write deny statement present" ok || check "Restricted-write deny statement present" bad "missing"

# 6. (TEST ONLY) write + delete probe: write should succeed; delete should be locked out.
if [ "$PROBE_WRITE" = "--probe-write" ]; then
  key="validation-probe-$(date +%s).txt"
  echo "probe" > "/tmp/$key"
  if aws s3api put-object --bucket "$BUCKET" --key "$key" --body "/tmp/$key" >/dev/null 2>&1; then
    check "Probe upload succeeded" ok
    vid=$(aws s3api list-object-versions --bucket "$BUCKET" --prefix "$key" --query 'Versions[0].VersionId' --output text)
    if aws s3api delete-object --bucket "$BUCKET" --key "$key" --version-id "$vid" >/dev/null 2>&1; then
      check "Locked object delete refused" bad "delete SUCCEEDED -- lock is NOT protecting objects"
    else
      check "Locked object delete refused" ok
    fi
  else
    check "Probe upload succeeded" bad "upload denied (check write_principal_arns)"
  fi
  rm -f "/tmp/$key"
fi

echo
if [ "$fail" = "0" ]; then echo "RESULT: all checks passed."; else echo "RESULT: one or more checks FAILED."; exit 1; fi
