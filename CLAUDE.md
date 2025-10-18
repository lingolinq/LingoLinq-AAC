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
- ✅ **DEPLOYMENT SUCCESS**: Fly.io deployment fully operational as of October 17, 2025
- ✅ Docker container builds and deploys successfully using `Dockerfile.singlestage`
- ✅ JavaScript namespace fixes included in compiled assets
- ✅ Ruby version compatibility resolved (3.2.8)
- ✅ Database configured with managed PostgreSQL (ey5qn0y96evr8zmw)
- ✅ All required secrets configured (DATABASE_URL, SECRET_KEY_BASE, RAILS_MASTER_KEY, DISABLE_OBF_GEM)
- ✅ Application startup process working correctly
- ✅ Puma web server binding to 0.0.0.0:3000 (config/puma.rb:20)
- ✅ Startup script using correct config flag (bin/render-start.sh:32)
- ✅ Health checks passing (2 total, 2 passing)
- ✅ App accessible at https://lingolinq-aac.fly.dev

## ⚙️ Environment & Architecture

### Docker Strategy
- **Why Docker**: Isolates legacy Ember 3.12 + Rails 6.1 stack from modern host tools
- **Build Context**: Always build from project root, not subdirectories
- **Asset Pipeline**: 🆕 **LOCAL PRE-COMPILATION** strategy (as of Oct 17, 2025)
  - Ember assets built locally with `./bin/build-ember-local`
  - Pre-built assets committed to Git (`app/frontend/dist/`)
  - Dockerfile copies pre-built assets (no npm/bower/ember build in container)
  - Rails `assets:precompile` only processes Rails assets (application.js, application.css)

### Technical Stack
- **Host OS**: Windows 11
- **Shell**: Windows Terminal
- **Frontend**: Ember 3.12 (legacy) with Bower dependencies
  - 🆕 Built locally, committed to Git
  - Build script: `./bin/build-ember-local` or `bin\build-ember-local.bat` (Windows)
- **Backend**: Rails 6.1.7 with Ruby 3.2.8
- **Database**: PostgreSQL + Redis
- **Container**: Docker (simplified - no npm/bower/ember build)
- **Deployment**: Fly.io with manual deploys

## 🔄 Frontend Build Workflow (NEW as of Oct 17, 2025)

### Making Frontend Changes

1. **Edit Ember code** in `app/frontend/app/`
2. **Build locally:**
   ```bash
   ./bin/build-ember-local           # Linux/Mac/Git Bash
   # or
   bin\build-ember-local.bat         # Windows CMD/PowerShell
   ```
3. **Test locally** (optional but recommended):
   ```bash
   docker-compose up
   # or
   bundle exec rails server
   ```
4. **Commit built assets:**
   ```bash
   git add app/frontend/dist/
   git commit -m "build: Update Ember assets"
   ```
5. **Deploy:**
   ```bash
   flyctl deploy --app lingolinq-aac
   ```

### Why This Workflow?

**Previous Problem:**
- Ember built inside Docker during deployment
- Deployed JavaScript contained old/broken code
- Inconsistent builds, hard to debug

**Current Solution:**
- Build Ember locally, commit to Git
- Deploy exactly what you tested locally
- Faster deployments, easier debugging
- See `.ai/docs/EMBER_BUILD_PROCESS.md` for details

## ❌ Common Issues & Solutions

### Deployed JavaScript Has Old Code
- **Problem**: Browser shows old/broken code after deployment
- **Cause**: Forgot to build Ember locally before deploying
- **Solution**: Run `./bin/build-ember-local`, commit `app/frontend/dist/`, then deploy
- **Verify**: Check `app/frontend/dist/assets/frontend.js` locally before committing

### SweetSuite/LingoLinq Namespace Conflicts
- **Problem**: JavaScript errors like `LingoLinqAAC.track_error is not a function`
- **Cause**: Incomplete rename from SweetSuite → LingoLinq
- **Solution**: Create compatibility bridges: `LingoLinqAAC.method = SweetSuite.method`
- **Pattern**: Keep working SweetSuite backend, bridge to LingoLinq frontend calls

### Legacy Dependencies
- **OBF Gem**: Use `DISABLE_OBF_GEM=true` during Docker builds to avoid compilation issues
- **Bower**: 🆕 Only needed for local builds (not in Dockerfile anymore)
- **Node 18**: 🆕 Only needed for local builds (not in Dockerfile anymore)

### Docker Build Issues
- **Context**: Always build from project root, not app subdirectories
- **File Paths**: Use relative paths from project root in Dockerfile
- **Missing Assets**: Dockerfile will fail if `app/frontend/dist/` not committed to git

## ✅ Fixes Completed
- **JavaScript Namespace Fix**: `LingoLinqAAC.track_error = SweetSuite.track_error` compatibility bridge (app/frontend/app/app.js:859)
- 🆕 **LOCAL PRE-COMPILATION STRATEGY** (Oct 17, 2025):
  - Ember assets built locally with `./bin/build-ember-local`
  - Pre-built assets committed to Git (`app/frontend/dist/`)
  - Dockerfile simplified (no npm/bower/ember build)
  - `.gitignore` updated to allow `app/frontend/dist/` commits
  - Documentation: `.ai/docs/EMBER_BUILD_PROCESS.md`
- **Docker Build Optimization**: Simplified Dockerfile using pre-built assets
- **CI Pipeline**: GitHub Actions workflow with Render API integration and loop prevention
- **Symlink Issues**: Large frontend.js/vendor.js files removed from git tracking
- **Asset Compilation**: Environment variable strategy for obf gem isolation
- **Documentation**: Comprehensive CLAUDE.md with architectural context
- **File Structure**: `.ai/docs/` directory with LOCAL_DEVELOPMENT.md, JAVASCRIPT_NAMESPACE_FIXES.md, EMBER_BUILD_PROCESS.md
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

## 🧩 AI Assistant Instructions (Claude Code & Gemini CLI)

### 🚨 MANDATORY PRE-FLIGHT CHECK: Deployment Questions

**CRITICAL**: When ANY user request involves deployment, configuration, or production issues, you MUST complete this analysis BEFORE suggesting solutions.

**Quick Reference**: See `.ai/DEPLOYMENT_CHECKLIST.md` for detailed examples, red flags, and troubleshooting patterns.

#### Phase 1: Read Critical Configuration Files

Read these files in order and summarize key findings:

1. **README.md** - Understand project history (Heroku fork), proven deployment methods, current status
2. **.env.example** - Identify ALL required environment variables and secrets
3. **fly.toml** - Analyze deployment config, Dockerfile reference, release commands, health checks
4. **Dockerfile.singlestage** - Understand build process, dependencies, environment setup
5. **config/puma.rb** - Verify web server binding configuration (MUST bind to 0.0.0.0)
6. **bin/render-start.sh** - Check startup command (MUST use `-C config/puma.rb`)

#### Phase 2: Verify Current State

Before suggesting changes, verify:

- [ ] Which Dockerfile is `fly.toml` using?
- [ ] Are all required secrets configured? (DATABASE_URL, SECRET_KEY_BASE, RAILS_MASTER_KEY, DISABLE_OBF_GEM)
- [ ] Is Puma binding to `0.0.0.0` (not `localhost` or `127.0.0.1`)?
- [ ] Is the startup script using `-C config/puma.rb`?
- [ ] What is the current deployment status? (Check with `flyctl status` or `flyctl logs`)

#### Phase 3: Understand Known Issues

Check CLAUDE.md sections:
- **Current Status**: What's already working?
- **Common Issues & Solutions**: Has this been solved before?
- **Fixes Completed**: What was already attempted?

#### Phase 4: Only THEN Suggest Solutions

After completing phases 1-3, provide:
1. **Summary**: Brief overview of what you found
2. **Root Cause**: Specific issue identified
3. **Solution**: Targeted fix with file references and line numbers
4. **Verification**: How to confirm the fix worked

**DO NOT skip this process.** Many deployment issues are configuration mismatches that only become clear after reviewing all files together.

### Core Principles
- **Preserve Working Code**: Never break existing SweetSuite functionality during LingoLinq migration
- **Compatibility First**: Create bridges between SweetSuite/LingoLinq namespaces rather than mass renaming
- **Docker Isolation**: Use containerized environment for all legacy stack development
- **Incremental Updates**: Prioritize stability over modernization until core issues resolved
- **Configuration Review First**: Always read configuration files before suggesting deployment changes

### Decision Making Guidelines
- **SweetSuite vs LingoLinq**: Keep SweetSuite for internal/backend, use LingoLinq for user-facing only
- **Node Versions**: Use Node 18.x in Docker despite Ember 3.12 legacy constraints
- **Build Strategy**: Build from project root, use environment variables for conditional compilation
- **Error Handling**: Create compatibility shims rather than fixing root namespace issues
- **Deployment Debugging**: Follow the mandatory pre-flight check before diagnosing issues

### Session Context
- Use this file as persistent architectural context across all Claude Code sessions
- Reference these patterns when encountering similar SweetSuite/LingoLinq conflicts
- Apply Docker-first approach to development and debugging
- Document new patterns discovered in this file for future sessions
- **ALWAYS complete the deployment pre-flight check when configuration or deployment questions arise**
