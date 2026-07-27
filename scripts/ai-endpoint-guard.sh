#!/usr/bin/env bash
# ai-endpoint-guard.sh
#
# CI guard: every runtime AI (Tier 1) seam must egress to Claude via AWS Bedrock
# (the AiClient / BedrockMantleClient path), never the direct api.anthropic.com
# endpoint. Bedrock keeps inference inside AWS's HIPAA-eligible service boundary,
# covered by the AWS account BAA (docs/legal/AWS_BAA_ACCEPTED.md); the direct
# endpoint is a separate third-party egress with its own BAA and is intentionally
# not constructed at runtime.
#
# Fails (exit 1) if a runtime seam:
#   1. constructs a direct Anthropic client (Anthropic::Client.new), or
#   2. reads the direct-endpoint credential ENV['ANTHROPIC_API_KEY'], or
#   3. AiClient stops building the Bedrock Mantle client.
#
# Runs read-only greps; no network, no mutation.
set -euo pipefail

cd "$(dirname "$0")/.."

# Runtime AI seams (Tier 1 -- may process student/patient data). AiClient is the
# single sanctioned construction point and builds a BedrockMantleClient.
SEAMS=(
  lib/ai_word_predictor.rb
  lib/ai_prediction_generator.rb
  lib/ai_board_generator.rb
  lib/eval_narrator.rb
)

status=0

# 1. No direct Anthropic client construction on the runtime seams.
for f in "${SEAMS[@]}"; do
  if [[ ! -f "$f" ]]; then
    echo "FAIL: expected runtime AI seam $f is missing"
    status=1
    continue
  fi
  if grep -nE '(::)?Anthropic::Client\.new' "$f" >/dev/null 2>&1; then
    echo "FAIL: $f constructs a direct Anthropic::Client -- use AiClient.build (Bedrock)"
    grep -nE '(::)?Anthropic::Client\.new' "$f"
    status=1
  fi
done

# 2. No runtime seam reads the direct-endpoint credential ANTHROPIC_API_KEY.
#    (A comment mentioning the name is fine; an actual ENV read is not.)
for f in "${SEAMS[@]}"; do
  [[ -f "$f" ]] || continue
  if grep -nE "ENV\[['\"]ANTHROPIC_API_KEY['\"]\]|ENV\.fetch\(['\"]ANTHROPIC_API_KEY['\"]" "$f" >/dev/null 2>&1; then
    echo "FAIL: $f reads ENV['ANTHROPIC_API_KEY'] -- runtime AI must route via Bedrock (AiClient)"
    grep -nE "ENV\[['\"]ANTHROPIC_API_KEY['\"]\]" "$f"
    status=1
  fi
done

# 3. AiClient must build the Bedrock Mantle client and never a direct client.
if [[ ! -f lib/ai_client.rb ]]; then
  echo "FAIL: lib/ai_client.rb is missing (the sanctioned Bedrock construction point)"
  status=1
else
  if ! grep -nE 'Anthropic::BedrockMantleClient\.new' lib/ai_client.rb >/dev/null 2>&1; then
    echo "FAIL: lib/ai_client.rb does not construct Anthropic::BedrockMantleClient"
    status=1
  fi
  if grep -nE '(::)?Anthropic::Client\.new' lib/ai_client.rb >/dev/null 2>&1; then
    echo "FAIL: lib/ai_client.rb constructs a direct Anthropic::Client"
    status=1
  fi
fi

if [[ $status -eq 0 ]]; then
  echo "OK: all runtime AI seams route via AWS Bedrock (AiClient); no direct api.anthropic.com construction."
fi
exit $status
