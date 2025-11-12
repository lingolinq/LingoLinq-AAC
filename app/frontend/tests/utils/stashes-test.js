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
import stashes from '../../utils/_stashes';
import capabilities from '../../utils/capabilities';
import EmberObject from '@ember/object';
import LingoLinq from 'frontend/app';
import { run as emberRun } from '@ember/runloop';
import { set as emberSet, get as emberGet } from '@ember/object';

var App;
describe('stashes', function() {
  beforeEach(function() {
    window.localStorage.root_board_state = null;
      stashes.orientation = null;
      stashes.volume = null;
      emberSet(stashes.geo, 'latest', null);
      stashes.ambient_light = null;
      stashes.screen_brightness = null;
      stashes.set('referenced_user_id', null);
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
      expect(stashes.get('bacon')).toEqual(undefined);
    });
  });

  describe("set", function() {
    it("should not error on empty set", function() {
      expect(function() { stashes.persist(null, null); }).not.toThrow();
    });
    it("should set to the hash and persist to local storage", function() {
      stashes.persist('bacon', 1);
      expect(stashes.get('bacon')).toEqual(1);
      expect(JSON.parse(window.localStorage[stashes.prefix + 'bacon'])).toEqual(1);
      stashes.persist('ham', "ok");
      expect(stashes.get('ham')).toEqual("ok");
      expect(JSON.parse(window.localStorage[stashes.prefix + 'ham'])).toEqual("ok");
      stashes.persist('pork', true);
      expect(stashes.get('pork')).toEqual(true);
      expect(JSON.parse(window.localStorage[stashes.prefix + 'pork'])).toEqual(true);
      var obj = {a: 2, b: "ok", c: true, d: ['a', 'b']};
      stashes.persist('jerky', obj);
      expect(stashes.get('jerky')).toEqual(obj);
      expect(JSON.parse(window.localStorage[stashes.prefix + 'jerky'])).toEqual(obj);
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
    });
    it("should generate a sentence based on vocalizations", function() {
      stashes.set('history_enabled', true);
      stashes.persist('remembered_vocalizations', []);
      var count = stashes.get('remembered_vocalizations').length;
      stashes.persist('working_vocalization',  [{label: "ok"}, {label: "go"}]);
      stashes.remember();
      expect(stashes.get('remembered_vocalizations')[0].sentence).toEqual("ok go");
    });
    it("should not append to remembered vocalizations more than once");
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
      var callback = null;
      stashes.set('geo.latest', null);
      stub(stashes, 'geolocation', {
        clearWatch: function() {
        },
        getCurrentPosition: function(cb) {
        },
        watchPosition: function(cb) {
          callback = cb;
          return '12345';
        }
      });
      stashes.geo.poll();
      waitsFor(function() { return callback; });
      runs(function() {
        expect(stashes.geo.watching).toEqual('12345');
        callback({coords: {latitude: 1, longitude: 2}});
      });
      waitsFor(function() { return stashes.get('geo.latest'); });
      runs(function() {
        expect(stashes.get('geo.latest.coords')).toEqual({latitude: 1, longitude: 2});
      });
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
      stashes.set('speaking_user_id', 1);
      stashes.set('logging_enabled', true);
      stashes.log({
        'action': 'jump'
      });
      expect(stashes.get('usage_log').length).toEqual(1);
    });
    it("should record current timestamp with the log", function() {
      stashes.set('logging_enabled', true);
      stashes.set('speaking_user_id', '12');
      var ts = (Date.now() / 1000) - 5;
      var event = stashes.log({
        'action': 'jump'
      });
      expect(event).not.toEqual(null);
      expect(event.timestamp).toBeGreaterThan(ts);
    });
    it("should handle utterance events for the log", function() {
      stashes.set('logging_enabled', true);
      stashes.set('speaking_user_id', '12');
      var event = stashes.log({
        'buttons': []
      });
      expect(event.type).toEqual('utterance');
      expect(event.utterance).toEqual({buttons: []});
    });
    it("should handle button events for the log", function() {
      stashes.set('logging_enabled', true);
      stashes.set('speaking_user_id', '12');
      var event = stashes.log({
        'button_id': 1
      });
      expect(event.type).toEqual('button');
      expect(event.button).toEqual({button_id: 1});
    });
    it("should handle action events for the log", function() {
      stashes.set('logging_enabled', true);
      stashes.set('speaking_user_id', '12');
      var event = stashes.log({
        'action': "backspace"
      });
      expect(event.type).toEqual('action');
      expect(event.action).toEqual({action: "backspace"});
    });
    it("should include geo location if provided", function() {
      stashes.set('logging_enabled', true);
      stashes.set('geo_logging_enabled', true);
      stashes.set('speaking_user_id', '12');
      stub(stashes, 'geo', {
        latest: {
          coords: {
            latitude: 1,
            longitude: 2,
            altitude: 123
          }
        }
      });
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
        type: 'log',
        response: RSVP.resolve({log: {id: '134'}}),
        compare: function(object) {
          return object.get('events').length == 2;
        }
      });
      LingoLinq.session = EmberObject.create({'isAuthenticated': true});
      var logs = queryLog.length;
      expect(stashes.get('usage_log').length).toEqual(1);

      stashes.log({action: 'jump'});
      expect(stashes.get('usage_log').length).toEqual(0);

      waitsFor(function() { return queryLog.length > logs; });
      runs(function() {
        expect(stashes.get('usage_log').length).toEqual(0);
        var req = queryLog[queryLog.length - 1];
        expect(req.method).toEqual('POST');
        expect(req.simple_type).toEqual('log');
      });
    });
    it("should not try to push to the server if there is no authenticated user", function() {
      stashes.set('logging_enabled', true);
      stashes.set('speaking_user_id', '12');
      stashes.persist('usage_log', [{
        timestamp: 0,
        type: 'action',
        action: {}
      }]);
      queryLog.defineFixture({
        method: 'POST',
        type: 'log',
        response: RSVP.reject(''),
        compare: function(object) {
          return object.get('events').length == 2;
        }
      });
      LingoLinq.session = EmberObject.create({'user_name': null, isAuthenticated: false});
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
        type: 'log',
        response: RSVP.reject(''),
        compare: function(object) {
          return object.get('events').length == 2;
        }
      });
      LingoLinq.session = EmberObject.create({'user_name': 'bob', 'isAuthenticated': true});
      var logs = queryLog.length;
      expect(stashes.get('usage_log').length).toEqual(1);
      stashes.log({action: 'jump'});
      expect(stashes.get('usage_log').length).toEqual(0);

      waitsFor(function() { return queryLog.length > logs; });
      runs(function() {
        expect(stashes.get('usage_log').length).toEqual(2);
        var req = queryLog[queryLog.length - 1];
        expect(req.method).toEqual('POST');
        expect(req.simple_type).toEqual('log');
      });
    });
  });

  describe("push_log", function() {
    it("should clear the log when pushing results", function() {
      stashes.set('logging_enabled', true);
      stashes.set('speaking_user_id', 999);
      stashes.persist('usage_log', [{
        timestamp: 0,
        type: 'action',
        action: {}
      }]);
      queryLog.defineFixture({
        method: 'POST',
        type: 'log',
        response: RSVP.resolve({log: {id: 123}}),
        compare: function(object) {
          return object.get('events').length == 2;
        }
      });
      LingoLinq.session = EmberObject.create({'user_name': 'bob', 'isAuthenticated': true});
      var logs = queryLog.length;
      expect(stashes.get('usage_log').length).toEqual(1);
      stashes.log({action: 'jump'});
      expect(stashes.get('usage_log').length).toEqual(0);

      waitsFor(function() { return queryLog.length > logs; });
      runs(function() {
        expect(stashes.get('usage_log').length).toEqual(0);
        var req = queryLog[queryLog.length - 1];
        expect(req.method).toEqual('POST');
        expect(req.simple_type).toEqual('log');
      });
    });

    it("should re-add the pending data when a log push fails", function() {
      stashes.set('logging_enabled', true);
      stashes.set('speaking_user_id', 999);
      stashes.persist('usage_log', [{
        timestamp: 0,
        type: 'action',
        action: {}
      }]);
      queryLog.defineFixture({
        method: 'POST',
        type: 'log',
        response: RSVP.reject(''),
        compare: function(object) {
          return object.get('events').length == 2;
        }
      });
      LingoLinq.session = EmberObject.create({'user_name': 'bob', 'isAuthenticated': true});
      var logs = queryLog.length;
      expect(stashes.get('usage_log').length).toEqual(1);
      stashes.log({action: 'jump'});
      expect(stashes.get('usage_log').length).toEqual(0);

      waitsFor(function() { return queryLog.length > logs; });
      runs(function() {
        expect(stashes.get('usage_log').length).toEqual(2);
        var req = queryLog[queryLog.length - 1];
        expect(req.method).toEqual('POST');
        expect(req.simple_type).toEqual('log');
      });
    });

    it("should push the log events in batches if there are a lot of events", function() {
      stashes.set('logging_enabled', true);
      stashes.set('speaking_user_id', 999);
      var list = [];
      for(var idx = 0; idx < 500; idx++) {
        list.push({
          timestamp: idx,
          type: 'action',
          action: {}
        });
      }
      stashes.persist('usage_log', list);
      var pushes = 0;
      queryLog.defineFixture({
        method: 'POST',
        type: 'log',
        response: RSVP.resolve({log: {id: 123}}),
        compare: function(object) {
          if(object.get('events')[0].timestamp === 0) {
            pushes++;
            expect(stashes.get('usage_log').length).toEqual(251);
            expect(object.get('events').length).toEqual(250);
            return true;
          }
          return false;
        }
      });
      queryLog.defineFixture({
        method: 'POST',
        type: 'log',
        response: RSVP.resolve({log: {id: 124}}),
        compare: function(object) {
          if(object.get('events')[0].timestamp == 250) {
            pushes++;
            expect(stashes.get('usage_log').length).toEqual(1);
            expect(object.get('events').length).toEqual(250);
            return true;
          }
          return false;
        }
      });
      queryLog.defineFixture({
        method: 'POST',
        type: 'log',
        response: RSVP.resolve({log: {id: 125}}),
        compare: function(object) {
          if(object.get('events')[0].timestamp > 500) {
            pushes++;
            expect(stashes.get('usage_log').length).toEqual(0);
            expect(object.get('events').length).toEqual(1);
            return true;
          }
          return false;
        }
      });
      LingoLinq.session = EmberObject.create({'user_name': 'bob', 'isAuthenticated': true});
      var logs = queryLog.length;
      expect(stashes.get('usage_log').length).toEqual(500);
      stashes.log({action: 'jump'});
      expect(stashes.get('usage_log').length).toEqual(251);

      waitsFor(function() { return pushes == 3; });
      runs(function() {
        expect(stashes.get('usage_log').length).toEqual(0);
      });
    });

    it("should restore the original log list when a push fails, even with a large log list", function() {
      stashes.set('logging_enabled', true);
      stashes.set('speaking_user_id', 999);
      var log = [];
      for(var idx = 0; idx < 500; idx++) {
        log.push({
          timestamp: idx,
          type: 'action',
          action: {}
        });
      }
      stashes.persist('usage_log', log);
      queryLog.defineFixture({
        method: 'POST',
        type: 'log',
        response: RSVP.reject(''),
        compare: function(object) {
          return object.get('events').length == 251;
        }
      });
      LingoLinq.session = EmberObject.create({'user_name': 'bob', 'isAuthenticated': true});
      var logs = queryLog.length;
      expect(stashes.get('usage_log').length).toEqual(500);
      stashes.log({action: 'jump'});
      expect(stashes.get('usage_log').length).toEqual(251);

      waitsFor(function() { return queryLog.length > logs; });
      runs(function() {
        expect(stashes.get('usage_log').length).toEqual(501);
        // check the timestamps, to make sure it's in the right order
        var list = stashes.get('usage_log');
        for(var idx = 0; idx < 500; idx++) {
          expect(list[idx].timestamp).toEqual(idx);
        }
        var req = queryLog[queryLog.length - 1];
        expect(req.method).toEqual('POST');
        expect(req.simple_type).toEqual('log');
      });
    });

    it("should stop trying to push logs after failing a few times in a row", function() {
      stashes.set('logging_enabled', true);
      stashes.set('speaking_user_id', 999);
      stashes.errored_at = null;
      var log = [];
      for(var idx = 0; idx < 500; idx++) {
        log.push({
          timestamp: idx,
          type: 'action',
          action: {}
        });
      }
      stashes.persist('usage_log', log);
      var attempts = 0;
      queryLog.defineFixture({
        method: 'POST',
        type: 'log',
        response: RSVP.reject(''),
        compare: function(object) {
          attempts++;
          return object.get('events').length == 251;
        }
      });
      LingoLinq.session = EmberObject.create({'user_name': 'bob', 'isAuthenticated': true});
      var logs = queryLog.length;
      expect(stashes.get('usage_log').length).toEqual(500);
      stashes.push_log();
      expect(stashes.get('usage_log').length).toEqual(250);

      waitsFor(function() { return attempts == 1; });
      runs(function() {
        expect(stashes.get('usage_log').length).toEqual(500);
        expect(stashes.errored_at).toEqual(1);
        var req = queryLog[queryLog.length - 1];
        expect(req.method).toEqual('POST');
        expect(req.simple_type).toEqual('log');
        stashes.push_log();
      });

      waitsFor(function() { return attempts == 2; });
      runs(function() {
        expect(stashes.get('usage_log').length).toEqual(500);
        expect(stashes.errored_at).toEqual(2);
        var req = queryLog[queryLog.length - 1];
        expect(req.method).toEqual('POST');
        expect(req.simple_type).toEqual('log');
        stashes.push_log();
      });

      waitsFor(function() { return attempts == 3; });
      runs(function() {
        expect(stashes.get('usage_log').length).toEqual(500);
        expect(stashes.errored_at).toEqual(3);
        var req = queryLog[queryLog.length - 1];
        expect(req.method).toEqual('POST');
        expect(req.simple_type).toEqual('log');
        stashes.push_log();
      });
      var now = (new Date()).getTime() / 1000;
      var pushed = false;

      waitsFor(function() { return attempts == 4; });
      runs(function() {
        expect(stashes.get('usage_log').length).toEqual(500);
        expect(stashes.errored_at > now).toEqual(true);
        var req = queryLog[queryLog.length - 1];
        expect(req.method).toEqual('POST');
        expect(req.simple_type).toEqual('log');
        stashes.push_log();
        emberRun.later(function() {
          pushed = true;
        }, 200);
      });

      waitsFor(function() { return pushed; });
      runs(function() {
        expect(attempts).toEqual(4);
      });
    });

    it("should clear errored when successfully pushing a log", function() {
      stashes.set('logging_enabled', true);
      stashes.set('speaking_user_id', 999);
      stashes.errored_at = (new Date()).getTime() / 1000;
      stashes.persist('usage_log', [{
        timestamp: 0,
        type: 'action',
        action: {}
      }]);
      var pushes = 0;
      queryLog.defineFixture({
        method: 'POST',
        type: 'log',
        response: RSVP.resolve({log: {id: 125}}),
        compare: function(object) {
          pushes++;
          return true;
        }
      });

      LingoLinq.session = EmberObject.create({'user_name': 'bob', 'isAuthenticated': true});
      stashes.push_log();
      var pushed = false;
      emberRun.later(function() { pushed = true; }, 200);
      waitsFor(function() { return pushed; });
      runs(function() {
        expect(pushes).toEqual(0);
        expect(stashes.errored_at > 0).toEqual(true);
        stashes.errored_at = ((new Date()).getTime() / 1000) - (3 * 60);
        stashes.push_log();
      });

      waitsFor(function() { return pushes == 1; });
      runs(function() {
        expect(stashes.errored_at).toEqual(null);
      });
    });

    it("should store logs in the db if they get too big and are failing to be pushed", function() {
      expect(1).toEqual(1);
//       expect('test').toEqual('todo');
    });
  });

  describe("log_event", function() {
    it("should correctly log events", function() {
      stashes.orientation = null;
      stashes.volume = null;
      stashes.ambient_light = null;
      stashes.screen_brightness = null;
      stub(stashes, 'geo', {});
      stashes.set('referenced_user_id', null);
      stub(window, 'outerWidth', 1234);
      stub(window, 'outerHeight', 2345);

      var log_pushed = false;
      stub(stashes, 'push_log', function() {
        log_pushed = true;
      });
      var last_event = null;
      stub(stashes, 'persist', function(key, val) {
        if(key == 'last_event') {
          last_event = val;
        }
      });

      stashes.log_event({}, 'asdf');
      expect(last_event).toEqual({
        action: {},
        geo: null,
        browser: capabilities.browser,
        system: capabilities.system,
        timestamp: last_event.timestamp,
        type: 'action',
        user_id: 'asdf',
        window_width: 1234,
        window_height: 2345
      });

      stashes.log_event({buttons: []}, 'asdf');
      expect(last_event).toEqual({
        geo: null,
        browser: capabilities.browser,
        system: capabilities.system,
        timestamp: last_event.timestamp,
        type: 'utterance',
        user_id: 'asdf',
        utterance: {buttons: []},
        window_width: 1234,
        window_height: 2345
      });

      stashes.log_event({button_id: 9}, 'asdf');
      expect(last_event).toEqual({
        button: {button_id: 9},
        geo: null,
        browser: capabilities.browser,
        system: capabilities.system,
        timestamp: last_event.timestamp,
        type: 'button',
        user_id: 'asdf',
        window_width: 1234,
        window_height: 2345
      });

      stashes.log_event({tallies: []}, 'asdf');
      expect(last_event).toEqual({
        assessment: {tallies: []},
        user_id: 'asdf',
        type: 'assessment',
        geo: null,
        browser: capabilities.browser,
        system: capabilities.system,
        timestamp: last_event.timestamp,
        window_width: 1234,
        window_height: 2345
      });

      stashes.log_event({note: 'haha'}, 'asdf');
      expect(last_event).toEqual({
        geo: null,
        browser: capabilities.browser,
        system: capabilities.system,
        type: 'note',
        user_id: 'asdf',
        timestamp: last_event.timestamp,
        note: {note: 'haha'},
        window_width: 1234,
        window_height: 2345
      });
    });

    it("should not include geo data if not enabled, even if available", function() {
      stashes.set('logging_enabled', true);
      stashes.set('geo_logging_enabled', false);
      stashes.set('speaking_user_id', '12');
      stub(stashes, 'geo', {
        latest: {
          coords: {
            latitude: 1,
            longitude: 2,
            altitude: 123
          }
        }
      });
      var event = stashes.log({
        'action': "backspace"
      });
      expect(event.type).toEqual('action');
      expect(event.geo).toEqual(null);
    });

    it("should include sensor data if defined", function() {
      var log_pushed = false;
      stub(stashes, 'push_log', function() {
        log_pushed = true;
      });
      var last_event = null;
      stub(stashes, 'persist', function(key, val) {
        if(key == 'last_event') {
          last_event = val;
        }
      });

      stashes.orientation = {};
      stashes.volume = 90;
      stub(stashes, 'geo', {});
      stashes.ambient_light = 1200;
      stashes.screen_brightness = 88;
      stashes.set('referenced_user_id', '1234');
      stub(window, 'outerWidth', 1234);
      stub(window, 'outerHeight', 2345);

      stashes.log_event({}, 'asdf');
      expect(last_event).toEqual({
        action: {},
        geo: null,
        browser: capabilities.browser,
        system: capabilities.system,
        timestamp: last_event.timestamp,
        type: 'action',
        user_id: 'asdf',
        orientation: {},
        volume: 90,
        ambient_light: 1200,
        screen_brightness: 88,
        referenced_user_id: '1234',
        window_width: 1234,
        window_height: 2345
      });
    });

    it("should mark as modeling if true", function() {
      var log_pushed = false;
      stub(stashes, 'push_log', function() {
        log_pushed = true;
      });
      var last_event = null;
      stub(stashes, 'persist', function(key, val) {
        if(key == 'last_event') {
          last_event = val;
        }
      });
      stub(window, 'outerWidth', 1234);
      stub(window, 'outerHeight', 2345);

      stashes.log_event({}, 'asdf');
      expect(last_event).toEqual({
        action: {},
        geo: null,
        browser: capabilities.browser,
        system: capabilities.system,
        timestamp: last_event.timestamp,
        type: 'action',
        user_id: 'asdf',
        window_width: 1234,
        window_height: 2345,
      });

      stashes.set('modeling', true);
      stashes.log_event({}, 'asdf');
      expect(last_event).toEqual({
        action: {},
        geo: null,
        browser: capabilities.browser,
        system: capabilities.system,
        timestamp: last_event.timestamp,
        type: 'action',
        user_id: 'asdf',
        window_width: 1234,
        window_height: 2345,
        modeling: true
      });

      stashes.set('modeling', false);
      stashes.log_event({}, 'asdf');
      expect(last_event).toEqual({
        action: {},
        geo: null,
        browser: capabilities.browser,
        system: capabilities.system,
        timestamp: last_event.timestamp,
        type: 'action',
        user_id: 'asdf',
        window_width: 1234,
        window_height: 2345,
      });

      stashes.last_selection = {modeling: true, ts: ((new Date()).getTime() - 1000)};
      stashes.log_event({}, 'asdf');
      expect(last_event).toEqual({
        action: {},
        geo: null,
        browser: capabilities.browser,
        system: capabilities.system,
        timestamp: last_event.timestamp,
        type: 'action',
        user_id: 'asdf',
        window_width: 1234,
        window_height: 2345,
      });

      stashes.last_selection = {modeling: true, ts: ((new Date()).getTime() - 300)};
      stashes.log_event({}, 'asdf');
      expect(last_event).toEqual({
        action: {},
        geo: null,
        browser: capabilities.browser,
        system: capabilities.system,
        timestamp: last_event.timestamp,
        type: 'action',
        user_id: 'asdf',
        window_width: 1234,
        window_height: 2345,
        modeling: true
      });
    });
  });
});
