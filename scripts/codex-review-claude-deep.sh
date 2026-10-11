#!/usr/bin/env bash
#
# codex-review-claude-deep.sh — Tier 2 "claude-deep" reviewer route.
#
# Used by codex-review.yml when CODEX_COMPLIANCE_PATHS=block routes a
# compliance-path PR (docs/legal/**, audit-reports/**) off the consumer
# OpenAI endpoint. Calls the SAME Claude Sonnet 4.6 API path the existing
# pr-review-bot's "Claude Senior-Dev Review" node already uses (n8n
# lbyA52atQjQ8MCqy), with the IDENTICAL prompt and output contract as the
# codex route, so the pipeline shape does not change (build spec section 5).
#
# USAGE
#   scripts/codex-review-claude-deep.sh <prompt-file> <schema-file> <output-file>
#
# ENV
#   ANTHROPIC_API_KEY   required (job-scoped secret; see codex-review.yml)
#
set -euo pipefail

PROMPT_FILE="${1:?usage: $0 <prompt-file> <schema-file> <output-file>}"
SCHEMA_FILE="${2:?usage: $0 <prompt-file> <schema-file> <output-file>}"
OUTPUT_FILE="${3:?usage: $0 <prompt-file> <schema-file> <output-file>}"

: "${ANTHROPIC_API_KEY:?ANTHROPIC_API_KEY must be set}"

RESPONSE_FILE="$(mktemp)"

curl -sS https://api.anthropic.com/v1/messages \
  -H "x-api-key: ${ANTHROPIC_API_KEY}" \
  -H "anthropic-version: 2023-06-01" \
  -H "content-type: application/json" \
  -d @<(python3 scripts/codex-review-claude-deep-build-request.py "$PROMPT_FILE" "$SCHEMA_FILE") \
  -o "$RESPONSE_FILE"

python3 scripts/codex-review-claude-deep-extract-response.py "$RESPONSE_FILE" "$OUTPUT_FILE"
