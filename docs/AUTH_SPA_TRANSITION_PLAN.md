# Auth SPA Transition — Engineering Plan & Decision Record

**Status:** Proposed (not yet implemented)
**Phase:** [`.planning/phases/01-auth-spa-transition/`](../.planning/phases/01-auth-spa-transition/)
**Author:** Drafted in collaboration during the styling-updates branch work
**Date drafted:** 2026-04-25
**Related work:** Boot overlay + pre-reload overlay already shipped on `traci/styling/styling-updates` ([app/frontend/app/index.html](../app/frontend/app/index.html), [app/frontend/app/instance-initializers/boot-overlay-hide.js](../app/frontend/app/instance-initializers/boot-overlay-hide.js), [app/frontend/app/components/login-form.js](../app/frontend/app/components/login-form.js))

---

## Table of Contents

1. [TL;DR](#tldr)
2. [Background — what's happening today and why it's a problem](#background)
3. [The decision and why we're making it](#the-decision)
4. [What changes — file-by-file](#what-changes--file-by-file)
5. [What the new method accomplishes that the old method did not](#what-the-new-method-accomplishes-that-the-old-method-did-not)
6. [What the new method explicitly does NOT change](#what-the-new-method-explicitly-does-not-change)
7. [Risk register and mitigations](#risk-register-and-mitigations)
8. [Testing plan](#testing-plan)
9. [Rollout plan](#rollout-plan)
10. [Rollback plan](#rollback-plan)
11. [Future follow-ups](#future-follow-ups)

---

## TL;DR

Today, after a successful login the app does `window.location.assign('/')`, and after sign-out it does `window.location.href = '/'`. Both calls trigger a full browser navigation — the page unloads, the browser shows a blank/white frame while it fetches and re-parses the document, and Ember boots from scratch. That blank frame is the white-screen FOUC users see during auth events.

This phase replaces those two calls with `router.transitionTo(...)` — Ember's in-app navigation primitive. The same Ember instance keeps running; the URL changes; the destination route renders. There is no browser navigation, so there is no white frame to mask.

The change is **gated behind a feature flag** (`auth_spa_transition`, default OFF) and **falls back to the existing reload behavior on any error**. The intent is that during a multi-week soak period, only opted-in test accounts use the new path; if anything goes wrong, the flag is flipped OFF without a frontend deploy.

The auth flow itself does not change. The token negotiation, COPPA/2FA/OAuth variants, "trust this device" logic, and force-logout paths all remain identical. What changes is *only* the final step of "how do we get the user to the dashboard / login page after auth state has been updated."

The styling work (boot overlay, pre-reload overlay) shipped on this branch is **not removed** — it continues to cover the fallback reload path for users who don't have the feature flag enabled.

---

## Background

### What happens today on login

Trace (from [login-form.js:300-407](../app/frontend/app/components/login-form.js#L300-L407)):

1. User submits credentials. The `authenticate` action calls `session.authenticate(data)`, which hits the backend auth endpoint.
2. On success, control flows to `login_success(reload=true)`.
3. The handler stores the token, then chains a promise: `stashes.flush()` → `stashes.setup()` → `appState.refresh_session_user()` (which calls `LingoLinq.store.findRecord('user', 'self')` to fetch the current user).
4. Once that promise resolves, it calls `location.assign('/')`. This is a full browser navigation.
5. The browser unloads the document. Everything in memory (services, store, observers) is destroyed.
6. The browser fetches `/`, parses the HTML head (which is render-blocking on `vendor.css` + `frontend.css`), and during this window it shows blank/white.
7. Once the head is parsed, the browser paints the inline boot overlay we added on this branch.
8. Ember boots, the index route runs, sees the auth token, and `replaceWith('user.home', user_name)` redirects to the dashboard.
9. The boot overlay is dismissed by the `boot-overlay-hide` instance initializer once `routeDidChange` fires for the destination.

The white-screen flash users see is steps 5–6.

### What happens today on sign-out

Trace (from [services/session.js:563-597](../app/frontend/app/services/session.js#L563-L597)):

1. User clicks Sign Out. The action handler calls `session.invalidate(true)`.
2. The handler flushes stashes, clears auth state on the session service and `capabilities.access_token`, then calls `_this.reload('/')`.
3. `session.reload('/')` does `location.href = '/'` for web (non-installed-app) clients.
4. The browser unloads the dashboard. Same blank-white window as login.
5. The browser loads `/`, the index route runs, sees no auth token, renders the login form.

Same root cause as login.

### Why was it done this way?

The comment at [login-form.js:384-387](../app/frontend/app/components/login-form.js#L384-L387) explains:

> *Web: use full page reload after login (same approach as installed app). Client-side transition was unreliable: on index route `transitionTo('index')` is a no-op, and the dashboard only shows when `appState.currentUser` is set by `refresh_session_user`. A reload guarantees session restore from localStorage and clean dashboard load.*

This is documenting **a debt**, not a fundamental constraint. The three issues listed are all solvable:

| Reported issue | Why it happened | Why it's solvable |
|---|---|---|
| `transitionTo('index')` was a no-op | When already on `index`, transitioning to `index` doesn't re-run the route | Transition to `user.home` directly with the username — the route hierarchy doesn't care that you came from `index` |
| Dashboard requires `appState.currentUser` | If you transition before `refresh_session_user` resolves, the dashboard renders with no user | Wait for `refresh_session_user` to resolve before transitioning. The code already does this — the `wait` promise at [login-form.js:347](../app/frontend/app/components/login-form.js#L347) is exactly that guarantee. We just need to chain `.then(transitionTo)` instead of `.then(reload)` |
| "Reload guarantees session restore from localStorage" | The author was worried in-memory `session` state wouldn't reflect the new auth | The code already calls `session.restore()` and explicitly sets `isAuthenticated`, `access_token`, `user_name`, `user_id` at lines [335-338](../app/frontend/app/components/login-form.js#L335) and [363](../app/frontend/app/components/login-form.js#L363). A reload does nothing additional that those calls don't already do |

So the reload was a workaround chosen under pressure. It works, but it imports browser-navigation behavior into an SPA — and that browser-navigation behavior is what produces the white screen.

### Why we're solving it now

1. The new styling on this branch has made the FOUC visible and visceral — the previous styling was less differentiated, so the flash was easier to ignore. With the new styled login + dashboard, the contrast between "before reload" and "after reload" makes the transition feel broken.
2. AAC users are sensitive to unexpected UI changes. A jarring transition feels like a bug.
3. Every other production SPA does this — Gmail, Slack, Linear, Stripe Dashboard. The pattern is well-understood and the path is well-trodden.
4. The patches we've applied (boot overlay, pre-reload overlay) are workarounds for the workaround. They mask symptoms but don't solve the cause. Each new flow that does `location.reload()` becomes a new white-screen bug to remember.

---

## The decision

### Decision: replace the two auth-event reloads with SPA transitions, gated behind a feature flag.

### Considered alternatives

| Approach | Pro | Con | Verdict |
|---|---|---|---|
| **Keep current reload + boot overlay** (status quo on this branch) | No risk to auth flow, already shipped | Treadmill: every new `location.reload` site becomes a new white-screen bug. Doesn't fix the cause. Doesn't help Firefox/Safari users. | Acceptable patch, not a solution |
| **Service Worker app shell** | Industry-standard, masks all navigations including non-auth ones | Significant new infrastructure, requires PWA setup, cache versioning concerns, mobile/installed-app interaction | Strong candidate as a future phase, but heavier than needed for the immediate problem |
| **Inline critical CSS + async stylesheets** | Solves the render-blocking CSS portion of the gap | Doesn't solve the underlying "we full-reload on auth" pattern. Adds FOUC risk surface for the rest of the app. | Rejected — fixes a symptom of a symptom |
| **SPA transitions on auth events** (this proposal) | Eliminates the cause. Aligns with the SPA architecture the codebase is already using everywhere else. Standard solution in modern web apps. | Requires explicit per-user state cleanup that the page reload was doing implicitly. Carries auth regression risk. | **Selected, gated by feature flag** |

### Why we chose this

The white-screen flash is a symptom of using browser navigation for what should be in-app state changes. Every patch that doesn't address that root cause leaves us treating each new symptom site as a new bug. SPA transitions make the symptom impossible because there is no browser navigation to mask.

The auth-regression risk is real but contained by:
- Defaulting the feature flag OFF
- Falling back to reload on any error in the new path
- Explicit, audited state cleanup
- Multi-week soak at low rollout percentage
- Manual bug-bash before promoting to all users

---

## What changes — file-by-file

### 1. `lib/feature_flags.rb`

Register a new frontend feature flag.

```ruby
# Add to AVAILABLE_FRONTEND_FEATURES
'auth_spa_transition' => {
  description: 'Use Ember router transitions for login and sign-out instead of full page reloads',
  added: '2026-XX',
  default: false
}
```

The flag is **frontend-readable** so the JS code can check it. **Not** added to `ENABLED_FRONTEND_FEATURES` initially — it stays opt-in until rollout begins.

### 2. `app/frontend/app/components/login-form.js`

Replace the web `else` branch in the `login_success` action ([currently lines 383-407](../app/frontend/app/components/login-form.js#L383-L407)).

**Before** (current — ships unchanged on the OFF path):
```js
} else {
  // Web: use full page reload after login (same approach as installed app).
  var reloadDone = false;
  var doReload = function() {
    if(reloadDone || _this.isDestroyed || _this.isDestroying) { return; }
    reloadDone = true;
    if(_this.get('return')) {
      _this.session.set('return', true);
    }
    _loginDebug('Web: reloading to dashboard');
    location.assign('/');
  };
  wait.then(doReload, function(err) {
    if(_this.isDestroyed || _this.isDestroying) { return; }
    console.warn('[login_success] User fetch failed, reloading anyway', err);
    doReload();
  });
  var timeoutPromise = new RSVP.Promise(function(resolve) { runLater(resolve, 6000); });
  RSVP.race([wait, timeoutPromise]).then(doReload, function() { doReload(); });
}
```

**After:**
```js
} else {
  var spaTransitionEnabled = _this.appState.feature_flag('auth_spa_transition');

  var reloadDone = false;
  var doReload = function() {
    if(reloadDone || _this.isDestroyed || _this.isDestroying) { return; }
    reloadDone = true;
    if(_this.get('return')) {
      _this.session.set('return', true);
    }
    _loginDebug('Web: reloading to dashboard');
    location.assign('/');
  };

  var doTransition = function() {
    if(reloadDone || _this.isDestroyed || _this.isDestroying) { return; }
    reloadDone = true;
    var username = _this.appState.get('sessionUser.user_name');
    if(!username) {
      _loginDebug('SPA transition: no username after wait, falling back to reload');
      reloadDone = false;
      return doReload();
    }
    try {
      _loginDebug('SPA transition: transitioning to user.home', { username: username });
      _this.router.transitionTo('user.home', username).then(null, function(err) {
        console.warn('[login_success] SPA transition rejected, falling back to reload', err);
        reloadDone = false;
        doReload();
      });
    } catch(err) {
      console.warn('[login_success] SPA transition threw, falling back to reload', err);
      reloadDone = false;
      doReload();
    }
  };

  var doNext = spaTransitionEnabled ? doTransition : doReload;

  wait.then(doNext, function(err) {
    if(_this.isDestroyed || _this.isDestroying) { return; }
    console.warn('[login_success] User fetch failed, reloading', err);
    doReload();
  });
  var timeoutPromise = new RSVP.Promise(function(resolve) { runLater(resolve, 6000); });
  RSVP.race([wait, timeoutPromise]).then(doNext, function() { doReload(); });
}
```

**What this does:**
- When the flag is OFF: behavior is byte-for-byte identical to today.
- When the flag is ON: after the same `wait` promise resolves (which guarantees `appState.sessionUser` is populated), `router.transitionTo('user.home', username)` is called instead of `location.assign('/')`.
- ANY error in the new path — promise rejection, exception, missing username — falls back to `doReload()`.
- The 6-second timeout fallback still applies. If the user fetch hangs, it falls back to whichever `doNext` is active.

The pre-reload overlay we added at [login-form.js:345-372](../app/frontend/app/components/login-form.js#L345-L372) **continues to be injected**. On the SPA path it's harmlessly visible during the `wait` window and gets unmounted automatically when the destination route replaces the login form. On the fallback reload path it works as it does today.

### 3. `app/frontend/app/services/session.js`

Replace the body of `invalidate(force)` ([currently lines 563-597](../app/frontend/app/services/session.js#L563-L597)) with a feature-flag-gated branch.

**Before:**
```js
invalidate: function(force) {
  var _this = this;
  var full_invalidate = force || !!(this.appState.get('currentUser') || this.stashes.get_object('auth_settings', true) || this.auth_settings_fallback());
  if(full_invalidate) {
    if(window.navigator.splashscreen) {
      window.navigator.splashscreen.show();
    }
  }
  this.stashes.flush().then(null, function() { return RSVP.resolve(); }).then(function() {
    _this.stashes.setup();
    var later = function(callback, delay) { callback(); };
    if(!isTesting()) { later = runLater; }
    later(function() {
      _this.set('isAuthenticated', false);
      _this.set('access_token', null);
      _this.set('user_name', null);
      _this.set('user_id', null);
      _this.set('as_user_id', null);
      if(capabilities) { capabilities.access_token = null; }
      if(full_invalidate) {
        later(function() { _this.reload('/'); });
      }
    });
  });
}
```

**After:**
```js
invalidate: function(force) {
  var _this = this;
  var full_invalidate = force || !!(this.appState.get('currentUser') || this.stashes.get_object('auth_settings', true) || this.auth_settings_fallback());
  if(full_invalidate) {
    if(window.navigator.splashscreen) {
      window.navigator.splashscreen.show();
    }
  }
  var spaTransitionEnabled = full_invalidate && this.appState && typeof this.appState.feature_flag === 'function' && this.appState.feature_flag('auth_spa_transition') && !capabilities.installed_app;

  this.stashes.flush().then(null, function() { return RSVP.resolve(); }).then(function() {
    _this.stashes.setup();
    var later = function(callback, delay) { callback(); };
    if(!isTesting()) { later = runLater; }
    later(function() {
      _this.set('isAuthenticated', false);
      _this.set('access_token', null);
      _this.set('user_name', null);
      _this.set('user_id', null);
      _this.set('as_user_id', null);
      if(capabilities) { capabilities.access_token = null; }

      if(full_invalidate) {
        if(spaTransitionEnabled) {
          // Explicitly clear all per-user state that the page reload was implicitly handling.
          try {
            if(_this.appState && typeof _this.appState.clear_user_state === 'function') {
              _this.appState.clear_user_state();
            }
            if(LingoLinq && LingoLinq.store && typeof LingoLinq.store.unloadAll === 'function') {
              LingoLinq.store.unloadAll();
            }
            // Reset 3rd-party SDK user attribution
            if(typeof window !== 'undefined' && window.Sentry && typeof window.Sentry.setUser === 'function') {
              window.Sentry.setUser(null);
            }
            // Add other SDK resets here as enumerated during implementation audit.
            var router = _this.appState && _this.appState.get && _this.appState.get('router');
            if(router && typeof router.transitionTo === 'function') {
              router.transitionTo('index').then(null, function(err) {
                console.warn('[session.invalidate] SPA transition rejected, falling back to reload', err);
                later(function() { _this.reload('/'); });
              });
              return;
            }
            // Router not available — fall through to reload
            console.warn('[session.invalidate] Router unavailable for SPA transition, reloading');
          } catch(err) {
            console.warn('[session.invalidate] SPA transition threw, falling back to reload', err);
          }
        }
        later(function() { _this.reload('/'); });
      }
    });
  });
}
```

**What this does:**
- When the flag is OFF or installed app: behavior is byte-for-byte identical to today.
- When the flag is ON (web only): explicitly clears per-user state, calls `router.transitionTo('index')`. The new index route renders the login form (because no user is authenticated).
- ANY error — exception, transition rejection, missing router — falls back to the existing `_this.reload('/')`.
- The installed app is forced to keep the reload path because the Cordova/Capacitor splashscreen integration relies on it.

### 4. `app/frontend/app/services/app-state.js` — new method

Add a `clear_user_state()` method that nulls every per-user property the service tracks. This is the explicit version of what the page reload was implicitly doing by destroying the entire service.

```js
clear_user_state: function() {
  this.set('sessionUser', null);
  this.set('currentUser', null);
  this.set('referenced_speak_mode_user', null);
  this.set('speakModeUser', null);
  this.set('modeling_for_self', null);
  this.set('currentBoardState', null);
  this.set('already_homed', false);
  this.set('logging_in', false);
  // Enumerate during implementation audit — start with grep for `this.set('` in app-state.js
  // and identify which keys are user-scoped vs. app-scoped.
}
```

The implementer is responsible for auditing `app-state.js` and ensuring every per-user property is included. The grep target is `this.set('` in [services/app-state.js](../app/frontend/app/services/app-state.js) and a manual classification of each into "user-scoped" vs. "app-scoped."

### 5. `app/frontend/app/utils/persistence.js` — audit

Walk this file and identify any in-memory caches keyed by the current user that need clearing on sign-out. Likely candidates:
- The internal `find_changed` queue
- Any `users[user_id]` keyed cache
- Modeling session state
- Online-status retry state

Add a `clear_user_state()` method to `persistence` if needed and call it from `session.invalidate` alongside the others.

### 6. Tests

#### Backend
No backend tests need to change. The feature flag declaration in `lib/feature_flags.rb` may need a spec entry depending on existing patterns — check `spec/lib/feature_flags_spec.rb`.

#### Frontend
Add Ember tests in `app/frontend/tests/`:
- A controller test for `controllers/login` exercising `login_success` with the flag both OFF and ON, asserting `transitionTo` vs. `location.assign` is called appropriately. Mock the router and the `wait` promise.
- A service test for `services/session` exercising `invalidate` with the flag both OFF and ON, asserting state cleanup happens before the transition.

Both tests must mock `location.assign` / `location.href` to avoid actually navigating during test runs. The existing tests almost certainly already do this — pattern-match.

---

## What the new method accomplishes that the old method did not

This is the heart of the change. Each row is something the new method does that the old method couldn't — *because* the old method tore down the whole app instance.

| Capability | Old method (`location.assign('/')`) | New method (`router.transitionTo`) |
|---|---|---|
| **Visual continuity** | Browser unloads document → blank/white frame while new HTML+CSS loads → new app boots → destination renders. White-screen FOUC. | Same Ember instance. The destination route renders in place. No browser navigation, no frame loss. |
| **First Contentful Paint cost** | Pays full FCP cost again (HTML parse + render-blocking CSS + script execution + Ember boot). Typically 200–800ms even with cached assets. | Zero. The user is already on a painted page; the route swap is a DOM diff. |
| **Animation continuity** | Impossible — the DOM is destroyed mid-animation. Any in-progress fade, slide, or transition is interrupted. | Possible — Ember's transitionTo can integrate with View Transitions API (future work) for crossfades. |
| **State preservation between routes** | Impossible — the store is empty after reload, so cached records (boards, supervisors, recent activity) must be re-fetched. | Possible — Ember Data store survives. We *choose* to clear user-specific records on sign-out, but on login the records loaded during auth fetch (e.g. supervisor list, starred boards) carry into the dashboard with no re-fetch. |
| **Network cost on auth** | All assets (vendor.js, frontend.js, vendor.css, frontend.css, fonts) re-validated against the cache. Even with 304s, this is several round-trips. | Zero. No new network requests issued by the navigation itself. |
| **Memory cleanup discipline** | Implicit — the GC collects the old Ember instance, the store, all observers. Sloppy code can rely on this. | Explicit — `store.unloadAll()`, `appState.clear_user_state()`, SDK resets. **This is the cost of the change.** Forces us to actually own per-user state, which is a long-term win. |
| **Observability** | Reload events are invisible in app analytics — they look like a fresh session start. Hard to correlate "user signed in" with subsequent behavior. | Single Ember instance means analytics see a continuous session: "user submitted login → arrived at dashboard." Better funnel data. |
| **Error context after auth failures** | Console / Sentry breadcrumbs are wiped on reload. Debugging "what happened just before the bad login" is hard. | Breadcrumbs survive. Easier to debug auth issues post-hoc. |
| **Behavior under flaky networks** | If the new page's `<head>` CSS stalls, the user is stuck on a white screen with no controls. | If `transitionTo` itself stalls, the existing pre-reload overlay covers the page. The user sees a loading state, not a blank canvas. |
| **Correctness on browser back-button** | After login-via-reload, hitting Back goes to the login URL with valid auth — confusing UX. | The router controls history; we can `replaceWith` instead of `transitionTo` to keep Back behavior coherent. |

The new method's main *cost* is the explicit state-cleanup discipline (the "Memory cleanup discipline" row). That cost is paid once during this phase — the audit of per-user state in `app-state.js` and `persistence.js` — and forever after, the codebase has a documented inventory of per-user state, which is independently valuable.

---

## What the new method explicitly does NOT change

Listed exhaustively so reviewers can verify scope.

- **Auth API contract.** No request payload, response, header, or status-code handling changes. The token is obtained, stored, and attached to subsequent requests exactly as it is today.
- **Stash flushing.** `stashes.flush()` and `stashes.setup()` are called in the same order with the same arguments.
- **Session restoration on cold load.** When the app boots cold (page reload, fresh tab), `session.restore()` runs exactly as today. Nothing about how an existing token is read from `localStorage` changes.
- **Splashscreen integration.** `window.navigator.splashscreen.show()` calls remain in place. The installed app continues to use the reload path entirely.
- **`isTesting()` gating.** All paths that no-op during tests continue to no-op. The new SPA-transition path also no-ops in tests because `_this.router.transitionTo` is mocked or test-only routes are used.
- **The boot overlay** ([app/frontend/app/index.html](../app/frontend/app/index.html)).
- **The pre-reload overlay** ([app/frontend/app/components/login-form.js:345-372](../app/frontend/app/components/login-form.js#L345-L372)).
- **The `boot-overlay-hide` instance initializer** ([app/frontend/app/instance-initializers/boot-overlay-hide.js](../app/frontend/app/instance-initializers/boot-overlay-hide.js)).
- **Any SCSS file.** Verifiable: `git diff main -- '*.scss'` returns empty after this phase.
- **Any HBS template.** Verifiable: `git diff main -- '*.hbs'` returns empty after this phase.
- **The `force_logout` flow** ([services/session.js:545](../app/frontend/app/services/session.js#L545)). It still calls `invalidate(true)`. The behavior of `invalidate` is what changes; the call site doesn't.
- **Other `location.reload` sites** — locale change, subscription update, masquerade, eval-status. Out of scope.
- **The COPPA, 2FA, OAuth, and "trust this device" auth flows.** They negotiate auth state exactly as today; only the final navigation step changes.

---

## Risk register and mitigations

| ID | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R1 | Login auth bug introduced by SPA path | Low | High | Feature flag default OFF; fallback to reload on any error; opt-in test accounts soak ≥ 2 weeks before any rollout |
| R2 | Stale Ember Data records leak between users (User A's boards visible to User B after sign-out and re-login as B) | Medium | High | Explicit `store.unloadAll()` on sign-out. Test: log in as A, log out, log in as B, inspect store — assert no A records |
| R3 | In-flight request initiated by User A resolves after sign-out and writes to store | Medium | Medium | Audit network-handler grep for `currentUser`-touching writes; add `if(!appState.currentUser) return;` guards. Also covered by `store.unloadAll()` since the records have nowhere to land |
| R4 | Observer or computed property assumes `currentUser` is non-null and throws on sign-out | Medium | Medium | Audit `app-state.js` for observers/computeds keyed on `currentUser`. Test: sign out from various pages, check console for errors |
| R5 | 3rd-party SDK keeps old user attribution after sign-out (Sentry, analytics) | High | Low | Enumerate SDKs during implementation; explicit `reset()` / `setUser(null)` calls. Verifiable in network requests post-sign-out |
| R6 | Test suite breaks because tests mock `location.assign` but not `router.transitionTo` | High | Low | Update tests to mock both; add explicit assertions on which path was taken |
| R7 | Visual regression — overlay no longer covers a flow it used to | Low | Medium | E2E with flag OFF asserts current behavior unchanged. Manual check with flag ON. |
| R8 | Browser back-button after sign-out goes to dashboard URL with no auth | Low | Low | Use `replaceWith('index')` instead of `transitionTo('index')` on sign-out so the dashboard URL is removed from history |
| R9 | Race between `wait` promise and 6-second timeout causes double-transition | Low | Low | Existing `reloadDone` guard prevents double-reload; same pattern protects double-transition (the `reloadDone` flag is set by both paths) |
| R10 | Mid-rollout flag flip causes a user mid-login to switch paths | Low | Low | Cache flag value at session start, don't re-check during a single auth transaction |

---

## Testing plan

### Pre-merge automated tests

- **ESLint clean** on all changed JS files.
- **Frontend unit tests** for `controllers/login` and `services/session` covering:
  - Flag OFF → `location.assign` / `location.href` called, `transitionTo` not called
  - Flag ON, success path → `transitionTo` called with correct args, `location.assign` not called
  - Flag ON, transition rejection → fallback `location.assign` called
  - Flag ON, timeout race → fallback `location.assign` called
  - Sign-out flag ON → `store.unloadAll`, `clear_user_state`, `transitionTo('index')` all called in order
- **Backend unit tests** for the new feature flag entry in `lib/feature_flags.rb`.
- **Full test suite** — `bundle exec rspec` and `cd app/frontend && ember test` both pass.

### Pre-merge manual smoke tests (flag OFF)

With the feature flag forced OFF for a logged-in test account, run a clean login and sign-out. Verify behavior is byte-identical to today:
- White-screen still occurs (we have not regressed the OFF path)
- Pre-reload overlay still shows
- Boot overlay still covers post-reload boot
- `routeDidChange`-gated dismissal still works

This is the regression test for the "no styling regressions" requirement.

### Pre-rollout bug-bash (flag ON)

Run all of the following in a fresh browser session with the flag forced ON:

1. Standard login (web) → dashboard
2. Standard sign-out → login page
3. Login → switch supervisor target → sign out → login as different user (verify no User A data visible)
4. Login → expired session API call → force_logout → login again
5. Login → close browser → reopen → still authenticated (session restore unchanged)
6. Login with bad credentials → error message shown, no transition
7. Login + 2FA flow
8. Login + COPPA flow
9. Login + "Trust this device" follow-up
10. Login + "Shared device" follow-up
11. Login while offline (should fail gracefully, no transition)
12. Sign-out while offline (should still clear local state, transition to index)
13. Reload mid-login (browser refresh during the auth API call) — verify no auth corruption
14. Repeat 1–4 in Chrome, Firefox, Safari, Edge
15. Repeat 1–4 in installed app — confirm reload path is still used (flag OFF override for installed app)
16. Repeat 1–4 in browserless / OAuth path — confirm whichever path is used per the implementation

### Soak

Minimum 2 weeks at 5% rollout before considering wider rollout. Watch:
- Sentry / Bugsnag for any new error patterns from `services/session.js`, `components/login-form.js`, `services/app-state.js`
- Support inbox for "I can't sign in" / "It's frozen" reports
- Analytics for any drop in successful-login rate

---

## Rollout plan

| Stage | Flag state | Population | Duration | Exit criterion |
|---|---|---|---|---|
| 0 — Merged behind flag | OFF for all | All users | Until stage 1 | Code merged, automated tests pass, OFF-path manual smoke clean |
| 1 — Internal opt-in | ON for opted-in test accounts only | ~5–10 internal users | ≥ 1 week | Bug-bash variants R7+R8 all green; zero auth-related errors in test accounts |
| 2 — Beta cohort | ON for users in `beta_features` org | ~5% of users | ≥ 2 weeks | Zero auth-related Sentry reports attributable to the change; no support inbox reports |
| 3 — Half rollout | ON for 50% of users | ~50% | ≥ 1 week | Sentry rate for sign-in flow no higher than control; no support escalation |
| 4 — Full rollout | ON by default | 100% | — | — |
| 5 — Cleanup | Flag removed, OFF path code deleted | — | After ≥ 4 weeks at full rollout with no incidents | Flag has been at 100% for ≥ 4 weeks without rollback. Then a follow-up phase removes the dead code. |

The flag flip between stages is a single-line change in `lib/feature_flags.rb` plus a backend deploy. No frontend deploy is required to roll back.

---

## Rollback plan

If a regression is reported at any stage:

1. **Immediate**: flip `auth_spa_transition` to OFF for all users in `lib/feature_flags.rb`. Backend deploy. Affected users get the reload path on their next auth event. Worst-case latency: their current session continues unaffected; their next sign-in or sign-out uses the old path.
2. **Diagnose**: review Sentry breadcrumbs. Because the new path keeps the Ember instance alive, breadcrumbs from the failed flow are preserved (a benefit highlighted earlier).
3. **Fix forward** if the issue is identifiable, or **revert** the phase commits if not.

The rollback is significantly cheaper than this kind of change typically allows because the feature flag is the only switch needed.

---

## Future follow-ups

Out of scope for this phase, but enabled by it:

- **View Transitions API integration** — once SPA transitions are the norm, we can wrap them in `document.startViewTransition()` for crossfade animations between login and dashboard. Modern browser support is good (Chrome 111+, Safari 18, Firefox in progress).
- **Service Worker app shell** — for the *other* `location.reload` sites (locale change, subscription update, masquerade) that this phase deliberately leaves alone. A service worker shell would make those navigations also feel instant without per-site SPA conversion.
- **Other auth-adjacent reloads** — once the discipline of explicit per-user state cleanup is established, the other reload sites become candidates for similar conversion.
- **Analytics funnel for auth** — the new path enables continuous-session analytics across login. Worth evaluating which events are now meaningful that weren't before.
- **Removing the boot overlay** — eventually, if all `location.reload` sites are eliminated, the boot overlay becomes vestigial. Not recommended for some time; it's a useful safety net.

---

## Sign-off checklist

- [ ] All R1–R10 from [SPEC.md](../.planning/phases/01-auth-spa-transition/SPEC.md) demonstrably met
- [ ] Automated test suite passes (backend + frontend)
- [ ] ESLint clean
- [ ] No SCSS files modified (`git diff main -- '*.scss'` empty)
- [ ] No HBS template files modified (`git diff main -- '*.hbs'` empty)
- [ ] Manual bug-bash variants 1–16 above all green
- [ ] Feature flag toggleable via `lib/feature_flags.rb`
- [ ] ≥ 2 weeks soak at 5% rollout with zero auth-related new error reports
- [ ] PR review by ≥ 1 reviewer with auth-flow context
- [ ] Documentation in this file matches what shipped
