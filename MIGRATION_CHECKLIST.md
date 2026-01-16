# Migration Progress Checklist

**Project**: LingoLinq Ember 3.28 Migration  
**Branch**: feature/ember-3.16-with-tools  
**Started**: 2026-01-16  
**Estimated Completion**: 5 days

---

## Phase 1: Create Modern Services ⏳

**Goal**: Create proper Ember services to replace implicit injections

**Estimated Time**: 4-6 hours

### 1.1 App State Service
- [ ] Create `app/frontend/app/services/app-state.js`
- [ ] Move logic from `app/utils/app_state.js`
- [ ] Add explicit service dependencies (stashes, persistence)
- [ ] Test: Service loads without errors
- [ ] Commit: `refactor(ember): create app-state service`

### 1.2 Persistence Service
- [ ] Create `app/frontend/app/services/persistence.js`
- [ ] Move logic from `app/utils/persistence.js`
- [ ] Add explicit service dependencies (stashes)
- [ ] Test: Service loads without errors
- [ ] Commit: `refactor(ember): create persistence service`

### 1.3 Stashes Service
- [ ] Create `app/frontend/app/services/stashes.js`
- [ ] Move logic from `app/utils/_stashes.js`
- [ ] Test: Service loads without errors
- [ ] Commit: `refactor(ember): create stashes service`

### 1.4 Modal Service
- [ ] Create `app/frontend/app/services/modal.js`
- [ ] Move core logic from `app/utils/modal.js`
- [ ] Remove route.render() dependency
- [ ] Add tracked properties for state
- [ ] Test: Service loads without errors
- [ ] Commit: `refactor(ember): create modal service`

### 1.5 Modal Manager Component
- [ ] Create `app/frontend/app/components/modal-manager.js`
- [ ] Create `app/frontend/app/components/modal-manager.hbs`
- [ ] Wire up to modal service
- [ ] Test: Component renders
- [ ] Commit: `refactor(ember): create modal manager component`

### Phase 1 Verification
- [ ] Run: `cd app/frontend && ember build`
- [ ] Build succeeds with no new errors
- [ ] Services accessible in Ember Inspector
- [ ] No runtime errors on app load
- [ ] **COMMIT & PUSH**: `refactor(ember): Phase 1 complete - services created`

---

## Phase 2A: Migrate Models (Day 2) ⏳

**Goal**: Update all model files to use explicit service injection

**Estimated Time**: 6-8 hours  
**Files**: ~72 model files in `app/frontend/app/models/`

### Progress Tracking
- [ ] `user.js` (CRITICAL - start here)
- [ ] `board.js` (CRITICAL)
- [ ] `image.js`
- [ ] `sound.js`
- [ ] `video.js`
- [ ] `log.js`
- [ ] `buttonset.js`
- [ ] `gift.js`
- [ ] `goal.js`
- [ ] `lesson.js`
- [ ] `organization.js`
- [ ] `profile.js`
- [ ] Remaining ~60 model files

### Pattern Applied
```javascript
import { inject as service } from '@ember/service';

export default Model.extend({
  appState: service('app-state'),
  persistence: service(),
  stashes: service(),
  
  // Replace all:
  // this.app_state → this.appState
  // this.persistence → this.persistence
  // this.stashes → this.stashes
});
```

### Phase 2A Verification
- [ ] All model files updated
- [ ] No "Cannot assign to read only property" errors
- [ ] Data loads from API
- [ ] Data saves to API
- [ ] Offline persistence works
- [ ] **COMMIT & PUSH**: `refactor(ember): Phase 2A - migrate models to explicit injection (72 files)`

---

## Phase 2B: Migrate Controllers (Day 3 Morning) ⏳

**Goal**: Update all controller files to use explicit service injection

**Estimated Time**: 3-4 hours  
**Files**: ~100 controller files in `app/frontend/app/controllers/`

### Progress Tracking
- [ ] `application.js` (CRITICAL)
- [ ] `board/index.js` (CRITICAL)
- [ ] `user/index.js`
- [ ] `board/copy.js`
- [ ] Remaining ~96 controller files

### Phase 2B Verification
- [ ] All controller files updated
- [ ] Controller actions work
- [ ] Button interactions work
- [ ] Modal triggers work
- [ ] **COMMIT & PUSH**: `refactor(ember): Phase 2B - migrate controllers (100 files)`

---

## Phase 2C: Migrate Routes (Day 3 Afternoon) ⏳

**Goal**: Update all route files to use explicit service injection

**Estimated Time**: 2-3 hours  
**Files**: ~50 route files in `app/frontend/app/routes/`

### Progress Tracking
- [ ] `application.js`
- [ ] `board/index.js`
- [ ] `user/index.js`
- [ ] Remaining ~47 route files
- [ ] Remove all `modal.setup(this)` calls

### Phase 2C Verification
- [ ] All route files updated
- [ ] Navigation works
- [ ] Route transitions work
- [ ] No modal.setup() calls remain
- [ ] **COMMIT & PUSH**: `refactor(ember): Phase 2C - migrate routes (50 files)`

---

## Phase 2D: Migrate Components (Day 3 End) ⏳

**Goal**: Update all component files to use explicit service injection

**Estimated Time**: 1-2 hours  
**Files**: ~30 component files in `app/frontend/app/components/`

### Progress Tracking
- [ ] All ~30 component files updated

### Phase 2D Verification
- [ ] All component files updated
- [ ] Components render correctly
- [ ] Component interactions work
- [ ] **COMMIT & PUSH**: `refactor(ember): Phase 2D - migrate components (30 files)`

---

## Phase 3: Modernize Modal System (Day 4) ⏳

**Goal**: Replace all modal.open/close with new modal service

**Estimated Time**: 4-6 hours  
**Instances**: 252 usages across the app

### 3.1 Update Modal Calls
- [ ] Search all: `modal.open(`
- [ ] Replace with: `this.modal.open(`
- [ ] Search all: `modal.close(`
- [ ] Replace with: `this.modal.close(`
- [ ] Manual verification of complex cases

### 3.2 Test All Modal Types
- [ ] Confirm dialogs
- [ ] Form modals
- [ ] Board copy modal
- [ ] Settings modal
- [ ] User modals
- [ ] Image picker modal
- [ ] Sound picker modal
- [ ] Share modal
- [ ] Delete confirmation
- [ ] Copy board modal
- [ ] All other modal types (count: 252)

### Phase 3 Verification
- [ ] All 252 modal usages updated
- [ ] All modals open correctly
- [ ] All modals close correctly
- [ ] No rendering conflicts
- [ ] No assertion errors
- [ ] Modal promises resolve/reject properly
- [ ] **COMMIT & PUSH**: `refactor(ember): Phase 3 - modernize modal system (252 usages)`

---

## Phase 4: Remove Implicit Injections (Day 5 Morning) ⏳

**Goal**: Clean up old code, remove deprecated patterns

**Estimated Time**: 2 hours

### 4.1 Remove Implicit Injection Code
- [ ] Edit `app/frontend/app/utils/app_state.js`
  - [ ] Remove lines 52-54 (implicit injection)
  - [ ] Keep logic for backward compat if needed
- [ ] Edit `app/frontend/app/utils/persistence.js`
  - [ ] Remove lines 28-30 (implicit injection)
- [ ] Edit `app/frontend/app/utils/_stashes.js`
  - [ ] Remove implicit injection code

### 4.2 Verify No Implicit Injections Remain
- [ ] Search: `grep -r "application.inject" app/frontend/app/utils/`
- [ ] Result: No matches (or only comments)

### Phase 4 Verification
- [ ] Build succeeds
- [ ] App loads without errors
- [ ] All features still work
- [ ] **COMMIT & PUSH**: `refactor(ember): Phase 4 - remove implicit injections`

---

## Phase 5: Full Testing & Verification (Day 5 Afternoon) ⏳

**Goal**: Comprehensive regression testing

**Estimated Time**: 2-4 hours

### 5.1 Build Verification
- [ ] Development build: `ember build`
- [ ] Production build: `ember build --environment production`
- [ ] No errors or warnings
- [ ] Asset sizes reasonable

### 5.2 Deprecation Check
- [ ] Load app in browser
- [ ] Open console
- [ ] Check for deprecation warnings:
  - [ ] NO "implicit-injections" warnings
  - [ ] NO "route.render()" warnings
  - [ ] NO "Cannot assign to read only property" errors

### 5.3 Feature Testing
- [ ] **Authentication**
  - [ ] Login works
  - [ ] Logout works
  - [ ] Session persists
  
- [ ] **Board Navigation**
  - [ ] Home board loads
  - [ ] Navigate to different boards
  - [ ] Board search works
  - [ ] Recent boards list works
  
- [ ] **Button Interactions**
  - [ ] Click buttons (speak mode)
  - [ ] Edit buttons (edit mode)
  - [ ] Button actions work
  - [ ] Sentence box updates
  
- [ ] **Modal System**
  - [ ] All modals open
  - [ ] All modals close
  - [ ] Modal forms submit
  - [ ] Modal cancellation works
  - [ ] No rendering conflicts
  
- [ ] **Data Persistence**
  - [ ] Save board changes
  - [ ] Changes persist after refresh
  - [ ] Offline mode works
  - [ ] Online sync works
  
- [ ] **User Preferences**
  - [ ] Settings save
  - [ ] Preferences persist
  - [ ] User data loads correctly

### 5.4 Performance Check
- [ ] Initial load time acceptable
- [ ] Navigation smooth
- [ ] No memory leaks
- [ ] No console errors

### Phase 5 Verification
- [ ] All tests pass
- [ ] No critical issues
- [ ] Ready for production
- [ ] **COMMIT & PUSH**: `refactor(ember): Phase 5 - testing complete, migration successful`

---

## Final Checklist ✅

### Code Quality
- [ ] No deprecation warnings
- [ ] No console errors
- [ ] Build succeeds (dev & prod)
- [ ] All tests pass
- [ ] Code follows project conventions

### Documentation
- [ ] Migration notes added to docs/
- [ ] CHANGELOG updated
- [ ] Breaking changes documented
- [ ] New service patterns documented

### Git Workflow
- [ ] All phases committed
- [ ] All commits pushed to remote
- [ ] PR created (if required)
- [ ] PR description includes migration summary

### Deployment Readiness
- [ ] Production build tested
- [ ] No breaking changes for users
- [ ] Backward compatibility maintained
- [ ] Ready for Ember 4.x upgrade path

---

## Rollback Procedure (If Needed)

### If Phase 1 Fails:
```bash
git reset --hard HEAD~1  # Remove service files
```

### If Phase 2 Fails:
```bash
git reset --hard [commit-before-phase-2]
# Services still exist but not used
```

### If Phase 3-4 Fails:
```bash
git reset --hard [commit-before-phase-3]
# Can keep Phase 1-2 changes
```

### Complete Rollback:
```bash
git reset --hard 52314062c  # Before migration started
```

---

## Notes & Observations

### Issues Encountered:
(Add notes here as you work)

### Time Tracking:
- Phase 1: ___ hours
- Phase 2A: ___ hours
- Phase 2B: ___ hours
- Phase 2C: ___ hours
- Phase 2D: ___ hours
- Phase 3: ___ hours
- Phase 4: ___ hours
- Phase 5: ___ hours
- **Total**: ___ hours

### Lessons Learned:
(Add insights here)

---

## Success! 🎉

Migration complete when all checkboxes above are ✅

**Next Steps After Migration**:
1. Monitor production for issues
2. Plan Ember 4.x upgrade
3. Address remaining technical debt
4. Performance optimization
