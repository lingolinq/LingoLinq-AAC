# LingoLinq AAC - Troubleshooting Guide

**🔧 Solutions for common development issues**

---

## **Quick Diagnosis** 🩺

**Step 1:** Run the doctor script first
```bash
./bin/doctor
```
*This identifies 80% of common issues automatically*

**Step 2:** If issues persist, use this guide for specific problems.

---

## **Environment Issues** 🌍

### **Docker Won't Start**

**Symptoms:** 
- `docker: command not found`
- `Cannot connect to the Docker daemon`
- `docker-compose up` fails immediately

**Solutions:**
```bash
# Check Docker is installed and running
docker --version
docker info

# Windows: Restart Docker Desktop from system tray
# Mac: Restart Docker Desktop from menu bar  
# Linux: Restart Docker service
sudo systemctl restart docker
```

**If Docker Desktop won't start:**
- Windows: Check WSL 2 is enabled
- Mac: Check system resources (4GB+ RAM recommended)
- Linux: Check user is in docker group: `sudo usermod -aG docker $USER`

### **Port Conflicts**

**Symptoms:**
- `Port 3000 is already in use`
- `Port 5432 is already in use`
- Services fail to start

**Diagnosis:**
```bash
# Find what's using the ports
netstat -an | grep :3000  # Windows
lsof -i :3000             # Mac/Linux

# Check all our ports at once
for port in 3000 5432 6379; do echo "Port $port:"; lsof -i :$port; done
```

**Solutions:**
```bash
# Option 1: Kill the conflicting process
kill $(lsof -t -i:3000)

# Option 2: Change ports in docker/docker-compose.yml
# Change "3000:3000" to "3001:3000" for web service

# Option 3: Use different port range
# Edit docker-compose.yml to use 13000:3000, etc.
```

### **Permission Issues**

**Symptoms:**
- `Permission denied` errors
- `EACCES` file system errors
- Docker volume mount failures

**Solutions:**
```bash
# Linux/Mac: Fix file ownership
sudo chown -R $USER:$USER .
chmod -R 755 .

# Windows: Check WSL file permissions
# Run from WSL terminal, not Windows Command Prompt

# Docker-specific: Reset Docker Desktop
# Windows/Mac: Docker Desktop → Settings → Reset to factory defaults
```

---

## **Build & Dependency Issues** 🔨

### **Bundle Install Failures**

**Symptoms:**
- `Gem::Ext::BuildError`
- `Failed to build gem native extension`
- Ruby dependencies won't install

**Solutions:**
```bash
# Force container rebuild with latest base image
docker-compose down
docker-compose build --no-cache web
docker-compose up

# Clear bundler cache inside container
docker-compose exec web rm -rf /usr/local/bundle
docker-compose exec web bundle install

# Check Ruby version matches project constraints
docker-compose exec web ruby -v  # Should be 3.2.8
```

### **Node/NPM Issues**

**Symptoms:**
- `npm install` fails
- `node: command not found` in container
- Asset compilation errors

**Solutions:**
```bash
# Clear Node modules and reinstall
docker-compose exec web rm -rf app/frontend/node_modules
docker-compose exec web npm install --prefix app/frontend

# Check Node version (should be 18.x for Ember 3.12)
docker-compose exec web node -v

# Rebuild with fresh Node installation
docker-compose build --no-cache web
```

### **Database Issues**

**Symptoms:**
- `PG::ConnectionBad`
- `Rails couldn't connect to database`
- `FATAL: database does not exist`

**Solutions:**
```bash
# Check database service is healthy
docker-compose ps db
docker-compose logs db

# Recreate database
docker-compose exec web rails db:drop db:create db:migrate

# Reset entire database stack
docker-compose down
docker volume rm docker_postgres_data
docker-compose up -d db
# Wait for db to be healthy, then:
docker-compose exec web rails db:create db:migrate db:seed
```

---

## **Performance Issues** ⚡

### **Slow Development Environment**

**Symptoms:**
- Docker services take long to start
- File changes don't reflect immediately
- General sluggishness

**Solutions:**
```bash
# Increase Docker Desktop resources
# Windows/Mac: Docker Desktop → Settings → Resources
# Memory: 4GB minimum, 8GB recommended
# CPU: 2+ cores recommended

# Use .dockerignore to exclude unnecessary files
# Already configured, but verify no large directories are being synced

# On Mac: Use docker-sync or built-in optimizations
# On Windows: Ensure files are in WSL filesystem

# Check disk space
docker system df
docker system prune  # Remove unused containers/images
```

### **Memory Issues**

**Symptoms:**
- `Killed` processes in containers
- Services randomly stopping
- Out of memory errors

**Solutions:**
```bash
# Check memory usage
docker stats

# Increase Docker Desktop memory allocation
# Minimum 4GB, recommend 6-8GB for development

# Monitor specific services
docker-compose top
```

---

## **AI Development Issues** 🤖

### **Claude CLI Issues**

**Symptoms:**
- `claude: command not found`
- MCP connection failures
- API key issues

**Solutions:**
```bash
# Check Claude CLI installation
claude --version

# If not installed:
# Visit https://claude.ai/cli for installation

# Check API keys in environment
echo $CLAUDE_API_KEY

# Test MCP configuration
claude --mcp-config ".ai/tools/deepwiki-mcp/claude-mcp-config.json" --print "test"

# Verify paths in MCP config are correct
cat .ai/tools/deepwiki-mcp/claude-mcp-config.json
```

### **MCP Server Issues**

**Symptoms:**
- `Failed to start MCP server`
- `deepwiki connection failed`
- Context not loading

**Solutions:**
```bash
# Check Node.js is available for MCP servers
node --version
npm --version

# Test MCP server manually
cd .ai/tools/deepwiki-mcp
npx --yes mcp-deepwiki

# Check repository access
git remote -v  # Should show swahlquist/LingoLinq-AAC

# Reinstall MCP dependencies
cd .ai/tools/deepwiki-mcp
rm -rf node_modules
npm install
```

### **API Key Issues**

**Symptoms:**
- `Unauthorized` errors
- `API key invalid`
- Rate limiting errors

**Solutions:**
```bash
# Check environment variables are set
printenv | grep -i api

# Verify keys in .env file
grep -i api .env

# Test API connectivity
curl -H "Authorization: Bearer $GEMINI_API_KEY" https://generativelanguage.googleapis.com/v1/models

# Get fresh API keys:
# Gemini: https://aistudio.google.com/
# Claude: https://console.anthropic.com/
```

---

## **Git & Version Control** 📚

### **Merge Conflicts in Generated Files**

**Symptoms:**
- Conflicts in `app/assets/javascripts/`
- Package-lock.json conflicts
- Docker-generated files conflicts

**Solutions:**
```bash
# For generated assets, rebuild instead of merging
git checkout --theirs app/assets/javascripts/app.js
git checkout --theirs app/assets/javascripts/templates.js

# For package-lock.json
rm package-lock.json
npm install
git add package-lock.json

# For Docker issues
docker-compose down
docker-compose build --no-cache
```

### **Branch Structure Confusion**

**Symptoms:**
- Can't find branch-specific documentation
- AI tools not working on some branches
- Configuration inconsistencies

**Solutions:**
```bash
# Check if you're on a branch with the new structure
ls -la .ai/tools/deepwiki-mcp/

# If missing, you're on an older branch structure
# Switch to feature/llm-enhanced-inflections or main (after merge)
git checkout feature/llm-enhanced-inflections

# Or merge the latest changes
git pull origin feature/llm-enhanced-inflections
```

---

## **Testing Issues** 🧪

### **RSpec Test Failures**

**Symptoms:**
- Database setup failures in tests
- Randomly failing tests
- Test environment issues

**Solutions:**
```bash
# Run tests in clean environment
docker-compose exec web rails db:test:prepare
docker-compose exec web bundle exec rspec

# Clear test database
docker-compose exec web rails db:drop db:create RAILS_ENV=test
docker-compose exec web rails db:migrate RAILS_ENV=test

# Check test configuration
docker-compose exec web cat config/database.yml
```

### **Ember Test Issues**

**Symptoms:**
- `ember test` command fails
- PhantomJS/Chrome issues
- Asset compilation errors

**Solutions:**
```bash
# Run Ember tests in container
docker-compose exec web sh -c "cd app/frontend && ember test"

# Install missing dependencies
docker-compose exec web sh -c "cd app/frontend && npm install"
docker-compose exec web sh -c "cd app/frontend && bower install --allow-root"

# Check Ember version compatibility
docker-compose exec web sh -c "cd app/frontend && ember --version"
```

---

## **Emergency Recovery** 🚨

### **Complete Environment Reset**

**When all else fails:**
```bash
# 1. Stop everything
docker-compose down -v

# 2. Remove all Docker data
docker system prune -a --volumes
# WARNING: This removes ALL Docker data, not just LingoLinq

# 3. Fresh clone (if needed)
cd ..
rm -rf LingoLinq-AAC
git clone https://github.com/swahlquist/LingoLinq-AAC.git
cd LingoLinq-AAC

# 4. Start fresh
./bin/doctor
cd docker && docker-compose up
```

### **Backup Strategy**

**Before major changes:**
```bash
# Backup your work
git add -A
git commit -m "WIP: backup before troubleshooting"

# Create a safety branch
git checkout -b backup-$(date +%Y%m%d-%H%M)
git checkout -

# Export database if needed
docker-compose exec db pg_dump -U postgres lingolinq_development > backup.sql
```

---

## **Getting Additional Help** 🆘

### **Diagnostic Information to Collect**

Before asking for help, run these commands:
```bash
# System info
./bin/doctor > diagnostic.txt

# Docker info
docker --version >> diagnostic.txt
docker-compose --version >> diagnostic.txt
docker system df >> diagnostic.txt

# Service status
docker-compose ps >> diagnostic.txt
docker-compose logs --tail=50 web >> diagnostic.txt

# Git status
git status >> diagnostic.txt
git branch -a >> diagnostic.txt
```

### **Common Questions to Answer**
1. What were you trying to do?
2. What error message did you see?
3. What does `./bin/doctor` report?
4. What branch are you on?
5. When did this last work?

### **Where to Get Help**
1. **Check existing docs** - Read README.md, GETTING_STARTED.md
2. **Search issues** - Check GitHub issues for similar problems
3. **Team discussion** - Ask in team chat/channels
4. **Create an issue** - Document the problem for others

---

## **Prevention Tips** ✨

### **Best Practices**
- Run `./bin/doctor` regularly (weekly)
- Keep Docker Desktop updated
- Use Docker for development (not local Ruby/Node)
- Commit frequently with descriptive messages
- Follow branch naming conventions

### **Maintenance Schedule**
- **Daily**: `git pull` on your branch
- **Weekly**: `./bin/doctor` and `docker system prune`
- **Monthly**: Update Docker Desktop and dev tools
- **Before major work**: Create backup branches

---

*Need to update this guide? Found a new issue? Please contribute improvements!*

**Last updated:** 2025-09-05  
**Covers:** Docker development environment, AI tools, common issues