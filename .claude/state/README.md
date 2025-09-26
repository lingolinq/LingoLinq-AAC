# Deployment Automation State

This directory tracks the state of automated deployment monitoring and fixing.

## Files

- `deployment-status.json` - Current deployment status and iteration tracking
- `error-patterns.json` - Historical error patterns and their fixes
- `fix-attempts.json` - Log of all automated fix attempts

## Status File Schema

```json
{
  "timestamp": "2025-09-19T19:45:00Z",
  "iteration": 1,
  "commit": "d3684021f",
  "commit_message": "fix: isolate obf gem during Docker build",
  "branch": "fix/ci-pipeline-test",
  "deploy_id": "deploy-abc123",
  "status": "failed|pending|success|timeout",
  "error_pattern": "obf_gem_failure|bundle_install_failure|asset_compilation_failure|docker_build_failure|npm_failure",
  "service_id": "srv-d36f26umcj7s73dh0dag",
  "logs_available": true,
  "next_action": "generate_fix|monitor|escalate"
}
```

## Usage

- GitHub Actions updates `deployment-status.json` after each deployment
- Claude Code reads this file to determine next actions
- Multi-agent system coordinates based on status and error patterns