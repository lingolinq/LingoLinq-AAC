# AI Usage Logs

This directory contains automated logs of AI token usage for the LingoLinq AAC project.

## File Structure

- `gemini-usage-YYYY-MM-DD.log` - Daily Gemini CLI usage logs
- `claude-usage-YYYY-MM-DD.log` - Daily Claude Code session logs
- `usage-report-YYYY-MM-DD.md` - Daily usage summary reports

## Log Format

### Gemini Usage Logs
```
[2025-01-XX XX:XX:XX] Gemini Usage Check
Model Usage    Reqs    Input Tokens    Output Tokens
gemini-2.5-pro   12      6,082,929        17,014
Cache Savings: 2,401,483 (39.5%) of input tokens served from cache
---
```

### Claude Usage Logs
```
[2025-01-XX XX:XX:XX] Claude Code Session Check
Version: claude-code-1.x.x
Manual dashboard check recommended
---
```

## Usage Monitoring Commands

- `bin/token-status` - Main monitoring script
- `devin tokens` - Quick token status check
- `devin tokens gemini` - Gemini-only status
- `devin tokens claude` - Claude-only status
- `devin tokens trends` - Usage analytics
- `devin tokens tips` - Optimization suggestions

## Retention Policy

Logs are automatically created and retained for analysis. Consider archiving logs older than 30 days to manage disk space.

## Privacy Note

These logs contain usage statistics only, not conversation content. Safe to commit to version control for team visibility.