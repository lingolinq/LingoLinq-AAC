import * as emberDebug from '@ember/debug';
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
import { db_wait, fakeAudio } from 'frontend/tests/helpers/ember_helper';
import RSVP from 'rsvp';
import app_state from '../../utils/app_state';
import session from '../../utils/session';
import modal from '../../utils/modal';
import stashes from '../../utils/_stashes';
import persistence from '../../utils/persistence';
import EmberObject from '@ember/object';
import LingoLinq from '../../app';
import { run as emberRun, later } from '@ember/runloop';
import { sessionTarget, stashesTarget, persistenceTarget } from '../helpers/service-stub';

function tokenCheckPrefix(access_token, as_user_id) {
  var prefix = '/api/v1/token_check?access_token=' + access_token;
  if (as_user_id) {
    prefix += '&as_user_id=' + as_user_id;
  }
  return prefix;
}

function urlStartsWithTokenCheck(url, access_token, as_user_id) {
  if (!url) {
    return false;
  }
  var base = '/api/v1/token_check?access_token=' + access_token;
  if (url.indexOf(base) !== 0) {
    return false;
  }
  if (!as_user_id) {
    return true;
  }
  return url.indexOf('&as_user_id=' + as_user_id) > 0;
}

describe('session', function() {
  beforeEach(function() {
    stub(sessionTarget(), 'alert', function(message) {
    });
  });
  describe("setup", function() {
    it("should expose session on LingoLinq via the DI service", function() {
      var svc = LingoLinq.session;
      expect(svc).toBeTruthy();
      expect(typeof svc.persist).toEqual('function');
      expect(typeof svc.clear).toEqual('function');
    });
  });

  describe("persist", function() {
    it("should persist to stashes", function() {
      var val = null;
      stub(stashesTarget(), 'persist_object', function(key, data, extra) {
        if(key == 'auth_settings' && extra) {
          val = data;
        }
        return RSVP.resolve();
      });
      session.persist({a: 1, b: 2});
      expect(val).toEqual({a: 1, b:2});
      session.persist({asdf: "asdf"});
      expect(val).toEqual({asdf: "asdf"});
    });
  });

  describe("clear", function() {
    it("should flush the stash with a prefix", function() {
      var prefix = null;
      stub(stashesTarget(), 'flush', function(p) {
        prefix = p;
      });
      session.clear();
      expect(prefix).toEqual('auth_');
    });
  });

  describe("authenticate", function() {
    it("should resolve on proper request", function() {
      var post_data = null;
      stub(sessionTarget(), 'hashed_password', function(password) {
        return RSVP.resolve(password);
      });
      stub(persistenceTarget(), 'ajax', function(url, args) {
        expect(url).toEqual('/token');
        post_data = args.data;
        return RSVP.resolve({
          access_token: '12345',
          user_name: 'judy'
        });
      });
      var persisted = null;
      stub(sessionTarget(), 'persist', function(data) {
        persisted = data;
      });
      var resolved = false;
      session.authenticate({
        client_secret: 'aaaaa',
        identification: 'judy',
        password: 'nunya',
        device_id: 'rrrr',
        long_token: 'long'
      }).then(function() { resolved = true; });
      waitsFor(function() { return resolved && post_data; });
      runs(function() {
        expect(post_data.grant_type).toEqual('password');
        expect(post_data.client_id).toEqual('browser');
        expect(post_data.client_secret).toEqual('aaaaa');
        expect(post_data.username).toEqual('judy');
        expect(post_data.password).toEqual('nunya');
        expect(post_data.device_id).toNotEqual(null);
        expect(post_data.long_token).toEqual('long');
        expect(post_data.mobile).toEqual('false');
        expect(persisted).toNotEqual(null);
        expect(persisted.access_token).toEqual('12345');
        expect(persisted.user_name).toEqual('judy');
      });
    });

    it("should reject on error", function() {
      var post_data = null;
      stub(sessionTarget(), 'hashed_password', function(password) {
        return RSVP.resolve(password);
      });
      stub(persistenceTarget(), 'ajax', function(url, args) {
        expect(url).toEqual('/token');
        post_data = args.data;
        return RSVP.reject({
          fakeXHR: {
            responseJSON: {
              error: "loserville"
            }
          }
        });
      });
      var persisted = null;
      stub(sessionTarget(), 'persist', function(data) {
        persisted = data;
      });
      var errored = false;
      session.authenticate({
        client_secret: 'aaaaa',
        identification: 'judy',
        password: 'nunya',
        device_id: 'rrrr',
        long_token: 'long'
      }).then(null, function() { errored = true; });
      waitsFor(function() { return errored && post_data; });
      runs(function() {
        expect(post_data.grant_type).toEqual('password');
        expect(post_data.client_id).toEqual('browser');
        expect(post_data.client_secret).toEqual('aaaaa');
        expect(post_data.username).toEqual('judy');
        expect(post_data.password).toEqual('nunya');
        expect(post_data.device_id).toNotEqual(null);
        expect(post_data.long_token).toEqual('long');
        expect(post_data.mobile).toEqual('false');
        expect(persisted).toEqual(null);
      });
    });
  });

  describe("restore", function() {
    beforeEach(function() {
      stashesTarget().setup();
      persistenceTarget().tokens = {};
    });
    it("should do nothing if stashes are disabled", function() {
      var called = false;
      stub(stashesTarget(), 'get_object', function() {
        called = true;
      });
      stashesTarget().set('enabled', false);
      var res = session.restore();
      expect(res).toEqual({});
      expect(called).toEqual(false);
    });

    it("should retrieve and return stashed data", function() {
      stub(stashesTarget(), 'get_object', function(key, extra) {
        if(extra && key == 'auth_settings') {
          return {
            a: 1
          };
        }
      });
      var res = session.restore();
      expect(res).toEqual({a: 1});
    });

    it("should invalidate the session if no access token found", function() {
      var called = false;
      stub(sessionTarget(), 'invalidate', function() {
        called = true;
      });
      stub(stashesTarget(), 'get_object', function(key, extra) {
        if(extra && key == 'auth_settings') {
          return {};
        }
      });
      var res = session.restore();
      expect(res).toEqual({});
      waitsFor(function() { return called; });
      runs(function() {
        expect(called).toEqual(true);
      });
    });

    it("should set session attributes", function() {
      stub(stashesTarget(), 'get_object', function(key, extra) {
        if(extra && key == 'auth_settings') {
          return {
            user_name: 'cheddar',
            access_token: '12345'
          };
        }
      });
      var res = session.restore();
      expect(res).toEqual({user_name: 'cheddar', access_token: '12345'});
      expect(session.get('isAuthenticated')).toEqual(true);
      expect(session.get('access_token')).toEqual('12345');
      expect(session.get('as_user_id')).toEqual(undefined);
    });

    it("should confirm token validity if specified", function() {
      stub(emberDebug, 'isTesting', function() { return false; });
      stub(stashesTarget(), 'get_object', function(key, extra) {
        if(extra && key == 'auth_settings') {
          return {
            user_name: 'cheddar',
            access_token: '12345'
          };
        }
      });
      var queried = false;
      stub(persistenceTarget(), 'ajax', function(url, opts) {
        if(urlStartsWithTokenCheck(url, '12345')) {
          queried = true;
        }
        return RSVP.resolve({authenticated: true});
      });
      var res = session.restore(true);

      expect(res).toEqual({user_name: 'cheddar', access_token: '12345'});
      expect(session.get('isAuthenticated')).toEqual(true);
      expect(session.get('access_token')).toEqual('12345');
      expect(session.get('as_user_id')).toEqual(undefined);
      waitsFor(function() { return queried; });
      runs();
    });

    it("should confirm token invalidity if specified", function() {
      stub(emberDebug, 'isTesting', function() { return false; });
      stub(stashesTarget(), 'get_object', function(key, extra) {
        if(extra && key == 'auth_settings') {
          return {
            user_name: 'cheddar',
            access_token: '12345'
          };
        }
      });
      var queried = false;
      stub(persistenceTarget(), 'ajax', function(url, opts) {
        if(urlStartsWithTokenCheck(url, '12345')) {
          queried = true;
        }
        return RSVP.reject({});
      });
      var res = session.restore(true);

      expect(res).toEqual({user_name: 'cheddar', access_token: '12345'});
      expect(session.get('isAuthenticated')).toEqual(true);
      expect(session.get('access_token')).toEqual('12345');
      expect(session.get('as_user_id')).toEqual(undefined);
      waitsFor(function() { return queried; });
      runs();
    });

    it("should not confirm token validity if online and already checked", function() {
      stub(emberDebug, 'isTesting', function() { return false; });
      stub(stashesTarget(), 'get_object', function(key, extra) {
        if(extra && key == 'auth_settings') {
          return {
            user_name: 'cheddar',
            access_token: '12345'
          };
        }
      });
      var queried = false;
      stub(persistenceTarget(), 'ajax', function(url, opts) {
        queried = true;
      });
      persistenceTarget().tokens['12345'] = true;
      var res = session.restore();

      expect(res).toEqual({user_name: 'cheddar', access_token: '12345'});
      expect(session.get('isAuthenticated')).toEqual(true);
      expect(session.get('access_token')).toEqual('12345');
      expect(session.get('as_user_id')).toEqual(undefined);
      expect(queried).toEqual(false);
    });

    it("should log the user out if their token is expired (and they are online)", function() {
      modal.route = null;
      stub(emberDebug, 'isTesting', function() { return false; });
      stub(stashesTarget(), 'get_object', function(key, extra) {
        if(extra && key == 'auth_settings') {
          return {
            user_name: 'cheddar',
            access_token: '12345'
          };
        }
      });
      var queried = false;
      stub(persistenceTarget(), 'ajax', function(url, opts) {
        if(urlStartsWithTokenCheck(url, '12345')) {
          queried = true;
        }
        return RSVP.resolve({authenticated: false});
      });
      var invalidated = false;
      stub(sessionTarget(), 'invalidate', function(force) {
        if(force) { invalidated = true; }
      });
      var res = session.restore(true);

      expect(res).toEqual({user_name: 'cheddar', access_token: '12345'});
      expect(session.get('isAuthenticated')).toEqual(true);
      expect(session.get('access_token')).toEqual('12345');
      expect(session.get('as_user_id')).toEqual(undefined);
      waitsFor(function() { return queried && invalidated; });
      runs();
    });

    it("should not log the user out if there is an unexpected issue confirming the token", function() {
      stub(emberDebug, 'isTesting', function() { return false; });
      stub(stashesTarget(), 'get_object', function(key, extra) {
        if(extra && key == 'auth_settings') {
          return {
            user_name: 'cheddar',
            access_token: '12345'
          };
        }
      });
      var queried = false;
      stub(persistenceTarget(), 'ajax', function(url, opts) {
        if(urlStartsWithTokenCheck(url, '12345')) {
          later(function() {
            queried = true;
          }, 50);
        }
        return RSVP.reject({authenticated: false});
      });
      var invalidated = false;
      stub(sessionTarget(), 'invalidate', function(force) {
        if(force) { invalidated = true; }
      });
      var res = session.restore(true);

      expect(res).toEqual({user_name: 'cheddar', access_token: '12345'});
      expect(session.get('isAuthenticated')).toEqual(true);
      expect(session.get('access_token')).toEqual('12345');
      expect(session.get('as_user_id')).toEqual(undefined);
      waitsFor(function() { return queried; });
      runs(function() {
        expect(invalidated).toEqual(false);
      });
    });

    it("should set browserToken on success response", function() {
      persistenceTarget().set('browserToken', null);
      stub(emberDebug, 'isTesting', function() { return false; });
      stub(stashesTarget(), 'get_object', function(key, extra) {
        if(extra && key == 'auth_settings') {
          return {
            user_name: 'cheddar',
            access_token: '12345'
          };
        }
      });
      var queried = false;
      stub(persistenceTarget(), 'ajax', function(url, opts) {
        if(urlStartsWithTokenCheck(url, '12345')) {
          queried = true;
        }
        return RSVP.resolve({authenticated: true, meta: {fakeXHR: { browserToken: '11111'}}});
      });
      var invalidated = false;
      stub(sessionTarget(), 'invalidate', function(force) {
        if(force) { invalidated = true; }
      });
      var res = session.restore(true);

      expect(res).toEqual({user_name: 'cheddar', access_token: '12345'});
      expect(session.get('isAuthenticated')).toEqual(true);
      expect(session.get('access_token')).toEqual('12345');
      expect(session.get('as_user_id')).toEqual(undefined);
      waitsFor(function() { return queried && persistenceTarget().get('browserToken'); });
      runs(function() {
        expect(invalidated).toEqual(false);
        expect(persistenceTarget().get('browserToken')).toEqual('11111');
      });
    });

    it("should set browserToken on error response", function() {
      stub(emberDebug, 'isTesting', function() { return false; });
      stub(stashesTarget(), 'get_object', function(key, extra) {
        if(extra && key == 'auth_settings') {
          return {
            user_name: 'cheddar',
            access_token: '12345'
          };
        }
      });
      var queried = false;
      stub(persistenceTarget(), 'ajax', function(url, opts) {
        if(urlStartsWithTokenCheck(url, '12345')) {
          queried = true;
        }
        return RSVP.reject({fakeXHR: { browserToken: '11111'}});
      });
      var invalidated = false;
      stub(sessionTarget(), 'invalidate', function(force) {
        if(force) { invalidated = true; }
      });
      var res = session.restore(true);

      expect(res).toEqual({user_name: 'cheddar', access_token: '12345'});
      expect(session.get('isAuthenticated')).toEqual(true);
      expect(session.get('access_token')).toEqual('12345');
      expect(session.get('as_user_id')).toEqual(undefined);
      waitsFor(function() { return queried && persistenceTarget().get('browserToken'); });
      runs(function() {
        expect(invalidated).toEqual(false);
        expect(persistenceTarget().get('browserToken')).toEqual('11111');
      });
    });
  });

  describe("override", function() {
    it("should override correctly", function() {
      var reloaded = false;
      stub(sessionTarget(), 'reload', function() {
        reloaded = true;
      });
      var flushed = false;
      stub(stashesTarget(), 'flush', function() {
        flushed = true;
        return RSVP.resolve();
      });
      var setup = false;
      stub(stashesTarget(), 'setup', function() {
        setup = true;
      });
      var data = null;
      stub(sessionTarget(), 'persist', function(d) {
        data = d;
        return RSVP.resolve();
      });
      stub(sessionTarget(), 'restore', function() {
        return {a: 1};
      });
      session.override({user_name: "broccoli", user_id: '1_1', access_token: "123456"});
      waitsFor(function() { return flushed && setup && data; });
      runs(function() {
        expect(reloaded).toEqual(true);
        expect(flushed).toEqual(true);
        expect(setup).toEqual(true);
        expect(data).toEqual({a: 1, user_name: "broccoli", user_id: '1_1', access_token: "123456"});
      });
    });
  });

  describe("invalidate", function() {
    it("should do a simple invalidate by default", function() {
      stub(stashesTarget(), 'get_object', function(key, extra) {
        if (extra && key === 'auth_settings') {
          return null;
        }
      });
      var flushed = false;
      stub(stashesTarget(), 'flush', function() {
        flushed = true;
        return RSVP.resolve();
      });
      var setup = false;
      stub(stashesTarget(), 'setup', function() {
        setup = true;
      });
      var reloaded = false;
      stub(sessionTarget(), 'reload', function() {
        reloaded = true;
      });
      session.set('isAuthenticated', true);
      session.set('access_token', 'asdf');
      session.set('as_user_id', '12345');
      app_state.set('sessionUser', null);
      expect(app_state.get('currentUser')).toEqual(null);
      session.invalidate();
      expect(flushed).toEqual(true);
      expect(reloaded).toEqual(false);
      waitsFor(function() { return setup && !session.get('isAuthenticated'); });
      runs(function() {
        expect(session.get('access_token')).toEqual(null);
        expect(session.get('as_user_id')).toEqual(null);
      });
    });

    it("should do a full invalidate if there is a user", function() {
      app_state.set('sessionUser', EmberObject.create({
        preferences: {
          require_speak_mode_pin: true,
          speak_mode_pin: '1234'
        }
      }));
      var flushed = false;
      stub(stashesTarget(), 'flush', function() {
        flushed = true;
        return RSVP.resolve();
      });
      var setup = false;
      stub(stashesTarget(), 'setup', function() {
        setup = true;
      });
      var reloaded = false;
      stub(sessionTarget(), 'reload', function() {
        reloaded = true;
      });
      session.set('isAuthenticated', true);
      session.set('access_token', 'asdf');
      session.set('as_user_id', '12345');
      session.invalidate();
      expect(flushed).toEqual(true);
      waitsFor(function() { return setup; });
      runs(function() {
        expect(session.get('isAuthenticated')).toEqual(false);
        expect(setup).toEqual(true);
        expect(reloaded).toEqual(true);
        expect(session.get('access_token')).toEqual(null);
        expect(session.get('as_user_id')).toEqual(null);
      });
    });
  });

  describe('check_token', function() {
    it('should return a promise', function() {
      var opts = {};
      stub(persistenceTarget(), 'ajax', function(url, o) {
        return RSVP.reject({});
      });
      var res = session.check_token();
      expect(res.then).toNotEqual(undefined);
    });

    it('should query remotely', function() {
      var called = false;
      var opts = {};
      stub(persistenceTarget(), 'ajax', function(url, o) {
        expect(urlStartsWithTokenCheck(url, 'none')).toEqual(true);
        called = true;
        opts = o;
        return RSVP.reject({});
      });
      session.check_token();
      waitsFor(function() { return called; });
      runs();
    });

    it('should include as_user_id if specified', function() {
      stub(stashesTarget(), 'get_object', function(key, bool) {
        if(key == 'auth_settings') {
          return {access_token: 'happy_token', as_user_id: 'whatever'};
        }
      });
      var called = false;
      var opts = {};
      stub(persistenceTarget(), 'ajax', function(url, o) {
        expect(urlStartsWithTokenCheck(url, 'happy_token', 'whatever')).toEqual(true);
        called = true;
        opts = o;
        return RSVP.reject({});
      });
      session.check_token();
      waitsFor(function() { return called; });
      runs();
    });

    it('should do nothing on error if offline', function() {
      var called = false;
      var opts = {};
      persistenceTarget().set('online', false);
      persistenceTarget().tokens['none'] = 'asdf';
      stub(persistenceTarget(), 'ajax', function(url, o) {
        called = true;
        return RSVP.reject({});
      });
      session.check_token();
      waitsFor(function() { return called; });
      runs(function() {
        expect(persistenceTarget().tokens['none']).toEqual(true);
      });
    });

    it('should set the browser token on error result providing token', function() {
      var called = false;
      var opts = {};
      persistenceTarget().set('online', true);
      stub(persistenceTarget(), 'ajax', function(url, o) {
        called = true;
        return RSVP.reject({fakeXHR: {browserToken: 'tokeny'}});
      });
      session.check_token();
      waitsFor(function() { return persistenceTarget().get('browserToken') == 'tokeny'; });
      runs();
    });

    it('should clear the key cache on any other error', function() {
      var called = false;
      var opts = {};
      stub(persistenceTarget(), 'ajax', function(url, o) {
        called = true;
        return RSVP.reject({});
      });
      session.check_token();
      waitsFor(function() { return persistenceTarget().tokens['none'] === false; });
      runs();
    });

    it('should set as invalid token if returned as such', function() {
      stub(stashesTarget(), 'get_object', function(key, bool) {
        if(key == 'auth_settings') {
          return {access_token: 'happy_token'};
        }
      });
      var called = false;
      var opts = {};
      stub(persistenceTarget(), 'ajax', function(url, o) {
        expect(urlStartsWithTokenCheck(url, 'happy_token')).toEqual(true);
        called = true;
        opts = o;
        return RSVP.resolve({authenticated: false});
      });
      session.check_token();
      waitsFor(function() { return session.get('invalid_token'); });
      runs();
    });

    it('should set browserToken if returned on success', function() {
      stub(stashesTarget(), 'get_object', function(key, bool) {
        if(key == 'auth_settings') {
          return {access_token: 'happy_token'};
        }
      });
      var called = false;
      var opts = {};
      stub(persistenceTarget(), 'ajax', function(url, o) {
        expect(urlStartsWithTokenCheck(url, 'happy_token')).toEqual(true);
        called = true;
        opts = o;
        return RSVP.resolve({authenticated: false, meta: {fakeXHR: {browserToken: 'jorb'}}});
      });
      session.check_token();
      waitsFor(function() { return session.get('invalid_token') && persistenceTarget().get('browserToken') == 'jorb'; });
      runs(function() {
        expect(persistenceTarget().get('browserToken')).toEqual('jorb');
      });
    });

    it('should invalidate the session if allowed', function() {
      modal.route = null;
      var invalidated = false;
      stub(sessionTarget(), 'invalidate', function() {
        invalidated = true;
      });
      stub(stashesTarget(), 'get_object', function(key, bool) {
        if(key == 'auth_settings') {
          return {access_token: 'happy_token'};
        }
      });
      var called = false;
      var opts = {};
      stub(persistenceTarget(), 'ajax', function(url, o) {
        expect(urlStartsWithTokenCheck(url, 'happy_token')).toEqual(true);
        called = true;
        opts = o;
        return RSVP.resolve({authenticated: false, meta: {fakeXHR: {browserToken: 'jorb'}}});
      });
      session.check_token(true);
      waitsFor(function() { return invalidated && session.get('invalid_token'); });
      runs(function() {
        expect(invalidated).toEqual(true);
      });
    });

    it('should not invalidate the session if not allowed', function() {
      var invalidated = false;
      stub(sessionTarget(), 'invalidate', function() {
        invalidated = true;
      });
      stub(stashesTarget(), 'get_object', function(key, bool) {
        if(key == 'auth_settings') {
          return {access_token: 'happy_token'};
        }
      });
      var called = false;
      var opts = {};
      stub(persistenceTarget(), 'ajax', function(url, o) {
        expect(urlStartsWithTokenCheck(url, 'happy_token')).toEqual(true);
        called = true;
        opts = o;
        return RSVP.resolve({authenticated: false, meta: {fakeXHR: {browserToken: 'jorb'}}});
      });
      session.check_token();
      waitsFor(function() { return session.get('invalid_token') && persistenceTarget().get('browserToken') == 'jorb'; });
      runs(function() {
        expect(invalidated).toEqual(false);
      });
    });
  });
});
