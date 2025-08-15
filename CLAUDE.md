# LingoLinq AAC - Claude Code Instructions

## 🚨 CRITICAL: Always Use Docker for Testing & Deployment

**This project MUST be run using Docker containers. Never attempt to run Rails commands directly on the host system.**

### Why Docker is Required:
- **Version Constraints**: Rails 6.1 requires Ruby 3.2.8 and Node.js 18.x
- **Database Dependencies**: PostgreSQL 15 and Redis 7 required
- **Environment Consistency**: Matches production deployment exactly
- **AI Safety**: Prevents host system conflicts and version mismatches

## 🐳 Docker Commands Reference

### Starting the Application
```bash
# Start all services (PostgreSQL, Redis, Rails)
docker-compose -f docker/docker-compose.simple.yml up

# Start in background
docker-compose -f docker/docker-compose.simple.yml up -d

# View logs
docker-compose -f docker/docker-compose.simple.yml logs backend -f
```

### Testing & Development Commands
```bash
# Access Rails console
docker-compose -f docker/docker-compose.simple.yml exec backend bundle exec rails console

# Run database migrations
docker-compose -f docker/docker-compose.simple.yml exec backend bundle exec rails db:migrate

# Run tests (if available)
docker-compose -f docker/docker-compose.simple.yml exec backend bundle exec rspec

# Run any Rails command
docker-compose -f docker/docker-compose.simple.yml exec backend bundle exec rails [command]

# Access container shell
docker-compose -f docker/docker-compose.simple.yml exec backend bash
```

### Database Operations
```bash
# Create database
docker-compose -f docker/docker-compose.simple.yml exec backend bundle exec rails db:create

# Reset database
docker-compose -f docker/docker-compose.simple.yml exec backend bundle exec rails db:drop db:create db:migrate db:seed

# Database console
docker-compose -f docker/docker-compose.simple.yml exec postgres psql -U postgres -d lingolinq_development
```

### Stopping Services
```bash
# Stop all services
docker-compose -f docker/docker-compose.simple.yml down

# Stop and remove all data (fresh start)
docker-compose -f docker/docker-compose.simple.yml down -v
```

## 🎯 Test Deployment Branch

**Branch**: `test/repo-reorganization`

This branch is designated for testing deployments and should:
1. Always use Docker for all operations
2. Test new features before merging to main
3. Validate deployment readiness
4. Ensure Docker setup works correctly

### Deployment Testing Workflow
```bash
# 1. Switch to test branch
git checkout test/repo-reorganization

# 2. Start Docker environment
docker-compose -f docker/docker-compose.simple.yml up -d

# 3. Wait for health checks (about 30 seconds)
docker-compose -f docker/docker-compose.simple.yml ps

# 4. Test application
curl http://localhost:3000/api/v1/users/me

# 5. Run any additional tests
docker-compose -f docker/docker-compose.simple.yml exec backend bundle exec rails test:integration

# 6. Stop when done
docker-compose -f docker/docker-compose.simple.yml down
```

## 🔧 Development Environment

### Service URLs
- **Rails Application**: http://localhost:3000
- **PostgreSQL Database**: localhost:5432 (postgres/password)
- **Redis Cache**: localhost:6379

### Environment Variables
The Docker setup handles all required environment variables:
- `RAILS_ENV=development`
- `DATABASE_URL=postgres://postgres:password@postgres:5432/lingolinq_development`
- `REDIS_URL=redis://redis:6379/0`

## 🚀 Deployment Commands

### Production-Ready Build
```bash
# Build for production
docker build -f docker/Dockerfile -t lingolinq-aac .

# Test production build locally
docker run -p 3000:3000 -e RAILS_ENV=production lingolinq-aac
```

### Cloud Deployment
```bash
# Google Cloud Run
gcloud run deploy lingolinq-aac --source docker/ --port 3000

# AWS App Runner (requires apprunner.yaml)
aws apprunner create-service --cli-input-json file://aws-config.json

# Heroku
heroku container:push web
heroku container:release web
```

## ⚠️ Common Mistakes to Avoid

### ❌ NEVER Do These:
```bash
# Don't run Rails directly
rails server                           # ❌ Will fail - no PostgreSQL

# Don't install gems on host
bundle install                         # ❌ Wrong Ruby version

# Don't run database commands on host
rails db:migrate                       # ❌ No database connection
```

### ✅ ALWAYS Do These:
```bash
# Use Docker for everything
docker-compose -f docker/docker-compose.simple.yml exec backend rails server

# Use Docker for gems
docker-compose -f docker/docker-compose.simple.yml exec backend bundle install

# Use Docker for database
docker-compose -f docker/docker-compose.simple.yml exec backend rails db:migrate
```

## 🛠️ Troubleshooting

### Container Won't Start
```bash
# Check logs
docker-compose -f docker/docker-compose.simple.yml logs backend

# Rebuild container
docker-compose -f docker/docker-compose.simple.yml build backend --no-cache
```

### Database Connection Issues
```bash
# Verify PostgreSQL is running
docker-compose -f docker/docker-compose.simple.yml ps postgres

# Check health status
docker-compose -f docker/docker-compose.simple.yml exec postgres pg_isready -U postgres
```

### Port Already in Use
```bash
# Find what's using port 3000
netstat -an | grep :3000

# Kill process or change port in docker-compose.simple.yml
```

## 📁 Key Files

- `docker/docker-compose.simple.yml` - Main Docker configuration
- `docker/Dockerfile` - Rails application container
- `docker/README.md` - Detailed Docker documentation
- `.env` - Environment variables (create if needed)

## 🔍 Health Checks

### Verify Everything is Working
```bash
# Check all services are healthy
docker-compose -f docker/docker-compose.simple.yml ps

# Test Rails application
curl http://localhost:3000

# Test database connection
docker-compose -f docker/docker-compose.simple.yml exec backend bundle exec rails runner "puts User.count"
```

## 🎯 Remember: 
**ALWAYS use Docker commands prefixed with `docker-compose -f docker/docker-compose.simple.yml exec backend` for any Rails operations on this project.**

This ensures consistency with the production environment and prevents local system conflicts.