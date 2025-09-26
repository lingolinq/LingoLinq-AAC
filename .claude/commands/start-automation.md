# Start Automation System

Initializes the automated deployment monitoring and fixing system.

## Usage

```bash
# Start the automation system
claude -c start-automation

# Start with specific parameters
claude -c start-automation --max-iterations=5 --notify=true
```

## What This Does

1. **Checks prerequisites** (GitHub secrets, Render API access)
2. **Initializes status tracking**
3. **Monitors current deployment**
4. **Starts automated fix cycle if needed**

## Process

```bash
echo "🚀 Starting LingoLinq-AAC Deployment Automation System"
echo "======================================================"

# Check prerequisites
echo "🔍 Checking prerequisites..."

# Check if GitHub secrets are configured
if ! gh secret list | grep -q "RENDER_SECRET_KEY"; then
  echo "❌ RENDER_SECRET_KEY not found in GitHub secrets"
  echo "Please add your Render API key to GitHub secrets"
  exit 1
fi

# Check if Render API is accessible
if ! command -v curl >/dev/null 2>&1; then
  echo "❌ curl not available for API calls"
  exit 1
fi

echo "✅ Prerequisites check passed"

# Initialize directories
echo "📁 Initializing automation directories..."
mkdir -p .claude/state
mkdir -p .claude/logs

# Check current deployment status
echo "📊 Checking current deployment status..."
claude -c monitor-deployment

# Parse arguments for configuration
MAX_ITERATIONS=5
NOTIFY=false

if echo "$ARGUMENTS" | grep -q "max-iterations="; then
  MAX_ITERATIONS=$(echo "$ARGUMENTS" | grep -o 'max-iterations=[^ ]*' | cut -d= -f2)
fi

if echo "$ARGUMENTS" | grep -q "notify=true"; then
  NOTIFY=true
fi

echo "⚙️ Configuration:"
echo "  - Max iterations: $MAX_ITERATIONS"
echo "  - Notifications: $NOTIFY"

# Create automation configuration
cat > .claude/state/automation-config.json << EOF
{
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "max_iterations": $MAX_ITERATIONS,
  "notify": $NOTIFY,
  "services": {
    "web": "srv-d36f26umcj7s73dh0dag",
    "worker": "srv-d36f276mcj7s73dh0dbg"
  },
  "agents_enabled": {
    "claude": true,
    "gemini": false,
    "manus": false,
    "genspark": false
  },
  "status": "active"
}
EOF

echo "✅ Automation system initialized"
echo ""
echo "🎯 Next Steps:"
echo "  1. Monitor deployment: claude -c monitor-deployment"
echo "  2. View status: cat .claude/state/deployment-status.json"
echo "  3. Check GitHub Actions: https://github.com/$(gh repo view --json owner,name -q '.owner.login + \"/\" + .name')/actions"
echo ""
echo "🤖 The system will automatically:"
echo "  - Monitor deployments via GitHub Actions"
echo "  - Analyze failure patterns"
echo "  - Generate and test fixes"
echo "  - Escalate after $MAX_ITERATIONS failed attempts"
echo ""
echo "📝 View logs: ls -la .claude/state/"
```

## Monitoring Commands

After starting the automation system, use these commands:

- `claude -c monitor-deployment` - Check current status
- `claude -c coordinate-agents --action=analyze` - Trigger analysis
- `tail -f .claude/state/deployment-status.json` - Watch status changes
- `gh workflow list` - View GitHub Actions workflows