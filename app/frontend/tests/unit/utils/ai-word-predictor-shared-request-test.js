import { module, test } from 'qunit';
import $ from 'jquery';
import RSVP from 'rsvp';
import { waitUntil } from '@ember/test-helpers';
import aiPredictor from 'frontend/utils/ai_word_predictor';

/* KAN-159. `predict()` had ONE waiting slot: every new call cancelled whoever was waiting and
   resolved them with [] (the `_pending_reject` branch), even when the newcomer asked for the very
   same sentence. Two callers per tap (the Modern rail and the classic board controller) therefore
   cancelled each other, and the rail fell back to built-in words.

   What these tests pin: callers asking for the SAME sentence and language share one request and
   all get its words; a DIFFERENT sentence still replaces one that has not been sent yet, so fast
   tapping does not queue stale requests.

   `$.ajax` is replaced with a recorder whose answers this file resolves by hand, so "still
   waiting" and "already on the wire" are states the test holds, not races against a timer. */
module('Unit | Utility | ai_word_predictor shared request', function(hooks) {
  let saved = null;

  hooks.beforeEach(function() {
    saved = {
      ajax: Object.getOwnPropertyDescriptor($, 'ajax'),
      is_enabled: Object.getOwnPropertyDescriptor(aiPredictor, 'is_enabled'),
      debounce: aiPredictor._debounce_ms,
      request_times: aiPredictor._request_times,
      backoff_until: aiPredictor._backoff_until,
      shared_max_ms: aiPredictor._shared_max_ms
    };
    const requests = this.requests = [];
    $.ajax = function(opts) {
      const d = { opts: opts };
      d.promise = new RSVP.Promise(function(resolve, reject) { d.resolve = resolve; d.reject = reject; });
      requests.push(d);
      return d.promise;
    };
    aiPredictor.is_enabled = function() { return true; };
    aiPredictor._debounce_ms = 5;
    aiPredictor._request_times = [];
    aiPredictor._backoff_until = 0;
    aiPredictor.clear_cache();
  });

  hooks.afterEach(async function() {
    /* End anything a test left waiting or on the wire, while the recorder is still installed. */
    await aiPredictor.predict('', {});
    this.requests.forEach(function(d) { d.resolve({ words: [] }); });
    await RSVP.resolve();
    Object.defineProperty($, 'ajax', saved.ajax);
    Object.defineProperty(aiPredictor, 'is_enabled', saved.is_enabled);
    aiPredictor._debounce_ms = saved.debounce;
    aiPredictor._request_times = saved.request_times;
    aiPredictor._backoff_until = saved.backoff_until;
    if(saved.shared_max_ms === undefined) { delete aiPredictor._shared_max_ms; } else { aiPredictor._shared_max_ms = saved.shared_max_ms; }
    aiPredictor.clear_cache();
  });

  test('two callers waiting on the same sentence share one request and both get its words', async function(assert) {
    assert.expect(4);
    const first = aiPredictor.predict('I want', { locale: 'en', count: 5 });
    const second = aiPredictor.predict(' i want ', { locale: 'en', count: 5 });

    await waitUntil(() => this.requests.length > 0, { timeout: 2000 });
    this.requests[0].resolve({ words: ['to', 'a'] });

    assert.deepEqual(await first, ['to', 'a'], 'the first caller was not cancelled by the second');
    assert.deepEqual(await second, ['to', 'a'], 'the second caller got the same words');
    assert.strictEqual(this.requests.length, 1, 'one request was sent for both');
    assert.strictEqual(this.requests[0].opts.data.sentence, 'i want', 'for the sentence they asked about');
  });

  test('a caller asking while the request is already on the wire joins it', async function(assert) {
    assert.expect(3);
    const first = aiPredictor.predict('i want', { locale: 'en', count: 5 });
    await waitUntil(() => this.requests.length > 0, { timeout: 2000 });

    const second = aiPredictor.predict('i want', { locale: 'en', count: 5 });
    this.requests[0].resolve({ words: ['to'] });

    assert.deepEqual(await first, ['to'], 'the first caller gets the answer');
    assert.deepEqual(await second, ['to'], 'the late caller gets the same answer');
    assert.strictEqual(this.requests.length, 1, 'no second request was sent for the same sentence');
  });

  test('the same sentence in another language is a different request', async function(assert) {
    assert.expect(3);
    const english = aiPredictor.predict('quiero', { locale: 'en', count: 5 });
    const spanish = aiPredictor.predict('quiero', { locale: 'es', count: 5 });

    assert.deepEqual(await english, [], 'the waiting English request was replaced');
    await waitUntil(() => this.requests.length > 0, { timeout: 2000 });
    this.requests[0].resolve({ words: ['agua'] });
    assert.deepEqual(await spanish, ['agua'], 'the Spanish caller gets Spanish words');
    assert.strictEqual(this.requests[0].opts.data.locale, 'es', 'and the request names its language');
  });

  /* The three below hold behaviour that already worked. They are here because sharing by sentence
     is exactly the kind of change that breaks them: a replaced request must not linger as a
     shared answer, and a cleared sentence must still cancel. */
  test('a different sentence still replaces one that has not been sent yet', async function(assert) {
    assert.expect(4);
    const first = aiPredictor.predict('i', { locale: 'en', count: 5 });
    const second = aiPredictor.predict('i want', { locale: 'en', count: 5 });

    assert.deepEqual(await first, [], 'the replaced caller resolves empty');
    await waitUntil(() => this.requests.length > 0, { timeout: 2000 });
    this.requests[0].resolve({ words: ['to'] });
    assert.deepEqual(await second, ['to'], 'the newer sentence is answered');
    assert.strictEqual(this.requests.length, 1, 'nothing was sent for the replaced sentence');
    assert.strictEqual(this.requests[0].opts.data.sentence, 'i want', 'only the newer sentence went out');
  });

  test('a sentence that was replaced and is then asked again gets a real answer', async function(assert) {
    assert.expect(6);
    const first = aiPredictor.predict('i', { locale: 'en', count: 5 });
    const second = aiPredictor.predict('i want', { locale: 'en', count: 5 });
    const third = aiPredictor.predict('i', { locale: 'en', count: 5 });

    assert.deepEqual(await first, [], 'the first ask was replaced');
    assert.deepEqual(await second, [], 'and so was the one that replaced it');
    /* The first ask has settled by now. Its clean-up must not have forgotten the THIRD ask, which
       holds the same sentence: a fourth caller joins it instead of cancelling it. */
    const fourth = aiPredictor.predict('i', { locale: 'en', count: 5 });
    await waitUntil(() => this.requests.length > 0, { timeout: 2000 });
    this.requests[0].resolve({ words: ['am'] });
    assert.deepEqual(await third, ['am'], 'the repeat ask is not handed the cancelled empty answer');
    assert.deepEqual(await fourth, ['am'], 'and a later caller joined it');
    assert.strictEqual(this.requests[0].opts.data.sentence, 'i', 'its request was sent');
    assert.strictEqual(this.requests.length, 1, 'once');
  });

  test('a caller for whom AI is off is not handed a request started while it was on', async function(assert) {
    assert.expect(3);
    const off = { off: true };
    aiPredictor.is_enabled = function(state) { return state !== off; };
    const allowed = aiPredictor.predict('i want', { locale: 'en', count: 5 });
    const refused = aiPredictor.predict('i want', { locale: 'en', count: 5, appState: off });

    assert.deepEqual(await refused, [], 'the caller with AI off gets nothing');
    await waitUntil(() => this.requests.length > 0, { timeout: 2000 });
    this.requests[0].resolve({ words: ['to'] });
    assert.deepEqual(await allowed, ['to'], 'the caller with AI on is not cancelled by it');
    assert.strictEqual(this.requests.length, 1, 'and only the allowed request was sent');
  });

  test('a cleared sentence still cancels the waiting request', async function(assert) {
    assert.expect(3);
    const first = aiPredictor.predict('i want', { locale: 'en', count: 5 });
    const cleared = aiPredictor.predict('', { locale: 'en', count: 5 });

    assert.deepEqual(await first, [], 'the waiting caller resolves empty');
    assert.deepEqual(await cleared, [], 'the empty sentence resolves empty');
    assert.strictEqual(aiPredictor._pending_timer, null, 'and no request is left waiting to be sent');
  });

  /* Review round 1. Joining a shared request returned before the waiting slot was looked at, so
     a sentence the communicator had already moved on from was still sent. */
  test('going back to a sentence already on the wire cancels the one still waiting', async function(assert) {
    assert.expect(4);
    const first = aiPredictor.predict('i', { locale: 'en', count: 5 });
    await waitUntil(() => this.requests.length > 0, { timeout: 2000 });
    const second = aiPredictor.predict('i want', { locale: 'en', count: 5 });
    const back = aiPredictor.predict('i', { locale: 'en', count: 5 });

    assert.deepEqual(await second, [], 'the sentence that was moved on from resolves empty');
    assert.strictEqual(aiPredictor._pending_timer, null, 'and is no longer waiting to be sent');
    this.requests[0].resolve({ words: ['am'] });
    assert.deepEqual(await first, ['am'], 'the request on the wire still answers its first caller');
    assert.deepEqual(await back, ['am'], 'and the caller who came back to it');
  });

  test('clearing twice in one turn around a new sentence still cancels it', async function(assert) {
    assert.expect(2);
    aiPredictor.predict('', { locale: 'en', count: 5 });
    const waiting = aiPredictor.predict('i want', { locale: 'en', count: 5 });
    aiPredictor.predict('', { locale: 'en', count: 5 });

    assert.deepEqual(await waiting, [], 'the waiting caller resolves empty');
    assert.strictEqual(aiPredictor._pending_timer, null, 'and no request is left waiting to be sent');
  });

  /* A request can fail to settle at all (utils/extras.js logs the user out on an invalid token
     without resolving or rejecting). Sharing must not make every later ask for that sentence
     wait on it for the life of the tab. */
  test('a request that never answers stops being shared after a few seconds', async function(assert) {
    assert.expect(3);
    aiPredictor._shared_max_ms = 20;
    aiPredictor.predict('i want', { locale: 'en', count: 5 });
    await waitUntil(() => this.requests.length > 0, { timeout: 2000 });
    const sent_at = Date.now();
    await waitUntil(() => (Date.now() - sent_at) > 40, { timeout: 2000 });

    const again = aiPredictor.predict('i want', { locale: 'en', count: 5 });
    await waitUntil(() => this.requests.length > 1, { timeout: 2000, timeoutMessage: 'the repeat ask joined the dead request' });
    this.requests[1].resolve({ words: ['to'] });

    assert.deepEqual(await again, ['to'], 'the repeat ask got an answer of its own');
    assert.strictEqual(this.requests.length, 2, 'from a new request');
    assert.strictEqual(this.requests[1].opts.data.sentence, 'i want', 'for the same sentence');
  });
});
