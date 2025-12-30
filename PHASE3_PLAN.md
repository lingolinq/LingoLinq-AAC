# Phase 3: Upgrade to Ember 3.28 LTS

## Overview
**Target**: Ember 3.28 LTS, stable and deployable  
**Estimated Window**: ~1–2 weeks  
**Current Version**: Ember 3.16  
**Goal**: Incremental upgrade with testing at each step

## Prerequisites

### Phase 2 Completion Status
- ✅ Application Serializer created
- ✅ All `didLoad()` methods replaced
- ✅ All `didUpdate()` methods replaced
- ✅ SCSS compilation working
- ⚠️ Record query warnings (harmless, expected)
- ⏳ `sendAction()` conversions (can be done during Phase 3)

### Current State
- **Ember**: 3.16.0
- **Ember Data**: 3.16.0
- **Ember CLI**: 3.16.0
- **Node**: >= 18.0.0
- **Build**: ✅ Successful
- **App Boot**: ✅ No errors

---

## Upgrade Strategy

### Incremental Approach
Upgrade in stages to catch issues early:
1. **3.16 → 3.20** (First LTS after 3.16)
2. **3.20 → 3.24** (Next LTS)
3. **3.24 → 3.28** (Target LTS)

### Why Incremental?
- Easier to isolate breaking changes
- Smaller change surface per step
- Can test and stabilize at each stage
- Easier rollback if issues arise

---

## Task Breakdown

### Step 1: Upgrade to Ember 3.20 LTS

**Estimated Time**: 2-3 days

#### 1.1 Update Core Dependencies
```json
{
  "ember-cli": "~3.20.0",
  "ember-source": "~3.20.0",
  "ember-data": "~3.20.0"
}
```

#### 1.2 Update Supporting Packages
- `ember-cli-babel`: Check compatibility (currently ^7.26.0)
- `ember-cli-htmlbars`: Check compatibility (currently ^4.3.0)
- `ember-cli-template-lint`: Update to ^3.0.0+ (if available)
- `ember-cli-terser`: Verify compatibility (currently ^4.0.0)

#### 1.3 Breaking Changes to Address
- Review Ember 3.17-3.20 release notes
- Check for new deprecations
- Verify addon compatibility

#### 1.4 Testing Checklist
- [ ] Build completes successfully
- [ ] App boots without errors
- [ ] Core user flows work:
  - [ ] Login/authentication
  - [ ] Board navigation
  - [ ] Button interactions
  - [ ] Data persistence
- [ ] No new console errors
- [ ] Deprecation warnings reviewed

**Files to Modify**:
- `app/frontend/package.json`
- `app/frontend/package-lock.json` (auto-generated)

---

### Step 2: Upgrade to Ember 3.24 LTS

**Estimated Time**: 2-3 days

#### 2.1 Update Core Dependencies
```json
{
  "ember-cli": "~3.24.0",
  "ember-source": "~3.24.0",
  "ember-data": "~3.24.0"
}
```

#### 2.2 Update Supporting Packages
- Review all addon versions for 3.24 compatibility
- Update `ember-cli-template-lint` if needed
- Verify `ember-cli-sass` compatibility

#### 2.3 Breaking Changes to Address
- Review Ember 3.21-3.24 release notes
- Check for new deprecations
- Address any `sendAction()` warnings that become errors

#### 2.4 Testing Checklist
- [ ] Build completes successfully
- [ ] App boots without errors
- [ ] All core features tested
- [ ] Performance check (no regressions)
- [ ] Deprecation warnings reviewed

---

### Step 3: Upgrade to Ember 3.28 LTS (Target)

**Estimated Time**: 3-4 days

#### 3.1 Update Core Dependencies
```json
{
  "ember-cli": "~3.28.0",
  "ember-source": "~3.28.0",
  "ember-data": "~3.28.0"
}
```

#### 3.2 Update All Addons
Review and update all Ember addons to latest 3.28-compatible versions:

**Critical Addons**:
- `ember-cli-babel`: Update to latest 7.x or 8.x
- `ember-cli-htmlbars`: Update to latest 4.x or 5.x
- `ember-cli-template-lint`: Update to latest 3.x
- `ember-cli-terser`: Verify latest version
- `ember-cli-sass`: Verify 3.28 compatibility
- `ember-ajax`: Update to latest 5.x
- `ember-qunit`: Update to latest 4.x or 5.x
- `ember-resolver`: Update to latest 5.x or 6.x

**Other Addons**:
- `@ember/jquery`: Verify compatibility
- `ember-cli-sri`: Update if needed
- `ember-cli-inject-live-reload`: Update if needed
- `ember-load-initializers`: Update if needed
- `ember-export-application-global`: Update if needed

#### 3.3 Breaking Changes to Address
- Review Ember 3.25-3.28 release notes
- Address any remaining deprecations
- Fix any `sendAction()` usage (if not done in Phase 2)
- Review jQuery usage (may need `@ember/jquery` updates)

#### 3.4 Configuration Updates
- Review `config/targets.js` for browser support
- Update `config/environment.js` if needed
- Review `ember-cli-build.js` for new options

#### 3.5 Testing Checklist
- [ ] Build completes successfully
- [ ] Production build works
- [ ] App boots without errors
- [ ] All core features tested thoroughly
- [ ] Performance check (no regressions)
- [ ] Browser compatibility verified
- [ ] Deprecation warnings minimal (<5)
- [ ] No blocking errors

---

## Dependency Compatibility Matrix

### Current Dependencies (3.16)
| Package | Current Version | 3.20 Compatible | 3.24 Compatible | 3.28 Compatible | Notes |
|---------|----------------|-----------------|-----------------|-----------------|-------|
| ember-cli | ~3.16.0 | ✅ | ✅ | ✅ | Upgrade to match Ember |
| ember-source | ~3.16.0 | ✅ | ✅ | ✅ | Upgrade to match Ember |
| ember-data | ~3.16.0 | ✅ | ✅ | ✅ | Upgrade to match Ember |
| ember-cli-babel | ^7.26.0 | ✅ | ✅ | ✅ | May need 7.28+ for 3.28 |
| ember-cli-htmlbars | ^4.3.0 | ✅ | ✅ | ✅ | Should be fine |
| ember-cli-template-lint | ^2.0.0 | ⚠️ | ⚠️ | ⚠️ | Should update to 3.x |
| ember-cli-terser | ^4.0.0 | ✅ | ✅ | ✅ | Should be fine |
| ember-cli-sass | ^11.0.1 | ✅ | ✅ | ✅ | Should be fine |
| ember-ajax | ^5.0.0 | ✅ | ✅ | ✅ | Should be fine |
| ember-qunit | ^4.4.1 | ✅ | ✅ | ⚠️ | May need 5.x for 3.28 |
| ember-resolver | ^5.0.1 | ✅ | ✅ | ✅ | Should be fine |
| @ember/jquery | ^1.1.0 | ✅ | ✅ | ✅ | Should be fine |

### Bower Dependencies
These are legacy and should be migrated to npm if possible:
- `bootstrap@~3.3.2` - Consider migrating to npm
- `moment@~2.9.0` - Very old, consider updating or replacing
- `jquery-minicolors@~2.1.10` - Check npm alternative
- `recordrtc`, `IndexedDBShim`, `wordcloud2.js`, `qrcode-js`, `tinycolor` - Check npm alternatives

**Note**: Bower is deprecated. Consider migrating these to npm during Phase 3.

---

## Potential Breaking Changes

### Ember 3.17-3.20
- Check release notes for deprecations
- Verify computed property syntax
- Check observer usage (should be fine)

### Ember 3.21-3.24
- Review template changes
- Check component API changes
- Verify route/controller patterns

### Ember 3.25-3.28
- Final deprecation removals
- `sendAction()` may become error (if not fixed)
- jQuery integration changes (if not using `@ember/jquery`)

---

## Testing Strategy

### After Each Upgrade Step

#### 1. Build Verification
```bash
cd app/frontend
npm install
npm run build
```
- ✅ Build completes without errors
- ✅ No new warnings
- ✅ Asset files generated correctly

#### 2. Development Server
```bash
npm start
```
- ✅ App boots without errors
- ✅ No console errors on load
- ✅ Basic navigation works

#### 3. Core Feature Testing
- [ ] **Authentication Flow**
  - Login works
  - Session persists
  - Logout works
  
- [ ] **Board Navigation**
  - Boards load correctly
  - Board switching works
  - Board editing works
  
- [ ] **Button Interactions**
  - Button clicks work
  - Button sounds play
  - Button actions execute
  
- [ ] **Data Persistence**
  - Data saves correctly
  - Data loads correctly
  - Offline mode works (if applicable)

#### 4. Visual Regression
- [ ] Styles render correctly
- [ ] Layouts are correct
- [ ] No broken images/icons
- [ ] Responsive design works

#### 5. Performance Check
- [ ] Initial load time acceptable
- [ ] Navigation is smooth
- [ ] No memory leaks
- [ ] No console performance warnings

---

## Risk Assessment

### High Risk
- **Addon Compatibility**: Some addons may not support 3.28
- **Bower Dependencies**: Legacy dependencies may cause issues
- **Custom Code**: Custom Ember extensions may break

### Medium Risk
- **Template Changes**: Template syntax may need updates
- **Component API**: Component APIs may have changed
- **Build Configuration**: Build config may need updates

### Low Risk
- **Core Ember Features**: Should be backward compatible
- **Ember Data**: Should work with existing serializers
- **Routing**: Should work as-is

---

## Rollback Strategy

### Before Each Upgrade Step
1. **Create Git Branch**: `git checkout -b upgrade-ember-3.20`
2. **Commit Current State**: Ensure clean working directory
3. **Tag Current Version**: `git tag phase2-complete`

### If Issues Arise
1. **Revert to Previous Step**: `git checkout phase2-complete`
2. **Document Issues**: Create issue list
3. **Fix Issues**: Address problems incrementally
4. **Retry Upgrade**: Once issues resolved

---

## Tools & Commands

### Upgrade Tools
```bash
# Install ember-cli-update globally
npm install -g ember-cli-update

# Run update (interactive)
ember-cli-update

# Run with codemods
ember-cli-update --run-codemods

# Update to specific version
ember-cli-update --to 3.20.0
```

### Verification Commands
```bash
# Check Ember version
ember -v

# Check for outdated packages
npm outdated

# Check for security vulnerabilities
npm audit

# Run tests
npm test

# Build for production
npm run build -- --environment production
```

---

## Implementation Timeline

### Week 1: Foundation & First Upgrade

**Day 1-2: Preparation**
- [ ] Review all dependencies
- [ ] Check addon compatibility
- [ ] Create upgrade branch
- [ ] Document current state
- [ ] Set up testing checklist

**Day 3-4: Upgrade to 3.20**
- [ ] Update package.json
- [ ] Run npm install
- [ ] Fix any build errors
- [ ] Run full test suite
- [ ] Test core features
- [ ] Commit and tag: `upgrade-3.20-complete`

**Day 5: Stabilization**
- [ ] Address any issues found
- [ ] Performance testing
- [ ] Documentation updates

### Week 2: Final Upgrades

**Day 1-2: Upgrade to 3.24**
- [ ] Update package.json
- [ ] Run npm install
- [ ] Fix any build errors
- [ ] Run full test suite
- [ ] Test core features
- [ ] Commit and tag: `upgrade-3.24-complete`

**Day 3-4: Upgrade to 3.28 (Target)**
- [ ] Update package.json
- [ ] Update all addons
- [ ] Run npm install
- [ ] Fix any build errors
- [ ] Address breaking changes
- [ ] Run full test suite
- [ ] Comprehensive testing
- [ ] Commit and tag: `upgrade-3.28-complete`

**Day 5: Final Verification**
- [ ] Production build test
- [ ] Browser compatibility testing
- [ ] Performance verification
- [ ] Documentation finalization
- [ ] Phase 3 completion report

---

## Success Criteria

### Phase 3 Complete When:
- ✅ App runs on Ember 3.28 LTS
- ✅ Build completes successfully
- ✅ All core features work
- ✅ No critical regressions
- ✅ Deprecation warnings <5 (non-blocking)
- ✅ Production build works
- ✅ Performance acceptable
- ✅ All tests pass (if applicable)

---

## Known Issues & Considerations

### Bower Dependencies
- **Issue**: Using deprecated Bower package manager
- **Impact**: May cause issues in future
- **Action**: Consider migrating to npm during Phase 3
- **Priority**: Medium (can defer if needed)

### Moment.js Version
- **Issue**: Using very old moment.js (2.9.0)
- **Impact**: Security and compatibility concerns
- **Action**: Update to latest 2.x or migrate to date-fns/dayjs
- **Priority**: Medium

### Bootstrap Version
- **Issue**: Using Bootstrap 3.3.2 (very old)
- **Impact**: May have compatibility issues
- **Action**: Consider updating to Bootstrap 4 or 5
- **Priority**: Low (can defer)

### jQuery Usage
- **Issue**: Still using jQuery in many places
- **Impact**: Will need removal for Ember 4.0
- **Action**: Continue using `@ember/jquery` for now
- **Priority**: Low (Phase 4 concern)

---

## Post-Upgrade Tasks

### Immediate (Week 1 after upgrade)
- [ ] Monitor production for errors
- [ ] Address any user-reported issues
- [ ] Performance monitoring
- [ ] Update documentation

### Short-term (Month 1)
- [ ] Complete `sendAction()` conversions
- [ ] Address remaining deprecations
- [ ] Migrate Bower dependencies to npm
- [ ] Update outdated packages

### Long-term (Future phases)
- [ ] Plan for Ember 4.0 upgrade
- [ ] Remove jQuery dependency
- [ ] Modernize component patterns
- [ ] Consider Octane migration

---

## Resources

### Official Documentation
- [Ember 3.28 Release Notes](https://blog.emberjs.com/tag/releases/)
- [Ember Upgrade Guide](https://cli.emberjs.com/release/basic-use/upgrading/)
- [Ember Deprecations](https://deprecations.emberjs.com/)

### Tools
- [ember-cli-update](https://github.com/ember-cli/ember-cli-update)
- [Ember Codemods](https://github.com/ember-codemods)

### Community
- [Ember Discord](https://discord.gg/emberjs)
- [Ember Forum](https://discuss.emberjs.com/)

---

## Notes

- **Incremental approach is key**: Don't jump directly to 3.28
- **Test at each step**: Catch issues early
- **Document everything**: Keep notes on what breaks and why
- **Be patient**: Upgrades take time, don't rush
- **Ask for help**: Use community resources if stuck

---

## Next Steps

1. **Review this plan** and adjust timeline if needed
2. **Create upgrade branch**: `git checkout -b phase3-ember-upgrade`
3. **Start with Step 1**: Upgrade to 3.20
4. **Test thoroughly** at each step
5. **Document issues** as they arise
6. **Celebrate** when 3.28 is reached! 🎉

**Ready to begin?** Start with Step 1.1: Update Core Dependencies to 3.20.
