# Proper Migration Plan: Implicit Injections & Modal System

## Executive Summary

**Three interconnected architectural issues** need fixing:

1. **Implicit Injections** (app_state, persistence, stashes) - Deprecated in Ember 3.28
2. **Modal System** using deprecated `route.render()` - Scheduled for removal
3. **Offline/Online Sync** (persistence service) - Related to implicit injection

**Estimated Time**: 3-5 days of focused work  
**Risk Level**: Medium (touches core functionality)  
**Impact**: High (fixes all major deprecation warnings and modernizes codebase)

---

## Problem Analysis

### Problem #1: Implicit Injections (CRITICAL)

**Current State**:
```javascript
// In app/utils/app_state.js, persistence.js, _stashes.js:
$.each(['model', 'controller', 'view', 'route'], function(i, component) {
  application.inject(component, 'app_state', 'lingolinq:app_state');
  application.inject(component, 'persistence', 'lingolinq:persistence');
  application.inject(component, 'stashes', 'lingolinq:stashes');
});
```

**Why It's Broken**:
- Deprecated in Ember 3.28
- Properties become read-only
- Causes: `Cannot assign to read only property 'app_state'`
- **Affects**: 72+ model files, 100+ controller files

**The Dev's Concern**: "I think it has to do with syncing the online and offline db together"
- ✅ **CORRECT!** The `persistence` service handles IndexedDB/SQLite sync
- When implicit injection fails, `this.persistence` becomes undefined
- This breaks offline data storage and sync

### Problem #2: Modal System (HIGH PRIORITY)

**Current State**:
```javascript
// In app/utils/modal.js line 53:
this.route.render(render_template, { into: 'application', outlet: outlet});
```

**Why It's Broken**:
- `route.render()` deprecated in Ember 3.x
- Causes rendering conflicts
- Assertion errors when switching modals
- **Affects**: 252 usages of `modal.open()` and `modal.close()` across the app

**The Dev's Concern**: "modal logic spread across routes and controllers"
- ✅ **CORRECT!** Current modal.js requires route context
- Needs modernization to component/service pattern

### Problem #3: Interrelated Dependencies

**The Chain**:
1. Routes call `modal.open()` → requires route context
2. Modal templates access `app_state` → requires implicit injection
3. Components save data via `persistence` → requires implicit injection
4. All three are tightly coupled

**Impact**: Can't fix one without fixing the others

---

## Solution Architecture

### Phase 1: Create Modern Services (Day 1)

#### 1.1 Create App State Service
**File**: `app/frontend/app/services/app-state.js`

```javascript
import Service from '@ember/service';
import EmberObject from '@ember/object';
import { inject as service } from '@ember/service';

export default Service.extend({
  // Move ALL logic from app/utils/app_state.js here
  
  // Dependencies (explicit)
  stashes: service(),
  persistence: service(),
  
  // Properties
  currentUser: null,
  currentBoard: null,
  speakMode: false,
  editMode: false,
  // ... etc
  
  // Methods (all existing app_state methods)
  activate_button(button) {
    // ...
  },
  // ... etc
});
```

**Benefits**:
- Proper Ember Service
- Explicit dependencies
- Can be injected with `@service`
- No read-only property errors

#### 1.2 Create Persistence Service
**File**: `app/frontend/app/services/persistence.js`

```javascript
import Service from '@ember/service';
import { inject as service } from '@ember/service';

export default Service.extend({
  stashes: service(),
  
  // Online/offline sync methods
  sync() { /*...*/ },
  find(store, key) { /*...*/ },
  store(store, obj, key) { /*...*/ },
  // ... etc
});
```

#### 1.3 Create Stashes Service
**File**: `app/frontend/app/services/stashes.js`

```javascript
import Service from '@ember/service';

export default Service.extend({
  // Local storage / session state
  // Move from app/utils/_stashes.js
});
```

#### 1.4 Create Modal Service
**File**: `app/frontend/app/services/modal.js`

```javascript
import Service from '@ember/service';
import { inject as service } from '@ember/service';
import { tracked } from '@glimmer/tracking';

export default Service.extend({
  @tracked currentModal: null,
  @tracked modalOptions: null,
  
  open(modalName, options) {
    this.currentModal = modalName;
    this.modalOptions = options;
    return new Promise((resolve, reject) => {
      this.modalPromise = { resolve, reject };
    });
  },
  
  close(result) {
    if (this.modalPromise) {
      this.modalPromise.resolve(result);
    }
    this.currentModal = null;
    this.modalOptions = null;
  }
});
```

#### 1.5 Create Modal Manager Component
**File**: `app/frontend/app/components/modal-manager.js`

```javascript
import Component from '@ember/component';
import { inject as service } from '@ember/service';

export default Component.extend({
  modal: service(),
  
  // Renders current modal based on modal.currentModal
});
```

**Template**: `app/frontend/app/components/modal-manager.hbs`
```handlebars
{{#if modal.currentModal}}
  <div class="modal-backdrop fade in"></div>
  <div class="modal fade in" style="display: block;">
    {{!-- Dynamically render modal based on modal.currentModal --}}
    {{component modal.currentModal options=modal.modalOptions}}
  </div>
{{/if}}
```

### Phase 2: Migrate Models & Controllers (Days 2-3)

#### 2.1 Update All Models
**Count**: ~72 model files  
**Pattern**:

```javascript
// OLD (implicit injection):
export default Model.extend({
  // this.app_state, this.persistence available implicitly
});

// NEW (explicit injection):
import { inject as service } from '@ember/service';

export default Model.extend({
  appState: service('app-state'),
  persistence: service(),
  stashes: service(),
  
  // Use this.appState, this.persistence, this.stashes
});
```

**Files to Update**:
- `app/models/user.js`
- `app/models/board.js`
- `app/models/image.js`
- ~69 more model files

#### 2.2 Update All Controllers
**Count**: ~100+ controller files  
**Same pattern as models**

#### 2.3 Update All Routes
**Count**: ~50+ route files  
**Same pattern + remove modal.setup()**

```javascript
// OLD:
import modal from '../utils/modal';

export default Route.extend({
  setupController(controller, model) {
    modal.setup(this); // Deprecated!
    // ...
  }
});

// NEW:
import { inject as service } from '@ember/service';

export default Route.extend({
  modal: service(),
  
  // No modal.setup() needed
});
```

#### 2.4 Update All Components
**Count**: ~30+ component files  
**Same pattern as models**

### Phase 3: Migrate Modal Calls (Day 4)

#### 3.1 Update Modal.open() Calls
**Count**: 252 usages across the app

```javascript
// OLD:
modal.open('confirm-delete-board', { board: board });

// NEW:
this.modal.open('confirm-delete-board', { board: board });
```

**Automated Migration Script**:
```bash
# Find and replace pattern
cd app/frontend/app
find . -name "*.js" -exec sed -i 's/modal\.open(/this.modal.open(/g' {} \;
find . -name "*.js" -exec sed -i 's/modal\.close(/this.modal.close(/g' {} \;
```

#### 3.2 Remove Old Utils
After migration complete:
- Keep `app/utils/modal.js` (for reference)
- Update imports to point to service
- Eventually delete old utils

### Phase 4: Remove Implicit Injections (Day 5)

#### 4.1 Remove from app_state.js
```javascript
// DELETE these lines:
$.each(['model', 'controller', 'view', 'route'], function(i, component) {
  application.inject(component, 'app_state', 'lingolinq:app_state');
});
```

#### 4.2 Remove from persistence.js
```javascript
// DELETE these lines:
$.each(['model', 'controller', 'view', 'route'], function(i, component) {
  application.inject(component, 'persistence', 'lingolinq:persistence');
});
```

#### 4.3 Remove from _stashes.js
```javascript
// DELETE these lines:
$.each(['model', 'controller', 'view', 'route'], function(i, component) {
  application.inject(component, 'stashes', 'lingolinq:stashes');
});
```

---

## Testing Strategy

### After Each Phase:

#### Phase 1 Tests:
- ✅ Services load without errors
- ✅ Services accessible via `@service`
- ✅ Build succeeds

#### Phase 2 Tests:
- ✅ Models can access services
- ✅ Controllers can access services
- ✅ No "Cannot assign to read only property" errors
- ✅ Data loading works
- ✅ Data saving works

#### Phase 3 Tests:
- ✅ Modals open correctly
- ✅ Modals close correctly
- ✅ No rendering conflicts
- ✅ No assertion errors
- ✅ Modal promises resolve/reject properly

#### Phase 4 Tests:
- ✅ **Remove implicit injections**
- ✅ App still works
- ✅ No deprecation warnings for implicit injection
- ✅ Full regression test

### Full Test Checklist:
- [ ] Login/authentication
- [ ] Board loading
- [ ] Board navigation
- [ ] Button activation
- [ ] Speak mode
- [ ] Edit mode
- [ ] Board copying
- [ ] Modal dialogs (all types)
- [ ] Offline mode
- [ ] Online/offline sync
- [ ] Data persistence
- [ ] User preferences

---

## Risk Mitigation

### High Risk Areas:

#### 1. Persistence/Sync Breaking
**Risk**: Offline data storage fails  
**Mitigation**: Test thoroughly before removing implicit injections  
**Rollback**: Keep old utils/persistence.js until verified

#### 2. Modal Rendering Issues
**Risk**: Modals don't display or conflict  
**Mitigation**: Implement new modal system side-by-side first  
**Rollback**: Keep old modal.js as fallback

#### 3. Breaking Changes
**Risk**: Too many files to update at once  
**Mitigation**: Do in phases, test after each phase  
**Rollback**: Git branches for each phase

### Testing Approach:

1. **Phase-by-phase commits** (can rollback easily)
2. **Dual implementation** (keep old code until new works)
3. **Feature flags** (toggle new modal system)
4. **Extensive manual testing** between phases

---

## Implementation Order (Recommended)

### Week 1 Plan:

**Day 1 (Monday)**: Phase 1 - Create Services
- Morning: Create app-state service
- Afternoon: Create persistence, stashes, modal services
- Test: Services load, build succeeds

**Day 2 (Tuesday)**: Phase 2a - Migrate Models
- All day: Update ~72 model files with explicit injections
- Test: Models can access services, data loads

**Day 3 (Wednesday)**: Phase 2b - Migrate Controllers & Routes
- Morning: Update ~100 controller files
- Afternoon: Update ~50 route files
- Test: Controllers work, routes work, no errors

**Day 4 (Thursday)**: Phase 3 - Migrate Modal System
- Morning: Update 252 modal.open/close calls
- Afternoon: Test all modals
- Test: All modals work, no rendering conflicts

**Day 5 (Friday)**: Phase 4 - Remove Implicit Injections
- Morning: Remove implicit injection code
- Afternoon: Full regression testing
- Test: Everything still works, no deprecation warnings

---

## Success Criteria

✅ **All deprecation warnings gone** for:
- `implicit-injections`
- `route.render()`

✅ **No runtime errors** for:
- "Cannot assign to read only property"
- "Rendering conflicts"
- "Assertion failures"

✅ **All features work**:
- Authentication
- Board navigation
- Modals
- Offline sync
- Data persistence

✅ **Ready for Ember 4.x** upgrade path

---

## Quick Wins (If Time Constrained)

If you can't do full migration right now:

### Band-Aid Option 1: Suppress Warnings
```javascript
// In config/environment.js
ENV.EmberENV = {
  SUPPRESS_DEPRECATION_WARNINGS: true  // Not recommended!
};
```

### Band-Aid Option 2: Fix Just app_state
Focus on app_state only, leave persistence/modal for later

### Band-Aid Option 3: Fix Just Modal
Focus on modal system only, leave injections for later

**⚠️ Note**: Band-aids don't fix the underlying issues, just hide them

---

## Questions for You

Before starting, please confirm:

1. **Timeline**: Do you have 5 days for full migration, or should we do phased/incremental?
2. **Priority**: Which is more urgent - modals or sync/persistence?
3. **Testing**: Do you have test users/data available for thorough testing?
4. **Rollback**: Can we use feature branches or do we need feature flags?
5. **Help**: Will you be available for testing between phases?

---

## Next Steps

**Option A**: Start Phase 1 today (create services)  
**Option B**: Do band-aid fix for now, schedule proper migration  
**Option C**: Focus on just one issue (modal OR injection)

**What would you like to do?**
