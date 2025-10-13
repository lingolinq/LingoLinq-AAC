# Fly.io Deployment Fix - "Not Listening on Expected Address"

## Problem
The Rails application deployment on Fly.io was failing with the error:
```
WARNING The app is not listening on the expected address and will not be reachable by fly-proxy.
```

The `release_command` (database migrations) completed successfully, but new machines failed to start.

## Root Cause
The issue was caused by:
1. Missing explicit PORT environment variable in fly.toml
2. Insufficient logging in Puma configuration to diagnose binding issues
3. Lack of startup diagnostics to verify environment configuration

## Changes Made

### 1. config/puma.rb
**Updated Puma configuration for better Fly.io compatibility:**
- Added explicit environment variable handling with `ENV.fetch`
- Added comprehensive startup logging to show binding configuration
- Added worker boot/shutdown logging for debugging
- Added graceful shutdown timeouts
- Made binding more explicit: `bind "tcp://0.0.0.0:#{port}"`

### 2. fly.toml
**Enhanced Fly.io configuration:**
- Added explicit `PORT = "3000"` environment variable
- Increased HTTP health check grace period from 90s to 120s
- Added TCP health check for faster detection of binding issues
- Better alignment between internal_port and PORT variable

### 3. bin/docker-start.sh
**Enhanced startup script with diagnostics:**
- Added environment variable display (RAILS_ENV, PORT, binding address)
- Shows binding configuration before Puma starts
- Helps diagnose issues in Fly.io logs

### 4. Dockerfile
**Updated to use diagnostic startup script:**
- Changed CMD from direct Puma execution to `./bin/docker-start.sh`
- Updated COPY command to use docker-start.sh instead of render-start.sh
- Maintains all existing build optimizations

## Expected Outcome
After these changes:
1. Puma will explicitly bind to `0.0.0.0:3000`
2. Fly.io proxy will detect the application listening on the expected address
3. Startup logs will show detailed binding information for debugging
4. Health checks will have more time to complete during startup
5. TCP checks will quickly detect if the port is not bound

## Deployment Instructions
1. Commit and push these changes to the repository
2. Run `fly deploy` from the project root
3. Monitor logs with `fly logs` to verify:
   - PORT environment variable is set to "3000"
   - Puma startup shows "Binding to: 0.0.0.0:3000"
   - Workers boot successfully
   - Health checks pass

## Verification
After deployment succeeds, verify:
- Application is accessible at https://lingolinq-aac.fly.dev/
- Health endpoint responds: https://lingolinq-aac.fly.dev/health
- No 500 errors or binding warnings in logs
