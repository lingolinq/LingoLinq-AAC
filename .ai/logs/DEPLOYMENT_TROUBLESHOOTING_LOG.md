# LingoLinq-AAC Deployment Troubleshooting Log

## Current Status: UNRESOLVED ❌
**Date**: October 12, 2025
**Duration**: 2+ weeks of deployment failures
**Issue**: Assets return 500 errors in browser, despite curl showing HTTP 200

---

## Symptom Summary

### What Works ✅
- Docker build completes successfully
- Assets are precompiled and fingerprinted correctly
- Health checks pass
- Application starts without errors
- `curl` requests to assets return HTTP 200
- Assets serve correctly via command line tools

### What Fails ❌
- Browser requests to CSS/JS assets return HTTP 500
- Error in browser console:
  ```
  application-9ff0235dc34d39a640d85119c48be64e1303c2b2a7ca890a14a5b5e1fd4b7778.css net::ERR_ABORTED 500
  application-477f66cd97c67d6c5c2803a8526cbdd0a2d7b35f.js net::ERR_ABORTED 500
  ```
- Fallback HTML message appears: "Failed to load core application"

---

## Root Cause Analysis

### The Sprockets chomp! Bug (Ruby 3.2+)
**Error**: `NoMethodError: undefined method 'chomp!' for true:TrueClass`

**Where it occurs**:
- In `Sprockets::DirectiveProcessor` at line 84
- Triggered when Sprockets processes asset directives
- Happens with Ruby 3.2+ due to breaking change

**Our fix** (config/initializers/sprockets_ruby32_fix.rb):
```ruby
if defined?(Sprockets::DirectiveProcessor)
  module SprocketsChompFix
    def call(input)
      result = super(input)
      if result && result[:data] && !result[:data].is_a?(String)
        result[:data] = result[:data].to_s
      end
      result
    end
  end
  Sprockets::DirectiveProcessor.prepend(SprocketsChompFix)
end
```

**Status**: ✅ Applied and confirmed loading in production logs

---

## Fixes Attempted (Chronological)

### 1. **Sprockets Ruby 3.2 Fix** (Initial attempt)
- **File**: config/initializers/sprockets_ruby32_fix.rb
- **Change**: Created monkey patch for Sprockets::DirectiveProcessor
- **Initial scope**: Only dev/test/asset precompilation
- **Result**: ❌ Still got 500 errors in production runtime

### 2. **Extended Sprockets Fix to Production** (October 12)
- **Change**: Removed environment condition to apply fix in ALL environments
- **Reasoning**: Discovered Sprockets WAS being invoked at runtime despite precompilation
- **Result**: ❌ Assets still returned 500 in browser

### 3. **Rack::Deflater Middleware** (October 12)
- **File**: config/application.rb
- **Change**: Added `config.middleware.insert_before ActionDispatch::Static, Rack::Deflater`
- **Reasoning**: Thought ActionDispatch::Static had bug with pre-gzipped files
- **Result**: ❌ No change; later removed

### 4. **public_file_server.enabled Configuration** (October 12)
- **File**: config/environments/production.rb
- **Change**: From `ENV.fetch('RAILS_SERVE_STATIC_FILES') { true }` to `ENV['RAILS_SERVE_STATIC_FILES'] == 'true'`
- **Reasoning**: Prevent Rails from serving static files, let Fly.io's proxy handle it
- **Result**: ❌ Assets still return 500 in browser

### 5. **NoCompression Class Diagnostic** (October 12)
- **Test**: Commented out custom NoCompression class
- **Discovery**: Build FAILED with chomp! error during asset precompilation
- **Conclusion**: NoCompression class is NECESSARY to prevent build failures
- **Action**: Reverted - kept NoCompression class
- **Result**: Build works, but runtime 500 errors persist

---

## Current Configuration

### Dockerfile (single-stage)
```dockerfile
FROM ruby:3.2.8-slim

# Install bundler 2.5.6 (stable - 2.7.1 has bugs)
RUN gem install bundler:2.5.6

# Install gems with DISABLE_OBF_GEM=true
RUN bundle config set --local without 'development test' && \
    DISABLE_OBF_GEM=true bundle install

# Build Ember frontend
RUN cd app/frontend && \
    npx bower install --allow-root && \
    ./node_modules/.bin/ember build --environment=production

# Precompile Rails assets
RUN DISABLE_OBF_GEM=true \
    SECRET_KEY_BASE=dummy \
    RAILS_ENV=production \
    bundle exec rake assets:precompile
```

### production.rb Key Settings
```ruby
# Static file serving
config.public_file_server.enabled = ENV['RAILS_SERVE_STATIC_FILES'] == 'true'
config.public_file_server.headers = {
  'Cache-Control' => 'public, max-age=31536000'
}

# Asset compilation disabled in production
config.assets.compile = false

# NoCompression class (prevents build errors)
class NoCompression
  def compress(string)
    string.gsub(/\/\/\# sourceMappingURL/, '//# xsourceMappingURL')
  end
end
config.assets.js_compressor = NoCompression.new
```

### fly.toml
```toml
[env]
RAILS_ENV = "production"
RAILS_SERVE_STATIC_FILES = "true"  # Explicitly set
RAILS_LOG_TO_STDOUT = "true"
```

---

## Test Results

### curl Tests (Working ✅)
```bash
# CSS asset
curl -I -H "Accept-Encoding: gzip" https://lingolinq-aac.fly.dev/assets/application-9ff0235dc34d39a640d85119c48be64e1303c2b2a7ca890a14a5b5e1fd4b7778.css
# Returns: HTTP/1.1 200 OK

# JS asset
curl -I -H "Accept-Encoding: gzip" https://lingolinq-aac.fly.dev/assets/application-477f66cd97c67d6c5c2803a8526cbdd0a2d7b1e7762cc3a53ac3ab4167c6b35f.js
# Returns: HTTP/1.1 200 OK
```

### Browser Tests (Failing ❌)
- Hard refresh (Ctrl+Shift+R)
- Incognito mode
- Multiple browsers tested
- Always returns: HTTP 500 for both CSS and JS assets

---

## Key Observations

### 1. curl vs Browser Discrepancy
- **curl with `Accept-Encoding: gzip`**: HTTP 200 ✅
- **Browser with same headers**: HTTP 500 ❌
- **Hypothesis**: Something in the request headers or browser behavior triggers different code path

### 2. Logs Show No Recent Asset Requests
- Only health check requests in logs
- No `/login` requests logged
- No asset request errors logged
- **Implication**: May need to test with actual browser and capture live logs

### 3. NoCompression Class Behavior
- **During build**: Prevents chomp! errors ✅
- **At runtime**: Unknown if causing issues
- **Purpose**: Bypasses source map compression to avoid Sprockets bugs

### 4. Sprockets Invocation Mystery
- `config.assets.compile = false` should disable runtime compilation
- Yet Sprockets IS being invoked somehow
- Sprockets fix confirms it's loading: "✅ Sprockets Ruby 3.2 fix applied (production)"

---

## Unexplored Hypotheses

### 1. Fly.io Proxy/CDN Layer
- Fly.io may be caching error responses
- CDN might be serving stale 500 responses
- **Next step**: Try purging Fly.io cache or CDN

### 2. Browser-Specific Headers
- Browsers send additional headers curl doesn't
- Could be: `User-Agent`, `Accept`, `Accept-Language`, `Referer`, etc.
- **Next step**: Capture full request headers from failing browser request

### 3. Asset Pipeline Configuration
- `config.assets.digest = true` generates fingerprinted filenames
- `config.assets.initialize_on_precompile = false` may be interfering
- **Next step**: Try changing this to `true`

### 4. ActionDispatch::Static Middleware
- Even with `config.public_file_server.enabled = true`, middleware may have bugs
- **Next step**: Try serving assets through Nginx sidecar or Fly.io's static serving

### 5. Rails Routes Conflict
- Routes may be intercepting `/assets/*` requests
- **Next step**: Check config/routes.rb for any asset-related routes

### 6. MIME Type Issues
- Browser rejecting assets due to incorrect Content-Type
- **Next step**: Check actual Content-Type headers in browser DevTools

---

## Environment Details

- **Platform**: Fly.io (ord region)
- **Ruby**: 3.2.8
- **Rails**: 6.1.7
- **Ember**: 3.12 (legacy)
- **Node**: 18.x
- **Bundler**: 2.5.6
- **Database**: Fly.io Managed PostgreSQL
- **Container**: Docker single-stage build

---

## Git Commits Related to This Issue

```
3784309ef - fix: Keep NoCompression class, update public_file_server config
348adbb9d - Revert "test: Remove NoCompression class to diagnose asset serving"
66b9313c5 - test: Remove NoCompression class to diagnose asset serving
[previous commits with Sprockets fixes and Rack::Deflater attempts]
```

---

## Next Steps to Try

### High Priority 🔴

1. **Capture live browser request/response**
   - Use browser DevTools Network tab during actual page load
   - Compare full headers between curl (working) and browser (failing)
   - Check response body of 500 error for error message

2. **Check Fly.io logs during browser test**
   - Run `flyctl logs` in real-time
   - Load page in browser
   - Look for actual error messages when 500 occurs

3. **Test without gzip**
   - Try deleting .gz files from build
   - Force serving uncompressed assets
   - See if issue is specifically with gzip handling

### Medium Priority 🟡

4. **Try Heroku-style deployment**
   - As mentioned in DEPLOYMENT_HANDOFF.md
   - Original Sweet Suite was designed for Heroku buildpacks
   - May avoid Docker-specific issues

5. **Disable NoCompression selectively**
   - Try using it only for precompilation, not runtime
   - Use environment variable to control when it's applied

6. **Test with config.assets.compile = true**
   - Temporarily enable runtime compilation
   - See if it bypasses the issue (not a solution, but diagnostic)

### Low Priority 🟢

7. **Upgrade Sprockets**
   - Check if newer Sprockets version fixes chomp! bug natively
   - May eliminate need for monkey patch

8. **Try different deployment platform**
   - Test on Railway, Render, or DigitalOcean
   - Rule out Fly.io-specific issues

---

## Files Modified During Troubleshooting

- `config/initializers/sprockets_ruby32_fix.rb` - Created Sprockets monkey patch
- `config/environments/production.rb` - Modified public_file_server config, kept NoCompression
- `config/application.rb` - Added/removed Rack::Deflater (currently removed)
- `Dockerfile` - Added diagnostic logging for asset verification
- `app/views/layouts/application.html.erb` - Added fallback error message

---

## Related Documentation

- `.ai/docs/DEPLOYMENT_HANDOFF.md` - Comprehensive 2-week deployment history
- `CLAUDE.md` - Project overview and context
- GitHub Issue #5 - Ember modernization tracking
- Sprockets issue: https://github.com/rails/sprockets/issues/716

---

## Questions Still Unanswered

1. **Why does curl work but browser fails with identical headers?**
2. **What specific code path executes differently for browser requests?**
3. **Is Fly.io's proxy/CDN interfering with asset serving?**
4. **Why is Sprockets being invoked at runtime despite compile=false?**
5. **Is there a Rails route accidentally intercepting /assets/* requests?**

---

## Contact/Continuation

If this issue continues, consider:
- Posting to Rails/Sprockets GitHub issues
- Consulting Fly.io support about CDN/proxy behavior
- Hiring a Rails deployment specialist
- Migrating to Heroku (original deployment target)

**Last Updated**: October 12, 2025
**Session**: Claude Code troubleshooting session
