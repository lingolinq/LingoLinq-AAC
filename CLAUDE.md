# CLAUDE.md

## 🧠 Project Overview
LingoLinq-AAC is a forked and rebranded version of SweetSuite, an AAC (Augmentative and Alternative Communication) application. The project uses Docker to isolate the legacy Ember 3.12 + Rails 6.1 stack while maintaining modern host versions.

### 🏷️ **CRITICAL: SweetSuite → LingoLinq Rename Context**
- **Original**: Application was called "SweetSuite"
- **Current**: Rebranding to "LingoLinq" for customer-facing elements
- **Backend**: Keep SweetSuite names in internal/backend code where it works
- **Frontend**: Use LingoLinq for user-facing elements only
- **Compatibility**: Create bridges where both names need to coexist (e.g., `LingoLinqAAC.track_error = SweetSuite.track_error`)
- **DO NOT**: Break working SweetSuite functionality during rename

## 🧪 Current Status
- ✅ **DEPLOYMENT SUCCESS**: Fly.io deployment working as of September 26, 2025
- ✅ Docker container builds and deploys successfully using `Dockerfile.temp`
- ✅ JavaScript namespace fixes included in compiled assets
- ✅ Ruby version compatibility resolved (3.2.9)
- ✅ Database configured with managed PostgreSQL
- ✅ All required secrets configured (DATABASE_URL, SECRET_KEY_BASE, RAILS_MASTER_KEY)
- ✅ Application startup process working correctly

## ⚙️ Environment & Architecture

### Docker Strategy
- **Why Docker**: Isolates legacy Ember 3.12 + Rails 6.1 stack from modern host tools
- **Node Version**: Use Node 18.x in container (legacy Ember 3.12 compatible)
- **Build Context**: Always build from project root, not subdirectories
- **Asset Pipeline**: Rails asset precompilation with conditional obf gem loading

### Technical Stack
- **Host OS**: Windows 11
- **Shell**: Windows Terminal
- **Frontend**: Ember 3.12 (legacy) with Bower dependencies
- **Backend**: Rails 6.1.7 with Ruby 3.2.8
- **Database**: PostgreSQL + Redis
- **Container**: Docker with multi-stage builds
- **Deployment**: Render.com with automated CI/CD

## ❌ Common Issues & Solutions

### SweetSuite/LingoLinq Namespace Conflicts
- **Problem**: JavaScript errors like `LingoLinqAAC.track_error is not a function`
- **Cause**: Incomplete rename from SweetSuite → LingoLinq
- **Solution**: Create compatibility bridges: `LingoLinqAAC.method = SweetSuite.method`
- **Pattern**: Keep working SweetSuite backend, bridge to LingoLinq frontend calls

### Legacy Dependencies
- **OBF Gem**: Use `DISABLE_OBF_GEM=true` during Docker builds to avoid compilation issues
- **Bower**: Required for legacy frontend dependencies, install with `--allow-root` in container
- **Node 18**: Works despite Ember 3.12 suggesting Node 16 compatibility

### Docker Build Issues
- **Context**: Always build from project root, not app subdirectories
- **File Paths**: Use relative paths from project root in Dockerfile
- **Symlinks**: Large JS files removed from git to avoid GitHub Actions symlink errors

## ✅ Fixes Completed
- **JavaScript Namespace Fix**: `LingoLinqAAC.track_error = SweetSuite.track_error` compatibility bridge (app/frontend/app/app.js:859)
- **Docker Build Optimization**: Multi-stage build with conditional obf gem loading
- **CI Pipeline**: GitHub Actions workflow with Render API integration and loop prevention
- **Symlink Issues**: Large frontend.js/vendor.js files removed from git tracking
- **Asset Compilation**: Environment variable strategy for obf gem isolation
- **Documentation**: Comprehensive CLAUDE.md with architectural context
- **File Structure**: `.ai/docs/` directory with LOCAL_DEVELOPMENT.md, JAVASCRIPT_NAMESPACE_FIXES.md
- **GitHub Integration**: Issue #5 for Ember modernization tracking

## 🔜 Next Steps
- ✅ **COMPLETED**: Production deployment working on Fly.io
- ✅ **COMPLETED**: JavaScript namespace fixes deployed
- ✅ **COMPLETED**: Database connectivity established
- 🔄 **IN PROGRESS**: Database migrations completing automatically
- 📋 **TODO**: Test login functionality once app is fully ready
- 📋 **TODO**: Plan incremental Ember 3.12 → modern stack migration strategy

## 📊 Key Metrics & Endpoints
- **Production App**: https://lingolinq-aac.fly.dev
- **Health Check**: https://lingolinq-aac.fly.dev/api/v1/status/heartbeat
- **Database**: Fly.io Managed PostgreSQL (ey5qn0y96evr8zmw)
- **Local Container**: http://localhost:3000
- **Login Page**: http://localhost:3000/login
- **Local Health**: http://localhost:3000/health

## 🤖 AI Token Monitoring & Management

### Token Status Monitoring
- **Quick Check**: `devin tokens` - Complete AI token dashboard
- **Gemini Only**: `devin tokens gemini` - Gemini CLI usage and quotas
- **Claude Only**: `devin tokens claude` - Claude Code status
- **Usage Trends**: `devin tokens trends` - Historical usage analysis
- **Optimization Tips**: `devin tokens tips` - Recommendations for efficient usage

### Direct Token Commands
- **Full Dashboard**: `bin/token-status` - Comprehensive monitoring script
- **Export Report**: `bin/token-status export` - Generate markdown usage report
- **Help**: `bin/token-status help` - All available commands

### Current AI Tool Status
- **Gemini CLI**: ✅ Built-in token monitoring with `gemini usage --detailed`
- **Claude Code**: ⚠️ Manual monitoring via https://console.anthropic.com/dashboard
- **Usage Logs**: Automatically saved to `.ai/usage-logs/` directory

### 2025 Token Quotas
**Gemini Free Tier:**
- 60 requests per minute
- 1,000 requests per day
- 1M token context window
- Automatic caching available

**Claude Code:**
- Varies by subscription plan
- Check dashboard for current limits
- No CLI monitoring available

### Smart AI Selection Strategy
- **Use Gemini for**: Large context analysis, code generation, architecture reviews
- **Use Claude Code for**: Precise file edits, deployment operations, debugging
- **Monitor quotas**: Switch between tools based on availability
- **Enable caching**: `gemini config set --cache-enabled=true` for better efficiency

## 🧩 Claude Code Instructions

### Core Principles
- **Preserve Working Code**: Never break existing SweetSuite functionality during LingoLinq migration
- **Compatibility First**: Create bridges between SweetSuite/LingoLinq namespaces rather than mass renaming
- **Docker Isolation**: Use containerized environment for all legacy stack development
- **Incremental Updates**: Prioritize stability over modernization until core issues resolved

### Decision Making Guidelines
- **SweetSuite vs LingoLinq**: Keep SweetSuite for internal/backend, use LingoLinq for user-facing only
- **Node Versions**: Use Node 18.x in Docker despite Ember 3.12 legacy constraints
- **Build Strategy**: Build from project root, use environment variables for conditional compilation
- **Error Handling**: Create compatibility shims rather than fixing root namespace issues

### Session Context
- Use this file as persistent architectural context across all Claude Code sessions
- Reference these patterns when encountering similar SweetSuite/LingoLinq conflicts
- Apply Docker-first approach to development and debugging
- Document new patterns discovered in this file for future sessions
