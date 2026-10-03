import {
  describe,
  it,
  expect,
  beforeEach,
  waitsFor,
  runs,
  stub
} from 'frontend/tests/helpers/jasmine';
import $ from 'jquery';
import ai_word_predictor from '../../utils/ai_word_predictor';

function appStateStub(opts) {
  opts = opts || {};
  var flagOn = opts.flagOn !== false;
  var prefs = opts.prefs;
  if(prefs === undefined) { prefs = {}; }
  var user = {
    get: function(key) {
      if(key === 'preferences') { return prefs; }
      if(key === 'feature_flags') { return { ai_word_prediction: flagOn }; }
      return null;
    },
    preferences: prefs
  };
  return {
    get: function(key) {
      if(key === 'feature_flags.ai_word_prediction') { return flagOn; }
      if(key === 'currentUser' || key === 'sessionUser') { return user; }
      return null;
    }
  };
}

describe('ai_word_predictor', function() {
  beforeEach(function() {
    ai_word_predictor.clear_cache();
  });

  it('should not call the API when the feature flag is disabled', function() {
    var res = null;
    ai_word_predictor.predict('I want to', { appState: appStateStub({ flagOn: false }) }).then(function(words) {
      res = words;
    });
    waitsFor(function() { return res; });
    runs(function() {
      expect(res).toEqual([]);
    });
  });

  it('should not call the API when the flag is on but AI prefs disallow', function() {
    var res = null;
    ai_word_predictor.predict('I want to', {
      appState: appStateStub({
        flagOn: true,
        prefs: { ai_features_enabled: false }
      })
    }).then(function(words) {
      res = words;
    });
    waitsFor(function() { return res; });
    runs(function() {
      expect(res).toEqual([]);
    });
  });

  it('should not call the API when master is on but ai_word_prediction pref is off', function() {
    expect(ai_word_predictor.is_enabled(appStateStub({
      flagOn: true,
      prefs: { ai_features_enabled: true, ai_word_prediction: false }
    }))).toEqual(false);
  });

  it('should be disabled when flag is on but the account never recorded an AI choice', function() {
    expect(ai_word_predictor.is_enabled(appStateStub({
      flagOn: true,
      prefs: {}
    }))).toEqual(false);
  });

  it('should be enabled when flag is on, master true, and per-feature true', function() {
    expect(ai_word_predictor.is_enabled(appStateStub({
      flagOn: true,
      prefs: { ai_features_enabled: true, ai_word_prediction: true }
    }))).toEqual(true);
  });

  it('should resolve cached predictions without duplicate fetches', function() {
    var appState = appStateStub({ flagOn: true, prefs: { ai_features_enabled: true, ai_word_prediction: true } });
    ai_word_predictor._cache_put('i want to', ['play', 'go']);
    var res = null;
    ai_word_predictor.predict('I want to', { appState: appState, immediate: true }).then(function(words) {
      res = words;
    });
    waitsFor(function() { return res; });
    runs(function() {
      expect(res).toEqual(['play', 'go']);
    });
  });

  it('should cache predictions separately by locale', function() {
    var appState = appStateStub({ flagOn: true, prefs: { ai_features_enabled: true, ai_word_prediction: true } });
    ai_word_predictor._cache_put('i want to', ['play'], 'en');
    ai_word_predictor._cache_put('i want to', ['jugar'], 'es');
    var res = null;
    ai_word_predictor.predict('I want to', { appState: appState, locale: 'es', immediate: true }).then(function(words) {
      res = words;
    });
    waitsFor(function() { return res; });
    runs(function() {
      expect(res).toEqual(['jugar']);
    });
  });

  describe('backing off when the server declines', function() {
    // The shape the app's $.ajax wrapper (utils/extras.js) rejects with.
    function failingAjax(status) {
      return function() {
        return { then: function(ok, fail) { fail({ fakeXHR: { status: status }, message: 'error', result: 'error' }); } };
      };
    }

    it('pauses requests after a refusal (403), as after a rate limit', function() {
      ai_word_predictor._backoff_until = 0;
      stub($, 'ajax', failingAjax(403));
      var res = null;
      ai_word_predictor._fetch('i want to', 'en', 5).then(function(words) { res = words; });
      waitsFor(function() { return res; });
      runs(function() {
        expect(res).toEqual([]);
        expect(ai_word_predictor._backoff_until > Date.now()).toEqual(true);
        ai_word_predictor._backoff_until = 0;
      });
    });

    it('still pauses after a rate limit (429)', function() {
      ai_word_predictor._backoff_until = 0;
      stub($, 'ajax', failingAjax(429));
      var res = null;
      ai_word_predictor._fetch('i want to', 'en', 5).then(function(words) { res = words; });
      waitsFor(function() { return res; });
      runs(function() {
        expect(ai_word_predictor._backoff_until > Date.now()).toEqual(true);
        ai_word_predictor._backoff_until = 0;
      });
    });

    it('does not pause after a server error (500)', function() {
      ai_word_predictor._backoff_until = 0;
      stub($, 'ajax', failingAjax(500));
      var res = null;
      ai_word_predictor._fetch('i want to', 'en', 5).then(function(words) { res = words; });
      waitsFor(function() { return res; });
      runs(function() {
        expect(ai_word_predictor._backoff_until).toEqual(0);
      });
    });
  });
});
