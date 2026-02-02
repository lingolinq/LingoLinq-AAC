# LingoLinq: Zero Deprecation Implementation Plan

**Target**: Zero deprecation warnings, ready for Ember 4.x
**Current State**: Ember 3.28 LTS Baseline
**Created**: 2026-01-31

---

## Executive Summary

This plan provides a surgical approach to eliminate all remaining technical debt from the Ember 3.12 → 3.28 upgrade. The goal is to achieve a "Zero Deprecation" state that enables a clean upgrade path to Ember 4.x when ready.

### Current Deprecation Debt (Quantified)

| Issue | Count | Files | Blocks 4.0? | Priority |
|-------|-------|-------|-------------|----------|
| `sendAction()` calls | **66** | 28 | **YES** | CRITICAL |
| `style={{...}}` bindings | **168** | 81 | No (warning) | HIGH |
| Bower dependencies | **9 packages** | - | Indirect | HIGH |
| `.get()/.set()` calls | **11,590+** | 331 | No | LOW |
| jQuery imports | **85** | 85 | After 4.0 | DEFERRED |
| `EmberObject.extend` utils | **30** | 24 | No | LOW |
| `addObserver()` calls | **24** | 12 | No | LOW |

### Risk Assessment

```
CRITICAL (Blocks Ember 4.0):
├── sendAction() - 66 calls, WILL BREAK in 4.0

HIGH (Security/Maintenance):
├── style={{}} bindings - XSS warning, ~168 occurrences
└── Bower dependencies - Deprecated package manager, 9 packages

MEDIUM (Future-proofing):
├── .get()/.set() everywhere - 11,590+ calls
└── EmberObject.extend patterns - 30 utilities

LOW (Can defer):
└── jQuery removal - 85 files (safe until 4.0 with @ember/jquery)
```

---

## Phase 1: Infrastructure Setup (Day 1)

### 1.1 Install Deprecation Workflow

The [ember-cli-deprecation-workflow](https://github.com/ember-cli/ember-cli-deprecation-workflow) addon is essential for managing deprecation noise during the cleanup process.

```bash
cd app/frontend
npm install ember-cli-deprecation-workflow --save-dev
```

**Version Selection**: Use v3.x or v4.x which support Ember 3.28+

### 1.2 Generate Initial Deprecation Baseline

1. Start the test server:
   ```bash
   ember test --server
   ```

2. Navigate to http://localhost:7357/ and run in console:
   ```javascript
   deprecationWorkflow.flushDeprecations()
   ```

3. Copy output to `app/deprecation-workflow.js`

4. Additionally, manually test critical user flows to catch runtime-only deprecations:
   - Login/logout
   - Board navigation
   - Button interactions
   - Settings changes

### 1.3 Configure Strict Mode for New Code

Update `app/deprecation-workflow.js`:
```javascript
window.deprecationWorkflow.config = {
  throwOnUnhandled: true,  // Prevent new deprecations
  workflow: [
    // Existing deprecations will be listed here
  ]
};
```

---

## Phase 2: Surgical sendAction Removal (Days 2-4)

### 2.1 The Problem

`sendAction()` is **REMOVED in Ember 4.0**, not just deprecated. All 66 occurrences must be converted to closure actions.

**Pattern Change:**
```javascript
// OLD (sendAction)
this.sendAction('onSelect', value);

// NEW (closure action)
if (this.onSelect) {
  this.onSelect(value);
}
```

### 2.2 High-Priority Components (Most sendAction calls)

| Component | Calls | Impact |
|-----------|-------|--------|
| `subscription-form.js` | 8 | Payment flow |
| `audio-recorder.js` | 5 | Recording feature |
| `button-listener.js` | (in services) | Core AAC |
| `board-icon.js` | 5 | Board display |
| `user-select.js` | 4 | User management |
| `board-selection-tool.js` | 3 | Board editing |
| `stats/*` components | 20+ | Analytics |

### 2.3 Conversion Strategy

**Step 1: Convert Component JS**
```javascript
// Before: app/frontend/app/components/user-select.js
this.sendAction('select', user);
this.sendAction('cancel');

// After:
if (this.select) { this.select(user); }
if (this.cancel) { this.cancel(); }
```

**Step 2: Update Template Invocations**
```handlebars
{{!-- Before --}}
{{user-select select="handleSelect" cancel="handleCancel"}}

{{!-- After (closure action) --}}
{{user-select select=(action "handleSelect") cancel=(action "handleCancel")}}

{{!-- Or with @-prefixed arguments (recommended) --}}
<UserSelect @select={{this.handleSelect}} @cancel={{this.handleCancel}} />
```

### 2.4 File-by-File Conversion Checklist

```
[ ] app/frontend/app/components/subscription-form.js (8 calls)
[ ] app/frontend/app/components/audio-recorder.js (5 calls)
[ ] app/frontend/app/components/board-icon.js (5 calls)
[ ] app/frontend/app/components/user-select.js (4 calls)
[ ] app/frontend/app/components/stats/user-weeks.js (4 calls)
[ ] app/frontend/app/components/board-selection-tool.js (3 calls)
[ ] app/frontend/app/components/stats/data-filter.js (3 calls)
[ ] app/frontend/app/components/stats/core-list.js (3 calls)
[ ] app/frontend/app/components/grid-listener.js (3 calls)
[ ] app/frontend/app/services/content-grabbers.js (3 calls)
[ ] app/frontend/app/services/app-state.js (5 calls)
... (18 more files with 1-2 calls each)
```

### 2.5 Testing Each Conversion

After each component conversion:
1. Verify the component still renders
2. Test all actions fire correctly
3. Check parent components receive callbacks
4. Run related tests

---

## Phase 3: Style Binding Modernization (Days 5-7)

### 3.1 The Problem

`style={{...}}` bindings trigger XSS warnings and are deprecated. The 168 occurrences across 81 templates need to be converted.

### 3.2 Conversion Strategies

**Strategy A: CSS Classes (Preferred for static styles)**
```handlebars
{{!-- Before --}}
<div style="background-color: {{color}}; width: 100%;">

{{!-- After --}}
<div class="dynamic-bg" style={{this.safeStyle}}>
```

**Strategy B: htmlSafe Helper (For dynamic values)**
```javascript
// In component JS
import { htmlSafe } from '@ember/template';
import { computed } from '@ember/object';

export default Component.extend({
  safeStyle: computed('color', 'width', function() {
    return htmlSafe(`background-color: ${this.color}; width: ${this.width}px;`);
  })
});
```

**Strategy C: ember-style-modifier (Modern approach)**
```bash
npm install ember-style-modifier --save-dev
```
```handlebars
<div {{style backgroundColor=this.color width=this.width}}></div>
```

### 3.3 High-Volume Templates

| Template | Count | Notes |
|----------|-------|-------|
| `user-profile-log.hbs` | 12 | Heavy styling |
| `application.hbs` | 9 | App shell |
| `user/focus.hbs` | 8 | Focus feature |
| `highlight.hbs` / `highlight2.hbs` | 14 | Visual highlights |
| `board/index.hbs` | 6 | Board display |
| Various stats components | 25+ | Chart styling |

### 3.4 AI-Assisted Conversion Pattern

For each template with style bindings:

1. **Extract the dynamic values**
2. **Create computed property** returning `htmlSafe()` string
3. **Update template** to use `{{this.computedStyle}}`
4. **Test visual rendering**

---

## Phase 4: Bower Extraction (Days 8-10)

### 4.1 Current Bower Dependencies

```json
{
  "moment": "~2.9.0",           // CRITICAL: 6+ years old
  "tinycolor": "~1.1.2",        // Color manipulation
  "jquery-minicolors": "~2.1.10", // Color picker
  "bootstrap": "~3.3.2",        // UI framework
  "recordrtc": "*",             // Audio/video recording
  "IndexedDBShim": "*",         // DB polyfill
  "wordcloud2.js": "*",         // Word cloud viz
  "hammer-time": "*",           // Touch events (DISABLED)
  "qrcode-js": "*"              // QR code generation
}
```

### 4.2 Migration Strategy per Package

#### 4.2.1 Moment.js (CRITICAL - Security)

**Current**: `moment ~2.9.0` (2015!)
**NPM Package**: `moment` or `dayjs` (lighter)

```bash
# Option 1: Update moment via npm
npm install moment --save

# Option 2: Use ember-moment addon
npm install ember-moment --save-dev

# Option 3: Replace with dayjs (smaller bundle)
npm install dayjs --save
```

**ember-cli-build.js change:**
```javascript
// Remove:
app.import('bower_components/moment/moment.js');

// Add (if using raw moment):
// moment is auto-imported via ember-auto-import
```

#### 4.2.2 Bootstrap

**Current**: `bootstrap ~3.3.2`
**NPM Package**: `bootstrap@3` (for compatibility)

```bash
npm install bootstrap@3 --save-dev
```

**ember-cli-build.js:**
```javascript
// Remove:
app.import('bower_components/bootstrap/dist/css/bootstrap.min.css');
app.import('bower_components/bootstrap/dist/js/bootstrap.min.js');

// Add:
app.import('node_modules/bootstrap/dist/css/bootstrap.min.css');
app.import('node_modules/bootstrap/dist/js/bootstrap.min.js');
```

#### 4.2.3 RecordRTC

**NPM Package**: `recordrtc`

```bash
npm install recordrtc --save
```

**Usage with ember-auto-import:**
```javascript
import RecordRTC from 'recordrtc';
```

#### 4.2.4 IndexedDBShim

**NPM Package**: `indexeddbshim`

```bash
npm install indexeddbshim --save
```

#### 4.2.5 Wordcloud2

**NPM Package**: `wordcloud`

```bash
npm install wordcloud --save
```

#### 4.2.6 TinyColor

**NPM Package**: `tinycolor2`

```bash
npm install tinycolor2 --save
```

#### 4.2.7 jQuery Minicolors

**NPM Package**: `@aspect/jquery-minicolors` or similar

```bash
npm install jquery-minicolors --save
```

#### 4.2.8 QRCode

**NPM Package**: `qrcode` (more maintained)

```bash
npm install qrcode --save
```

### 4.3 Full Migration Steps

1. **Install all npm packages:**
   ```bash
   npm install moment bootstrap@3 recordrtc indexeddbshim wordcloud tinycolor2 jquery-minicolors qrcode --save
   ```

2. **Update ember-cli-build.js** to use node_modules instead of bower_components

3. **Add ember-auto-import if not present:**
   ```bash
   npm install ember-auto-import --save-dev
   ```

4. **Remove bower.json and bower_components/**:
   ```bash
   rm bower.json
   rm -rf bower_components
   ```

5. **Update package.json** to remove bower-related scripts if any

### 4.4 Verification

After migration:
- [ ] All CSS loads correctly
- [ ] All JS libraries functional
- [ ] No 404s in network tab
- [ ] Build succeeds
- [ ] App boots without errors

---

## Phase 5: Optional Modernization (Future)

### 5.1 `.get()/.set()` Removal (11,590+ calls)

This is a massive refactor. **Recommended approach**: Gradual migration as you touch files.

**Codemod available but limited:**
```bash
npx ember-native-class-codemod --type=services app/frontend/app/services
```

**Limitation**: Does not work on DS.Model subclasses.

**Manual pattern:**
```javascript
// Before
this.get('property')
this.set('property', value)

// After (with @tracked)
this.property
this.property = value
```

### 5.2 Native Class Conversion

Convert `EmberObject.extend({})` to native classes over time:

```javascript
// Before
import EmberObject from '@ember/object';
export default EmberObject.extend({
  foo: null,
  bar: computed('foo', function() {
    return this.get('foo') + 1;
  })
});

// After
import EmberObject from '@ember/object';
import { tracked } from '@glimmer/tracking';

export default class MyObject extends EmberObject {
  @tracked foo = null;

  get bar() {
    return this.foo + 1;
  }
}
```

### 5.3 jQuery Removal (85 files)

jQuery is safely usable in 3.28 via `@ember/jquery`. Plan removal for Ember 4.x preparation.

**Common replacements:**
```javascript
// jQuery: $(element).addClass('foo')
// Native: element.classList.add('foo')

// jQuery: $(element).find('.selector')
// Native: element.querySelector('.selector')

// jQuery: $.ajax(...)
// Ember: Use ember-ajax or fetch()
```

---

## Implementation Schedule

### Week 1: Critical Path

| Day | Focus | Expected Outcome |
|-----|-------|------------------|
| 1 | Infrastructure | deprecation-workflow installed, baseline captured |
| 2 | sendAction (batch 1) | 25 calls converted |
| 3 | sendAction (batch 2) | 25 calls converted |
| 4 | sendAction (batch 3) | 16 calls converted, all done |
| 5 | Style bindings (batch 1) | 50 bindings converted |

### Week 2: Cleanup & Extraction

| Day | Focus | Expected Outcome |
|-----|-------|------------------|
| 1 | Style bindings (batch 2) | 60 bindings converted |
| 2 | Style bindings (batch 3) | 58 bindings converted, all done |
| 3 | Bower → npm (core) | moment, bootstrap, tinycolor migrated |
| 4 | Bower → npm (extras) | recordrtc, wordcloud, qrcode migrated |
| 5 | Final testing | All deprecations resolved, bower removed |

---

## Verification Checklist

### Per-Change Verification
- [ ] App builds without errors
- [ ] No new console warnings
- [ ] Related tests pass
- [ ] Visual rendering correct
- [ ] User flow works end-to-end

### Final Verification
- [ ] `ember test` passes completely
- [ ] `ember build --environment=production` succeeds
- [ ] Console shows **zero** deprecation warnings
- [ ] All core features work:
  - [ ] Authentication
  - [ ] Board navigation
  - [ ] Button interactions
  - [ ] Speech output
  - [ ] Recording
  - [ ] Sync/offline
  - [ ] Settings

### Deprecation Workflow Check
```javascript
// In browser console
deprecationWorkflow.flushDeprecations()
// Should return empty array: []
```

---

## Rollback Strategy

### Before Starting
```bash
git checkout -b feature/zero-deprecation
git tag pre-zero-deprecation
```

### If Issues Arise
```bash
git stash
git checkout main
# or
git revert HEAD
```

### Incremental Commits
Commit after each component/file is successfully converted:
```bash
git commit -m "fix(sendAction): convert user-select to closure actions"
```

---

## Tools & Resources

### Official Ember Resources
- [Ember Deprecations Guide](https://deprecations.emberjs.com/v3.x/)
- [Ember 4.0 Release Notes](https://blog.emberjs.com/ember-4-0-released/)
- [Ember Upgrade Guide](https://guides.emberjs.com/release/upgrading/)

### Codemods (Use with Caution)
- [ember-native-class-codemod](https://github.com/ember-codemods/ember-native-class-codemod) - Limited DS.Model support
- [ember-modules-codemod](https://github.com/ember-codemods/ember-modules-codemod) - Last updated 6 years ago

### Addons
- [ember-cli-deprecation-workflow](https://github.com/ember-cli/ember-cli-deprecation-workflow)
- [ember-auto-import](https://www.npmjs.com/package/ember-auto-import)
- [ember-style-modifier](https://github.com/jelhan/ember-style-modifier)

### Community
- [Ember Discord](https://discord.gg/emberjs)
- [Ember Discuss Forum](https://discuss.emberjs.com/)

---

## Success Criteria

### Zero Deprecation State Achieved When:
- [ ] **0** `sendAction()` calls remain
- [ ] **0** unhandled style binding warnings
- [ ] **0** Bower dependencies
- [ ] deprecation-workflow reports empty array
- [ ] Production build succeeds with no warnings
- [ ] All tests pass
- [ ] App fully functional

### Future-Ready State:
- [ ] Ready for Ember 4.x upgrade
- [ ] jQuery removal path documented
- [ ] Native class migration strategy defined

---

## Appendix A: sendAction Locations

```
app/frontend/app/components/board-icon.js:5
app/frontend/app/components/board-selection-tool.js:3
app/frontend/app/components/board-canvas.js:1
app/frontend/app/components/video-recorder.js:1
app/frontend/app/components/stats/data-filter.js:3
app/frontend/app/components/stats/weighted-words.js:2
app/frontend/app/components/stats/ip-addresses.js:1
app/frontend/app/components/map-with-markers.js:1
app/frontend/app/components/grid-listener.js:3
app/frontend/app/components/user-select.js:4
app/frontend/app/components/share-bar.js:1
app/frontend/app/components/focus-input.js:2
app/frontend/app/components/stats/user-devices.js:1
app/frontend/app/components/stats/word-usage.js:1
app/frontend/app/components/stats/geo-locations.js:1
app/frontend/app/components/stats/lost-or-gained-words.js:1
app/frontend/app/components/stats/common-words.js:2
app/frontend/app/components/stats/core-list.js:3
app/frontend/app/components/stats/user-weeks.js:4
app/frontend/app/components/modal-dialog.js:1
app/frontend/app/components/triple-click-listener.js:1
app/frontend/app/components/audio-recorder.js:5
app/frontend/app/components/audio-browser.js:1
app/frontend/app/components/board-preview.js:1
app/frontend/app/components/badge-settings.js:1
app/frontend/app/components/subscription-form.js:8
app/frontend/app/services/content-grabbers.js:3
app/frontend/app/services/app-state.js:5
```

## Appendix B: Style Binding Templates (Top 20)

```
app/frontend/app/templates/components/user-profile-log.hbs:12
app/frontend/app/templates/application.hbs:9
app/frontend/app/templates/user/focus.hbs:8
app/frontend/app/templates/highlight.hbs:7
app/frontend/app/templates/highlight2.hbs:7
app/frontend/app/templates/board/index.hbs:6
app/frontend/app/templates/components/badge-progress.hbs:5
app/frontend/app/templates/modals/focus-words.hbs:5
app/frontend/app/templates/components/badge-earned.hbs:4
app/frontend/app/templates/inflections.hbs:3
app/frontend/app/templates/button-unbound.hbs:3
app/frontend/app/templates/button-stash.hbs:3
app/frontend/app/templates/button.hbs:3
app/frontend/app/templates/user/goals.hbs:3
app/frontend/app/templates/user/preferences.hbs:3
app/frontend/app/templates/goals/goal.hbs:2
app/frontend/app/templates/badge-awarded.hbs:2
app/frontend/app/templates/setup-footer.hbs:2
app/frontend/app/templates/trends.hbs:2
app/frontend/app/templates/index/authenticated.hbs:2
```

---

**Document Version**: 1.0
**Last Updated**: 2026-01-31
**Author**: AI-Assisted Technical Audit
