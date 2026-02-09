# Bug Fixes and Security Improvements

This document summarizes all the bug fixes and improvements made in this commit.

## Security Fixes

### 1. Cache Endpoint Security Bypass Fix
**File:** `app/controllers/api/boards_controller.rb`
**Issue:** The cache endpoint had redundant security checks that could potentially allow unauthorized access.
**Fix:** 
- Removed redundant `@api_user` check (line 62)
- Added explicit `@api_device_id` verification to ensure valid API access
- Improved security comments for clarity

### 2. Board Creation User Validation
**File:** `app/controllers/api/boards_controller.rb`
**Issue:** When `for_user_id` pointed to a non-existent user, the code silently defaulted to creating the board for the current user, which could allow boards to be created for unintended users.
**Fix:** Changed to return a 400 error with clear message when user is not found, preserving fail-safe behavior and making errors visible to API consumers.

## Frontend Security & Reliability Fixes

### 3. Login Followup Race Conditions
**File:** `app/frontend/app/components/login-form.js`
**Issue:** Multiple race conditions in `login_followup` action:
- Component could be destroyed during async operations
- Token polling could proceed even after component destruction
- Multiple redundant `sync_access_token()` calls with delays
- Inconsistent error state management

**Fix:**
- Added component destruction checks throughout promise chain
- Consolidated error state setting into `setErrorState` helper function
- Changed token polling to reject (instead of resolve) when token unavailable after max attempts
- Removed redundant multiple `sync_access_token()` calls
- Added timeout handle tracking for proper cleanup

### 4. Memory Leak in Button Listener
**File:** `app/frontend/app/components/button-listener.js`
**Issue:** jQuery event listener attached to window in `didInsertElement()` was never removed, causing memory leaks with component lifecycle cycles.
**Fix:** 
- Store resize handler reference in component property
- Remove event listener in `willDestroyElement()` using `$(window).off()`

### 5. Operator Precedence Bug
**File:** `app/frontend/app/components/board-icon.js`
**Issue:** Lines 106-107 used `&&` and `||` operators without proper grouping, causing unintended behavior when `board_record.get('key')` returned falsy values.
**Fix:** Explicitly check if `get` is a function before calling it: `(typeof board_record.get === 'function' && board_record.get('key')) || board_record.key`

## API & Adapter Fixes

### 6. Ajax Options Preservation
**File:** `app/frontend/app/adapters/application.js`
**Issue:** The `ajax` method override only set `type` and `url`, discarding other important properties like `headers`, `data`, `dataType`, etc.
**Fix:** Use `Object.assign` to merge all options properties while preserving existing configuration.

### 7. Ajax Authorization Header Fix
**File:** `app/frontend/app/adapters/application.js`
**Issue:** Calling `this._super()` bypassed the `$.ajax` override in `extras.js` that adds Authorization headers, causing 401 errors.
**Fix:** Reverted to directly calling `$.ajax(options)` to ensure the `extras.js` override is used for proper authentication.

### 8. String-Based Action Fallback
**File:** `app/frontend/app/components/grid-listener.js`
**Issue:** When `gridEvent` was a string, the code incorrectly hardcoded the action name to `'grid_event'`, breaking Ember's action routing.
**Fix:** Changed to use `this.sendAction(this.get('gridEvent'), ...)` which correctly uses the value of the `gridEvent` property as the action name, allowing Ember to route to the handler specified by the string value.

## Backend API Fixes

### 9. Double JSON Encoding
**File:** `app/controllers/session_controller.rb`
**Issue:** `render json: json.to_json` double-encoded JSON since `render json:` automatically calls `.to_json`.
**Fix:** Removed explicit `.to_json` calls, letting Rails handle JSON encoding automatically.

### 10. Unsafe .keys Call on Global Integrations
**File:** `app/controllers/session_controller.rb`
**Issue:** Code called `.keys` on `global_integrations` result without ensuring it was a Hash, potentially causing NoMethodError.
**Fix:** Added explicit nil check and Hash type verification before calling `.keys`, with proper error handling in rescue block.

### 11. Nil Check Before .match() Call
**File:** `app/controllers/api/search_controller.rb`
**Issue:** Called `.match()` on `b` variable before checking if it was nil, causing NoMethodError when `split()` returned only one element.
**Fix:** Added nil check: `if b && b.match(/^opensymbols/)` before calling `.match()`.

### 12. Ember Data "uncached" Warning
**File:** `app/controllers/api/boards_controller.rb`
**Issue:** `json['uncached'] = true` was set at root level, causing Ember Data to try parsing it as a model.
**Fix:** Moved to `json[:meta]['uncached'] = true` to follow JSON:API specification for metadata.

## Infrastructure Fixes

### 13. Procfile Node Version Installation
**File:** `Procfile`, `bin/ember-server`
**Issue:** The Procfile calls `bin/ember-server` for the ember process. If the script did not reliably set up Node 18 (e.g. when run under POSIX `sh`, `command -v nvm` can be false because `nvm` is a shell function), deployment could fail when the system Node version does not match Ember's requirements (Node 18).
**Fix:** Node 18 setup is handled inside `bin/ember-server`. The script sources nvm when available (from `$HOME/.nvm/nvm.sh` or `/usr/local/share/nvm/nvm.sh`) and immediately runs `nvm install 18 && nvm use 18` after sourcing, so Node 18 is used regardless of `command -v nvm` behavior in sh. The Procfile line remains `ember: bin/ember-server`; no shell escaping is required.

## Summary

- **Security Fixes:** 2 (cache endpoint, board creation validation)
- **Frontend Reliability:** 4 (race conditions, memory leaks, operator precedence, action routing)
- **API/Adapter Fixes:** 3 (options preservation, authorization, action fallback)
- **Backend API Fixes:** 4 (JSON encoding, nil checks, metadata structure)
- **Infrastructure:** 1 (Node version installation)

Total: 14 bug fixes addressing security, reliability, and API compatibility issues.
