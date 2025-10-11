# Gemini CLI Session Handoff - Oct 6, 2025

## 🎯 CRITICAL CONTEXT: We've Been Going in Circles for a Week

**DO NOT:**
- Suggest solutions already tried (see DEBUGGING_LOG.md and COMPLETE_DEPLOYMENT_DIAGNOSTICS_OCT6.md)
- Modify `config/initializers/resque.rb` (already fixed today)
- Modify `app/models/concerns/permissions.rb` (already fixed today)
- Add cache-busting comments to Dockerfile (already done)
- Suggest deploying Redis (COMPLETED - already connected and working)
- Suggest fixing database connection (working since Oct 5)

**CURRENT STATUS:**
- ✅ Redis deployed and connected: `redis://default:***@fly-lingolinq-redis.upstash.io:6379`
- ✅ Database working (PostgreSQL on Fly.io)
- ✅ App starts successfully, Puma running, health checks PASSING
- ✅ No more Redis initialization errors
- ❌ **NEW ISSUE**: Assets returning 500 errors (CSS/JS not loading)

---

## 🚨 THE ACTUAL PROBLEM (Discovered 5 minutes ago)

**Symptom:** Application loads but shows "Loading LingoLinq AAC..." with missing CSS/images
**Root Cause:** Asset files returning `500 Internal Server Error`

**Evidence from Screenshot:**
```
GET /assets/application-9ff0235dc34d39a640d85119c48be64e1303c2b2a7ca890a14a5b5e1fd4b7778.css
Status: 500 Internal Server Error

GET /assets/application-231f10a769abc3a...
Status: 500 Internal Server Error
```

**Files Failing:**
- application-*.css
- application-*.js
- logo-big.png
- mespeak.js
- weblinger.js
- mespeak-core.js
- favicon.ico

---

## 🔍 WHAT TO INVESTIGATE

### Priority 1: Asset Pipeline Configuration
Check these files for asset serving issues:

1. **`config/environments/production.rb`** - Asset serving configuration
   - Look for: `config.public_file_server.enabled`
   - Look for: `config.assets.compile`
   - Look for: `config.serve_static_assets`

2. **Check if assets were precompiled in Docker build:**
   ```bash
   flyctl ssh console --app lingolinq-aac --command "ls -la /app/public/assets/"
   ```

3. **Check Rails logs for asset errors:**
   ```bash
   flyctl logs --app lingolinq-aac | grep -i "asset\|sprocket\|500"
   ```

### Priority 2: Dockerfile Asset Build Step
Check if `Dockerfile` line 78 succeeded:
```dockerfile
RUN SECRET_KEY_BASE=dummy bundle exec rake assets:precompile
```

Look for errors in build logs related to:
- Sprockets
- Asset compilation
- JavaScript/CSS minification
- Image processing

### Priority 3: Nginx/Static File Serving
Fly.io might need static file configuration. Check if app needs `fly.toml` updates for asset serving.

---

## 📋 FILES ALREADY MODIFIED TODAY (DON'T RE-MODIFY)

### `config/initializers/resque.rb`
**Status:** ✅ FIXED - Now conditional on REDIS_URL, stubs defined for nil case
**Lines 1-186:** Complete conditional wrapper with fallback module

### `app/models/concerns/permissions.rb`
**Status:** ✅ FIXED - Line 24 has nil check: `return false unless redis`

### `Dockerfile`
**Status:** ✅ WORKING - Multi-stage build completing successfully
**Line 60:** Cache-bust comment present: `# CACHE_BUST: Oct 6 2025 22:30`

---

## ⚠️ TOKEN EFFICIENCY WARNING - READ THIS FIRST!

**CRITICAL:** `flyctl deploy` outputs 5,000+ lines of build logs and will **DESTROY your token quota** in 2-3 deploys!

**ALWAYS use `--detach` flag:**
```bash
# ✅ CORRECT - Token-efficient deployment
flyctl deploy --app lingolinq-aac --detach && sleep 180 && flyctl status --app lingolinq-aac

# ❌ WRONG - Burns 20,000+ tokens on build logs
flyctl deploy --app lingolinq-aac
```

**Other token-saving tips:**
- Use `| tail -20` or `| head -20` on ALL log commands
- Use `--detach` on deploys (returns immediately)
- Check status with `flyctl status` (10 lines) instead of watching full deploy
- Only read full logs if deployment fails

---

## 🔧 RECOMMENDED INVESTIGATION COMMANDS

```bash
# 1. Check if assets exist in container
flyctl ssh console --app lingolinq-aac --command "ls -lah /app/public/assets/ | head -20"

# 2. Check asset fingerprints in manifest
flyctl ssh console --app lingolinq-aac --command "cat /app/public/assets/.sprockets-manifest-*.json | head -50"

# 3. Check production.rb asset config
flyctl ssh console --app lingolinq-aac --command "grep -n 'assets\|static' /app/config/environments/production.rb"

# 4. Check for asset-related errors in logs
flyctl logs --app lingolinq-aac | grep -E "(asset|sprocket|ActionController|500)" | tail -50

# 5. Test direct asset access
curl -I https://lingolinq-aac.fly.dev/assets/application-9ff0235dc34d39a640d85119c48be64e1303c2b2a7ca890a14a5b5e1fd4b7778.css
```

---

## 📊 DEPLOYMENT ARCHITECTURE

**Stack:**
- Ruby 3.2.8 / Rails 6.1.7.10
- Ember 3.12 frontend (legacy)
- Node 18.x for frontend builds
- Bower dependencies
- Multi-stage Docker build
- Puma web server (3 workers)
- PostgreSQL database (Fly.io managed)
- Redis (Fly.io Upstash - just deployed today)

**Build Process:**
1. Base stage: Install system deps + Node 18
2. Build stage: Bundle gems, npm install, bower install, ember build, rake assets:precompile
3. Production stage: Copy gems + app code + assets from build stage

**Critical Build Environment Variables (Dockerfile lines 71-76):**
```dockerfile
ENV DISABLE_OBF_GEM=true \
    MAX_ENCRYPTION_SIZE=25000000 \
    MAX_FILE_SIZE=25000000 \
    SECURE_ENCRYPTION_KEY=dummy_key_for_build_at_least_24_chars \
    SECURE_NONCE_KEY=dummy_nonce_for_build_at_least_24_chars \
    COOKIE_KEY=dummy_cookie_key_for_build
```

---

## 🎓 LESSONS FROM THE PAST WEEK (Don't Repeat These)

### Attempt 1-11: Bundler Platform Hell
- **Issue:** `Bundler 2.7.1` had platform resolution bugs
- **Fix:** Downgraded to `bundler:2.5.6` (Dockerfile line 44)
- **Don't:** Touch Bundler version or platform flags

### Attempt 12-14: Database Auth + .env Leak
- **Issue:** `.env` file leaked into Docker image, `DATABASE_URL` wrong
- **Fix:** Added `.env` to `.dockerignore`, created `lingolinq_app` user
- **Don't:** Modify database credentials or connection strings

### Attempt 15 (Today): Redis Missing
- **Issue:** `config/initializers/resque.rb` crashed on missing REDIS_URL
- **Fix:** Made initializer conditional, deployed Redis, fixed `Permissions.setex`
- **Don't:** Re-fix Redis initialization (it's working now)

### Docker Cache Mystery (Today):
- **Issue:** Docker cached `COPY . .` even with `--no-cache` flag
- **Fix:** Added changing comment before COPY to bust cache
- **Don't:** Assume `--no-cache` works reliably

---

## 🎯 YOUR MISSION (Gemini CLI)

**Primary Goal:** Fix asset serving so CSS/JS/images load properly

**Success Criteria:**
1. `https://lingolinq-aac.fly.dev/assets/application-*.css` returns 200 OK
2. `https://lingolinq-aac.fly.dev/assets/application-*.js` returns 200 OK
3. Login page renders with proper styling and background images
4. No 500 errors in browser console

**Constraints:**
- Don't break Redis connection (working now)
- Don't break database connection (working since Oct 5)
- Don't downgrade or change Ruby/Node/Bundler versions
- Read DEBUGGING_LOG.md before suggesting anything already tried

**Investigation Priority:**
1. Asset precompilation in Docker build
2. Production.rb asset configuration
3. Static file serving in Fly.io
4. Sprockets manifest integrity
5. Rails logs for asset controller errors

---

## 📁 KEY FILES TO EXAMINE

1. `config/environments/production.rb` - Asset serving config
2. `Dockerfile` (lines 60-78) - Asset build process
3. `public/assets/.sprockets-manifest-*.json` - Asset manifest
4. `app/frontend/ember-cli-build.js` - Ember build config
5. `config/initializers/assets.rb` - Asset pipeline config
6. Recent build logs from `flyctl deploy`
7. Runtime logs showing 500 errors on asset requests

---

## 💡 POTENTIAL ROOT CAUSES (Prioritized)

### Most Likely:
1. **Sprockets cache corruption** - Assets compiled but manifest incorrect
2. **Production.rb misconfiguration** - `config.assets.compile = false` but assets missing
3. **Missing ENV vars at runtime** - Asset digests not matching manifest
4. **File permissions** - Assets exist but not readable by Puma process

### Less Likely (but possible):
5. **Ember build failure** - Frontend assets didn't compile correctly
6. **Fly.io static file routing** - Missing nginx/static file config
7. **Asset host mismatch** - `config.asset_host` pointing to wrong location
8. **Digest mismatch** - Precompiled assets have different fingerprints than HTML references

### Unlikely (but check if desperate):
9. **RAILS_ENV mismatch** - App running in production but loading development assets
10. **Symlink issues** - Assets symlinked instead of copied (GitHub Actions issue from earlier)

---

## 🚀 QUICK WIN HYPOTHESIS

**Theory:** Assets were precompiled successfully but Rails is configured to serve them dynamically (`config.assets.compile = true`) and failing at runtime due to missing build dependencies.

**Test:**
```bash
# Check current production.rb setting
flyctl ssh console --app lingolinq-aac --command "grep 'config.assets.compile' /app/config/environments/production.rb"

# If it shows 'true', that's likely the issue
# Static assets should be precompiled and served directly, not compiled on-demand
```

**If that's the issue:** Change `config.assets.compile = false` and ensure `config.public_file_server.enabled = true`

---

## 📞 CONTACT FOR CLARIFICATION

If you need to ask the user something, be specific:
- "What does line X of file Y say?"
- "Can you run this exact command and paste the output?"
- "Does the build log show any Sprockets errors?"

**Don't ask vague questions like:**
- "Did assets compile correctly?" (user doesn't know)
- "Is your asset pipeline configured?" (we're trying to figure that out)
- "Have you tried...?" (check DEBUGGING_LOG.md first!)

---

## 🎬 START HERE

```bash
# First, read the debugging history
cat DEBUGGING_LOG.md | grep -i "asset\|css\|javascript"
cat COMPLETE_DEPLOYMENT_DIAGNOSTICS_OCT6.md

# Then investigate current state
flyctl ssh console --app lingolinq-aac --command "ls -la /app/public/assets/ && cat /app/config/environments/production.rb | grep asset"

# Check recent logs
flyctl logs --app lingolinq-aac | grep "500\|asset\|sprocket" | tail -30
```

**First question to answer:** Do precompiled assets exist in `/app/public/assets/` in the container?
- If YES → Configuration issue (production.rb or fly.toml)
- If NO → Build issue (Dockerfile asset precompilation failed)

Good luck! The app is SO CLOSE to working - just need assets to load! 🚀
