# 📋 Development vs Deployment Guide

## 🎯 Quick Answers to Your Questions

### Q1: Are deploy steps still needed or replaced by `./start_dev.sh`?

**Answer**: They serve **different purposes**:

| Script | Purpose | When to Use |
|--------|---------|-------------|
| `./start_dev.sh` | **Development only** - Quick local testing | When you want to test changes locally |
| `bin/deploy_prep` | **Production deployment** - Prepares assets for deployment | Before deploying to staging/production |
| `bin/fresh_start` | **Full dev environment** - Starts all services (web, resque, ember) | When you need background jobs too |

**TL;DR**: 
- ✅ Use `./start_dev.sh` for **quick frontend/backend testing**
- ✅ Use `bin/fresh_start` for **full development** (includes Redis, resque workers)
- ✅ Use `bin/deploy_prep` for **production deployments**

---

### Q2: How to ensure Ember uses Node 18 (not Node 20)?

**Answer**: ✅ **Already configured!** Multiple safeguards exist:

#### Method 1: `.nvmrc` Files (Automatic)
```bash
# Root directory uses Node 20 for tools
cat .nvmrc
# Output: 20

# Ember frontend uses Node 18
cat app/frontend/.nvmrc
# Output: 18
```

When you `cd app/frontend`, nvm automatically switches to Node 18 (if you have nvm installed).

#### Method 2: Procfile (Built-in)
The `Procfile` ember process explicitly uses Node 18:
```bash
ember: bash -c 'if [ -s "$HOME/.nvm/nvm.sh" ]; then source "$HOME/.nvm/nvm.sh"; \
  elif [ -s "/usr/local/share/nvm/nvm.sh" ]; then source "/usr/local/share/nvm/nvm.sh"; fi && \
  nvm install 18 && nvm use 18 && cd ./app/frontend/ && npx ember server --port 8184'
```

This automatically:
1. Sources nvm
2. Installs Node 18 if missing
3. Switches to Node 18
4. Runs Ember

#### Method 3: Updated `start_dev.sh`
I should update `start_dev.sh` to respect the Ember `.nvmrc`. Let me do that now.

---

### Q3: Does this create the example/password user account?

**Answer**: ❌ **No**, but it's easy to add!

#### Current Behavior
- `start_dev.sh` creates the database and runs migrations
- It does **NOT** run `db:seed` (which creates example/password)

#### How to Create Test User

**Option A: Manual seed**
```bash
bundle exec rake db:seed
```

This creates:
- ✅ Username: `example`
- ✅ Password: `password`
- ✅ Some bootstrap boards

**Option B: Automatic (I'll update the script)**
I should add an option to seed during first-time setup.

---

## 🔧 Updated Scripts

Let me create updated versions that address your concerns:

### 1. Updated `start_dev.sh` (with Node 18 support and seeding)
### 2. Clear documentation on what each script does
### 3. Deployment checklist

---

## 📚 Script Comparison Matrix

| Feature | `start_dev.sh` | `bin/fresh_start` | `bin/deploy_prep` |
|---------|----------------|-------------------|-------------------|
| **Purpose** | Quick frontend/backend testing | Full dev environment | Production deployment |
| **Starts Rails** | ✅ Yes | ✅ Yes | ❌ No (builds only) |
| **Starts Ember** | ✅ Yes | ✅ Yes | ❌ No (builds only) |
| **Starts Redis** | ❌ No | ✅ Yes | ❌ No |
| **Starts Resque** | ❌ No | ✅ Yes | ❌ No |
| **Node Version** | Uses system default | ✅ Node 18 (via nvm) | ✅ Node 18 (manual) |
| **Creates DB** | ✅ If missing | ❌ No | ❌ No |
| **Seeds DB** | ❌ No (should add) | ❌ No | ❌ No |
| **Builds Production** | ❌ No | ❌ No | ✅ Yes |
| **Background Jobs** | ❌ No | ✅ Yes | ❌ No |
| **Best For** | Quick testing | Full feature dev | Production deploy |

---

## 🎯 When to Use Each Script

### Use `./start_dev.sh` when:
- ✅ Testing frontend changes quickly
- ✅ Testing API endpoints
- ✅ You don't need background jobs
- ✅ First time setup
- ✅ After pulling new code

### Use `bin/fresh_start` when:
- ✅ Testing features that need background jobs
- ✅ Testing scheduled tasks (resque)
- ✅ Full integration testing
- ✅ You have Redis/PostgreSQL already installed
- ✅ You need the complete development environment

### Use `bin/deploy_prep` when:
- ✅ Preparing for production deployment
- ✅ Creating a release
- ✅ Building optimized production assets
- ✅ Before pushing to staging/production servers

---

## 🚀 Deployment Workflow

### For Production Deployment:

1. **Test locally first**:
   ```bash
   ./start_dev.sh
   # Or
   bin/fresh_start
   ```

2. **Run tests** (if you have them):
   ```bash
   bundle exec rspec
   cd app/frontend && npm test
   ```

3. **Prepare deployment**:
   ```bash
   bin/deploy_prep
   ```
   This will:
   - Copy terms/privacy templates
   - Build Ember in production mode
   - Precompile Rails assets
   - Create git commit with version tag

4. **Deploy to server**:
   ```bash
   git push production main
   # Or however you deploy (Heroku, Render, etc.)
   ```

5. **Run migrations on server**:
   ```bash
   heroku run rake db:migrate
   # Or
   ssh your-server 'cd /app && bundle exec rake db:migrate'
   ```

---

## 🗄️ Database Seeding

### First Time Setup (Development):
```bash
# Create and migrate database
bundle exec rake db:create db:migrate

# Seed with example user and boards
bundle exec rake db:seed
```

### What `db:seed` Creates:
According to README.md line 108-112:
- ✅ User: `example` / `password`
- ✅ Bootstrap data (boards, buttons, etc.)

### Production Seeding:
**⚠️ CAUTION**: Don't run `db:seed` in production!
- It's meant for development only
- Production data should be migrated or imported properly

---

## 🔧 Node Version Management

### Current Setup:
```
Repository Root (.nvmrc):     Node 20  ← For general tools
Ember Frontend (.nvmrc):       Node 18  ← For Ember build
```

### How It Works:

1. **With nvm installed**:
   ```bash
   # In root directory
   node -v  # Shows v20.x
   
   # In app/frontend directory
   cd app/frontend
   node -v  # Automatically switches to v18.x (if using nvm)
   ```

2. **Without nvm**:
   - Install nvm: https://github.com/nvm-sh/nvm
   - Or manually switch Node versions before running Ember

3. **Procfile handles it automatically**:
   - When using `bin/fresh_start` or `foreman start`
   - The ember process automatically loads nvm and switches to Node 18

---

## ✅ Recommendation

I'll update `start_dev.sh` to:
1. ✅ Respect Node 18 for Ember (use nvm if available)
2. ✅ Offer to seed database on first run
3. ✅ Add better error messages
4. ✅ Make it more production-like

Would you like me to create the updated version now?
