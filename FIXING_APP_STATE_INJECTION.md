# Fixing the app_state Implicit Injection Issue

## 🚨 **ROOT CAUSE**

File: `app/frontend/app/utils/app_state.js` (line 53)

```javascript
$.each(['model', 'controller', 'view', 'route'], function(i, component) {
  application.inject(component, 'app_state', 'lingolinq:app_state');
});
```

This **implicit injection** is deprecated in Ember 3.26+ and causes:
- Deprecation warnings flooding the console
- `Cannot assign to read only property 'app_state'` errors
- App rendering failures

## 🎯 **THE SOLUTION**

**Option 1: Quick Fix (Keep Implicit Injection Working)**
- Remove implicit injection from models only (they're now immutable)
- Keep it for controllers/routes/views for now
- Add explicit injections to models that need app_state

**Option 2: Full Fix (Remove All Implicit Injections)**
- Convert app_state to a proper Ember Service
- Add explicit `@service appState` to every file that uses it
- This is the "right" way but requires touching ~50+ files

## ⚡ **RECOMMENDED: Quick Fix First**

### Step 1: Modify app_state.js

**Change line 53 from:**
```javascript
$.each(['model', 'controller', 'view', 'route'], function(i, component) {
  application.inject(component, 'app_state', 'lingolinq:app_state');
});
```

**To:**
```javascript
// Only inject into controller, view, and route (NOT models - they're immutable in Ember 3.28+)
$.each(['controller', 'view', 'route'], function(i, component) {
  application.inject(component, 'app_state', 'lingolinq:app_state');
});
```

### Step 2: Find Models Using app_state

```bash
cd app/frontend
grep -r "app_state" app/models/ --include="*.js" | grep -v "test"
```

### Step 3: Add Explicit Injection to Models

For each model using `app_state`, add at the top of the file:

```javascript
import { inject as service } from '@ember/service';

export default DS.Model.extend({
  appState: service('lingolinq:app_state'),  // Explicit injection
  
  // Then change all references from:
  // this.get('app_state')
  // To:
  // this.get('appState')
});
```

**Note:** The service name is `'lingolinq:app_state'` but we alias it as `appState` (camelCase).

## 📋 **FILES THAT NEED EXPLICIT INJECTION**

Based on deprecation warnings, these models use app_state:

1. `app/models/user.js` ✅ (already has comment about it)
2. `app/models/image.js`
3. `app/models/board.js`
4. `app/models/sound.js`
5. `app/models/buttonset.js`
6. ... (need to search for all)

## 🧪 **TESTING THE FIX**

After making changes:

1. **Rebuild production assets:**
   ```bash
   cd app/frontend
   npm run build -- --environment production
   cp -r dist/* ../../public/
   ```

2. **Restart Rails:**
   ```bash
   # Kill and restart Foreman
   ```

3. **Test in browser (port 5000):**
   - Check console for deprecation warnings (should be gone/reduced)
   - Check for "read only property" errors (should be gone)
   - Test board creation/editing
   - Test button interactions

## 🔍 **WHY THIS HAPPENS**

**Ember 3.28 Changes:**
- Models became "strict mode" objects (immutable)
- Implicit injections try to set properties on models
- Conflicts with immutability → `Cannot assign to read only property`

**The Old Way (Ember <3.26):**
```javascript
// Implicit - Ember auto-injects app_state everywhere
this.get('app_state').someMethod();  // Works magically
```

**The New Way (Ember 3.26+):**
```javascript
// Explicit - You declare what you need
appState: service('lingolinq:app_state'),
// ...
this.get('appState').someMethod();  // Clear and explicit
```

## 📚 **RESOURCES**

- [Ember Deprecation: implicit-injections](https://deprecations.emberjs.com/v3.x/#toc_implicit-injections)
- [RFC #680: Implicit Injection Deprecation](https://rfcs.emberjs.com/id/0680-implicit-injection-deprecation/)

## ⏭️ **NEXT STEPS AFTER QUICK FIX**

1. Monitor for remaining implicit injection warnings
2. Gradually convert more files to explicit injection
3. Eventually remove implicit injection entirely
4. Consider converting app_state to a true Ember Service class

## 🚧 **KNOWN ISSUES WITH THIS APPROACH**

- Some utility files (`app/utils/`) also use app_state but aren't models/controllers
- These will need separate handling
- The codebase has ~200+ references to `app_state` - full fix is large

## 💡 **ALTERNATIVE: Disable Strict Mode on Models**

If the quick fix doesn't work, you can temporarily disable strict mode:

```javascript
// In app/models/user.js (and other models)
import { setProperties } from '@ember/object';

export default DS.Model.extend({
  init() {
    this._super(...arguments);
    // Force model to accept app_state injection
    setProperties(this, { app_state: null });
  }
});
```

**BUT THIS IS A HACK** - the proper fix is explicit injection.

---

**Created:** 2026-01-16
**Status:** 🔴 CRITICAL - Blocking app functionality
**Priority:** HIGH - Fix before proceeding with other work
