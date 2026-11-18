import { module, test } from 'qunit';
import $ from 'jquery';
import { setupTest } from '../../helpers';
import { settled } from '@ember/test-helpers';
import wordSuggestions from 'frontend/utils/word_suggestions';

/* KAN-156, review round 1. With AI on, `lookup_with_ai` waits for THREE answers before the rail
   changes: the built-in words, the AI words, and the communicator's own saved next-word entries
   (`fetch_user_entries`, a GET to /api/v1/prediction_entries). The AI request has a 2 second
   limit, but the entries GET inherited the app-wide default: 8 seconds, then two more attempts of
   20 seconds each from the $.ajax wrapper (utils/extras.js). On weak wifi the rail therefore
   kept the previous sentence's words for most of a minute. It gets the same 2 second limit and
   is sent once.

   `$.realAjax`, the transport UNDER the app's wrapper, is replaced, so the wrapper's own timeout
   default and retries are what is being exercised. */
module('Unit | Utility | word_suggestions user entries limit', function(hooks) {
  setupTest(hooks);

  let saved = null;

  hooks.beforeEach(function() {
    saved = {
      realAjax: Object.getOwnPropertyDescriptor($, 'realAjax'),
      get_persistence: Object.getOwnPropertyDescriptor(wordSuggestions, 'get_persistence'),
      entry_cache: wordSuggestions._server_entry_cache
    };
    wordSuggestions._server_entry_cache = {};
    /* The part of the persistence service this path uses: it hands its arguments to $.ajax. */
    wordSuggestions.get_persistence = function() {
      return { ajax: function() { return $.ajax.apply(null, arguments); } };
    };
  });

  hooks.afterEach(async function() {
    await settled();
    if(saved.realAjax) { Object.defineProperty($, 'realAjax', saved.realAjax); }
    if(saved.get_persistence) { Object.defineProperty(wordSuggestions, 'get_persistence', saved.get_persistence); } else { delete wordSuggestions.get_persistence; }
    wordSuggestions._server_entry_cache = saved.entry_cache;
  });

  test('a saved-entries request that times out is given 2 seconds and is not sent again', async function(assert) {
    assert.expect(5);
    assert.strictEqual(typeof $.realAjax, 'function', 'guard: the app\'s $.ajax wrapper is installed');
    const sent = [];
    $.realAjax = function(options) {
      sent.push({ url: options.url, timeout: options.timeout });
      /* What jQuery reports for a timeout: no status, readyState 0, textStatus "timeout". */
      const failed = { then: function(ok, fail) { if(fail) { fail({ status: 0, readyState: 0 }, 'timeout', 'timeout'); } return failed; } };
      return failed;
    };

    const entries = await wordSuggestions.fetch_user_entries('want', 'en');
    /* The wrapper schedules each further attempt 500 ms later on the run loop; wait them out. */
    await settled();

    assert.deepEqual(entries, [], 'the caller gets no saved entries');
    assert.strictEqual(sent.length, 1, 'the request was sent once');
    assert.strictEqual(sent[0].timeout, 2000, 'with a 2 second limit');
    assert.deepEqual(Object.keys(wordSuggestions._server_entry_cache), [], 'and the miss is not remembered, so the next tap asks again');
  });

  test('saved entries that arrive are returned and remembered', async function(assert) {
    assert.expect(3);
    const sent = [];
    $.realAjax = function(options) {
      sent.push(options.url);
      const done = { then: function(succeed) { succeed({ entries: [{ next_word: 'juice' }] }, 'success', { status: 200, getResponseHeader: function() { return null; } }); return done; } };
      return done;
    };

    const entries = await wordSuggestions.fetch_user_entries('want', 'en');
    const again = await wordSuggestions.fetch_user_entries('want', 'en');
    await settled();

    assert.deepEqual(entries.map((e) => e.next_word), ['juice'], 'the entries reach the caller');
    assert.deepEqual(again.map((e) => e.next_word), ['juice'], 'and the repeat ask');
    assert.strictEqual(sent.length, 1, 'from one request');
  });
});
