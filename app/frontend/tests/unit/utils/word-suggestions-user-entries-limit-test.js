import { module, test } from 'qunit';
import RSVP from 'rsvp';
import { setupTest } from '../../helpers';
import { settled, waitUntil } from '@ember/test-helpers';
import wordSuggestions from 'frontend/utils/word_suggestions';
import aiPredictor from 'frontend/utils/ai_word_predictor';

/* KAN-156. With AI on, `lookup_with_ai` waits for THREE answers before the rail changes: the
   built-in words, the AI words, and the communicator's own saved next-word entries
   (`fetch_user_entries`, a GET to /api/v1/prediction_entries). The AI request has a 2 second
   limit, but the entries GET has the app-wide default: 8 seconds, then two more attempts of 20
   seconds each from the $.ajax wrapper (utils/extras.js). On weak wifi the rail therefore kept the
   previous sentence's words for most of a minute.

   The rail now WAITS at most 2 seconds for the entries. The request itself is left alone: an
   answer that arrives later is still remembered, so the next tap on that word has the entries.
   (Cutting the request off at 2 seconds instead would mean a communicator on a slow connection
   never gets their saved entries at all.)

   The entries request is a recorder whose answers this file resolves by hand, so "still on the
   wire" is a state the test holds, not a race against a timer. */
module('Unit | Utility | word_suggestions user entries limit', function(hooks) {
  setupTest(hooks);

  let restore = [];
  const patch = (obj, key, value) => {
    restore.push([obj, key, Object.getOwnPropertyDescriptor(obj, key)]);
    obj[key] = value;
  };

  hooks.beforeEach(function() {
    const requests = this.requests = [];
    patch(wordSuggestions, '_server_entry_cache', {});
    patch(wordSuggestions, 'get_persistence', function() {
      return {
        ajax: function(url, opts) {
          const d = { url: url, opts: opts };
          d.promise = new RSVP.Promise(function(resolve) { d.resolve = resolve; });
          requests.push(d);
          return d.promise;
        }
      };
    });
    patch(wordSuggestions, 'lookup', function() { return RSVP.resolve([{ word: 'some', source: 'local' }]); });
    patch(wordSuggestions, 'fallback_url', function() { return RSVP.resolve('data:,'); });
    patch(wordSuggestions, 'log_prediction_telemetry', function() {});
    patch(aiPredictor, 'is_enabled', function() { return true; });
    patch(aiPredictor, 'predict', function() { return RSVP.resolve(['to']); });
  });

  hooks.afterEach(async function() {
    /* End anything a test left on the wire, while the recorder's cache is still installed. */
    this.requests.forEach(function(d) { d.resolve({ entries: [] }); });
    await settled();
    restore.reverse().forEach(([obj, key, descriptor]) => {
      if(descriptor) { Object.defineProperty(obj, key, descriptor); } else { delete obj[key]; }
    });
    restore = [];
  });

  const words = (list) => list.map((s) => s.word);

  test('the rail stops waiting for saved entries at the limit, and a late answer is remembered for the next tap', async function(assert) {
    assert.expect(6);
    patch(wordSuggestions, 'user_entries_wait_ms', 20);
    let first = null;
    wordSuggestions.lookup_with_ai({ last_finished_word: 'want', sentence: 'i want', locale: 'en' }).then(function(list) { first = list; });

    await waitUntil(() => first !== null, { timeout: 1500, timeoutMessage: 'the rail was still waiting for the saved entries' });
    assert.deepEqual(words(first), ['to', 'some'], 'the rail got the AI and built-in words without the entries');
    assert.strictEqual(this.requests.length, 1, 'guard: the entries request was sent');
    assert.strictEqual(this.requests[0].opts.timeout, undefined, 'and was not given a cut-off of its own');

    /* The answer arrives after the rail moved on. */
    this.requests[0].resolve({ entries: [{ next_word: 'juice' }] });
    await settled();
    assert.deepEqual(Object.keys(wordSuggestions._server_entry_cache), ['en:want'], 'the late answer is remembered');

    const second = await wordSuggestions.lookup_with_ai({ last_finished_word: 'want', sentence: 'i want', locale: 'en' });
    assert.deepEqual(words(second), ['to', 'some', 'juice'], 'the next tap on that word has the saved entry');
    assert.strictEqual(this.requests.length, 1, 'without asking the server again');
  });

  test('saved entries that arrive within the limit are on the rail for that tap', async function(assert) {
    assert.expect(2);
    const lookup = wordSuggestions.lookup_with_ai({ last_finished_word: 'want', sentence: 'i want', locale: 'en' });
    await waitUntil(() => this.requests.length > 0, { timeout: 1500 });
    this.requests[0].resolve({ entries: [{ next_word: 'juice' }] });

    assert.deepEqual(words(await lookup), ['to', 'some', 'juice'], 'the entry is offered after the AI and built-in words');
    assert.deepEqual(Object.keys(wordSuggestions._server_entry_cache), ['en:want'], 'and is remembered');
  });

  test('a saved-entries request that fails does not hold the rail or get remembered', async function(assert) {
    assert.expect(2);
    patch(wordSuggestions, 'get_persistence', function() {
      return { ajax: function() { return RSVP.reject({ error: 'timeout' }); } };
    });

    const list = await wordSuggestions.lookup_with_ai({ last_finished_word: 'want', sentence: 'i want', locale: 'en' });

    assert.deepEqual(words(list), ['to', 'some'], 'the rail has the AI and built-in words');
    assert.deepEqual(Object.keys(wordSuggestions._server_entry_cache), [], 'and the miss is not remembered, so the next tap asks again');
  });

  /* Seen in the KAN-159 click-test: a board that loads with a sentence already in the bar runs
     the lookup several times at once (both board controllers, several times each), and every one
     sent its own GET for the same word, because an answer is only remembered once it ARRIVES.
     Lookups that overlap now share the request that is already on the wire. */
  test('lookups for the same word that overlap share one saved-entries request', async function(assert) {
    assert.expect(3);
    const lookups = [];
    for(let i = 0; i < 5; i++) {
      lookups.push(wordSuggestions.lookup_with_ai({ last_finished_word: 'want', sentence: 'i want', locale: 'en' }));
    }
    await waitUntil(() => this.requests.length > 0, { timeout: 1500 });
    /* Each lookup asks for the entries synchronously, so all five have asked by now. No settled()
       here: it would outlast the 2 second limit and the lookups would give up on the entries. */
    assert.strictEqual(this.requests.length, 1, 'five lookups sent one request');

    this.requests[0].resolve({ entries: [{ next_word: 'juice' }] });
    const lists = await RSVP.all(lookups);
    assert.deepEqual(lists.map(words), [1, 2, 3, 4, 5].map(() => ['to', 'some', 'juice']), 'and every one of them got the saved entry');
    await settled();
    assert.strictEqual(this.requests.length, 1, 'with no second request');
  });

  test('a different word, or the same word in another language, gets its own request', async function(assert) {
    assert.expect(1);
    wordSuggestions.lookup_with_ai({ last_finished_word: 'want', sentence: 'i want', locale: 'en' });
    wordSuggestions.lookup_with_ai({ last_finished_word: 'like', sentence: 'i like', locale: 'en' });
    wordSuggestions.lookup_with_ai({ last_finished_word: 'want', sentence: 'i want', locale: 'es' });
    await waitUntil(() => this.requests.length >= 3, { timeout: 1500 }).catch(() => {});
    assert.deepEqual(this.requests.map((d) => d.url.split('?')[1]).sort(),
      ['prefix=like&locale=en', 'prefix=want&locale=en', 'prefix=want&locale=es'], 'one request each');
  });

  test('a shared request that failed is not handed to a later lookup', async function(assert) {
    assert.expect(2);
    let calls = 0;
    patch(wordSuggestions, 'get_persistence', function() {
      return { ajax: function() { calls++; return RSVP.reject({ error: 'timeout' }); } };
    });
    await RSVP.all([
      wordSuggestions.lookup_with_ai({ last_finished_word: 'want', sentence: 'i want', locale: 'en' }),
      wordSuggestions.lookup_with_ai({ last_finished_word: 'want', sentence: 'i want', locale: 'en' })
    ]);
    await settled();
    assert.strictEqual(calls, 1, 'guard: the two overlapping lookups shared the request that failed');

    await wordSuggestions.lookup_with_ai({ last_finished_word: 'want', sentence: 'i want', locale: 'en' });
    assert.strictEqual(calls, 2, 'the next lookup asks the server again');
  });
});
