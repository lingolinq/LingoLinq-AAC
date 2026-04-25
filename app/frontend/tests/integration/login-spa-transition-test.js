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
import { db_wait } from 'frontend/tests/helpers/ember_helper';
import EmberObject from '@ember/object';
import RSVP from 'rsvp';
import LoginForm from '../../components/login-form';

// Tests for the _login_dispatch_after_wait helper extracted in plan 04. Tests
// call the helper DIRECTLY with a stubbed `wait` promise — bypassing
// login_success's outer if(isTesting()) early-return without flipping any
// global test-environment flag. Plan 07.
describe("login-form _login_dispatch_after_wait", function() {
  var component;
  var transitionToCalls, transitionToReturn;
  var locationAssignCalls;
  var originalLocationAssign;
  var spyApproach;

  beforeEach(function() {
    transitionToCalls = [];
    transitionToReturn = RSVP.resolve();
    locationAssignCalls = [];
    spyApproach = null;

    originalLocationAssign = window.location.assign;

    // Approach (a): override location.assign as a spy. Modern browsers may
    // freeze Location.prototype.assign as non-configurable — in that case
    // the assignment silently no-ops or throws. Probe to verify the override
    // actually took before assuming it works.
    var spyInstalled = false;
    try {
      window.location.assign = function(url) { locationAssignCalls.push(url); };
      var probe = '__spa_test_probe_' + Date.now();
      window.location.assign(probe);
      if (locationAssignCalls.length === 1 && locationAssignCalls[0] === probe) {
        locationAssignCalls.length = 0;  // clear probe entry
        spyInstalled = true;
        spyApproach = 'a';
      }
    } catch (e) {
      // Browser threw on assign override — fall through to approach (b).
    }

    // Instantiate the login-form component with stubbed services. Use
    // this.subject (provided by ember_helper.js global beforeEach) so service
    // injections wire up correctly.
    component = this.subject('login-form');

    // Approach (b): if (a) failed, spy on the component's reload helper
    // by stubbing the session's `set('return', …)` chain. Most reliably we
    // wrap `_loginDebug`-emitting `doReload` by intercepting via the
    // per-component path. We do not have direct access to doReload (a closure
    // local), but the helper always calls `this.session.set('return', true)`
    // when this.get('return') is truthy, AND always calls location.assign('/').
    // Since (a) is the strict observable, fall back to wrapping
    // `_login_dispatch_after_wait` itself in tests where (a) is unavailable —
    // the wrapped version intercepts the doReload internal closure. For now
    // we record the failure mode in the SUMMARY and skip location-dependent
    // assertions if neither approach worked.
    if (!spyInstalled) {
      // Approach (b) fallback: replace the component's session.set so that a
      // call to session.set('return', true) is observable. However, the SPA
      // path also routes through doReload's location.assign('/') call. The
      // most reliable secondary signal is that location.href changes (we can
      // intercept that via a defineProperty when assign is frozen).
      try {
        var loc = window.location;
        var hrefDescriptor = Object.getOwnPropertyDescriptor(loc, 'href');
        if (!hrefDescriptor || hrefDescriptor.configurable) {
          Object.defineProperty(window.location, 'assign', {
            configurable: true,
            writable: true,
            value: function(url) { locationAssignCalls.push(url); }
          });
          var probe2 = '__spa_test_probe_b_' + Date.now();
          window.location.assign(probe2);
          if (locationAssignCalls.length === 1 && locationAssignCalls[0] === probe2) {
            locationAssignCalls.length = 0;
            spyInstalled = true;
            spyApproach = 'b';
          }
        }
      } catch (e2) {
        // Both (a) and (b) failed.
      }
    }

    // Stub component.router.transitionTo (capture call args).
    component.router = {
      transitionTo: function() {
        transitionToCalls.push(Array.prototype.slice.call(arguments));
        return transitionToReturn;
      }
    };

    // Stub appState — supports the natural _login_spa_eligible reading the
    // feature_flags map for the case 6 regression guard.
    component.appState = EmberObject.create({
      feature_flags: { auth_spa_transition: false },
      get: function(key) {
        if (key === 'feature_flags.auth_spa_transition') {
          return this.feature_flags && this.feature_flags.auth_spa_transition;
        }
        return null;
      }
    });

    // Stub session — only what _login_dispatch_after_wait uses on the reload
    // path. The doReload closure does `this.session.set('return', true)` when
    // `this.get('return')` is truthy.
    component.session = EmberObject.create({});
  });

  afterEach(function() {
    try {
      window.location.assign = originalLocationAssign;
    } catch (e) { /* ignore */ }
    // Clean up any leftover overlay div from case 4.
    var leftover = document.getElementById('ll-pre-reload-overlay');
    if (leftover && leftover.parentNode) {
      leftover.parentNode.removeChild(leftover);
    }
  });

  it("_login_spa_eligible returns false: _login_dispatch_after_wait calls location.assign('/'), does NOT call router.transitionTo", function() {
    component.set('_login_spa_eligible', function() { return false; });
    var wait = RSVP.resolve();
    component._login_dispatch_after_wait(wait);
    waitsFor(function() { return locationAssignCalls.length > 0; });
    runs(function() {
      expect(locationAssignCalls.length).toEqual(1);
      expect(locationAssignCalls[0]).toEqual('/');
      expect(transitionToCalls.length).toEqual(0);
    });
  });

  it("_login_spa_eligible stubbed true: calls router.transitionTo('index'), does NOT call location.assign", function() {
    component.set('_login_spa_eligible', function() { return true; });
    var wait = RSVP.resolve();
    component._login_dispatch_after_wait(wait);
    waitsFor(function() { return transitionToCalls.length > 0; });
    runs(function() {
      // STRICT — no defensive if/else. SPA path MUST fire.
      expect(transitionToCalls.length).toEqual(1);
      expect(transitionToCalls[0][0]).toEqual('index');
      expect(locationAssignCalls.length).toEqual(0);
    });
  });

  it("_login_spa_eligible stubbed true, transitionTo rejects: SPA attempted, then falls back to location.assign('/')", function() {
    component.set('_login_spa_eligible', function() { return true; });
    transitionToReturn = RSVP.reject(new Error('simulated'));
    var wait = RSVP.resolve();
    component._login_dispatch_after_wait(wait);
    // Wait for the rejection handler to fire AND the fallback to run.
    waitsFor(function() { return locationAssignCalls.length > 0; });
    runs(function() {
      expect(transitionToCalls.length).toEqual(1);
      expect(locationAssignCalls.length).toEqual(1);
      expect(locationAssignCalls[0]).toEqual('/');
    });
  });

  it("_login_spa_eligible stubbed true, transitionTo resolves: #ll-pre-reload-overlay element is removed from document.body", function() {
    // Setup: inject a fake overlay before the helper runs.
    var fake = document.createElement('div');
    fake.id = 'll-pre-reload-overlay';
    document.body.appendChild(fake);
    component.set('_login_spa_eligible', function() { return true; });
    var wait = RSVP.resolve();
    component._login_dispatch_after_wait(wait);
    waitsFor(function() {
      return transitionToCalls.length > 0 && document.getElementById('ll-pre-reload-overlay') === null;
    });
    runs(function() {
      // STRICT — element MUST be gone after transitionTo resolves.
      expect(document.getElementById('ll-pre-reload-overlay')).toEqual(null);
    });
  });

  it("wait promise rejects: falls back to location.assign('/'), no transition attempted", function() {
    component.set('_login_spa_eligible', function() { return true; });
    var wait = RSVP.reject(new Error('user fetch failed'));
    component._login_dispatch_after_wait(wait);
    waitsFor(function() { return locationAssignCalls.length > 0; });
    runs(function() {
      expect(transitionToCalls.length).toEqual(0);
      expect(locationAssignCalls.length).toEqual(1);
    });
  });

  it("_login_spa_eligible unstubbed: returns false on a fresh appState (no flag set) — REGRESSION GUARD", function() {
    // Do NOT stub _login_spa_eligible. Read the natural unstubbed body. Set
    // the appState's feature_flags map to empty so the only outcome possible
    // is `false`. If a future change defaults the flag to true in test
    // fixtures, this test will fail and surface the regression.
    component.appState.feature_flags = {};
    var result = component._login_spa_eligible();
    expect(result).toEqual(false);
  });
});

// Suppress the unused-import warning for db_wait — the import exists to ensure
// ember_helper.js's global beforeEach runs (it sets up this.subject and the
// LingoLinq.store / appState lookups).
if (false) { db_wait; LoginForm; }
