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
import {
  fakeRecorder,
  fakeMediaRecorder,
  fakeCanvas,
  queryLog,
  easyPromise,
  queue_promise,
  replaceLocalStorage
} from 'frontend/tests/helpers/ember_helper';
import RSVP from 'rsvp';
import EmberObject from '@ember/object';
import LingoLinq from 'frontend/app';
import app_state from '../../utils/app_state';
import word_suggestions from '../../utils/word_suggestions';
import persistence from '../../utils/persistence';
import templateHelpers from '../../utils/template_helpers';

describe('word_suggestions', function() {
  beforeEach(function() {
    word_suggestions.last_finished_word = null;
    word_suggestions.last_result = null;
    word_suggestions.word_in_progress = null;
    word_suggestions.last_time_bucket = null;
    word_suggestions.last_topic_context = null;
    word_suggestions.last_locale = null;
    word_suggestions.fallback_url_result = null;
  });
  describe("lookup", function() {
    it("should suggest words", function() {
      stub(word_suggestions, 'fallback_url', function() { return RSVP.reject(); });
      word_suggestions.ngrams = {
        "": [['jump', -1.5], ['friend', -1.2], ['fancy', -1.0], ['for', -2.5]]
      };
      var res = null;
      word_suggestions.lookup({word_in_progress: 'f'}).then(function(r) { res = r; });
      waitsFor(function() { return res; });
      runs(function() {
        expect(res).toEqual([{word: 'friend'}, {word: 'fancy'}, {word: 'for'}]);
      });
    });

    it('should provide images for words if available', function() {
      stub(word_suggestions, 'fallback_url', function() { return RSVP.resolve('data:stuff'); });
      word_suggestions.ngrams = {
        "": [['jump', -1.5], ['friend', -1.2], ['fancy', -1.0], ['for', -2.5]]
      };
      var res = null;
      word_suggestions.lookup({word_in_progress: 'f'}).then(function(r) { res = r; });
      waitsFor(function() { return res; });
      runs(function() {
        expect(res[0].word).toEqual('friend');
        expect(res[1].word).toEqual('fancy');
        expect(res[2].word).toEqual('for');
      });
      waitsFor(function() { return res && res[0].image; });
      runs(function() {
        expect(res[0].image).toEqual('data:stuff');
        expect(res[1].image).toEqual('data:stuff');
        expect(res[2].image).toEqual('data:stuff');
      });
    });

    it("should suggest even if past a misspelling", function() {
      stub(word_suggestions, 'fallback_url', function() { return RSVP.reject(); });
      word_suggestions.ngrams = {
        "": [['jump', -1.5], ['friend', -1.2], ['fancy', -1.0], ['for', -2.5]]
      };
      var res = null;
      word_suggestions.lookup({word_in_progress: 'frend'}).then(function(r) { res = r; });
      waitsFor(function() { return res; });
      runs(function() {
        expect(res).toEqual([{word: 'friend'}, {word: 'fancy'}, {word: 'for'}, {word: 'jump'}]);
      });
    });

    it("should not suggest swear words", function() {
      stub(word_suggestions, 'fallback_url', function() { return RSVP.reject(); });
      word_suggestions.ngrams = {
        "": [['fuck', -1.5], ['friend', -1.2], ['fancy', -1.0], ['for', -2.5]]
      };
      var res = null;
      word_suggestions.lookup({word_in_progress: 'f'}).then(function(r) { res = r; });
      waitsFor(function() { return res; });
      runs(function() {
        expect(res).toEqual([{word: 'friend'}, {word: 'fancy'}, {word: 'for'}]);
      });
    });

    it("should set the result's image to the matching button's image if found", function() {
      var fallbackDeferred = easyPromise();
      stub(word_suggestions, 'fallback_url', function() {
        return fallbackDeferred;
      });
      word_suggestions.ngrams = {
        "": [['jump', -1.5], ['friend', -1.2], ['fancy', -1.0], ['for', -2.5]]
      };
      var res = null;
      var bs = EmberObject.create({
        id: 'bacon',
        redepth: function() {
          return [
            {
              label: 'fancy',
              vocalization: 'fancy',
              image_id: '1',
              depth: 0,
              image: 'data:fancy',
              original_image: 'data:fancy',
              image_license: {}
            }
          ];
        }
      });
      stub(LingoLinq.Buttonset, 'fix_image', function() {
        return RSVP.resolve();
      });
      word_suggestions.lookup({
        word_in_progress: 'f',
        button_sets: [bs]
      }).then(function(r) { res = r; });
      function wordItem(label) {
        return res && res.find(function(w) { return w.word.toLowerCase() === label; });
      }
      waitsFor(function() { return res && wordItem('friend') && wordItem('fancy') && wordItem('for'); });
      runs(function() {
        expect(wordItem('friend').word.toLowerCase()).toEqual('friend');
        expect(wordItem('fancy').word.toLowerCase()).toEqual('fancy');
        expect(wordItem('for').word.toLowerCase()).toEqual('for');
      });
      waitsFor(function() { return wordItem('fancy') && wordItem('fancy').image === 'data:fancy'; });
      runs(function() {
        fallbackDeferred.resolve('data:stuff');
      });
      waitsFor(function() {
        return wordItem('friend') && wordItem('friend').image === 'data:stuff'
          && wordItem('fancy') && wordItem('fancy').image === 'data:fancy'
          && wordItem('for') && wordItem('for').image === 'data:stuff';
      });
      runs(function() {
        expect(wordItem('friend').image).toEqual('data:stuff');
        expect(wordItem('fancy').image).toEqual('data:fancy');
        expect(wordItem('for').image).toEqual('data:stuff');
      });
    });

    it('should rerank suggestions by time of day (morning vs night)', function() {
      stub(word_suggestions, 'fallback_url', function() { return RSVP.reject(); });
      // Provide deterministic baseline suggestions via ngrams.
      word_suggestions.ngrams = {
        "": [['sleep', -1.0], ['breakfast', -1.1], ['play', -1.2]]
      };

      var resMorning = null;
      var resNight = null;

      word_suggestions.lookup({ word_in_progress: '', time_of_day: 'morning' }).then(function(r) { resMorning = r; });
      word_suggestions.lookup({ word_in_progress: '', time_of_day: 'night' }).then(function(r) { resNight = r; });

      waitsFor(function() { return resMorning && resNight; });
      runs(function() {
        expect(resMorning[0].word.toLowerCase()).toEqual('breakfast');
        expect(resNight[0].word.toLowerCase()).toEqual('sleep');
      });
    });

    it('should boost a word after it is selected (localStorage frequency)', function() {
      stub(word_suggestions, 'fallback_url', function() { return RSVP.reject(); });
      word_suggestions.ngrams = {
        "": [['we', -1.0], ['you', -1.1], ['i', -1.2]]
      };

      var restoreLocalStorage = replaceLocalStorage();

      // Record selecting "you" a few times
      var now = Date.now();
      word_suggestions.record_selection('you', now);
      word_suggestions.record_selection('you', now + 1000);
      word_suggestions.record_selection('you', now + 2000);

      var res = null;
      word_suggestions.lookup({ word_in_progress: '', time_of_day: 'afternoon', now_ms: now + 3000 }).then(function(r) { res = r; });
      waitsFor(function() { return res; });
      runs(function() {
        expect(res[0].word.toLowerCase()).toEqual('you');
        restoreLocalStorage();
      });
    });

    it('should suggest smart phrase continuations for AAC patterns', function() {
      stub(word_suggestions, 'fallback_url', function() { return RSVP.reject(); });
      word_suggestions.ngrams = { 'when': [] };
      var res = null;
      word_suggestions.lookup({ last_finished_word: 'when', word_in_progress: '' }).then(function(r) { res = r; });
      waitsFor(function() { return res; });
      runs(function() {
        expect(res.length).toBeGreaterThan(0);
        expect(res[0].word.toLowerCase()).toEqual('do you');
      });
    });

    it('should not use the English corpus for non-English boards', function() {
      stub(word_suggestions, 'fallback_url', function() { return RSVP.reject(); });
      word_suggestions.ngrams = {
        'when': [['go', -1.0]],
        "": [['play', -1.0]]
      };
      var res = null;
      word_suggestions.lookup({
        last_finished_word: 'when',
        word_in_progress: '',
        locale: 'es'
      }).then(function(r) { res = r; });
      waitsFor(function() { return res; });
      runs(function() {
        expect(res).toEqual([]);
      });
    });

    it('should suggest translated board vocabulary for non-English locales', function() {
      stub(word_suggestions, 'fallback_url', function() { return RSVP.reject(); });
      word_suggestions.ngrams = {
        '': [['play', -1.0]]
      };
      var bs = {
        get: function() { return 'board1'; },
        redepth: function() {
          return [
            { id: '1', label: 'go', depth: 1 },
            { id: '2', label: 'eat', depth: 2 },
            { id: '3', label: 'I', depth: 0 }
          ];
        }
      };
      var res = null;
      word_suggestions.lookup({
        last_finished_word: 'quiero',
        word_in_progress: '',
        locale: 'es',
        board_locale: 'en',
        translations: {
          '1': { es: { label: 'ir' } },
          '2': { es: { label: 'comer' } }
        },
        button_sets: [bs]
      }).then(function(r) { res = r; });
      waitsFor(function() { return res; });
      runs(function() {
        expect(res.map(function(item) { return item.word; })).toEqual(['ir', 'comer']);
      });
    });

    it('should match translated vocabulary while spelling in non-English locales', function() {
      var matches = word_suggestions._test.collect_vocabulary_prefix_matches('qu', {
        locale: 'es',
        board_locale: 'en',
        translations: {
          '1': { es: { label: 'quiero' } }
        },
        button_sets: [{
          get: function() { return 'board1'; },
          redepth: function() {
            return [{ id: '1', label: 'want', depth: 1 }];
          }
        }]
      }, 5);
      expect(matches.map(function(m) { return m.word; })).toEqual(['quiero']);
    });

    it('should boost prefix-specific continuations after selection', function() {
      stub(word_suggestions, 'fallback_url', function() { return RSVP.reject(); });
      word_suggestions.ngrams = {
        'i want': [['to', -1.0], ['more', -1.1], ['help', -1.2]]
      };

      var restoreLocalStorage = replaceLocalStorage();

      var now = Date.now();
      word_suggestions.record_selection('more', now, 'i want');
      word_suggestions.record_selection('more', now + 1000, 'i want');

      var res = null;
      word_suggestions.lookup({
        last_finished_word: 'i want',
        word_in_progress: '',
        now_ms: now + 2000
      }).then(function(r) { res = r; });
      waitsFor(function() { return res; });
      runs(function() {
        expect(res[0].word.toLowerCase()).toEqual('more');
        restoreLocalStorage();
      });
    });

    it('should merge AI words ahead of local suggestions', function() {
      var local = [{ word: 'play' }, { word: 'go' }];
      var merged = word_suggestions._test.merge_suggestions(local, ['eat', 'play'], 4);
      expect(merged[0].word).toEqual('eat');
      expect(merged[0].source).toEqual('ai');
      expect(merged[1].word).toEqual('play');
    });

    it('should prefer local prefix matches while spelling', function() {
      var local = [{ word: 'stop', source: 'vocab' }, { word: 'start', source: 'vocab' }];
      var merged = word_suggestions._test.merge_suggestions(local, ['she', 'slow', 'street'], 4, { word_in_progress: 'st' });
      expect(merged[0].word).toEqual('stop');
      expect(merged[1].word).toEqual('start');
      expect(merged[2].word).toEqual('street');
    });

    it('should collect board vocabulary prefix matches', function() {
      var bs = {
        get: function(key) { return key === 'id' ? 'board1' : null; },
        redepth: function() {
          return [
            { label: 'stop', depth: 0 },
            { label: 'start', depth: 0 },
            { label: 'she', depth: 1 },
            { label: 's', depth: 0 },
            { label: '[space]', depth: 0 },
            { label: 'play', depth: 0 }
          ];
        }
      };
      var matches = word_suggestions._test.collect_vocabulary_prefix_matches('st', { button_sets: [bs] }, 5);
      expect(matches.map(function(m) { return m.word; })).toEqual(['stop', 'start']);
    });

    it('should collect core vocabulary prefix matches', function() {
      word_suggestions._test.build_spelling_word_index();
      word_suggestions._spelling_word_index = ['start', 'stay', 'stop', 'street', 'slow'].sort();
      var matches = word_suggestions._test.collect_core_prefix_matches('st', 5, {});
      expect(matches.map(function(m) { return m.word; })).toEqual(['start', 'stay', 'stop', 'street']);
    });
  });

  describe('fallback_url', function() {
    it('should return a promise', function() {
      var res = word_suggestions.fallback_url();
      expect(res.then).toNotEqual(undefined);
    });

    it('should return the existing result if there is one', function() {
      word_suggestions.fallback_url_result = "file://fallback.png";
      var done = false;
      var url = null;
      word_suggestions.fallback_url().then(function(res) {
        done = true;
        url = res;
      });
      waitsFor(function() { return done; });
      runs(function() {
        expect(url).toEqual('file://fallback.png');
      });
    });

    it('should lookup the cached copy if there is one', function() {
      word_suggestions.fallback_url_result = null;
      var done = false;
      var url = null;
      var localFallback = templateHelpers.path('images/square.svg');
      word_suggestions.fallback_url().then(function(res) {
        done = true;
        url = res;
      });
      waitsFor(function() { return done; });
      runs(function() {
        expect(url).toEqual(localFallback);
        expect(word_suggestions.fallback_url_result).toEqual(localFallback);
      });
    });

    it('should use the original url if no cached copy found', function() {
      word_suggestions.fallback_url_result = null;
      var done = false;
      var url = null;
      var localFallback = templateHelpers.path('images/square.svg');
      word_suggestions.fallback_url().then(function(res) {
        done = true;
        url = res;
      });
      waitsFor(function() { return done; });
      runs(function() {
        expect(url).toEqual(localFallback);
        expect(word_suggestions.fallback_url_result).toEqual(localFallback);
      });
    });
  });
});
