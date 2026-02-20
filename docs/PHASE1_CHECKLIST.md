# Phase 1 Checklist: Ember 3.12 → 3.16 Stabilization

## Current State
- **Current Version**: Ember 3.12.0
- **Target Version**: Ember 3.16
- **Node Version**: >= 18.0.0 ✅

## Pre-Upgrade Assessment

### ✅ Completed
- [x] Fixed template parsing errors (quote conflicts in `{{t}}` helpers)
- [x] Fixed `opehref` typo in about.hbs

### 🔍 Known Issues to Address

#### 1. Deprecated Patterns (Found in codebase)
- [ ] `sendAction()` - **32 files** using this pattern (can defer to Phase 2):
  - Components: page-footer, dashboard/unauthenticated-view, user-select, video-recorder, subscription-form, stats components, etc.
  - **Action**: Convert to closure actions in Phase 2
- [ ] `.get()` / `.set()` - Found extensively throughout codebase:
  - `app/components/dashboard/unauthenticated-view.js` (multiple instances)
  - Many other files (will need comprehensive audit)
  - **Action**: Can defer to Phase 2, but document usage
- [ ] Observers - ESLint rule disabled (`ember/no-observers: 'off'`)
  - Found in: `app/components/bound-select.js` and others
  - **Action**: Document for Phase 2 cleanup
- [ ] Closure actions - ESLint rule disabled (`ember/closure-actions: 'off'`)
  - **Action**: Enable in Phase 2 when converting sendAction

#### 2. Dependencies
- [ ] **Bower** - Still in use (needs migration to npm)
  - Dependencies: moment, tinycolor, jquery-minicolors, bootstrap, recordrtc, IndexedDBShim, wordcloud2.js, hammer-time, qrcode-js
  - **Action**: Plan migration strategy, but can defer to Phase 2
- [ ] **jQuery** - v3.7.1 (extensively used, ~20+ files importing it)
  - Found in: raw_events.js, button-listener.js, bound-select.js, embed-frame.js, and many stats components
  - **Action**: Document all usage locations for Phase 2 removal
- [ ] **ember-cli-template-lint** - Very old version (`^1.0.0-beta.1`)
  - **Action**: **MUST UPDATE** for 3.16 compatibility

#### 3. Build Configuration
- [ ] `ember-cli-uglify` - Deprecated, should use `ember-cli-terser`
- [ ] `targets.js` - Still includes IE 11 (can be removed for 3.16+)
- [ ] Temporary ember fix addon exists (`lib/temporary-ember-fix`) - May not be needed after upgrade

## Phase 1 Upgrade Steps

### Step 1: Update Core Dependencies
```bash
cd app/frontend
npm install --save-dev ember-cli@~3.16.0 ember-source@~3.16.0 ember-data@~3.16.0
```

### Step 2: Update Supporting Packages
```bash
npm install --save-dev \
  ember-cli-babel@^7.26.0 \
  ember-cli-htmlbars@^4.3.0 \
  ember-cli-template-lint@^2.0.0 \
  ember-cli-terser@^3.0.0
```

### Step 3: Remove Deprecated Packages
```bash
npm uninstall ember-cli-uglify
```

### Step 4: Update ember-cli-build.js
- Replace `ember-cli-uglify` with `ember-cli-terser` (if minification needed)
- Review Bower imports - plan migration

### Step 5: Update targets.js
- Remove IE 11 support (not needed for 3.16+)
```javascript
const browsers = [
  'last 1 Chrome versions',
  'last 1 Firefox versions',
  'last 1 Safari versions'
];
```

### Step 6: Test Build
```bash
npm run build
ember serve
```

### Step 7: Address Breaking Changes
- Review Ember 3.13-3.16 changelogs for breaking changes
- Fix any template compilation errors
- Fix any runtime errors

### Step 8: Run Tests
```bash
npm test
```

## Critical Path Items

### Must Fix Before 3.16
1. **Template Linting** - Update `ember-cli-template-lint` to v2.x
2. **Build Tools** - Replace `ember-cli-uglify` with `ember-cli-terser`
3. **IE 11** - Remove from targets (IE 11 support dropped in 3.16)

### Can Defer to Phase 2
1. `sendAction()` → closure actions
2. `.get()` / `.set()` → native getters/setters
3. Bower → npm migration
4. jQuery removal

## Testing Checklist

- [ ] App boots without errors
- [ ] Core user flows work:
  - [ ] Login/authentication
  - [ ] Board navigation
  - [ ] Button interactions
  - [ ] Data persistence
- [ ] No console errors in development
- [ ] Build completes successfully
- [ ] Tests pass (or at least run without crashing)

## Risk Mitigation

### High Risk Areas
1. **Bower dependencies** - May break during upgrade
   - **Mitigation**: Migrate critical deps to npm before upgrade
2. **Custom addon** (`lib/temporary-ember-fix`) - May conflict
   - **Mitigation**: Test if still needed, remove if not
3. **jQuery usage** - May cause issues
   - **Mitigation**: Document all jQuery usage for Phase 2

### Rollback Plan
- Keep `ember-upgrade` branch separate
- Tag current working state before upgrade
- Can revert package.json if needed

## Exit Criteria Verification

- [ ] App runs locally without errors
- [ ] No blocking deprecations preventing forward upgrades
- [ ] Build process is stable
- [ ] Core functionality verified
- [ ] Baseline branch established (`ember-upgrade` branch)

## Next Steps After Phase 1

Once Phase 1 is complete:
1. Tag the stable 3.16 baseline
2. Document any remaining deprecation warnings
3. Create Phase 2 task list for Octane preparation
4. Begin planning Bower → npm migration
