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
import { queryLog } from 'frontend/tests/helpers/ember_helper';
import RSVP from 'rsvp';
import EmberObject from '@ember/object';
import app_state from '../../utils/app_state';
import persistence from '../../utils/persistence';
import boundClasses from '../../utils/bound_classes';
import modal from '../../utils/modal';
import stashes from '../../utils/_stashes';
import editManager from '../../utils/edit_manager';
import contentGrabbers from '../../utils/content_grabbers';
import scanner from '../../utils/scanner';
import session from '../../utils/session';
import capabilities from '../../utils/capabilities';
import utterance from '../../utils/utterance';
import geo from '../../utils/geo';
import speecher from '../../utils/speecher';
import LingoLinq from '../../app';
import { run as emberRun } from '@ember/runloop';

describe('app_state', function() {
  var navigator = window.navigator;
  var boardGrabber = contentGrabbers.boardGrabber;
  var app = null, route = null, controller = null;
  var last_sent_message = null;
  beforeEach(function() {
    app = {
      register: function(key, obj, args) {
        app.registered = (key == 'lingolinq:app_state' && obj == app_state && args.singleton === true);
      },
      inject: function(component, name, key) {
        if(name == 'app_state' && key == 'lingolinq:app_state') {
          app.injections.push(component);
        }
      },
      injections: []
    };
    route = EmberObject.extend({
      disconnectOutlet: function() { }
    }).create({
      session: EmberObject.create(),
      router: {
        router: {
          recognizer: {
            recognize: function() { return []; }
          }
        }
      }
    });
    controller = EmberObject.extend({
      transitionToRoute: function(a, b) { app_state.routed_to = [a, b]; },
      updateTitle: function() { },
      send: function(message) {
        last_sent_message = message;
      }
    }).create();
    app_state.route = route;
    app_state.controller = controller;
    app_state.testing = true;
    last_sent_message = null;
  });

  describe('setup', function() {
    it("should properly inject settings", function() {
      app_state.setup(app);
      expect(app.registered).toEqual(true);
      expect(app.injections).toEqual(['model', 'controller', 'view', 'route']);
    });
    it("should initialize", function() {
      var called = false;
      stub(app_state, 'refresh_user', function() {
        called = true;
      });
      app_state.setup(app);
      expect(app_state.get('button_list')).toEqual([]);
      expect(app_state.get('stashes')).toEqual(stashes);
      expect(called).toEqual(true);
    });
  });

  describe('setup_controller', function() {
    it("should initialize on app startup", function() {
      app_state.setup(app);

      var modal_closed = false;
      var logging_checked = false;
      var board_state_checked = false;
      var bound_classes_setup = false;
      var utterance_setup = false;

      var controller = EmberObject.create({controller: 'controlleyness'});
      var session = EmberObject.create();
      var route = EmberObject.create({route: 'routeyness', session: session});
      stub(modal, 'close', function() {
        modal_closed = true;
      });
      stub(app_state, 'speak_mode_handlers', function() {
        logging_checked = true;
      });
      stub(app_state, 'dom_changes_on_board_state_change', function() {
          board_state_checked = true;
      });
      stub(boundClasses, 'setup', function() {
        bound_classes_setup = true;
      });
      stub(utterance, 'setup', function() {
        utterance_setup = true;
      });

      app_state.setup_controller(route, controller);
      expect(LingoLinq.controller).toEqual(controller);
      expect(app_state.controller).toEqual(controller);
      expect(stashes.controller).toEqual(controller);
      expect(boardGrabber.transitioner).toEqual(app_state.get('router'));
      expect(bound_classes_setup).toEqual(true);
      expect(utterance_setup).toEqual(true);
      expect(logging_checked).toEqual(true);
      expect(board_state_checked).toEqual(true);
      expect(LingoLinq.session).toEqual(session);
      expect(modal_closed).toEqual(true);
    });
  });

  describe('speak_mode_handlers', function() {
    it("should call volume_check", function() {
      app_state.setup(app);

      var checks = 0;
      var warnings = 0;
      var warning = 'bacon';
      stub(capabilities, 'volume_check', function() {
        checks++;
        if(checks == 1) {
          return RSVP.resolve(0);
        } else if(checks == 2) {
          return RSVP.resolve(0.1);
        } else {
          return RSVP.resolve(1.0);
        }
      });
      stub(modal, 'warning', function(message) {
        warnings++;
        warning = message;
      });

      expect(checks).toEqual(0);

      stashes.set('current_mode', 'speak');
      app_state.set('currentBoardState', {key: 'trade', id: '1_1'});
      expect(app_state.get('speak_mode')).toEqual(true);

      // set speak mode
      waitsFor(function() { return checks == 1 && warnings == 1; });
      runs(function() {
        expect(warning).toEqual('Volume is muted, you will not be able to hear speech');
        app_state.set('last_speak_mode', null);
        app_state.speak_mode_handlers();
      });
      waitsFor(function() { return checks == 2 && warnings == 2; });
      runs(function() {
        expect(warning).toEqual('Volume is low, you may not be able to hear speech');
        warning = null;
        app_state.set('last_speak_mode', null);
        app_state.speak_mode_handlers();
      });
      waitsFor(function() { return checks == 3; });
      runs(function() {
        expect(warnings).toEqual(2);
      });
    });

    it('should check for silent mode', function() {
      app_state.setup(app);

      var checks = 0;
      var warnings = 0;
      var warning = 'bacon';
      stub(capabilities, 'system', 'iOS');
      stub(capabilities, 'silent_mode', function() {
        checks++;
        return RSVP.resolve(false);
      });
      stub(modal, 'warning', function(message) {
        warnings++;
        warning = message;
      });

      expect(checks).toEqual(0);

      stashes.set('current_mode', 'speak');
      expect(app_state.get('speak_mode')).toEqual(false);
      app_state.set('currentBoardState', {key: 'trade', id: '1_1'});
      expect(app_state.get('speak_mode')).toEqual(true);

      waitsFor(function() { return checks == 1; });
      runs(function() {
        expect(warnings).toEqual(0);
        warning = null;
        app_state.set('last_speak_mode', null);
      });
    });

    it('should warn when in silent mode', function() {
      app_state.setup(app);

      var checks = 0;
      var warnings = 0;
      var warning = 'bacon';
      stub(capabilities, 'system', 'iOS');
      stub(capabilities, 'silent_mode', function() {
        checks++;
        return RSVP.resolve(true);
      });
      stub(modal, 'warning', function(message) {
        warnings++;
        warning = message;
      });

      expect(checks).toEqual(0);

      stashes.set('current_mode', 'speak');
      app_state.set('currentBoardState', {key: 'trade', id: '1_1'});
      expect(app_state.get('speak_mode')).toEqual(true);

      // set speak mode
      waitsFor(function() { return checks == 1 && warnings == 1; });
      runs(function() {
        expect(warning).toEqual('The app is currently muted, so you will not hear speech. To unmute, check the mute switch, and also swipe up from the bottom of the screen to check for app-level muting');
      });
    });

    it("should poll for geo when in speak mode", function() {
      var polling = false;
      stub(stashes.geo, 'poll', function() {
        polling = true;
      });
      stashes.set('current_mode', 'speak');
      app_state.set('currentUser', EmberObject.create({preferences: {geo_logging: true}}));
      app_state.set('currentBoardState', {key: 'trade', id: '1_1'});
      waitsFor(function() { return polling; });
      runs();
    });

//         if(this.get('currentUser.preferences.speak_on_speak_mode')) {
//           emberRun.later(function() {
//             speecher.speak_text(i18n.t('here_we_go', "here we go"), null, {volume: 0.1});
//           }, 200);
//         }

    it("should not trigger an init vocalization by default", function() {
      var called = false;
      stub(speecher, 'speak_text', function(str, opts) {
        called = true;
      });
      var done = false;
      stashes.set('current_mode', 'speak');
      app_state.set('currentUser', EmberObject.create({}));
      app_state.set('currentBoardState', {key: 'trade', id: '1_1'});
      setTimeout(function() { done = true; }, 500);
      waitsFor(function() { return done; });
      runs(function() {
        expect(called).toEqual(false);
      });
    });

    it("should trigger an init vocalization if specified", function() {
      var called = false;
      stub(speecher, 'speak_text', function(str, id, opts) {
        expect(str).toEqual('here we go');
        expect(opts).toEqual({volume: 0.1});
        called = true;
      });
      var done = false;
      stashes.set('current_mode', 'speak');
      app_state.set('currentUser', EmberObject.create({preferences: {speak_on_speak_mode: true}}));
      app_state.set('currentBoardState', {key: 'trade', id: '1_1'});
      setTimeout(function() { done = true; }, 500);
      waitsFor(function() { return called; });
      runs();
    });
  });

  describe('refresh_user', function() {
    it("should cancel an existing refresh", function() {
      app_state.refreshing_user = {a: 1};
      var cancel_event = null;
      stub(emberRun, 'cancel', function(event) {
        cancel_event = event;
      });
      app_state.refresh_user();
      expect(cancel_event).toEqual({a: 1});
    });

    it("should call reload on the current user", function() {
      app_state.refresh_user();
      var reloaded = false;
      app_state.set('currentUser', EmberObject.extend({
        reload: function() {
          reloaded = true;
          return RSVP.reject();
        }
      }).create());
      expect(app_state.refreshing_user).not.toEqual(undefined);
      emberRun.cancel(app_state.refreshing_user);
    });
  });

  describe('global_transition', function() {
    it("should clean up state", function() {
      app_state.setup(app);
      app_state.setup_controller(route, controller);
      waitsFor(function() {
        return boardGrabber.transitioner;
      });
      runs(function() {
        var modal_closed = false;
        stub(modal, 'close', function() {
          modal_closed = true;
        });
        app_state.global_transition('bacon');
        expect(app_state.get('hide_search')).toEqual(false);
        expect(modal_closed).toEqual(true);
      });
    });
    it("should clear board state when leaving a board page", function() {
      app_state.set('currentBoardState', {a: 1});
      app_state.global_transition('bacon');
      expect(app_state.get('currentBoardState')).toEqual(null);
    });

    it("should clear cached class names on board page load", function() {
      var bound_classes_redone = false;
      stub(boundClasses, 'setup', function() {
        bound_classes_redone = true;
      });
      app_state.set('currentBoardState', {a: 1});
      app_state.global_transition({targetName: 'board.index'});
      expect(bound_classes_redone).toEqual(true);
      expect(app_state.get('currentBoardState')).toEqual({a: 1});
    });

    it("should try to get the session's user if not already set", function() {
      app_state.controller = controller;
      app_state.route = route;
      var refresh_called = false;
      stub(app_state, 'refresh_session_user', function() {
        refresh_called = true;
      });
      session.set('isAuthenticated', true);
      app_state.global_transition({});
      expect(refresh_called).toEqual(true);
    });

    it("should leave edit mode if in edit mode on a board", function() {
      stashes.set('current_mode', 'edit');
      app_state.set('currentBoardState', {});
      var edit_mode_toggled = false;
      stub(app_state, 'toggle_edit_mode', function() {
        edit_mode_toggled = true;
      });
      app_state.global_transition({});
      expect(edit_mode_toggled).toEqual(true);
    });
  });

  describe('toggle_speak_mode', function() {
    it("should close any dialogs if a decision is specified", function() {
      var closed = false;
      stub(modal, 'close', function() {
        closed = true;
      });
      stub(app_state, 'home_in_speak_mode', function() { });
      app_state.toggle_speak_mode('heart');
      expect(closed).toEqual(true);
    });

    it("should clear the utterance in a non-logged way", function() {
      var called = false;
      stub(utterance, 'clear', function(meh, non_logged) {
        called = true;
        expect(non_logged).toEqual(true);
      });
      app_state.toggle_speak_mode();
      expect(called).toEqual(true);
    });

    it("should launch the home board in speak mode if not currently on a board", function() {
      var called = false;
      stub(app_state, 'home_in_speak_mode', function() {
        called = true;
      });
      app_state.toggle_speak_mode();
      expect(called).toEqual(true);
    });

    it("should default to currentAsHome for the decision", function() {
      var called = false;
      stub(app_state, 'toggle_mode', function(mode) {
        if(mode == 'speak') { called = true; }
      });
      app_state.toggle_speak_mode();
      waitsFor(function() { return called; });
      runs();
    });

    it("should default to rememberRealHome for the decision if the board is in the user's set", function() {
      var called = false;
      stub(app_state, 'toggle_mode', function(mode, opts) {
        if(mode == 'speak' && opts.override_state.key == 'qwer/qwer') { called = true; }
      });
      var user = LingoLinq.store.createRecord('user');
      user.set('stats', {board_set_ids: ['1_1']});
      user.set('preferences', {home_board: {key: 'qwer/qwer', id: '1_2'}});
      app_state.set('currentBoardState', {key: 'asdf/asdf', id: '1_1'});
      app_state.set('currentUser', user);
      app_state.toggle_speak_mode();
      waitsFor(function() { return called; });
      runs();
    });

    it("should launch the user's home speak mode if 'goHome' is the decision", function() {
      var called = false;
      stub(app_state, 'home_in_speak_mode', function() {
        called = true;
      });
      app_state.set('currentBoardState', {key: 'hat'});
      app_state.toggle_speak_mode('goHome');
      expect(called).toEqual(true);
    });

    it("should exit speak mode if currently in speak mode", function() {
      var called = false;
      stub(app_state, 'toggle_mode', function(mode) {
        called = mode == 'speak';
      });
      app_state.set('currentBoardState', {key: 'hat'});
      stashes.set('current_mode', 'speak');
      app_state.toggle_speak_mode();
      expect(called).toEqual(true);
    });

    it("should ask for a pin if required and trying to exit speak mode", function() {
      var called = false;
      stub(app_state, 'toggle_mode', function(mode) {
        called = mode == 'speak';
      });
      app_state.set('currentBoardState', {key: 'hat'});
      app_state.set('sessionUser', EmberObject.create({
        preferences: {
          require_speak_mode_pin: true,
          speak_mode_pin: '1234'
        }
      }));
      stashes.set('current_mode', 'speak');
      var pin_template = null;
      var pin_settings = null;
      stub(modal, 'open', function(template, settings) {
        pin_template  = template;
        pin_settings = settings;
      });
      app_state.toggle_speak_mode();

      expect(called).toEqual(false);
      expect(pin_template).toEqual('speak-mode-pin');
      expect(pin_settings).toEqual({actual_pin: '1234'});
    });

    it("should skip asking for a pin if 'off' is the decision", function() {
      var called = false;
      stub(app_state, 'toggle_mode', function(mode) {
        called = mode == 'speak';
      });
      app_state.set('currentBoardState', {key: 'hat'});
      app_state.set('sessionUser', EmberObject.create({
        preferences: {
          require_speak_mode_pin: true,
          speak_mode_pin: '1234'
        }
      }));
      stashes.set('current_mode', 'speak');
      var pin_template = null;
      var pin_settings = null;
      stub(modal, 'open', function(template, settings) {
        pin_template  = template;
        pin_settings = settings;
      });
      app_state.toggle_speak_mode('off');
      expect(called).toEqual(true);
      expect(pin_template).toEqual(null);
    });

    it("should launch the current board as speak mode if 'currentAsHome' is the decision", function() {
      var mode = null;
      stub(app_state, 'toggle_mode', function(m) {
        mode = m;
      });
      app_state.set('currentBoardState', {key: 'scarf'});
      app_state.set('sessionUser', null);
      app_state.toggle_speak_mode('currentAsHome');
      expect(mode).toEqual('speak');
    });

    it("should remember the preferred home board, but temp to current board as home, if 'currentAsHome' is the decision and not on the home board", function() {
      var mode = null;
      app_state.set('currentBoardState', {id: '2345', key: 'scarf'});
      app_state.set('sessionUser', EmberObject.create({
        preferences: {
          home_board: {id: '1234', key: 'shawl'}
        }
      }));
      app_state.toggle_speak_mode('currentAsHome');
      expect(app_state.get('speak_mode')).toEqual(true);
      expect(stashes.get('temporary_root_board_state.id')).toEqual('2345');
      expect(stashes.get('root_board_state.id')).toEqual('1234');
    });

    it("should not temp to current board as home if already on the home board", function() {
      var mode = null;
      app_state.set('currentBoardState', {id: '1234', key: 'shawl'});
      app_state.set('sessionUser', EmberObject.create({
        preferences: {
          home_board: {id: '1234', key: 'shawl'}
        }
      }));
      app_state.toggle_speak_mode('currentAsHome');
      expect(stashes.get('temporary_root_board_state.id')).toEqual(null);
      expect(stashes.get('root_board_state.id')).toEqual('1234');
    });

    it("should launch the current board in speak mode if the user has no home board set", function() {
      var mode = null;
      stub(app_state, 'toggle_mode', function(m) {
        mode = m;
      });
      app_state.set('sessionUser', EmberObject.create({
        preferences: {
          home_board: null
        }
      }));
      stashes.set('current_mode', 'default');
      app_state.set('currentBoardState', {key: 'scarf', id: '1_1'});
      app_state.toggle_speak_mode();
      expect(mode).toEqual('speak');
    });

    it("should launch the current board in speak mode if currently on the user's home board", function() {
      var mode = null;
      stub(app_state, 'toggle_mode', function(m) {
        mode = m;
      });
      app_state.set('sessionUser', EmberObject.create({
        preferences: {
          home_board: {
            key: 'scarf',
            id: '1_1'
          }
        }
      }));
      stashes.set('current_mode', 'default');
      app_state.set('currentBoardState', {key: 'scarf', id: '1_1'});
      app_state.toggle_speak_mode();
      expect(mode).toEqual('speak');

      mode = null;
      app_state.toggle_speak_mode('rememberRealHome');
      expect(mode).toEqual('speak');
    });

    it("should launch the current board in speak mode but remember the real home board if the user has a home board set and 'rememberRealHome' is the decision", function() {
      var mode = null;
      var options = null;
      stub(app_state, 'toggle_mode', function(m, o) {
        mode = m;
        options = o;
      });
      app_state.set('sessionUser', EmberObject.create({
        preferences: {
          home_board: {
            key: 'scarf',
            id: '1_1'
          }
        }
      }));
      app_state.set('currentBoardState', {key: 'scarves', id: '1_2'});
      stashes.set('current_mode', 'default');
      app_state.toggle_speak_mode('rememberRealHome');
      expect(mode).toEqual('speak');
      expect(options).toEqual({override_state: {key: 'scarf', id: '1_1'}});
    });

    it("should set the correct text_direction", function() {
      var mode = null;
      var options = null;
      stub(app_state, 'toggle_mode', function(m, o) {
        mode = m;
        options = o;
      });
      app_state.set('sessionUser', EmberObject.create({
        preferences: {
          home_board: {
            key: 'scarf',
            id: '1_1'
          }
        }
      }));
      app_state.set('currentBoardState', {key: 'scarves', id: '1_2', text_direction: 'rtl'});
      stashes.set('current_mode', 'default');
      app_state.toggle_speak_mode('rememberRealHome');
      expect(mode).toEqual('speak');
      expect(options).toEqual({override_state: {key: 'scarf', id: '1_1', text_direction: 'rtl'}});
    });
  });

  describe('toggle_modeling', function() {
    it("should toggle correctly", function() {
      app_state.set('manual_modeling', undefined);
      expect(app_state.get('manual_modeling')).toEqual(undefined);
      app_state.toggle_modeling();
      expect(app_state.get('manual_modeling')).toEqual(true);
      app_state.toggle_modeling();
      expect(app_state.get('manual_modeling')).toEqual(false);
      app_state.toggle_modeling();
      expect(app_state.get('manual_modeling')).toEqual(true);
      app_state.toggle_modeling(true);
      expect(app_state.get('manual_modeling')).toEqual(true);
      app_state.toggle_modeling();
      expect(app_state.get('manual_modeling')).toEqual(false);
      app_state.toggle_modeling(false);
      expect(app_state.get('manual_modeling')).toEqual(false);
    });
  });

  describe('toggle_edit_mode', function() {
    it("should clear the edit history", function() {
      var history_cleared = false;
      stashes.set('current_mode', 'edit');
      app_state.set('currentBoardState', {});
      stub(app_state, 'toggle_mode', function(arg) {
      });
      stub(editManager, 'clear_history', function() {
        history_cleared = true;
      });
      app_state.toggle_edit_mode();
      expect(history_cleared).toEqual(true);
    });

    it("should call toggle_mode", function() {
      var toggle_called = false;
      stashes.set('current_mode', 'edit');
      app_state.set('currentBoardState', {});
      stub(app_state, 'toggle_mode', function(arg) {
        toggle_called = arg == 'edit';
      });
      stub(editManager, 'clear_history', function() {
      });
      app_state.set('controller.board', {model: {permissions: {edit: true}}});
      app_state.toggle_edit_mode();
      expect(toggle_called).toEqual(true);
    });

    it("should confirm if necessary and no decision made", function() {
      app_state.controller.set('board', EmberObject.create({
        model: EmberObject.create({could_be_in_use: true})
      }));
      var found_template = null;
      var found_settings = null;
      stub(modal, 'open', function(template, settings) {
        found_template = template;
        found_settings = settings;
        return RSVP.resolve();
      });
      stashes.set('current_mode', 'default');
      stub(app_state, 'toggle_mode', function(arg) { });
      stub(editManager, 'clear_history', function() { });
      app_state.toggle_edit_mode();
      expect(found_template).toEqual('confirm-edit-board');
      expect(found_settings.board).toEqual(app_state.controller.get('board.model'));
    });

    it("should not confirm if necessary and decision made", function() {
      app_state.controller.set('board', EmberObject.create({
        model: EmberObject.create({could_be_in_use: true})
      }));
      var found_template = null;
      var found_settings = null;
      stub(modal, 'open', function(template, settings) {
        found_template = template;
        found_settings = settings;
      });
      stashes.set('current_mode', 'default');
      var toggle_called = false;
      stub(app_state, 'toggle_mode', function(arg) {
        toggle_called = true;
      });
      stub(editManager, 'clear_history', function() { });
      app_state.toggle_edit_mode('something');
      expect(found_template).toEqual(null);
      expect(toggle_called).toEqual(true);
    });
  });

  describe('toggle_mode', function() {
    it("should clear any existing utterance", function() {
      var cleared = false;
      stub(utterance, 'clear', function() {
        cleared = true;
      });
      app_state.toggle_mode();
      expect(cleared).toEqual(true);
    });

    it("should clear paint mode", function() {
      var cleared = false;
      stub(editManager, 'clear_paint_mode', function() {
        cleared = true;
      });
      app_state.toggle_mode();
      expect(cleared).toEqual(true);
    });

    it("should set board state to the current board's state when entering speak mode", function() {
      app_state.set('currentBoardState', {key: 'alfalfa', id: '1_1'});
      stashes.set('current_mode', 'default');
      app_state.toggle_mode('speak');
      expect(stashes.get('root_board_state')).toEqual(app_state.get('currentBoardState'));
    });

    it("should set board state to the specified board state when entering speak mode with override set", function() {
      app_state.set('currentBoardState', {key: 'alfalfa', id: '1_1'});
      stashes.set('current_mode', 'default');
      app_state.toggle_mode('speak', {override_state: {key: 'salt', id: '1_2'}});
      expect(stashes.get('root_board_state')).toEqual({key: 'salt', id: '1_2'});
    });

    it("should return to the stashed last_mode when leaving edit mode", function() {
      stashes.set('last_mode', 'bacon');
      stashes.set('current_mode', 'edit');
      app_state.toggle_mode('edit');
      expect(stashes.get('current_mode')).toEqual('bacon');
    });

    it("should clear last_mode stash when leaving non-default mode", function() {
      stashes.set('last_mode', 'bacon');
      stashes.set('current_mode', 'edit');
      app_state.toggle_mode('edit');
      expect(stashes.get('current_mode')).toEqual('bacon');
      expect(stashes.get('last_mode')).toEqual(null);
    });

    it("should remember last_mode stash when entering edit mode", function() {
      stashes.set('current_mode', 'radish');
      app_state.toggle_mode('edit');
      expect(stashes.get('last_mode')).toEqual('radish');
    });

    it("should poll for geo if enabled and entering speak mode", function() {
      var polling = false;
      stub(stashes.geo, 'poll', function() {
        polling = true;
      });
      var u = EmberObject.create({
        preferences: {geo_logging: true}
      });
      u.set('premium_enabled', true);
      app_state.set('currentBoardState', {key: 'trade', id: '1_1'});
      app_state.set('sessionUser', u);
      app_state.toggle_mode('speak');
      expect(polling).toEqual(true);
    });

    it("should clear history if entering speak mode", function() {
      var history = null;
      stub(app_state, 'set_history', function(hist) {
        history = hist;
      });
      stashes.set('current_mode', 'default');
      app_state.set('currentBoardState', {key: 'trade', id: '1_1'});
      app_state.toggle_mode('speak');
      expect(stashes.get('current_mode')).toEqual('speak');
      expect(history).toEqual([]);
    });

    it("should warn about logging if enabled and entering speak mode", function() {
      stashes.set('current_mode', 'default');
      app_state.set('currentBoardState', {key: 'trade', id: '1_1'});

      var notice = null;
      stub(modal, 'notice', function(message) {
        notice = message;
      });
      var u = EmberObject.create({
        preferences: {logging: true}
      });
      u.set('currently_premium', true);
      expect(app_state.get('speak_mode')).toEqual(false);
      app_state.set('sessionUser', u);
      expect(app_state.get('speak_mode')).toEqual(false);
      stashes.set('logging_enabled', true);
      app_state.toggle_mode('speak');
      expect(stashes.get('current_mode')).toEqual('speak');
      expect(app_state.get('speak_mode')).toEqual(true);

      waitsFor(function() { return notice; });
      runs(function() {
        expect(notice).toEqual('Logging is enabled');
      });
    });

    describe("board_level", function() {
      it('should set the board level based on the user-set current level', function() {
        expect(app_state.get('speak_mode')).toEqual(false);
        app_state.set('currentBoardState', {key: 'aaaa/bbbb', id: '1_12345'});
        stashes.persist('board_level', 5);
        app_state.toggle_mode('speak', {override_state: {key: 'aaaa/bbbb', id: '1_12345', level: 1}});
        expect(app_state.get('speak_mode')).toEqual(true);
        expect(stashes.get('board_level')).toEqual(5);
      });

      it('should set the board level to user home board preference if launching the user home board', function() {
        expect(app_state.get('speak_mode')).toEqual(false);
        app_state.set('sessionUser', EmberObject.create({preferences: {home_board: {id: '1_12345', key: 'aaaa/bbbb', level: 5}}}));
        app_state.set('currentBoardState', {key: 'aaaa/bbbb', id: '1_12345'});
        stashes.persist('board_level', null);
        app_state.toggle_mode('speak', {override_state: {key: 'aaaa/bbbb', id: '1_12345', level: 1}});
        expect(app_state.get('speak_mode')).toEqual(true);
        expect(stashes.get('board_level')).toEqual(5);
      });

      it('should set the board level to user sidebar preference if launching the user sidebar board', function() {
        expect(app_state.get('speak_mode')).toEqual(false);
        app_state.set('sessionUser', EmberObject.create({preferences: {sidebar_boards: [{id: '1_12345', key: 'aaaa/bbbb', level: 5}]}}));
        app_state.set('currentBoardState', {key: 'aaaa/bbbb', id: '1_12345'});
        stashes.persist('board_level', null);
        app_state.toggle_mode('speak', {override_state: {key: 'aaaa/bbbb', id: '1_12345', level: 1}});
        expect(app_state.get('speak_mode')).toEqual(true);
        expect(stashes.get('board_level')).toEqual(5);
      });

      it('should override the user home board preference if a user-set current level is set', function() {
        expect(app_state.get('speak_mode')).toEqual(false);
        app_state.set('sessionUser', EmberObject.create({preferences: {home_board: {id: '1_12345', key: 'aaaa/bbbb', level: 5}}}));
        app_state.set('currentBoardState', {key: 'aaaa/bbbb', id: '1_12345'});
        stashes.persist('board_level', 3);
        app_state.toggle_mode('speak', {override_state: {key: 'aaaa/bbbb', id: '1_12345', level: 1}});
        expect(app_state.get('speak_mode')).toEqual(true);
        expect(stashes.get('board_level')).toEqual(3);
      });

      it('should set the board level based on the override state if no other level setting available', function() {
        expect(app_state.get('speak_mode')).toEqual(false);
        app_state.set('sessionUser', EmberObject.create({preferences: {home_board: {id: '1_12345', key: 'aaaa/bbbb'}}}));
        app_state.set('currentBoardState', null);
        stashes.persist('board_level', null);
        app_state.toggle_mode('speak', {override_state: {key: 'aaaa/bbbb', id: '1_12345', level: 5}});
        expect(stashes.get('board_level')).toEqual(5);
      });

      it('should ignore the stashed board_level if not launching from a board view (i.e. currentBoardState=null)', function() {
        expect(app_state.get('speak_mode')).toEqual(false);
        app_state.set('sessionUser', EmberObject.create({preferences: {home_board: {id: '1_12345', key: 'aaaa/bbbb', level: 5}}}));
        app_state.set('currentBoardState', null);
        stashes.persist('board_level', 8);
        app_state.toggle_mode('speak', {override_state: {key: 'aaaa/bbbb', id: '1_12345'}});
        expect(stashes.get('board_level')).toEqual(5);
      });
    });
  });

//   it("should ignore current state if force specified as an option", function() {
//     stashes.set('current_mode', 'speak');
//     app_state.toggle_mode('speak');
//     expect(stashes.get('current_mode')).toEqual('default');
//
//     stashes.set('current_mode', 'speak');
//     app_state.toggle_mode('edit');
//     expect(stashes.get('current_mode')).toEqual('edit');
//
//     stashes.set('current_mode', 'speak');
//     app_state.toggle_mode('speak', {force: true});
//     expect(stashes.get('current_mode')).toEqual('speak');
//
//     stashes.set('current_mode', 'edit');
//     app_state.toggle_mode('edit');
//     expect(stashes.get('current_mode')).toEqual('speak');
//
//     stashes.set('current_mode', 'edit');
//     app_state.toggle_mode('edit', {force: true});
//     expect(stashes.get('current_mode')).toEqual('edit');
//   });

  describe('home_in_speak_mode', function() {
    it("should call toggle_mode", function() {
      var found_mode = null;
      var found_options = null;
      stub(app_state, 'toggle_mode', function(mode, options) {
        found_mode = mode;
        found_options = options;
      });
      stub(app_state.controller, 'transitionToRoute', function() { });
      app_state.home_in_speak_mode();
      expect(found_mode).toEqual('speak');
      expect(found_options).toEqual({force: true, override_state: {key: 'example/yesno'}});
    });

    it("should transition to the right route", function() {
      stub(app_state, 'toggle_mode', function(mode, options) {
      });
      var route = null;
      var key = null;
      stub(app_state.controller, 'transitionToRoute', function(r, k) {
        route = r;
        key = k;
      });
      app_state.home_in_speak_mode();
      expect(route).toEqual('board');
      expect(key).toEqual('example/yesno');
    });

    it("should use the current user's home board", function() {
      stub(app_state, 'toggle_mode', function(mode, options) {
      });
      var route = null;
      var key = null;
      app_state.set('sessionUser', EmberObject.create({
        preferences: {
          home_board: {key: 'example/inflections'}
        }
      }));
      stub(app_state.controller, 'transitionToRoute', function(r, k) {
        route = r;
        key = k;
      });
      app_state.home_in_speak_mode();
      expect(route).toEqual('board');
      expect(key).toEqual('example/inflections');
    });

    it("should fall back to a stashed board, or a hard-coded board", function() {
      stub(app_state, 'toggle_mode', function(mode, options) {
      });
      var route = null;
      var key = null;
      stub(app_state.controller, 'transitionToRoute', function(r, k) {
        route = r;
        key = k;
      });
      stashes.set('root_board_state', null);
      app_state.set('sessionUser', null);

      app_state.home_in_speak_mode();
      expect(route).toEqual('board');
      expect(key).toEqual('example/yesno');

      stashes.set('root_board_state', {key: 'example/keyboard'});
      app_state.home_in_speak_mode();
      expect(route).toEqual('board');
      expect(key).toEqual('example/keyboard');
    });
  });

  describe('check_scanning', function() {
    it("should start scanning if state is correct", function() {
      stashes.set('current_mode', 'speak');
      app_state.set('currentBoardState', {key: 'handle'});
      app_state.set('sessionUser', EmberObject.create({
        preferences: {
          device: {
            scanning: true,
            scanning_mode: 'some',
            scanning_interval: 1000,
            scanning_region_rows: 3,
            scanning_region_columns: 5
          }
        }
      }));
      var start = null;
      stub(scanner, 'start', function(options) {
        start = options;
      });
      app_state.check_scanning();
      expect(start).toEqual(null);
      waitsFor(function() { return start; });
      runs(function() {
        expect(start.scan_mode).toEqual('some');
        expect(start.interval).toEqual(1000);
        expect(start.vertical_chunks).toEqual(3);
        expect(start.horizontal_chunks).toEqual(5);
      });
    });

    it("should stop scanning if state is not correct", function() {
      stashes.set('current_mode', 'default');
      scanner.interval = true;
      var stopped = false;
      stub(scanner, 'stop', function() {
        stopped = true;
      });
      app_state.check_scanning();
      expect(stopped).toEqual(false);
      waitsFor(function() {
        return stopped;
      });
      runs();
    });
  });

  describe('refresh_session_user', function() {
    it("should try to find the specified user", function() {
      var promise = RSVP.resolve({user: {
        id: '1',
        user_name: 'fred'
      }});
      queryLog.defineFixture({
        method: 'GET',
        type: 'user',
        response: promise,
        id: "self"
      });
      app_state.refresh_session_user();
      waitsFor(function() { return app_state.get('sessionUser.id'); });
      runs(function() {
        expect(app_state.get('sessionUser.user_name')).toEqual('fred');
        app_state.set('sessionUser', null);
      });
    });
  });

  describe('set_speak_mode_user', function() {
    beforeEach(function() {
      editManager.board = null;
      app_state.set('speakModeUser', null);
      stashes.persist('speak_mode_user_id', null);
      stashes.persist('referenced_speak_mode_user_id', null);
      stashes.persist('current_mode', 'default');
      stashes.persist('modeling', false);
      stashes.persist('root_board_state', null);
      stashes.persist('temporary_root_board_state', null);

      app_state.set('currentBoardState', {key: 'trains'});
    });

    it("should clear SpeakModeUser if set to self", function() {
      stashes.set('current_mode', 'speak');
      app_state.set('sessionUser', null);
      app_state.set('speakModeUser', LingoLinq.store.createRecord('user', {id: '2345'}));
      app_state.set_speak_mode_user('self');
      expect(app_state.get('speakModeUser')).toEqual(null);

      app_state.set('speakModeUser', EmberObject.create({id: '3456'}));
      var u = EmberObject.create({id: '1234'});
      u.set('currently_premium', true);
      app_state.set('sessionUser', u);
      app_state.set_speak_mode_user('1234');
      expect(app_state.get('speakModeUser')).toEqual(null);
      app_state.set('sessionUser', null);
    });

    it("should find specified user if not set to self", function() {
      var promise = RSVP.resolve({user: {
        id: '1234',
        user_name: 'fred'
      }});
      queryLog.defineFixture({
        method: 'GET',
        type: 'user',
        response: promise,
        id: "1234"
      });
      var speak_mode_toggled = false;
      stub(app_state, 'toggle_speak_mode', function() { speak_mode_toggled = true; });
      app_state.set('currentBoardState', {key: 'trains'});
      app_state.set_speak_mode_user('1234');
      waitsFor(function() { return app_state.get('speakModeUser'); });
      runs(function() {
        expect(app_state.get('speakModeUser.user_name')).toEqual('fred');
        expect(app_state.get('speakModeUser.id')).toEqual('1234');
        expect(speak_mode_toggled).toEqual(true);
      });
    });
    it("should alert on failed user retrieval", function() {
      var promise = RSVP.reject({stub: true});
      queryLog.defineFixture({
        method: 'GET',
        type: 'user',
        response: promise,
        id: "1234"
      });
      promise.then(null, function() { });
      var danger;
      stub(modal, 'error', function(msg) {
        danger = msg;
      });
      stub(app_state, 'toggle_speak_mode', function() { });
      app_state.set_speak_mode_user('1234');
      waitsFor(function() { return danger; });
      runs(function() {
        expect(danger).toEqual("Failed to retrieve user for Speak Mode");
        expect(app_state.get('speakModeUser.user_name')).toEqual(null);
        expect(stashes.get('current_mode')).toEqual('default');
        expect(app_state.get('currentUser.id')).toEqual(null);
      });
    });

    it("should jump to the current user's home board if requested", function() {
      var promise = RSVP.resolve({user: {
        id: '1234',
        user_name: 'fred',
        preferences: {
          home_board: {key: 'a/b'}
        },
        membership_type: 'premium'
      }});
      queryLog.defineFixture({
        method: 'GET',
        type: 'user',
        response: promise,
        id: "1234"
      });
      var home_args = null;
      stub(app_state, 'home_in_speak_mode', function(args) { home_args = args; });
      app_state.set_speak_mode_user('1234', true);
      waitsFor(function() { return app_state.get('speakModeUser') && home_args; });
      runs(function() {
        expect(app_state.get('speakModeUser.user_name')).toEqual('fred');
        expect(app_state.get('speakModeUser.id')).toEqual('1234');
        expect(home_args.user.get('id')).toEqual('1234');
      });
    });

    it("should not jump to the user's home board if not requested", function() {
      var promise = RSVP.resolve({user: {
        id: '1234',
        user_name: 'fred',
        preferences: {
          home_board: {key: 'a/b'}
        },
        membership_type: 'premium'
      }});
      queryLog.defineFixture({
        method: 'GET',
        type: 'user',
        response: promise,
        id: "1234"
      });
      var home_args = null;
      stub(app_state, 'home_in_speak_mode', function(args) { home_args = args; });
      app_state.set_speak_mode_user('1234', false);
      waitsFor(function() { return app_state.get('speakModeUser'); });
      runs(function() {
        expect(app_state.get('speakModeUser.user_name')).toEqual('fred');
        expect(app_state.get('speakModeUser.id')).toEqual('1234');
        expect(home_args).toEqual(null);
      });
    });

    it("should jump to the session user's home board if the current user has no home board and jumping is requested", function() {
      var promise = RSVP.resolve({user: {
        id: '1234',
        user_name: 'fred',
        preferences: {
          home_board: {key: 'a/b'}
        },
        membership_type: 'premium'
      }});
      queryLog.defineFixture({
        method: 'GET',
        type: 'user',
        response: promise,
        id: "1234"
      });
      app_state.set('sessionUser', EmberObject.create({id: '234', preferences: {home_board: {key: 'c/d'}}}));

      stashes.set('current_mode', 'default');
      var home_args = null;
      stub(app_state, 'home_in_speak_mode', function(args) { home_args = args; });
      app_state.set_speak_mode_user('1234', true);
      waitsFor(function() { return app_state.get('speakModeUser') && home_args; });
      runs(function() {
        expect(app_state.get('speakModeUser.user_name')).toEqual('fred');
        expect(app_state.get('speakModeUser.id')).toEqual('1234');
        expect(home_args.user.get('id')).toEqual('1234');
        expect(home_args.fallback_board_state).toEqual({key: 'c/d'});
      });
    });

    it("should jump to the found user's home board but keep as self if found and requested", function() {
      var promise = RSVP.resolve({user: {
        id: '1234',
        user_name: 'fred',
        preferences: {
          home_board: {key: 'a/b'}
        },
        membership_type: 'premium'
      }});
      queryLog.defineFixture({
        method: 'GET',
        type: 'user',
        response: promise,
        id: "1234"
      });
      var home_args = null;
      stub(app_state, 'home_in_speak_mode', function(args) { home_args = args; });
      app_state.set_speak_mode_user('1234', true, true);
      waitsFor(function() { return home_args; });
      runs(function() {
        expect(app_state.get('speakModeUser')).toEqual(null);
        expect(home_args.user.get('id')).toEqual('1234');
      });
    });

    it("should remember the found user for reuse after reload", function() {
      var promise = RSVP.resolve({user: {
        id: '1234',
        user_name: 'fred'
      }});
      queryLog.defineFixture({
        method: 'GET',
        type: 'user',
        response: promise,
        id: "1234"
      });
      stashes.set('speak_mode_user_id', null);
      var speak_mode_toggled = false;
      stub(app_state, 'toggle_speak_mode', function() { speak_mode_toggled = true; });
      expect(stashes.get('speak_mode_user_id')).toEqual(null);
      app_state.set_speak_mode_user('1234');
      waitsFor(function() { return app_state.get('speakModeUser'); });
      runs(function() {
        expect(app_state.get('speakModeUser.user_name')).toEqual('fred');
        expect(app_state.get('speakModeUser.id')).toEqual('1234');
        expect(speak_mode_toggled).toEqual(true);
        expect(stashes.get('speak_mode_user_id')).toEqual('1234');
      });
    });

//  set_speak_mode_user: function(board_user_id, jump_home, keep_as_self) {

    it('should set the current board to temporary home and remember the real home if not jumping', function() {
      var session_user = EmberObject.create({id: '234', preferences: {home_board: {id: '111', key: 'home/one'}}});
      app_state.set('sessionUser', session_user);
      app_state.set_speak_mode_user('self', false, true);
      expect(stashes.get('root_board_state')).toEqual({id: '111', key: 'home/one'});
      expect(stashes.get('temporary_root_board_state')).toEqual({key: 'trains'});
      expect(app_state.get('currentUser.id')).toEqual('234');
      expect(app_state.get('currentBoardState')).toEqual({key: 'trains'});
      expect(!!app_state.get('modeling')).toEqual(false);
    });

    it('should set the current board to temporary home and remember the real home if not jumping and user it matches session user', function() {
      var session_user = EmberObject.create({id: '234', preferences: {home_board: {id: '111', key: 'home/one'}}});
      app_state.set('sessionUser', session_user);
      app_state.set_speak_mode_user('234', false, true);
      expect(stashes.get('root_board_state')).toEqual({id: '111', key: 'home/one'});
      expect(stashes.get('temporary_root_board_state')).toEqual({key: 'trains'});
      expect(app_state.get('currentUser.id')).toEqual('234');
      expect(app_state.get('currentBoardState')).toEqual({key: 'trains'});
      expect(app_state.get('referenced_speak_mode_user.id')).toEqual(undefined);
      expect(!!app_state.get('modeling')).toEqual(false);
    });

    it('should mark as the modeled user if entering in modeling mode', function() {
      var session_user = EmberObject.create({id: '234', preferences: {home_board: {id: '111', key: 'home/one'}}});
      queryLog.defineFixture({
        method: 'GET',
        type: 'user',
        response: RSVP.resolve({user: {
          id: '2345',
          user_name: 'modeling_user',
          preferences: {
            home_board: {id: '222', key: 'home/two'}
          }
        }}),
        id: '2345'
      });
      app_state.set('sessionUser', session_user);
      app_state.set_speak_mode_user('2345', false, true);
      waitsFor(function() { return app_state.get('modeling'); });
      runs(function() {
        expect(stashes.get('root_board_state')).toEqual({id: '222', key: 'home/two'});
        expect(stashes.get('temporary_root_board_state')).toEqual({key: 'trains'});
        expect(app_state.get('currentBoardState')).toEqual({key: 'trains'});
        expect(app_state.get('currentUser.id')).toEqual('234');
        expect(app_state.get('referenced_speak_mode_user.id')).toEqual('2345');
        expect(app_state.get('modeling_for_user')).toEqual(true);
        expect(!!app_state.get('manual_modeling')).toEqual(false);
      });
    });

    it('should mark the current board as temporary home if already in speak mode and switching without jumping', function() {
      var session_user = EmberObject.create({id: '234', preferences: {home_board: {id: '111', key: 'home/one'}}});
      stashes.set('current_mode', 'speak');
      queryLog.defineFixture({
        method: 'GET',
        type: 'user',
        response: RSVP.resolve({user: {
          id: '2345',
          user_name: 'modeling_user',
          preferences: {
            home_board: {id: '222', key: 'home/two'}
          }
        }}),
        id: '2345'
      });
      expect(app_state.get('speak_mode')).toEqual(true);
      app_state.set('sessionUser', session_user);
      app_state.set_speak_mode_user('2345', false, true);
      waitsFor(function() { return app_state.get('modeling_for_user'); });
      runs(function() {
        expect(stashes.get('root_board_state')).toEqual({id: '222', key: 'home/two'});
        expect(stashes.get('temporary_root_board_state')).toEqual({key: 'trains'});
        expect(app_state.get('currentUser.id')).toEqual('234');
        expect(app_state.get('referenced_speak_mode_user.id')).toEqual('2345');
        expect(app_state.get('currentBoardState')).toEqual({key: 'trains'});
        expect(app_state.get('modeling_for_user')).toEqual(true);
        expect(!!app_state.get('manual_modeling')).toEqual(false);
      });
    });

    it('should remember the session user real home if not modeling and not jumping', function() {
      var session_user = EmberObject.create({id: '234', preferences: {home_board: {id: '111', key: 'home/one'}}});
      stashes.persist('root_board_state', null);
      app_state.set('sessionUser', session_user);
      app_state.set_speak_mode_user('self', false, true);
      waitsFor(function() { return stashes.get('root_board_state'); });
      runs(function() {
        expect(stashes.get('root_board_state')).toEqual({id: '111', key: 'home/one'});
        expect(stashes.get('temporary_root_board_state')).toEqual({key: 'trains'});
        expect(app_state.get('currentUser.id')).toEqual('234');
        expect(app_state.get('referenced_speak_mode_user.id')).toEqual(undefined);
        expect(app_state.get('currentBoardState')).toEqual({key: 'trains'});
        expect(app_state.get('modeling_for_user')).toEqual(false);
        expect(!!app_state.get('manual_modeling')).toEqual(false);
      });
    });

    it('should remember the specified user real home if modeling and not jumping', function() {
      var session_user = EmberObject.create({id: '234', preferences: {home_board: {id: '111', key: 'home/one'}}});
      stashes.set('current_mode', 'speak');
      queryLog.defineFixture({
        method: 'GET',
        type: 'user',
        response: RSVP.resolve({user: {
          id: '2345',
          user_name: 'modeling_user',
          preferences: {
            home_board: {id: '222', key: 'home/two'}
          }
        }}),
        id: '2345'
      });
      expect(app_state.get('speak_mode')).toEqual(true);
      app_state.set('sessionUser', session_user);
      app_state.set_speak_mode_user('2345', false, true);
      waitsFor(function() { return app_state.get('modeling_for_user'); });
      runs(function() {
        expect(stashes.get('root_board_state')).toEqual({id: '222', key: 'home/two'});
        expect(stashes.get('temporary_root_board_state')).toEqual({key: 'trains'});
        expect(app_state.get('referenced_speak_mode_user.id')).toEqual('2345');
        expect(app_state.get('currentBoardState')).toEqual({key: 'trains'});
        expect(app_state.get('modeling_for_user')).toEqual(true);
        expect(!!app_state.get('manual_modeling')).toEqual(false);
      });
    });

    it('should remember the specified user real home if entering as the user and not jumping', function() {
      var session_user = EmberObject.create({id: '234', preferences: {home_board: {id: '111', key: 'home/one'}}});
      queryLog.defineFixture({
        method: 'GET',
        type: 'user',
        response: RSVP.resolve({user: {
          id: '2345',
          user_name: 'modeling_user',
          preferences: {
            home_board: {id: '222', key: 'home/two'}
          }
        }}),
        id: '2345'
      });
      expect(app_state.get('speak_mode')).toEqual(false);
      app_state.set('sessionUser', session_user);
      app_state.set_speak_mode_user('2345', false, false);
      waitsFor(function() { return app_state.get('speakModeUser'); });
      runs(function() {
        expect(stashes.get('root_board_state')).toEqual({id: '222', key: 'home/two'});
        expect(stashes.get('temporary_root_board_state')).toEqual({key: 'trains'});
        expect(app_state.get('currentUser.id')).toEqual('2345');
        expect(app_state.get('referenced_speak_mode_user.id')).toEqual('2345');
        expect(app_state.get('currentBoardState')).toEqual({key: 'trains'});
        expect(app_state.get('speakModeUser.id')).toEqual('2345');
        expect(app_state.get('modeling_for_user')).toEqual(false);
        expect(!!app_state.get('manual_modeling')).toEqual(false);
      });
    });

    it('should not mark as temporary home if jumping to the actual home', function() {
      var session_user = EmberObject.create({id: '234', preferences: {home_board: {id: '111', key: 'home/one'}}});
      queryLog.defineFixture({
        method: 'GET',
        type: 'user',
        response: RSVP.resolve({user: {
          id: '2345',
          user_name: 'modeling_user',
          preferences: {
            home_board: {id: '222', key: 'home/two'}
          }
        }}),
        id: '2345'
      });
      stub(modal, 'open', function(type) {
        if(type == 'premium-required') { return RSVP.resolve(); }
        return RSVP.reject();
      });
      expect(app_state.get('speak_mode')).toEqual(false);
      app_state.set('sessionUser', session_user);
      app_state.set_speak_mode_user('2345', true, false);
      waitsFor(function() { return app_state.get('speakModeUser'); });
      runs(function() {
        expect(stashes.get('root_board_state')).toEqual({id: '222', key: 'home/two'});
        expect(stashes.get('temporary_root_board_state')).toEqual(null);
        expect(app_state.get('referenced_speak_mode_user.id')).toEqual('2345');
        expect(app_state.get('currentUser.id')).toEqual('2345');
        expect(app_state.routed_to).toEqual(['board', 'home/two']);
        expect(app_state.get('speakModeUser.id')).toEqual('2345');
        expect(app_state.get('modeling_for_user')).toEqual(false);
        expect(!!app_state.get('manual_modeling')).toEqual(false);
      });
    });

    it('should jump to the session user home if not modeling and not entering as the user', function() {
      var session_user = EmberObject.create({id: '234', preferences: {home_board: {id: '111', key: 'home/one'}}});
      expect(app_state.get('speak_mode')).toEqual(false);
      app_state.set('sessionUser', session_user);
      app_state.set_speak_mode_user('234', true, true);
      waitsFor(function() { return stashes.get('root_board_state.id') == '111'; });
      runs(function() {
        expect(stashes.get('root_board_state')).toEqual({id: '111', key: 'home/one'});
        expect(stashes.get('temporary_root_board_state')).toEqual(null);
        expect(app_state.get('referenced_speak_mode_user.id')).toEqual(undefined);
        expect(app_state.get('currentUser.id')).toEqual('234');
        expect(app_state.routed_to).toEqual(['board', 'home/one']);
        expect(app_state.get('speakModeUser.id')).toEqual(undefined);
        expect(app_state.get('modeling_for_user')).toEqual(false);
        expect(!!app_state.get('manual_modeling')).toEqual(false);
      });
    });

    it('should jump to the modeled user home if modeling', function() {
      var session_user = EmberObject.create({id: '234', preferences: {home_board: {id: '111', key: 'home/one'}}});
      queryLog.defineFixture({
        method: 'GET',
        type: 'user',
        response: RSVP.resolve({user: {
          id: '2345',
          user_name: 'modeling_user',
          preferences: {
            home_board: {id: '222', key: 'home/two'}
          }
        }}),
        id: '2345'
      });
      stub(modal, 'open', function(type) {
        if(type == 'premium-required') { return RSVP.resolve(); }
        return RSVP.reject();
      });
      expect(app_state.get('speak_mode')).toEqual(false);
      app_state.set('sessionUser', session_user);
      app_state.set_speak_mode_user('2345', true, true);
      waitsFor(function() { return stashes.get('root_board_state.id') == '222'; });
      runs(function() {
        expect(stashes.get('root_board_state')).toEqual({id: '222', key: 'home/two'});
        expect(stashes.get('temporary_root_board_state')).toEqual(null);
        expect(app_state.get('referenced_speak_mode_user.id')).toEqual('2345');
        expect(app_state.get('currentUser.id')).toEqual('234');
        expect(app_state.routed_to).toEqual(['board', 'home/two']);
        expect(app_state.get('speakModeUser.id')).toEqual(undefined);
        expect(app_state.get('modeling_for_user')).toEqual(true);
        expect(!!app_state.get('manual_modeling')).toEqual(false);
      });
    });

    it('should jump to the modeling user home if entering as the user', function() {
      var session_user = EmberObject.create({id: '234', preferences: {home_board: {id: '111', key: 'home/one'}}});
      queryLog.defineFixture({
        method: 'GET',
        type: 'user',
        response: RSVP.resolve({user: {
          id: '2345',
          user_name: 'modeling_user',
          preferences: {
            home_board: {id: '222', key: 'home/two'}
          }
        }}),
        id: '2345'
      });
      stub(modal, 'open', function(type) {
        if(type == 'premium-required') { return RSVP.resolve(); }
        return RSVP.reject();
      });
      expect(app_state.get('speak_mode')).toEqual(false);
      app_state.set('sessionUser', session_user);
      app_state.set_speak_mode_user('2345', true, false);
      waitsFor(function() { return app_state.get('speakModeUser'); });
      runs(function() {
        expect(stashes.get('root_board_state')).toEqual({id: '222', key: 'home/two'});
        expect(stashes.get('temporary_root_board_state')).toEqual(null);
        expect(app_state.get('referenced_speak_mode_user.id')).toEqual('2345');
        expect(app_state.get('currentUser.id')).toEqual('2345');
        expect(app_state.routed_to).toEqual(['board', 'home/two']);
        expect(app_state.get('speakModeUser.id')).toEqual('2345');
        expect(app_state.get('modeling_for_user')).toEqual(false);
        expect(!!app_state.get('manual_modeling')).toEqual(false);
      });
    });

    it('should mark as modeling mode if keeping as self for different user', function() {
      var session_user = EmberObject.create({id: '234', preferences: {home_board: {id: '111', key: 'home/one'}}});
      queryLog.defineFixture({
        method: 'GET',
        type: 'user',
        response: RSVP.resolve({user: {
          id: '2345',
          user_name: 'modeling_user',
          preferences: {
            home_board: {id: '222', key: 'home/two'}
          }
        }}),
        id: '2345'
      });
      expect(app_state.get('speak_mode')).toEqual(false);
      app_state.set('sessionUser', session_user);
      app_state.set_speak_mode_user('2345', false, true);
      waitsFor(function() { return stashes.get('root_board_state'); });
      runs(function() {
        expect(stashes.get('root_board_state')).toEqual({id: '222', key: 'home/two'});
        expect(stashes.get('temporary_root_board_state')).toEqual({key: 'trains'});
        expect(app_state.get('referenced_speak_mode_user.id')).toEqual('2345');
        expect(app_state.get('currentUser.id')).toEqual('234');
        expect(app_state.get('currentBoardState')).toEqual({key: 'trains'});
        expect(app_state.get('speakModeUser.id')).toEqual(undefined);
        expect(app_state.get('modeling_for_user')).toEqual(true);
        expect(!!app_state.get('manual_modeling')).toEqual(false);
      });
    });

    it('should not mark as modeling mode if entering as self', function() {
      var session_user = EmberObject.create({id: '234', preferences: {home_board: {id: '111', key: 'home/one'}}});
      queryLog.defineFixture({
        method: 'GET',
        type: 'user',
        response: RSVP.resolve({user: {
          id: '2345',
          user_name: 'modeling_user',
          preferences: {
            home_board: {id: '222', key: 'home/two'}
          }
        }}),
        id: '2345'
      });
      expect(app_state.get('speak_mode')).toEqual(false);
      app_state.set('sessionUser', session_user);
      app_state.set_speak_mode_user('self', true, true);
      waitsFor(function() { return stashes.get('root_board_state'); });
      runs(function() {
        expect(stashes.get('root_board_state')).toEqual({id: '111', key: 'home/one'});
        expect(stashes.get('temporary_root_board_state')).toEqual(null);
        expect(app_state.get('referenced_speak_mode_user.id')).toEqual(undefined);
        expect(app_state.get('currentUser.id')).toEqual('234');
        expect(app_state.routed_to).toEqual(['board', 'home/one']);
        expect(app_state.get('speakModeUser.id')).toEqual(undefined);
        expect(app_state.get('modeling_for_user')).toEqual(false);
        expect(!!app_state.get('manual_modeling')).toEqual(false);
      });
    });

    it('should not mark as modeling mode if entering as another user', function() {
      var session_user = EmberObject.create({id: '234', preferences: {home_board: {id: '111', key: 'home/one'}}});
      queryLog.defineFixture({
        method: 'GET',
        type: 'user',
        response: RSVP.resolve({user: {
          id: '2345',
          user_name: 'modeling_user',
          preferences: {
            home_board: {id: '222', key: 'home/two'}
          }
        }}),
        id: '2345'
      });
      stub(modal, 'open', function(type) {
        if(type == 'premium-required') { return RSVP.resolve(); }
        return RSVP.reject();
      });
      expect(app_state.get('speak_mode')).toEqual(false);
      app_state.set('sessionUser', session_user);
      app_state.set_speak_mode_user('2345', true, false);
      waitsFor(function() { return app_state.routed_to && app_state.routed_to[1] == 'home/two'; });
      runs(function() {
        expect(stashes.get('root_board_state')).toEqual({id: '222', key: 'home/two'});
        expect(stashes.get('temporary_root_board_state')).toEqual(null);
        expect(app_state.get('referenced_speak_mode_user.id')).toEqual('2345');
        expect(app_state.get('currentUser.id')).toEqual('2345');
        expect(app_state.routed_to).toEqual(['board', 'home/two']);
        expect(app_state.get('speakModeUser.id')).toEqual('2345');
        expect(app_state.get('modeling_for_user')).toEqual(false);
        expect(!!app_state.get('manual_modeling')).toEqual(false);
      });
    });
  });

  it('should clear locales when exiting speak mode', function() {
    app_state.set('label_locale', 'bacon');
    app_state.set('vocalization_locale', 'cheddar');
    app_state.toggle_speak_mode();
    expect(app_state.get('lable_locale')).toEqual(null);
    expect(app_state.get('vocalization_localte')).toEqual(null);
  });

  describe('set_current_user', function() {
    it("should update user based on observed attributes", function() {
      var standalone = navigator.standalone;
      navigator.standalone = false;


      app_state.did_set_current_user = false;
      var level = 0;
      app_state.set('sessionUser', null);
      app_state.set('speakModeUser', null);
      app_state.set('currentBoardState', {key: 'asdf'});
      stashes.set('current_mode', 'default');
      waitsFor(function() { return app_state.did_set_current_user; });
      runs(function() {
        expect(app_state.get('currentUser')).toEqual(null);
        level = 1;

        app_state.did_set_current_user = false;
        app_state.set('speakModeUser', EmberObject.create({id: '123'}));
      });

      waitsFor(function() { return level == 1 && app_state.did_set_current_user; });
      runs(function() {
        expect(app_state.get('currentUser')).toEqual(null);
        level = 2;
        app_state.did_set_current_user = false;
        stashes.set('current_mode', 'speak');
      });


      waitsFor(function() { return level == 2 && app_state.did_set_current_user; });
      runs(function() {
        expect(app_state.get('currentUser.id')).toEqual('123');
        level = 3;
        app_state.did_set_current_user = false;
        stashes.set('current_mode', 'default');
      });

      waitsFor(function() { return level == 3 && app_state.did_set_current_user; });
      runs(function() {
        expect(app_state.get('currentUser.id')).toEqual(null);
        level = 4;
        stashes.set('current_mode', 'speak');
      });

      waitsFor(function() { return level == 4 && app_state.get('currentUser.id') == '123'; });
      runs(function() {
        level = 5;
        app_state.did_set_current_user = false;
        app_state.set('sessionUser', EmberObject.create({id: '234'}));
      });

      waitsFor(function() { return level == 5 && app_state.did_set_current_user; });
      runs(function() {
        expect(app_state.get('currentUser.id')).toEqual('123');
        level = 6;
        stashes.set('current_mode', 'default');
      });

      waitsFor(function() { return level == 6 && app_state.get('currentUser.id') == '234'; });
      runs(function() {
        navigator.standalone = standalone;
        app_state.set('sessionUser', null);
      });
    });

    it("should update user preferences for app_added if necessary", function() {
      var standalone = navigator.standalone;
      navigator.standalone = true;
      var user = EmberObject.create({
        preferences: {
          progress: {}
        }
      });
      var saved = false;
      stub(user, 'save', function() {
        saved = true;
        return RSVP.resolve();
      });
      app_state.set('speakModeUser', null);
      stashes.set('current_mode', 'default');
      app_state.set('sessionUser', user);
      waitsFor(function() { return saved; });
      runs(function() {
        expect(1).toEqual(1);
        navigator.standalone = standalone;
      });
    });
  });

  describe('get_history', function() {
    it("should return boardHistory when in speak mode", function() {
      stashes.set('boardHistory', []);
      stashes.set('browse_history', [{}, {}]);
      stashes.set('current_mode', 'speak');
      app_state.set('currentBoardState', {key: 'yodel'});
      expect(app_state.get_history()).toEqual([]);
    });

    it("should return browse_history when not in speak mode", function() {
      stashes.set('boardHistory', []);
      stashes.set('browse_history', [{}, {}]);
      stashes.set('current_mode', 'default');
      expect(app_state.get_history()).toEqual([{}, {}]);
    });
  });

  describe('set_history', function() {
    it("should stash boardHistory when in speak mode", function() {
      stashes.set('boardHistory', []);
      stashes.set('browse_history', [{}, {}]);
      stashes.set('current_mode', 'speak');
      app_state.set('currentBoardState', {key: 'yodel'});
      app_state.set_history([{}]);
      expect(stashes.get('boardHistory')).toEqual([{}]);
      expect(stashes.get('browse_history')).toEqual([{}, {}]);
    });

    it("should stash browse_history when not in speak mode", function() {
      stashes.set('boardHistory', []);
      stashes.set('browse_history', [{}, {}]);
      stashes.set('current_mode', 'default');
      app_state.set('currentBoardState', {key: 'yodel'});
      app_state.set_history([{}]);
      expect(stashes.get('boardHistory')).toEqual([]);
      expect(stashes.get('browse_history')).toEqual([{}]);
    });
  });

  describe('computed properties', function() {
    it("should properly compute empty_header", function() {
      stashes.set('current_mode', 'default');
      app_state.set('currentBoardState', null);
      app_state.set('hide_search', false);
      expect(app_state.get('empty_header')).toEqual(true);

      app_state.set('hide_search', true);
      expect(app_state.get('empty_header')).toEqual(false);

      app_state.set('hide_search', false);
      app_state.set('hide_search', true);
      app_state.set('currentBoardState', {});
      expect(app_state.get('empty_header')).toEqual(false);

      app_state.set('currentBoardState', null);
      app_state.set('hide_search', true);
      stashes.set('current_mode', 'speak');
      app_state.set('hide_search', false);
    });

    it("should properly compute speak_mode", function() {
      stashes.set('current_mode', 'speak');
      app_state.set('currentBoardState', {key: 'train'});
      expect(app_state.get('speak_mode')).toEqual(true);

      app_state.set('currentBoardState', null);
      expect(app_state.get('speak_mode')).toEqual(false);

      app_state.set('currentBoardState', {key: 'train'});
      expect(app_state.get('speak_mode')).toEqual(true);

      stashes.set('current_mode', 'default');
      expect(app_state.get('speak_mode')).toEqual(false);
    });

    it("should properly compute edit_mode", function() {
      stashes.set('current_mode', 'edit');
      app_state.set('currentBoardState', {key: 'panel'});
      expect(app_state.get('edit_mode')).toEqual(true);

      app_state.set('currentBoardState', null);
      expect(app_state.get('edit_mode')).toEqual(false);

      app_state.set('currentBoardState', {key: 'panel'});
      expect(app_state.get('edit_mode')).toEqual(true);

      stashes.set('current_mode', 'default');
      expect(app_state.get('edit_mode')).toEqual(false);
    });

    it("should properly compute default_mode", function() {
      stashes.set('current_mode', 'default');
      app_state.set('currentBoardState', null);
      expect(app_state.get('default_mode')).toEqual(true);

      app_state.set('currentBoardState', {});
      expect(app_state.get('default_mode')).toEqual(true);

      stashes.set('current_mode', 'speak');
      expect(app_state.get('default_mode')).toEqual(false);

      app_state.set('currentBoardState', null);
      expect(app_state.get('default_mode')).toEqual(true);
    });

    it("should properly compute limited_speak_mode_options", function() {
      stashes.set('current_mode', 'speak');
      app_state.set('currentBoardState', {key: 'olive'});
      var user = EmberObject.create({
        preferences: {
          require_speak_mode_pin: true
        }
      });
      app_state.set('sessionUser', user);
      expect(app_state.get('limited_speak_mode_options')).toEqual(true);

      user.set('preferences.require_speak_mode_pin', false);
      expect(app_state.get('limited_speak_mode_options')).toEqual(true);

      user.set('preferences.require_speak_mode_pin', true);
      expect(app_state.get('limited_speak_mode_options')).toEqual(true);

      stashes.set('current_mode', 'default');
      expect(app_state.get('limited_speak_mode_options')).toEqual(false);
    });

    it("should properly compute current_board_name", function() {
      app_state.set('currentBoardState', {key: 'example/philharmonic'});
      expect(app_state.get('current_board_name')).toEqual('philharmonic');

      app_state.set('currentBoardState', {});
      expect(app_state.get('current_board_name')).toEqual(null);

      app_state.set('currentBoardState', null);
      expect(app_state.get('current_board_name')).toEqual(null);
    });

    it("should properly compute current_board_user_name", function() {
      app_state.set('currentBoardState', {key: 'example/philharmonic'});
      expect(app_state.get('current_board_user_name')).toEqual('example');

      app_state.set('currentBoardState', {});
      expect(app_state.get('current_board_user_name')).toEqual(null);

      app_state.set('currentBoardState', null);
      expect(app_state.get('current_board_user_name')).toEqual(null);
    });

    it("should properly compute current_board_is_home", function() {
      app_state.set('currentBoardState', {key: 'example/monkey', id: '1_1'});
      var user = EmberObject.create({
        preferences: {
          home_board: {id: '1_1'}
        }
      });
      app_state.set('sessionUser', user);
      expect(app_state.get('current_board_is_home')).toEqual(true);

      app_state.set('currentBoardState', {key: 'example/noodle', id: '1_2'});
      expect(app_state.get('current_board_is_home')).toEqual(false);

      user.set('preferences.home_board.id', '1_2');
      expect(app_state.get('current_board_is_home')).toEqual(true);

      app_state.set('currentUser', null);
      expect(app_state.get('current_board_is_home')).toEqual(false);
    });

    it("should properly compute current_board_not_home_or_supervising", function() {
      var user = EmberObject.create({
        preferences: {
          home_board: {id: '1_1'}
        }
      });
      app_state.set('sessionUser', user);
      expect(app_state.get('current_board_is_home')).toEqual(false);
      expect(app_state.get('current_board_not_home_or_supervising')).toEqual(true);

      app_state.set('currentBoardState', {key: 'example/monkey', id: '1_1'});
      expect(app_state.get('current_board_is_home')).toEqual(true);
      expect(app_state.get('current_board_not_home_or_supervising')).toEqual(false);

      user.set('supervisees', [{}]);
      expect(app_state.get('current_board_is_home')).toEqual(true);
      expect(app_state.get('current_board_not_home_or_supervising')).toEqual(true);

      user.set('supervisees', []);
      expect(app_state.get('current_board_not_home_or_supervising')).toEqual(false);
    });


    it("should properly compute current_board_is_speak_mode_home", function() {
      app_state.set('currentBoardState', {key: 'example/cuttlefish', id: '1_1'});
      expect(app_state.get('current_board_is_speak_mode_home')).toEqual(false);
      stashes.set('root_board_state', {key: 'example/frog', id: '1_2'});
      expect(app_state.get('current_board_is_speak_mode_home')).toEqual(false);
      stashes.set('temporary_root_board_state', {key: 'example/cuttlefish', id: '1_1'});
      expect(app_state.get('current_board_is_speak_mode_home')).toEqual(false);
      stashes.set('current_mode', 'speak');
      expect(app_state.get('current_board_is_speak_mode_home')).toEqual(true);
      stashes.set('temporary_root_board_state', null);
      expect(app_state.get('current_board_is_speak_mode_home')).toEqual(false);
      app_state.set('currentBoardState', {key: 'example/frog', id: '1_2'});
      expect(app_state.get('current_board_is_speak_mode_home')).toEqual(true);
    });

    it("should properly compute current_board_in_board_set", function() {
      var user = EmberObject.create({
        stats: {
          board_set_ids: ['1_2', '1_3', '1_4']
        }
      });
      expect(app_state.get('current_board_in_board_set')).toEqual(false);
      app_state.set('sessionUser', user);
      expect(app_state.get('current_board_in_board_set')).toEqual(false);
      app_state.set('currentBoardState', {key: 'example/hat', id: '1_4'});
      expect(app_state.get('current_board_in_board_set')).toEqual(true);
      app_state.set('currentBoardState', {key: 'example/hat', id: '1_5'});
      expect(app_state.get('current_board_in_board_set')).toEqual(false);
    });


    it("should properly compute current_board_in_extended_board_set", function() {
      var user = EmberObject.create({
        stats: {
          board_set_ids_including_supervisees: ['1_2', '1_3', '1_4']
        }
      });
      expect(app_state.get('current_board_in_extended_board_set')).toEqual(false);
      app_state.set('sessionUser', user);
      expect(app_state.get('current_board_in_extended_board_set')).toEqual(false);
      app_state.set('currentBoardState', {key: 'example/hat', id: '1_4'});
      expect(app_state.get('current_board_in_extended_board_set')).toEqual(true);
      app_state.set('currentBoardState', {key: 'example/hat', id: '1_5'});
      expect(app_state.get('current_board_in_extended_board_set')).toEqual(false);
    });

    it("should properly compute speak_mode_possible", function() {
      app_state.set('currentBoardState', {key: 'xylo'});
      var user = EmberObject.create({
        preferences: {
          home_board: {key: 'xylo'}
        }
      });
      app_state.set('sessionUser', user);
      expect(app_state.get('speak_mode_possible')).toEqual(true);

      app_state.set('currentBoardState', null);
      expect(app_state.get('speak_mode_possible')).toEqual(true);

      app_state.set('sessionUser.preferences.home_board', null);
      expect(app_state.get('speak_mode_possible')).toEqual(false);
    });

    it("should properly compute board_in_current_user_set", function() {
      app_state.set('currentBoardState', {id: '1_1'});
      var user = EmberObject.create({
        stats: {
          board_set_ids: ['1_2', '1_3', '1_1']
        }
      });
      app_state.set('sessionUser', user);
      expect(app_state.get('board_in_current_user_set')).toEqual(true);

      app_state.set('sessionUser.stats.board_set_ids', ['1_2', '1_3']);
      expect(app_state.get('board_in_current_user_set')).toEqual(false);

      app_state.set('sessionUser.stats.board_set_ids', ['1_1']);
      expect(app_state.get('board_in_current_user_set')).toEqual(true);

      app_state.set('currentBoardState', {id: '1_2'});
      expect(app_state.get('board_in_current_user_set')).toEqual(false);
    });

    it("should properly compute empty_board_history", function() {
      stashes.set('boardHistory', []);
      stashes.set('browse_history', []);
      expect(app_state.get('empty_board_history')).toEqual(true);

      stashes.set('browse_history', [{}]);
      expect(app_state.get('empty_board_history')).toEqual(false);

      stashes.set('current_mode', 'speak');
      app_state.set('currentBoardState', {key: 'handle'});
      expect(app_state.get('empty_board_history')).toEqual(true);

      stashes.set('boardHistory', [{}]);
      expect(app_state.get('empty_board_history')).toEqual(false);
    });

    it("should properly compute sidebar_visible", function() {
      stashes.set('current_mode', 'speak');
      app_state.set('currentBoardState', {key: 'cannery'});
      stashes.set('sidebarEnabled', true);
      var user = EmberObject.create({
        preferences: {
          quick_sidebar: true
        }
      });
      app_state.set('sessionUser', user);
      expect(app_state.get('sidebar_visible')).toEqual(true);

      user.set('preferences.quick_sidebar', false);
      expect(app_state.get('sidebar_visible')).toEqual(true);

      stashes.set('sidebarEnabled', false);
      expect(app_state.get('sidebar_visible')).toEqual(false);

      user.set('preferences.quick_sidebar', true);
      expect(app_state.get('sidebar_visible')).toEqual(true);

      stashes.set('current_mode', 'default');
      expect(app_state.get('sidebar_visible')).toEqual(false);
    });

    it("should properly compute logging_paused", function() {
      stashes.set('logging_paused_at', 100);
      expect(app_state.get('logging_paused')).toEqual(true);

      stashes.set('logging_paused_at', null);
      expect(app_state.get('logging_paused')).toEqual(false);

      stashes.set('logging_paused_at', 0);
      expect(app_state.get('logging_paused')).toEqual(false);
    });

  });

  describe('jump_to_board', function() {
    it("should add board state to the history", function() {
      app_state.set_history([]);
      app_state.set('currentBoardState', {key: 'kick', id: '1_2'});
      app_state.jump_to_board({key: 'yodel', id: '1_1'});
      var history = app_state.get_history();
      expect(history.length).toEqual(1);
      expect(history[0]).toEqual({key: 'kick', id: '1_2'});
    });

    it("should add the specified state to the history if specified", function() {
      app_state.set_history([{}]);
      app_state.set('currentBoardState', {key: 'kick', id: '1_2'});
      app_state.jump_to_board({key: 'yodel', id: '1_1'}, {key: 'umpire', id: '1_3'});
      var history = app_state.get_history();
      expect(history.length).toEqual(2);
      expect(history[1]).toEqual({key: 'umpire', id: '1_3'});
    });

    it("should log the state change", function() {
      app_state.set('currentBoardState', {key: 'kick', id: '1_2'});
      var event = null;
      stub(stashes, 'log', function(l) {
        event = l;
      });
      app_state.jump_to_board({key: 'yodel', id: '1_1'});
      expect(event).toEqual({
        action: 'open_board',
        previous_key: {key: 'kick', id: '1_2'},
        new_id: {key: 'yodel', id: '1_1'}
      });
    });

    it("should hide the sidebar if temporary", function() {
      var message = null;
      stub(app_state.controller, 'send', function(m) {
        message = m;
      });

      app_state.set('currentBoardState', {key: 'kick', id: '1_2'});
      app_state.jump_to_board({key: 'yodel', id: '1_1'});
      expect(message).toEqual('hide_temporary_sidebar');
    });

    it("should transition to the new state", function() {
      var route = null;
      var settings = null;
      stub(app_state.controller, 'transitionToRoute', function(r, s) {
        route = r;
        settings = s;
      });
      app_state.set('currentBoardState', {key: 'kick', id: '1_2'});
      app_state.jump_to_board({key: 'yodel', id: '1_1'});
      expect(route).toEqual('board');
      expect(settings).toEqual('yodel');
    });
  });

  describe('back_one_board', function() {
    it("should pop the history stack", function() {
      app_state.set_history([{}, {}]);
      stub(app_state.controller, 'transitionToRoute', function(r, s) { });
      app_state.back_one_board();
      var history = app_state.get_history();
      expect(history.length).toEqual(1);
      app_state.set_history([]);
    });

    it("should log an event", function() {
      app_state.set_history([{key: 'ground'}]);
      var event = null;
      stub(stashes, 'log', function(e) {
        event = e;
      });
      stub(app_state.controller, 'transitionToRoute', function(r, s) { });
      app_state.back_one_board();
      expect(event).toEqual({action: 'back'});
      app_state.set_history([]);
    });

    it("should transition to the last history event", function() {
      app_state.set_history([{key: 'ground'}]);
      var route = null;
      var settings = null;
      stub(app_state.controller, 'transitionToRoute', function(r, s) {
        route = r;
        settings = s;
      });
      app_state.back_one_board();
      expect(route).toEqual('board');
      expect(settings).toEqual('ground');
    });
  });

  describe('jump_to_root_board', function() {
    it("should clear history", function() {
      app_state.set_history([{}, {}]);
      app_state.jump_to_root_board();
      expect(app_state.get_history()).toEqual([]);
    });

    it("should not log an event if the route isn't changing", function() {
      var event = null;
      stashes.set('root_board_state', null);
      stub(stashes, 'log', function(e) {
        event = e;
      });
      app_state.jump_to_root_board();
      expect(event).toEqual(null);

      app_state.set('currentBoardState', {key: 'oink'});
      app_state.set('sessionUser', EmberObject.create({
        preferences: {
          home_board: {key: 'oink'}
        }
      }));
      app_state.jump_to_root_board();
      expect(event).toEqual(null);
    });

    it("should log an event if the route is changing", function() {
      var event = null;
      stub(stashes, 'log', function(e) {
        event = e;
      });
      app_state.set('currentBoardState', {key: 'yodel'});
      app_state.set('sessionUser', EmberObject.create({
        preferences: {
          home_board: {key: 'igneous'}
        }
      }));
      app_state.jump_to_root_board();
      expect(event).toEqual({action: 'home'});
    });

    it("should log an auto_home event if the route is changing because of auto_home", function() {
      var event = null;
      stub(stashes, 'log', function(e) {
        event = e;
      });
      app_state.set('currentBoardState', {key: 'yodel'});
      app_state.set('sessionUser', EmberObject.create({
        preferences: {
          home_board: {key: 'igneous'}
        }
      }));
      app_state.jump_to_root_board({auto_home: true});
      expect(event).toEqual({action: 'auto_home'});
    });

    it("should transition to root_board_state if defined", function() {
      stashes.set('root_board_state', {key: 'under'});
      app_state.set('sessionUser', EmberObject.create({
        preferences: {
          home_board: {key: 'halo'}
        }
      }));
      var route = null;
      var settings = null;
      stub(app_state.controller, 'transitionToRoute', function(r, s) {
        route = r;
        settings = s;
      });

      app_state.jump_to_root_board({index_as_fallback: true});
      expect(route).toEqual('board');
      expect(settings).toEqual('under');

      route = null;
      settings = null;
      app_state.jump_to_root_board();
      expect(route).toEqual('board');
      expect(settings).toEqual('under');
    });

    it("should transition to user's home board if no root_board_state", function() {
      stashes.set('root_board_state', null);
      app_state.set('sessionUser', EmberObject.create({
        preferences: {
          home_board: {key: 'halo'}
        }
      }));
      var route = null;
      var settings = null;
      stub(app_state.controller, 'transitionToRoute', function(r, s) {
        route = r;
        settings = s;
      });
      expect(1).toEqual(1);

      app_state.jump_to_root_board({index_as_fallback: true});
      expect(route).toEqual('board');
      expect(settings).toEqual('halo');

      route = null;
      settings = null;
      app_state.jump_to_root_board();
      expect(route).toEqual('board');
      expect(settings).toEqual('halo');
    });

    it("should transition to the temporary root board if temporary_root_board_state is set", function() {
      stashes.set('root_board_state', {key: 'under'});
      app_state.set('sessionUser', EmberObject.create({
        preferences: {
          home_board: {key: 'halo'}
        }
      }));
      stashes.set('temporary_root_board_state', {key: 'orange'});
      var route = null;
      var settings = null;
      stub(app_state.controller, 'transitionToRoute', function(r, s) {
        route = r;
        settings = s;
      });

      app_state.jump_to_root_board({index_as_fallback: true});
      expect(route).toEqual('board');
      expect(settings).toEqual('orange');

      route = null;
      settings = null;
      app_state.jump_to_root_board();
      expect(route).toEqual('board');
      expect(settings).toEqual('orange');
    });

    it("should transition to the index page if no user or root_board_state defined and index_as_fallback is allowed", function() {
      stashes.set('root_board_state', null);
      stashes.set('temporary_root_board_state', null);
      app_state.set('sessionUser', EmberObject.create({
        preferences: {
          home_board: {}
        }
      }));
      var route = null;
      var settings = null;
      stub(app_state.controller, 'transitionToRoute', function(r, s) {
        route = r;
        settings = s;
      });

      app_state.jump_to_root_board({index_as_fallback: true});
      expect(route).toEqual('index');
      expect(settings).toEqual(undefined);

      route = null;
      settings = null;
      app_state.jump_to_root_board();
      expect(route).toEqual(null);
      expect(settings).toEqual(null);
    });
  });

  describe("sidebar_boards", function() {
    it("should return defaults if no user is set", function() {
      stub(window, 'user_preferences', {
        any_user: {
          default_sidebar_boards: [2, 3]
        }
      });
      expect(app_state.get('sidebar_boards')).toEqual([2, 3]);
    });

    it("should return the user's settings if set", function() {
      app_state.set('sessionUser', EmberObject.create({}));
      app_state.set('sessionUser.sidebar_boards_with_fallbacks', [1, 2]);
      stub(window, 'user_preferences', {
        any_user: {
          default_sidebar_boards: [2, 3]
        }
      });
      expect(app_state.get('sidebar_boards')).toEqual([1, 2]);
    });
  });

  describe("check_for_user_updated", function() {
    it("should set last_sync_stamp when sessionUser changes", function() {
      var o = EmberObject.create();
      stub(window, 'persistence', o);
      stub(o, 'check_for_needs_sync', function() { });
      app_state.set('sessionUser', EmberObject.create({sync_stamp: 'asdf'}));
      waitsFor(function() { return o.get('last_sync_stamp') == 'asdf'; });
      runs();
    });

    it("should set last_sync_stamp_interval", function() {
      var o = EmberObject.create();
      stub(window, 'persistence', o);
      stub(o, 'check_for_needs_sync', function() { });
      app_state.set('sessionUser', EmberObject.create({sync_stamp: 'asdf'}));
      waitsFor(function() { return o.get('last_sync_stamp') == 'asdf'; });
      runs(function() {
        expect(o.get('last_sync_stamp_interval')).toEqual(15 * 60 * 1000);
      });
    });

    it("should use the user's interval preference if defined", function() {
      var o = EmberObject.create();
      app_state.set('sessionUser', EmberObject.create({sync_stamp: 'asdf', preferences: {'sync_refresh_interval': 10}}));
      waitsFor(function() { return window.persistence.get('last_sync_stamp') == 'asdf'; });
      runs(function() {
        expect(window.persistence.get('last_sync_stamp_interval')).toEqual(10000);
      });
    });
  });

  describe("fenced_sidebar_board", function() {
    beforeEach(function() {
      app_state.set('last_fenced_board', null);
    });

    it("should return nothing by default", function() {
      expect(app_state.get('fenced_sidebar_board')).toEqual(undefined);
    });

    it("should return the closest geolocated board", function() {
      stashes.set('geo.latest', {coords: {latitude: 1, longitude: 1}});
      app_state.set('currentUser', EmberObject.extend({
        sidebar_boards_with_fallbacks: function() {
          return [
            {key: 'a', highlight_type: 'locations', geos: [[1.0001, 1.0001]]},
            {key: 'b', highlight_type: 'locations', geos: [[1.0001, 1.0001]]},
            {key: 'c', highlight_type: 'locations', geos: [[1.0001, 1]]}
          ];
        }.property()
      }).create());
      expect(app_state.get('fenced_sidebar_board')).toNotEqual(undefined);
      expect(app_state.get('fenced_sidebar_board.key')).toEqual('c');
    });

    it("should return a time-matched board if found", function() {
      stashes.set('geo.latest', {coords: {latitude: 1, longitude: 1}});
      var now = (new Date()).getTime();
      var str1 = app_state.time_string(now - (5*60*1000));
      var str2 = app_state.time_string(now + (5*60*1000));
      app_state.set('currentUser', EmberObject.extend({
        sidebar_boards_with_fallbacks: function() {
          return [
            {key: 'a', highlight_type: 'locations', geos: [[1.1, 1.1]]},
            {key: 'b', highlight_type: 'locations', geos: [[1.1, 1.1]]},
            {key: 'c', highlight_type: 'times', times: [[str1, str2]]}
          ];
        }.property()
      }).create());
      expect(app_state.get('fenced_sidebar_board')).toNotEqual(undefined);
      expect(app_state.get('fenced_sidebar_board.key')).toEqual('c');
    });

    it("should return an ssid-matched board if found", function() {
      stashes.set('geo.latest', {coords: {latitude: 1, longitude: 1}});
      var now = (new Date()).getTime();
      app_state.set('current_ssid', 'asdfqwer');
      app_state.set('currentUser', EmberObject.extend({
        sidebar_boards_with_fallbacks: function() {
          return [
            {key: 'a', highlight_type: 'locations', geos: [[1.1, 1.1]]},
            {key: 'b', highlight_type: 'locations', ssids: ['asdf', 'asdfqwer']},
            {key: 'c', highlight_type: 'locations', ssids: ['tyui', 'tyihgjk']},
          ];
        }.property()
      }).create());
      expect(app_state.get('fenced_sidebar_board')).toNotEqual(undefined);
      expect(app_state.get('fenced_sidebar_board.key')).toEqual('b');
    });

    it("should return a place-matched board if found and matching a geo place", function() {
      stashes.set('geo.latest', {coords: {latitude: 1, longitude: 1}});
      var now = (new Date()).getTime();
      app_state.set('nearby_places', [
        {name: 'slammer', latitude: 1.0001, longitude: 1.0001, types: ['dungeon']},
        {name: 'zen', latitude: 1.0002, longitude: 1.0002, types: ['heaven']}
      ]);
      app_state.set('currentUser', EmberObject.extend({
        sidebar_boards_with_fallbacks: function() {
          return [
            {key: 'a', highlight_type: 'places', places: ['dungeon', 'prison']},
            {key: 'b', highlight_type: 'places', places: ['dungeon']},
            {key: 'c', highlight_type: 'places', places: ['nirvana', 'heaven', 'bliss']}
          ];
        }.property()
      }).create());
      expect(app_state.get('fenced_sidebar_board')).toNotEqual(undefined);
      expect(app_state.get('fenced_sidebar_board.key')).toEqual('a');
      stashes.set('geo.latest', {coords: {latitude: 1.0003, longitude: 1.0003}});
      expect(app_state.get('fenced_sidebar_board')).toNotEqual(undefined);
      expect(app_state.get('fenced_sidebar_board.key')).toEqual('c');
    });

    it("should return the last-found result if not too old and nothing else found", function() {
      var last = {
        key: 'asdf',
        shown_at: (new Date()).getTime() - (1*60*1000)
      };
      app_state.set('last_fenced_board', last);
      expect(app_state.get('fenced_sidebar_board')).toEqual(last);
    });

    it("should not return the last-found result if too old and nothing else found", function() {
      app_state.set('last_fenced_board', {
        key: 'qwer',
        shown_at: (new Date()).getTime() - (3*60*1000)
      });
      expect(app_state.get('fenced_sidebar_board')).toEqual(undefined);
    });
  });

  describe("check_locations", function() {
    it("should only call if the user has a place-based sidebar board", function() {
      stashes.set('current_mode', 'speak');
      app_state.set('currentBoardState', {key: 'trade', id: '1_1'});
      expect(app_state.get('speak_mode')).toEqual(true);

      var checked = false;
      stub(geo, 'check_locations', function() {
        checked = true;
        return RSVP.resolve();
      });
      stashes.set('geo.latest', {});
      app_state.set('currentUser', EmberObject.extend({
        sidebar_boards_with_fallbacks: function() {
          return [{places: [1, 2, 3]}];
        }.property()
      }).create());
      waitsFor(function() { return checked; });
      runs();
    });

    it("should not call if the user has no place-based sidebar board", function() {
      stashes.set('current_mode', 'speak');
      app_state.set('currentBoardState', {key: 'trade', id: '1_1'});
      expect(app_state.get('speak_mode')).toEqual(true);

      var checked = false;
      stashes.set('geo.latest', {});
      app_state.set('currentUser', EmberObject.extend({
        sidebar_boards_with_fallbacks: function() {
          return [{}];
        }.property()
      }).create());
      app_state.check_locations().then(null, function() { checked = true; });
      waitsFor(function() { return checked; });
      runs();
    });
  });

  describe('activate_button', function() {
    it('should return immediately for a hidden button when preferences are set to grid', function() {
      app_state.set('currentUser', EmberObject.create({preferences: {hidden_buttons: 'grid'}}));
      expect(app_state.get('edit_mode')).toEqual(false);
      var res = app_state.activate_button({hidden: true});
      expect(res).toEqual(false);
    });
  });

  describe('check_for_protected_usage', function() {
    afterEach(function() {
      if(window._trackJs) { window._trackJs.disabled = null; }
      LingoLinq.protected_user = null;
      stashes.persist('protected_user', null);
    });

    it('should flag the user as protected in the right spots', function() {
      LingoLinq.protected_user = null;
      expect(LingoLinq.protected_user == null).toEqual(true);
      app_state.set('currentUser', EmberObject.create({preferences: {protected_usage: false}}));
      expect(LingoLinq.protected_user).toEqual(false);
      expect(stashes.get('protected_user')).toEqual(false);
      app_state.set('currentUser', EmberObject.create({preferences: {protected_usage: true}}));
      expect(LingoLinq.protected_user).toEqual(true);
      expect(stashes.get('protected_user')).toEqual(true);
    });
  });

  describe('auto_sync', function() {
    it('should set the value correctly', function() {
      stub(window, 'persistence', persistence);
      persistence.set('auto_sync', null);
      capabilities.installed_app = false;
      var u = LingoLinq.store.createRecord('user');
      u.set('preferences', {device: {ever_synced: false}});
      expect(u.get('auto_sync')).toEqual(false);
      app_state.set('sessionUser', u);

      var round = 0;
      waitsFor(function() { return persistence.get('auto_sync') === false; });
      runs(function() {
        expect(round).toEqual(0);
        round = 1;
        capabilities.installed_app = true;
        app_state.set('sessionUser.preferences.device.ever_synced', null);
        expect(u.get('auto_sync')).toEqual(true);
      });

      waitsFor(function() { return round == 1 && persistence.get('auto_sync') === true; });
      runs(function() {
        expect(round).toEqual(1);
        round = 2;
        capabilities.installed_app = false;
        app_state.set('sessionUser.preferences.device.ever_synced', false);
        expect(u.get('auto_sync')).toEqual(false);
      });

      waitsFor(function() { return round == 2 && persistence.get('auto_sync') === false; });
      runs(function() {
        expect(round).toEqual(2);
        round = 3;
        app_state.set('sessionUser.preferences.device.ever_synced', true);
        expect(u.get('auto_sync')).toEqual(true);
        app_state.set_auto_synced();
      });

      waitsFor(function() { return round == 3 && persistence.get('auto_sync') === true; });
      runs(function() {
        expect(round).toEqual(3);
        round = 4;
        app_state.set('sessionUser', {});
      });

      waitsFor(function() { return round == 4 && persistence.get('auto_sync') === false; });
      runs(function() {
        expect(round).toEqual(4);
      });
    });
  });

  describe('board_url', function() {
    it('should return the correct values', function() {
      expect(app_state.get('board_url')).toEqual(null);
      stub(capabilities, 'api_host', 'http://www.stuff.com');
      app_state.set('currentBoardState', {key: 'a/b'});
      expect(app_state.get('board_url').string).toEqual('http://www.stuff.com/a/b');
    });
  });

  describe('auto_exit_speak_mode', function() {
    it('should clear the timeout if not in speak mode', function() {
      app_state.set('speak_mode_started', 12345);
      expect(app_state.get('speak_mode')).toEqual(false);
      app_state.set('medium_refresh_stamp', 1234);
      expect(app_state.get('speak_mode_started')).toEqual(null);
    });

    it('should auto-exit speak mode and post a notice if for the current user, who is a limited supervisor', function() {
      var stamp = (new Date()).getTime() - (20 * 60 *1000);
      app_state.set('sessionUser', EmberObject.create({id: '12345', limited_supervisor: true}));
      stashes.set('current_mode', 'speak');
      app_state.set('currentBoardState', {key: 'trade', id: '1_1'});
      expect(app_state.get('currentUser')).toEqual(app_state.get('sessionUser'));
      expect(app_state.get('speak_mode')).toEqual(true);
      var noticed = false;
      stub(modal, 'notice', function(message, under, sticky) {
        expect(under).toEqual(true);
        expect(sticky).toEqual(true);
        expect(!!message.match(/limited to 15 minutes/)).toEqual(true);
        noticed = true;
      });
      expect(app_state.get('speak_mode')).toEqual(true);
      app_state.set('speak_mode_started', stamp);
      app_state.set('medium_refresh_stamp', 1234);
      waitsFor(function() { return noticed; });
      runs(function() {
        expect(app_state.get('speak_mode')).toEqual(false);
        expect(app_state.get('speak_mode_started')).toEqual(null);
      });
    });

    it('should auto-exit speak mode and post a notice if supporting a communicator who is expired', function() {
      var stamp = (new Date()).getTime() - (20 * 60 *1000);
      app_state.set('sessionUser', EmberObject.create({id: '12345'}));
      stashes.set('current_mode', 'speak');
      app_state.set('currentBoardState', {key: 'trade', id: '1_1'});
      app_state.set('referenced_speak_mode_user', EmberObject.create({id: '23456', expired: true}));
      expect(app_state.get('currentUser')).toEqual(app_state.get('sessionUser'));
      expect(app_state.get('speak_mode')).toEqual(true);
      var noticed = false;
      stub(modal, 'notice', function(message, under, sticky) {
        expect(under).toEqual(true);
        expect(sticky).toEqual(true);
        expect(!!message.match(/limited to 15 minutes/)).toEqual(true);
        noticed = true;
      });
      expect(app_state.get('speak_mode')).toEqual(true);
      app_state.set('speak_mode_started', stamp);
      app_state.set('medium_refresh_stamp', 1234);
      waitsFor(function() { return noticed; });
      runs(function() {
        expect(app_state.get('speak_mode')).toEqual(false);
        expect(app_state.get('speak_mode_started')).toEqual(null);
      });
    });

    it('should auto-exit if for a really really expired communicator', function() {
      var stamp = (new Date()).getTime() - (40 * 60 *1000);
      app_state.set('sessionUser', EmberObject.create({id: '12345', expired: true, really_really_expired: true}));
      stashes.set('current_mode', 'speak');
      app_state.set('currentBoardState', {key: 'trade', id: '1_1'});
      expect(app_state.get('currentUser')).toEqual(app_state.get('sessionUser'));
      expect(app_state.get('speak_mode')).toEqual(true);
      var noticed = false;
      stub(modal, 'notice', function(message, under, sticky) {
        expect(under).toEqual(true);
        expect(sticky).toEqual(true);
        expect(!!message.match(/limited to 15 minutes/)).toEqual(true);
        noticed = true;
      });
      expect(app_state.get('speak_mode')).toEqual(true);
      app_state.set('speak_mode_started', stamp);
      app_state.set('medium_refresh_stamp', 1234);
      waitsFor(function() { return noticed; });
      runs(function() {
        expect(app_state.get('speak_mode')).toEqual(false);
        expect(app_state.get('speak_mode_started')).toEqual(null);
      });
    });

    it('should auto-exit speak mode if for an expired communicator', function() {
      var stamp = (new Date()).getTime() - (40 * 60 *1000);
      app_state.set('sessionUser', EmberObject.create({id: '12345', expired: true}));
      stashes.set('current_mode', 'speak');
      app_state.set('currentBoardState', {key: 'trade', id: '1_1'});
      expect(app_state.get('currentUser')).toEqual(app_state.get('sessionUser'));
      expect(app_state.get('speak_mode')).toEqual(true);
      var noticed = false;
      stub(modal, 'notice', function(message, under, sticky) {
        noticed = true;
      });
      expect(app_state.get('speak_mode')).toEqual(true);
      app_state.set('speak_mode_started', stamp);
      app_state.set('medium_refresh_stamp', 1234);
      var waited = false;
      emberRun.later(function() {
        waited = true;
      }, 500);
      waitsFor(function() { return waited; });
      runs(function() {
        expect(noticed).toEqual(true);
        expect(app_state.get('speak_mode')).toEqual(false);
        expect(app_state.get('speak_mode_started')).toEqual(null);
      });
    });

  });

  describe('load_user_badge', function() {
    it('should have valid specs', function() {
      expect('test').toEqual('todo');
    });
  });
});
