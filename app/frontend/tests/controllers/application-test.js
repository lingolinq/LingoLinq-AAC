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
    it('passes the resolved source board into the copy flow', function() {
      var controller = testOwner.lookup('controller:application');
      var sourceBoard = EmberObject.create({ id: '2_2', key: 'example/current-top' });
      var copiedBoard = EmberObject.create({ id: '3_3', key: 'me/current-top' });
      var copiedSource = null;
      var toggled = false;

      controller.set('appState', EmberObject.create({
        check_for_needing_purchase: function() { return RSVP.resolve(); },
        jump_to_board: function() { },
        toggle_edit_mode: function() { toggled = true; }
      }));
      controller.copy_board = function(decision, for_editing, selected_user_name, copy_finished, source_board) {
        copiedSource = source_board;
        return RSVP.resolve(copiedBoard);
      };

      controller.send('copy_and_edit_board', sourceBoard);

      waitsFor(function() { return toggled; });
      runs(function() {
        expect(copiedSource).toEqual(sourceBoard);
      });
    });

    it('passes the board-detail skip-source flag into the copy flow', function() {
      var controller = testOwner.lookup('controller:application');
      var sourceBoard = EmberObject.create({ id: '2_2', key: 'example/current-top' });
      var copiedBoard = EmberObject.create({ id: '3_3', key: 'me/current-top' });
      var skipped = null;
      var toggled = false;

      controller.set('appState', EmberObject.create({
        check_for_needing_purchase: function() { return RSVP.resolve(); },
        jump_to_board: function() { },
        toggle_edit_mode: function() { toggled = true; }
      }));
      controller.copy_board = function(decision, for_editing, selected_user_name, copy_finished, source_board, skip_source_resolution) {
        skipped = skip_source_resolution;
        return RSVP.resolve(copiedBoard);
      };

      controller.send('copy_and_edit_board', sourceBoard, true);

      waitsFor(function() { return toggled; });
      runs(function() {
        expect(skipped).toEqual(true);
      });
    });
  });

  describe('openBoardPicker', function() {
    var originalQuery;
    var originalPersistence;
    var originalAppState;

    beforeEach(function() {
      var controller = testOwner.lookup('controller:application');
      originalQuery = LingoLinq.store.query;
      originalPersistence = controller.get('persistence');
      originalAppState = controller.get('appState');
    });

    afterEach(function() {
      var controller = testOwner.lookup('controller:application');
      LingoLinq.store.query = originalQuery;
      controller.set('persistence', originalPersistence);
      controller.set('appState', originalAppState);
    });

    it('loads all pages of boards for the modal picker', function() {
      var controller = testOwner.lookup('controller:application');
      var calls = [];
      var firstBoard = EmberObject.create({ id: '1_1', global_id: '1_1', key: 'example/a', name: 'A' });
      var secondBoard = EmberObject.create({ id: '1_2', global_id: '1_2', key: 'example/b', name: 'B' });
      var loaded = null;

      controller.set('appState', EmberObject.create({
        referenced_user: EmberObject.create({
          id: 'user-1',
          preferences: { home_board: { key: 'example/b' } }
        })
      }));
      controller.set('persistence', EmberObject.create({
        meta: function(type, boards) {
          if(boards[0] === firstBoard) {
            return { more: true, per_page: 1, next_offset: 1 };
          }
          return { more: false };
        }
      }));
      LingoLinq.store.query = function(type, args) {
        calls.push(Object.assign({}, args));
        if(args.offset == 1) {
          return RSVP.resolve([secondBoard]);
        }
        return RSVP.resolve([firstBoard]);
      };

      controller.send('openBoardPicker');
      waitsFor(function() {
        loaded = controller.get('boardPickerBoards');
        return loaded && loaded.length === 2;
      });
      runs(function() {
        expect(calls.length).toEqual(2);
        expect(calls[0].per_page).toEqual(100);
        expect(calls[1].offset).toEqual(1);
        expect(loaded[0]).toEqual(secondBoard);
        expect(loaded[1]).toEqual(firstBoard);
        expect(controller.get('boardPickerLoading')).toEqual(false);
      });
    });

    it('sorts favorite boards before other boards in the modal picker', function() {
      var controller = testOwner.lookup('controller:application');
      var favoriteBoard = EmberObject.create({ id: '1_1', global_id: '1_1', key: 'example/z', name: 'Z Favorite', starred: true });
      var normalBoard = EmberObject.create({ id: '1_2', global_id: '1_2', key: 'example/a', name: 'A Normal', starred: false });
      var loaded = null;

      controller.set('appState', EmberObject.create({
        referenced_user: EmberObject.create({
          id: 'user-1',
          preferences: { home_board: {} }
        })
      }));
      controller.set('persistence', EmberObject.create({
        meta: function() {
          return { more: false };
        }
      }));
      LingoLinq.store.query = function() {
        return RSVP.resolve([normalBoard, favoriteBoard]);
      };

      controller.send('openBoardPicker');
      waitsFor(function() {
        loaded = controller.get('boardPickerBoards');
        return loaded && loaded.length === 2;
      });
      runs(function() {
        expect(loaded[0]).toEqual(favoriteBoard);
        expect(loaded[1]).toEqual(normalBoard);
      });
    });
  });
});
