import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  waitsFor,
  runs,
  stub,
  xit
} from 'frontend/tests/helpers/jasmine';
import { queryLog, boardModelStub, persistenceTarget, stubModalSafe as harnessStubModalSafe } from 'frontend/tests/helpers/ember_helper';
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
import { run as emberRun, later, cancel } from '@ember/runloop';

function primeSpeakModeUser(attrs) {
  var base = {
    id: 'test-user',
    preferences: {
      progress: { speak_mode_intro_done: true, modeling_intro_done: true },
      device: { wakelock: false, fullscreen: false, speak_on_speak_mode: false }
    }
  };
  if (attrs && attrs.preferences) {
    base.preferences = Object.assign({}, base.preferences, attrs.preferences);
    attrs = Object.assign({}, attrs);
    delete attrs.preferences;
  }
  var user = LingoLinq.store.createRecord('user', Object.assign({}, base, attrs || {}));
  if (typeof user.reload !== 'function') {
    user.reload = function() { return RSVP.resolve(user); };
  }
  app_state.set('sessionUser', user);
  app_state.set('currentUser', user);
  return user;
}

function stubModalSafe() {
  harnessStubModalSafe(LingoLinq.testOwner);
}

function stubSpeakModeEntry(opts) {
  opts = opts || {};
  speecher.set('voices', [{ remote_voice: false, voiceURI: 'local-test-voice' }]);
  app_state.set('last_speak_mode', null);
  app_state.set('installed_app', false);
  stub(capabilities, 'tts', {
    reload: function() { return RSVP.resolve(); },
    stop_text: function() { }
  });
  stub(capabilities, 'wakelock', function() { return RSVP.resolve(); });
  if (!opts.skipModalSafe) {
    stubModalSafe();
  }
  stub(app_state, 'load_user_badge', function() { });
  stub(app_state, 'show_toast', function() { });
  stub(persistence, 'find', function() { return RSVP.resolve({}); });
  if (LingoLinq.persistenceService && typeof LingoLinq.persistenceService.set === 'function') {
    LingoLinq.persistenceService.set('online', false);
  }
}

function primeSessionUser(attrs) {
  var base = {
    id: '234',
    membership_type: 'premium',
    preferences: {
      progress: { speak_mode_intro_done: true, modeling_intro_done: true },
      home_board: { id: '111', key: 'home/one' }
    }
  };
  if (attrs && attrs.preferences) {
    base.preferences = Object.assign({}, base.preferences, attrs.preferences);
    attrs = Object.assign({}, attrs);
    delete attrs.preferences;
  }
  var user = LingoLinq.store.createRecord('user', Object.assign({}, base, attrs || {}));
  if (typeof user.reload !== 'function') {
    user.reload = function() { return RSVP.resolve(user); };
  }
  app_state.set('sessionUser', user);
  app_state.set('currentUser', user);
  return user;
}

function withSpeakModeProgress(userPayload) {
  userPayload.preferences = userPayload.preferences || {};
  userPayload.preferences.progress = Object.assign(
    { speak_mode_intro_done: true, modeling_intro_done: true },
    userPayload.preferences.progress || {}
  );
  return userPayload;
}

function stubBoardTransition() {
  app_state._testBoardTransitionKey = null;
  stub(app_state, 'transitionToBoardForCurrentUiStyle', function(router, boardKey) {
    app_state._testBoardTransitionKey = boardKey;
  });
}

function stashesForTests() {
  return app_state.get('stashes') || app_state.stashes || stashes;
}

function stubStashesLog(callback) {
  stub(stashesForTests(), 'log', callback);
}

describe('app_state', function() {
  var navigator = window.navigator;
  var boardGrabber;
  var app = null, route = null, controller = null;
  var last_sent_message = null;
  beforeEach(function() {
    boardGrabber = contentGrabbers.boardGrabber;
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
    last_sent_message = null;
  });

  describe('setup', function() {
    it("should properly inject settings", function() {
      expect(typeof app_state.setup).toEqual('function');
      expect(!!LingoLinq.appState).toEqual(true);
      app_state.setup();
      expect(app_state.get('button_list')).toEqual([]);
      expect(app_state.get('browser')).toEqual(capabilities.browser);
    });
    it("should initialize", function() {
      var called = false;
      stub(app_state, 'refresh_user', function() {
        called = true;
      });
      app_state.setup();
      expect(app_state.get('button_list')).toEqual([]);
      expect(app_state.get('stashes')).toEqual(window.stashes);
      expect(called).toEqual(true);
    });
  });

  describe('setup_controller', function() {
    it("should initialize on app startup", function() {
      app_state.setup();

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
      expect(window.stashes.controller).toEqual(controller);
      expect(boardGrabber.transitioner).toEqual(app_state.get('router'));
      expect(bound_classes_setup).toEqual(true);
      expect(utterance_setup).toEqual(true);
      expect(logging_checked).toEqual(true);
      expect(board_state_checked).toEqual(true);
      expect(LingoLinq.session).toEqual(LingoLinq.appState.session);
      expect(modal_closed).toEqual(true);
    });
  });

  describe('speak_mode_handlers', function() {
    function stubModalWarning(callback) {
      var onWarning = function(message) {
        callback(message);
      };
      stub(modal, 'warning', onWarning);
      stub(modal, 'flash', function(message, type) {
        if (type === 'warning') {
          onWarning(message);
        }
      });
      stub(app_state, 'show_toast', function(message) {
        callback(message);
      });
      if (LingoLinq.testOwner) {
        try {
          var modalSvc = LingoLinq.testOwner.lookup('service:modal');
          stub(modalSvc, 'warning', callback);
          var appStateSvc = LingoLinq.testOwner.lookup('service:app-state');
          stub(appStateSvc, 'show_toast', function(message) {
            callback(message);
          });
        } catch (e) { /* owner mid-teardown */ }
      }
    }

    beforeEach(function() {
      app_state.set('last_speak_mode', null);
      stashesForTests().persist('current_mode', 'default');
      stubSpeakModeEntry({ skipModalSafe: true });
    });
    afterEach(function() {
      app_state.set('last_speak_mode', null);
      app_state.set('currentBoardState', null);
      stashesForTests().persist('current_mode', 'default');
      if (LingoLinq.persistenceService && typeof LingoLinq.persistenceService.set === 'function') {
        LingoLinq.persistenceService.set('online', true);
      }
    });

    it("should call volume_check", function() {
      primeSpeakModeUser();

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
      stubModalWarning(function(message) {
        warnings++;
        warning = message;
      });

      expect(checks).toEqual(0);

      app_state.set('last_speak_mode', null);
      stashesForTests().persist('current_mode', 'speak');
      app_state.set('currentBoardState', {key: 'trade', id: '1_1'});
      expect(app_state.get('speak_mode')).toEqual(true);

      waitsFor(function() { return warnings >= 1; });
      runs(function() {
        expect(warning).toEqual('Volume is muted, you will not be able to hear speech');
        app_state.set('last_speak_mode', null);
        app_state.speak_mode_handlers();
      });
      waitsFor(function() { return warnings >= 2; });
      runs(function() {
        expect(warning).toEqual('Volume is low, you may not be able to hear speech');
        warning = null;
        app_state.set('last_speak_mode', null);
        app_state.speak_mode_handlers();
      });
      waitsFor(function() { return checks >= 3; });
      runs(function() {
        expect(warnings).toEqual(2);
      });
    });

    it('should check for silent mode', function() {
      primeSpeakModeUser();

      var checks = 0;
      var warnings = 0;
      var warning = 'bacon';
      stub(capabilities, 'system', 'iOS');
      stub(capabilities, 'silent_mode', function() {
        checks++;
        return RSVP.resolve(false);
      });
      stubModalWarning(function(message) {
        warnings++;
        warning = message;
      });

      expect(checks).toEqual(0);

      app_state.set('last_speak_mode', null);
      stashesForTests().persist('current_mode', 'speak');
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
      primeSpeakModeUser();

      var checks = 0;
      var warnings = 0;
      var warning = 'bacon';
      stub(capabilities, 'system', 'iOS');
      stub(capabilities, 'silent_mode', function() {
        checks++;
        return RSVP.resolve(true);
      });
      stubModalWarning(function(message) {
        warnings++;
        warning = message;
      });

      expect(checks).toEqual(0);

      app_state.set('last_speak_mode', null);
      stashesForTests().persist('current_mode', 'speak');
      app_state.set('currentBoardState', {key: 'trade', id: '1_1'});
      expect(app_state.get('speak_mode')).toEqual(true);

      waitsFor(function() { return warnings >= 1; });
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
//           later(function() {
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
      var priorToken = 999001;
      app_state.refreshing_user = priorToken;
      app_state.refresh_user();
      expect(app_state.refreshing_user).not.toEqual(priorToken);
      expect(app_state.refreshing_user).not.toEqual(null);
      cancel(app_state.refreshing_user);
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
      cancel(app_state.refreshing_user);
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
      app_state.global_transition({to_route: 'board.index'});
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
      stub(utterance, 'clear', function(opts) {
        called = true;
        expect(opts.skip_logging).toEqual(true);
      });
      stubSpeakModeEntry();
      primeSpeakModeUser({
        preferences: { home_board: { key: 'a/b', id: '1' } }
      });
      app_state.set('currentBoardState', { key: 'a/b', id: '1' });
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
      primeSpeakModeUser({
        preferences: { home_board: { key: 'other/board', id: '2' } }
      });
      app_state.set('currentBoardState', { key: 'a/b', id: '1' });
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
      primeSpeakModeUser({
        preferences: {
          require_speak_mode_pin: true,
          speak_mode_pin: '1234'
        }
      });
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
      expect(pin_settings.actual_pin).toEqual('1234');
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
      primeSpeakModeUser({
        preferences: {
          home_board: {
            key: 'scarf',
            id: '1_1'
          }
        }
      });
      app_state.set('currentBoardState', {key: 'scarves', id: '1_2'});
      stashes.set('current_mode', 'default');
      app_state.toggle_speak_mode('rememberRealHome');
      expect(mode).toEqual('speak');
      expect(options.override_state.key).toEqual('scarf');
      expect(options.override_state.id).toEqual('1_1');
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
      controller.set('board', EmberObject.create({
        model: boardModelStub({ permissions: { edit: true } })
      }));
      app_state.toggle_edit_mode();
      waitsFor(function() { return toggle_called; });
      runs(function() {
        expect(toggle_called).toEqual(true);
      });
    });

    it("should confirm if necessary and no decision made", function() {
      app_state.controller.set('board', EmberObject.create({
        model: boardModelStub({ could_be_in_use: true, permissions: { edit: true } })
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
      waitsFor(function() { return found_template; });
      runs(function() {
        expect(found_template).toEqual('confirm-edit-board');
        expect(found_settings.board).toEqual(app_state.controller.get('board.model'));
      });
    });

    it("should not confirm if necessary and decision made", function() {
      app_state.controller.set('board', EmberObject.create({
        model: boardModelStub({ could_be_in_use: true, permissions: { edit: true } })
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
      waitsFor(function() { return toggle_called; });
      runs(function() {
        expect(found_template).toEqual(null);
        expect(toggle_called).toEqual(true);
      });
    });

    it("should copy before editing when the board cannot be edited directly", function() {
      var board = boardModelStub({ permissions: { edit: false } });
      app_state.controller.set('board', EmberObject.create({
        model: board
      }));
      var found_template = null;
      var found_settings = null;
      stub(modal, 'open', function(template, settings) {
        found_template = template;
        found_settings = settings;
        return RSVP.resolve('confirm');
      });
      var copy_and_edit_called = false;
      var copy_and_edit_board = null;
      var skip_source_resolution = null;
      app_state.controller.send = function(action, board_to_copy, skip_resolution) {
        copy_and_edit_called = action == 'copy_and_edit_board';
        copy_and_edit_board = board_to_copy;
        skip_source_resolution = skip_resolution;
      };
      var toggle_called = false;
      stub(app_state, 'toggle_mode', function() {
        toggle_called = true;
      });
      stub(editManager, 'clear_history', function() { });

      app_state.toggle_edit_mode();

      waitsFor(function() { return copy_and_edit_called; });
      runs(function() {
        expect(found_template).toEqual('confirm-needs-copying');
        expect(found_settings.board).toEqual(board);
        expect(copy_and_edit_called).toEqual(true);
        expect(copy_and_edit_board).toEqual(board);
        expect(skip_source_resolution).toEqual(false);
        expect(toggle_called).toEqual(false);
      });
    });

    it("should copy the resolved board instead of a stale application board", function() {
      var staleBoard = boardModelStub({
        key: 'template/quick-core-think',
        permissions: { edit: false }
      });
      var detailBoard = boardModelStub({
        key: 'marcus_williams_slp/communikate-top-page',
        permissions: { edit: false }
      });
      app_state.controller.set('board', EmberObject.create({
        model: staleBoard
      }));
      stub(app_state, 'assert_source', function() {
        return RSVP.resolve(detailBoard);
      });
      var found_settings = null;
      stub(modal, 'open', function(template, settings) {
        found_settings = settings;
        return RSVP.resolve('confirm');
      });
      var copy_and_edit_board = null;
      app_state.controller.send = function(action, board_to_copy) {
        if(action == 'copy_and_edit_board') {
          copy_and_edit_board = board_to_copy;
        }
      };
      stub(editManager, 'clear_history', function() { });
      app_state.set('current_route', 'user.board-detail.index');

      app_state.toggle_edit_mode();

      waitsFor(function() { return copy_and_edit_board; });
      runs(function() {
        expect(found_settings.board).toEqual(detailBoard);
        expect(copy_and_edit_board).toEqual(detailBoard);
      });
    });

    it("should skip source re-resolution when copying from board-detail", function() {
      var detailBoard = boardModelStub({
        key: 'marcus_williams_slp/communikate-top-page',
        permissions: { edit: false }
      });
      app_state.controller.set('board', EmberObject.create({
        model: detailBoard
      }));
      app_state.set('current_route', 'user.board-detail.index');
      stub(app_state, 'assert_source', function() {
        return RSVP.resolve(detailBoard);
      });
      stub(modal, 'open', function() {
        return RSVP.resolve('confirm');
      });
      var skip_source_resolution = null;
      app_state.controller.send = function(action, board_to_copy, skip_resolution) {
        if(action == 'copy_and_edit_board') {
          skip_source_resolution = skip_resolution;
        }
      };
      stub(editManager, 'clear_history', function() { });

      app_state.toggle_edit_mode();

      waitsFor(function() { return skip_source_resolution !== null; });
      runs(function() {
        expect(skip_source_resolution).toEqual(true);
      });
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
      stashesForTests().persist('current_mode', 'default');
      app_state.set('currentBoardState', {key: 'trade', id: '1_1'});
      stubSpeakModeEntry();

      var toast = null;
      stub(app_state, 'show_toast', function(message) {
        toast = message;
      });
      var u = EmberObject.create({
        preferences: {
          logging: true,
          progress: { speak_mode_intro_done: true, modeling_intro_done: true }
        }
      });
      u.set('currently_premium', true);
      app_state.set('sessionUser', u);
      app_state.set('currentUser', u);
      stashesForTests().set('logging_enabled', true);
      app_state.toggle_mode('speak');
      expect(stashesForTests().get('current_mode')).toEqual('speak');
      expect(app_state.get('speak_mode')).toEqual(true);
      expect(toast).toEqual('Logging is enabled');
    });

    describe("board_level", function() {
      function primeBoardLevelUser(preferences) {
        var prefs = EmberObject.create(Object.assign({
          progress: { speak_mode_intro_done: true, modeling_intro_done: true }
        }, preferences || {}));
        var user = EmberObject.create({
          id: '234',
          preferences: prefs
        });
        user.save = function() { return RSVP.resolve(user); };
        app_state.set('sessionUser', user);
        app_state.set('currentUser', user);
        return user;
      }

      beforeEach(function() {
        var testStashes = stashesForTests();
        testStashes.persist('current_mode', 'default');
        testStashes.persist('last_mode', null);
        testStashes.persist('label_locale', 'en');
        app_state.set('referenced_speak_mode_user', null);
      });

      it('should set the board level based on the user-set current level', function() {
        expect(app_state.get('speak_mode')).toEqual(false);
        app_state.set('currentBoardState', {key: 'aaaa/bbbb', id: '1_12345'});
        stashesForTests().persist('board_level', 5);
        app_state.toggle_mode('speak', {override_state: {key: 'aaaa/bbbb', id: '1_12345', level: 1}});
        expect(app_state.get('speak_mode')).toEqual(true);
        expect(stashesForTests().get('board_level')).toEqual(5);
      });

      it('should set the board level to user home board preference if launching the user home board', function() {
        expect(app_state.get('speak_mode')).toEqual(false);
        primeBoardLevelUser({
          home_board: { id: '1_12345', key: 'aaaa/bbbb', level: 5 }
        });
        app_state.set('currentBoardState', {key: 'aaaa/bbbb', id: '1_12345'});
        stashesForTests().persist('board_level', null);
        app_state.toggle_mode('speak', {override_state: {key: 'aaaa/bbbb', id: '1_12345', level: 1}});
        expect(app_state.get('speak_mode')).toEqual(true);
        expect(stashesForTests().get('board_level')).toEqual(5);
      });

      it('should set the board level to user sidebar preference if launching the user sidebar board', function() {
        expect(app_state.get('speak_mode')).toEqual(false);
        primeBoardLevelUser({
          sidebar_boards: [{ id: '1_12345', key: 'aaaa/bbbb', level: 5 }]
        });
        app_state.set('currentBoardState', {key: 'aaaa/bbbb', id: '1_12345'});
        stashesForTests().persist('board_level', null);
        app_state.toggle_mode('speak', {override_state: {key: 'aaaa/bbbb', id: '1_12345', level: 1}});
        expect(app_state.get('speak_mode')).toEqual(true);
        expect(stashesForTests().get('board_level')).toEqual(5);
      });

      it('should override the user home board preference if a user-set current level is set', function() {
        expect(app_state.get('speak_mode')).toEqual(false);
        primeBoardLevelUser({
          home_board: { id: '1_12345', key: 'aaaa/bbbb', level: 5 }
        });
        app_state.set('currentBoardState', {key: 'aaaa/bbbb', id: '1_12345'});
        stashesForTests().persist('board_level', 3);
        app_state.toggle_mode('speak', {override_state: {key: 'aaaa/bbbb', id: '1_12345', level: 1}});
        expect(app_state.get('speak_mode')).toEqual(true);
        expect(stashesForTests().get('board_level')).toEqual(3);
      });

      it('should set the board level based on the override state if no other level setting available', function() {
        expect(app_state.get('speak_mode')).toEqual(false);
        primeBoardLevelUser({
          home_board: { id: '1_12345', key: 'aaaa/bbbb' }
        });
        app_state.set('currentBoardState', null);
        stashesForTests().persist('board_level', null);
        app_state.toggle_mode('speak', {override_state: {key: 'aaaa/bbbb', id: '1_12345', level: 5}});
        expect(stashesForTests().get('board_level')).toEqual(5);
      });

      it('should ignore the stashed board_level if not launching from a board view (i.e. currentBoardState=null)', function() {
        expect(app_state.get('speak_mode')).toEqual(false);
        primeBoardLevelUser({
          home_board: { id: '1_12345', key: 'aaaa/bbbb', level: 5 }
        });
        app_state.set('currentBoardState', null);
        stashesForTests().persist('board_level', 8);
        app_state.toggle_mode('speak', {override_state: {key: 'aaaa/bbbb', id: '1_12345'}});
        expect(stashesForTests().get('board_level')).toEqual(5);
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
      primeSpeakModeUser({
        preferences: {
          home_board: {key: 'lingolinq/yesno'}
        }
      });
      stub(app_state, 'toggle_mode', function(mode, options) {
        found_mode = mode;
        found_options = options;
      });
      stubBoardTransition();
      app_state.home_in_speak_mode();
      expect(found_mode).toEqual('speak');
      expect(found_options.force).toEqual(true);
      expect(found_options.override_state.key).toEqual('lingolinq/yesno');
    });

    it("should transition to the right route", function() {
      primeSpeakModeUser({
        preferences: {
          home_board: {key: 'lingolinq/yesno'}
        }
      });
      stub(app_state, 'toggle_mode', function(mode, options) {
      });
      stubBoardTransition();
      app_state.home_in_speak_mode();
      expect(app_state._testBoardTransitionKey).toEqual('lingolinq/yesno');
    });

    it("should use the current user's home board", function() {
      stub(app_state, 'toggle_mode', function(mode, options) {
      });
      primeSpeakModeUser({
        preferences: {
          home_board: {key: 'lingolinq/inflections'}
        }
      });
      stubBoardTransition();
      app_state.home_in_speak_mode();
      expect(app_state._testBoardTransitionKey).toEqual('lingolinq/inflections');
    });

    it("should fall back to a stashed board when no home board is set", function() {
      stub(app_state, 'toggle_mode', function(mode, options) {
      });
      var warned = false;
      stub(modal, 'warning', function() {
        warned = true;
      });
      stubBoardTransition();
      stashes.set('root_board_state', null);
      app_state.set('sessionUser', null);
      app_state.set('currentUser', null);

      app_state.home_in_speak_mode();
      expect(warned).toEqual(true);
      expect(app_state._testBoardTransitionKey).toEqual(null);

      stashes.set('root_board_state', {key: 'lingolinq/keyboard'});
      app_state.home_in_speak_mode();
      expect(app_state._testBoardTransitionKey).toEqual('lingolinq/keyboard');
    });
  });

  describe('check_scanning', function() {
    beforeEach(function() {
      stashesForTests().persist('current_mode', 'default');
      app_state.set('currentBoardState', null);
      app_state.set('sessionUser', null);
      scanner.scanning = false;
      scanner.interval = null;
      scanner.options = null;
    });

    it("should start scanning if state is correct", function() {
      stashesForTests().persist('current_mode', 'speak');
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
      stashesForTests().persist('current_mode', 'default');
      app_state.set('currentBoardState', null);
      scanner.interval = true;
      scanner.scanning = false;
      var stopped = false;
      stub(scanner, 'stop', function() {
        stopped = true;
      });
      app_state.check_scanning();
      expect(stopped).toEqual(false);
      waitsFor(function() {
        return stopped;
      }, 10000);
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
      stubSpeakModeEntry();
      stubBoardTransition();
      stub(app_state, 'speak_mode_handlers', function() { });
      editManager.board = null;
      app_state.set('speakModeUser', null);
      app_state.set('referenced_speak_mode_user', null);
      stashes.persist('speak_mode_user_id', null);
      stashes.persist('referenced_speak_mode_user_id', null);
      stashes.persist('current_mode', 'default');
      stashes.persist('modeling', false);
      stashes.persist('root_board_state', null);
      stashes.persist('temporary_root_board_state', null);
      app_state.set('modeling_for_self', null);
      app_state.set('manual_modeling', false);
      app_state.set('currentBoardState', {key: 'trains', id: 'trains-1'});
    });

    it("should clear SpeakModeUser if set to self", function() {
      stashes.set('current_mode', 'speak');
      app_state.set('sessionUser', null);
      app_state.set('currentUser', null);
      app_state.set('speakModeUser', LingoLinq.store.createRecord('user', {id: '2345'}));
      stub(app_state, 'toggle_speak_mode', function() { });
      stub(app_state, 'home_in_speak_mode', function() { });
      app_state.set_speak_mode_user('self');
      expect(app_state.get('speakModeUser')).toEqual(null);

      app_state.set('speakModeUser', EmberObject.create({id: '3456'}));
      var u = LingoLinq.store.createRecord('user', {id: '1234', membership_type: 'premium'});
      app_state.set('sessionUser', u);
      app_state.set('currentUser', u);
      app_state.set_speak_mode_user('1234');
      expect(app_state.get('speakModeUser')).toEqual(null);
      app_state.set('sessionUser', null);
      app_state.set('currentUser', null);
    });

    it("should find specified user if not set to self", function() {
      var promise = RSVP.resolve({user: withSpeakModeProgress({
        id: '1234',
        user_name: 'fred'
      })});
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
      var promise = RSVP.resolve({user: withSpeakModeProgress({
        id: '1234',
        user_name: 'fred',
        preferences: {
          home_board: {key: 'a/b'}
        }
      })});
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
      var promise = RSVP.resolve({user: withSpeakModeProgress({
        id: '1234',
        user_name: 'fred',
        preferences: {
          home_board: {key: 'a/b'}
        }
      })});
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
      var promise = RSVP.resolve({user: withSpeakModeProgress({
        id: '1234',
        user_name: 'fred',
        preferences: {
          progress: { speak_mode_intro_done: true, modeling_intro_done: true }
        }
      })});
      queryLog.defineFixture({
        method: 'GET',
        type: 'user',
        response: promise,
        id: "1234"
      });
      primeSessionUser({ preferences: { home_board: { key: 'c/d' } } });

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
      var promise = RSVP.resolve({user: withSpeakModeProgress({
        id: '1234',
        user_name: 'fred',
        preferences: {
          home_board: {key: 'a/b'}
        }
      })});
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
      var promise = RSVP.resolve({user: withSpeakModeProgress({
        id: '1234',
        user_name: 'fred'
      })});
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
      primeSessionUser({ id: '234', preferences: { home_board: { id: '111', key: 'home/one' } } });
      app_state.set_speak_mode_user('self', false, true);
      expect(stashes.get('root_board_state.id')).toEqual('111');
      expect(stashes.get('root_board_state.key')).toEqual('home/one');
      expect(stashes.get('temporary_root_board_state.key')).toEqual('trains');
      expect(stashes.get('temporary_root_board_state.id')).toEqual('trains-1');
      expect(app_state.get('currentUser.id')).toEqual('234');
      expect(app_state.get('currentBoardState.key')).toEqual('trains');
      expect(app_state.get('currentBoardState.id')).toEqual('trains-1');
      expect(!!app_state.get('modeling')).toEqual(false);
    });

    it('should set the current board to temporary home and remember the real home if not jumping and user it matches session user', function() {
      primeSessionUser({ id: '234', preferences: { home_board: { id: '111', key: 'home/one' } } });
      app_state.set_speak_mode_user('234', false, true);
      expect(stashes.get('root_board_state.id')).toEqual('111');
      expect(stashes.get('root_board_state.key')).toEqual('home/one');
      expect(stashes.get('temporary_root_board_state.key')).toEqual('trains');
      expect(stashes.get('temporary_root_board_state.id')).toEqual('trains-1');
      expect(app_state.get('currentUser.id')).toEqual('234');
      expect(app_state.get('currentBoardState.key')).toEqual('trains');
      expect(app_state.get('currentBoardState.id')).toEqual('trains-1');
      expect(app_state.get('referenced_speak_mode_user.id')).toEqual(undefined);
      expect(!!app_state.get('modeling')).toEqual(false);
    });

    it('should mark as the modeled user if entering in modeling mode', function() {
      primeSessionUser();
      queryLog.defineFixture({
        method: 'GET',
        type: 'user',
        response: RSVP.resolve({user: withSpeakModeProgress({
          id: '2345',
          user_name: 'modeling_user',
          preferences: {
            home_board: {id: '222', key: 'home/two'}
          }
        })}),
        id: '2345'
      });
      app_state.set_speak_mode_user('2345', false, true);
      waitsFor(function() { return app_state.get('modeling'); });
      runs(function() {
        expect(stashes.get('root_board_state.id')).toEqual('111');
        expect(stashes.get('root_board_state.key')).toEqual('home/one');
        expect(stashes.get('temporary_root_board_state.key')).toEqual('trains');
        expect(stashes.get('temporary_root_board_state.id')).toEqual('trains-1');
        expect(app_state.get('currentBoardState.key')).toEqual('trains');
        expect(app_state.get('currentBoardState.id')).toEqual('trains-1');
        expect(app_state.get('currentUser.id')).toEqual('234');
        expect(app_state.get('referenced_speak_mode_user.id')).toEqual('2345');
        expect(app_state.get('modeling_for_user')).toEqual(true);
        expect(!!app_state.get('manual_modeling')).toEqual(false);
      });
    });

    it('should mark the current board as temporary home if already in speak mode and switching without jumping', function() {
      primeSessionUser();
      stashes.set('current_mode', 'speak');
      queryLog.defineFixture({
        method: 'GET',
        type: 'user',
        response: RSVP.resolve({user: withSpeakModeProgress({
          id: '2345',
          user_name: 'modeling_user',
          preferences: {
            home_board: {id: '222', key: 'home/two'}
          }
        })}),
        id: '2345'
      });
      expect(app_state.get('speak_mode')).toEqual(true);
      app_state.set_speak_mode_user('2345', false, true);
      waitsFor(function() { return app_state.get('modeling_for_user'); });
      runs(function() {
        expect(stashes.get('root_board_state')).toEqual(null);
        expect(stashes.get('temporary_root_board_state')).toEqual({key: 'trains', id: 'trains-1'});
        expect(app_state.get('currentUser.id')).toEqual('234');
        expect(app_state.get('referenced_speak_mode_user.id')).toEqual('2345');
        expect(app_state.get('currentBoardState.key')).toEqual('trains');
        expect(app_state.get('currentBoardState.id')).toEqual('trains-1');
        expect(app_state.get('modeling_for_user')).toEqual(true);
        expect(!!app_state.get('manual_modeling')).toEqual(false);
      });
    });

    it('should remember the session user real home if not modeling and not jumping', function() {
      primeSessionUser();
      stashes.persist('root_board_state', null);
      app_state.set_speak_mode_user('self', false, true);
      waitsFor(function() { return stashes.get('root_board_state'); });
      runs(function() {
        expect(stashes.get('root_board_state.id')).toEqual('111');
        expect(stashes.get('root_board_state.key')).toEqual('home/one');
        expect(stashes.get('temporary_root_board_state.key')).toEqual('trains');
        expect(stashes.get('temporary_root_board_state.id')).toEqual('trains-1');
        expect(app_state.get('currentUser.id')).toEqual('234');
        expect(app_state.get('referenced_speak_mode_user.id')).toEqual(undefined);
        expect(app_state.get('currentBoardState.key')).toEqual('trains');
        expect(app_state.get('currentBoardState.id')).toEqual('trains-1');
        expect(app_state.get('modeling_for_user')).toEqual(false);
        expect(!!app_state.get('manual_modeling')).toEqual(false);
      });
    });

    it('should remember the specified user real home if modeling and not jumping', function() {
      primeSessionUser();
      stashes.set('current_mode', 'speak');
      queryLog.defineFixture({
        method: 'GET',
        type: 'user',
        response: RSVP.resolve({user: withSpeakModeProgress({
          id: '2345',
          user_name: 'modeling_user',
          preferences: {
            home_board: {id: '222', key: 'home/two'}
          }
        })}),
        id: '2345'
      });
      expect(app_state.get('speak_mode')).toEqual(true);
      app_state.set_speak_mode_user('2345', false, true);
      waitsFor(function() { return app_state.get('modeling_for_user'); });
      runs(function() {
        expect(stashes.get('root_board_state')).toEqual(null);
        expect(stashes.get('temporary_root_board_state')).toEqual({key: 'trains', id: 'trains-1'});
        expect(app_state.get('referenced_speak_mode_user.id')).toEqual('2345');
        expect(app_state.get('currentBoardState.key')).toEqual('trains');
        expect(app_state.get('currentBoardState.id')).toEqual('trains-1');
        expect(app_state.get('modeling_for_user')).toEqual(true);
        expect(!!app_state.get('manual_modeling')).toEqual(false);
      });
    });

    it('should remember the specified user real home if entering as the user and not jumping', function() {
      primeSessionUser();
      queryLog.defineFixture({
        method: 'GET',
        type: 'user',
        response: RSVP.resolve({user: withSpeakModeProgress({
          id: '2345',
          user_name: 'modeling_user',
          preferences: {
            home_board: {id: '222', key: 'home/two'}
          }
        })}),
        id: '2345'
      });
      expect(app_state.get('speak_mode')).toEqual(false);
      app_state.set_speak_mode_user('2345', false, false);
      waitsFor(function() { return app_state.get('speakModeUser'); });
      runs(function() {
        expect(stashes.get('root_board_state.id')).toEqual('222');
        expect(stashes.get('root_board_state.key')).toEqual('home/two');
        expect(stashes.get('temporary_root_board_state.key')).toEqual('trains');
        expect(stashes.get('temporary_root_board_state.id')).toEqual('trains-1');
        expect(app_state.get('currentUser.id')).toEqual('2345');
        expect(app_state.get('referenced_speak_mode_user.id')).toEqual('2345');
        expect(app_state.get('currentBoardState.key')).toEqual('trains');
        expect(app_state.get('currentBoardState.id')).toEqual('trains-1');
        expect(app_state.get('speakModeUser.id')).toEqual('2345');
        expect(app_state.get('modeling_for_user')).toEqual(false);
        expect(!!app_state.get('manual_modeling')).toEqual(false);
      });
    });

    it('should not mark as temporary home if jumping to the actual home', function() {
      primeSessionUser();
      queryLog.defineFixture({
        method: 'GET',
        type: 'user',
        response: RSVP.resolve({user: withSpeakModeProgress({
          id: '2345',
          user_name: 'modeling_user',
          preferences: {
            home_board: {id: '222', key: 'home/two'}
          }
        })}),
        id: '2345'
      });
      stub(modal, 'open', function(type) {
        if(type == 'premium-required') { return RSVP.resolve(); }
        return RSVP.reject();
      });
      expect(app_state.get('speak_mode')).toEqual(false);
      app_state.set_speak_mode_user('2345', true, false);
      waitsFor(function() { return app_state.get('speakModeUser'); });
      runs(function() {
        expect(stashes.get('root_board_state')).toEqual({id: '222', key: 'home/two'});
        expect(stashes.get('temporary_root_board_state')).toEqual(null);
        expect(app_state.get('referenced_speak_mode_user.id')).toEqual('2345');
        expect(app_state.get('currentUser.id')).toEqual('2345');
        expect(app_state._testBoardTransitionKey).toEqual('home/two');
        expect(app_state.get('speakModeUser.id')).toEqual('2345');
        expect(app_state.get('modeling_for_user')).toEqual(false);
        expect(!!app_state.get('manual_modeling')).toEqual(false);
      });
    });

    it('should jump to the session user home if not modeling and not entering as the user', function() {
      primeSessionUser();
      expect(app_state.get('speak_mode')).toEqual(false);
      app_state.set_speak_mode_user('234', true, true);
      waitsFor(function() { return stashes.get('root_board_state.id') == '111'; });
      runs(function() {
        expect(stashes.get('root_board_state')).toEqual({id: '111', key: 'home/one'});
        expect(stashes.get('temporary_root_board_state')).toEqual(null);
        expect(app_state.get('referenced_speak_mode_user.id')).toEqual(undefined);
        expect(app_state.get('currentUser.id')).toEqual('234');
        expect(app_state._testBoardTransitionKey).toEqual('home/one');
        expect(app_state.get('speakModeUser.id')).toEqual(undefined);
        expect(app_state.get('modeling_for_user')).toEqual(false);
        expect(!!app_state.get('manual_modeling')).toEqual(false);
      });
    });

    it('should jump to the modeled user home if modeling', function() {
      primeSessionUser();
      queryLog.defineFixture({
        method: 'GET',
        type: 'user',
        response: RSVP.resolve({user: withSpeakModeProgress({
          id: '2345',
          user_name: 'modeling_user',
          preferences: {
            home_board: {id: '222', key: 'home/two'}
          }
        })}),
        id: '2345'
      });
      stub(modal, 'open', function(type) {
        if(type == 'premium-required') { return RSVP.resolve(); }
        return RSVP.reject();
      });
      expect(app_state.get('speak_mode')).toEqual(false);
      app_state.set_speak_mode_user('2345', true, true);
      waitsFor(function() { return stashes.get('root_board_state.id') == '222'; });
      runs(function() {
        expect(stashes.get('root_board_state')).toEqual({id: '222', key: 'home/two'});
        expect(stashes.get('temporary_root_board_state')).toEqual(null);
        expect(app_state.get('referenced_speak_mode_user.id')).toEqual('2345');
        expect(app_state.get('currentUser.id')).toEqual('234');
        expect(app_state._testBoardTransitionKey).toEqual('home/two');
        expect(app_state.get('speakModeUser.id')).toEqual(undefined);
        expect(app_state.get('modeling_for_user')).toEqual(true);
        expect(!!app_state.get('manual_modeling')).toEqual(false);
      });
    });

    it('should jump to the modeling user home if entering as the user', function() {
      primeSessionUser();
      queryLog.defineFixture({
        method: 'GET',
        type: 'user',
        response: RSVP.resolve({user: withSpeakModeProgress({
          id: '2345',
          user_name: 'modeling_user',
          preferences: {
            home_board: {id: '222', key: 'home/two'}
          }
        })}),
        id: '2345'
      });
      stub(modal, 'open', function(type) {
        if(type == 'premium-required') { return RSVP.resolve(); }
        return RSVP.reject();
      });
      expect(app_state.get('speak_mode')).toEqual(false);
      app_state.set_speak_mode_user('2345', true, false);
      waitsFor(function() { return app_state.get('speakModeUser'); });
      runs(function() {
        expect(stashes.get('root_board_state')).toEqual({id: '222', key: 'home/two'});
        expect(stashes.get('temporary_root_board_state')).toEqual(null);
        expect(app_state.get('referenced_speak_mode_user.id')).toEqual('2345');
        expect(app_state.get('currentUser.id')).toEqual('2345');
        expect(app_state._testBoardTransitionKey).toEqual('home/two');
        expect(app_state.get('speakModeUser.id')).toEqual('2345');
        expect(app_state.get('modeling_for_user')).toEqual(false);
        expect(!!app_state.get('manual_modeling')).toEqual(false);
      });
    });

    it('should mark as modeling mode if keeping as self for different user', function() {
      primeSessionUser();
      queryLog.defineFixture({
        method: 'GET',
        type: 'user',
        response: RSVP.resolve({user: withSpeakModeProgress({
          id: '2345',
          user_name: 'modeling_user',
          preferences: {
            home_board: {id: '222', key: 'home/two'}
          }
        })}),
        id: '2345'
      });
      expect(app_state.get('speak_mode')).toEqual(false);
      app_state.set_speak_mode_user('2345', false, true);
      waitsFor(function() { return stashes.get('root_board_state'); });
      runs(function() {
        expect(stashes.get('root_board_state.id')).toEqual('111');
        expect(stashes.get('root_board_state.key')).toEqual('home/one');
        expect(stashes.get('temporary_root_board_state.key')).toEqual('trains');
        expect(stashes.get('temporary_root_board_state.id')).toEqual('trains-1');
        expect(app_state.get('referenced_speak_mode_user.id')).toEqual('2345');
        expect(app_state.get('currentUser.id')).toEqual('234');
        expect(app_state.get('currentBoardState.key')).toEqual('trains');
        expect(app_state.get('currentBoardState.id')).toEqual('trains-1');
        expect(app_state.get('speakModeUser.id')).toEqual(undefined);
        expect(app_state.get('modeling_for_user')).toEqual(true);
        expect(!!app_state.get('manual_modeling')).toEqual(false);
      });
    });

    it('should not mark as modeling mode if entering as self', function() {
      primeSessionUser();
      queryLog.defineFixture({
        method: 'GET',
        type: 'user',
        response: RSVP.resolve({user: withSpeakModeProgress({
          id: '2345',
          user_name: 'modeling_user',
          preferences: {
            home_board: {id: '222', key: 'home/two'}
          }
        })}),
        id: '2345'
      });
      expect(app_state.get('speak_mode')).toEqual(false);
      app_state.set_speak_mode_user('self', true, true);
      waitsFor(function() { return stashes.get('root_board_state'); });
      runs(function() {
        expect(stashes.get('root_board_state')).toEqual({id: '111', key: 'home/one'});
        expect(stashes.get('temporary_root_board_state')).toEqual(null);
        expect(app_state.get('referenced_speak_mode_user.id')).toEqual(undefined);
        expect(app_state.get('currentUser.id')).toEqual('234');
        expect(app_state._testBoardTransitionKey).toEqual('home/one');
        expect(app_state.get('speakModeUser.id')).toEqual(undefined);
        expect(app_state.get('modeling_for_user')).toEqual(false);
        expect(!!app_state.get('manual_modeling')).toEqual(false);
      });
    });

    it('should not mark as modeling mode if entering as another user', function() {
      primeSessionUser();
      queryLog.defineFixture({
        method: 'GET',
        type: 'user',
        response: RSVP.resolve({user: withSpeakModeProgress({
          id: '2345',
          user_name: 'modeling_user',
          preferences: {
            home_board: {id: '222', key: 'home/two'}
          }
        })}),
        id: '2345'
      });
      stub(modal, 'open', function(type) {
        if(type == 'premium-required') { return RSVP.resolve(); }
        return RSVP.reject();
      });
      expect(app_state.get('speak_mode')).toEqual(false);
      app_state.set_speak_mode_user('2345', true, false);
      waitsFor(function() { return app_state._testBoardTransitionKey == 'home/two'; });
      runs(function() {
        expect(stashes.get('root_board_state')).toEqual({id: '222', key: 'home/two'});
        expect(stashes.get('temporary_root_board_state')).toEqual(null);
        expect(app_state.get('referenced_speak_mode_user.id')).toEqual('2345');
        expect(app_state.get('currentUser.id')).toEqual('2345');
        expect(app_state._testBoardTransitionKey).toEqual('home/two');
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
    beforeEach(function() {
      stubBoardTransition();
    });

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
      stubStashesLog(function(l) {
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
      app_state.set('currentBoardState', {key: 'kick', id: '1_2'});
      app_state.jump_to_board({key: 'yodel', id: '1_1'});
      expect(app_state._testBoardTransitionKey).toEqual('yodel');
    });

    it("should not apply sidebar locale for Flexiones, Inflections, or Keyboard", function() {
      app_state.set('currentBoardState', {key: 'lingolinq/quick-core-40', id: '1_2'});
      var s = stashesForTests();
      s.persist('override_label_locale', 'es');
      s.persist('override_vocalization_locale', 'es');
      s.persist('label_locale', 'es');
      s.persist('vocalization_locale', 'es');
      app_state.set('label_locale', 'es');
      app_state.set('vocalization_locale', 'es');

      app_state.jump_to_board({
        key: 'lingolinq/inflections-es',
        id: '1_9',
        source: 'sidebar',
        locale: 'en'
      });

      expect(s.get('override_label_locale')).toEqual('es');
      expect(s.get('override_vocalization_locale')).toEqual('es');
      expect(s.get('label_locale')).toEqual('es');
      expect(app_state.get('label_locale')).toEqual('es');
    });

    it("should not apply sidebar locale for regular vocabulary boards either", function() {
      app_state.set('currentBoardState', {key: 'lingolinq/quick-core-40', id: '1_2'});
      var s = stashesForTests();
      s.persist('override_label_locale', 'es');
      s.persist('override_vocalization_locale', 'es');
      s.persist('label_locale', 'es');
      s.persist('vocalization_locale', 'es');
      app_state.set('label_locale', 'es');
      app_state.set('vocalization_locale', 'es');

      app_state.jump_to_board({
        key: 'lingolinq/yesno',
        id: '1_8',
        source: 'sidebar',
        locale: 'en'
      });

      expect(s.get('override_label_locale')).toEqual('es');
      expect(s.get('label_locale')).toEqual('es');
      expect(app_state.get('label_locale')).toEqual('es');
    });

    it("should still apply locale on a non-sidebar jump", function() {
      app_state.set('currentBoardState', {key: 'lingolinq/quick-core-40', id: '1_2'});
      var s = stashesForTests();
      s.persist('override_label_locale', 'es');
      s.persist('label_locale', 'es');
      app_state.set('label_locale', 'es');

      app_state.jump_to_board({
        key: 'lingolinq/quick-core-24',
        id: '1_8',
        locale: 'en'
      });

      expect(s.get('label_locale')).toEqual('en');
      expect(app_state.get('label_locale')).toEqual('en');
    });
  });

  describe('back_one_board', function() {
    beforeEach(function() {
      stubBoardTransition();
    });

    it("should pop the history stack", function() {
      app_state.set_history([{}, {}]);
      app_state.back_one_board();
      var history = app_state.get_history();
      expect(history.length).toEqual(1);
      app_state.set_history([]);
    });

    it("should log an event", function() {
      app_state.set_history([{key: 'ground'}]);
      var event = null;
      stubStashesLog(function(e) {
        event = e;
      });
      app_state.back_one_board();
      expect(event.action).toEqual('back');
      app_state.set_history([]);
    });

    it("should transition to the last history event", function() {
      app_state.set_history([{key: 'ground'}]);
      app_state.back_one_board();
      expect(app_state._testBoardTransitionKey).toEqual('ground');
    });

    it("should restore Switch Languages on back", function() {
      app_state.set('currentBoardState', {key: 'lingolinq/inflections-es', id: '1_9'});
      app_state.set_history([{key: 'lingolinq/quick-core-40'}]);
      var s = stashesForTests();
      s.persist('override_label_locale', 'es');
      s.persist('override_vocalization_locale', 'es');
      s.persist('label_locale', 'en');
      app_state.set('label_locale', 'en');
      app_state.back_one_board();
      expect(s.get('label_locale')).toEqual('es');
      expect(app_state.get('label_locale')).toEqual('es');
    });
  });

  describe('jump_to_root_board', function() {
    beforeEach(function() {
      stubBoardTransition();
    });

    it("should clear history", function() {
      app_state.set_history([{}, {}]);
      app_state.jump_to_root_board();
      expect(app_state.get_history()).toEqual([]);
    });

    it("should not log an event if the route isn't changing", function() {
      var event = null;
      stashes.set('root_board_state', null);
      stubStashesLog(function(e) {
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
      stubStashesLog(function(e) {
        event = e;
      });
      app_state.set('currentBoardState', {key: 'yodel'});
      app_state.set('sessionUser', EmberObject.create({
        preferences: {
          home_board: {key: 'igneous'}
        }
      }));
      app_state.set('currentUser', app_state.get('sessionUser'));
      app_state.jump_to_root_board();
      expect(event.action).toEqual('home');
    });

    it("should log an auto_home event if the route is changing because of auto_home", function() {
      var event = null;
      stubStashesLog(function(e) {
        event = e;
      });
      app_state.set('currentBoardState', {key: 'yodel'});
      app_state.set('sessionUser', EmberObject.create({
        preferences: {
          home_board: {key: 'igneous'}
        }
      }));
      app_state.set('currentUser', app_state.get('sessionUser'));
      app_state.jump_to_root_board({auto_home: true});
      expect(event.action).toEqual('auto_home');
    });

    it("should transition to root_board_state if defined", function() {
      stashes.set('root_board_state', {key: 'under'});
      app_state.set('sessionUser', EmberObject.create({
        preferences: {
          home_board: {key: 'halo'}
        }
      }));
      app_state.set('currentUser', app_state.get('sessionUser'));

      app_state.jump_to_root_board({index_as_fallback: true});
      expect(app_state._testBoardTransitionKey).toEqual('under');

      app_state._testBoardTransitionKey = null;
      app_state.jump_to_root_board();
      expect(app_state._testBoardTransitionKey).toEqual('under');
    });

    it("should transition to user's home board if no root_board_state", function() {
      stashes.set('root_board_state', null);
      app_state.set('sessionUser', EmberObject.create({
        preferences: {
          home_board: {key: 'halo'}
        }
      }));
      app_state.set('currentUser', app_state.get('sessionUser'));

      app_state.jump_to_root_board({index_as_fallback: true});
      expect(app_state._testBoardTransitionKey).toEqual('halo');

      app_state._testBoardTransitionKey = null;
      app_state.jump_to_root_board();
      expect(app_state._testBoardTransitionKey).toEqual('halo');
    });

    it("should transition to the temporary root board if temporary_root_board_state is set", function() {
      stashes.set('root_board_state', {key: 'under'});
      app_state.set('sessionUser', EmberObject.create({
        preferences: {
          home_board: {key: 'halo'}
        }
      }));
      app_state.set('currentUser', app_state.get('sessionUser'));
      stashes.set('temporary_root_board_state', {key: 'orange'});

      app_state.jump_to_root_board({index_as_fallback: true});
      expect(app_state._testBoardTransitionKey).toEqual('orange');

      app_state._testBoardTransitionKey = null;
      app_state.jump_to_root_board();
      expect(app_state._testBoardTransitionKey).toEqual('orange');
    });

    it("should transition to the index page if no user or root_board_state defined and index_as_fallback is allowed", function() {
      stashes.set('root_board_state', null);
      stashes.set('temporary_root_board_state', null);
      app_state.set('sessionUser', EmberObject.create({
        preferences: {
          home_board: {}
        }
      }));
      app_state.set('currentUser', app_state.get('sessionUser'));
      var indexCalled = false;
      stub(app_state, 'return_to_index', function() {
        indexCalled = true;
      });

      app_state.jump_to_root_board({index_as_fallback: true});
      expect(indexCalled).toEqual(true);

      indexCalled = false;
      app_state.jump_to_root_board();
      expect(indexCalled).toEqual(false);
      expect(app_state._testBoardTransitionKey).toEqual(null);
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
      var user = LingoLinq.store.createRecord('user', {
        preferences: {
          sidebar_boards: [{id: '1', key: 'a/b'}, {id: '2', key: 'c/d'}]
        }
      });
      app_state.set('currentUser', user);
      app_state.set('sessionUser', user);
      stub(window, 'user_preferences', {
        any_user: {
          default_sidebar_boards: [2, 3]
        }
      });
      expect(app_state.get('sidebar_boards.length')).toEqual(2);
      expect(app_state.get('sidebar_boards.0.key')).toEqual('a/b');
    });
  });

  describe("check_for_user_updated", function() {
    it("should set last_sync_stamp when sessionUser changes", function() {
      var p = persistenceTarget();
      p.set('last_sync_stamp', null);
      app_state.set('sessionUser', EmberObject.create({sync_stamp: 'asdf'}));
      waitsFor(function() { return p.get('last_sync_stamp') == 'asdf'; });
      runs();
    });

    it("should set last_sync_stamp_interval", function() {
      var p = persistenceTarget();
      p.set('last_sync_stamp', null);
      app_state.set('sessionUser', EmberObject.create({sync_stamp: 'asdf'}));
      waitsFor(function() { return p.get('last_sync_stamp') == 'asdf'; });
      runs(function() {
        expect(p.get('last_sync_stamp_interval')).toEqual(5 * 60 * 1000);
      });
    });

    it("should use the user's interval preference if defined", function() {
      var p = persistenceTarget();
      p.set('last_sync_stamp', null);
      app_state.set('sessionUser', EmberObject.create({sync_stamp: 'asdf', preferences: {'sync_refresh_interval': 10}}));
      waitsFor(function() { return p.get('last_sync_stamp') == 'asdf'; });
      runs(function() {
        expect(p.get('last_sync_stamp_interval')).toEqual(10000);
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
      stashesForTests().set('geo.latest', {coords: {latitude: 1, longitude: 1}});
      app_state.set('currentUser', EmberObject.create({
        sidebar_boards_with_fallbacks: [
          {key: 'a', highlight_type: 'locations', geos: [[1.0001, 1.0001]]},
          {key: 'b', highlight_type: 'locations', geos: [[1.0001, 1.0001]]},
          {key: 'c', highlight_type: 'locations', geos: [[1.0001, 1]]}
        ]
      }));
      expect(app_state.get('fenced_sidebar_board')).toNotEqual(undefined);
      expect(app_state.get('fenced_sidebar_board.key')).toEqual('c');
    });

    it("should return a time-matched board if found", function() {
      stashesForTests().set('geo.latest', {coords: {latitude: 1, longitude: 1}});
      var now = (new Date()).getTime();
      var str1 = app_state.time_string(now - (5*60*1000));
      var str2 = app_state.time_string(now + (5*60*1000));
      app_state.set('currentUser', EmberObject.create({
        sidebar_boards_with_fallbacks: [
          {key: 'a', highlight_type: 'locations', geos: [[1.1, 1.1]]},
          {key: 'b', highlight_type: 'locations', geos: [[1.1, 1.1]]},
          {key: 'c', highlight_type: 'times', times: [[str1, str2]]}
        ]
      }));
      expect(app_state.get('fenced_sidebar_board')).toNotEqual(undefined);
      expect(app_state.get('fenced_sidebar_board.key')).toEqual('c');
    });

    it("should return an ssid-matched board if found", function() {
      stashesForTests().set('geo.latest', {coords: {latitude: 1, longitude: 1}});
      var now = (new Date()).getTime();
      app_state.set('current_ssid', 'asdfqwer');
      app_state.set('currentUser', EmberObject.create({
        sidebar_boards_with_fallbacks: [
          {key: 'a', highlight_type: 'locations', geos: [[1.1, 1.1]]},
          {key: 'b', highlight_type: 'locations', ssids: ['asdf', 'asdfqwer']},
          {key: 'c', highlight_type: 'locations', ssids: ['tyui', 'tyihgjk']}
        ]
      }));
      expect(app_state.get('fenced_sidebar_board')).toNotEqual(undefined);
      expect(app_state.get('fenced_sidebar_board.key')).toEqual('b');
    });

    it("should return a place-matched board if found and matching a geo place", function() {
      stashesForTests().set('geo.latest', {coords: {latitude: 1, longitude: 1}});
      var now = (new Date()).getTime();
      app_state.set('nearby_places', [
        {name: 'slammer', latitude: 1.0001, longitude: 1.0001, types: ['dungeon']},
        {name: 'zen', latitude: 1.0002, longitude: 1.0002, types: ['heaven']}
      ]);
      app_state.set('currentUser', EmberObject.create({
        sidebar_boards_with_fallbacks: [
          {key: 'a', highlight_type: 'places', places: ['dungeon', 'prison']},
          {key: 'b', highlight_type: 'places', places: ['dungeon']},
          {key: 'c', highlight_type: 'places', places: ['nirvana', 'heaven', 'bliss']}
        ]
      }));
      expect(app_state.get('fenced_sidebar_board')).toNotEqual(undefined);
      expect(app_state.get('fenced_sidebar_board.key')).toEqual('a');
      stashesForTests().set('geo.latest', {coords: {latitude: 1.0003, longitude: 1.0003}});
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
      var checked = false;
      geo.setup(app_state, persistenceTarget(), stashesForTests());
      stub(geo, 'check_locations', function() {
        checked = true;
        return RSVP.resolve();
      });
      stashesForTests().persist('current_mode', 'speak');
      app_state.set('currentBoardState', {key: 'trade', id: '1_1'});
      expect(app_state.get('speak_mode')).toEqual(true);
      app_state.set('currentUser', EmberObject.create({
        sidebar_boards_with_fallbacks: [{places: [1, 2, 3]}]
      }));
      stashesForTests().set('geo.latest', {coords: {latitude: 1, longitude: 1}});
      waitsFor(function() { return checked; });
      runs();
    });

    it("should not call if the user has no place-based sidebar board", function() {
      stashesForTests().persist('current_mode', 'speak');
      app_state.set('currentBoardState', {key: 'trade', id: '1_1'});
      expect(app_state.get('speak_mode')).toEqual(true);

      var checked = false;
      stashesForTests().set('geo.latest', {});
      app_state.set('currentUser', EmberObject.create({
        sidebar_boards_with_fallbacks: [{}]
      }));
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
      var p = persistenceTarget();
      p.set('auto_sync', null);
      capabilities.installed_app = false;
      var u = LingoLinq.store.createRecord('user');
      u.set('preferences', {device: {ever_synced: false}});
      expect(u.get('auto_sync')).toEqual(false);
      app_state.set('sessionUser', u);

      var round = 0;
      waitsFor(function() { return p.get('auto_sync') === false; });
      runs(function() {
        expect(round).toEqual(0);
        round = 1;
        capabilities.installed_app = true;
        app_state.set('sessionUser.preferences.device.ever_synced', null);
        expect(u.get('auto_sync')).toEqual(true);
      });

      waitsFor(function() { return round == 1 && p.get('auto_sync') === true; });
      runs(function() {
        expect(round).toEqual(1);
        round = 2;
        capabilities.installed_app = false;
        app_state.set('sessionUser.preferences.device.ever_synced', false);
        expect(u.get('auto_sync')).toEqual(false);
      });

      waitsFor(function() { return round == 2 && p.get('auto_sync') === false; });
      runs(function() {
        expect(round).toEqual(2);
        round = 3;
        app_state.set('sessionUser.preferences.device.ever_synced', true);
        expect(u.get('auto_sync')).toEqual(true);
        app_state.set_auto_synced();
      });

      waitsFor(function() { return round == 3 && p.get('auto_sync') === true; });
      runs(function() {
        expect(round).toEqual(3);
        round = 4;
        app_state.set('sessionUser', {});
      });

      waitsFor(function() { return round == 4 && p.get('auto_sync') === false; });
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
      expect(String(app_state.get('board_url'))).toEqual('http://www.stuff.com/a/b');
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
      var user = EmberObject.create({id: '12345', any_limited_supervisor: true});
      app_state.set('sessionUser', user);
      app_state.set('currentUser', user);
      stashesForTests().persist('current_mode', 'speak');
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
      var user = EmberObject.create({id: '12345'});
      app_state.set('sessionUser', user);
      app_state.set('currentUser', user);
      stashesForTests().persist('current_mode', 'speak');
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
      var user = EmberObject.create({id: '12345', expired: true, really_really_expired: true});
      app_state.set('sessionUser', user);
      app_state.set('currentUser', user);
      stashesForTests().persist('current_mode', 'speak');
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
      var user = EmberObject.create({id: '12345', expired: true});
      app_state.set('sessionUser', user);
      app_state.set('currentUser', user);
      stashesForTests().persist('current_mode', 'speak');
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
      later(function() {
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
    xit('should have valid specs', function() {
      expect('test').toEqual('todo');
    });
  });
});
