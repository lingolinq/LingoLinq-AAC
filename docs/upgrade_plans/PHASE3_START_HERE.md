# Phase 3: Quick Start Guide

## Overview
Upgrade from Ember 3.16 → 3.28 LTS in incremental steps.

## Recommended Approach

### Step 1: Upgrade to 3.20 (Start Here)

**Why First?**
- Smallest jump (3.16 → 3.20)
- First LTS after current version
- Lower risk, easier to debug

**Quick Steps**:
1. Create branch: `git checkout -b phase3-upgrade-3.20`
2. Update `package.json`:
   ```json
   "ember-cli": "~3.20.0",
   "ember-source": "~3.20.0",
   "ember-data": "~3.20.0"
   ```
3. Run: `cd app/frontend && npm install`
4. Test: `npm run build`
5. Fix any errors
6. Test app: `npm start`
7. Commit: `git commit -m "Upgrade to Ember 3.20"`

**Expected Time**: 2-3 days

---

### Step 2: Upgrade to 3.24

**After 3.20 is stable**:
1. Create branch: `git checkout -b phase3-upgrade-3.24`
2. Update `package.json` to 3.24
3. Run `npm install`
4. Test and fix
5. Commit

**Expected Time**: 2-3 days

---

### Step 3: Upgrade to 3.28 (Target)

**After 3.24 is stable**:
1. Create branch: `git checkout -b phase3-upgrade-3.28`
2. Update `package.json` to 3.28
3. Update all addons to latest compatible versions
4. Run `npm install`
5. Test thoroughly
6. Fix breaking changes
7. Commit

**Expected Time**: 3-4 days

---

## Testing Checklist (After Each Step)

### Build & Boot
- [ ] `npm run build` succeeds
- [ ] `npm start` works
- [ ] App loads without errors
- [ ] No new console errors

### Core Features
- [ ] Login/authentication works
- [ ] Board navigation works
- [ ] Button interactions work
- [ ] Data saves/loads correctly

### Visual
- [ ] Styles render correctly
- [ ] Layouts are correct
- [ ] No broken images

### Performance
- [ ] Load time acceptable
- [ ] Navigation smooth
- [ ] No memory leaks

---

## Using ember-cli-update (Recommended)

### Automated Upgrade Tool
```bash
# Install globally
npm install -g ember-cli-update

# Navigate to frontend directory
cd app/frontend

# Run interactive update
ember-cli-update

# Or update to specific version
ember-cli-update --to 3.20.0

# Run codemods (automated fixes)
ember-cli-update --run-codemods
```

**Benefits**:
- Automatically updates package.json
- Handles configuration file updates
- Suggests codemods for common fixes
- Interactive conflict resolution

---

## Manual Upgrade (Alternative)

If `ember-cli-update` doesn't work or you prefer manual control:

### 1. Update package.json
```json
{
  "devDependencies": {
    "ember-cli": "~3.20.0",
    "ember-source": "~3.20.0",
    "ember-data": "~3.20.0"
  }
}
```

### 2. Update Supporting Packages
Check each addon's compatibility and update:
- `ember-cli-babel`: Keep or update to latest 7.x
- `ember-cli-htmlbars`: Keep or update
- `ember-cli-template-lint`: Consider updating to 3.x
- Other addons as needed

### 3. Install
```bash
cd app/frontend
rm -rf node_modules package-lock.json
npm install
```

### 4. Test & Fix
- Build and test
- Fix any errors
- Address deprecations

---

## Common Issues & Solutions

### Issue: Build Fails
**Solution**: 
- Check error messages
- Review addon compatibility
- Update incompatible addons
- Check Node version (need >= 18.0.0)

### Issue: Tests Fail
**Solution**:
- Update test-related packages
- Check test syntax changes
- Review test helpers

### Issue: Runtime Errors
**Solution**:
- Check console for deprecations
- Review breaking changes in release notes
- Check addon compatibility

### Issue: Styles Broken
**Solution**:
- Verify SCSS compilation
- Check `ember-cli-sass` version
- Review CSS imports

---

## Progress Tracking

### Step 1: 3.16 → 3.20
- [ ] Branch created
- [ ] Dependencies updated
- [ ] Build succeeds
- [ ] App boots
- [ ] Core features tested
- [ ] Committed

### Step 2: 3.20 → 3.24
- [ ] Branch created
- [ ] Dependencies updated
- [ ] Build succeeds
- [ ] App boots
- [ ] Core features tested
- [ ] Committed

### Step 3: 3.24 → 3.28
- [ ] Branch created
- [ ] Dependencies updated
- [ ] Addons updated
- [ ] Build succeeds
- [ ] App boots
- [ ] All features tested
- [ ] Performance verified
- [ ] Committed

---

## When to Proceed to Next Step

**Ready for next step when**:
- ✅ Build completes successfully
- ✅ App boots without errors
- ✅ Core features work
- ✅ No critical regressions
- ✅ Deprecation warnings reviewed
- ✅ Changes committed

**Don't proceed if**:
- ❌ Build fails
- ❌ App won't boot
- ❌ Critical features broken
- ❌ Unresolved errors

---

## Rollback Plan

If issues arise:
1. **Revert to previous step**: `git checkout <previous-branch>`
2. **Document issues**: Note what broke and why
3. **Fix incrementally**: Address one issue at a time
4. **Retry**: Once issues resolved

---

## Tips

1. **Test frequently**: After each change, verify it works
2. **Commit often**: Small, focused commits make rollback easier
3. **Document issues**: Keep notes on what breaks
4. **Use ember-cli-update**: It handles many updates automatically
5. **Check addon compatibility**: Before updating, verify addons support new version
6. **Review release notes**: Check for breaking changes
7. **Ask for help**: Use Ember community resources if stuck

---

## Success Criteria

Phase 3 is complete when:
- ✅ App runs on Ember 3.28 LTS
- ✅ Build succeeds (dev and production)
- ✅ All core features work
- ✅ No critical regressions
- ✅ Performance acceptable
- ✅ Ready for production deployment

---

## Next Steps

1. **Review** `PHASE3_PLAN.md` for detailed information
2. **Choose approach**: Automated (`ember-cli-update`) or manual
3. **Start Step 1**: Upgrade to 3.20
4. **Test thoroughly** at each step
5. **Document** any issues encountered

**Ready?** Begin with Step 1: Upgrade to Ember 3.20! 🚀
