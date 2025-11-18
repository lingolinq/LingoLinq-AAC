describe('stashes', function() {
  beforeEach(function() {
    localStorage.root_board_state = null;
    Ember.testing = true;
    LingoLinq.reset();
  });
  
  describe("setup", function() {
    it("should allow flushing", function() {
      expect(stashes.flush).not.toEqual(undefined);
      stashes.persist('horse', '1234');
      stashes.flush();
      expect(stashes.get('horse')).toEqual(undefined);
    });
    it("should allow flushing a subset", function() {
      expect(stashes.flush).not.toEqual(undefined);
      stashes.persist('horse_clip', '1234');
      stashes.persist('cat_clip', '1234');
      stashes.flush('horse_');
      expect(stashes.get('horse_clip')).toEqual(undefined);
      expect(stashes.get('cat_clip')).toEqual('1234');
    });
    it("should allow flushing with an ignored subset", function() {
      expect(stashes.flush).not.toEqual(undefined);
      stashes.persist('horse_clip', '1234');
      stashes.persist('cat_clip', '1234');
      stashes.flush(null, 'cat_clip');
      expect(stashes.get('horse_clip')).toEqual(undefined);
      expect(stashes.get('cat_clip')).toEqual('1234');
    });
    it("should initialize configured values", function() {
      stashes.flush();
      stashes.setup();
      expect(stashes.get('working_vocalization')).toNotEqual(null);
      expect(stashes.get('current_mode')).toNotEqual(null);
      expect(stashes.get('usage_log')).toNotEqual(null);
      expect(stashes.get('history_enabled')).toNotEqual(null);
      expect(stashes.get('root_board_state')).toEqual(null);
      expect(stashes.get('sidebar_enabled')).toNotEqual(null);
      expect(stashes.get('remembered_vocalizations')).toNotEqual(null);
      expect(stashes.get('stashed_buttons')).toNotEqual(null);
      expect(stashes.get('bacon')).toEqual(null);
    });
  });
  
  describe("set", function() {
    it("should not error on empty set", function() {
      expect(function() { stashes.persist(null, null); }).not.toThrow();
    });
    it("should set to the hash and persist to local storage", function() {
      stashes.persist('bacon', 1);
      expect(stashes.get('bacon')).toEqual(1);
      expect(JSON.parse(localStorage[stashes.prefix + 'bacon'])).toEqual(1);
      stashes.persist('ham', "ok");
      expect(stashes.get('ham')).toEqual("ok");
      expect(JSON.parse(localStorage[stashes.prefix + 'ham'])).toEqual("ok");
      stashes.persist('pork', true);
      expect(stashes.get('pork')).toEqual(true);
      expect(JSON.parse(localStorage[stashes.prefix + 'pork'])).toEqual(true);
      var obj = {a: 2, b: "ok", c: true, d: ['a', 'b']};
      stashes.persist('jerky', obj);
      expect(stashes.get('jerky')).toEqual(obj);
      expect(JSON.parse(localStorage[stashes.prefix + 'jerky'])).toEqual(obj);
    });
  });
  
  describe("remember", function() {
    it("should do nothing when history is disabled", function() {
      stashes.set('history_enabled', false);
      var count = stashes.get('remembered_vocalizations').length;
      stashes.persist('working_vocalization', [{label: "ok"}, {label: "go"}]);
      stashes.remember();
      expect(stashes.get('remembered_vocalizations').length).toEqual(count);
    });
    
    it("should append to remembered vocalizations", function() {
      stashes.set('history_enabled', true);
      stashes.persist('remembered_vocalizations', []);
      stashes.persist('working_vocalization', [{label: "ok"}, {label: "go"}]);
      stashes.remember();
      expect(stashes.get('remembered_vocalizations').length).toEqual(1);
    })
    it("should generate a sentence based on vocalizations", function() {
      stashes.set('history_enabled', true);
      stashes.persist('remembered_vocalizations', []);
      var count = stashes.get('remembered_vocalizations').length;
      stashes.persist('working_vocalization',  [{label: "ok"}, {label: "go"}]);
      stashes.remember();
      expect(stashes.get('remembered_vocalizations')[0].sentence).toEqual("ok go");
    });
    it("should not append to remembered vocalizations more than once", function() {
    });
    it("should not append empty vocalizations", function() {
      stashes.set('history_enabled', true);
      stashes.persist('remembered_vocalizations', []);
      var count = stashes.get('remembered_vocalizations').length;
      stashes.persist('working_vocalization', []);
      stashes.remember();
      expect(stashes.get('remembered_vocalizations').length).toEqual(0);
    });
  });
  
  describe("geo", function() {
    it("should properly start polling when enabled", function() {
      // TODO
    });
  });
  
  describe("log", function() {
    it("should not error on empty argument", function() {
      expect(function() { stashes.log(); }).not.toThrow();
      expect(stashes.log()).toEqual(null);
    });
    it("should not log when not in speak mode", function() {
      stashes.persist('usage_log', []);
      stashes.log({
        'action': 'jump'
      });
      expect(stashes.get('usage_log').length).toEqual(0);
      stashes.set('speaking_user_id', 1)
      stashes.set('logging_enabled', true);
      stashes.log({
        'action': 'jump'
      });
      expect(stashes.get('usage_log').length).toEqual(1);
    });
    it("should record current timestamp with the log", function() {
      stashes.set('logging_enabled', true);
      var ts = (Date.now() / 1000) - 5;
      var event = stashes.log({
        'action': 'jump'
      });
      expect(event).not.toEqual(null);
      expect(event.timestamp).toBeGreaterThan(ts);
    });
    it("should handle utterance events for the log", function() {
      stashes.set('logging_enabled', true);
      var event = stashes.log({
        'buttons': []
      });
      expect(event.type).toEqual('utterance');
      expect(event.utterance).toEqual({buttons: []});
    });
    it("should handle button events for the log", function() {
      stashes.set('logging_enabled', true);
      var event = stashes.log({
        'button_id': 1
      });
      expect(event.type).toEqual('button');
      expect(event.button).toEqual({button_id: 1});
    });
    it("should handle action events for the log", function() {
      stashes.set('logging_enabled', true);
      var event = stashes.log({
        'action': "backspace"
      });
      expect(event.type).toEqual('action');
      expect(event.action).toEqual({action: "backspace"});
    });
    it("should include geo location if provided", function() {
      stashes.set('logging_enabled', true);
      stashes.geo = {
        latest: {
          coords: {
            latitude: 1,
            longitude: 2,
            altitude: 123
          }
        }
      };
      var event = stashes.log({
        'action': "backspace"
      });
      expect(event.type).toEqual('action');
      expect(event.geo).toEqual([1,2, 123]);
    });
    
    it("should try to push logs to the server periodically", function() {
      stashes.set('logging_enabled', true);
      stashes.set('speaking_user_id', 999);
      stashes.persist('usage_log', [{
        timestamp: 0,
        type: 'action',
        action: {}
      }]);
      queryLog.defineFixture({
        method: 'POST',
        type: LingoLinq.Log,
        response: Ember.RSVP.resolve({log: {id: '134'}}),
        compare: function(object) {
          return object.get('events').length == 2;
        }
      });
      LingoLinq.session = Ember.Object.create({'user_name': 'bob'});
      var logs = queryLog.length;
      expect(stashes.get('usage_log').length).toEqual(1);
      stashes.log({action: 'jump'});
      expect(stashes.get('usage_log').length).toEqual(0);
      
      waitsFor(function() { return queryLog.length > logs; });
      runs(function() {
        expect(stashes.get('usage_log').length).toEqual(0);
        var req = queryLog[queryLog.length - 1];
        expect(req.method).toEqual('POST');
        expect(req.type).toEqual(LingoLinq.Log);
      });
    });
    it("should not try to push to the server if there is no authenticated user", function() {
      stashes.set('logging_enabled', true);
      stashes.persist('usage_log', [{
        timestamp: 0,
        type: 'action',
        action: {}
      }]);
      queryLog.defineFixture({
        method: 'POST',
        type: LingoLinq.Log,
        response: Ember.RSVP.reject(''),
        compare: function(object) {
          return object.get('events').length == 2;
        }
      });
      LingoLinq.session = Ember.Object.create({'user_name': null});
      var logs = queryLog.length;
      stashes.log({action: 'jump'});
      expect(stashes.get('usage_log').length).toEqual(2);
    });
    it("should not lose logs when trying and failing to push to the server", function() {
      stashes.set('logging_enabled', true);
      stashes.set('speaking_user_id', 999);
      stashes.persist('usage_log', [{
        timestamp: 0,
        type: 'action',
        action: {}
      }]);
      queryLog.defineFixture({
        method: 'POST',
        type: LingoLinq.Log,
        response: Ember.RSVP.reject(''),
        compare: function(object) {
          return object.get('events').length == 2;
        }
      });
      LingoLinq.session = Ember.Object.create({'user_name': 'bob'});
      var logs = queryLog.length;
      stashes.log({action: 'jump'});
      expect(stashes.get('usage_log').length).toEqual(0);
      
      waitsFor(function() { return queryLog.length > logs; });
      runs(function() {
        expect(stashes.get('usage_log').length).toEqual(2);
        var req = queryLog[queryLog.length - 1];
        expect(req.method).toEqual('POST');
        expect(req.type).toEqual(LingoLinq.Log);
      });
    });
  });
});
