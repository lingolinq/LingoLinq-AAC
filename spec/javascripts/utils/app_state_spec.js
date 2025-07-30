describe('app_state', function() {
  var app = null;
  beforeEach(function() {
    CoughDrop.reset();
    app = {
      register: function(key, obj, args) {
        app.registered = (key == 'lingolinq:app_state' && obj == app_state && args.singleton == true);
      },
      inject: function(component, name, key) {
        if(name == 'app_state' && key == 'lingolinq:app_state') {
          app.injections.push(component);
        }
      },
      injections: []
    };
    Ember.run(function() {
      CoughDrop.advanceReadiness();
    });
  });

  describe('setup', function() {
    it("should properly inject settings", function() {
      app_state.setup({}, app);
      expect(app.registered).toEqual(true);
      expect(app.injections).toEqual(['model', 'controller', 'view', 'route']);
    });
    it("should initialize", function() {
      var called = false;
      stub(app_state, 'refresh_user', function() {
        called = true;
      });
      app_state.setup({}, app);
      expect(app_state.get('button_list')).toEqual([]);
      expect(app_state.get('stashes')).toEqual(stashes);
      expect(called).toEqual(true);
    });
  });
  
  describe('setup_controller', function() {
    it("should initialize on app startup", function() {
      app_state.setup({}, app);
      
      var modal_closed = false;
      var logging_checked = false;
      var board_state_checked = false;
      var bound_classes_setup = false;
      var utterance_setup = false;
      
      var controller = Ember.Object.create({controller: 'controlleyness'});
      var session = Ember.Object.create();
      var route = Ember.Object.create({route: 'routeyness', session: session});
      stub(modal, 'close', function() {
        modal_closed = true;
      });
      stub(app_state, 'check_logging', function() {
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
      expect(CoughDrop.controller).toEqual(controller);
      expect(app_state.controller).toEqual(controller);
      expect(stashes.controller).toEqual(controller);
      expect(boardGrabber.transitioner).toEqual(route);
      expect(bound_classes_setup).toEqual(true);
      expect(controller.get('model')).not.toEqual(undefined);
      expect(utterance_setup).toEqual(true);
      expect(logging_checked).toEqual(true);
      expect(board_state_checked).toEqual(true);
      expect(CoughDrop.session).toEqual(session);
      expect(modal_closed).toEqual(true);
    });
  });

  describe('refresh_user', function() {
    it("should cancel an existing refresh", function() {
      app_state.refreshing_user = {a: 1};
      var cancel_event = null;
      stub(Ember.run, 'cancel', function(event) {
        cancel_event = event;
      });
      app_state.refresh_user();
      expect(cancel_event).toEqual({a: 1});
    });
    
    it("should call reload on the current user", function() {
      app_state.refresh_user();
      var reloaded = false;
      app_state.set('currentUser', Ember.Object.extend({
        reload: function() {
          reloaded = true;
          return Ember.RSVP.reject();
        }
      }).create());
      expect(app_state.refreshing_user).not.toEqual(undefined);
      Ember.run.cancel(app_state.refreshing_user);
    });
  });

  describe('global_transition', function() {
    it("should clean up state", function() {
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
      var refresh_called = false;
      stub(app_state, 'refresh_session_user', function() {
        refresh_called = true;
      });
      CoughDrop.session.set('isAuthenticated', true);
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
    
    it("should launch the home board in speak mode if not currently on a board", function() {
      var called = false;
      stub(app_state, 'home_in_speak_mode', function() { 
        called = true;
      });
      app_state.toggle_speak_mode();
      expect(called).toEqual(true);
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
      app_state.set('sessionUser', Ember.Object.create({
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
      expect(pin_settings).toEqual({actual_pin: '1234'})
    });
    
    it("should skip asking for a pin if 'off' is the decision", function() {
      var called = false;
      stub(app_state, 'toggle_mode', function(mode) { 
        called = mode == 'speak';
      });
      app_state.set('currentBoardState', {key: 'hat'});
      app_state.set('sessionUser', Ember.Object.create({
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
    
    it("should launch the current board in speak mode if the user has no home board set", function() {
      var mode = null;
      stub(app_state, 'toggle_mode', function(m) {
        mode = m;
      });
      app_state.set('sessionUser', Ember.Object.create({
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
      app_state.set('sessionUser', Ember.Object.create({
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
      app_state.set('sessionUser', Ember.Object.create({
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
    
    it("should ask which home if not on the user's home board and no decision is specified", function() {
      var mode = null;
      stub(app_state, 'toggle_mode', function(m) {
        mode = m;
      });
      app_state.set('sessionUser', Ember.Object.create({
        preferences: {
          home_board: {
            key: 'scarf',
            id: '1_1'
          }
        }
      }));
      app_state.set('currentBoardState', {key: 'scarves', id: '1_2'});
      var found_template = null;
      stub(modal, 'open', function(template, settings) {
        found_template = template;
      });
      app_state.toggle_speak_mode();
      expect(mode).toEqual(null);
      expect(found_template).toEqual('which-home');
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
      app_state.toggle_edit_mode();
      expect(toggle_called).toEqual(true);
    });
    
    it("should confirm if necessary and no decision made", function() {
      app_state.controller.set('controllers', {
        board: Ember.Object.create({
          model: Ember.Object.create({could_be_in_use: true})
        })
      });
      var found_template = null;
      var found_settings = null;
      stub(modal, 'open', function(template, settings) {
        found_template = template;
        found_settings = settings;
      });
      stashes.set('current_mode', 'default');
      stub(app_state, 'toggle_mode', function(arg) { });
      stub(editManager, 'clear_history', function() { });
      app_state.toggle_edit_mode();
      expect(found_template).toEqual('confirm-edit-board');
      expect(found_settings.board).toEqual(app_state.controller.get('controllers.board').get('model'));
    });
    
    it("should not confirm if necessary and decision made", function() {
      app_state.controller.set('controllers', {
        board: Ember.Object.create({
          model: Ember.Object.create({could_be_in_use: true})
        })
      });
      var found_template = null;
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
    
    it("should popup premium-required notification if running as an app and the user isn't premium-enabled", function() {
      var found_template = null;
      var found_settings = null;
      stub(modal, 'open', function(template, settings) {
        found_template = template;
        found_settings = settings;
      });
      var browserless = capabilities.browserless;
      capabilities.browserless = true;
      app_state.set('sessionUser', Ember.Object.create({premium_enabled: false}));
      app_state.toggle_mode('speak');
      expect(found_template).toEqual('premium-required');
      expect(found_settings).toEqual({restricted_because_app: true, action: 'app_speak_mode'});
      capabilities.browserless = browserless;
    });
    
    it("should poll for geo if enabled and entering speak mode", function() {
      var polling = false;
      stub(stashes.geo, 'poll', function() {
        polling = true;
      });
      app_state.set('sessionUser', Ember.Object.create({
        preferences: {geo_logging: true}
      }));
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
      app_state.set('sessionUser', Ember.Object.create({
        preferences: {logging: true}
      }));
      app_state.toggle_mode('speak');
      expect(stashes.get('current_mode')).toEqual('speak');
      expect(notice).toEqual('Logging is enabled');
    });
  });
  
  it("should ignore current state if force specified as an option", function() {
    stashes.set('current_mode', 'speak');
    app_state.toggle_mode('speak');
    expect(stashes.get('current_mode')).toEqual('default');
    
    stashes.set('current_mode', 'speak');
    app_state.toggle_mode('edit');
    expect(stashes.get('current_mode')).toEqual('edit');

    stashes.set('current_mode', 'speak');
    app_state.toggle_mode('speak', {force: true});
    expect(stashes.get('current_mode')).toEqual('speak');

    stashes.set('current_mode', 'edit');
    app_state.toggle_mode('edit');
    expect(stashes.get('current_mode')).toEqual('speak');

    stashes.set('current_mode', 'edit');
    app_state.toggle_mode('edit', {force: true});
    expect(stashes.get('current_mode')).toEqual('edit');
  });

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
      app_state.set('sessionUser', Ember.Object.create({
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
      app_state.set('sessionUser', Ember.Object.create({
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
    });
  });

  describe('refresh_session_user', function() {
    it("should try to find the specified user", function() {
      var promise = Ember.RSVP.resolve({user: {
        id: '1',
        user_name: 'fred'
      }});
      queryLog.defineFixture({
        method: 'GET',
        type: CoughDrop.User,
        response: promise,
        id: "self"
      });
      app_state.refresh_session_user();
      waitsFor(function() { return app_state.get('sessionUser.id'); })
      runs(function() {
        expect(app_state.get('sessionUser.user_name')).toEqual('fred');
        app_state.set('sessionUser', null);
      });
    });
  });

  describe('set_speak_mode_user', function() {
    it("should clear SpeakModeUser if set to self", function() {
      stashes.set('current_mode', 'speak');
      app_state.set('sessionUser', null);
      app_state.set('speakModeUser', CoughDrop.store.createRecord('user', {id: '2345'}));
      app_state.set_speak_mode_user('self');
      expect(app_state.get('speakModeUser')).toEqual(null);

      app_state.set('speakModeUser', Ember.Object.create({id: '3456'}));
      app_state.set('sessionUser', Ember.Object.create({id: '1234'}));
      app_state.set_speak_mode_user('1234');
      expect(app_state.get('speakModeUser')).toEqual(null);
      app_state.set('sessionUser', null);
    });
    
    it("should find specified user if not set to self", function() {
      var promise = Ember.RSVP.resolve({user: {
        id: '1234',
        user_name: 'fred'
      }});
      queryLog.defineFixture({
        method: 'GET',
        type: CoughDrop.User,
        response: promise,
        id: "1234"
      });
      editManager.board = null;
      app_state.set('speakModeUser', null);
      stashes.set('current_mode', 'default');
      app_state.set('currentBoardState', {key: 'trains'});
      app_state.set_speak_mode_user('1234');
      waitsFor(function() { return app_state.get('speakModeUser'); });
      runs(function() {
        expect(app_state.get('speakModeUser.user_name')).toEqual('fred');
        expect(stashes.get('current_mode')).toEqual('speak');
        expect(app_state.get('currentUser.id')).toEqual('1234');
      });
    });
    it("should alert on failed user retrieval", function() {
      var promise = Ember.RSVP.reject({stub: true});
      queryLog.defineFixture({
        method: 'GET',
        type: CoughDrop.User,
        response: promise,
        id: "1234"
      });
      promise.then(null, function() { });
      var danger;
      stub(modal, 'danger', function(msg) {
        danger = msg;
      });
      app_state.set('speakModeUser', null);
      stashes.set('current_mode', 'default');
      app_state.set('currentBoardState', {key: 'trains'});
      app_state.set_speak_mode_user('1234');
      waitsFor(function() { return danger; });
      runs(function() {
        expect(danger).toEqual("Failed to retrieve user for Speak Mode");
        expect(app_state.get('speakModeUser.user_name')).toEqual(null);
        expect(stashes.get('current_mode')).toEqual('default');
        expect(app_state.get('currentUser.id')).toEqual(null);
      });
    });
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
        app_state.set('speakModeUser', Ember.Object.create({id: '123'}));
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
      
      waitsFor(function() { return level == 3 && app_state.did_set_current_user });
      runs(function() {
        expect(app_state.get('currentUser.id')).toEqual(null);
        level = 4;
        stashes.set('current_mode', 'speak');
      });
      
      waitsFor(function() { return level == 4 && app_state.get('currentUser.id') == '123'; });
      runs(function() {
        level = 5;
        app_state.did_set_current_user = false;
        app_state.set('sessionUser', Ember.Object.create({id: '234'}));
      });
      
      waitsFor(function() { return level == 5 && app_state.did_set_current_user });
      runs(function() {
        expect(app_state.get('currentUser.id')).toEqual('123');
        level = 6;
        stashes.set('current_mode', 'default')
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
      var user = Ember.Object.create({
        preferences: {
          progress: {}
        }
      });
      var saved = false;
      stub(user, 'save', function() {
        saved = true;
      });
      app_state.set('speakModeUser', null);
      stashes.set('current_mode', 'default');
      app_state.set('sessionUser', user);
      waitsFor(function() { return saved; });
      runs(function() {
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
      
      stashes.set('current_mode', 'speak')
      expect(app_state.get('default_mode')).toEqual(false);
      
      app_state.set('currentBoardState', null);
      expect(app_state.get('default_mode')).toEqual(true);      
    });

    it("should properly compute limited_speak_mode_options", function() {
      stashes.set('current_mode', 'speak');
      app_state.set('currentBoardState', {key: 'olive'});
      var user = Ember.Object.create({
        preferences: {
          require_speak_mode_pin: true
        }
      });
      app_state.set('sessionUser', user);
      expect(app_state.get('limited_speak_mode_options')).toEqual(true);
      
      user.set('preferences.require_speak_mode_pin', false);
      expect(app_state.get('limited_speak_mode_options')).toEqual(false);
      
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
      var user = Ember.Object.create({
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

    it("should properly compute speak_mode_possible", function() {
      app_state.set('currentBoardState', {key: 'xylo'});
      var user = Ember.Object.create({
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
      var user = Ember.Object.create({
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
      var user = Ember.Object.create({
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
      app_state.set('sessionUser', Ember.Object.create({
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
      app_state.set('sessionUser', Ember.Object.create({
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
      app_state.set('sessionUser', Ember.Object.create({
        preferences: {
          home_board: {key: 'igneous'}
        }
      }));
      app_state.jump_to_root_board({auto_home: true});
      expect(event).toEqual({action: 'auto_home'});
    });
    
    it("should transition to root_board_state if defined", function() {
      stashes.set('root_board_state', {key: 'under'});
      app_state.set('sessionUser', Ember.Object.create({
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
      app_state.set('sessionUser', Ember.Object.create({
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
      expect(settings).toEqual('halo');

      route = null;
      settings = null;
      app_state.jump_to_root_board();
      expect(route).toEqual('board');
      expect(settings).toEqual('halo');
    });
    
    it("should transition to the index page if no user or root_board_state defined and index_as_fallback is allowed", function() {
      stashes.set('root_board_state', null);
      app_state.set('sessionUser', Ember.Object.create({
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
      expect(settings).toEqual(null);

      route = null;
      settings = null;
      app_state.jump_to_root_board();
      expect(route).toEqual(null);
      expect(settings).toEqual(null);
    });
  });
});
