# Current Issues and Solutions

## Environment Status
- ✅ Ruby 3.4.4 running
- ✅ Rails 6.1.7.10 running  
- ✅ Ember 3.28.6 running
- ✅ Node 18.20.8 (optimal)
- ✅ Database seeded and connected
- ✅ Environment keys loaded (AWS, Gemini)

## URLs for Testing
- **Ember Frontend (HTTPS):** https://8184-if22s76ljt6fceg4fip6r-2b54fc91.sandbox.novita.ai
- **Rails Backend (HTTPS):** https://5000-if22s76ljt6fceg4fip6r-2b54fc91.sandbox.novita.ai

**Note:** HTTP URLs don't work in this sandbox, only HTTPS.

## Critical Issues

### 1. Mixed Content Error (BLOCKING) 🚨
**Problem:** Ember frontend loads over HTTPS but Ember CLI proxy targets HTTP backend.

**Current Config:**
```bash
# Procfile line:
ember: ... npx ember server --port 8184 --proxy http://127.0.0.1:5000
```

**Why it fails:**
- Browser blocks HTTPS page from making HTTP requests
- API calls to `/api/v1/*` fail with mixed content error
- Ember proxy uses HTTP internally even though frontend is HTTPS

**Solution Options:**

A. **Access backend directly via HTTPS** (Quick fix):
   - Update Ember app to call `https://5000-if22s76ljt6fceg4fip6r-2b54fc91.sandbox.novita.ai` directly
   - Requires CORS configuration in Rails
   
B. **Use HTTP for both** (Not available in this sandbox)

C. **Configure Ember proxy for HTTPS** (Complex):
   - Create `app/frontend/server/index.js` with HTTPS proxy config
   - May require middleware adjustments

### 2. Implicit Injection Deprecation Warnings ⚠️

**Problem:** `app_state` is injected globally (old Ember pattern)

**Location:** `/app/frontend/app/utils/app_state.js` line 53
```javascript
application.inject(component, 'app_state', 'lingolinq:app_state');
```

**Modern Solution:**
Components/models should explicitly inject:
```javascript
import { inject as service } from '@ember/service';

export default class MyComponent extends Component {
  @service('lingolinq:app_state') appState;
}
```

**Impact:** Non-blocking, but will break in Ember 4.x

### 3. Missing Buttonsets (404 Errors) ⚠️

**Problem:** Frontend requests `/api/v1/buttonsets/1_6` which doesn't exist

**Root Cause:** Database may not have default buttonsets seeded

**Check:**
```bash
bundle exec rails console
ButtonSet.count
ButtonSet.all.pluck(:key)
```

**Fix:** Seed default buttonsets or create them

### 4. Read-Only Property Error 🐛

**Error:** `Cannot assign to read only property 'app_state'`

**Cause:** Ember 3.x makes some objects immutable
- Trying to set `app_state` on frozen model instances
- Related to implicit injection deprecation

**Fix:** Convert to explicit service injection pattern

## Recommended Action Plan

### Immediate (Get app working):
1. **Fix Mixed Content** - Update Ember config to use HTTPS backend URL directly
2. **Enable CORS** - Update Rails to allow cross-origin requests from sandbox domain
3. **Test Basic Functionality** - Verify login, navigation work

### Short Term (Fix deprecations):
1. **Convert app_state to Service** - Make it a proper Ember service
2. **Add explicit injections** - Remove global injection pattern
3. **Fix buttonset seeding** - Ensure default data exists
4. **Address modal issues** - Update deprecated route.render() patterns

### Medium Term (Before Ember 4.x):
1. Run `npx @ember/octanify`
2. Update optional features
3. Remove jQuery dependencies
4. Convert to modern component patterns

## Encryption Key Issue

**Problem:** Database has data encrypted with different keys than .env

**Workaround:** Using `SKIP_VALIDATIONS=true` to bypass check

**Permanent Fix Options:**
1. Use original encryption keys
2. Reset database completely: `rails db:drop db:create db:migrate db:seed`
3. Migrate encrypted data to new keys (complex)

## Next Steps

**To fix the mixed content error and get the app working:**

1. Edit `config/environments/development.rb`:
```ruby
config.hosts.clear  # Already done ✅

# Add CORS support
config.middleware.insert_before 0, Rack::Cors do
  allow do
    origins '*'  # For development only
    resource '*', headers: :any, methods: [:get, :post, :put, :patch, :delete, :options]
  end
end
```

2. Install rack-cors gem if not present:
```bash
bundle add rack-cors
```

3. Update Ember to call API directly instead of proxying
```javascript
// In app/frontend/config/environment.js
if (environment === 'development') {
  ENV.API_HOST = 'https://5000-if22s76ljt6fceg4fip6r-2b54fc91.sandbox.novita.ai';
}
```

Would you like me to implement these fixes?
