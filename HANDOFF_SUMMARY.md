# Handoff Summary for Gemini

## Quick Context

**Previous AI**: Claude (Anthropic)  
**New AI**: Gemini 2.0 Flash Thinking (Google)  
**Date**: 2026-01-16  
**Project**: LingoLinq AAC - Rails 6.1.7 + Ember 3.28  
**Branch**: `feature/ember-3.16-with-tools`

---

## Current State

### ✅ What Works
- Rails backend running on port 5000 (Puma with 3 workers)
- Ember frontend compiled and served from Rails public/
- Database connected (PostgreSQL 15)
- Redis running
- CORS enabled for development
- Host authorization configured
- Authentication system functional

### ❌ What's Broken
1. **Implicit Injections** (CRITICAL)
   - `app_state`, `persistence`, `stashes` injected globally (deprecated)
   - Causing "Cannot assign to read only property" errors
   - Breaking online/offline sync functionality
   - Affects 200+ files (72 models, 100 controllers, 50 routes, 30 components)

2. **Modal System** (HIGH PRIORITY)
   - Using deprecated `route.render()` pattern
   - 252 usages across the app
   - Causing rendering conflicts and assertion errors
   - Code at: `app/frontend/app/utils/modal.js` line 53

3. **HTTP Image URLs** (UX ISSUE)
   - Database contains HTTP URLs that browsers block on HTTPS pages
   - OpenSymbols images not loading

4. **Missing Buttonsets** (DATA ISSUE)
   - 404 errors on `/api/v1/buttonsets/1_4`, `1_6`, etc.
   - Database may need seeding

---

## Services Running

```bash
# Background process:
bash_01857be3 (PID: 504694)

# Command:
cd /home/user/webapp && \
  source ~/.bashrc && \
  eval "$(rbenv init - bash)" && \
  export PATH="$HOME/.nvm/versions/node/v18.20.8/bin:$PATH" && \
  SKIP_VALIDATIONS=true foreman start web=1,ember=1

# Services:
- Rails (Puma): Port 5000
- Ember Dev Server: Port 8184 (for hot reload only, don't use directly)

# Public URLs:
- Main App: https://5000-if22s76ljt6fceg4fip6r-2b54fc91.sandbox.novita.ai
- Dev Server: https://8184-if22s76ljt6fceg4fip6r-2b54fc91.sandbox.novita.ai (ignore this)
```

---

## Documentation to Read (Priority Order)

### 1. **MIGRATION_PLAN_PROPER.md** ⭐ START HERE
- Complete 5-day implementation plan
- Service architecture patterns
- File-by-file migration strategy
- Testing checklist
- Risk mitigation

### 2. **REAL_ISSUES_AND_SOLUTIONS.md**
- Root cause analysis
- Why previous fixes went in circles
- What was fixed vs what still needs fixing

### 3. **CLAUDE.md**
- Project architecture overview
- Development conventions
- String quoting rules (CRITICAL for i18n)
- Key utilities and models
- Testing procedures

### 4. **GEMINI.md**
- Node version requirements (Node 18 for Ember!)
- Gemini CLI tips
- Non-interactive shell rules
- Foreman safety rules

### 5. **CURRENT_ISSUES.md**
- Technical details of current problems
- CSP configuration
- API endpoint issues

### 6. **docs/upgrade_plans/** (Context)
- `PHASE3_NEXT_STEPS.md` - Shows we're already on Ember 3.28
- `PHASE1_DEPRECATIONS.md` - Known deprecation warnings

---

## The Migration Plan (from MIGRATION_PLAN_PROPER.md)

### Day 1: Create Modern Services
**Files to create:**
```
app/frontend/app/services/app-state.js
app/frontend/app/services/persistence.js
app/frontend/app/services/stashes.js
app/frontend/app/services/modal.js
app/frontend/app/components/modal-manager.js
app/frontend/app/components/modal-manager.hbs
```

**Pattern:**
```javascript
import Service from '@ember/service';
import { inject as service } from '@ember/service';

export default Service.extend({
  // Move logic from utils/ here
});
```

### Days 2-3: Migrate to Explicit Injections
**Pattern for ALL files:**
```javascript
// OLD (implicit):
export default Model.extend({
  // this.app_state available implicitly
});

// NEW (explicit):
import { inject as service } from '@ember/service';

export default Model.extend({
  appState: service('app-state'),
  persistence: service(),
  stashes: service(),
});
```

**Files to update:**
- `app/models/*.js` (~72 files)
- `app/controllers/*.js` (~100 files)
- `app/routes/*.js` (~50 files)
- `app/components/*.js` (~30 files)

### Day 4: Modernize Modal System
**Update all 252 calls:**
```javascript
// OLD:
modal.open('template-name', options);

// NEW:
this.modal.open('template-name', options);
```

### Day 5: Remove Implicit Injections & Test
- Remove injection code from utils files
- Full regression testing
- Verify no deprecation warnings

---

## Git Workflow

### Current Status
```bash
Branch: feature/ember-3.16-with-tools
Remote: origin (GitHub: swahlquist/LingoLinq-AAC)
Last Commit: 52314062c - "docs: add comprehensive migration plan"
```

### Commit After Each Phase
```bash
# Pattern:
git add .
git commit -m "refactor(ember): Phase X - [description]

- Created services for X, Y, Z
- Migrated N files to explicit injection
- Tested: [what was tested]

Progress: X/5 complete"

git push origin feature/ember-3.16-with-tools
```

### Important Git Rules
1. **ALWAYS commit after each phase**
2. **ALWAYS push to remote** (for backup)
3. **Use conventional commit format**: `refactor(scope): message`
4. **Include testing notes** in commit body

---

## Critical Constraints

### Node Version
```bash
# MUST use Node 18 for Ember:
nvm use 18

# Verify:
node -v  # Should show v18.20.8
```

### Don't Break These
1. **String quoting convention** (see CLAUDE.md):
   - User-facing: double quotes `"text"`
   - Code/keys: single quotes `'text'`
   - CRITICAL for i18n generator

2. **Service running in background**:
   - Don't kill bash_01857be3
   - It auto-restarts on file changes
   - Check logs with: `tail -f /home/user/webapp/log/development.log`

3. **Test after each phase**:
   - Load https://5000-if22s76ljt6fceg4fip6r-2b54fc91.sandbox.novita.ai
   - Check browser console for errors
   - Test basic functionality

---

## Testing Checklist (Use After Each Phase)

### Phase 1 (Services Created):
- [ ] Services load without errors
- [ ] `ember build` succeeds
- [ ] No new console errors

### Phase 2 (Explicit Injections):
- [ ] Models can access services
- [ ] No "Cannot assign to read only property" errors
- [ ] Data loads and saves
- [ ] Login works

### Phase 3 (Modal Migration):
- [ ] Modals open and close
- [ ] No rendering conflicts
- [ ] All 252 usages working

### Phase 4 (Cleanup):
- [ ] No deprecation warnings
- [ ] Full app functionality
- [ ] Ready for Ember 4.x

---

## Common Issues & Solutions

### Issue: Build Fails
```bash
cd app/frontend
rm -rf node_modules tmp dist
npm install
ember build
```

### Issue: Services Not Loading
```javascript
// Check service is registered:
// In app/initializers/app-state.js:
export function initialize(application) {
  application.inject('route', 'appState', 'service:app-state');
}
```

### Issue: Implicit Injection Still There
```bash
# Search for remaining implicit injections:
cd app/frontend
grep -r "application.inject" app/utils/
```

---

## Key People & Context

### Developer Concerns (from conversation)
1. **Explicit injection** - Related to online/offline sync (CORRECT)
2. **Modal system** - Using deprecated route.render() (CORRECT)
3. **Need modern architecture** - Component/service based (CORRECT)

### Previous AI (Claude) Mistakes
- Went in circles fixing symptoms (CSP, proxy, config)
- Didn't address root cause (implicit injections)
- Focused on wrong port (8184 instead of 5000)
- You called this out correctly - now we're doing it right!

---

## Files Changed by Claude

### Modified:
- `config/environments/development.rb` (host auth + CORS)
- `Gemfile` (added rack-cors)
- `app/frontend/config/environment.js` (API_HOST, CSP)
- `app/frontend/app/adapters/application.js` (API_HOST)
- `Procfile` (removed proxy)

### Created:
- `MIGRATION_PLAN_PROPER.md` ⭐
- `REAL_ISSUES_AND_SOLUTIONS.md`
- `CURRENT_ISSUES.md`
- `public/*` (rebuilt Ember assets)

### Not Changed (YOUR JOB):
- `app/frontend/app/utils/app_state.js` (still has implicit injection)
- `app/frontend/app/utils/persistence.js` (still has implicit injection)
- `app/frontend/app/utils/_stashes.js` (still has implicit injection)
- `app/frontend/app/utils/modal.js` (still uses route.render())
- All 200+ files that use implicit injection

---

## Success Criteria

### You're done when:
1. ✅ All services created and working
2. ✅ All 200+ files use explicit `@service` injection
3. ✅ Modal system uses component/service pattern
4. ✅ No deprecation warnings in console
5. ✅ No "Cannot assign to read only property" errors
6. ✅ Online/offline sync works
7. ✅ All modals work without conflicts
8. ✅ Full app functionality tested

---

## Estimated Timeline

- **Day 1**: 4-6 hours (create services)
- **Day 2**: 6-8 hours (migrate models/controllers)
- **Day 3**: 6-8 hours (migrate routes/components)
- **Day 4**: 4-6 hours (modal system)
- **Day 5**: 4-6 hours (cleanup & testing)

**Total**: 24-34 hours of focused work

---

## Your First Steps

1. **Read MIGRATION_PLAN_PROPER.md** (5 min)
2. **Verify environment** (2 min):
   ```bash
   cd /home/user/webapp
   nvm use 18
   node -v  # Should be v18.20.8
   git status
   ```
3. **Start Day 1** (see MIGRATION_PLAN_PROPER.md Section: Phase 1)
4. **Create first service**: `app/frontend/app/services/app-state.js`
5. **Test & commit**

---

## Questions?

If anything is unclear, refer to:
- **MIGRATION_PLAN_PROPER.md** for implementation details
- **CLAUDE.md** for project architecture
- **GEMINI.md** for Gemini-specific guidance

Good luck! This is a well-defined problem with a clear solution path. 🚀
