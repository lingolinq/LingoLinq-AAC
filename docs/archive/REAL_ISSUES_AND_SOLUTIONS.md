# Real Issues and Proper Solutions

## Summary

We've been treating **symptoms** instead of the **root cause**. The app is already on **Ember 3.28** with KNOWN deprecations that need proper migration, not workarounds.

---

## ✅ What We Fixed (Actually Useful)

### 1. Rails Host Authorization
- **File**: `config/environments/development.rb`
- **Fix**: Added `config.hosts.clear`
- **Status**: ✅ GOOD - This was needed

### 2. CORS Configuration  
- **Files**: `Gemfile`, `config/environments/development.rb`
- **Fix**: Added `rack-cors` gem and CORS middleware
- **Status**: ✅ GOOD - This allows cross-origin requests

### 3. Production Build Deployment
- **Fix**: Rebuilt Ember production assets and deployed to `public/`
- **Status**: ✅ GOOD - App is now accessible on port 5000

---

## ❌ What We Did Wrong (Going in Circles)

### 1. Tried to "Fix" Mixed Content by Configuration
- **Problem**: Mixed content errors are REAL HTTP requests in the app code
- **What We Did**: Changed Ember proxy, updated CSP, added API_HOST
- **Why It Failed**: The production build doesn't use development proxy anyway
- **Reality**: Those HTTP image URLs are **in the database** and need to be migrated or handled

### 2. Focused on Port 8184 (Dev Server)
- **Problem**: Port 8184 is the Ember DEV server and shouldn't be accessed directly
- **What We Did**: Tried to configure it for production use
- **Why It Failed**: It's meant for hot-reload development only
- **Reality**: Production app runs on port 5000 (Rails serving compiled Ember assets)

### 3. Ignored the Root Cause
- **Problem**: Implicit injection deprecations breaking the app
- **What We Did**: Tried to work around them with config changes
- **Why It Failed**: This is a **code architecture issue** that needs refactoring
- **Reality**: The app needs proper Ember service migration

---

## 🎯 THE REAL PROBLEMS

### Problem #1: Implicit Injection Deprecation (CRITICAL)

**Location**: `app/frontend/app/utils/app_state.js` line 52-54

```javascript
// THIS IS THE PROBLEM:
$.each(['model', 'controller', 'view', 'route'], function(i, component) {
  application.inject(component, 'app_state', 'lingolinq:app_state');
});
```

**Why It's Broken**:
- Ember 3.28 deprecated implicit injections
- Models/controllers try to access `this.app_state`
- Properties are now read-only and can't be set
- Causes: `Cannot assign to read only property 'app_state'`

**Proper Solution**:
1. Convert `app_state` to a proper Ember Service
2. Remove implicit injection
3. Add explicit `@service` injections in each file that needs it

### Problem #2: HTTP Image URLs in Database (BLOCKING UX)

**Errors**:
```
Mixed Content: requested insecure element 'http://deborahjones.theworldrace.org/...'
bad image url: http://deborahjones.theworldrace.org/blogphotos/.../no-1.jpg
```

**Why It's Broken**:
- Database contains HTTP URLs for images
- Modern browsers block HTTP resources on HTTPS pages
- OpenSymbols images not loading

**Proper Solutions**:
1. **Database Migration**: Update HTTP URLs to HTTPS where possible
2. **Proxy Images**: Create Rails endpoint to proxy HTTP images over HTTPS
3. **Fallback System**: Better error handling for missing images
4. **Content Security Policy**: Already done, but doesn't fix HTTP resources

### Problem #3: Missing Buttonsets (404 Errors)

**Errors**:
```
GET /api/v1/buttonsets/1_4 → 404
GET /api/v1/buttonsets/1_6 → 404
```

**Why It's Broken**:
- Default buttonsets not seeded in database
- Frontend expects these to exist

**Proper Solution**:
1. Check if buttonsets table exists and is populated
2. Run proper database seed for buttonsets
3. Or fix frontend to handle missing buttonsets gracefully

### Problem #4: Too Many Redirects

**Error**: `net::ERR_TOO_MANY_REDIRECTS`

**Likely Causes**:
1. Authentication loop (user not logged in, keeps redirecting to login)
2. Middleware loop (Rails redirecting to itself)
3. Route configuration issue

**Proper Solution**:
1. Check authentication state
2. Review Rails middleware stack
3. Check route definitions for circular redirects

---

## 📋 PROPER SOLUTION PATH

### Phase 1: Stop the Bleeding (Immediate)

#### 1.1 Create Test User Account
```bash
cd /home/user/webapp
bundle exec rails console
User.create!(user_name: 'test', password: 'password', email: 'test@example.com', terms_agree: true)
```

#### 1.2 Fix Missing Buttonsets
Check if buttonsets exist, seed if needed:
```ruby
# In Rails console:
BoardDownstreamButtonSet.count
# If zero, need to seed or create defaults
```

### Phase 2: Fix Core Architecture (1-2 days)

#### 2.1 Convert app_state to Proper Service

**Create**: `app/frontend/app/services/app-state.js`
```javascript
import Service from '@ember/service';
import EmberObject from '@ember/object';
// ... move app_state logic here
export default Service.extend({
  // All app_state logic
});
```

**Update**: Remove implicit injection from `app/utils/app_state.js`

**Migrate**: Add explicit injections to ~50+ files
```javascript
import { inject as service } from '@ember/service';

export default Model.extend({
  appState: service('app-state'),  // Explicit injection
  // Use this.appState instead of this.app_state
});
```

#### 2.2 Fix HTTP Image URLs

**Option A**: Database migration script
```ruby
# Find and update HTTP URLs to HTTPS
ButtonImage.where("url LIKE 'http://%'").find_each do |image|
  image.update(url: image.url.gsub('http://', 'https://'))
end
```

**Option B**: Rails proxy endpoint
```ruby
# In routes.rb:
get '/proxy/image' => 'proxy#image'

# In proxy_controller.rb:
def image
  url = params[:url]
  # Fetch image, serve over HTTPS
end
```

### Phase 3: Data and Configuration (1 day)

#### 3.1 Seed Missing Data
```bash
bundle exec rails db:seed
# Or create custom seed for buttonsets
```

#### 3.2 Fix Authentication Issues
- Review session management
- Check for redirect loops
- Verify cookie configuration

---

## 🚨 WHY WE WENT IN CIRCLES

1. **Treated deprecation warnings as configuration issues** instead of code architecture problems
2. **Focused on port 8184** when production runs on port 5000
3. **Tried to "fix" mixed content with CSP** when the real issue is HTTP URLs in data
4. **Ignored the upgrade documentation** that already identified these issues
5. **Made multiple config changes** without understanding what each one does

---

## 📝 NEXT STEPS (PROPER ORDER)

### Immediate (Can Do Now):
1. ✅ Create test user account for login
2. ✅ Check/seed buttonsets in database  
3. ✅ Test basic app functionality on port 5000

### Short Term (This Week):
1. ❌ Convert app_state to proper Ember Service (**BLOCKS EVERYTHING**)
2. ❌ Fix HTTP image URLs (database migration or proxy)
3. ❌ Address other implicit injection warnings

### Medium Term (Next Week):
1. ❌ Complete Ember 3.28 deprecation fixes
2. ❌ Performance optimization
3. ❌ Full test coverage

---

## 🔗 REFERENCES

- **Ember 3.28 Upgrade Docs**: `/docs/upgrade_plans/PHASE3_*.md`
- **Implicit Injection RFC**: https://rfcs.emberjs.com/id/0680-implicit-injection-deprecation/
- **Ember Deprecations**: https://deprecations.emberjs.com/v3.x/#toc_implicit-injections
- **Project Instructions**: `/CLAUDE.md`, `/GEMINI.md`

---

## ✅ ACTION REQUIRED

**Stop making configuration changes.**  
**Start fixing the code architecture.**

The app needs proper Ember service migration, not more environment tweaks.
