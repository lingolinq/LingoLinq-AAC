# 🐳 LingoLinq AAC Docker Development Environment

This Docker setup provides **multiple development environments** for LingoLinq AAC:
- **Legacy testing** with Ruby 3.2.8 + Node.js 18.x (current production environment)
- **Modern development** with updated Ruby and Node.js versions
- **Production-ready** containerized deployments

## 🎯 Use Cases

**Legacy Environment (Ruby 3.2.8 + Node.js 18.x):**
- Testing current production compatibility
- AI agent development with version constraints
- Reproducing production issues locally

**Modern Development:**
- Upgrading to newer Ruby/Node.js versions
- Adding new features with modern tooling
- Performance improvements and security updates

**Deployment:**
- Identical environment locally and in production
- One-command cloud deployment ready

## 🚀 Quick Start

### Prerequisites
- Docker Desktop installed and running
- Git repository cloned

### VS Code Dev Container (Recommended)
**For VS Code users**: Open the project and select "Reopen in Container" when prompted, or:
1. Install the "Dev Containers" extension
2. `Ctrl+Shift+P` → "Dev Containers: Reopen in Container"
3. Automatically sets up Ruby 3.2.8 + Node.js 18.x environment

### Command Line Setup

### Start Development Environment
```bash
# Start all services (database, cache, Rails app)
docker-compose up

# Or run in background
docker-compose up -d

# View logs
docker-compose logs web -f
```

### Access Services
- **Rails App**: http://localhost:3000
- **Database**: `localhost:5432` (postgres/password)  
- **Redis Cache**: `localhost:6379`

### Stop Environment
```bash
# Stop all services
docker-compose down

# Stop and remove all data (fresh start)
docker-compose down -v
```

## 📁 Files Added

### Core Docker Files
- `Dockerfile` - Rails app container with Ruby 3.2.8 + Node.js 18.x
- `docker-compose.yml` - Multi-service setup (Rails, PostgreSQL, Redis)
- `.dockerignore` - Optimizes build performance

### Documentation
- `DOCKER_README.md` - This file
- `DOCKER_QUICK_START.md` - Previous setup guide

### AI Agent Coordination
- `ai-agents/project-constraints.json` - Version constraints for AI tools
- `ai-agents/claude-config.json` - Claude Code configuration
- `ai-agents/gemini-config.json` - Gemini CLI configuration
- `ai-agents/verify-environment.sh` - Environment verification script

## 🔧 Development Workflows

### Traditional Rails Development
```bash
# Access Rails container
docker-compose exec web bash

# Inside container - run Rails commands
bundle exec rails console
bundle exec rails generate model Example
bundle exec rspec
```

### Database Operations
```bash
# Create/migrate database
docker-compose exec web bundle exec rails db:create db:migrate

# Seed database
docker-compose exec web bundle exec rails db:seed

# Rails console
docker-compose exec web bundle exec rails console

# Database console
docker-compose exec db psql -U postgres -d lingolinq_development
```

### Frontend Development (Future)
```bash
# The Ember frontend can be added as a separate container
# Currently runs via Rails asset pipeline with Node.js 18.x
```

## 🌊 Cloud Deployment

### Google Cloud Run
```bash
# Deploy to Google Cloud
gcloud run deploy lingolinq \
  --source . \
  --port 3000 \
  --memory 1Gi \
  --cpu 1 \
  --max-instances 10
```

### Render.com
1. Connect your GitHub repository
2. Render auto-detects `Dockerfile`
3. Set environment variables in Render dashboard
4. Auto-deploys on git push

### AWS App Runner
```bash
# Create apprunner.yaml in your repo root:
# version: 1.0
# runtime: docker
# build:
#   commands:
#     build:
#       - echo "Using Dockerfile"
# run:
#   runtime-version: latest
#   command: bundle exec rails server -b 0.0.0.0 -p 3000
#   network:
#     port: 3000

aws apprunner create-service --cli-input-json file://apprunner-config.json
```

### Heroku
```bash
# Install Heroku CLI, then:
heroku create your-app-name
heroku stack:set container
git push heroku main
```

## ⚙️ Environment Configuration

### Required Environment Variables
```bash
# Database
DATABASE_URL=postgres://postgres:password@db:5432/lingolinq_development
REDIS_URL=redis://redis:6379/0

# Rails
RAILS_ENV=development
SECURE_ENCRYPTION_KEY=your_encryption_key_here
SECURE_NONCE_KEY=your_nonce_key_here
COOKIE_KEY=your_cookie_key_here
DEFAULT_HOST=localhost:3000

# Production Additional Variables
# AWS_KEY=your_aws_key
# AWS_SECRET=your_aws_secret
# UPLOADS_S3_BUCKET=your_s3_bucket
```

### Development vs Production
- **Development**: Uses `.env` file with local database
- **Production**: Uses cloud environment variables and managed databases

## 🤖 AI Agent Integration

### Version Safety
The Docker environment **prevents AI agents from breaking version compatibility**:

- Ruby 3.2.8 locked in container (Rails 6.1 requirement)
- Node.js 18.x locked in container (Ember 3.12 requirement)
- AI agents cannot access or modify host system versions

### Configuration Files
AI agents should read these files on session start:

```bash
# Claude Code
ai-agents/claude-config.json

# Gemini CLI  
ai-agents/gemini-config.json

# Version constraints
ai-agents/project-constraints.json
```

### Verification
```bash
# Verify environment meets constraints
bash ai-agents/verify-environment.sh

# Check versions in container
docker-compose exec web ruby -v    # Should show 3.2.8
docker-compose exec web node -v    # Should show 18.x
```

## 🛠️ Troubleshooting

### Container Won't Start
```bash
# Check logs
docker-compose logs web

# Rebuild container
docker-compose build web --no-cache
docker-compose up web
```

### Database Issues
```bash
# Reset database
docker-compose down -v
docker-compose up db -d
docker-compose exec web bundle exec rails db:create db:migrate
```

### Port Conflicts
```bash
# If port 3000 is in use, modify docker-compose.yml:
ports:
  - "3001:3000"  # Use port 3001 instead
```

### Performance Issues
```bash
# Increase Docker Desktop memory allocation
# Docker Desktop > Settings > Resources > Advanced
# Recommended: 4GB RAM, 2 CPUs
```

## 🔍 Verification Checklist

After setup, verify everything works:

- [ ] `docker-compose up` starts all services
- [ ] `curl http://localhost:3000` returns Rails response
- [ ] `docker-compose exec web ruby -v` shows Ruby 3.2.8
- [ ] `docker-compose exec web node -v` shows Node.js 18.x
- [ ] Database accessible via `docker-compose exec db psql -U postgres`
- [ ] AI agents can read constraint files in `ai-agents/`

## 📚 Additional Resources

- **Rails Commands**: [Rails Guide](https://guides.rubyonrails.org/command_line.html)
- **Docker Compose**: [Docker Documentation](https://docs.docker.com/compose/)
- **Production Deployment**: See cloud provider documentation
- **AI Agent Setup**: See configuration files in `ai-agents/`

## 🎉 Benefits Summary

✅ **Version Safety**: Locked Ruby 3.2.8 + Node.js 18.x  
✅ **AI Agent Compatible**: Prevents version conflicts  
✅ **Production Ready**: Same environment locally and deployed  
✅ **Team Friendly**: Consistent setup across developers  
✅ **Cloud Ready**: One-command deployment to any platform  

---

**Need help?** Check the troubleshooting section or review the configuration files in the `ai-agents/` directory.