import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  waitsFor,
  runs,
  stub
} from 'frontend/tests/helpers/jasmine';
import EmberObject from '@ember/object';
import RSVP from 'rsvp';
import session from '../../utils/session';
import LingoLinq from '../../app';
import capabilities from '../../utils/capabilities';

describe("session.invalidate auth_spa_transition", function() {
  var transitionToCalls, transitionToCallTime, transitionToReturn;
  var unloadAllCalls, unloadAllCallTime;
  var clearUserStateCalls, clearUserStateCallTime;
  var reloadCalls;
  var originalRouter, originalAppState, originalStore, originalInstalled, originalAccessToken;
  var originalSpaEligible;
  var originalAuthSettingsFallback;

  beforeEach(function() {
    transitionToCalls = [];
    transitionToCallTime = 0;
    unloadAllCalls = 0;
    unloadAllCallTime = 0;
    clearUserStateCalls = 0;
    clearUserStateCallTime = 0;
    reloadCalls = [];
    transitionToReturn = RSVP.resolve();

    // Capture originals so afterEach restores cleanly. The utils/session.js
    // Proxy forwards property access to the live service singleton, so we are
    // mutating the real service here — restoration is mandatory.
    originalRouter = session.router;
    originalAppState = session.appState;
    originalStore = LingoLinq.store;
    originalInstalled = capabilities.installed_app;
    originalAccessToken = capabilities.access_token;
    originalSpaEligible = session._invalidate_spa_eligible;

    // Stub router — capture call time so test case 2 can prove call ORDER.
    session.router = {
      transitionTo: function() {
        transitionToCallTime = Date.now();
        transitionToCalls.push(Array.prototype.slice.call(arguments));
        return transitionToReturn;
      }
    };

    // Stub appState. clear_user_state captures call time. The `get` shim mirrors
    // the keys session.invalidate actually reads.
    var feature_flags = { auth_spa_transition: false };
    session.appState = EmberObject.create({
      currentUser: EmberObject.create({ user_name: 'alice' }),
      feature_flags: feature_flags,
      clear_user_state: function() {
        clearUserStateCallTime = Date.now();
        clearUserStateCalls += 1;
      },
      get: function(key) {
        if (key === 'currentUser') { return this.currentUser; }
        if (key === 'feature_flags.auth_spa_transition') { return this.feature_flags.auth_spa_transition; }
        return null;
      }
    });

    // Stub LingoLinq.store — unloadAll captures call time.
    LingoLinq.store = {
      unloadAll: function() {
        unloadAllCallTime = Date.now();
        unloadAllCalls += 1;
      }
    };

    // Stub stashes flush/setup/get_object so the existing chain resolves cleanly.
    stub(session.stashes, 'flush', function() { return RSVP.resolve(); });
    stub(session.stashes, 'setup', function() { return RSVP.resolve(); });
    stub(session.stashes, 'get_object', function() { return null; });
    stub(session, 'auth_settings_fallback', function() { return null; });

    // Spy reload — CRITICAL. Without stubbing reload, the OFF/fallback paths
    // would attempt real navigation in the test runner.
    stub(session, 'reload', function(path) { reloadCalls.push(path); });

    // Force web (not installed app) for default tests.
    capabilities.installed_app = false;
  });

  afterEach(function() {
    session.router = originalRouter;
    session.appState = originalAppState;
    LingoLinq.store = originalStore;
    capabilities.installed_app = originalInstalled;
    capabilities.access_token = originalAccessToken;
    // ALWAYS restore the natural _invalidate_spa_eligible.
    session._invalidate_spa_eligible = originalSpaEligible;
  });

  it("_invalidate_spa_eligible returns false: invalidate(true) reloads, does NOT transition", function() {
    session._invalidate_spa_eligible = function() { return false; };
    session.invalidate(true);
    waitsFor(function() { return reloadCalls.length > 0; });
    runs(function() {
      expect(transitionToCalls.length).toEqual(0);
      expect(reloadCalls.length).toEqual(1);
      expect(reloadCalls[0]).toEqual('/');
    });
  });

  it("_invalidate_spa_eligible stubbed true: transitionTo('index') first, then clear_user_state + unloadAll in .then() success, no reload", function() {
    session._invalidate_spa_eligible = function() { return true; };
    session.invalidate(true);
    // The cleanup runs inside the transitionTo .then() success handler, so we
    // wait for clearUserStateCalls to flip to 1 — that is the strongest signal
    // the SPA branch ran end-to-end.
    waitsFor(function() { return clearUserStateCalls > 0; });
    runs(function() {
      // STRICT — the SPA branch MUST fire and the call order MUST be respected.
      expect(transitionToCalls.length).toEqual(1);
      expect(transitionToCalls[0][0]).toEqual('index');
      expect(clearUserStateCalls).toEqual(1);
      expect(unloadAllCalls).toEqual(1);
      expect(reloadCalls.length).toEqual(0);
      // CALL ORDER: transitionTo MUST happen before cleanup. Cleanup is wired
      // inside the .then() success handler so the dashboard route has unmounted
      // before per-user state is nulled.
      expect(transitionToCallTime).toBeGreaterThan(0);
      expect(clearUserStateCallTime).toBeGreaterThan(0);
      expect(unloadAllCallTime).toBeGreaterThan(0);
      // toBeLessThan with +1 cushion handles same-millisecond timestamps.
      expect(transitionToCallTime).toBeLessThan(clearUserStateCallTime + 1);
      expect(transitionToCallTime).toBeLessThan(unloadAllCallTime + 1);
    });
  });

  it("_invalidate_spa_eligible stubbed true, transitionTo rejects: reload fallback fires AND cleanup is NOT called", function() {
    session._invalidate_spa_eligible = function() { return true; };
    transitionToReturn = RSVP.reject(new Error('simulated'));
    session.invalidate(true);
    waitsFor(function() { return reloadCalls.length > 0; });
    runs(function() {
      // STRICT — SPA was attempted, then reload fallback ran. Cleanup must NOT
      // have happened — the reload accomplishes that by tearing down the Ember
      // instance.
      expect(transitionToCalls.length).toEqual(1);
      expect(reloadCalls.length).toEqual(1);
      expect(reloadCalls[0]).toEqual('/');
      expect(clearUserStateCalls).toEqual(0);
      expect(unloadAllCalls).toEqual(0);
    });
  });

  it("_invalidate_spa_eligible stubbed false (simulating installed-app or test env): reload path, no transition", function() {
    session._invalidate_spa_eligible = function() { return false; };
    session.invalidate(true);
    waitsFor(function() { return reloadCalls.length > 0; });
    runs(function() {
      expect(transitionToCalls.length).toEqual(0);
      expect(reloadCalls.length).toEqual(1);
    });
  });

  it("_invalidate_spa_eligible(true) returns false in test environment without any stub — REGRESSION GUARD that the helper's !isTesting() guard remains", function() {
    // Restore the natural unstubbed helper so we read its actual body.
    session._invalidate_spa_eligible = originalSpaEligible;
    session.appState.feature_flags.auth_spa_transition = true;
    capabilities.installed_app = false;
    // Under `ember test`, isTesting() is true, so the helper MUST return false.
    // If this assertion fails the helper's `!isTesting()` clause was removed
    // and the test runner would start hitting real navigation.
    var result = session._invalidate_spa_eligible(true);
    expect(result).toEqual(false);
  });

  it("invalidate(false) — full_invalidate is false: no nav at all", function() {
    session._invalidate_spa_eligible = function() { return false; };
    session.appState.currentUser = null;
    session.appState.get = function(key) {
      if (key === 'currentUser') { return null; }
      if (key === 'feature_flags.auth_spa_transition') { return this.feature_flags.auth_spa_transition; }
      return null;
    };
    session.invalidate(false);
    // Wait briefly so the stashes.flush().then(...) chain has a chance to run.
    var waited = false;
    setTimeout(function() { waited = true; }, 50);
    waitsFor(function() { return waited; });
    runs(function() {
      expect(transitionToCalls.length).toEqual(0);
      expect(reloadCalls.length).toEqual(0);
    });
  });
});
