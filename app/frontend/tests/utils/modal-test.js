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
import { easyPromise, db_wait } from 'frontend/tests/helpers/ember_helper';
import modal from '../../utils/modal';
import scanner from '../../utils/scanner';
import EmberObject from '@ember/object';
import { run as emberRun } from '@ember/runloop';

describe('modal', function() {
  var route = null;
  beforeEach(function() {
    modal.last_promise = null;
    route = EmberObject.extend({
      render: function() {
        this.lastRender = arguments;
      },
      disconnectOutlet: function() {
        this.lastDisconnect = arguments;
      }
    }).create();
  });

  describe("setup", function() {
    it('should initialize the route', function() {
      expect(function() { modal.setup(route); }).not.toThrow();
      expect(modal.route).toEqual(route);
      expect(modal.settings_for).toEqual({});
    });
    it('should reject last_promise if one is set', function() {
      var promise = easyPromise();
      modal.last_promise = promise;
      modal.setup(route);
      waitsFor(function() { return promise.rejected; });
      runs();
    });
  });

  describe("open", function() {
    it('should reject last_promise if one is set', function() {
      var promise = easyPromise();
      modal.setup(route);
      modal.last_promise = promise;
      modal.open('hat');
      waitsFor(function() { return promise.resolved; });
      runs();
    });
    it('should error expectedly if called without setup', function() {
      modal.route = null;
      expect(function() { modal.open('hat'); }).toThrow();
    });
    it('should store settings for the modal if specified', function() {
      modal.setup(route);
      modal.open('hat', {key: 'chicken'});
      expect(modal.settings_for['hat']).toEqual({key: 'chicken'});
    });
    it('should render the route specified', function() {
      modal.setup(route);
      modal.open('hat', {key: 'chicken'});
      expect(route.lastRender).toEqual({'0': 'hat', '1': {into: 'application', outlet: 'modal'}});
    });
    it('should return a promise', function() {
      modal.setup(route);
      var res = modal.open('hat');
      expect(res.then).not.toEqual(null);
    });
  });

  describe("is_open", function() {
    it('should return false if the modal is not set', function() {
      modal.setup(route);
      expect(modal.is_open('bacon')).toEqual(false);
      modal.last_template = 'hippo';
      expect(modal.is_open('bacon')).toEqual(false);
    });
    it('should return true if the modal is set as open', function() {
      modal.setup(route);
      modal.last_template = 'hippo';
      expect(modal.is_open('hippo')).toEqual(true);
      modal.close();
      expect(modal.is_open('hippo')).toEqual(false);
    });
  });

  describe("close", function() {
    describe("success and failure", function() {
      it('should reject the returned promise if called with false', function() {
        modal.setup(route);
        var rejected = false;
        modal.open('hat').then(function() { }, function() { rejected = true; });
        modal.close(false);
        waitsFor(function() { return rejected; });
        runs();
      });
      it('should not error expectedly if called without setup', function() {
        modal.route = null;
        expect(function() { modal.close(); }).not.toThrow();
      });
      it('should resolve the returned promise if called with true', function() {
        db_wait(function() {
          modal.setup(route);
          var resolved = false;
          modal.open('hat').then(function() { resolved = true; }, function() { });
          modal.close(true);
          waitsFor(function() { return resolved; });
          runs();
        });
      });
      it('should resolve the returned promise if no argument sent', function() {
        modal.setup(route);
        var resolved = false;
        modal.open('hat').then(function() { resolved = true; }, function() { });
        modal.close();
        waitsFor(function() { return resolved; });
        runs();
      });
      it('should resolve and clear state on close (outlet cleared by modal-container for component modals)', function() {
        modal.setup(route);
        var resolved = false;
        modal.open('hat').then(function() { resolved = true; }, function() { });
        modal.close();
        waitsFor(function() { return resolved; });
        runs(function() {
          expect(modal.last_template).toEqual(null);
          expect(modal.last_promise).toEqual(null);
        });
      });
    });
  });

  describe("flash", function() {
    it('should error expectedly if called without setup', function() {
      modal.route = null;
      expect(function() { modal.flash('hi'); }).toThrow();
    });
    it('should properly render flash with a default of notice', function() {
      modal.setup(route);
      expect(function() { modal.flash('hello'); }).not.toThrow();
      var extra = false;
      setTimeout(function() {
        extra = true;
      }, 100);
      waitsFor(function() { return route.lastRender && extra; });
      runs(function() {
        expect(route.lastRender).toEqual({'0': 'flash-message', '1': {into: 'application', outlet: 'flash-message'}});
        expect(modal.settings_for['flash']).toEqual({type: 'notice', text: 'hello', sticky: undefined});
      });
    });
    it('should properly render warning flash', function() {
      modal.setup(route);
      modal.warning('hello');
      waitsFor(function() { return route.lastRender; });
      runs(function() {
        expect(route.lastRender).toEqual({'0': 'flash-message', '1': {into: 'application', outlet: 'flash-message'}});
        expect(modal.settings_for['flash']).toEqual({type: 'warning', text: 'hello', sticky: undefined});
      });
    });
    it('should properly render error flash', function() {
      modal.setup(route);
      modal.error('hello');
      waitsFor(function() { return route.lastRender; });
      runs(function() {
        expect(route.lastRender).toEqual({'0': 'flash-message', '1': {into: 'application', outlet: 'flash-message'}});
        expect(modal.settings_for['flash']).toEqual({type: 'error', text: 'hello', sticky: undefined});
      });
    });
    it('should properly render notice flash', function() {
      modal.setup(route);
      modal.notice('hello');
      waitsFor(function() { return route.lastRender; });
      runs(function() {
        expect(route.lastRender).toEqual({'0': 'flash-message', '1': {into: 'application', outlet: 'flash-message'}});
        expect(modal.settings_for['flash']).toEqual({type: 'notice', text: 'hello', sticky: undefined});
      });
    });
    it('should properly render success flash', function() {
      modal.setup(route);
      modal.success('hello');
      waitsFor(function() { return route.lastRender; });
      runs(function() {
        expect(route.lastRender).toEqual({'0': 'flash-message', '1': {into: 'application', outlet: 'flash-message'}});
        expect(modal.settings_for['flash']).toEqual({type: 'success', text: 'hello', sticky: undefined});
      });
    });
  });

  describe('scanning', function() {
    it('should stop scanning when a new modal is opened', function() {
      modal.setup(route);
      scanner.scanning = true;

      modal.open('hat');
      expect(scanner.scanning).toEqual(false);
      expect(modal.resume_scanning).toEqual(true);
    });

    it('should resume scanning when a modal is closed', function() {
      modal.setup(route);
      scanner.scanning = true;

      modal.open('hat');
      expect(scanner.scanning).toEqual(false);
      expect(modal.resume_scanning).toEqual(true);

      stub(scanner, 'start', function() {
        scanner.scanning = true;
      });

      emberRun.later(function() {
        modal.close();
      }, 100);
      waitsFor(function() { return scanner.scanning; });
      runs(function() {
        expect(modal.resume_scanning).toEqual(false);
      });
    });

    it('should not resume scanning when a different modal is opened', function() {
      modal.setup(route);
      scanner.scanning = true;

      modal.open('hat');
      expect(scanner.scanning).toEqual(false);
      expect(modal.resume_scanning).toEqual(true);

      stub(scanner, 'start', function() {
        scanner.scanning = true;
      });
      var is_open = true;
      var open_checks = 0;
      stub(modal, 'is_open', function() {
        open_checks++;
        return is_open;
      });

      modal.open('cheese');
      waitsFor(function() { return open_checks >= 1; });
      runs(function() {
        expect(scanner.scanning).toEqual(false);
        expect(modal.resume_scanning).toEqual(true);

        is_open = false;
        modal.close();
      });

      waitsFor(function() { return scanner.scanning; });
      runs(function() {
        expect(modal.resume_scanning).toEqual(false);
      });
    });
  });
});
