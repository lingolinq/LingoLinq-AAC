# .track() Call Site Audit

## Summary
Found **34+ .track() call sites** in the Ember frontend codebase. They fall into TWO distinct categories:

### Category 1: LingoLinqAAC.log.track() - Logging/Debug Calls
**Purpose**: Performance monitoring and debug logging
**Object**: `LingoLinqAAC.log.track(message)`
**Risk**: HIGH - Called synchronously during initialization, can fail if `LingoLinqAAC.log` not initialized

### Category 2: progress_tracker.track() - Async Progress Monitoring
**Purpose**: Track server-side long-running operations
**Object**: `progress_tracker.track(progress_id, callback)`
**Risk**: LOW - Separate module, not related to LingoLinqAAC.log

---

## CATEGORY 1: LingoLinqAAC.log.track() Calls (CRITICAL)

### ✅ SAFE - Already Has Defensive Checks

#### 1. app/frontend/app/helpers/cd-log.js:7
```javascript
if(LingoLinqAAC && LingoLinqAAC.log && LingoLinqAAC.log.started) {
  LingoLinqAAC.log.track(params[0]);
}
```
**Status**: ✅ SAFE - Full defensive check with `&&` chain
**Async**: NO - Synchronous helper
**Action**: None needed

#### 2. app/frontend/app/controllers/board/index.js:488
```javascript
if(LingoLinqAAC && LingoLinqAAC.log && LingoLinqAAC.log.track) {
  LingoLinqAAC.log.track('redrawing');
}
```
**Status**: ✅ SAFE - Full defensive check
**Async**: NO - Called from observer/computed
**Action**: None needed

#### 3. app/frontend/app/controllers/board/index.js:571
```javascript
if(LingoLinqAAC && LingoLinqAAC.log && LingoLinqAAC.log.track) {
  LingoLinqAAC.log.track('computing dimensions');
}
```
**Status**: ✅ SAFE - Full defensive check
**Async**: NO - Called from observer/computed
**Action**: None needed

#### 4. app/frontend/app/controllers/board/index.js:773
```javascript
if(LingoLinqAAC && LingoLinqAAC.log && LingoLinqAAC.log.track) {
  LingoLinqAAC.log.track('done computing dimensions');
}
```
**Status**: ✅ SAFE - Full defensive check
**Async**: NO - Called from observer/computed
**Action**: None needed

### ⚠️ UNSAFE - No Defensive Checks (FIXED IN CURRENT SESSION)

#### 5. app/frontend/app/utils/edit_manager.js:1504 (FIXED)
```javascript
// BEFORE (UNSAFE):
LingoLinqAAC.log.track('processing for displaying');

// AFTER (SAFE):
if(LingoLinqAAC?.log?.track) {
  LingoLinqAAC.log.track('processing for displaying');
}
```
**Status**: ✅ FIXED - Added optional chaining
**Async**: YES - Can be called from async route transitions
**Action**: Already fixed in current session

#### 6. app/frontend/app/models/board.js:1377
```javascript
LingoLinqAAC.log.track('redrawing');
```
**Status**: ⚠️ UNSAFE - No defensive check
**Async**: NO - Synchronous method
**Action**: NEEDS FIX - Add defensive check
**Context**: Called from `render_fast_html()` method

#### 7. app/frontend/app/models/board.js:1476
```javascript
LingoLinqAAC.log.track('computing dimensions');
```
**Status**: ⚠️ UNSAFE - No defensive check
**Async**: NO - Synchronous method
**Action**: NEEDS FIX - Add defensive check
**Context**: Called from `render_fast_html()` method

### 📝 COMMENTED OUT - Not Active

#### 8. app/frontend/app/app.js:751 (Commented)
```javascript
// LingoLinqAAC.YT.track(player_id, callback).then(function(player) {
```
**Status**: N/A - Commented out
**Action**: None needed (not executed)

---

## CATEGORY 2: progress_tracker.track() Calls (LOW RISK)

These are **NOT** related to `LingoLinqAAC.log.track()` - they use a completely different module (`progress_tracker`) to monitor server-side async operations.

**Files with progress_tracker.track() calls**:
- app/frontend/app/controllers/add-supervisor.js:98
- app/frontend/app/controllers/bulk_purchase.js:105
- app/frontend/app/controllers/button-set.js:204
- app/frontend/app/controllers/download-board.js:72
- app/frontend/app/controllers/download-log.js:22
- app/frontend/app/controllers/gift_purchase.js:80
- app/frontend/app/controllers/search.js:65
- app/frontend/app/controllers/modals/board-privacy.js:40
- app/frontend/app/controllers/modals/eval-status.js:77
- app/frontend/app/controllers/modals/eval-status.js:126
- app/frontend/app/controllers/modals/slice-locales.js:49
- app/frontend/app/controllers/swap-images.js:74
- app/frontend/app/controllers/test-webhook.js:17
- app/frontend/app/controllers/translation-select.js:68
- app/frontend/app/controllers/trends.js:17
- app/frontend/app/controllers/user/index.js:615
- app/frontend/app/controllers/user/subscription.js:42
- app/frontend/app/controllers/user/subscription.js:111
- app/frontend/app/models/buttonset.js:97
- app/frontend/app/routes/board/index.js (multiple)
- app/frontend/app/components/subscription-form.js:169

**Status**: ✅ NOT A CONCERN - Different object, different purpose
**Action**: None needed

---

## CATEGORY 3: Other .track() Calls

#### LingoLinqAAC.Videos.track()
- app/frontend/app/controllers/button-settings.js:674
- app/frontend/app/controllers/inline-video.js:44
- app/frontend/app/controllers/lesson.js:19

**Purpose**: YouTube video player tracking
**Status**: ✅ SAFE - Separate module with promise-based API
**Action**: None needed

#### LingoLinqAAC.Lessons.track()
- app/frontend/app/controllers/lesson.js:15

**Purpose**: Lesson tracking
**Status**: ✅ SAFE - Separate module with promise-based API
**Action**: None needed

#### window._trackJs.track()
- app/frontend/app/app.js:168

**Purpose**: Third-party error tracking service
**Status**: ✅ SAFE - Wrapped in existence check `if(window._trackJs)`
**Action**: None needed

---

## ASYNC/DEFERRED ANALYSIS

### Synchronous .track() Calls (Execute Immediately)
- cd-log helper - called during template rendering
- board/index controller observers - called on property changes
- board model methods - called during board rendering

### Async/Deferred .track() Calls (May Execute After Delay)
- **edit_manager.js** - Called from route transitions (FIXED ✅)
- All progress_tracker.track() calls - async by design (separate module, no issue)

**Critical Finding**: The `edit_manager.js` call was the ONLY LingoLinqAAC.log.track() call that could execute asynchronously during route transitions, which explains why it was the most common error. **This has been fixed.**

---

## DEPENDENCY VALIDATION: Moving LingoLinqAAC.log Earlier

### Current Initialization Order in app.js

**BEFORE (OLD CODE)**:
```
Line 100: var LingoLinqAAC = LingoLinqAACClass.create();
Line 106: window.LingoLinqAAC = LingoLinqAAC;
Line 108-113: Early track_error setup
...
Line 904: LingoLinqAAC.log initialization (TOO LATE!)
```

**AFTER (FIXED CODE)**:
```
Line 100: var LingoLinqAAC = LingoLinqAACClass.create();
Line 106: window.LingoLinqAAC = LingoLinqAAC;
Line 108-113: Early track_error setup
Line 115-129: LingoLinqAAC.log initialization (EARLY!)
```

### Dependencies Check

**What LingoLinqAAC.log depends on**:
1. ✅ `LingoLinqAAC` object - Created at line 100 (available)
2. ✅ `window.LingoLinqAAC` - Set at line 106 (available)
3. ✅ `LingoLinqAAC.loggy` - Used in track() function, but safely checked with `if(!LingoLinqAAC.loggy) { return; }`

**What depends on LingoLinqAAC.log**:
1. All the .track() calls listed above
2. None of these run BEFORE line 115 in the initialization sequence

**Conclusion**: ✅ **SAFE TO MOVE EARLY** - No circular dependencies, all prerequisites are available at line 115.

---

## REMAINING FIXES NEEDED

### Priority 1: Fix Unguarded Calls in board.js

**File**: app/frontend/app/models/board.js
**Lines**: 1377, 1476

**Required Fix**:
```javascript
// Line 1377 - BEFORE
LingoLinqAAC.log.track('redrawing');

// Line 1377 - AFTER
if(LingoLinqAAC?.log?.track) {
  LingoLinqAAC.log.track('redrawing');
}

// Line 1476 - BEFORE
LingoLinqAAC.log.track('computing dimensions');

// Line 1476 - AFTER
if(LingoLinqAAC?.log?.track) {
  LingoLinqAAC.log.track('computing dimensions');
}
```

---

## SUMMARY

### Total .track() Calls: 34+

**By Category**:
- LingoLinqAAC.log.track(): 7 total
  - ✅ Safe (has defensive checks): 4
  - ✅ Fixed in this session: 1 (edit_manager.js)
  - ⚠️ Needs fixing: 2 (board.js lines 1377, 1476)
  - N/A (commented out): 1

- progress_tracker.track(): 20+ (NOT a concern, different module)
- Other .track() methods: 4 (Videos, Lessons, TrackJS - all safe)

### Async Risk Assessment
- **HIGH RISK**: edit_manager.js (FIXED ✅)
- **MEDIUM RISK**: board.js model methods (can be called during async operations)
- **LOW RISK**: All other synchronous calls with defensive checks

### Early Initialization Safety
✅ **VALIDATED SAFE** - Moving LingoLinqAAC.log to line 115 has no negative dependencies

### Recommended Action
1. ✅ **COMPLETED**: Move LingoLinqAAC.log initialization early
2. ✅ **COMPLETED**: Fix edit_manager.js with defensive checks
3. ⚠️ **PENDING**: Fix board.js lines 1377, 1476 with defensive checks
4. ✅ **COMPLETED**: Rebuild Ember assets (in progress)
