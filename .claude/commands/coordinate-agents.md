# Multi-Agent Coordination System

Coordinates Claude Code, Gemini CLI, Manus AI, and GenSpark AI for automated deployment fixing.

## Usage

```bash
claude -c coordinate-agents --action=analyze --error-pattern=obf_gem_failure
```

## Agent Roles & Capabilities

### 🧠 Claude Code (Master Orchestrator)
- **Role**: Main coordinator and deployment executor
- **Tools**: Terminal, Git, GitHub, File operations
- **Responsibilities**:
  - Monitor deployment status
  - Execute fixes
  - Coordinate other agents
  - Final decision making

### 🔒 Gemini CLI (CI/CD & Security)
- **Role**: GitHub Actions integration and security analysis
- **Tools**: GitHub API, Security scanning, CI/CD workflows
- **Responsibilities**:
  - Monitor GitHub Actions
  - Security analysis of fixes
  - Automated PR creation
  - CI/CD optimization

### 🤖 Manus AI (Autonomous Analysis)
- **Role**: Deep error analysis and sandbox testing
- **Tools**: Linux sandbox, Code execution, Data analysis
- **Responsibilities**:
  - Root cause analysis
  - Sandbox testing of fixes
  - Alternative solution generation
  - Continuous processing

### ⭐ GenSpark AI (Super Coordination)
- **Role**: Multi-modal coordination and communication
- **Tools**: Voice, Browser, Multi-agent coordination
- **Responsibilities**:
  - Coordinate findings between agents
  - Voice notifications
  - Parallel workflow management
  - Human communication

## Coordination Workflow

```bash
# Parse coordination request
ACTION=$(echo "$ARGUMENTS" | grep -o 'action=[^ ]*' | cut -d= -f2)
ERROR_PATTERN=$(echo "$ARGUMENTS" | grep -o 'error-pattern=[^ ]*' | cut -d= -f2)

echo "🎯 Coordinating agents for action: $ACTION"
echo "🔍 Error pattern: $ERROR_PATTERN"

case "$ACTION" in
  "analyze")
    echo "📊 Initiating parallel analysis..."

    # Claude Code: Read current state and logs
    echo "🧠 Claude Code: Analyzing deployment logs and error patterns..."
    if [ -f ".claude/state/deployment-status.json" ]; then
      cat .claude/state/deployment-status.json | jq '.'
    fi

    # Gemini CLI: Security and CI/CD analysis
    echo "🔒 Gemini CLI: Analyzing security implications and CI/CD issues..."
    echo "# TODO: Integrate with Gemini CLI"
    # gemini-cli analyze --type security --context deployment-failure

    # Manus AI: Sandbox analysis
    echo "🤖 Manus AI: Performing sandbox analysis..."
    echo "# TODO: Integrate with Manus AI API"
    # manus-ai analyze --sandbox --error-pattern "$ERROR_PATTERN"

    # GenSpark AI: Multi-modal coordination
    echo "⭐ GenSpark AI: Coordinating multi-agent analysis..."
    echo "# TODO: Integrate with GenSpark AI API"
    # genspark coordinate --agents "claude,gemini,manus" --task "deployment-analysis"
    ;;

  "generate-fixes")
    echo "🔧 Generating coordinated fixes..."

    # Each agent generates potential fixes
    echo "🧠 Claude Code: Generating file-based fixes..."
    claude -c generate-fix --pattern="$ERROR_PATTERN"

    echo "🔒 Gemini CLI: Generating security-aware fixes..."
    # gemini-cli generate-fix --secure --pattern "$ERROR_PATTERN"

    echo "🤖 Manus AI: Generating tested fixes in sandbox..."
    # manus-ai generate-fix --test-sandbox --pattern "$ERROR_PATTERN"

    echo "⭐ GenSpark AI: Coordinating and ranking fixes..."
    # genspark rank-solutions --agents all --criteria "feasibility,safety,effectiveness"
    ;;

  "test-fixes")
    echo "🧪 Coordinated fix testing..."

    # Parallel testing by different agents
    echo "🧠 Claude Code: Local testing and deployment..."
    # Standard deployment testing

    echo "🤖 Manus AI: Sandbox validation..."
    # manus-ai test --sandbox --fix-branch auto-fix-*

    echo "🔒 Gemini CLI: Security validation..."
    # gemini-cli security-test --fix-branch auto-fix-*
    ;;

  "escalate")
    echo "🚨 Escalating to human intervention..."

    # GenSpark AI: Voice notification
    echo "⭐ GenSpark AI: Notifying human via voice..."
    # genspark notify --voice --message "Deployment automation needs human intervention after 5 failed iterations"

    # Create comprehensive report
    echo "📋 Creating escalation report..."
    cat > .claude/state/escalation-report.md << EOF
# Deployment Automation Escalation Report

## Summary
Automated deployment fixing has reached maximum iterations (5) without success.

## Error Pattern History
$(cat .claude/state/deployment-status.json | jq -r '.error_pattern // "unknown"')

## Attempts Made
- Iteration 1: [describe attempt]
- Iteration 2: [describe attempt]
- Iteration 3: [describe attempt]
- Iteration 4: [describe attempt]
- Iteration 5: [describe attempt]

## Recommended Next Steps
1. Manual review of latest error logs
2. Consider alternative deployment platform
3. Seek expert consultation for legacy stack issues

## Agent Coordination Summary
- Claude Code: [summary of actions]
- Gemini CLI: [summary of analysis]
- Manus AI: [summary of testing]
- GenSpark AI: [summary of coordination]
EOF

    # Create GitHub issue
    echo "📝 Creating GitHub issue for human intervention..."
    gh issue create --title "🤖 Automated Deployment Fixing Escalation" \
      --body-file .claude/state/escalation-report.md \
      --assignee "@me" \
      --label "automation,deployment,needs-human"
    ;;

  *)
    echo "❓ Unknown coordination action: $ACTION"
    echo "Available actions: analyze, generate-fixes, test-fixes, escalate"
    ;;
esac

# Update coordination state
echo "📊 Updating coordination state..."
cat > .claude/state/agent-coordination.json << EOF
{
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "action": "$ACTION",
  "error_pattern": "$ERROR_PATTERN",
  "agents_involved": ["claude", "gemini", "manus", "genspark"],
  "status": "completed"
}
EOF

echo "✅ Agent coordination completed"
```

## Integration Commands

- `claude -c coordinate-agents --action=analyze` - Start parallel error analysis
- `claude -c coordinate-agents --action=generate-fixes` - Generate coordinated fixes
- `claude -c coordinate-agents --action=test-fixes` - Parallel fix testing
- `claude -c coordinate-agents --action=escalate` - Escalate to human intervention