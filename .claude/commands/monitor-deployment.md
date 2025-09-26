# Monitor Deployment Command

Monitors the current Render deployment status and coordinates automated fixes.

## Usage

```bash
claude -c monitor-deployment
```

## What This Does

1. **Reads current status** from `.claude/state/deployment-status.json`
2. **Checks Render API** for latest deployment info
3. **Analyzes error patterns** if deployment failed
4. **Coordinates with other AI agents** for fix generation
5. **Triggers next iteration** if within max attempts

## Process

Check the latest deployment status and determine next action:

```bash
# Read current status
if [ -f ".claude/state/deployment-status.json" ]; then
  echo "📊 Reading current deployment status..."
  cat .claude/state/deployment-status.json | jq '.'

  STATUS=$(cat .claude/state/deployment-status.json | jq -r '.status')
  ITERATION=$(cat .claude/state/deployment-status.json | jq -r '.iteration // 1')
  ERROR_PATTERN=$(cat .claude/state/deployment-status.json | jq -r '.error_pattern // "none"')

  echo "Current status: $STATUS"
  echo "Iteration: $ITERATION"
  echo "Error pattern: $ERROR_PATTERN"
else
  echo "⚠️ No deployment status found. Creating initial status..."
  echo '{"status": "unknown", "iteration": 0}' > .claude/state/deployment-status.json
fi

# Check if we need to take action
case "$STATUS" in
  "failed")
    if [ "$ITERATION" -lt 5 ]; then
      echo "🔧 Deployment failed - generating fix for pattern: $ERROR_PATTERN"
      claude -c generate-fix --pattern="$ERROR_PATTERN" --iteration="$ITERATION"
    else
      echo "❌ Max iterations reached - escalating to human"
      claude -c escalate-issue
    fi
    ;;
  "success")
    echo "✅ Deployment successful! No action needed."
    ;;
  "pending"|"timeout")
    echo "⏳ Deployment still in progress or timed out - monitoring..."
    ;;
  *)
    echo "❓ Unknown status - checking GitHub Actions for latest info"
    ;;
esac
```

## Integration with GitHub Actions

This command reads the status file updated by the GitHub Actions workflow and coordinates the next steps in the automated fix process.