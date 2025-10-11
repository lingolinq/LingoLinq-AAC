# LingoLinq-AAC Deployment Guide

**Last Updated**: October 9, 2025

This document is the single source of truth for deploying the LingoLinq-AAC application. It includes the current status and a summary of all resolved issues.

---

## 🎯 Current Status: ✅ SUCCESSFULLY DEPLOYED

### Executive Summary
- ✅ Docker build succeeds (366 MB image)
- ✅ Database authentication fixed (user `lingolinq_app`)
- ✅ .env file leak resolved (excluded via .dockerignore)
- ✅ Asset compilation working (all build-time env vars configured)
- ✅ All gems install correctly (Bundler 2.5.6)
- ✅ **Redis/Resque initializer made conditional** (app starts without Redis)
- ✅ **Sprockets initializer fixed** (asset serving now works correctly)
- ✅ **Assets load successfully** (CSS/JS return HTTP 200)
- ✅ **Application running on Fly.io**: https://lingolinq-aac.fly.dev/

### 🎉 Deployment Complete!
The application is successfully deployed and serving assets correctly. After **2+ weeks of debugging**, all deployment blockers have been resolved.

---

## 🚀 Final Deployment Steps

This section provides the exact steps to resolve the `REDIS_URL` issue and complete the deployment.

### Step 1: Make the Resque Initializer Conditional
The application crashes because the Resque initializer requires `REDIS_URL`. Modify the initializer to only run if this variable is present.

1.  **Read the initializer file**:
    ```bash
    cat config/initializers/resque.rb
    ```

2.  **Modify the file** (`config/initializers/resque.rb`) to wrap the existing configuration in a conditional check:
    ```ruby
    if ENV['REDIS_URL'].present?
      # EXISTING resque configuration here
      # (everything that's currently in the file)
    else
      Rails.logger.warn "⚠️  REDIS_URL not set - Resque background jobs disabled"
      Rails.logger.warn "   Deploy Fly.io Redis when ready for background jobs"
    end
    ```

### Step 2: Deploy the Application
Deploy the application to Fly.io. Since only one file has changed, the build will use cached layers and should be relatively quick.

```bash
flyctl deploy --app lingolinq-aac --wait-timeout 300
```

### Step 3: Verify Success
After the deployment finishes, verify that the application is running correctly.

1.  **Check machine status**:
    ```bash
    flyctl status --app lingolinq-aac
    ```
    The output should show `STATE = started` or `running`.

2.  **Check application logs**:
    ```bash
    flyctl logs --app lingolinq-aac
    ```
    You should see the warning message "⚠️ REDIS_URL not set..." but no crash errors.

3.  **Test the health endpoint**:
    ```bash
    curl https://lingolinq-aac.fly.dev/health
    ```
    This should return `{"active":true}`.

### Step 4: Commit All Changes
Once the deployment is verified, commit all the related fixes.

```bash
git add .dockerignore Dockerfile fly.toml config/initializers/resque.rb
git commit -m "fix: Resolve all deployment blockers - ready for production

- Created new database user lingolinq_app with working credentials.
- Added .env to .dockerignore to prevent development config from leaking into production.
- Added build-time ENV vars for asset compilation.
- Made Resque initializer conditional on REDIS_URL to allow startup without Redis.
- Fixed Bundler platform resolution (Bundler 2.5.6, removed ruby platform).

Deployment now works. Background jobs are disabled until Fly.io Redis is deployed."
```

---

## 📚 Resolved Issues Summary

This is a brief history of the major blockers that were resolved to get to this point.

### 1. Bundler Platform Resolution (A Week-Long Issue)
- **Problem**: `Could not find gems matching 'pg' valid for all resolution platforms (x86_64-linux, ruby)`.
- **Solution**:
    1.  Downgraded Bundler from 2.7.1 to **2.5.6**.
    2.  Removed the generic `ruby` platform from `Gemfile.lock` using `bundle lock --remove-platform ruby`.
    3.  Set `BUNDLE_FORCE_RUBY_PLATFORM=false` as an environment variable during build and runtime.

### 2. Database Authentication Failure
- **Problem**: `password authentication failed for user "lingolinq_aac"`.
- **Solution**: Created a new database user (`lingolinq_app`) and attached it to the application, which automatically generated a new, valid `DATABASE_URL` secret.

### 3. .env File Leaking into Docker Image
- **Problem**: The development `.env` file was being copied into the production image, causing incorrect database connection settings.
- **Solution**: Added `.env` to the `.dockerignore` file and performed a `--no-cache` deployment to ensure the file was excluded from all layers.

### 4. Missing Build-Time Environment Variables
- **Problem**: Asset precompilation failed due to missing `MAX_ENCRYPTION_SIZE` and other keys required by initializers.
- **Solution**: Added a block of dummy `ENV` variables to the `Dockerfile` specifically for the `rake assets:precompile` step.

### 5. Sprockets Initializer Causing 500 Errors on Assets
- **Problem**: CSS and JS assets returned HTTP 500 errors in production, preventing the page from loading properly.
- **Root Cause**: The `config/initializers/sprockets_ruby32_fix.rb` was patching Sprockets at runtime. When `config.assets.compile = false` (production mode), Rails should serve precompiled assets as static files without Sprockets involvement.
- **Solution**: Modified the initializer to only apply during asset precompilation:
  ```ruby
  if defined?(Sprockets::DirectiveProcessor) && (Rails.env.development? || Rails.env.test? || ENV['RAILS_GROUPS']&.include?('assets'))
    # ... Sprockets patch code ...
  end
  ```

### 6. Missing Ember Dist Files in Public Directory (The ACTUAL Final Blocker!)
- **Problem**: After fixing Sprockets, page still showed white screen with "Loading LingoLinq AAC..." text. The application appeared to load but Ember never initialized. This persisted across local, Render, Railway, and Fly.io deployments for 2+ weeks.
- **Root Cause**: The Ember build creates `frontend.js` (4.58 MB) and `vendor.js` (1.15 MB) in `app/frontend/dist/assets/`, but these files were **never being copied to `/app/public/`** where Rails serves static files from. Only a tiny 25KB Rails stub was being served instead of the actual Ember application.
- **Solution**: Added a copy step to the Dockerfile immediately after the Ember build:
  ```dockerfile
  # Copy Ember build output to public directory for serving
  RUN mkdir -p /app/public && \
      cp -r /app/app/frontend/dist/* /app/public/
  ```
- **Impact**: This was the **actual final blocker** after 2+ weeks of troubleshooting across multiple platforms. Once fixed, the full 4.58MB Ember application loads correctly and the page renders properly.

---

## 🎓 Key Learnings

### Docker & Rails
- **Asset precompilation loads all initializers**: Ensure all required environment variables are present at build time, even if they are dummy values.
- **Always use `.dockerignore`**: Prevent sensitive or environment-specific files like `.env` from ever entering the image.
- **Beware of Docker layer caching**: When troubleshooting file inclusion issues, use `--no-cache` to ensure you are working with a clean build.
- **Initializers run at runtime too**: Be careful with initializers that patch libraries - they may interfere with production serving even after successful precompilation.
- **Sprockets in production**: When `config.assets.compile = false`, Sprockets should not be involved in serving assets. Any Sprockets patches should only run during precompilation.
- **Ember builds must be copied to public/**: In a Rails + Ember setup, the Ember build output (typically in `app/frontend/dist/`) must be explicitly copied to `/app/public/` in the Dockerfile. Rails serves static files from `public/`, not from the Ember dist directory.

### Fly.io Deployment
- **Creating new DB users is easy**: `flyctl postgres attach --database-user new_user --yes` is often simpler than resetting a password.
- **Conditional initializers are robust**: Instead of crashing, have initializers for optional services (like Redis) fail gracefully with a warning if their dependencies aren't configured.
- **Asset serving issues may not appear in logs**: The app can appear "healthy" in logs while still failing to serve assets to browsers. Always test in a real browser.
