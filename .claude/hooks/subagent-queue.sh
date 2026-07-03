#!/usr/bin/env bash
# subagent-queue.sh
#
# Stop / SubagentStop hook: surfaces the next unchecked item in
# .claude/plan-queue.md as a non-blocking systemMessage, so the compliance-
# sprint plan queue (Plan C -> D -> F -> B -> A -> E) stays visible in the
# transcript after each turn/subagent without forcing another loop. Purely
# informational: exit 0 with `systemMessage` and no `decision` field allows
# the stop to proceed normally (Claude Code Stop/SubagentStop hook contract).
#
# Read-only: never edits plan-queue.md itself. Checking an item off (`- [ ]`
# -> `- [x]`) is a deliberate edit made elsewhere, not by this hook.

QUEUE_FILE="${CLAUDE_PROJECT_DIR:-.}/.claude/plan-queue.md"

[ -f "$QUEUE_FILE" ] || exit 0

next_item=$(grep -m1 '^- \[ \]' "$QUEUE_FILE")

[ -n "$next_item" ] || exit 0

# No jq dependency assumed (matches this repo's other hooks' no-gems stance) -
# hand-escape backslashes and quotes for the JSON string.
escaped=$(printf '%s' "$next_item" | sed 's/\\/\\\\/g; s/"/\\"/g')
printf '{"systemMessage": "Next in plan-queue.md: %s"}\n' "$escaped"
exit 0
