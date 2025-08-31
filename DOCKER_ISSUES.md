# Docker Deployment Issues & Solutions

**Status:** 🚧 IN PROGRESS  
**Last Updated:** August 14, 2025  
**Priority:** HIGH (Blocking full deployment)

## 🚨 Current Blocking Issue: psych Gem Dependency

### **Problem Description**
Rails server fails to start in Docker container due to bundler dependency resolution error:

```
bundler: failed to load command: rails (/usr/local/bundle/ruby/3.2.0/bin/rails)
Could not find irb-1.15.2, sass-rails-6.0.0, sdoc-2.6.1, rdoc-6.14.2, sassc-rails-2.1.2, psych-5.2.6 in locally installed gems (Bundler::GemNotFound)
```

### **Current Status**
- ✅ PostgreSQL 15: Running and healthy
- ✅ Redis 7: Running and healthy
- ✅ System dependencies: Install successfully
- ✅ Ruby gems: Install successfully (including Rails 6.1.7.10)
- ❌ Rails server: Fails to start due to gem resolution

### **What Works (Workarounds)**
```bash
# These commands work in the Docker container:
docker-compose -f docker/docker-compose.simple.yml exec backend bundle exec rails console
docker-compose -f docker/docker-compose.simple.yml exec backend bundle exec rails routes
docker-compose -f docker/docker-compose.simple.yml exec backend bundle check
```

### **What Doesn't Work**
```bash
# This fails:
docker-compose -f docker/docker-compose.simple.yml exec backend bundle exec rails server
curl http://localhost:3000  # Connection refused
```

## 🔍 Technical Analysis

### **Root Cause**
The issue appears to be a bundler dependency resolution problem specifically with:
- `psych` gem (YAML parser)
- `irb`, `sass-rails`, `sdoc`, `rdoc`, `sassc-rails` dependencies

This is a known issue with Ruby 3.2.x + Rails 6.1.x combinations in containerized environments.

### **Attempted Solutions**
1. ✅ **Bundle cache cleanup** - Cleared all Docker volumes and cache
2. ✅ **Volume mapping fixes** - Fixed Windows/Git Bash path issues
3. ✅ **Line ending fixes** - Added .gitattributes for CRLF/LF handling
4. ✅ **Improved startup script** - Better bundler configuration
5. ⏳ **Next to try** - Gemfile.lock regeneration, different base image

## 🛠️ Solutions to Try

### **Solution 1: Regenerate Gemfile.lock in Container**
```bash
# Delete current lock file and regenerate in clean container
docker-compose -f docker/docker-compose.simple.yml exec backend rm Gemfile.lock
docker-compose -f docker/docker-compose.simple.yml exec backend bundle install
```

### **Solution 2: Fix bundler configuration**
```bash
# Try different bundler settings
docker-compose -f docker/docker-compose.simple.yml exec backend bundle config set --local deployment false
docker-compose -f docker/docker-compose.simple.yml exec backend bundle config set --local cache_path /usr/local/bundle/cache
docker-compose -f docker/docker-compose.simple.yml exec backend bundle install --redownload
```

### **Solution 3: Different Ruby base image**
Try `ruby:3.2.8` (full) instead of `ruby:3.2.8-slim`:
```yaml
# In docker-compose.simple.yml
image: ruby:3.2.8  # Instead of ruby:3.2.8-slim
```

### **Solution 4: Lock specific gem versions**
Add to Gemfile:
```ruby
gem 'psych', '~> 5.1.0'  # Force compatible version
gem 'irb', '~> 1.14.0'
```

## 📋 Troubleshooting Steps for Team

### **For New Team Members**
If you encounter the psych gem issue:

1. **Check current status:**
   ```bash
   docker-compose -f docker/docker-compose.simple.yml ps
   docker-compose -f docker/docker-compose.simple.yml logs backend --tail=20
   ```

2. **Use workaround for development:**
   ```bash
   # Access Rails console (this works)
   docker-compose -f docker/docker-compose.simple.yml exec backend bundle exec rails console
   
   # Run database migrations
   docker-compose -f docker/docker-compose.simple.yml exec backend bundle exec rails db:migrate
   
   # Check routes
   docker-compose -f docker/docker-compose.simple.yml exec backend bundle exec rails routes
   ```

3. **Try solutions above** in order until Rails server starts

### **For AI Sessions (Claude/Gemini)**
If working on this project:

1. **Read this file first** to understand current blocking issue
2. **Don't assume Docker works** - check status with team
3. **Use workarounds** for testing if server doesn't start
4. **Try the solutions above** if attempting to fix the issue
5. **Update this file** with any new findings or solutions

## 🎯 Success Criteria

The Docker deployment will be considered fixed when:
- ✅ All three services start successfully (PostgreSQL, Redis, Rails)
- ✅ Rails server responds to `curl http://localhost:3000`
- ✅ No bundler gem resolution errors in logs
- ✅ Web application loads in browser

## 📞 Communication

### **If You Fix This Issue:**
1. Update this file with the solution
2. Update PROJECT_STATUS.md
3. Test the full workflow: `docker-compose up` → `curl http://localhost:3000`
4. Document the fix for future team members

### **If You're Blocked:**
1. Use the workarounds listed above
2. Focus on other development tasks
3. Coordinate with team to prioritize the fix

---

**🔧 This is the main blocking issue for Docker deployment. Once resolved, the development environment will be fully functional across all platforms.**