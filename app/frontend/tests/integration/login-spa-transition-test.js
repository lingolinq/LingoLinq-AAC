import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  waitsFor,
  runs
} from 'frontend/tests/helpers/jasmine';
import { db_wait } from 'frontend/tests/helpers/ember_helper';
import EmberObject from '@ember/object';
import { run } from '@ember/runloop';
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
  var routeDidChangeHandler;
  var routerStub;
  var appStateStub;

  function stubLocationAssign(target) {
    Object.defineProperty(target, '_login_location_assign', {
      configurable: true,
      writable: true,
      value: function(url) {
        locationAssignCalls.push(url);
      }
    });
  }

  function stubAppState(target, featureFlags) {
    appStateStub = EmberObject.create({
      feature_flags: featureFlags || { auth_spa_transition: false },
      get: function(key) {
        if (key === 'feature_flags.auth_spa_transition') {
          return this.feature_flags && this.feature_flags.auth_spa_transition;
        }
        return null;
      }
    });
    Object.defineProperty(target, 'appState', {
      configurable: true,
      get: function() { return appStateStub; }
    });
  }

  function stubRouter(target) {
    routeDidChangeHandler = null;
    routerStub = {
      transitionTo: function() {
        transitionToCalls.push(Array.prototype.slice.call(arguments));
        var result = transitionToReturn;
        if (result && typeof result.then === 'function') {
          result.then(function() {
            if (routeDidChangeHandler) { routeDidChangeHandler(); }
          });
        }
        return result;
      },
      on: function(event, handler) {
        if (event === 'routeDidChange') { routeDidChangeHandler = handler; }
      },
      off: function(event) {
        if (event === 'routeDidChange') { routeDidChangeHandler = null; }
      }
    };
    Object.defineProperty(target, 'router', {
      configurable: true,
      get: function() { return routerStub; }
    });
  }

  function stubSpaEligible(target, value) {
    Object.defineProperty(target, '_login_spa_eligible', {
      configurable: true,
      writable: true,
      value: function() { return value; }
    });
  }

  function dispatchAfterWait(waitPromise) {
    run(function() {
      component._login_dispatch_after_wait(waitPromise);
    });
  }

  beforeEach(function() {
    transitionToCalls = [];
    transitionToReturn = RSVP.resolve();
    locationAssignCalls = [];

    component = this.subject('login-form');
    stubLocationAssign(component);
    stubAppState(component);
    stubRouter(component);
    component.session = EmberObject.create({});
  });

  afterEach(function() {
    var leftover = document.getElementById('ll-pre-reload-overlay');
    if (leftover && leftover.parentNode) {
      leftover.parentNode.removeChild(leftover);
    }
  });

  it("_login_spa_eligible returns false: _login_dispatch_after_wait calls location.assign('/'), does NOT call router.transitionTo", function() {
    stubSpaEligible(component, false);
    dispatchAfterWait(RSVP.resolve());
    waitsFor(function() { return locationAssignCalls.length > 0; });
    runs(function() {
      expect(locationAssignCalls.length).toEqual(1);
      expect(locationAssignCalls[0]).toEqual('/');
      expect(transitionToCalls.length).toEqual(0);
    });
  });

  it("_login_spa_eligible stubbed true: calls router.transitionTo('index'), does NOT call location.assign", function() {
    stubSpaEligible(component, true);
    dispatchAfterWait(RSVP.resolve());
    waitsFor(function() { return transitionToCalls.length > 0; });
    runs(function() {
      expect(transitionToCalls.length).toEqual(1);
      expect(transitionToCalls[0][0]).toEqual('index');
      expect(locationAssignCalls.length).toEqual(0);
    });
  });

  it("_login_spa_eligible stubbed true, transitionTo rejects: SPA attempted, then falls back to location.assign('/')", function() {
    stubSpaEligible(component, true);
    transitionToReturn = RSVP.reject(new Error('simulated'));
    dispatchAfterWait(RSVP.resolve());
    waitsFor(function() { return locationAssignCalls.length > 0; });
    runs(function() {
      expect(transitionToCalls.length).toEqual(1);
      expect(locationAssignCalls.length).toEqual(1);
      expect(locationAssignCalls[0]).toEqual('/');
    });
  });

  it("_login_spa_eligible stubbed true, transitionTo resolves: #ll-pre-reload-overlay element is removed from document.body", function() {
    var fake = document.createElement('div');
    fake.id = 'll-pre-reload-overlay';
    document.body.appendChild(fake);
    stubSpaEligible(component, true);
    dispatchAfterWait(RSVP.resolve());
    waitsFor(function() {
      return transitionToCalls.length > 0 && document.getElementById('ll-pre-reload-overlay') === null;
    });
    runs(function() {
      expect(document.getElementById('ll-pre-reload-overlay')).toEqual(null);
    });
  });

  it("wait promise rejects: falls back to location.assign('/'), no transition attempted", function() {
    stubSpaEligible(component, true);
    dispatchAfterWait(RSVP.reject(new Error('user fetch failed')));
    waitsFor(function() { return locationAssignCalls.length > 0; });
    runs(function() {
      expect(transitionToCalls.length).toEqual(0);
      expect(locationAssignCalls.length).toEqual(1);
    });
  });

  it("_login_spa_eligible unstubbed: returns false on a fresh appState (no flag set) — REGRESSION GUARD", function() {
    appStateStub.set('feature_flags', {});
    var result = component._login_spa_eligible();
    expect(result).toEqual(false);
  });
});

if (false) { db_wait; LoginForm; }
