# Phase 3: Next Steps

## Current Status ✅

- **Ember**: 3.20.7 (upgraded)
- **Ember Data**: 3.20.5
- **Node**: 18.20.8
- **Status**: Ready for next upgrade step

## Node Version Compatibility

### Current: Node 18.20.8
- ✅ **Compatible with Ember 3.20** (current)
- ✅ **Compatible with Ember 3.24** (next step)
- ✅ **Compatible with Ember 3.28** (target)

### Recommendation
- **Node 20 is used** for Phase 3 (3.20 → 3.24 → 3.28)
- **Node 20 LTS** would be better for future-proofing, but not required
- **Consider upgrading to Node 20** after Phase 3 is complete

## Next Steps: Upgrade to Ember 3.24

### Step 1: Create Branch
```bash
git checkout -b upgrade/ember-3.24
```

### Step 2: Update package.json
Update these three core dependencies in `app/frontend/package.json`:

```json
{
  "ember-cli": "~3.24.0",
  "ember-source": "~3.24.0",
  "ember-data": "~3.24.0"
}
```

### Step 3: Install Dependencies
```bash
cd app/frontend
npm install
```

### Step 4: Build & Test
```bash
npm run build
npm start
```

### Step 5: Address Any Issues
- Fix build errors
- Fix runtime errors
- Address deprecation warnings
- Test core features

### Step 6: Commit
```bash
git add .
git commit -m "Upgrade to Ember 3.24 LTS"
```

## After 3.24 is Stable: Upgrade to 3.28

### Step 1: Create Branch
```bash
git checkout -b upgrade/ember-3.28
```

### Step 2: Update package.json
```json
{
  "ember-cli": "~3.28.0",
  "ember-source": "~3.28.0",
  "ember-data": "~3.28.0"
}
```

### Step 3: Update Supporting Packages
Review and update these addons to 3.28-compatible versions:

**Critical Addons**:
- `ember-cli-babel`: May need 7.28+ or 8.x
- `ember-cli-template-lint`: Consider updating to 3.x
- `ember-cli-htmlbars`: Should be fine at 4.x
- `ember-cli-terser`: Should be fine
- `ember-cli-sass`: Should be fine

**Other Addons** (review compatibility):
- `ember-ajax`: Should be fine at 5.x
- `ember-qunit`: May need 5.x for 3.28
- `ember-resolver`: Should be fine at 5.x
- `@ember/jquery`: Should be fine at 1.x

### Step 4: Install & Test
```bash
npm install
npm run build
npm start
```

### Step 5: Comprehensive Testing
- [ ] Build succeeds (dev and production)
- [ ] App boots without errors
- [ ] Authentication works
- [ ] Board navigation works
- [ ] Button interactions work
- [ ] Data persistence works
- [ ] No critical console errors
- [ ] Performance is acceptable

## Node Version Upgrade (Optional, After Phase 3)

### When to Upgrade Node
- **After Phase 3 is complete** (Ember 3.28 stable)
- **Node 20 LTS** is recommended for:
  - Better performance
  - Security updates
  - Future Ember 4.x compatibility
  - Long-term support

### How to Upgrade Node
1. Update `.nvmrc` to `20` (or latest LTS)
2. Update `package.json` engines: `"node": ">= 20.0.0"`
3. Test thoroughly
4. Update CI/CD if applicable

## Testing Checklist for Each Upgrade

### Build Verification
- [ ] `npm run build` succeeds
- [ ] Production build works: `npm run build -- --environment production`
- [ ] No new build warnings

### Runtime Verification
- [ ] App boots without errors
- [ ] No console errors on load
- [ ] Basic navigation works

### Feature Testing
- [ ] Login/authentication
- [ ] Board loading and navigation
- [ ] Button interactions
- [ ] Data saving/loading
- [ ] Offline functionality (if applicable)

### Performance
- [ ] Initial load time acceptable
- [ ] No memory leaks
- [ ] Smooth navigation

## Common Issues & Solutions

### Issue: Build Fails
- **Solution**: Check for incompatible addons, update them
- **Solution**: Clear `node_modules` and `package-lock.json`, reinstall

### Issue: Runtime Errors
- **Solution**: Check browser console for specific errors
- **Solution**: Review Ember release notes for breaking changes
- **Solution**: Check addon compatibility

### Issue: Deprecation Warnings
- **Solution**: Most are non-blocking, can be addressed later
- **Solution**: Use `ember-cli-update --run-codemods` to auto-fix some

### Issue: Addon Compatibility
- **Solution**: Check addon's GitHub for compatibility info
- **Solution**: Update to latest compatible version
- **Solution**: Consider alternatives if addon is abandoned

## Timeline Estimate

- **3.20 → 3.24**: 2-3 days
- **3.24 → 3.28**: 3-4 days
- **Total**: ~1 week

## Resources

- **Detailed Plan**: `PHASE3_PLAN.md`
- **Quick Start**: `PHASE3_START_HERE.md`
- **Ember Release Notes**: https://blog.emberjs.com/tag/releases/
- **Ember Upgrade Guide**: https://cli.emberjs.com/release/basic-use/upgrading/

## Success Criteria

Phase 3 is complete when:
- ✅ Running on Ember 3.28 LTS
- ✅ Build succeeds (dev and production)
- ✅ All core features work
- ✅ No critical regressions
- ✅ Performance acceptable
- ✅ Ready for production

---

**Ready to proceed?** Start with upgrading to Ember 3.24! 🚀
