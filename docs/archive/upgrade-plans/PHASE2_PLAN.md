# Phase 2: Octane Preparation & Deprecation Cleanup

## Overview
**Target**: App compatible with Octane patterns (without full refactor)  
**Estimated Window**: ~1 week  
**Goal**: Remove deprecated APIs and prepare for Ember 3.28 upgrade

## Scope

### Primary Objectives
1. Remove deprecated APIs flagged in Ember 3.16
2. Convert low-risk classic patterns to modern equivalents
3. Continue jQuery removal where it blocks future upgrades
4. Address linting and deprecation warnings that affect later versions

### Exit Criteria
- ✅ Deprecation warnings reduced to a manageable set
- ✅ No blockers for upgrading beyond 3.16
- ✅ App runs cleanly with minimal console warnings

## Task Breakdown

### 1. Ember Data Serializer Fixes (High Priority)

**Issue**: Default serializer deprecation for 4+ models  
**Impact**: Will break in Ember 3.28+

**Tasks**:
- [ ] Create `app/frontend/app/serializers/` directory
- [ ] Create `app/frontend/app/serializers/application.js` (base serializer)
- [ ] Or create type-specific serializers for:
  - [ ] `user`
  - [ ] `board`
  - [ ] `badge`
  - [ ] `log`
  - [ ] Any other models showing deprecation

**Files to Create/Modify**:
- `app/frontend/app/serializers/application.js` (new)
- Individual serializer files as needed

**Reference**: https://deprecations.emberjs.com/ember-data/v3.x#toc_ember-data:default-serializers

---

### 2. Replace `didLoad()` Lifecycle Methods (High Priority)

**Issue**: 11 models using deprecated `didLoad()` method  
**Impact**: Will break in Ember 3.28+

**Affected Models**:
- `user.js`
- `log.js`
- `gift.js`
- `video.js`
- `image.js`
- `lesson.js`
- `goal.js`
- `sound.js`
- `organization.js`
- `profile.js`
- `board.js`

**Tasks**:
- [ ] Audit each `didLoad()` method to understand its purpose
- [ ] Replace with:
  - Computed properties
  - Observers (if necessary)
  - `init()` hook with proper setup
  - Or remove if functionality can be handled elsewhere

**Strategy**:
1. Document what each `didLoad()` does
2. Determine best replacement pattern
3. Convert one model at a time
4. Test after each conversion

**Reference**: https://deprecations.emberjs.com/ember-data/v3.x#toc_record-lifecycle-event-methods

---

### 3. Fix Record Identifier & Query Issues (Medium Priority)

**Issue**: 
- ID mismatch warnings (`user:self` → `1_1`)
- Using `findRecord()` when `queryRecord()` should be used

**Tasks**:
- [ ] Find all `store.findRecord('user', 'self')` calls
- [ ] Replace with `store.queryRecord('user', { id: 'self' })` or fix adapter
- [ ] Review adapter configuration for ID handling
- [ ] Fix record identifier update warnings

**Files to Check**:
- `app/frontend/app/utils/app_state.js` (2 instances: lines 232, 1305)
- `app/frontend/app/routes/index.js` (line 19)
- `app/frontend/app/components/login-form.js` (line 224)
- `app/frontend/app/adapters/application.js`
- Any custom adapters

---

### 4. Convert `sendAction()` to Closure Actions (Medium Priority)

**Issue**: 32 files using deprecated `sendAction()`  
**Impact**: Will break in Ember 4.0

**Strategy**: Convert incrementally, starting with most-used components

**Tasks**:
- [ ] Document all `sendAction()` usage locations
- [ ] Prioritize by frequency of use
- [ ] Convert pattern:
  ```javascript
  // Old:
  this.sendAction('actionName', param);
  
  // New:
  if (this.actionName) {
    this.actionName(param);
  }
  ```
- [ ] Update component templates to pass actions as closures
- [ ] Update parent components/routes to use closure actions

**High-Priority Files** (most used):
- `app/frontend/app/components/page-footer.js`
- `app/frontend/app/components/dashboard/unauthenticated-view.js`
- `app/frontend/app/components/user-select.js`
- `app/frontend/app/components/subscription-form.js`

**Reference**: https://deprecations.emberjs.com/ember/v3.x#toc_ember-component-send-action

---

### 5. Replace Style Bindings (Low Priority - Security)

**Issue**: Multiple templates using `style={{...}}` bindings (XSS warning)  
**Impact**: Security concern, but app works

**Tasks**:
- [ ] Identify all templates with `style={{...}}` bindings
- [ ] Move static styles to CSS classes
- [ ] For dynamic styles, use `htmlSafe()` helper if necessary
- [ ] Or create computed properties that return CSS class names

**Strategy**: 
- Low-hanging fruit: Move static styles to CSS
- Complex cases: Use CSS classes with computed properties

**Reference**: https://emberjs.com/deprecations/v1.x/#toc_binding-style-attributes

---

### 6. Template Linting Cleanup (Low Priority)

**Issue**: 94+ template linting errors (currently disabled)  
**Impact**: Code quality, but non-blocking

**Tasks**:
- [ ] Re-enable lint rules incrementally
- [ ] Fix `link-rel-noopener` issues (add `rel="noopener noreferrer"`)
- [ ] Fix `require-button-type` (add `type="button"` to buttons)
- [ ] Fix `require-valid-alt-text` (add alt text to images)
- [ ] Address `no-inline-styles` where feasible
- [ ] Fix `require-iframe-title` for iframes

**Note**: Can be done incrementally, doesn't block upgrades

---

### 7. jQuery Removal Planning (Defer if Not Blocking)

**Issue**: ~20+ files importing jQuery  
**Impact**: Will need removal for Ember 4.0, but not blocking 3.28

**Tasks**:
- [ ] Document all jQuery usage locations
- [ ] Categorize by usage type:
  - DOM manipulation
  - Event handling
  - AJAX calls (already using ember-ajax)
  - Animations
- [ ] Create migration plan for each category
- [ ] Start with easiest replacements

**Strategy**: 
- Focus on jQuery usage that blocks upgrades first
- Defer cosmetic jQuery usage to later phases

---

### 8. `.get()` / `.set()` Removal (Defer - Large Refactor)

**Issue**: Extensive use throughout codebase  
**Impact**: Large refactor, can defer to later phase

**Tasks**:
- [ ] Document usage patterns
- [ ] Create migration strategy
- [ ] Consider using `@tracked` and native getters/setters
- [ ] **Note**: This is a large refactor - may be better suited for Phase 3 or post-3.28

**Strategy**: 
- Focus on new code using modern patterns
- Incrementally refactor high-traffic areas
- Don't block Phase 2 completion on this

---

## Implementation Order

### Week 1: Critical Deprecations
1. **Day 1-2**: Ember Data Serializers (Task 1)
2. **Day 2-3**: Replace `didLoad()` methods (Task 2)
3. **Day 3-4**: Fix Record Identifier issues (Task 3)
4. **Day 4-5**: Start `sendAction()` conversions (Task 4)

### Week 2: Cleanup & Polish
5. **Day 1-2**: Continue `sendAction()` conversions
6. **Day 2-3**: Style binding fixes (Task 5)
7. **Day 3-4**: Template linting cleanup (Task 6)
8. **Day 4-5**: Testing & verification

## Risk Assessment

### High Risk
- **Ember Data serializer changes** - May affect data loading
- **`didLoad()` removal** - Need to ensure functionality preserved
- **`sendAction()` conversions** - May break component communication

### Medium Risk
- **Record identifier fixes** - May affect user authentication flow
- **Style binding changes** - Visual regressions possible

### Low Risk
- **Template linting** - Mostly cosmetic
- **jQuery removal** - Can be deferred

## Testing Strategy

After each major change:
1. ✅ App boots without errors
2. ✅ Core user flows work:
   - Login/authentication
   - Board navigation
   - Button interactions
   - Data persistence
3. ✅ No new console errors
4. ✅ Deprecation warnings reduced

## Success Metrics

- **Before Phase 2**: ~15+ deprecation warnings in console
- **After Phase 2**: <5 deprecation warnings
- **Build**: Still completes successfully
- **Functionality**: All core features work

## Notes

- Focus on deprecations that will break in 3.28+
- Defer large refactors (like `.get()`/`.set()`) to later phases
- Test incrementally - don't wait until the end
- Document any patterns discovered during conversion

## Dependencies

- Phase 1 must be complete (✅ Done)
- App must be running on 3.16 (✅ Verified)
- Need understanding of which features are critical

## Next Steps

1. Review and prioritize tasks
2. Start with Task 1 (Serializers) - highest impact, lowest risk
3. Create detailed implementation plan for each task
4. Begin incremental conversions
