# Ember Build Process - Local Pre-compilation Strategy

## Overview

As of October 17, 2025, we've switched to a **local pre-compilation strategy** for Ember assets to ensure deployment reliability and consistency.

### Why This Approach?

**Problem:** Building Ember assets inside the Docker container during deployment was unreliable:
- Deployed JavaScript contained old/broken code
- Asset pipeline integration was inconsistent
- Difficult to debug what was actually deployed
- Long build times on deployment platform

**Solution:** Build Ember assets locally, commit them to Git, deploy pre-built assets:
- ✅ Deploy exactly what you tested locally
- ✅ Faster deployments (no npm/bower install in container)
- ✅ Easier debugging (inspect committed files)
- ✅ Consistent builds across environments

## Build Process

### 1. Local Ember Build

**Build Script:** `bin/build-ember-local`

```bash
# Run from project root
./bin/build-ember-local
```

This script:
1. Changes to `app/frontend/` directory
2. Installs npm dependencies (if needed)
3. Installs bower dependencies (if needed)
4. Builds Ember with `ember build --environment=production`
5. Verifies output files exist
6. Shows file sizes

**Output:** `app/frontend/dist/assets/` containing:
- `vendor.js` - Third-party libraries (Ember, jQuery, etc.)
- `frontend.js` - Your application code
- Other assets (CSS, images, etc.)

### 2. Commit to Git

After building locally:

```bash
git add app/frontend/dist/
git commit -m "build: Update Ember assets"
```

**Important:** The `app/frontend/dist/` directory is now tracked in Git (previously ignored).

### 3. Docker Deployment

The simplified `Dockerfile.singlestage`:

1. **Skips Ember build entirely** - No npm install, no bower, no ember build
2. **Verifies pre-built assets exist** - Fails fast if you forgot to build locally
3. **Copies pre-built assets** - From `app/frontend/dist/assets/` to `/app/public/assets/`
4. **Rails asset precompile only** - Compiles application.js, application.css (Rails assets)

**Result:** Deployed app uses your locally-built Ember assets.

## Asset Loading Strategy

### Rails Assets vs Ember Assets

**Rails Assets (via Sprockets):**
- `application.js` - Rails JavaScript (action_cable, preload scripts)
- `application.css` - Rails stylesheets
- Processed by Sprockets during `rake assets:precompile`

**Ember Assets (pre-built):**
- `vendor.js` - Ember framework + dependencies
- `frontend.js` - Your Ember application
- NOT processed by Sprockets - served as static files

### Script Loading Order

In `app/views/boards/index.html.erb`:

**Production:**
```javascript
// 1. Load vendor.js (Ember framework)
var vendor = document.createElement('script');
vendor.src = "/assets/vendor.js";
document.body.appendChild(vendor);

vendor.onload = function() {
  // 2. Load frontend.js (Ember app)
  var frontend = document.createElement('script');
  frontend.src = "/assets/frontend.js";
  document.body.appendChild(frontend);

  frontend.onload = function() {
    // 3. Load application.js (Rails assets)
    var script = document.createElement('script');
    script.src = "<%= asset_path('application.js') %>";
    document.body.appendChild(script);
  };
};
```

**Development:**
```erb
<script src="/assets/vendor.js"></script>
<script src="/assets/frontend.js"></script>
<%= javascript_include_tag "application", :defer => true %>
```

**Why this order?**
1. Ember framework must load first (vendor.js)
2. Your Ember app needs the framework (frontend.js)
3. Rails assets load last (application.js)

## File Structure

```
LingoLinq-AAC/
├── app/
│   ├── frontend/           # Ember application source
│   │   ├── app/           # Ember app code
│   │   ├── dist/          # 🆕 PRE-BUILT ASSETS (committed to git)
│   │   │   └── assets/
│   │   │       ├── vendor.js
│   │   │       ├── frontend.js
│   │   │       └── ...
│   │   ├── package.json
│   │   ├── bower.json
│   │   └── ember-cli-build.js
│   └── assets/
│       └── javascripts/
│           └── application.js  # Rails assets only
├── public/
│   └── assets/            # Final deployed location (both Rails + Ember)
├── bin/
│   └── build-ember-local  # 🆕 Build script
└── Dockerfile.singlestage # Simplified (no Ember build)
```

## Workflow

### Making Frontend Changes

1. **Edit Ember code** in `app/frontend/app/`
2. **Build locally:**
   ```bash
   ./bin/build-ember-local
   ```
3. **Test locally** (optional but recommended):
   ```bash
   # In Docker container
   docker-compose up
   # Or native Rails
   bundle exec rails server
   ```
4. **Commit built assets:**
   ```bash
   git add app/frontend/dist/
   git commit -m "feat: Add new feature to Ember app"
   ```
5. **Deploy:**
   ```bash
   flyctl deploy --app lingolinq-aac
   ```

### Verifying Deployment

After deployment, check:

1. **Build logs** - Should show "Found pre-built Ember assets"
2. **Asset files** - Verify vendor.js and frontend.js exist in public/assets
3. **Browser** - Check deployed app at https://lingolinq-aac.fly.dev
4. **Console** - No JavaScript errors related to missing namespaces

## Troubleshooting

### "ERROR: No pre-built Ember assets found!"

**Cause:** You didn't build Ember locally before deploying.

**Solution:**
```bash
./bin/build-ember-local
git add app/frontend/dist/
git commit -m "build: Add pre-built Ember assets"
git push
```

### "LingoLinqAAC is not defined" in browser

**Cause:** Script loading order is incorrect.

**Solution:** Verify `app/views/boards/index.html.erb` loads scripts in correct order:
1. vendor.js
2. frontend.js
3. application.js

### Old code still deployed

**Cause:** You built locally but forgot to commit.

**Solution:**
```bash
git status  # Check if app/frontend/dist/ has changes
git add app/frontend/dist/
git commit -m "build: Update Ember assets"
```

### Build fails locally

**Cause:** Missing dependencies or Ember build errors.

**Solution:**
```bash
cd app/frontend
rm -rf node_modules bower_components
npm install --legacy-peer-deps
npx bower install --allow-root
ember build --environment=production
```

## Benefits of This Approach

✅ **Reliability:** Deploy exactly what you tested locally
✅ **Speed:** No npm/bower install during deployment
✅ **Debuggability:** Inspect committed files to see what's deployed
✅ **Consistency:** Same build process locally and in CI
✅ **Simplicity:** Dockerfile is much simpler

## Migration Notes

**Previous Approach (removed):**
- Dockerfile installed Node.js, npm, bower
- Ran `ember build` inside container during deployment
- Assets built on-the-fly on deployment platform
- Unreliable, slow, hard to debug

**Current Approach (since Oct 17, 2025):**
- Build Ember locally with `./bin/build-ember-local`
- Commit `app/frontend/dist/` to Git
- Dockerfile copies pre-built assets
- Fast, reliable, easy to debug

## Related Files

- `Dockerfile.singlestage` - Simplified Docker build (lines 47-88)
- `app/views/boards/index.html.erb` - Script loading logic (lines 80-123)
- `app/assets/javascripts/application.js` - Rails assets only (no Ember)
- `bin/build-ember-local` - Build script (run this before deploying)
- `.gitignore` - Ensure `app/frontend/dist/` is NOT ignored

## Last Updated

October 17, 2025 - Switched to local pre-compilation strategy
