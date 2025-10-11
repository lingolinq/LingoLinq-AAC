# Archived Session Logs

This document contains the detailed, chronological logs from various debugging and deployment sessions. It is intended for historical reference.

---

## Session: October 6, 2025 - Database & .env Fixes

### Summary
This session focused on fixing the database authentication error that arose after the week-long Bundler issue was resolved. The root causes were a lost database password and a development `.env` file leaking into the production Docker image.

### Issues Resolved

1.  **Database Authentication Failure**:
    - **Problem**: `password authentication failed for user "lingolinq_aac"`.
    - **Solution**: Created a new database user `lingolinq_app` via `flyctl postgres attach`. This generated a new, working `DATABASE_URL` secret.

2.  **.env File Leaking into Docker Image**:
    - **Problem**: The `.env` file was causing the production app to use development settings and attempt to connect to a local database socket.
    - **Solution**: Added `.env` to `.dockerignore`. A `--no-cache` deployment was required to purge the file from cached Docker layers.

3.  **Missing Build-Time Environment Variables**:
    - **Problem**: Asset precompilation was failing because initializers required keys like `MAX_ENCRYPTION_SIZE`.
    - **Solution**: Added dummy environment variables to the `Dockerfile` specifically for the `assets:precompile` stage.

### Final Status (End of Session)
The session concluded with a new blocker: a missing `REDIS_URL` was causing the app to crash. The next step was identified as making the Resque initializer conditional.

---

## Session: October 5, 2025 - Bundler Platform Resolution

### Summary
This session marked the resolution of a week-long, critical deployment blocker related to Bundler's multi-platform gem resolution.

### Major Accomplishment
- **Resolved Error**: `Could not find gems matching 'pg' valid for all resolution platforms (x86_64-linux, ruby)`.

### The Fix
The solution was a three-part fix:
1.  **Downgraded Bundler**: Moved from a buggy version 2.7.1 to the stable **2.5.6**.
2.  **Modified Gemfile.lock**: Removed the generic `ruby` platform, as native gems like `pg` do not have a universal version for it. The lockfile was left with only the necessary `x64-mingw-ucrt` (for Windows development) and `x86_64-linux` (for production) platforms.
3.  **Set Environment Variable**: Used `BUNDLE_FORCE_RUBY_PLATFORM=false` at both build and runtime to ensure Bundler only used platform-specific gems.

### Final Status (End of Session)
The Bundler error was completely gone. The application successfully built and moved on to the next error in the chain: database authentication, which was the focus of the October 6 session.
