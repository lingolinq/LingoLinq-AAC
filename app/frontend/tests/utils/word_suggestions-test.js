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
  queue_promise
} from 'frontend/tests/helpers/ember_helper';
import RSVP from 'rsvp';
import LingoLinq from 'frontend/app';
import app_state from '../../utils/app_state';
import word_suggestions from '../../utils/word_suggestions';
import persistence from '../../utils/persistence';

describe('word_suggestions', function() {
  beforeEach(function() {
    word_suggestions.last_finished_word = null;
    word_suggestions.last_result = null;
    word_suggestions.word_in_progress = null;
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
      stub(word_suggestions, 'fallback_url', function() { return RSVP.resolve('data:stuff'); });
      word_suggestions.ngrams = {
        "": [['jump', -1.5], ['friend', -1.2], ['fancy', -1.0], ['for', -2.5]]
      };
      var res = null;
      var calls = 0;
      var bs = {
        find_buttons: function(word, board_id, user, include_home) {
          calls++;
          if(word == 'fancy') {
            return RSVP.resolve([
              {label: 'fancy', image: 'data:fancy'}
            ]);
          } else if(word == 'for') {
            return RSVP.resolve([{label: 'ford', image: 'data:ford'}]);
          }
          return RSVP.reject();
        }
      };
      stub(LingoLinq.store, 'findRecord', function(type, id) {
        expect(type).toEqual('board');
        expect(id).toEqual('bacon');
        return RSVP.resolve({
          get: function() { return 'bacon'; },
          load_button_set: function() {
            return RSVP.resolve(bs);
          }
        });
      });
      word_suggestions.lookup({word_in_progress: 'f', button_set: bs, board_ids: ['bacon']}).then(function(r) { res = r; });
      waitsFor(function() { return res; });
      runs(function() {
        expect(res[0].word).toEqual('friend');
        expect(res[1].word).toEqual('fancy');
        expect(res[2].word).toEqual('for');
      });
      waitsFor(function() { return res && calls >= 3; });
      runs(function() {
        expect(res[0].image).toEqual('data:stuff');
        expect(res[1].image).toEqual('data:fancy');
        expect(res[2].image).toEqual('data:stuff');
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

      // Fake localStorage for test isolation
      var store = {};
      var oldLS = window.localStorage;
      window.localStorage = {
        getItem: function(k) { return store[k] || null; },
        setItem: function(k, v) { store[k] = v; },
        removeItem: function(k) { delete store[k]; }
      };

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
        window.localStorage = oldLS;
      });
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
      stub(persistence, 'find_url', function(url) {
        expect(url).toEqual('https://opensymbols.s3.amazonaws.com/libraries/mulberry/paper.svg');
        return RSVP.resolve('file://fallback.png');
      });
      word_suggestions.fallback_url().then(function(res) {
        done = true;
        url = res;
      });
      waitsFor(function() { return done; });
      runs(function() {
        expect(url).toEqual('file://fallback.png');
        expect(word_suggestions.fallback_url_result).toEqual('file://fallback.png');
      });
    });

    it('should use the original url if no cached copy found', function() {
      word_suggestions.fallback_url_result = null;
      var done = false;
      var url = null;
      var looked_up = false;
      stub(persistence, 'find_url', function(url) {
        looked_up = true;
        expect(url).toEqual('https://opensymbols.s3.amazonaws.com/libraries/mulberry/paper.svg');
        return RSVP.reject();
      });
      word_suggestions.fallback_url().then(function(res) {
        done = true;
        url = res;
      });
      waitsFor(function() { return done; });
      runs(function() {
        expect(url).toEqual('https://opensymbols.s3.amazonaws.com/libraries/mulberry/paper.svg');
        expect(looked_up).toEqual(true);
        expect(word_suggestions.fallback_url_result).toEqual(null);
      });
    });
  });
});
