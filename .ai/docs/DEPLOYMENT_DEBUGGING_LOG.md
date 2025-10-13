# Deployment Debugging Log: October 2025

**Purpose:** This document tracks all deployment attempts, issues encountered, and solutions applied during the October 2025 Fly.io deployment effort. Use this to avoid going in circles and understand what has already been tried.

---

## Timeline of Deployment Attempts

### Initial State (2 Weeks Ago)
- **Problem:** Deployment failing with OBF gem errors
- **Status:** 500/503 errors, app not functional
- **Container:** Machine 56837dd1ce3168 (old deployment)

### Attempt 1: Separate Migrations from Server Startup
**Date:** October 12-13, 2025
**Diagnosis (Gemini):** Migrations running during container startup causing failures

**Changes Made:**
1. ✅ Added `[deploy.release_command]` to `fly.toml`
   ```toml
   [deploy]
     release_command = "bundle exec rake db:migrate"
   ```
2. ✅ Updated `Dockerfile` CMD to run Puma directly
   ```dockerfile
   CMD ["bundle", "exec", "puma", "-C", "config/puma.rb"]
   ```
3. ✅ Simplified `bin/render-start.sh` to remove migration logic

**Result:** ❌ Failed - `release_command` couldn't find gems
**Error:** `Bundler::GemNotFound: cannot load such file -- concurrent-ruby-1.3.4`

---

### Attempt 2: Fix Bundler Path Configuration
**Date:** October 13, 2025
**Diagnosis (Gemini):** Bundler gem path not configured for `release_command` phase

**Changes Made:**
1. ✅ Added `bundle config set --global path '/usr/local/bundle'` to Dockerfile
   - Location: After `RUN gem install bundler:2.5.6`
2. ✅ Removed `GEM_HOME` from Dockerfile ENV block
3. ✅ Removed `BUNDLE_PATH` from `fly.toml` [env] section

**Result:** ❌ Failed - OBF gem loading error
**Error:** `LoadError: cannot load such file -- obf` in `config/initializers/obf_footer.rb`

---

### Attempt 3: Set DISABLE_OBF_GEM for Release Command
**Date:** October 13, 2025 (Current)
**Diagnosis (Claude):** `DISABLE_OBF_GEM` environment variable not available during `release_command`

**Root Cause:**
- `DISABLE_OBF_GEM=true` was only set:
  - In Dockerfile during build (lines 66-67)
  - In `bin/render-start.sh` (line 10)
  - **NOT in fly.toml for release_command environment**
- The `config/initializers/obf_footer.rb` file checks for this ENV var:
  ```ruby
  unless ENV['DISABLE_OBF_GEM'] == 'true'
    require 'obf'
    # ...
  end
  ```
- During `release_command` (migrations), Rails loads all initializers
- Without `DISABLE_OBF_GEM` set, the initializer tries to load the obf gem
- The obf gem is excluded from production, so it fails

**Changes Made:**
1. ✅ Added `DISABLE_OBF_GEM = "true"` to `fly.toml` [env] section
   - Location: After `BUNDLE_WITHOUT` config
   - This makes it available in ALL phases: build, release, and run

**Expected Result:** ✅ Should fix - ENV var now available during migrations
**Status:** Pending deployment

---

## Key Learnings

### 1. Docker vs Traditional Deployment
**Question:** Is Docker causing the problems vs the traditional Procfile-based approach?

**Answer:** Not exactly. The issues are specific to how different deployment phases work:

**Traditional (Procfile) Approach:**
- Everything runs in the same process/environment
- Migrations and server startup share the same environment variables
- No separate "release command" phase
- Works reliably on Heroku, Railway, Render with Procfile support

**Docker + Fly.io Approach:**
- Separate phases: build → release → run
- Each phase can have different environment variables
- `release_command` runs in a temporary container
- Requires explicit ENV var configuration in `fly.toml`

**Why We're Using Docker:**
- Isolates legacy Ember 3.12 + Node 18 from modern host systems
- Ensures consistent builds across platforms
- Necessary for local development with version conflicts
- The README's "traditional deployment" works because it doesn't separate phases

### 2. Environment Variable Scope
**Critical Understanding:**

**Dockerfile ENV/ARG:**
- Available during **build time** only
- Baked into the image
- Example: `ENV DISABLE_OBF_GEM=true` in Dockerfile

**fly.toml [env]:**
- Available during **release AND run time**
- Provided to containers at startup
- Example: `DISABLE_OBF_GEM = "true"` in fly.toml

**Shell Script ENV:**
- Available only when that script runs
- Example: `export DISABLE_OBF_GEM=true` in render-start.sh
- Only applies to the `web` process, not `release_command`

**For Fly.io deployment, you need ENV vars in BOTH places:**
- Dockerfile: For asset precompilation during build
- fly.toml: For release_command (migrations) and runtime

### 3. The OBF Gem Issue
**Background:**
- OBF gem is a dependency from the original SweetSuite codebase
- Used for PDF generation with Open Board Format support
- Excluded from production because it has compilation issues
- The gem is conditionally loaded in `config/initializers/obf_footer.rb`

**Why It Keeps Causing Problems:**
- The initializer file EXISTS and Rails loads it
- The conditional check WORKS but needs the ENV var
- If `DISABLE_OBF_GEM` is not set → tries to load obf → fails
- This happens during ANY Rails initialization (including migrations)

**The Fix Chain:**
1. Set `DISABLE_OBF_GEM=true` in Dockerfile → asset precompilation works
2. Set `DISABLE_OBF_GEM=true` in fly.toml → release_command works
3. Initializer checks ENV var → skips loading obf → success

### 4. Why Old Container Still Works
**Important:** The failed deployments don't break the running app!

- Machine `56837dd1ce3168` is the OLD deployment (still running)
- New deployments fail during `release_command`
- Fly.io keeps the old container running when new deployment fails
- That's why you see working health checks in the logs
- The errors you see (`chomp!` for true:TrueClass) are from the OLD container
- Those are unrelated to the current deployment issues

---

## Current Status

### Files Modified in This Debugging Session
1. `fly.toml` - Added `[deploy.release_command]` and `DISABLE_OBF_GEM` ENV
2. `Dockerfile` - Added bundle config, removed GEM_HOME, updated CMD
3. `bin/render-start.sh` - Removed migration logic (now handled by release_command)

### Files That Already Had Fixes
1. `config/initializers/obf_footer.rb` - Already has conditional check (lines 2-6)
2. `Dockerfile` - Already has `DISABLE_OBF_GEM=true` during asset precompilation

### Next Deployment Should Work Because
1. ✅ Migrations run separately via `release_command`
2. ✅ Bundler path configured globally across all phases
3. ✅ `DISABLE_OBF_GEM=true` now set in fly.toml for release phase
4. ✅ OBF initializer will skip loading the gem
5. ✅ Server starts cleanly with direct Puma command

---

## Debugging Methodology

### What Worked
✅ **Reading error logs carefully** - Found exact line where obf gem was being loaded
✅ **Understanding environment phases** - Realized release_command has different ENV
✅ **Checking existing code** - Found the conditional was already there, just needed ENV var
✅ **Following Gemini's diagnosis** - Correctly identified the obf_footer.rb issue

### What Didn't Work
❌ **Assuming Dockerfile ENV is enough** - Doesn't apply to release_command
❌ **Thinking render-start.sh ENV would help** - Doesn't run during release_command
❌ **Modifying obf_footer.rb** - It was already correct, wrong diagnosis

### Best Practices Learned
1. **Check ALL environment scopes** - build, release, run
2. **Read error stack traces completely** - Shows exact file and line
3. **Understand deployment phases** - Fly.io has separate build/release/run
4. **Document everything** - This log prevents going in circles
5. **One fix at a time** - Makes it clear what actually worked

---

## Would Devin/Cursor/etc. Be Faster?

### Yes, Because:
1. **Tight feedback loop** - Deploy → see error → fix → deploy (minutes, not hours/days)
2. **Automatic error analysis** - Reads logs immediately after deployment
3. **No context loss** - Maintains full debugging state across attempts
4. **Faster iteration** - Can try multiple fixes quickly
5. **Direct execution** - No manual copy-paste of commands

### Would Hit Same Issues:
1. **Initial OBF gem problem** - Would take time to understand
2. **Environment variable scoping** - Not obvious even to AI agents
3. **Dockerfile/fly.toml relationship** - Requires understanding Fly.io architecture
4. **Historical codebase knowledge** - Would need to learn SweetSuite → LingoLinq migration

### Estimate:
- **Manual debugging (us):** 2 weeks with context loss between sessions
- **Devin/autonomous agent:** Probably 1-3 days with continuous iteration
- **Time savings:** Significant, mainly due to deployment loop speed

### When to Consider Devin:
- ✅ After 3+ failed attempts on same issue
- ✅ When deployment cycle is slower than debugging cycle
- ✅ When errors are environment-specific (not reproducible locally)
- ✅ When you have budget for paid agent service

---

## Prevention Checklist for Future Deployments

### Before Deploying to New Platform:
- [ ] Verify ALL environment variables needed
- [ ] Check which ENV vars need to be in Dockerfile vs platform config
- [ ] Test that release_command has access to required gems
- [ ] Confirm initializers can handle missing optional dependencies
- [ ] Document environment variable scoping in deployment playbook

### Before Each Deployment Attempt:
- [ ] Review previous deployment logs
- [ ] Check this debugging log for similar issues
- [ ] Verify no circular problem-solving (trying same fix twice)
- [ ] Have clear success criteria
- [ ] Plan rollback if deployment fails

### After Successful Deployment:
- [ ] Update deployment playbook with lessons learned
- [ ] Add successful configuration to git
- [ ] Document environment variable requirements
- [ ] Create runbook for future deployments
- [ ] Test rollback procedure

---

## Reference Links

### Fly.io Documentation
- Release Command: https://fly.io/docs/reference/configuration/#release-command
- Environment Variables: https://fly.io/docs/reference/configuration/#env
- Secrets Management: https://fly.io/docs/reference/secrets/

### Internal Documentation
- Deployment Playbook: `.ai/docs/DEPLOYMENT_PLAYBOOK.md`
- CLAUDE.md: Project overview and quick reference
- Local Development: `.ai/docs/LOCAL_DEVELOPMENT.md`

### Key Files
- `fly.toml` - Fly.io configuration (app name, env vars, health checks)
- `Dockerfile` - Container build instructions
- `bin/render-start.sh` - Container startup script (web process only)
- `config/initializers/obf_footer.rb` - OBF gem conditional loader

---

**Last Updated:** October 13, 2025
**Status:** Awaiting deployment with DISABLE_OBF_GEM fix
**Next Step:** Deploy and verify release_command succeeds
