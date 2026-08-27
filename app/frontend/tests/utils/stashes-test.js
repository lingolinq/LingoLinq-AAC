import {
  describe,
  it,
  itAsync,
  expect,
  beforeEach,
  afterEach,
  waitsFor,
  runs,
  stub
} from 'frontend/tests/helpers/jasmine';
import { queryLog, asEmberArray, stashesTarget } from 'frontend/tests/helpers/ember_helper';
import { waitUntil } from 'frontend/tests/helpers/sync-test-cleanup';
import RSVP from 'rsvp';
import stashes from '../../utils/_stashes';
import capabilities from '../../utils/capabilities';
import EmberObject from '@ember/object';
import LingoLinq from 'frontend/app';
import { run as emberRun, later, cancel as runCancel } from '@ember/runloop';
import { set as emberSet, get as emberGet } from '@ember/object';

function primeAuthenticatedSession(opts) {
  opts = opts || {};
  var session = LingoLinq.session;
  if (LingoLinq.testOwner && LingoLinq.testOwner.lookup) {
    try {
      var liveSession = LingoLinq.testOwner.lookup('service:session');
      if (liveSession && !liveSession.isDestroyed) {
        session = liveSession;
        LingoLinq.session = liveSession;
      }
    } catch (e) { /* service mid-teardown */ }
  }
  if (session && typeof session.set === 'function' && !session.isDestroyed) {
    session.set('isAuthenticated', opts.isAuthenticated !== false);
    if (Object.prototype.hasOwnProperty.call(opts, 'user_name')) {
      session.set('user_name', opts.user_name);
    } else if (opts.isAuthenticated !== false) {
      session.set('user_name', 'bob');
    }
  } else {
    LingoLinq.session = EmberObject.create({
      isAuthenticated: opts.isAuthenticated !== false,
      user_name: opts.user_name
    });
  }
}

function clearStashesPushErrors() {
  [stashesTarget(), typeof window !== 'undefined' && window.stashes, stashes].forEach(function(candidate) {
    if (!candidate) {
      return;
    }
    candidate._logPushSerial = (candidate._logPushSerial || 0) + 1;
    candidate.errored_at = null;
    candidate.last_log_push = null;
    if (candidate.wait_timer) {
      try { runCancel(candidate.wait_timer); } catch (e) { /* torn down */ }
      candidate.wait_timer = null;
    }
    if (candidate.timer) {
      try { runCancel(candidate.timer); } catch (e) { /* torn down */ }
      candidate.timer = null;
    }
    if (candidate._dbPersistDebounce) {
      try { runCancel(candidate._dbPersistDebounce); } catch (e) { /* torn down */ }
      candidate._dbPersistDebounce = null;
    }
  });
}

function clearLogPushFixtures() {
  if (!queryLog.fixtures) {
    return;
  }
  queryLog.fixtures = queryLog.fixtures.filter(function(fixture) {
    return !(fixture.method === 'POST' && fixture.type === 'log');
  });
}

function primeLogPushTestTarget() {
  clearLogPushFixtures();
  queryLog.real_lookup = false;
  LingoLinq.sync_testing = true;
  LingoLinq._pushLogAllowUnauthenticated = true;
  LingoLinq._stashesLogPushGen = (LingoLinq._stashesLogPushGen || 0) + 1;
  clearStashesPushErrors();
  stub(capabilities, 'storage_store', function() {
    return RSVP.resolve({});
  });
  var target = stashesTarget();
  if (target.timer) {
    try { runCancel(target.timer); } catch (e) { /* torn down */ }
    target.timer = null;
  }
  target.set('online', true);
  target.set('logging_enabled', true);
  target.set('history_enabled', true);
  target.set('logging_paused_at', null);
  if (stashes && stashes !== target) {
    stashes.errored_at = null;
    stashes.last_log_push = null;
  }
  if (LingoLinq.store && LingoLinq.store.unloadAll) {
    try { LingoLinq.store.unloadAll('log'); } catch (e) { /* mid-teardown */ }
  }
  primeAuthenticatedSession();
  return syncStashesPushState(target);
}

function flushPushLogTestState(target) {
  if (typeof LingoLinq !== 'undefined') {
    LingoLinq._pushLogAllowUnauthenticated = false;
  }
  clearStashesPushErrors();
  target = target || stashesTarget();
  if (!target) {
    return;
  }
  if (target.timer) {
    try { runCancel(target.timer); } catch (e) { /* torn down */ }
    target.timer = null;
  }
  if (LingoLinq.store && LingoLinq.store.unloadAll) {
    try { LingoLinq.store.unloadAll('log'); } catch (e) { /* mid-teardown */ }
  }
}

function logEventsLength(object) {
  if (!object || typeof object.get !== 'function') {
    return 0;
  }
  return (object.get('events') || []).length;
}

function defineLogPushFixture(response, eventCount) {
  queryLog.defineFixture({
    method: 'POST',
    type: 'log',
    response: response,
    compare: function(object) {
      if (eventCount === true) {
        return true;
      }
      return logEventsLength(object) === eventCount;
    }
  });
}

function logPostCount() {
  var count = 0;
  for (var idx = 0; idx < queryLog.length; idx++) {
    var event = queryLog[idx];
    if (event.method === 'POST' && event.simple_type === 'log') {
      count++;
    }
  }
  return count;
}

function stashesErroredAt(knownTarget) {
  var candidates = [];
  if (knownTarget) {
    candidates.push(knownTarget);
  }
  var live = stashesTarget();
  if (live) {
    candidates.push(live);
  }
  if (typeof window !== 'undefined' && window.stashes) {
    candidates.push(window.stashes);
  }
  if (stashes) {
    candidates.push(stashes);
  }
  for (var idx = 0; idx < candidates.length; idx++) {
    var candidate = candidates[idx];
    if (candidate && candidate.errored_at !== null && typeof candidate.errored_at !== 'undefined') {
      return candidate.errored_at;
    }
  }
  return null;
}

function pushLogTarget(fallback) {
  if (typeof window !== 'undefined' && window.stashes && !window.stashes.isDestroyed) {
    return window.stashes;
  }
  return fallback || stashesTarget();
}

function targetErroredAt(target) {
  target = pushLogTarget(target);
  if (!target || target.errored_at === null || typeof target.errored_at === 'undefined') {
    return null;
  }
  return target.errored_at;
}

function drainPendingLogSaves() {
  return waitUntil(function() {
    if (!LingoLinq.store || !LingoLinq.store.peekAll) {
      return true;
    }
    var pending = false;
    LingoLinq.store.peekAll('log').forEach(function(record) {
      if (record && typeof record.get === 'function' && record.get('isSaving')) {
        pending = true;
      }
    });
    return !pending;
  });
}

function syncStashesPushState(target) {
  target = target || stashesTarget();
  if (!target) {
    return target;
  }
  if (typeof window !== 'undefined') {
    window.stashes = target;
  }
  if (stashes && stashes !== target && typeof stashes.push_log === 'function') {
    stashes.push_log = function(only_if_convenient) {
      return target.push_log(only_if_convenient);
    };
  }
  if (stashes && stashes !== target) {
    stashes.errored_at = target.errored_at;
    stashes.last_log_push = target.last_log_push;
  }
  return target;
}

function expectLogEvent(last_event, expected) {
  expect(last_event).not.toEqual(null);
  expect(last_event.id).toBeDefined();
  expect(last_event.timestamp).toBeDefined();
  Object.keys(expected).forEach(function(key) {
    expect(last_event[key]).toEqual(expected[key]);
  });
}

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
    beforeEach(function() {
      stashes.set('remembered_vocalizations', asEmberArray([]));
    });
    it("should do nothing when history is disabled", function() {
      stashes.set('history_enabled', false);
      var count = stashes.get('remembered_vocalizations').length;
      stashes.persist('working_vocalization', [{label: "ok"}, {label: "go"}]);
      stashes.remember();
      expect(stashes.get('remembered_vocalizations').length).toEqual(count);
    });

    it("should append to remembered vocalizations", function() {
      stashes.set('history_enabled', true);
      stashes.persist('remembered_vocalizations', asEmberArray([]));
      stashes.persist('working_vocalization', [{label: "ok"}, {label: "go"}]);
      stashes.remember();
      expect(stashes.get('remembered_vocalizations').length).toEqual(1);
    });
    it("should generate a sentence based on vocalizations", function() {
      stashes.set('history_enabled', true);
      stashes.persist('remembered_vocalizations', asEmberArray([]));
      var count = stashes.get('remembered_vocalizations').length;
      stashes.persist('working_vocalization',  [{label: "ok"}, {label: "go"}]);
      stashes.remember();
      expect(stashes.get('remembered_vocalizations')[0].sentence).toEqual("ok go");
    });
    it("should not append the same phrase to remembered vocalizations twice", function() {
      stashes.set('history_enabled', true);
      stashes.persist('remembered_vocalizations', []);
      stashes.remember({override: [{label: 'hi'}, {label: 'there'}]});
      stashes.remember({override: [{label: 'hi'}, {label: 'there'}]});
      expect(stashes.get('remembered_vocalizations').length).toEqual(1);
    });

    /* A held thought and a saved phrase can legitimately read the same, and they are not
       the same thing — the dedupe matches on (sentence, stash), not sentence alone. It used
       to match on sentence alone, which meant hitting Hold Thought on a message whose
       wording matched an existing saved phrase silently parked nothing at all. */
    it("should keep a stashed and a non-stashed entry with the same sentence", function() {
      stashes.set('history_enabled', true);
      stashes.persist('remembered_vocalizations', []);
      stashes.remember({override: [{label: 'hi'}]});
      stashes.remember({override: [{label: 'hi'}], stash: true});
      var list = stashes.get('remembered_vocalizations');
      expect(list.length).toEqual(2);
      expect(list.filter(function(v) { return v.stash; }).length).toEqual(1);
    });

    it("should record whether an entry was parked by the user or swapped in", function() {
      stashes.set('history_enabled', true);
      stashes.persist('remembered_vocalizations', []);
      stashes.remember({override: [{label: 'held'}], stash: true});
      stashes.remember({override: [{label: 'bumped'}], stash: true, swapped: true});
      var list = stashes.get('remembered_vocalizations');
      expect(list.find(function(v) { return v.sentence == 'held'; }).swapped).toEqual(false);
      expect(list.find(function(v) { return v.sentence == 'bumped'; }).swapped).toEqual(true);
    });
    it("should not append empty vocalizations", function() {
      stashes.set('history_enabled', true);
      stashes.persist('remembered_vocalizations', asEmberArray([]));
      var count = stashes.get('remembered_vocalizations').length;
      stashes.persist('working_vocalization', []);
      stashes.remember();
      expect(stashes.get('remembered_vocalizations').length).toEqual(0);
    });
  });

  describe("geo", function() {
    it("should properly start polling when enabled", function() {
      var target = stashesTarget();
      var callback = null;
      var geoApi = {
        clearWatch: function() {
        },
        getCurrentPosition: function(cb) {
        },
        watchPosition: function(cb) {
          callback = cb;
          return '12345';
        }
      };
      target.set('geo.latest', null);
      Object.defineProperty(navigator, 'geolocation', {
        configurable: true,
        value: geoApi
      });
      target.geolocation = geoApi;
      target.geo.poll();
      waitsFor(function() { return callback; });
      runs(function() {
        expect(target.geo.watching).toEqual('12345');
        callback({coords: {latitude: 1, longitude: 2}});
      });
      waitsFor(function() { return target.get('geo.latest'); });
      runs(function() {
        expect(target.get('geo.latest.coords')).toEqual({latitude: 1, longitude: 2});
      });
    });
  });

  describe("log", function() {
    beforeEach(function() {
      primeLogPushTestTarget();
    });

    afterEach(function(done) {
      flushPushLogTestState();
      drainPendingLogSaves().then(function() {
        setTimeout(done, 0);
      }, function() {
        setTimeout(done, 0);
      });
    });

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
      emberSet(stashes.geo, 'latest', {
        coords: {
          latitude: 1,
          longitude: 2,
          altitude: 123
        }
      });
      var event = stashes.log({
        'action': "backspace"
      });
      expect(event.type).toEqual('action');
      expect(event.geo).toEqual([1,2, 123]);
    });

    itAsync("should try to push logs to the server periodically", async function() {
      var target = stashesTarget();
      target.last_log_push = null;
      target.errored_at = null;
      target.set('online', true);
      target.set('logging_enabled', true);
      target.set('speaking_user_id', 999);
      target.persist('usage_log', [{
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
      primeAuthenticatedSession({ isAuthenticated: true, user_name: null });
      var logs = queryLog.length;
      expect(target.get('usage_log').length).toEqual(1);

      target.log({action: 'jump'});
      target.last_log_push = null;
      target.push_log(false);
      expect(target.get('usage_log').length).toEqual(0);

      await waitUntil(function() {
        return logPostCount() > logs && target.get('usage_log').length === 0;
      });
      expect(target.get('usage_log').length).toEqual(0);
      var req = queryLog[queryLog.length - 1];
      expect(req.method).toEqual('POST');
      expect(req.simple_type).toEqual('log');
      await drainPendingLogSaves();
    });
    it("should not try to push to the server if there is no authenticated user", function() {
      LingoLinq.sync_testing = false;
      LingoLinq._pushLogAllowUnauthenticated = false;
      var target = stashesTarget();
      target.set('daily_use', []);
      target.set('daily_events', {});
      target.set('logging_enabled', true);
      target.set('speaking_user_id', '12');
      target.persist('usage_log', [{
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
      primeAuthenticatedSession({ isAuthenticated: false, user_name: null });
      target.log({action: 'jump'});
      expect(target.get('usage_log').length).toEqual(2);
    });
    it("should not lose logs when trying and failing to push to the server", function() {
      var target = stashesTarget();
      target.last_log_push = null;
      target.errored_at = null;
      target.set('online', true);
      target.set('logging_enabled', true);
      target.set('speaking_user_id', 999);
      target.persist('usage_log', [{
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
      primeAuthenticatedSession();
      var logs = queryLog.length;
      expect(target.get('usage_log').length).toEqual(1);
      target.log({action: 'jump'});
      expect(target.get('usage_log').length).toEqual(0);

      waitsFor(function() {
        return queryLog.length > logs && target.get('usage_log').length === 2;
      });
      runs(function() {
        expect(target.get('usage_log').length).toEqual(2);
        var req = queryLog[queryLog.length - 1];
        expect(req.method).toEqual('POST');
        expect(req.simple_type).toEqual('log');
        target.errored_at = null;
        target.last_log_push = null;
      });
    });
  });

  describe("push_log", function() {
    beforeEach(function() {
      primeLogPushTestTarget();
    });

    afterEach(function(done) {
      flushPushLogTestState();
      drainPendingLogSaves().then(function() {
        setTimeout(done, 0);
      }, function() {
        setTimeout(done, 0);
      });
    });

    it("should clear the log when pushing results", function() {
      var target = stashesTarget();
      target.last_log_push = null;
      target.errored_at = null;
      target.set('online', true);
      target.set('logging_enabled', true);
      target.set('speaking_user_id', 999);
      target.persist('usage_log', [{
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
      primeAuthenticatedSession();
      var logs = queryLog.length;
      expect(target.get('usage_log').length).toEqual(1);
      target.log({action: 'jump'});
      target.last_log_push = null;
      target.push_log(false);
      expect(target.get('usage_log').length).toEqual(0);

      waitsFor(function() { return logPostCount() > logs && target.get('usage_log').length === 0; });
      runs(function() {
        expect(target.get('usage_log').length).toEqual(0);
        var req = queryLog[queryLog.length - 1];
        expect(req.method).toEqual('POST');
        expect(req.simple_type).toEqual('log');
      });
    });

    it("should re-add the pending data when a log push fails", function() {
      var target = stashesTarget();
      target.last_log_push = null;
      target.errored_at = null;
      target.set('online', true);
      target.set('logging_enabled', true);
      target.set('speaking_user_id', 999);
      target.persist('usage_log', [{
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
      primeAuthenticatedSession();
      var logs = queryLog.length;
      expect(target.get('usage_log').length).toEqual(1);
      target.log({action: 'jump'});
      target.last_log_push = null;
      target.push_log(false);
      expect(target.get('usage_log').length).toEqual(0);

      waitsFor(function() { return logPostCount() > logs && target.get('usage_log').length === 2; });
      runs(function() {
        expect(target.get('usage_log').length).toEqual(2);
        var req = queryLog[queryLog.length - 1];
        expect(req.method).toEqual('POST');
        expect(req.simple_type).toEqual('log');
        target.errored_at = null;
        target.last_log_push = null;
      });
    });

    itAsync("should push the log events in batches if there are a lot of events", async function() {
      queryLog.real_lookup = false;
      var target = primeLogPushTestTarget();
      target.set('speaking_user_id', 999);
      var list = [];
      for(var idx = 0; idx < 500; idx++) {
        list.push({
          timestamp: idx,
          type: 'action',
          action: {}
        });
      }
      target.persist('usage_log', list);
      expect(target.get('usage_log').length).toEqual(500);
      list.push({
        timestamp: 501,
        type: 'action',
        action: { action: 'jump' }
      });
      target.persist('usage_log', list);
      expect(target.get('usage_log').length).toEqual(501);
      defineLogPushFixture(RSVP.resolve({log: {id: 123}}), 250);
      defineLogPushFixture(RSVP.resolve({log: {id: 124}}), 250);
      defineLogPushFixture(RSVP.resolve({log: {id: 125}}), 1);
      target.last_log_push = null;
      var posts = logPostCount();
      syncStashesPushState(target);
      target.push_log(false);

      await waitUntil(function() {
        return logPostCount() >= posts + 3 && target.get('usage_log').length === 0;
      });
      expect(logPostCount()).toEqual(posts + 3);
      expect(target.get('usage_log').length).toEqual(0);
      target.errored_at = null;
      target.last_log_push = null;
    });

    itAsync("should restore the original log list when a push fails, even with a large log list", async function() {
      queryLog.real_lookup = false;
      var target = stashesTarget();
      target.last_log_push = null;
      target.errored_at = null;
      target.set('online', true);
      target.set('logging_enabled', true);
      target.set('speaking_user_id', 999);
      var log = [];
      for(var idx = 0; idx < 500; idx++) {
        log.push({
          timestamp: idx,
          type: 'action',
          action: {}
        });
      }
      target.persist('usage_log', log);
      queryLog.defineFixture({
        method: 'POST',
        type: 'log',
        response: RSVP.reject(''),
        compare: function(object) {
          return object.get('events').length == 251;
        }
      });
      primeAuthenticatedSession();
      var logs = logPostCount();
      expect(target.get('usage_log').length).toEqual(500);
      target.log({action: 'jump'});
      expect(target.get('usage_log').length).toEqual(251);

      await waitUntil(function() {
        return logPostCount() > logs && target.get('usage_log').length === 501;
      });
      expect(target.get('usage_log').length).toEqual(501);
      var list = target.get('usage_log');
      for(var idx = 0; idx < 500; idx++) {
        expect(list[idx].timestamp).toEqual(idx);
      }
      var req = queryLog[queryLog.length - 1];
      expect(req.method).toEqual('POST');
      expect(req.simple_type).toEqual('log');
      syncStashesPushState(target);
      target.errored_at = null;
      target.last_log_push = null;
      if (target.wait_timer) {
        try { runCancel(target.wait_timer); } catch (e) { /* torn down */ }
        target.wait_timer = null;
      }
      await drainPendingLogSaves();
    });

    itAsync("should stop trying to push logs after failing a few times in a row", async function() {
      queryLog.real_lookup = false;
      var target = primeLogPushTestTarget();
      await drainPendingLogSaves();
      clearStashesPushErrors();
      target = syncStashesPushState(target);
      target.set('speaking_user_id', 999);
      var log = [];
      for(var idx = 0; idx < 51; idx++) {
        log.push({
          timestamp: idx,
          type: 'action',
          action: {}
        });
      }
      target.persist('usage_log', log);
      defineLogPushFixture(RSVP.reject(''), 51);
      defineLogPushFixture(RSVP.reject(''), 51);
      defineLogPushFixture(RSVP.reject(''), 51);
      defineLogPushFixture(RSVP.reject(''), 51);
      var errorBackoffAfter = (new Date()).getTime() / 1000;
      expect(target.get('usage_log').length).toEqual(51);
      expect(targetErroredAt(target)).toEqual(null);
      target = pushLogTarget(target);
      target.push_log(false);

      await waitUntil(function() {
        return targetErroredAt(pushLogTarget(target)) >= 1;
      });
      target = pushLogTarget(target);
      expect(targetErroredAt(target)).toBeGreaterThan(0);
      expect(targetErroredAt(target)).toBeLessThan(10);
      target = pushLogTarget(target);
      var firstErrored = targetErroredAt(target);
      target = syncStashesPushState(target);
      target.last_log_push = null;
      target.push_log(false);

      await waitUntil(function() {
        return targetErroredAt(target) >= firstErrored + 1;
      });
      target = pushLogTarget(target);
      expect(targetErroredAt(target)).toEqual(firstErrored + 1);
      target = syncStashesPushState(target);
      target.last_log_push = null;
      target.push_log(false);

      await waitUntil(function() {
        return targetErroredAt(target) >= firstErrored + 2;
      });
      target = pushLogTarget(target);
      expect(targetErroredAt(target)).toEqual(firstErrored + 2);
      target = syncStashesPushState(target);
      target.last_log_push = null;
      target.push_log(false);

      await waitUntil(function() {
        return targetErroredAt(target) > errorBackoffAfter;
      });
      target = syncStashesPushState(target);
      target.errored_at = null;
      target.last_log_push = null;
      if (target.wait_timer) {
        try { runCancel(target.wait_timer); } catch (e) { /* torn down */ }
        target.wait_timer = null;
      }
    });

    itAsync("should clear errored when successfully pushing a log", async function() {
      queryLog.real_lookup = false;
      var target = primeLogPushTestTarget();
      target.set('logging_enabled', true);
      target.set('speaking_user_id', 999);
      target.errored_at = target.current_timestamp();
      target.persist('usage_log', [{
        timestamp: target.current_timestamp(),
        type: 'action',
        action: {}
      }]);
      defineLogPushFixture(RSVP.resolve({log: {id: 125}}), 1);

      var posts = logPostCount();
      target.push_log();
      await waitUntil(function() {
        return logPostCount() === posts;
      });
      expect(logPostCount()).toEqual(posts);
      expect(stashesErroredAt() > 0).toEqual(true);
      target.errored_at = target.current_timestamp() - (3 * 60);
      target.last_log_push = null;
      target.push_log(false);

      await waitUntil(function() {
        return logPostCount() >= posts + 1 && stashesErroredAt() === null;
      });
      expect(stashesErroredAt()).toEqual(null);
      syncStashesPushState(target);
      target.errored_at = null;
      target.last_log_push = null;
    });

    it("should store logs in the db if they get too big and are failing to be pushed", function() {
      expect(1).toEqual(1);
//       expect('test').toEqual('todo');
    });
  });

  describe("log_event", function() {
    it("should correctly log events", function() {
      var target = stashesTarget();
      stashes.orientation = null;
      stashes.volume = null;
      stashes.ambient_light = null;
      stashes.screen_brightness = null;
      stub(target, 'geo', {});
      stashes.set('referenced_user_id', null);
      stub(window, 'outerWidth', 1234);
      stub(window, 'outerHeight', 2345);

      var log_pushed = false;
      stub(target, 'push_log', function() {
        log_pushed = true;
      });
      var last_event = null;
      stub(target, 'persist', function(key, val) {
        if(key == 'last_event') {
          last_event = val;
        }
      });

      target.log_event({}, 'asdf');
      expectLogEvent(last_event, {
        action: {},
        geo: null,
        browser: capabilities.browser,
        system: capabilities.system,
        type: 'action',
        user_id: 'asdf',
        window_width: 1234,
        window_height: 2345
      });

      target.log_event({buttons: []}, 'asdf');
      expectLogEvent(last_event, {
        geo: null,
        browser: capabilities.browser,
        system: capabilities.system,
        type: 'utterance',
        user_id: 'asdf',
        utterance: {buttons: []},
        window_width: 1234,
        window_height: 2345
      });

      target.log_event({button_id: 9}, 'asdf');
      expectLogEvent(last_event, {
        button: {button_id: 9},
        geo: null,
        browser: capabilities.browser,
        system: capabilities.system,
        type: 'button',
        user_id: 'asdf',
        window_width: 1234,
        window_height: 2345
      });

      target.log_event({tallies: []}, 'asdf');
      expectLogEvent(last_event, {
        assessment: {tallies: []},
        user_id: 'asdf',
        type: 'assessment',
        geo: null,
        browser: capabilities.browser,
        system: capabilities.system,
        window_width: 1234,
        window_height: 2345
      });

      target.log_event({note: 'haha'}, 'asdf');
      expectLogEvent(last_event, {
        geo: null,
        browser: capabilities.browser,
        system: capabilities.system,
        type: 'note',
        user_id: 'asdf',
        note: 'haha',
        window_width: 1234,
        window_height: 2345
      });
    });

    it("should not include geo data if not enabled, even if available", function() {
      stashes.set('logging_enabled', true);
      stashes.set('geo_logging_enabled', false);
      stashes.set('speaking_user_id', '12');
      emberSet(stashes.geo, 'latest', {
        coords: {
          latitude: 1,
          longitude: 2,
          altitude: 123
        }
      });
      var event = stashes.log({
        'action': "backspace"
      });
      expect(event.type).toEqual('action');
      expect(event.geo).toEqual(null);
    });

    it("should include sensor data if defined", function() {
      var target = stashesTarget();
      var log_pushed = false;
      stub(target, 'push_log', function() {
        log_pushed = true;
      });
      var last_event = null;
      stub(target, 'persist', function(key, val) {
        if(key == 'last_event') {
          last_event = val;
        }
      });

      target.orientation = {};
      target.volume = 90;
      stub(target, 'geo', {});
      target.ambient_light = 1200;
      target.screen_brightness = 88;
      stashes.set('referenced_user_id', '1234');
      stub(window, 'outerWidth', 1234);
      stub(window, 'outerHeight', 2345);

      target.log_event({}, 'asdf');
      expectLogEvent(last_event, {
        action: {},
        geo: null,
        browser: capabilities.browser,
        system: capabilities.system,
        type: 'action',
        user_id: 'asdf',
        orientation: {},
        volume: 90,
        ambient_light: 1200,
        screen_brightness: 88,
        window_width: 1234,
        window_height: 2345
      });
    });

    it("should mark as modeling if true", function() {
      var target = stashesTarget();
      var log_pushed = false;
      stub(target, 'push_log', function() {
        log_pushed = true;
      });
      var last_event = null;
      stub(target, 'persist', function(key, val) {
        if(key == 'last_event') {
          last_event = val;
        }
      });
      stub(window, 'outerWidth', 1234);
      stub(window, 'outerHeight', 2345);

      target.log_event({}, 'asdf');
      expectLogEvent(last_event, {
        action: {},
        geo: null,
        browser: capabilities.browser,
        system: capabilities.system,
        type: 'action',
        user_id: 'asdf',
        window_width: 1234,
        window_height: 2345
      });

      target.set('modeling', true);
      target.log_event({}, 'asdf');
      expectLogEvent(last_event, {
        action: {},
        geo: null,
        browser: capabilities.browser,
        system: capabilities.system,
        type: 'action',
        user_id: 'asdf',
        window_width: 1234,
        window_height: 2345,
        modeling: true
      });

      target.set('modeling', false);
      target.log_event({}, 'asdf');
      expectLogEvent(last_event, {
        action: {},
        geo: null,
        browser: capabilities.browser,
        system: capabilities.system,
        type: 'action',
        user_id: 'asdf',
        window_width: 1234,
        window_height: 2345
      });

      target.last_selection = {modeling: true, ts: ((new Date()).getTime() - 1000)};
      target.log_event({}, 'asdf');
      expectLogEvent(last_event, {
        action: {},
        geo: null,
        browser: capabilities.browser,
        system: capabilities.system,
        type: 'action',
        user_id: 'asdf',
        window_width: 1234,
        window_height: 2345
      });

      target.last_selection = {modeling: true, ts: ((new Date()).getTime() - 300)};
      target.log_event({}, 'asdf');
      expectLogEvent(last_event, {
        action: {},
        geo: null,
        browser: capabilities.browser,
        system: capabilities.system,
        type: 'action',
        user_id: 'asdf',
        window_width: 1234,
        window_height: 2345,
        modeling: true
      });
    });
  });
});
