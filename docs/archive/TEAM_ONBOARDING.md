# LingoLinq AAC - Team Onboarding Guide

**Welcome to the LingoLinq AAC development team!** 🎉

This guide will get you up and running quickly, regardless of whether you're using Windows, Mac, or Linux.

## 📋 Quick Start Checklist

- [ ] Install Docker Desktop
- [ ] Clone the repository
- [ ] Start Docker environment
- [ ] Verify setup works
- [ ] Read current project status

## 🛠️ Prerequisites

### **All Platforms Need:**
1. **Docker Desktop** - [Download here](https://www.docker.com/products/docker-desktop/)
2. **Git** - For cloning the repository
3. **Code Editor** - VS Code recommended

### **Platform-Specific Setup:**

#### **Windows Developers:**
- Install **Git Bash** (comes with Git for Windows)
- Use Git Bash terminal for all commands
- Docker Desktop handles Windows integration

#### **Mac Developers:**
- Use built-in Terminal app
- Docker Desktop integrates seamlessly

#### **Linux Developers:**
- Install Docker Engine (not Docker Desktop)
- Use any terminal

## 🚀 Setup Instructions

### **Step 1: Clone Repository**
```bash
git clone <repository-url>
cd LingoLinq-AAC
```

### **Step 2: Start Docker Environment**
```bash
# Start all services (PostgreSQL, Redis, Rails)
docker-compose -f docker/docker-compose.simple.yml up -d

# Check status (should show 3 running containers)
docker-compose -f docker/docker-compose.simple.yml ps
```

### **Step 3: Wait for Setup**
⏱️ **First run takes 5-10 minutes** (downloads and installs everything)
```bash
# Follow the logs to see progress
docker-compose -f docker/docker-compose.simple.yml logs backend -f

# Press Ctrl+C to stop following logs
```

### **Step 4: Test Your Setup**

#### **If Rails Server Starts Successfully:**
```bash
# Test the application
curl http://localhost:3000
# Should return HTML content

# Open in browser
# Visit: http://localhost:3000
```

#### **If Rails Server Has Issues (Current Known Issue):**
Don't worry! Use these workarounds:
```bash
# Access Rails console (this works)
docker-compose -f docker/docker-compose.simple.yml exec backend bundle exec rails console

# Run Rails commands
docker-compose -f docker/docker-compose.simple.yml exec backend bundle exec rails routes

# Check database
docker-compose -f docker/docker-compose.simple.yml exec backend bundle exec rails db:migrate
```

## 🐳 Daily Development Workflow

### **Starting Work:**
```bash
# Start the environment
docker-compose -f docker/docker-compose.simple.yml up -d

# Check everything is running
docker-compose -f docker/docker-compose.simple.yml ps
```

### **During Development:**
- Edit code in your normal editor (VS Code, etc.)
- Changes are automatically synced to the Docker container
- Refresh browser to see changes
- Use Rails console for testing: `docker-compose -f docker/docker-compose.simple.yml exec backend bundle exec rails console`

### **Ending Work:**
```bash
# Stop the environment
docker-compose -f docker/docker-compose.simple.yml down
```

## 📚 Important Files to Know

### **For Development:**
- `PROJECT_STATUS.md` - **READ THIS FIRST** - Current project status
- `CLAUDE.md` - Docker command reference for AI sessions
- `DOCKER_ISSUES.md` - Current known issues and solutions

### **For Configuration:**
- `docker/docker-compose.simple.yml` - Docker service configuration
- `docker/startup.sh` - Container startup script
- `Gemfile` - Ruby dependencies

## 🚨 Current Known Issues

### **Rails Server Issue (August 2025)**
**Problem:** Rails server may fail to start due to `psych` gem dependency
**Impact:** Web interface at http://localhost:3000 may not work
**Workaround:** Use direct Rails commands (see DOCKER_ISSUES.md)
**Status:** HIGH priority fix needed

### **What Still Works:**
- ✅ Database (PostgreSQL)
- ✅ Cache (Redis)  
- ✅ Rails console
- ✅ Rails commands (migrate, routes, etc.)
- ✅ Code editing and development

## 🆘 Troubleshooting

### **Docker Won't Start:**
```bash
# Check Docker is running
docker --version

# Check if ports are in use
docker-compose -f docker/docker-compose.simple.yml down
```

### **Container Issues:**
```bash
# Restart everything fresh
docker-compose -f docker/docker-compose.simple.yml down -v
docker-compose -f docker/docker-compose.simple.yml up -d

# Check logs for errors
docker-compose -f docker/docker-compose.simple.yml logs
```

### **Code Changes Not Showing:**
- Check file is saved
- Refresh browser
- Restart Rails server if needed

## 🌟 Team Collaboration

### **Branch Strategy:**
- **Main development:** `epic/tech-debt-and-security`
- **Testing:** `test/repo-reorganization` 
- **Production:** `main`

### **Before Committing:**
```bash
# Run tests (when Rails server works)
docker-compose -f docker/docker-compose.simple.yml exec backend bundle exec rspec

# Check code quality
docker-compose -f docker/docker-compose.simple.yml exec backend bundle exec rubocop
```

### **Sharing Issues:**
1. Check PROJECT_STATUS.md for known issues
2. Check DOCKER_ISSUES.md for current blockers
3. Share specific error messages with team
4. Include Docker logs when asking for help

## 🎯 Success Indicators

**You're ready to develop when:**
- ✅ Docker containers start without errors
- ✅ Rails console works
- ✅ Database migrations run successfully
- ✅ You can edit code and see changes

**Bonus (when Rails server issue is fixed):**
- ✅ http://localhost:3000 loads the application
- ✅ You can log in and use the AAC interface

## 📞 Getting Help

### **For Technical Issues:**
1. Check current documentation (PROJECT_STATUS.md, DOCKER_ISSUES.md)
2. Try the troubleshooting steps above
3. Share specific error messages with the team
4. Include your platform (Windows/Mac/Linux)

### **For New AI Sessions:**
If you're working with Claude or Gemini:
1. **Always read PROJECT_STATUS.md first**
2. Reference CLAUDE.md for Docker commands
3. Check DOCKER_ISSUES.md for current blockers
4. Use Docker for all Rails operations

---

**🎉 Welcome to the team! This Docker setup ensures we all develop in identical environments, making collaboration smooth and deployment reliable.**