# Phase 2: Getting Started

## Quick Start Guide

Phase 2 focuses on removing deprecations that will block the upgrade to Ember 3.28. Start with the highest priority items first.

## Recommended Starting Point

### Task 1: Create Application Serializer (Easiest, High Impact)

**Why First?**
- Quick to implement (~5 minutes)
- Fixes 4+ deprecation warnings immediately
- Low risk - just adds a default serializer

**Steps**:
1. Create directory: `app/frontend/app/serializers/`
2. Create file: `app/frontend/app/serializers/application.js`
3. Add basic serializer (see `PHASE2_QUICK_REFERENCE.md`)
4. Test - deprecation warnings for user, board, badge, log should disappear

**Expected Time**: 15-30 minutes

---

### Task 2: Replace First `didLoad()` Method (Learning Exercise)

**Why Second?**
- Establishes pattern for remaining 10 models
- Start with simplest case to learn the pattern

**Recommended First Model**: Check which model has the simplest `didLoad()` implementation

**Steps**:
1. Pick a model with simple `didLoad()` logic
2. Understand what it does
3. Convert using pattern from `PHASE2_QUICK_REFERENCE.md`
4. Test thoroughly
5. Document the pattern for remaining models

**Expected Time**: 30-60 minutes per model

---

### Task 3: Fix Record Query Issues (Medium Complexity)

**Why Third?**
- Only 4 locations to fix
- Clear pattern to follow
- Fixes warnings immediately

**Files to Fix**:
1. `app/frontend/app/utils/app_state.js` (2 instances)
2. `app/frontend/app/routes/index.js` (1 instance)
3. `app/frontend/app/components/login-form.js` (1 instance)

**Pattern**: Replace `findRecord('user', 'self')` with `queryRecord('user', { id: 'self' })`

**Expected Time**: 1-2 hours

---

## Testing After Each Task

After completing each task:
1. ✅ App boots without errors
2. ✅ Feature still works (test the specific feature)
3. ✅ Console deprecation count reduced
4. ✅ No new errors introduced

## Progress Tracking

Use this checklist to track progress:

### High Priority (Do First)
- [ ] Task 1: Application Serializer
- [ ] Task 2: Replace `didLoad()` methods (11 models)
- [ ] Task 3: Fix record query issues (4 locations)

### Medium Priority (Do Next)
- [ ] Task 4: Convert `sendAction()` (32 files - can do incrementally)

### Low Priority (Polish)
- [ ] Task 5: Style bindings
- [ ] Task 6: Template linting

## Tips

1. **Work incrementally** - Don't try to fix everything at once
2. **Test frequently** - After each change, verify it works
3. **Commit often** - Small, focused commits make rollback easier
4. **Document patterns** - Note what works for future reference
5. **Ask for help** - If stuck on a pattern, document it and move on

## When to Move to Phase 3

Phase 2 is complete when:
- ✅ High priority deprecations are fixed
- ✅ Console shows <5 deprecation warnings
- ✅ App runs cleanly
- ✅ No blocking issues for 3.28 upgrade

You don't need to fix everything - focus on what blocks the upgrade!
