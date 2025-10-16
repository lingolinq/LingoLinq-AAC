# Buildpack Asset Pipeline Fix

## Problem Diagnosed

The buildpack deployment was failing to load CSS and JavaScript because:

1. **Heroku buildpacks** automatically run `rake assets:precompile` during the **build stage**
2. The **Procfile** had `bin/deploy_prep` in the `web:` process, which runs during **runtime**
3. **Execution order was wrong**:
   - Build: `rake assets:precompile` runs (Ember not built yet → no assets!)
   - Runtime: `bin/deploy_prep` runs (too late → assets already compiled without Ember)

## Solution Implemented

Created a **`bin/pre-compile`** hook that Heroku buildpacks automatically run BEFORE `rake assets:precompile`.

### Files Modified:

#### 1. `bin/pre-compile` (NEW)
- Runs automatically during buildpack build stage
- Executes `bin/deploy_prep` to build Ember frontend
- Ensures assets exist before Rails precompilation

#### 2. `Procfile` (MODIFIED)
- **Before**: `web: bin/deploy_prep && bundle exec puma -C config/puma.rb`
- **After**: `web: bundle exec puma -C config/puma.rb`
- Removed `bin/deploy_prep` since it now runs during build via `bin/pre-compile`

#### 3. `.buildpacks` (NEW)
- Specifies buildpack order: Node.js first, then Ruby
- Ensures Node.js is available for Ember build

## How It Works

### Build Stage (on Fly.io servers):
1. Node.js buildpack installs npm/bower dependencies
2. **`bin/pre-compile` runs** → executes `bin/deploy_prep`:
   - Copies terms/legal templates
   - Generates version ID
   - **Builds Ember frontend** (creates `app/frontend/dist/`)
   - Cleans old Rails assets
   - Creates symlinks for Ember assets
3. Ruby buildpack runs `rake assets:precompile`:
   - Finds Ember assets (they exist now!)
   - Precompiles CSS and JavaScript
   - Generates fingerprinted assets in `public/assets/`

### Runtime Stage (when app starts):
1. `web:` process starts Puma server
2. Assets already compiled and ready
3. Application serves precompiled assets from `public/assets/`

## Expected Result

- ✅ CSS loads correctly (page is styled)
- ✅ JavaScript loads correctly (Ember app initializes)
- ✅ Application is fully functional
- ✅ Login page is styled and interactive

## Verification

After deployment, check:
1. Visit https://lingolinq-aac.fly.dev/
2. Open browser DevTools → Network tab
3. Verify CSS and JS files load with 200 status (not 404)
4. Verify page is styled correctly
5. Verify Ember app initializes (no "Failed to load" message)

## Technical Notes

### Why `bin/pre-compile`?

Heroku buildpacks (and compatible buildpacks used by Fly.io) automatically look for and execute `bin/pre-compile` if it exists. This is the official hook for running custom scripts before asset precompilation.

See: https://devcenter.heroku.com/articles/buildpack-api#bin-pre-compile

### Why Remove from Procfile?

Running `bin/deploy_prep` in the Procfile's `web:` process means:
- It runs EVERY TIME a web dyno/container starts
- It runs AFTER the build is complete
- It's too late to affect asset precompilation
- It wastes time on every container restart

By moving it to `bin/pre-compile`:
- It runs ONCE during build
- It runs at the RIGHT TIME (before assets:precompile)
- Containers start faster (no deploy_prep on every boot)

## Deployment Command

```bash
fly deploy
```

The buildpack will automatically:
1. Detect the app is Ruby
2. Run `bin/pre-compile` (our hook)
3. Run `rake assets:precompile`
4. Package the compiled assets
5. Deploy the container

---

**Status**: Ready to deploy
**Expected Outcome**: Fully functional application with working CSS and JavaScript

