# LingoLinq-AAC Deployment Handoff

## 🎯 Mission
Get LingoLinq-AAC (forked from Sweet Suite) successfully deployed to production. The app has been stuck at a white "Loading..." screen for 2+ weeks across all deployment attempts (local, Render, Railway, Fly.io).

## 🔍 Critical Discovery
**Sweet Suite was designed for Heroku-style deployment, NOT Docker.** The original deployment process:
1. Runs `bin/deploy_prep` locally to build Ember and compile assets
2. **Commits compiled assets to git**
3. Pushes pre-built assets to Heroku/production
4. Production just serves the pre-compiled assets (no build step)

**Our mistake**: We've been trying to build assets inside Docker at deploy time, but the asset pipeline breaks because:
- Symlinks from `lib/tasks/extras.rake` don't survive Docker multi-stage builds
- The workflow expects assets to be pre-built and committed to git
- Docker multi-stage `COPY --from=build` doesn't preserve symlinks properly

## 📊 Current Status

### What Works
- ✅ App builds successfully in Docker
- ✅ Health checks pass
- ✅ Rails server starts
- ✅ Database connects (Fly.io PostgreSQL)
- ✅ Redis optional (gracefully disabled if not present)

### What Doesn't Work
- ❌ `application.css` returns HTTP 500
- ❌ `application.js` returns HTTP 500
- ❌ Page stuck on white "Loading LingoLinq AAC..." screen
- ❌ Browser shows "Failed to load resource" errors for core assets
- ❌ Ember app never initializes

## 📁 Key Files to Review

### Deployment Configuration
- `bin/deploy_prep` - Original Sweet Suite deployment script (PRE-COMPILES assets locally, commits to git)
- `lib/tasks/extras.rake` - Creates symlinks for Ember assets during precompilation
- `Dockerfile` - Current multi-stage Docker build (BREAKS symlinks)
- `Dockerfile.singlestage` - Alternative single-stage approach
- `fly.toml` - Fly.io configuration

### Asset Pipeline
- `config/environments/production.rb` - Has `config.assets.compile = false` (expects pre-compiled assets)
- `app/frontend/` - Ember 3.12 application
- `public/assets/` - Where Rails serves static assets from (should contain compiled assets)

### Documentation
- `docs/DEPLOYMENT_GUIDE.md` - 2 weeks of failed attempts documented
- `README.md` from https://github.com/open-aac/sweet-suite-aac - Original deployment process

## 🛣️ Two Viable Paths Forward

### Option 1: Heroku-Style Deployment (RECOMMENDED)
**Use Sweet Suite's original deployment approach - simpler, proven to work**

**Strategy:**
1. Use Render or Heroku buildpacks (NO Docker)
2. Run `bin/deploy_prep` locally before each deploy
3. Commit compiled assets to git
4. Push to production (just serves pre-built assets)

**Pros:**
- Matches how the app was designed
- No Docker complexity
- Proven to work with Sweet Suite
- Faster deploys (no build step in production)

**Cons:**
- Git repo gets large (compiled assets tracked)
- Must run `bin/deploy_prep` before each deploy
- Old Ruby/Node versions needed locally

**Next Steps:**
1. Set up Heroku or Render with Ruby/Node buildpacks
2. Configure environment variables
3. Run `bin/deploy_prep` locally
4. Commit and push to deploy

### Option 2: Fix Docker Build (HARDER)
**Make Docker work by replicating Sweet Suite's asset pipeline**

**Strategy:**
1. Modify Dockerfile to use single-stage build (preserve symlinks)
2. Run the equivalent of `bin/deploy_prep` inside Docker
3. Ensure `rm public/assets/*` happens before `rake assets:precompile`
4. Copy ALL necessary files (including symlinks) to final image

**Pros:**
- Docker isolation for dependencies
- Can use newer Ruby/Node in host system
- Reproducible builds

**Cons:**
- More complex
- Need to debug why symlinks break
- 2 weeks already spent on this approach

**Next Steps:**
1. Switch to single-stage Dockerfile
2. Replicate `bin/deploy_prep` steps in Docker
3. Debug symlink preservation through Docker layers

## 🔑 Key Technical Details

### The Asset Pipeline Flow (from bin/deploy_prep)
```bash
# 1. Build Ember frontend
cd app/frontend && ember build --environment=production

# 2. CRITICAL: Clean public/assets BEFORE precompiling
rake assets:clean RAILS_ENV=production
rm public/assets/*

# 3. Precompile Rails assets (creates symlinks via lib/tasks/extras.rake)
rake assets:precompile RAILS_ENV=production

# 4. Commit BOTH Ember dist AND compiled public/assets to git
git add app/frontend/dist/.
git add public/assets/. --all
```

### Why Symlinks Matter
`lib/tasks/extras.rake` creates symlinks like:
```ruby
`cd app/assets/javascripts/ && ln -sf ../../frontend/dist/assets/frontend.js frontend.js`
`cd app/assets/javascripts/ && ln -sf ../../frontend/dist/assets/vendor.js vendor.js`
```

These symlinks make Ember's 4.58MB `frontend.js` and 1.15MB `vendor.js` available to Sprockets during asset precompilation. Without them, Rails only creates a 25KB stub file.

### Tech Stack
- **Rails**: 6.1.7
- **Ruby**: 3.2.8 (was 3.2.9, downgraded)
- **Ember**: 3.12 (legacy, requires Node 14-18)
- **Node**: 18.x (in Docker)
- **Bundler**: 2.5.6 (2.7.1 has bugs)
- **Database**: PostgreSQL
- **Redis**: Optional (Resque background jobs)

## 🚨 Critical Constraints

### Do NOT:
- Break existing SweetSuite backend code
- Remove the `sprockets_ruby32_fix.rb` initializer (needed for Ruby 3.2 compatibility)
- Use Bundler 2.7.1 (has platform resolution bugs)
- Forget `DISABLE_OBF_GEM=true` when running bundle commands

### Must Have:
- `config.assets.compile = false` in production (serve pre-compiled assets only)
- Redis/Resque initializer must be conditional (app should work without Redis)
- Database authentication working (currently using `lingolinq_app` user)
- All environment variables set (see `config/initializers` for required vars)

## 📝 Environment Variables Required
```bash
# Database (auto-configured by Fly.io attach)
DATABASE_URL=postgres://...

# Rails secrets
SECRET_KEY_BASE=...
RAILS_MASTER_KEY=...

# App-specific (use dummy values for asset precompilation)
MAX_ENCRYPTION_SIZE=25000000
MAX_FILE_SIZE=25000000
SECURE_ENCRYPTION_KEY=...
SECURE_NONCE_KEY=...
COOKIE_KEY=...

# Optional
REDIS_URL=... (only if using background jobs)
TRACK_JS_TOKEN=... (only if using TrackJS error tracking)
```

## 🎬 Recommended Action Plan

**For the new Claude Code session, I recommend:**

1. **START FRESH** - Don't try to fix the existing Docker build
2. **Use Option 1 (Heroku-style)** - It's proven and simpler
3. **Deploy to Render.com** - They support both buildpacks and Docker, easy to switch
4. **Follow these steps:**
   - Create new Render web service with Ruby buildpack
   - Set up PostgreSQL database
   - Configure environment variables
   - Run `bin/deploy_prep` locally (might need to adjust for LingoLinq rename)
   - Commit compiled assets to git
   - Push to Render
   - Test if assets load correctly

If that works, we know the app itself is fine and can then decide if Docker is worth the complexity.

## 📚 Reference Links
- Original Sweet Suite: https://github.com/open-aac/sweet-suite-aac
- Current deployment: https://lingolinq-aac.fly.dev/ (shows white loading screen)
- Deploy docs: `docs/DEPLOYMENT_GUIDE.md`

## 🤔 Questions for Next Session

1. Should we use Render with buildpacks (Option 1) or fix Docker (Option 2)?
2. Do we need Docker for other dependencies, or can we use older Ruby/Node locally just for deployment?
3. Should we track compiled assets in git (Sweet Suite style) or find another approach?

---

**Bottom Line**: Sweet Suite was designed for Heroku/buildpack deployment with pre-compiled assets committed to git. Fighting against this design in Docker has cost 2 weeks. Recommend trying the original approach first before continuing Docker debugging.
