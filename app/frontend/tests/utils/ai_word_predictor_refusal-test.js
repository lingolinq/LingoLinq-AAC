import {
  describe,
  it,
  expect,
  waitsFor,
  runs,
  stub
} from 'frontend/tests/helpers/jasmine';
import $ from 'jquery';
import ai_word_predictor from '../../utils/ai_word_predictor';

// words_controller.rb#predict answers 400 "ai_word_prediction is not enabled
// for this user" when AI word prediction is off for the account it checks. The
// predictor pauses on that refusal, read from the shapes the app's $.ajax
// wrapper (utils/extras.js) rejects with.
var REFUSAL = 'ai_word_prediction is not enabled for this user';

describe('ai_word_predictor pauses on refusal', function() {
  describe('pausing', function() {
    function rejectWith(err) {
      return function() {
        return { then: function(ok, fail) { fail(err); } };
      };
    }

    function fetchWith(err) {
      ai_word_predictor._backoff_until = 0;
      stub($, 'ajax', rejectWith(err));
      var res = null;
      ai_word_predictor._fetch('i want to', 'en', 5).then(function(words) { res = words; });
      return function() { return res; };
    }

    it('pauses on the not-enabled refusal (400)', function() {
      var done = fetchWith({ fakeXHR: { status: 400 }, message: 'error', result: REFUSAL });
      waitsFor(done);
      runs(function() {
        expect(ai_word_predictor._backoff_until > Date.now()).toEqual(true);
        ai_word_predictor._backoff_until = 0;
      });
    });

    it('does not pause on another 400', function() {
      var done = fetchWith({ fakeXHR: { status: 400 }, message: 'error', result: 'sentence required' });
      waitsFor(done);
      runs(function() {
        expect(ai_word_predictor._backoff_until).toEqual(0);
      });
    });

    it('pauses on the not-enabled refusal sent as a 200 body (ApplicationCache clients)', function() {
      var done = fetchWith({ fakeXHR: { status: 200 }, message: 'error', result: { error: REFUSAL, status: 400 } });
      waitsFor(done);
      runs(function() {
        expect(ai_word_predictor._backoff_until > Date.now()).toEqual(true);
        ai_word_predictor._backoff_until = 0;
      });
    });

    it('pauses on a 403 sent as a 200 body (ApplicationCache clients)', function() {
      var done = fetchWith({ fakeXHR: { status: 200 }, message: 'error', result: { error: 'parental consent required', status: 403 } });
      waitsFor(done);
      runs(function() {
        expect(ai_word_predictor._backoff_until > Date.now()).toEqual(true);
        ai_word_predictor._backoff_until = 0;
      });
    });

    it('does not pause on a network failure (status 0)', function() {
      var done = fetchWith({ fakeXHR: { status: 0 }, message: 'error', result: 'error' });
      waitsFor(done);
      runs(function() {
        expect(ai_word_predictor._backoff_until).toEqual(0);
      });
    });
  });
});
