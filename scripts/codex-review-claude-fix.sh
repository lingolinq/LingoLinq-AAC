#!/usr/bin/env bash
#
# codex-review-claude-fix.sh — headless Claude Code fix pass for claude-fix.yml.
#
# Runs `claude -p` (non-interactive print mode) against the findings JSON from
# a REQUEST_CHANGES codex-review verdict. Per the build spec (section 4):
# address ONLY the listed findings, no scope creep, no unrelated refactors; a
# disputed finding must be marked disputed with reasoning, never silently
# skipped.
#
# USAGE
#   scripts/codex-review-claude-fix.sh <findings-json-file> <loop_n>
#
# ENV
#   ANTHROPIC_API_KEY   required (job-scoped secret; see claude-fix.yml)
#
set -euo pipefail

FINDINGS_FILE="${1:?usage: $0 <findings-json-file> <loop_n>}"
LOOP_N="${2:?usage: $0 <findings-json-file> <loop_n>}"

: "${ANTHROPIC_API_KEY:?ANTHROPIC_API_KEY must be set}"

PROMPT_FILE="$(mktemp)"
{
  echo "You are fixing findings from an automated code review (loop ${LOOP_N})."
  echo "Address ONLY the findings listed below. No scope creep, no unrelated"
  echo "refactors, no drive-by cleanups."
  echo ""
  echo "If you disagree with a finding, do NOT silently skip it: leave the code"
  echo "unchanged for that finding and note it as disputed, with your reasoning,"
  echo "in your final summary. A disputed finding forces NEEDS_HUMAN on the next"
  echo "review pass rather than looping silently."
  echo ""
  echo "Findings (JSON):"
  cat "$FINDINGS_FILE"
} > "$PROMPT_FILE"

claude -p \
  --bare \
  --dangerously-skip-permissions \
  --allowedTools "Read,Edit,Write,Bash(bundle exec rspec*),Bash(ruby scripts/*),Bash(git *)" \
  --output-format json \
  < "$PROMPT_FILE" > /tmp/claude-fix-result.json

rm -f "$PROMPT_FILE"
