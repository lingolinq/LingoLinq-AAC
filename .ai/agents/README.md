# AI-Assisted Development Environment

This directory contains configuration and coordination tools for AI-assisted development of LingoLinq AAC.

## 🎯 Problem Solved

AI coding agents (Claude Code, Gemini CLI) were inconsistently changing critical version requirements:
- Node.js needed to stay at 18.x for Ember 3.12 compatibility
- Ruby locked at 3.2.8 for Rails 6.1 compatibility
- Agents lacked persistent context between sessions
- No coordination between multiple AI agents

## 🛡️ Solution Overview

**Docker-based Development**: Isolated containers with locked versions
**AI Coordinator Service**: Persistent context and agent coordination
**Version Enforcement**: Automatic constraint checking and violation prevention
**Multi-Agent Awareness**: Shared state and communication between AI tools

## 📁 Directory Structure

```
ai-agents/
├── README.md                    # This file
├── project-constraints.json     # CRITICAL: Version locks and constraints
├── claude-config.json          # Claude Code agent configuration
├── gemini-config.json          # Gemini CLI agent configuration
├── setup-dev-environment.sh    # One-time setup script
├── verify-environment.sh       # Environment verification
└── coordinator/
    └── index.js                # AI coordination service
```

## 🚀 Quick Start

### Option 1: Full Setup (Recommended)
```bash
# Run the automated setup
bash ai-agents/setup-dev-environment.sh

# This will:
# - Build Docker containers with locked versions
# - Start AI coordinator service
# - Initialize database and services
# - Set up agent coordination
```

### Option 2: Manual Docker Setup
```bash
# Start just the development environment
docker-compose -f docker-compose.dev.yml up

# Access containers
docker exec -it lingolinq_backend bash    # Rails backend
docker exec -it lingolinq_frontend bash   # Ember frontend
```

### Option 3: Disable AI Coordination (Traditional Development)
```bash
# Use regular Rails/Ember development
bundle install
rails server  # Terminal 1

cd app/frontend
npm install && bower install
ember serve    # Terminal 2
```

## 🤖 AI Agent Integration

### For Claude Code
1. At session start, read: `ai-agents/claude-config.json`
2. Register with coordinator: `curl -X POST http://localhost:4000/api/agents/register`
3. Before version changes: Check constraints via API
4. Log all actions: `curl -X POST http://localhost:4000/api/agents/{id}/action`

### For Gemini CLI
1. At session start, read: `ai-agents/gemini-config.json`
2. Follow same registration and logging pattern
3. Use MCP integration for enhanced coordination

## 🔒 Version Constraints (CRITICAL)

**These versions are LOCKED and must not be changed:**

- **Ruby 3.2.8**: Required for Rails 6.1 compatibility
- **Node.js 18.x**: Required for Ember 3.12 compatibility
- **Rails 6.1**: Current version (upgrade to 7.2 planned)
- **Ember 3.12**: Legacy version with specific Node 18 requirement

**Forbidden Actions:**
- `nvm use 20` or `nvm use 22`
- `gem install ruby` (version changes)
- Upgrading Node.js beyond 18.x
- Updating Ember without compatibility verification

## 📊 Monitoring & Coordination

**AI Coordinator Dashboard**: http://localhost:4000
- View active agents
- Monitor version constraint violations  
- See real-time agent actions
- Access shared context

**API Endpoints:**
- `GET /api/constraints` - Project constraints
- `GET /api/context` - Current session context  
- `GET /api/changes` - Recent agent actions
- `GET /api/warnings` - Version warnings
- `POST /api/verify-environment` - Verify setup

## 🔄 Development Workflow

1. **Start Environment**
   ```bash
   docker-compose -f docker-compose.dev.yml up
   ```

2. **Verify Setup**
   ```bash
   bash ai-agents/verify-environment.sh
   ```

3. **Configure AI Agents**
   - Point Claude Code to read `claude-config.json`
   - Point Gemini CLI to read `gemini-config.json`
   - Both should register with coordinator on startup

4. **Develop Safely**
   - All version constraints automatically enforced
   - AI agents coordinate through shared API
   - Rollback available if issues occur

## 🛠️ Troubleshooting

**Version Mismatch Detected:**
```bash
# Check what's wrong
bash ai-agents/verify-environment.sh

# Reset to correct versions (Docker approach)
docker-compose -f docker-compose.dev.yml down
docker-compose -f docker-compose.dev.yml up --build
```

**AI Coordinator Not Responding:**
```bash
# Check coordinator status
docker-compose -f docker-compose.dev.yml logs ai_coordinator

# Restart coordinator
docker-compose -f docker-compose.dev.yml restart ai_coordinator
```

**Build Failures:**
```bash
# Usually version-related - check constraints first
curl http://localhost:4000/api/warnings

# Clean rebuild
docker-compose -f docker-compose.dev.yml down -v
docker-compose -f docker-compose.dev.yml up --build
```

## 🎛️ Configuration Options

**Disable AI Coordination**: Comment out `ai_coordinator` service in `docker-compose.dev.yml`

**Use Host System**: Skip Docker and run traditional Rails/Ember development

**Custom Constraints**: Modify `project-constraints.json` (be careful!)

## 📝 For Team Members

**First Time Setup:**
1. Clone repo
2. Run `bash ai-agents/setup-dev-environment.sh`
3. Configure your AI tools to use the config files
4. Start developing with confidence

**Daily Development:**
- Always start with `docker-compose -f docker-compose.dev.yml up`
- Let AI agents handle the complexity while staying within constraints
- Monitor coordination at http://localhost:4000

**Contributing:**
- Add new constraints to `project-constraints.json`
- Update AI configs when adding new tools
- Test setup with `verify-environment.sh`

---

💡 **Pro Tip**: This setup eliminates the "AI agent broke my environment" problem entirely. All changes happen in isolated containers with automatic constraint enforcement.