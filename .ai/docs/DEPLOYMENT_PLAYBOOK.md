# LingoLinq-AAC Deployment Playbook

**Version:** 1.0
**Last Updated:** October 2025
**Status:** Production-Ready

---

## Table of Contents
1. [Deployment Strategy: Docker First](#1-deployment-strategy-docker-first)
2. [Platform Options](#2-platform-options)
3. [Asset Pipeline & Build Steps](#3-asset-pipeline--build-steps)
4. [Required Environment Variables](#4-required-environment-variables)
5. [AI Orchestration Strategy](#5-ai-orchestration-strategy)
6. [Deployment Verification Checklist](#6-deployment-verification-checklist)
7. [Platform-Specific Guides](#7-platform-specific-guides)
8. [Troubleshooting](#8-troubleshooting)

---

## 1. Deployment Strategy: Docker First

### Why Docker?
LingoLinq-AAC uses Docker to isolate the legacy Ember 3.12 + Rails 6.1 stack from modern host environments. This strategy:
- ✅ Prevents version conflicts between legacy and modern tooling
- ✅ Ensures consistent builds across development and production
- ✅ Enables deployment on any Docker-compatible platform
- ✅ Maintains stability while planning future upgrades

### Core Principles
- **Primary deployment method**: Docker containers
- **Recommended platform**: Railway (Docker support, stable builds, good UX)
- **Alternatives**: Fly.io, Render.com (with caveats)
- **Local development**: Always use Docker (see LOCAL_DEVELOPMENT.md)

### Current Production Status
- ✅ **Fly.io deployment**: Working as of September 26, 2025
- ✅ **JavaScript namespace fixes**: Deployed and validated
- ✅ **Database connectivity**: Established with managed PostgreSQL
- ✅ **Asset compilation**: Stable via environment variables
- 📋 **Login functionality**: Ready for full user acceptance testing

---

## 2. Platform Options

### Railway (Recommended) 🚄

**Why Railway?**
- Excellent Docker support with no caching issues
- Modern alternative to Heroku
- Simple dashboard UI for non-technical users
- Automatic PostgreSQL and Redis provisioning
- GitHub integration for CI/CD

**Pros:**
- ✅ Clean Docker builds without cache corruption
- ✅ Comprehensive build and runtime logging
- ✅ Automatic HTTPS with custom domains
- ✅ Database backups and monitoring included

**Cons:**
- ❌ Pricing can scale with usage
- ❌ Smaller community than Heroku/AWS

### Fly.io (Proven Alternative) ✈️

**Why Fly.io?**
- Robust Docker deployment with global edge locations
- Low-latency access worldwide
- Strong CLI tooling for developers
- Managed PostgreSQL available

**Pros:**
- ✅ `fly.toml` configuration already included
- ✅ Health checks and auto-scaling support
- ✅ Free tier available for small apps
- ✅ Direct machine SSH access for debugging

**Cons:**
- ❌ More CLI-focused (less dashboard UI)
- ❌ Requires understanding of Fly.io concepts

### Render.com (Alternative with Caveats) 🔧

**Status:** Previously attempted, had cache issues

**Pros:**
- ✅ Easy Rails deployment
- ✅ Free tier for static sites
- ✅ GitHub integration

**Cons:**
- ❌ Docker cache corruption issues encountered
- ❌ Required "nuclear" cache-breaking strategies
- ❌ Less reliable for this specific stack

**Recommendation:** Use Railway or Fly.io instead unless Render cache issues are resolved.

---

## 3. Asset Pipeline & Build Steps

### Build Process Overview
The Docker build follows this sequence:

```dockerfile
1. Install system dependencies (build-essential, nodejs, yarn)
2. Install Ruby gems (bundle install with DISABLE_OBF_GEM=true)
3. Install JS dependencies (yarn install in app/frontend)
4. Build Ember frontend (ember build --environment=production)
5. Precompile Rails assets (bundle exec rails assets:precompile)
6. Start application server (puma)
```

### Critical Build Requirements

#### System Dependencies
```dockerfile
RUN apt-get update -qq && apt-get install -y \
    build-essential \
    libpq-dev \
    nodejs \
    yarn \
    git
```

#### Ruby Gem Installation
```bash
# CRITICAL: Disable obf gem to prevent compilation failures
ENV DISABLE_OBF_GEM=true
RUN bundle install --without development test
```

#### Frontend Asset Compilation
```bash
# Install Ember dependencies
WORKDIR /app/app/frontend
RUN yarn install

# Build Ember application
RUN ember build --environment=production
```

#### Rails Asset Precompilation
```bash
# Return to Rails root
WORKDIR /app
RUN bundle exec rails assets:precompile
```

### Asset Verification
After build, verify compiled assets exist:
- `public/assets/application-*.js` (contains namespace fixes)
- `public/assets/application-*.css`
- `app/frontend/dist/assets/` (Ember build output)

**Expected Success Indicators:**
```bash
✅ "Successfully compiled frontend assets"
✅ "Assets precompiled successfully"
✅ 34+ instances of "track_error" in compiled JS
✅ SweetSuite namespace initialization present
```

---

## 4. Required Environment Variables

### Production Environment Variables

#### Essential Rails Configuration
```bash
RAILS_ENV=production
RACK_ENV=production
NODE_ENV=production
RAILS_SERVE_STATIC_FILES=true
RAILS_LOG_TO_STDOUT=true
```

#### Security & Secrets
```bash
# Generate with: openssl rand -hex 64
SECRET_KEY_BASE=<64-character random string>

# Provided by Rails credentials
RAILS_MASTER_KEY=<master key from config/master.key>
```

#### Build Configuration
```bash
# CRITICAL: Prevents obf gem compilation issues
DISABLE_OBF_GEM=true
```

#### Database & Cache
```bash
# Automatically provided by hosting platform
DATABASE_URL=postgresql://user:password@host:5432/database

# Optional: Redis for caching/background jobs
REDIS_URL=redis://host:6379/0
```

### Environment Variable Setup by Platform

#### Railway
Set via **Variables** tab in project dashboard:
1. Click **"+ New Variable"**
2. Add each key-value pair
3. Variables are encrypted automatically
4. `DATABASE_URL` set automatically when PostgreSQL added

#### Fly.io
Set via `fly secrets`:
```bash
fly secrets set SECRET_KEY_BASE=$(openssl rand -hex 64)
fly secrets set RAILS_MASTER_KEY=<your_master_key>
fly secrets set DISABLE_OBF_GEM=true
```

Database URL provided by attached Postgres app.

---

## 5. AI Orchestration Strategy

### Multi-AI Workflow for Deployments

LingoLinq-AAC uses a coordinated approach between Gemini and Claude Code for optimal deployment outcomes.

#### AI Tool Strengths

**Gemini CLI - Execution & Analysis:**
- ✅ Execute deployments and monitor logs
- ✅ Analyze error patterns in real-time
- ✅ Adjust configurations and retry builds
- ✅ Large context window for log analysis
- ✅ Built-in token monitoring

**Claude Code - Strategy & Troubleshooting:**
- ✅ High-level deployment strategy
- ✅ Cross-reference historical issues
- ✅ Architectural decision-making
- ✅ Documentation updates
- ✅ Complex debugging scenarios

#### Recommended Workflow

```
1. Planning Phase (Claude Code)
   ├─ Review deployment requirements
   ├─ Check historical issues in CLAUDE.md
   └─ Prepare deployment checklist

2. Execution Phase (Gemini)
   ├─ Execute deployment commands
   ├─ Monitor build logs in real-time
   ├─ Capture error messages
   └─ Attempt standard fixes

3. Analysis Phase (Claude Code if errors occur)
   ├─ Analyze error patterns
   ├─ Cross-reference known issues
   ├─ Propose solution strategy
   └─ Update documentation

4. Resolution Phase (Gemini)
   ├─ Apply Claude's recommended fixes
   ├─ Re-deploy with corrections
   ├─ Validate success
   └─ Report final status

5. Documentation Phase (Claude Code)
   ├─ Update deployment playbook
   ├─ Record new issues/solutions
   └─ Update CLAUDE.md if needed
```

#### Communication Protocol

**Gemini → Claude Handoffs:**
- Include complete error logs
- Note attempted solutions
- Specify platform and configuration
- Share deployment timeline

**Claude → Gemini Handoffs:**
- Provide specific commands to execute
- Explain reasoning for each fix
- Set success criteria
- Define fallback options

#### AI Selection Guidelines

**Use Gemini for:**
- Deploying to Railway, Fly.io, or Render
- Monitoring deployment logs
- Quick configuration adjustments
- Iterative build attempts

**Use Claude Code for:**
- Planning multi-step deployment strategies
- Debugging complex namespace issues
- Reviewing Dockerfile architecture
- Updating project documentation

**Switch to Claude if:**
- Same error occurs 3+ times
- Error pattern is unclear
- Requires architectural changes
- Historical context needed

---

## 6. Deployment Verification Checklist

### Pre-Deployment Verification

#### Local Docker Build
- [ ] **Docker builds successfully**: `docker build .` completes without errors
- [ ] **No bundle clean errors**: Build logs show no "exit code 15" errors
- [ ] **Environment variables set**: `DISABLE_OBF_GEM=true` confirmed in Dockerfile
- [ ] **Asset compilation works**: `rails assets:precompile` succeeds locally

#### Code Quality Checks
- [ ] **JavaScript namespace fixes present**: Verify `app/assets/javascripts/application-preload.js` contains SweetSuite initialization
- [ ] **No obf gem dependencies**: Confirm `bundle show obf` returns error (gem not installed)
- [ ] **Clean git status**: No uncommitted changes (or acknowledged and documented)
- [ ] **Migrations ready**: All pending migrations committed

---

### Platform Setup Verification

#### Railway Setup
- [ ] **Account created**: Railway account with GitHub integration
- [ ] **Project created**: New project from LingoLinq-AAC repository
- [ ] **Build settings configured**: Uses Dockerfile (not Ruby buildpack)
- [ ] **Environment variables set**: All required production env vars configured
- [ ] **PostgreSQL provisioned**: Database service added to project
- [ ] **DATABASE_URL available**: Environment variable automatically set
- [ ] **Domain generated**: Public URL available for testing

#### Fly.io Setup
- [ ] **Fly CLI installed**: `fly version` returns valid version
- [ ] **Authentication working**: `fly auth whoami` shows logged-in user
- [ ] **App created**: `fly apps create lingolinq-aac` succeeds
- [ ] **Configuration valid**: `fly.toml` uses correct Dockerfile path
- [ ] **PostgreSQL created**: `fly postgres create` provisions database
- [ ] **Database attached**: App can connect to PostgreSQL instance
- [ ] **Secrets configured**: All required secrets set via `fly secrets`

---

### Build & Deploy Verification

#### Build Process
- [ ] **Build starts**: Deployment begins after code push/command
- [ ] **Docker build succeeds**: No bundle clean or gem compilation errors
- [ ] **Assets compiled**: Frontend and Rails assets build successfully
- [ ] **Server starts**: Application boots without errors
- [ ] **Deploy succeeds**: Build completes with success status

#### Platform-Specific Success Indicators

**Railway:**
- [ ] **"✅ Deployed" status**: Shows in Deployments tab
- [ ] **No build failures**: All build steps completed
- [ ] **Logs accessible**: Can view deployment and runtime logs

**Fly.io:**
- [ ] **Health checks pass**: `/health` endpoint returns 200 OK
- [ ] **Machines running**: `fly machine list` shows active instances
- [ ] **Domain accessible**: `https://lingolinq-aac.fly.dev` responds

---

### Application Health Verification

#### HTTP Endpoint Tests
- [ ] **Main page loads**: `GET /` returns 200 OK
- [ ] **Health check works**: `GET /health` returns 200 OK
- [ ] **Login page accessible**: `GET /login` returns 200 OK (not infinite loading)
- [ ] **Static assets serve**: CSS/JS files load correctly
- [ ] **API endpoints respond**: `/api/v1/status/heartbeat` returns valid JSON

#### JavaScript Functionality
- [ ] **No namespace errors**: Browser console shows no "LingoLinqAAC.track_error is not a function"
- [ ] **SweetSuite bridge works**: Compatibility layer functions correctly
- [ ] **Ember app initializes**: Frontend application starts without errors
- [ ] **Login form functional**: Login page displays form elements
- [ ] **No console errors**: Browser developer tools show clean console

#### Performance Checks
- [ ] **Response times acceptable**: Pages load within 5 seconds
- [ ] **Memory usage normal**: Application doesn't exceed platform memory limits
- [ ] **Database queries working**: No SQL connection errors in logs
- [ ] **Asset loading fast**: Static files serve quickly from CDN/server

---

### Post-Deployment Validation

#### User Acceptance Testing
- [ ] **Login functionality**: Users can successfully log in
- [ ] **Core features work**: Primary AAC functionality operates correctly
- [ ] **Data persistence**: User data saves and loads properly
- [ ] **Navigation functional**: Application routing works between pages
- [ ] **No regression issues**: Existing features still work as expected

#### Production Readiness
- [ ] **SSL certificate active**: HTTPS works without warnings
- [ ] **Domain configuration**: Custom domain (if applicable) resolves correctly
- [ ] **Database backups configured**: Automated backups enabled on platform
- [ ] **Monitoring setup**: Application performance monitoring active
- [ ] **Error tracking enabled**: JavaScript and server error reporting working

#### Documentation Updates
- [ ] **Deployment documented**: Process recorded in this playbook
- [ ] **Environment variables documented**: All required env vars listed
- [ ] **Troubleshooting guide updated**: New issues and solutions added
- [ ] **Rollback plan ready**: Strategy for reverting deployment documented
- [ ] **Team notified**: Deployment status communicated to stakeholders

---

### Success Criteria

#### Primary Success Indicators
✅ **Application accessible**: LingoLinq AAC loads at production URL
✅ **Login works**: Users can access login page and authenticate
✅ **No JavaScript errors**: Browser console clean of namespace errors
✅ **Core functionality**: Primary AAC features operational

#### Secondary Success Indicators
✅ **Performance acceptable**: Response times under 5 seconds
✅ **Stability maintained**: No crashes or memory leaks
✅ **Error handling works**: Graceful error reporting and recovery
✅ **Documentation complete**: Process documented for future deployments

---

## 7. Platform-Specific Guides

### 7.1 Railway Deployment Guide 🚄

#### Prerequisites
- [ ] Docker working locally (`docker build .` succeeds)
- [ ] Latest commit contains working Docker configuration
- [ ] Admin access to create Railway account

#### Step-by-Step Railway Dashboard Deployment

**1. Create Railway Account**
1. Go to https://railway.app
2. Click **"Sign up"**
3. Use **GitHub** login (recommended) or email
4. Verify your email if required

**2. Create New Project**
1. Click **"New Project"** button (purple/blue button on dashboard)
2. Select **"Deploy from GitHub repo"**
3. Connect your GitHub account if not already connected
4. Search for **"LingoLinq-AAC"** repository
5. Click **"Deploy Now"**

**3. Configure Build Settings**
1. Railway will automatically detect it's a Rails app
2. **IMPORTANT:** Force Docker build by clicking **"Settings"** tab
3. Under **"Build"** section:
   - Set **Build Command**: Leave empty (uses Dockerfile)
   - Set **Dockerfile Path**: `Dockerfile` (not `docker/Dockerfile`)
4. Click **"Save Changes"**

**4. Set Environment Variables**
1. Click **"Variables"** tab in your project
2. Add these environment variables by clicking **"+ New Variable"**:
   ```
   RAILS_ENV=production
   RACK_ENV=production
   RAILS_SERVE_STATIC_FILES=true
   RAILS_LOG_TO_STDOUT=true
   DISABLE_OBF_GEM=true
   NODE_ENV=production
   SECRET_KEY_BASE=<generate secure key>
   ```
3. For `SECRET_KEY_BASE`, generate a secure key:
   - Run: `openssl rand -hex 64`
   - Or use: https://randomkeygen.com/ (CodeIgniter Encryption Key - 504-bit)
   - Paste it as the SECRET_KEY_BASE value

**5. Add Database**
1. Click **"+ New"** button in your project
2. Select **"Database"** → **"PostgreSQL"**
3. Railway will automatically provision and connect the database
4. The `DATABASE_URL` environment variable will be set automatically

**6. Deploy**
1. Railway starts building automatically after configuration
2. Watch the **"Deployments"** tab for build progress
3. Build should take 5-10 minutes for first deployment
4. Look for **"✅ Deployed"** status

**7. Access Your Application**
1. In **"Settings"** tab, find **"Domains"** section
2. Click **"Generate Domain"** to get a public URL
3. Your app will be available at: `https://your-app-name.up.railway.app`

#### Railway Verification Checklist

**Check These URLs Work:**
- `https://your-app-name.up.railway.app` - Should show LingoLinq homepage
- `https://your-app-name.up.railway.app/login` - Should show login page (NOT infinite loading)
- `https://your-app-name.up.railway.app/health` - Should return "OK"

**Browser Console Check:**
1. Open browser developer tools (F12)
2. Go to **Console** tab
3. Visit your login page
4. Should NOT see: `LingoLinqAAC.track_error is not a function`

#### Railway Troubleshooting

**Build Fails with "Bundle Clean Error"**
- **Cause**: Railway is using cached Dockerfile
- **Solution**: In Railway dashboard:
  1. Go to **Settings** → **General**
  2. Scroll to **Danger Zone**
  3. Click **"Reset Build Cache"**
  4. Redeploy

**Database Connection Errors**
- **Check**: Variables tab shows `DATABASE_URL` is set
- **Fix**: If missing, go to **Data** tab and reconnect PostgreSQL service

**App Shows 500 Error**
- **Check**: Deployments tab → View logs for detailed error messages
- **Common Fix**: Make sure `SECRET_KEY_BASE` is set correctly

**Getting Help:**
- Railway Discord: https://discord.gg/railway
- Railway Docs: https://docs.railway.app
- Support Email: team@railway.app

---

### 7.2 Fly.io Deployment Guide ✈️

#### Prerequisites
- [ ] Fly.io account created
- [ ] Fly CLI installed and working
- [ ] Docker configuration validated locally

#### Installation & Setup

**1. Install Fly CLI**
```bash
# Windows (PowerShell)
iwr https://fly.io/install.ps1 -useb | iex

# macOS/Linux
curl -L https://fly.io/install.sh | sh

# Verify installation
fly version
```

**2. Authenticate**
```bash
fly auth login
```

**3. Create Application**
```bash
# Create app (use your preferred name)
fly apps create lingolinq-aac

# Or let Fly.io generate a name
fly apps create
```

#### Database Setup

**1. Create PostgreSQL Database**
```bash
# Create managed PostgreSQL
fly postgres create --name lingolinq-aac-db --region ord

# Note the connection details shown
```

**2. Attach Database to App**
```bash
# Attach database (sets DATABASE_URL automatically)
fly postgres attach lingolinq-aac-db --app lingolinq-aac
```

**3. Verify Connection**
```bash
# Check that DATABASE_URL is set
fly secrets list --app lingolinq-aac
```

#### Configuration

**1. Verify fly.toml**
Ensure `fly.toml` in project root contains:
```toml
app = "lingolinq-aac"

[build]
  dockerfile = "Dockerfile"

[env]
  RAILS_ENV = "production"
  RACK_ENV = "production"
  RAILS_SERVE_STATIC_FILES = "true"
  RAILS_LOG_TO_STDOUT = "true"
  DISABLE_OBF_GEM = "true"

[[services]]
  internal_port = 3000
  protocol = "tcp"

  [[services.ports]]
    handlers = ["http"]
    port = 80

  [[services.ports]]
    handlers = ["tls", "http"]
    port = 443

[checks]
  [checks.health]
    grace_period = "30s"
    interval = "15s"
    method = "get"
    path = "/health"
    timeout = "10s"
```

**2. Set Secrets**
```bash
# Generate and set SECRET_KEY_BASE
fly secrets set SECRET_KEY_BASE=$(openssl rand -hex 64) --app lingolinq-aac

# Set RAILS_MASTER_KEY
fly secrets set RAILS_MASTER_KEY=<your_master_key> --app lingolinq-aac

# Verify secrets are set
fly secrets list --app lingolinq-aac
```

#### Deployment

**1. Deploy Application**
```bash
# Deploy from current directory
fly deploy --app lingolinq-aac

# Monitor deployment logs
fly logs --app lingolinq-aac
```

**2. Run Database Migrations**
```bash
# Connect to app and run migrations
fly ssh console --app lingolinq-aac --command "bundle exec rails db:migrate"
```

**3. Verify Deployment**
```bash
# Check application status
fly status --app lingolinq-aac

# View recent logs
fly logs --app lingolinq-aac

# Check machine status
fly machine list --app lingolinq-aac
```

**4. Access Application**
```bash
# Open in browser
fly open --app lingolinq-aac

# Or visit directly
# https://lingolinq-aac.fly.dev
```

#### Fly.io Verification

**Check URLs:**
- `https://lingolinq-aac.fly.dev` - Main application
- `https://lingolinq-aac.fly.dev/health` - Health check
- `https://lingolinq-aac.fly.dev/login` - Login page

**Check Logs:**
```bash
# Real-time logs
fly logs --app lingolinq-aac

# Check for errors
fly logs --app lingolinq-aac | grep ERROR
```

#### Fly.io Troubleshooting

**Health Checks Failing**
```bash
# Check health endpoint directly
fly ssh console --app lingolinq-aac --command "curl http://localhost:3000/health"

# Adjust grace period in fly.toml if needed
```

**Database Connection Issues**
```bash
# Verify DATABASE_URL is set
fly ssh console --app lingolinq-aac --command "env | grep DATABASE_URL"

# Reconnect database if needed
fly postgres attach lingolinq-aac-db --app lingolinq-aac
```

**Build Failures**
```bash
# Force rebuild without cache
fly deploy --no-cache --app lingolinq-aac

# Check builder logs
fly logs --app lingolinq-aac
```

**Getting Help:**
- Fly.io Community: https://community.fly.io
- Fly.io Docs: https://fly.io/docs
- Status Page: https://status.fly.io

---

### 7.3 Alternative: Heroku Deployment

**Note:** Heroku is mentioned in historical docs but not currently recommended due to pricing changes.

If using Heroku:
```bash
# Create app
heroku create lingolinq-aac-staging

# Add PostgreSQL
heroku addons:create heroku-postgresql:mini

# Set environment variables
heroku config:set RAILS_ENV=production
heroku config:set SECRET_KEY_BASE=$(openssl rand -hex 64)
heroku config:set DISABLE_OBF_GEM=true

# Deploy
git push heroku main

# Run migrations
heroku run rails db:migrate

# Open app
heroku open
```

---

## 8. Troubleshooting

### 8.1 Docker Hub Outage / Registry Issues

#### Symptom
```
ERROR: failed to solve: ruby:3.2.8-slim: failed to resolve source metadata
ERROR: pull access denied for ruby, repository does not exist or may require 'docker login'
ERROR: toomanyrequests: You have reached your pull rate limit
```

#### Root Cause
- Docker Hub experiencing authentication/rate limit issues
- Affects all platforms using Docker Hub base images
- **NOT a code issue** - infrastructure problem

#### Solution: GitHub Container Registry Bypass

**Strategy:** Use GitHub Container Registry (`ghcr.io`) instead of Docker Hub

**1. Update Dockerfile Base Image**
```dockerfile
# OLD (Docker Hub - may have outages)
FROM ruby:3.2.8-slim

# NEW (GitHub Registry - more reliable)
FROM ghcr.io/ruby/ruby:3.2.8-slim
```

**2. Rebuild and Deploy**
```bash
# Test locally first
docker build -f Dockerfile .

# Deploy to platform
# Railway: Automatically picks up Dockerfile changes
# Fly.io: fly deploy
```

#### Expected Success Indicators
```
✅ "Successfully pulled ghcr.io/ruby/ruby:3.2.8-slim"
✅ "Bundle check passed"
✅ "Assets precompiled successfully"
✅ "Starting Rails server..."
```

---

### 8.2 Bundle Clean Error (Exit Code 15)

#### Symptom
```
ERROR: Build failed
Bundle clean error: exit code 15
LoadError: cannot load such file -- bundler/setup
```

#### Root Cause
- Docker build cache corruption
- Conflicting gem versions between cache layers
- Platform attempting to run `bundle clean` inappropriately

#### Solution: Platform-Specific Cache Reset

**Railway:**
1. Go to **Settings** → **General**
2. Scroll to **Danger Zone**
3. Click **"Reset Build Cache"**
4. Redeploy

**Fly.io:**
```bash
fly deploy --no-cache --app lingolinq-aac
```

**Render.com:**
```bash
# Use "Clear Build Cache" button in dashboard
# Or redeploy with manual cache clear
```

#### Prevention
Ensure `DISABLE_OBF_GEM=true` is set in environment variables before build.

---

### 8.3 JavaScript Namespace Errors

#### Symptom
```javascript
Uncaught TypeError: LingoLinqAAC.track_error is not a function
Uncaught TypeError: app.initializer is not a function
```

#### Root Cause
- Incomplete SweetSuite → LingoLinq namespace migration
- Development vs production asset loading differences
- Missing namespace initialization

#### Solution: Verify Namespace Bridge

**1. Check Compiled Assets**
```bash
# Verify SweetSuite initialization in compiled JS
grep -r "window.SweetSuite" public/assets/application-*.js
```

**Expected Output:**
```javascript
window.SweetSuite = window.SweetSuite || {
  track_error: function(msg, stack) {
    console.error("SweetSuite Error: " + msg, stack);
  }
};
```

**2. Verify LingoLinq Bridge**
```bash
# Check for LingoLinq namespace mapping
grep -r "LingoLinqAAC.track_error = SweetSuite.track_error" public/assets/
```

**3. If Missing, Rebuild Assets**
```bash
# In Docker or production environment
bundle exec rails assets:precompile RAILS_ENV=production
```

#### Prevention
- Always use production-compiled assets (don't rely on development server)
- Verify `app/assets/javascripts/application-preload.js` contains namespace initialization
- See `JAVASCRIPT_NAMESPACE_FIXES.md` for complete details

---

### 8.4 Asset Compilation Failures

#### Symptom
```
rails aborted!
ExecJS::RuntimeError: SyntaxError: Unexpected token
Asset compilation failed
```

#### Root Cause
- Node.js version incompatibility
- Missing JavaScript dependencies
- OBF gem attempting to compile

#### Solution: Verify Build Environment

**1. Check Node Version**
```dockerfile
# Dockerfile should specify Node 18.x
RUN curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
RUN apt-get install -y nodejs
```

**2. Verify OBF Gem Disabled**
```bash
# Environment variable should be set
echo $DISABLE_OBF_GEM  # Should output: true
```

**3. Install Frontend Dependencies**
```bash
# In app/frontend directory
yarn install

# Build Ember app
ember build --environment=production
```

**4. Precompile Rails Assets**
```bash
# From Rails root
bundle exec rails assets:precompile RAILS_ENV=production
```

#### Prevention
- Always set `DISABLE_OBF_GEM=true` in environment
- Use Node 18.x (compatible with Ember 3.12)
- Run `yarn install` before `ember build`

---

### 8.5 Database Connection Errors

#### Symptom
```
PG::ConnectionBad: could not connect to server
ActiveRecord::ConnectionNotEstablished
```

#### Root Cause
- `DATABASE_URL` not set
- Database not provisioned
- Network connectivity issues

#### Solution: Platform-Specific Database Setup

**Railway:**
1. Click **"+ New"** in project
2. Select **"Database"** → **"PostgreSQL"**
3. Verify `DATABASE_URL` appears in **Variables** tab
4. Redeploy application

**Fly.io:**
```bash
# Create database if not exists
fly postgres create --name lingolinq-aac-db

# Attach to app
fly postgres attach lingolinq-aac-db --app lingolinq-aac

# Verify connection
fly ssh console --app lingolinq-aac --command "rails runner 'puts User.count'"
```

#### Verification
```bash
# Check DATABASE_URL is set
# Railway: Variables tab
# Fly.io: fly secrets list

# Test connection
rails runner "puts ActiveRecord::Base.connection.execute('SELECT 1').first"
```

---

### 8.6 Health Check Failures

#### Symptom
```
Health check failing
/health endpoint returning 503 or timing out
Application marked as unhealthy
```

#### Root Cause
- Rails server not starting
- Health check endpoint not configured
- Timeout too short for startup

#### Solution: Configure Health Check

**1. Verify Health Endpoint Exists**
```ruby
# config/routes.rb should have:
get '/health', to: 'application#health'
```

**2. Implement Health Controller Action**
```ruby
# app/controllers/application_controller.rb
def health
  render json: { status: 'ok' }, status: :ok
end
```

**3. Adjust Health Check Settings**

**Railway:**
- Health checks are automatic based on HTTP response

**Fly.io (in fly.toml):**
```toml
[checks.health]
  grace_period = "30s"  # Increase if startup is slow
  interval = "15s"
  method = "get"
  path = "/health"
  timeout = "10s"
```

**4. Test Health Endpoint**
```bash
# Locally
curl http://localhost:3000/health

# Production (Railway)
curl https://your-app-name.up.railway.app/health

# Production (Fly.io)
fly ssh console --app lingolinq-aac --command "curl http://localhost:3000/health"
```

#### Expected Response
```json
{"status":"ok"}
```

---

### 8.7 Memory / Performance Issues

#### Symptom
```
Application exceeding memory limit
R14 - Memory quota exceeded (Heroku)
Slow response times
Container restarts
```

#### Root Cause
- Memory leaks in application code
- Insufficient platform resources
- Database connection pool exhaustion

#### Solution: Optimize Resources

**1. Check Current Memory Usage**
```bash
# Railway: View metrics in dashboard
# Fly.io:
fly machine list --app lingolinq-aac
```

**2. Optimize Puma Configuration**
```ruby
# config/puma.rb
workers ENV.fetch("WEB_CONCURRENCY") { 2 }  # Reduce if memory constrained
threads_count = ENV.fetch("RAILS_MAX_THREADS") { 5 }
threads threads_count, threads_count
```

**3. Optimize Database Connection Pool**
```ruby
# config/database.yml
production:
  pool: <%= ENV.fetch("RAILS_MAX_THREADS") { 5 } %>
```

**4. Enable Boot Optimization**
```ruby
# config/boot.rb
require 'bootsnap/setup' # Speed up boot time
```

#### Platform Resource Adjustments

**Railway:**
- Upgrade to higher plan for more memory
- Monitor metrics in dashboard

**Fly.io:**
```bash
# Scale machine resources
fly scale memory 1024 --app lingolinq-aac  # 1GB RAM
fly scale vm shared-cpu-2x --app lingolinq-aac  # More CPU
```

---

### 8.8 Infinite Loading Loop on Login

#### Symptom
- Login page loads but shows infinite spinner
- No JavaScript errors in console
- Network requests keep repeating

#### Root Cause
- Frontend expects specific API response format
- Authentication endpoint not responding correctly
- CORS configuration issue

#### Solution: Verify API Endpoints

**1. Check API Health**
```bash
# Test API endpoint directly
curl https://your-app-url/api/v1/status/heartbeat

# Expected response:
{"status":"ok","timestamp":"2025-10-10T..."}
```

**2. Verify Session Endpoint**
```bash
# Check session endpoint
curl -i https://your-app-url/api/v1/sessions/new

# Should return 200 OK with JSON
```

**3. Check CORS Configuration**
```ruby
# config/initializers/cors.rb
Rails.application.config.middleware.insert_before 0, Rack::Cors do
  allow do
    origins '*'  # Adjust for production
    resource '*',
      headers: :any,
      methods: [:get, :post, :put, :patch, :delete, :options, :head]
  end
end
```

**4. Verify Compiled Assets Loaded**
```bash
# Check browser network tab for:
✅ application-*.js loaded
✅ application-*.css loaded
✅ No 404 errors for assets
```

#### Prevention
- Ensure assets are precompiled before deployment
- Test `/health` and `/login` endpoints in production
- Monitor browser console for JavaScript errors

---

### 8.9 Platform-Specific Issues

#### Railway: Build Timeout
**Symptom:** Build exceeds time limit
**Solution:**
```bash
# Optimize Dockerfile for faster builds
# Use smaller base image if possible
# Reduce dependencies
```

#### Fly.io: Certificate Issues
**Symptom:** HTTPS not working
**Solution:**
```bash
# Check certificate status
fly certs list --app lingolinq-aac

# Create certificate if missing
fly certs create your-domain.com --app lingolinq-aac
```

#### Render: Cache Corruption
**Symptom:** Persistent build failures despite fixes
**Solution:**
- Use "Clear Build Cache" in dashboard
- Switch to Railway or Fly.io if issues persist
- Consider GitHub Container Registry base image

---

## 9. Rollback Strategy

### Quick Rollback

**Railway:**
1. Go to **Deployments** tab
2. Find last working deployment
3. Click **"..."** menu → **"Redeploy"**

**Fly.io:**
```bash
# List recent releases
fly releases --app lingolinq-aac

# Rollback to specific version
fly releases rollback v<version> --app lingolinq-aac
```

### Emergency Rollback
1. Identify last known good commit: `git log`
2. Create hotfix branch: `git checkout -b hotfix/rollback-<issue>`
3. Revert to good commit: `git revert <bad-commit-hash>`
4. Deploy hotfix branch
5. Verify application health
6. Update team and documentation

---

## 10. Support Resources

### Platform Support

**Railway:**
- Dashboard: https://railway.app/dashboard
- Documentation: https://docs.railway.app
- Discord: https://discord.gg/railway
- Status: https://status.railway.app

**Fly.io:**
- Dashboard: https://fly.io/dashboard
- Documentation: https://fly.io/docs
- Community: https://community.fly.io
- Status: https://status.fly.io

### Project Documentation

- **Overview**: `CLAUDE.md` - Project overview and quick reference
- **Local Dev**: `.ai/docs/LOCAL_DEVELOPMENT.md` - Docker setup and local workflow
- **JavaScript Fixes**: `.ai/docs/JAVASCRIPT_NAMESPACE_FIXES.md` - Namespace migration details
- **Ember Upgrade**: `.ai/docs/EMBER_UPGRADE_RESEARCH.md` - Future modernization plans
- **AI Tools**: `.ai/docs/AI_TOOLS_SETUP.md` - Gemini and Claude Code setup

### Key Endpoints for Monitoring

- **Production**: https://lingolinq-aac.fly.dev (current Fly.io deployment)
- **Health Check**: `/health` - Basic health status
- **API Status**: `/api/v1/status/heartbeat` - Detailed API health
- **Login**: `/login` - User authentication entry point

---

## 11. Deployment Timeline & History

### Current Production Deployment
- **Platform**: Fly.io
- **Status**: ✅ Working (as of September 26, 2025)
- **URL**: https://lingolinq-aac.fly.dev
- **Database**: Fly.io Managed PostgreSQL

### Historical Attempts
- **Render.com**: Attempted, encountered Docker cache issues
- **Railway**: Tested, works well, recommended for future use
- **Heroku**: Mentioned in docs, not pursued due to pricing

---

## Conclusion

This playbook consolidates all deployment knowledge for LingoLinq-AAC. Follow the verification checklists carefully, use the platform-specific guides for detailed steps, and reference the troubleshooting section for common issues.

For ongoing deployments:
1. **Start with Railway** for ease of use
2. **Use Fly.io** if you need global edge deployment
3. **Follow the checklists** systematically
4. **Update this playbook** when you discover new issues or solutions

**Remember:** The Docker-first strategy is essential for this legacy stack. Always verify that `DISABLE_OBF_GEM=true` is set and that assets are precompiled correctly.

---

**Last Updated:** October 2025
**Maintained By:** LingoLinq-AAC Team
**AI Support:** Claude Code & Gemini CLI
