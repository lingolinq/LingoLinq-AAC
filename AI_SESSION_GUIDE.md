# AI Session Guide - Claude Code & Gemini Instructions

**🤖 For AI Sessions Working on LingoLinq AAC**

## 📋 MANDATORY FIRST STEPS

### **1. READ THESE FILES IMMEDIATELY:**
- `PROJECT_STATUS.md` - Current project status and completed work
- `DOCKER_ISSUES.md` - Current blocking issues and solutions
- `TEAM_ONBOARDING.md` - Setup instructions and workflows

### **2. UNDERSTAND CURRENT STATE:**
- **Security updates:** ✅ COMPLETED (Rails 6.1.7.10, 93% vulnerability reduction)
- **Branding updates:** ✅ COMPLETED (AAC App → LingoLinq AAC)
- **Docker setup:** 🚧 95% COMPLETE (psych gem issue blocking Rails server)

## 🐳 DOCKER REQUIREMENTS

### **CRITICAL RULES:**
1. **NEVER run Rails directly on host** - Always use Docker
2. **Check Docker status first** - Rails server may not start due to known issue
3. **Use workarounds** - Rails console and commands work via `bundle exec`

### **Docker Commands to Use:**
```bash
# Start environment
docker-compose -f docker/docker-compose.simple.yml up -d

# Check status
docker-compose -f docker/docker-compose.simple.yml ps

# Use Rails console (WORKS)
docker-compose -f docker/docker-compose.simple.yml exec backend bundle exec rails console

# Run migrations (WORKS)
docker-compose -f docker/docker-compose.simple.yml exec backend bundle exec rails db:migrate

# Test web server (MAY FAIL - see DOCKER_ISSUES.md)
curl http://localhost:3000
```

## ⚠️ CURRENT KNOWN ISSUES

### **Rails Server Issue (HIGH PRIORITY)**
- **Problem:** `psych` gem dependency conflict prevents Rails server startup
- **Impact:** Web interface at http://localhost:3000 doesn't work
- **Workaround:** Use `bundle exec` commands directly
- **See:** DOCKER_ISSUES.md for detailed troubleshooting

### **What WORKS:**
- ✅ PostgreSQL database
- ✅ Redis cache
- ✅ Rails console
- ✅ Database migrations
- ✅ All Rails commands via `bundle exec`

### **What DOESN'T Work:**
- ❌ Rails server startup (`rails server`)
- ❌ Web interface (http://localhost:3000)

## 🎯 TESTING & DEPLOYMENT

### **For Testing Features:**
```bash
# Use Rails console for testing
docker-compose -f docker/docker-compose.simple.yml exec backend bundle exec rails console

# Test database connectivity
docker-compose -f docker/docker-compose.simple.yml exec backend bundle exec rails runner "puts User.count"

# Run specific commands
docker-compose -f docker/docker-compose.simple.yml exec backend bundle exec rails routes
```

### **Branch Strategy:**
- **Current work:** `epic/tech-debt-and-security` 
- **Testing:** `test/repo-reorganization`
- **Production:** `main`

## 🔧 DEVELOPMENT WORKFLOW

### **If Fixing the psych Issue:**
1. Read DOCKER_ISSUES.md for attempted solutions
2. Try the suggested fixes in order
3. Update documentation when successful
4. Test full workflow: `docker-compose up` → `curl http://localhost:3000`

### **If Working on Other Features:**
1. Use the workarounds (bundle exec commands)
2. Focus on backend logic and database work
3. Test via Rails console
4. Coordinate with team for frontend testing

## 📝 DOCUMENTATION UPDATES

### **When You Make Progress:**
1. Update PROJECT_STATUS.md with current status
2. Add solutions to DOCKER_ISSUES.md
3. Update this file if workflow changes
4. Commit changes with clear messages

### **Status File Locations:**
- `PROJECT_STATUS.md` - Overall project journal
- `DOCKER_ISSUES.md` - Technical issues and solutions  
- `TEAM_ONBOARDING.md` - New team member guide
- `AI_SESSION_GUIDE.md` - This file (for AI sessions)

## 🚨 NEVER DO THESE:

- ❌ Run `rails server` on host system
- ❌ Install Ruby/Rails locally
- ❌ Ignore the Docker requirements
- ❌ Assume web interface works without testing
- ❌ Skip reading the status documentation

## ✅ SUCCESS CRITERIA

### **For This Project:**
1. All team members can use Docker environment
2. Rails server starts successfully in Docker
3. Web interface loads at http://localhost:3000
4. Database and cache work correctly
5. Development workflow is smooth across platforms

### **Current Progress:**
- ✅ Security: 93% complete (only 2 minor CVEs remain)
- ✅ Branding: 100% complete for user-facing text
- ✅ Docker: 95% complete (psych gem blocking)
- ✅ Documentation: Comprehensive guides created

---

**🎯 REMEMBER: This project is 95% ready for full deployment. The psych gem issue is the main remaining blocker. Focus on either fixing that issue or using the workarounds for other development work.**