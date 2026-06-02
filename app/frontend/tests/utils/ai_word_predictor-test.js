import {
  describe,
  it,
  expect,
  beforeEach,
  waitsFor,
  runs
} from 'frontend/tests/helpers/jasmine';
import RSVP from 'rsvp';
import ai_word_predictor from '../../utils/ai_word_predictor';

describe('ai_word_predictor', function() {
  beforeEach(function() {
    ai_word_predictor.clear_cache();
  });

  it('should not call the API when the feature flag is disabled', function() {
    var appState = {
      get: function(key) {
        if(key === 'feature_flags.ai_word_prediction') { return false; }
        return null;
      }
    };
    var res = null;
    ai_word_predictor.predict('I want to', { appState: appState }).then(function(words) {
      res = words;
    });
    waitsFor(function() { return res; });
    runs(function() {
      expect(res).toEqual([]);
    });
  });

  it('should resolve cached predictions without duplicate fetches', function() {
    var appState = {
      get: function(key) {
        if(key === 'feature_flags.ai_word_prediction') { return true; }
        return null;
      }
    };
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
    var appState = {
      get: function(key) {
        if(key === 'feature_flags.ai_word_prediction') { return true; }
        return null;
      }
    };
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
});
