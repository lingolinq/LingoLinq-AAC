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
#   ANTHROPIC_API_KEY   required (step-scoped secret; see codex-review.yml)
#
set -euo pipefail

PROMPT_FILE="${1:?usage: $0 <prompt-file> <schema-file> <output-file>}"
SCHEMA_FILE="${2:?usage: $0 <prompt-file> <schema-file> <output-file>}"
OUTPUT_FILE="${3:?usage: $0 <prompt-file> <schema-file> <output-file>}"

: "${ANTHROPIC_API_KEY:?ANTHROPIC_API_KEY must be set}"

# Helpers are run from this script's own (trusted) directory with `python3 -I`, never by a path
# relative to the working directory.
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

RESPONSE_FILE="$(mktemp)"
trap 'rm -f "$RESPONSE_FILE"' EXIT

# The key goes to curl as a header file on a pipe, not on its command line, where any process on
# the runner could read it.
curl -sS https://api.anthropic.com/v1/messages \
  -H @<(printf 'x-api-key: %s\n' "$ANTHROPIC_API_KEY") \
  -H "anthropic-version: 2023-06-01" \
  -H "content-type: application/json" \
  -d @<(python3 -I "$HERE/codex-review-claude-deep-build-request.py" "$PROMPT_FILE" "$SCHEMA_FILE") \
  -o "$RESPONSE_FILE"

python3 -I "$HERE/codex-review-claude-deep-extract-response.py" "$RESPONSE_FILE" "$OUTPUT_FILE"
