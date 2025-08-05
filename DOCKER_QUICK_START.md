# 🚀 LingoLinq Docker Development Environment - Quick Start

## ✅ What's Currently Running

You now have a **containerized development environment** that solves the AI agent version management problem:

### 🐳 Active Services
- **PostgreSQL**: Database server (port 5432)
- **Redis**: Cache server (port 6379)  
- **Rails Backend**: LingoLinq backend with locked Ruby 3.2.8 (port 3000)

### 🔒 Version Safety Achieved
- ✅ Ruby 3.2.8 locked in container
- ✅ Node.js will be 18.x in container
- ✅ Your host system versions unaffected
- ✅ AI agents can't accidentally break compatibility

## 🎯 Current Status

```bash
# Check what's running
docker ps

# View backend logs
docker-compose -f docker-compose.simple.yml logs backend

# Access Rails backend container
docker exec -it lingolinq_backend_dev bash
```

## 🛠️ Next Steps for Development

### Option 1: Traditional Rails Development (Host System)
```bash
# Stop Docker containers
docker-compose -f docker-compose.simple.yml down

# Use your host system with current Node.js 22
bundle install
rails server  # Port 3000

# In another terminal
cd app/frontend
npm install && bower install
ember serve --port 8181
```

### Option 2: Full Container Development (Recommended for AI agents)
```bash
# Wait for backend to finish setup, then access container
docker exec -it lingolinq_backend_dev bash

# Inside container - run Rails commands
rails console
rails generate ...
bundle exec rspec
```

### Option 3: Mixed Development  
```bash
# Keep database/Redis in containers (easier)
# Run Rails/Ember on host system
# Database: localhost:5432 (from containers)
# Redis: localhost:6379 (from containers)
```

## 🤖 AI Agent Integration

### For Future AI Sessions
1. **Read Configuration**: Point agents to `ai-agents/project-constraints.json`
2. **Use Containers**: All version-sensitive work should happen in containers
3. **Verify Environment**: `bash ai-agents/verify-environment.sh`

### Current Constraints (Locked)
- **Ruby**: Must be 3.2.8 (Rails 6.1 compatibility)
- **Node.js**: Must be 18.x (Ember 3.12 compatibility)  
- **Rails**: Currently 6.1 (upgrade to 7.2 planned)
- **Ember**: Currently 3.12 (legacy but stable)

## 🔄 Daily Workflow

### Start Development Environment
```bash
# Start all services
docker-compose -f docker-compose.simple.yml up -d

# Wait for backend to be ready (check logs)
docker-compose -f docker-compose.simple.yml logs backend
```

### Stop Development Environment
```bash
# Stop all services
docker-compose -f docker-compose.simple.yml down

# Stop and remove volumes (fresh start)
docker-compose -f docker-compose.simple.yml down -v
```

### Access Services
- **Rails App**: http://localhost:3000 (once backend startup completes)
- **Database**: `psql -h localhost -U postgres -d lingolinq_development`
- **Redis**: `redis-cli -h localhost`

## 🚨 Important Notes

### Version Management
- **DO NOT** upgrade Node.js beyond 18.x
- **DO NOT** change Ruby from 3.2.8
- **USE** containers for AI-assisted development
- **VERIFY** versions before making changes

### File Safety
- All your important files are safe
- Docker setup is additive (doesn't change existing code)
- You can always fall back to traditional development

### AI Agent Coordination
- Configuration files are in `ai-agents/`
- Use `docker-compose.simple.yml` for now (simpler than full setup)
- The AI coordinator service can be added later when needed

## 🎉 Success!

You've successfully containerized LingoLinq development with:
- ✅ Version constraints enforced
- ✅ Database and cache services running
- ✅ Rails backend with correct Ruby version
- ✅ No impact on host system
- ✅ AI agent coordination framework ready

**Ready for AI-assisted development without version conflicts!** 🤖