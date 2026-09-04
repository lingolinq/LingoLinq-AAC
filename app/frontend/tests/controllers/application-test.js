import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  waitsFor,
  runs
} from 'frontend/tests/helpers/jasmine';
import 'frontend/tests/helpers/ember_helper';
import RSVP from 'rsvp';
import EmberObject from '@ember/object';
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

  describe('masqueradeOperatorName / masqueradeStopLabel', function() {
    it('reads operator from session and includes it in the stop label', function() {
      var controller = testOwner.lookup('controller:application');
      controller.set('session', EmberObject.create({
        as_user_id: '1_99',
        original_user_name: 'admin'
      }));
      expect(controller.get('masqueradeOperatorName')).toEqual('admin');
      expect(controller.get('masqueradeStopLabel')).toMatch(/admin/);
      expect(controller.get('masqueradeStopLabel')).toMatch(/Stop Masquerading/);
    });

    it('falls back to auth_settings stash when session.original_user_name is blank', function() {
      var controller = testOwner.lookup('controller:application');
      controller.set('session', EmberObject.create({
        as_user_id: '1_99',
        original_user_name: null
      }));
      controller.set('stashes', EmberObject.create({
        get_object: function(key) {
          if (key === 'auth_settings') {
            return { as_user_id: '1_99', original_user_name: 'siteadmin' };
          }
          return null;
        }
      }));
      expect(controller.get('masqueradeOperatorName')).toEqual('siteadmin');
      expect(controller.get('masqueradeStopLabel')).toMatch(/siteadmin/);
    });

    it('uses plain Stop Masquerading when operator name is unavailable', function() {
      var controller = testOwner.lookup('controller:application');
      controller.set('session', EmberObject.create({
        as_user_id: '1_99',
        original_user_name: null
      }));
      controller.set('stashes', EmberObject.create({
        get_object: function() { return {}; }
      }));
      expect(controller.get('masqueradeOperatorName')).toEqual(null);
      expect(controller.get('masqueradeStopLabel')).toEqual('Stop Masquerading');
    });
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

  describe('copy_source_board', function() {
    var originalFindRecord;
    var originalStashes;
    var originalCurrentBoardState;

    beforeEach(function() {
      var controller = testOwner.lookup('controller:application');
      originalFindRecord = LingoLinq.store.findRecord;
      originalStashes = controller.get('stashes');
      originalCurrentBoardState = controller.get('appState.currentBoardState');
    });

    afterEach(function() {
      var controller = testOwner.lookup('controller:application');
      LingoLinq.store.findRecord = originalFindRecord;
      controller.set('stashes', originalStashes);
      controller.set('appState.currentBoardState', originalCurrentBoardState);
    });

    it('uses the active root board when copying from a sub-board', function() {
      var controller = testOwner.lookup('controller:application');
      var visibleBoard = EmberObject.create({ id: '1_2', key: 'example/child' });
      var rootBoard = EmberObject.create({ id: '1_1', key: 'example/root' });
      var requestedRef = null;
      var resolvedBoard = null;

      controller.set('appState.currentBoardState', { id: '1_2', key: 'example/child' });
      controller.set('stashes', EmberObject.create({
        temporary_root_board_state: null,
        root_board_state: { id: '1_1', key: 'example/root' }
      }));
      LingoLinq.store.findRecord = function(type, ref) {
        requestedRef = ref;
        return RSVP.resolve(rootBoard);
      };

      controller.copy_source_board(visibleBoard).then(function(board) {
        resolvedBoard = board;
      });

      waitsFor(function() { return resolvedBoard; });
      runs(function() {
        expect(requestedRef).toEqual('example/root');
        expect(resolvedBoard).toEqual(rootBoard);
        expect(rootBoard.get('copy_source_from_board')).toEqual(visibleBoard);
      });
    });

    it('does not use copy metadata as the board-set root when the copied board is not the active board state', function() {
      var controller = testOwner.lookup('controller:application');
      var visibleBoard = EmberObject.create({
        id: '2_2',
        global_id: '2_2',
        key: 'example/current-top',
        copy_id: '1_1',
        copy_key: 'template/quick-core-think'
      });
      var requestedRef = null;
      var resolvedBoard = null;

      controller.set('appState.currentBoardState', { id: '9_9', key: 'stale/other-board' });
      controller.set('stashes', EmberObject.create({
        temporary_root_board_state: null,
        root_board_state: { id: '9_8', key: 'stale/root' }
      }));
      LingoLinq.store.findRecord = function(type, ref) {
        requestedRef = ref;
        return RSVP.reject();
      };

      controller.copy_source_board(visibleBoard).then(function(board) {
        resolvedBoard = board;
      });

      waitsFor(function() { return resolvedBoard; });
      runs(function() {
        expect(requestedRef).toEqual(null);
        expect(resolvedBoard).toEqual(visibleBoard);
      });
    });

    it('uses a linked top page as the copy root when no active root is available', function() {
      var controller = testOwner.lookup('controller:application');
      var visibleBoard = EmberObject.create({
        id: '1_2',
        global_id: '1_2',
        key: 'example/lunch',
        linked_boards: [
          { id: '1_1', key: 'example/top-page', name: 'Top Page' }
        ]
      });
      var topBoard = EmberObject.create({ id: '1_1', global_id: '1_1', key: 'example/top-page' });
      var requestedRef = null;
      var resolvedBoard = null;

      controller.set('appState.currentBoardState', { id: '1_2', key: 'example/lunch' });
      controller.set('stashes', EmberObject.create({
        temporary_root_board_state: null,
        root_board_state: null
      }));
      LingoLinq.store.findRecord = function(type, ref) {
        requestedRef = ref;
        return RSVP.resolve(topBoard);
      };

      controller.copy_source_board(visibleBoard).then(function(board) {
        resolvedBoard = board;
      });

      waitsFor(function() { return resolvedBoard; });
      runs(function() {
        expect(requestedRef).toEqual('example/top-page');
        expect(resolvedBoard).toEqual(topBoard);
        expect(topBoard.get('copy_source_from_board')).toEqual(visibleBoard);
      });
    });
  });

  describe('copy_and_edit_board', function() {
    // copy_and_edit_board's completion no longer does jump_to_board (speak) +
    // toggle_edit_mode. It transitions STRAIGHT to the copy's edit route, because
    // toggle_edit_mode re-checks permissions.edit, which is still stale/false on a
    // brand-new copy and re-showed the "Edit this Board" prompt. These tests
    // therefore wait on the transition, not on a toggle. `router` must be stubbed:
    // in a unit test the real service has no routing microlib, so a live
    // transitionTo throws "Cannot read properties of undefined (reading 'hasRoute')".
    it('passes the resolved source board into the copy flow', function() {
      var controller = testOwner.lookup('controller:application');
      var sourceBoard = EmberObject.create({ id: '2_2', key: 'example/current-top' });
      var copiedBoard = EmberObject.create({ id: '3_3', key: 'me/current-top' });
      var copiedSource = null;
      var transitioned = null;

      controller.set('appState', EmberObject.create({
        check_for_needing_purchase: function() { return RSVP.resolve(); },
        jump_to_board: function() { },
        toggle_edit_mode: function() { }
      }));
      controller.set('stashes', EmberObject.create({ persist: function() { } }));
      controller.set('router', EmberObject.create({
        transitionTo: function() { transitioned = Array.prototype.slice.call(arguments); }
      }));
      controller.copy_board = function(decision, for_editing, selected_user_name, copy_finished, source_board) {
        copiedSource = source_board;
        return RSVP.resolve(copiedBoard);
      };

      controller.send('copy_and_edit_board', sourceBoard);

      waitsFor(function() { return transitioned; });
      runs(function() {
        expect(copiedSource).toEqual(sourceBoard);
        expect(transitioned[0]).toEqual('user.board-detail.edit');
        expect(transitioned[1]).toEqual('me');
        expect(transitioned[2]).toEqual('current-top');
      });
    });

    it('passes the board-detail skip-source flag into the copy flow', function() {
      var controller = testOwner.lookup('controller:application');
      var sourceBoard = EmberObject.create({ id: '2_2', key: 'example/current-top' });
      var copiedBoard = EmberObject.create({ id: '3_3', key: 'me/current-top' });
      var skipped = null;
      var transitioned = null;

      controller.set('appState', EmberObject.create({
        check_for_needing_purchase: function() { return RSVP.resolve(); },
        jump_to_board: function() { },
        toggle_edit_mode: function() { }
      }));
      controller.set('stashes', EmberObject.create({ persist: function() { } }));
      controller.set('router', EmberObject.create({
        transitionTo: function() { transitioned = Array.prototype.slice.call(arguments); }
      }));
      controller.copy_board = function(decision, for_editing, selected_user_name, copy_finished, source_board, skip_source_resolution) {
        skipped = skip_source_resolution;
        return RSVP.resolve(copiedBoard);
      };

      controller.send('copy_and_edit_board', sourceBoard, true);

      waitsFor(function() { return transitioned; });
      runs(function() {
        expect(skipped).toEqual(true);
      });
    });
  });
});
