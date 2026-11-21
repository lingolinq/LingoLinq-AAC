import { module, test } from 'qunit';
import $ from 'jquery';
import { setupTest } from '../../helpers';
import { settled } from '@ember/test-helpers';
import aiPredictor from 'frontend/utils/ai_word_predictor';

/* KAN-156. Two limits on the AI prediction request.

   TIME. The request is a POST, so it inherited the app-wide 20 second timeout, and the app's
   $.ajax wrapper (utils/extras.js) sends a timed-out POST a second time: about 40 seconds before
   the caller heard anything on weak wifi. Prediction is only useful within a tap or two, so it
   gets its own 2 second limit and is sent once.

   COUNT. The client cap was 15 a minute, sized for a free tier the app no longer uses; a fast
   communicator went over it and AI stopped silently for the rest of the minute. It is 60 now.

   The first group replaces `$.realAjax`, the transport UNDER the app's wrapper, so the wrapper's
   own timeout default and retry are what is being exercised. */
module('Unit | Utility | ai_word_predictor limits', function(hooks) {
  setupTest(hooks);

  let saved = null;

  hooks.beforeEach(function() {
    saved = {
      realAjax: Object.getOwnPropertyDescriptor($, 'realAjax'),
      ajax: Object.getOwnPropertyDescriptor($, 'ajax'),
      is_enabled: Object.getOwnPropertyDescriptor(aiPredictor, 'is_enabled'),
      request_times: aiPredictor._request_times,
      backoff_until: aiPredictor._backoff_until
    };
    aiPredictor.is_enabled = function() { return true; };
    aiPredictor._request_times = [];
    aiPredictor._backoff_until = 0;
    aiPredictor.clear_cache();
  });

  hooks.afterEach(async function() {
    await settled();
    if(saved.realAjax) { Object.defineProperty($, 'realAjax', saved.realAjax); }
    Object.defineProperty($, 'ajax', saved.ajax);
    Object.defineProperty(aiPredictor, 'is_enabled', saved.is_enabled);
    aiPredictor._request_times = saved.request_times;
    aiPredictor._backoff_until = saved.backoff_until;
    aiPredictor.clear_cache();
  });

  test('a prediction request that times out is given 2 seconds and is not sent again', async function(assert) {
    assert.expect(6);
    assert.strictEqual(typeof $.realAjax, 'function', 'guard: the app\'s $.ajax wrapper is installed');
    const sent = [];
    $.realAjax = function(options) {
      sent.push({ url: options.url, timeout: options.timeout });
      /* What jQuery reports for a timeout: no status, readyState 0, textStatus "timeout". */
      const failed = { then: function(ok, fail) { if(fail) { fail({ status: 0, readyState: 0 }, 'timeout', 'timeout'); } return failed; } };
      return failed;
    };

    const words = await aiPredictor._fetch('i want', 'en', 5);
    /* The wrapper's second attempt is scheduled 500 ms later on the run loop; wait it out. */
    await settled();

    assert.deepEqual(words, [], 'the caller gets no AI words');
    assert.strictEqual(sent.length, 1, 'the request was sent once');
    assert.strictEqual(sent[0].timeout, 2000, 'with a 2 second limit');
    assert.strictEqual(aiPredictor._backoff_until, 0, 'a timeout does not pause AI for 30 seconds');
    assert.deepEqual(Object.keys(aiPredictor._cache), [], 'and is not remembered as an empty answer');
  });

  test('a communicator tapping faster than 15 words a minute still gets AI words', async function(assert) {
    assert.expect(2);
    const sent = [];
    $.ajax = function(options) {
      sent.push(options.data.sentence);
      return { then: function(ok) { ok({ words: ['to'] }); } };
    };
    const now = Date.now();
    aiPredictor._request_times = Array.from({ length: 20 }, function(_, i) { return now - (i * 1000); });

    const words = await aiPredictor.predict('i want', { locale: 'en', count: 5, immediate: true });

    assert.deepEqual(words, ['to'], 'the twenty-first request in a minute is answered');
    assert.deepEqual(sent, ['i want'], 'and was sent');
  });

  test('a runaway of 60 requests in a minute is still stopped', async function(assert) {
    assert.expect(2);
    const sent = [];
    $.ajax = function(options) {
      sent.push(options.data.sentence);
      return { then: function(ok) { ok({ words: ['to'] }); } };
    };
    const now = Date.now();
    aiPredictor._request_times = Array.from({ length: 60 }, function(_, i) { return now - (i * 900); });

    const words = await aiPredictor.predict('i want', { locale: 'en', count: 5, immediate: true });

    assert.deepEqual(words, [], 'the sixty-first request gets no AI words');
    assert.deepEqual(sent, [], 'and nothing was sent');
  });
});
