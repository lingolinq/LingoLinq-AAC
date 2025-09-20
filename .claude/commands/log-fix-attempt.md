# Log Fix Attempt Command

Records a fix attempt in the history to prevent future loops.

## Usage

```bash
claude -c log-fix-attempt --error-pattern=obf_gem_failure --fix-type=conditional_loading --result=failed --commit=abc123
```

## Parameters

- `--error-pattern`: The error pattern being addressed
- `--fix-type`: The type of fix attempted
- `--result`: Result of the fix (success|failed|partial)
- `--commit`: Git commit hash of the fix
- `--description`: Optional description of what was changed

## Process

```bash
# Parse arguments
ERROR_PATTERN=$(echo "$ARGUMENTS" | grep -o 'error-pattern=[^ ]*' | cut -d= -f2)
FIX_TYPE=$(echo "$ARGUMENTS" | grep -o 'fix-type=[^ ]*' | cut -d= -f2)
RESULT=$(echo "$ARGUMENTS" | grep -o 'result=[^ ]*' | cut -d= -f2)
COMMIT=$(echo "$ARGUMENTS" | grep -o 'commit=[^ ]*' | cut -d= -f2)
DESCRIPTION=$(echo "$ARGUMENTS" | grep -o 'description=[^"]*' | cut -d= -f2)

echo "📝 Logging fix attempt..."
echo "  Pattern: $ERROR_PATTERN"
echo "  Fix Type: $FIX_TYPE"
echo "  Result: $RESULT"
echo "  Commit: $COMMIT"

# Load current history
CURRENT_HISTORY=$(cat .claude/state/fix-history.json)

# Get next fix ID
NEXT_ID=$(echo "$CURRENT_HISTORY" | jq '.next_fix_id')

# Create new fix entry
NEW_FIX=$(cat << EOF
{
  "id": $NEXT_ID,
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "error_pattern": "$ERROR_PATTERN",
  "fix_type": "$FIX_TYPE",
  "result": "$RESULT",
  "commit": "$COMMIT",
  "description": "$DESCRIPTION",
  "iteration": $(cat .claude/state/deployment-status.json 2>/dev/null | jq '.iteration // 1')
}
EOF
)

# Update fix history
echo "$CURRENT_HISTORY" | \
  jq --argjson fix "$NEW_FIX" \
  '.fixes_attempted += [$fix] | .next_fix_id += 1' > .claude/state/fix-history.json.tmp && \
  mv .claude/state/fix-history.json.tmp .claude/state/fix-history.json

# Update pattern-specific tracking based on result
case "$RESULT" in
  "success")
    echo "✅ Recording successful pattern..."
    echo "$CURRENT_HISTORY" | \
      jq --argjson fix "$NEW_FIX" \
      '.successful_patterns += [$fix]' > .claude/state/fix-history.json.tmp && \
      mv .claude/state/fix-history.json.tmp .claude/state/fix-history.json
    ;;
  "failed")
    echo "❌ Recording failed pattern..."

    # Check if this fix type has failed multiple times for this pattern
    FAILURE_COUNT=$(cat .claude/state/fix-history.json | \
      jq --arg pattern "$ERROR_PATTERN" --arg fix "$FIX_TYPE" \
      '[.fixes_attempted[] | select(.error_pattern == $pattern and .fix_type == $fix and .result == "failed")] | length')

    echo "Failure count for this fix type: $FAILURE_COUNT"

    # Blacklist after 2 failures
    if [ "$FAILURE_COUNT" -ge 2 ]; then
      echo "🚫 Blacklisting fix type after $FAILURE_COUNT failures..."
      echo "$CURRENT_HISTORY" | \
        jq --argjson fix "$NEW_FIX" \
        '.blacklisted_approaches += [$fix] | .failed_patterns += [$fix]' > .claude/state/fix-history.json.tmp && \
        mv .claude/state/fix-history.json.tmp .claude/state/fix-history.json
    else
      echo "$CURRENT_HISTORY" | \
        jq --argjson fix "$NEW_FIX" \
        '.failed_patterns += [$fix]' > .claude/state/fix-history.json.tmp && \
        mv .claude/state/fix-history.json.tmp .claude/state/fix-history.json
    fi
    ;;
  "partial")
    echo "⚠️ Recording partial success..."
    # Partial successes don't get blacklisted but are tracked
    ;;
esac

echo "📊 Fix logged successfully"

# Show current statistics
echo ""
echo "=== FIX HISTORY SUMMARY ==="
echo "Total attempts: $(cat .claude/state/fix-history.json | jq '.fixes_attempted | length')"
echo "Successful patterns: $(cat .claude/state/fix-history.json | jq '.successful_patterns | length')"
echo "Failed patterns: $(cat .claude/state/fix-history.json | jq '.failed_patterns | length')"
echo "Blacklisted approaches: $(cat .claude/state/fix-history.json | jq '.blacklisted_approaches | length')"
```

## Integration

This command should be called:
- Before attempting any fix (via check-fix-history)
- After every deployment result (success or failure)
- When escalating to human intervention