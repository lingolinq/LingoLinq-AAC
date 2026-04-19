import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach
} from 'frontend/tests/helpers/jasmine';
import 'frontend/tests/helpers/ember_helper';
import LingoLinq from '../../app';

describe('ApplicationController', 'controller:application', function() {
  var testOwner;

  beforeEach(function() {
    testOwner = this.owner;
  });

  it("should exist", function() {
    expect(this).not.toEqual(null);
    expect(this).not.toEqual(window);
  });

  describe('invalidateSession', function() {
    var savedLingoSession;
    var savedControllerSession;

    beforeEach(function() {
      savedLingoSession = LingoLinq.session;
      var controller = testOwner.lookup('controller:application');
      savedControllerSession = controller.get('session');
    });

    afterEach(function() {
      LingoLinq.session = savedLingoSession;
      testOwner.lookup('controller:application').set('session', savedControllerSession);
    });

    it('calls LingoLinq.session.invalidate(true) when controller session lacks invalidate', function() {
      var controller = testOwner.lookup('controller:application');
      var called = false;
      LingoLinq.session = {
        invalidate: function(force) {
          called = true;
          expect(force).toEqual(true);
        }
      };
      controller.set('session', {});
      controller.send('invalidateSession');
      expect(called).toEqual(true);
    });

    it('does not throw when neither controller session nor LingoLinq.session exposes invalidate', function() {
      var controller = testOwner.lookup('controller:application');
      LingoLinq.session = {};
      controller.set('session', {});
      expect(function() {
        controller.send('invalidateSession');
      }).not.toThrow();
    });

    it('uses controller session invalidate when present and skips LingoLinq.session', function() {
      var controller = testOwner.lookup('controller:application');
      var controllerCalled = false;
      var globalCalled = false;
      controller.set('session', {
        invalidate: function(force) {
          controllerCalled = true;
          expect(force).toEqual(true);
        }
      });
      LingoLinq.session = {
        invalidate: function() {
          globalCalled = true;
        }
      };
      controller.send('invalidateSession');
      expect(controllerCalled).toEqual(true);
      expect(globalCalled).toEqual(false);
    });
  });
});
