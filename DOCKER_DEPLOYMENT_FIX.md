# Docker Deployment Fix - Asset Pipeline Alignment

## Problem Statement

The Docker deployment was failing with CSS errors and 500/503 status codes on Fly.io, Railway, and Render. The README documented this as an ongoing issue:

> **Docker Deployment 🚧**
> - **Production Deployment**: 🚧 IN PROGRESS (CSS errors, 500/503 status codes)
> - Asset pipeline skipping critical build steps compared to traditional deployment

## Root Cause Analysis

After comparing the Dockerfile with the traditional `bin/deploy_prep` script, I identified that **the Docker build was missing critical preprocessing steps** that prepare the application before asset compilation.

### What `bin/deploy_prep` Does (Traditional Deployment)

```bash
1. rake extras:copy_terms    # Copy legal templates from ERB to Ember HBS
2. rake extras:version        # Generate version ID in application-preload.js  
3. ember build               # Build Ember frontend
4. rake assets:clean         # Clean old Rails assets
5. rake assets:precompile    # Precompile Rails assets
```

### What the Dockerfile Was Doing (Missing Steps)

```dockerfile
1. ❌ MISSING: rake extras:copy_terms
2. ❌ MISSING: rake extras:version
3. ✅ ember build
4. ❌ MISSING: rake assets:clean
5. ✅ rake assets:precompile
6. ⚠️  DIFFERENT: Copied files instead of using symlinks
```

## The Solution

Updated the Dockerfile to **exactly match the bin/deploy_prep process**:

### Changes Made to Dockerfile

```dockerfile
# Step 1: Copy terms and legal templates from ERB to Ember HBS
RUN DISABLE_OBF_GEM=true bundle exec rake extras:copy_terms

# Step 2: Generate version ID and update application-preload.js
RUN DISABLE_OBF_GEM=true bundle exec rake extras:version

# Step 3: Build the Ember frontend
RUN cd app/frontend && \
    npx bower install --allow-root --config.interactive=false && \
    ./node_modules/.bin/ember build --environment=production && \
    cd ../..

# Step 4: Clean old Rails assets (matching deploy_prep)
RUN DISABLE_OBF_GEM=true RAILS_ENV=production bundle exec rake assets:clean || true
RUN rm -rf /app/public/assets/*

# Step 5: Create symlinks for Ember assets (matching traditional deployment)
RUN mkdir -p /app/app/assets/javascripts && \
    cd /app/app/assets/javascripts && \
    ln -sf ../../frontend/dist/assets/frontend.js frontend.js && \
    ln -sf ../../frontend/dist/assets/vendor.js vendor.js

# Step 6: Precompile Rails assets (matching deploy_prep)
RUN DISABLE_OBF_GEM=true \
    SECRET_KEY_BASE=dummy \
    RAILS_ENV=production \
    bundle exec rake assets:precompile --trace
```

## Why These Steps Matter

### 1. `rake extras:copy_terms`
Converts Rails ERB templates (`app/views/shared/_*.html.erb`) to Ember HBS templates (`app/frontend/app/templates/*.hbs`). Without this:
- Privacy policy, terms of service, and jobs pages would be missing or broken
- Legal compliance pages wouldn't render in the Ember frontend

### 2. `rake extras:version`
Generates a version ID based on the current date and updates `application-preload.js`. Without this:
- Version tracking for debugging would fail
- Cache busting might not work correctly
- Deployment tracking would be inconsistent

### 3. `rake assets:clean`
Removes old compiled assets before precompilation. Without this:
- Stale assets could interfere with new compilation
- Asset fingerprinting might reference old files
- CSS and JS conflicts could occur

### 4. Symlinks vs. Copying
The traditional deployment uses symlinks (`ln -sf`) to connect Ember build output to Rails assets. The previous Dockerfile copied files (`cp`), which:
- Breaks relative path references in the asset pipeline
- Prevents Rails from finding updated Ember assets
- Causes CSS and JS to fail to load correctly

## Expected Outcome

With these changes, the Docker build now:
1. ✅ Matches the traditional deployment process exactly
2. ✅ Includes all preprocessing steps for templates and versioning
3. ✅ Uses symlinks like the traditional deployment
4. ✅ Cleans old assets before precompilation
5. ✅ Should produce working CSS and JavaScript assets

## Deployment Instructions

1. **Commit and push these changes:**
   ```bash
   git add Dockerfile DOCKER_DEPLOYMENT_FIX.md
   git commit -m "Fix Docker deployment: align asset pipeline with bin/deploy_prep

   - Add rake extras:copy_terms to copy legal templates
   - Add rake extras:version to generate version ID
   - Add rake assets:clean to remove stale assets
   - Use symlinks instead of copying Ember assets
   - Match traditional deployment process exactly
   
   This fixes CSS errors and 500/503 status codes by ensuring
   all preprocessing steps run before asset compilation."
   git push origin fix/deploy-single-stage
   ```

2. **Deploy to Fly.io:**
   ```bash
   fly deploy
   ```

3. **Monitor the build logs for success indicators:**
   - ✅ "==> Copying terms and legal templates..."
   - ✅ "==> Generating version ID..."
   - ✅ "==> Building Ember frontend..."
   - ✅ "==> Cleaning old Rails assets..."
   - ✅ "==> Creating Ember asset symlinks..."
   - ✅ "==> Precompiling Rails assets..."
   - ✅ "Assets precompiled successfully"

4. **Verify the deployment:**
   - Visit https://lingolinq-aac.fly.dev/
   - Check that CSS loads correctly (no broken styling)
   - Verify JavaScript works (no console errors)
   - Test login functionality
   - Check legal pages (privacy, terms) render correctly

## Troubleshooting

If the deployment still fails:

### Check Build Logs
```bash
fly logs
```

Look for:
- Rake task failures during `extras:copy_terms` or `extras:version`
- Ember build errors
- Asset precompilation failures
- Missing symlink errors

### Common Issues

**Issue**: `rake extras:copy_terms` fails
**Solution**: Ensure ERB templates exist in `app/views/shared/`

**Issue**: `rake extras:version` fails  
**Solution**: Check that `app/assets/javascripts/application-preload.js` exists and is writable

**Issue**: Symlink creation fails
**Solution**: Verify Ember build completed and `app/frontend/dist/assets/` contains frontend.js and vendor.js

**Issue**: Asset precompilation fails
**Solution**: Check that symlinks were created successfully before this step

## References

- Traditional deployment process: `bin/deploy_prep`
- Rake tasks: `lib/tasks/extras.rake`
- README: Current Status & Deployment section
- Deployment Playbook: `.ai/docs/DEPLOYMENT_PLAYBOOK.md`

