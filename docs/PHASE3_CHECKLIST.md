# Phase 3: Upgrade Checklist

Use this checklist to track progress through the Ember 3.16 → 3.28 upgrade.

---

## Pre-Upgrade Preparation

### Before Starting
- [ ] Review `PHASE3_PLAN.md` thoroughly
- [ ] Review `PHASE3_START_HERE.md` for quick reference
- [ ] Ensure Phase 2 is complete (high-priority tasks)
- [ ] Create backup branch: `git checkout -b phase2-backup`
- [ ] Verify current state works: build and app boot
- [ ] Document current Ember version: `ember -v`
- [ ] List all current dependencies: `npm list --depth=0`

---

## Step 1: Upgrade to Ember 3.20 LTS

### Preparation
- [ ] Create branch: `git checkout -b phase3-upgrade-3.20`
- [ ] Review Ember 3.17-3.20 release notes
- [ ] Check addon compatibility for 3.20

### Dependencies Update
- [ ] Update `package.json`:
  - [ ] `ember-cli`: `~3.20.0`
  - [ ] `ember-source`: `~3.20.0`
  - [ ] `ember-data`: `~3.20.0`
- [ ] Review supporting packages:
  - [ ] `ember-cli-babel` (verify compatibility)
  - [ ] `ember-cli-htmlbars` (verify compatibility)
  - [ ] `ember-cli-template-lint` (consider update)
  - [ ] Other addons (check compatibility)

### Installation
- [ ] Run `npm install`
- [ ] Resolve any dependency conflicts
- [ ] Verify installation: `npm list ember-source`

### Build & Test
- [ ] Build succeeds: `npm run build`
- [ ] App boots: `npm start`
- [ ] No console errors on load
- [ ] Core features tested:
  - [ ] Login/authentication
  - [ ] Board navigation
  - [ ] Button interactions
  - [ ] Data persistence
- [ ] Visual check: styles render correctly
- [ ] Performance check: no regressions

### Documentation
- [ ] Document any issues encountered
- [ ] Note any deprecation warnings
- [ ] Update this checklist with findings

### Completion
- [ ] All tests pass
- [ ] No critical regressions
- [ ] Commit changes: `git commit -m "Upgrade to Ember 3.20"`
- [ ] Tag: `git tag upgrade-3.20-complete`

**Status**: ⬜ Not Started | 🟡 In Progress | ✅ Complete

---

## Step 2: Upgrade to Ember 3.24 LTS

### Preparation
- [ ] Create branch: `git checkout -b phase3-upgrade-3.24`
- [ ] Review Ember 3.21-3.24 release notes
- [ ] Check addon compatibility for 3.24

### Dependencies Update
- [ ] Update `package.json`:
  - [ ] `ember-cli`: `~3.24.0`
  - [ ] `ember-source`: `~3.24.0`
  - [ ] `ember-data`: `~3.24.0`
- [ ] Update supporting packages as needed
- [ ] Review all addon versions

### Installation
- [ ] Run `npm install`
- [ ] Resolve any dependency conflicts
- [ ] Verify installation

### Build & Test
- [ ] Build succeeds: `npm run build`
- [ ] App boots: `npm start`
- [ ] No console errors on load
- [ ] Core features tested
- [ ] Visual check: styles render correctly
- [ ] Performance check: no regressions

### Documentation
- [ ] Document any issues encountered
- [ ] Note any deprecation warnings
- [ ] Update this checklist with findings

### Completion
- [ ] All tests pass
- [ ] No critical regressions
- [ ] Commit changes: `git commit -m "Upgrade to Ember 3.24"`
- [ ] Tag: `git tag upgrade-3.24-complete`

**Status**: ⬜ Not Started | 🟡 In Progress | ✅ Complete

---

## Step 3: Upgrade to Ember 3.28 LTS (Target)

### Preparation
- [ ] Create branch: `git checkout -b phase3-upgrade-3.28`
- [ ] Review Ember 3.25-3.28 release notes
- [ ] Check addon compatibility for 3.28
- [ ] Review breaking changes

### Dependencies Update
- [ ] Update `package.json`:
  - [ ] `ember-cli`: `~3.28.0`
  - [ ] `ember-source`: `~3.28.0`
  - [ ] `ember-data`: `~3.28.0`
- [ ] Update all addons to latest compatible versions:
  - [ ] `ember-cli-babel` (latest 7.x or 8.x)
  - [ ] `ember-cli-htmlbars` (latest 4.x or 5.x)
  - [ ] `ember-cli-template-lint` (latest 3.x)
  - [ ] `ember-cli-terser` (latest)
  - [ ] `ember-cli-sass` (verify compatibility)
  - [ ] `ember-ajax` (latest 5.x)
  - [ ] `ember-qunit` (latest 4.x or 5.x)
  - [ ] `ember-resolver` (latest 5.x or 6.x)
  - [ ] `@ember/jquery` (latest)
  - [ ] Other addons as needed

### Installation
- [ ] Run `npm install`
- [ ] Resolve any dependency conflicts
- [ ] Verify installation: `ember -v` shows 3.28

### Configuration Updates
- [ ] Review `config/targets.js` (browser support)
- [ ] Review `config/environment.js`
- [ ] Review `ember-cli-build.js`
- [ ] Update if needed

### Build & Test
- [ ] Build succeeds: `npm run build`
- [ ] Production build: `npm run build -- --environment production`
- [ ] App boots: `npm start`
- [ ] No console errors on load
- [ ] Comprehensive feature testing:
  - [ ] Authentication flow
  - [ ] Board navigation
  - [ ] Button interactions
  - [ ] Data persistence
  - [ ] All major features
- [ ] Visual check: styles render correctly
- [ ] Browser compatibility check
- [ ] Performance check: no regressions

### Breaking Changes
- [ ] Address any breaking changes from release notes
- [ ] Fix any `sendAction()` usage (if not done in Phase 2)
- [ ] Review jQuery usage
- [ ] Check for new deprecations

### Documentation
- [ ] Document any issues encountered
- [ ] Note any deprecation warnings
- [ ] Update this checklist with findings
- [ ] Create completion report

### Completion
- [ ] All tests pass
- [ ] No critical regressions
- [ ] Performance acceptable
- [ ] Production build works
- [ ] Commit changes: `git commit -m "Upgrade to Ember 3.28 LTS"`
- [ ] Tag: `git tag upgrade-3.28-complete`
- [ ] Merge to main branch (when ready)

**Status**: ⬜ Not Started | 🟡 In Progress | ✅ Complete

---

## Post-Upgrade Tasks

### Immediate (Week 1)
- [ ] Monitor production for errors
- [ ] Address any user-reported issues
- [ ] Performance monitoring
- [ ] Update documentation

### Short-term (Month 1)
- [ ] Complete `sendAction()` conversions (if not done)
- [ ] Address remaining deprecations
- [ ] Migrate Bower dependencies to npm (if needed)
- [ ] Update outdated packages

### Long-term (Future)
- [ ] Plan for Ember 4.0 upgrade
- [ ] Remove jQuery dependency
- [ ] Modernize component patterns
- [ ] Consider Octane migration

---

## Overall Phase 3 Status

- [ ] Step 1 (3.20): ⬜ Not Started | 🟡 In Progress | ✅ Complete
- [ ] Step 2 (3.24): ⬜ Not Started | 🟡 In Progress | ✅ Complete
- [ ] Step 3 (3.28): ⬜ Not Started | 🟡 In Progress | ✅ Complete

**Phase 3 Complete When**:
- ✅ All three steps complete
- ✅ App runs on Ember 3.28 LTS
- ✅ All core features work
- ✅ No critical regressions
- ✅ Production ready

---

## Notes & Issues Log

### Step 1 Issues
```
[Date]: [Issue description]
[Resolution]:
```

### Step 2 Issues
```
[Date]: [Issue description]
[Resolution]:
```

### Step 3 Issues
```
[Date]: [Issue description]
[Resolution]:
```

---

## Quick Reference

### Commands
```bash
# Check Ember version
ember -v

# Update dependencies
cd app/frontend && npm install

# Build
npm run build

# Start dev server
npm start

# Run tests
npm test

# Check outdated packages
npm outdated
```

### Key Files
- `app/frontend/package.json` - Dependencies
- `app/frontend/ember-cli-build.js` - Build config
- `app/frontend/config/environment.js` - App config
- `app/frontend/config/targets.js` - Browser targets

### Resources
- `PHASE3_PLAN.md` - Detailed plan
- `PHASE3_START_HERE.md` - Quick start guide
- [Ember Release Notes](https://blog.emberjs.com/tag/releases/)
- [Ember Upgrade Guide](https://cli.emberjs.com/release/basic-use/upgrading/)

---

**Last Updated**: [Date]  
**Current Step**: [Step 1/2/3]  
**Status**: [Not Started/In Progress/Complete]
