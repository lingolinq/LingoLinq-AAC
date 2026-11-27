import { module, test } from 'qunit';
import EmberObject from '@ember/object';
import $ from 'jquery';
import RSVP from 'rsvp';
import { waitUntil, settled, setupOnerror, resetOnerror } from '@ember/test-helpers';
import BoardDetailController from 'frontend/controllers/user/board-detail';
import BoardIndexController from 'frontend/controllers/board/index';
import wordSuggestions from 'frontend/utils/word_suggestions';
import aiPredictor from 'frontend/utils/ai_word_predictor';
import { standInGlobals } from 'frontend/tests/helpers/stand-in-globals';
import { setupTest } from '../../helpers';

/* KAN-159. Two things about the Modern (board-detail) prediction rail:

   1. ONE LOOKUP PER TAP. `updateSuggestions` watches thirteen keys, and one tap changes several
      of them (the button list is replaced, then mirrored into `sentence_parts`). Each changed key
      ran the whole lookup again for the same sentence.
   2. AI WORDS REACH THE RAIL. With the classic board controller alive beside it (the Modern route
      mirrors the board onto it), the classic lookup cancelled the Modern rail's AI request, so the
      rail showed built-in words only. The last test runs both controllers against the real
      predictor and the real merge, with only the network and the built-in word list replaced. */

function stubService() {
  return EmberObject.create({
    get: function() { return null; },
    set: function() { return null; },
    addObserver: function() {},
    removeObserver: function() {}
  });
}

function appState(extra) {
  const user = EmberObject.create({
    id: 'u-1',
    preferences: { word_suggestions: true, home_board: { id: '1_1', key: 'u/home' } }
  });
  return EmberObject.create(Object.assign({
    speak_mode: true, eval_mode: false, label_locale: 'en', button_list: [],
    currentUser: user, referenced_user: user,
    router: { currentRouteName: 'user.board-detail.index' }
  }, extra || {}));
}

function buildModern(state, keep_mirror) {
  const controller = BoardDetailController.create({
    app_state: state,
    appState: state,
    persistence: stubService(),
    stashes: stubService(),
    router: stubService(),
    session: stubService()
  });
  controller._decorate_suggestion_images = function(list) { return list; };
  /* The mirror of the button list into `sentence_parts` runs in a LATER turn and changes three
     more watched keys. Held still here so each test counts the turn it sets up; the test named
     for the whole tap puts the real mirror back. */
  if(!keep_mirror) { controller.sync_sentence_from_button_list = function() {}; }
  return controller;
}

function tap(state, labels) {
  /* What a tap does to the state the observer watches: utterance.set_button_list REPLACES
     `button_list` (utils/utterance.js `appState.set('button_list', visualButtonList)`), and the
     controller then mirrors it into `sentence_parts`. */
  state.set('button_list', labels.map(function(label) { return { label: label }; }));
}

let restore = [];
const patch = (obj, key, value) => {
  restore.push([obj, key, Object.getOwnPropertyDescriptor(obj, key)]);
  obj[key] = value;
};

function lookupHarness(hooks) {
  hooks.beforeEach(function() {
    this.controllers = [];
    patch(wordSuggestions, 'load_vocabulary_button_sets', function() { return RSVP.resolve([]); });
    patch(wordSuggestions, 'lookup_board_ids', function() { return []; });
    patch(wordSuggestions, 'button_sets_for_board_ids', function() { return []; });
  });

  hooks.afterEach(async function() {
    await settled();
    restore.reverse().forEach(([obj, key, descriptor]) => {
      if(descriptor) { Object.defineProperty(obj, key, descriptor); } else { delete obj[key]; }
    });
    restore = [];
    this.controllers.forEach(function(c) { if(!c.isDestroyed) { c.destroy(); } });
    wordSuggestions.cancel_sync_flush();
  });
}

function countLookups(test_context) {
  const lookups = test_context.lookups = [];
  patch(wordSuggestions, 'lookup_with_ai', function(options) {
    lookups.push(options);
    return RSVP.resolve([{ word: 'to', source: 'ai' }]);
  });
}

module('Unit | Controller | user/board-detail one prediction lookup per tap', function(hooks) {
  standInGlobals(hooks, {
    appState: () => EmberObject.create({}),
    store: () => ({ peekRecord() { return null; }, peekAll() { return []; } }),
    persistence: () => ({ url_cache: {} })
  });

  lookupHarness(hooks);

  test('watched keys that change in the same turn start one lookup', async function(assert) {
    assert.expect(3);
    countLookups(this);
    const state = appState();
    const controller = buildModern(state);
    this.controllers.push(controller);

    /* Replacing the list changes five watched keys at once (the list, its membership, and three
       per-item keys); the language is a sixth. */
    tap(state, ['i', 'want']);
    state.set('vocalization_locale', 'en');
    await settled();

    assert.strictEqual(this.lookups.length, 1, 'the sentence was looked up once');
    assert.strictEqual(this.lookups[0].sentence, 'i want', 'for the sentence on screen');
    assert.deepEqual(controller.get('suggestions.list').map((s) => s.word), ['to'], 'and its words are on the rail');
  });

  test('the next word starts a new lookup', async function(assert) {
    assert.expect(2);
    countLookups(this);
    const state = appState();
    const controller = buildModern(state);
    this.controllers.push(controller);

    tap(state, ['i']);
    await settled();
    tap(state, ['i', 'want']);
    await settled();

    assert.strictEqual(this.lookups.length, 2, 'each new sentence is looked up');
    assert.strictEqual(this.lookups[1].sentence, 'i want', 'the second lookup carries the longer sentence');
  });

  test('clearing the sentence and tapping the same word again looks it up again', async function(assert) {
    assert.expect(3);
    countLookups(this);
    const state = appState();
    const controller = buildModern(state);
    this.controllers.push(controller);

    tap(state, ['i']);
    await settled();
    tap(state, []);
    await settled();
    assert.notOk(controller.get('suggestions'), 'guard: the clear blanked the rail');
    tap(state, ['i']);
    await settled();

    assert.strictEqual(this.lookups.length, 2, 'the repeat of an earlier sentence is not skipped as a duplicate');
    assert.deepEqual(controller.get('suggestions.list').map((s) => s.word), ['to'], 'and the rail is filled again');
  });

  test('turning prediction off and on again looks the sentence up again', async function(assert) {
    assert.expect(2);
    countLookups(this);
    const state = appState();
    const controller = buildModern(state);
    this.controllers.push(controller);

    tap(state, ['i']);
    await settled();
    state.set('referenced_user.preferences.word_suggestions', false);
    await settled();
    assert.notOk(controller.get('suggestions'), 'guard: switching prediction off blanked the rail');
    state.set('referenced_user.preferences.word_suggestions', true);
    await settled();

    assert.strictEqual(this.lookups.length, 2, 'the same sentence is looked up again once prediction is back on');
  });

  test('a change of language looks the same sentence up again', async function(assert) {
    assert.expect(2);
    countLookups(this);
    const state = appState();
    const controller = buildModern(state);
    this.controllers.push(controller);

    tap(state, ['quiero']);
    await settled();
    state.set('label_locale', 'es');
    await settled();

    assert.strictEqual(this.lookups.length, 2, 'the same words in another language are a different lookup');
    assert.strictEqual(this.lookups[1].locale, 'es', 'and it asks in the new language');
  });

  test('with AI on, a tap in the Modern view puts AI words on the rail with one AI request', async function(assert) {
    assert.expect(4);
    const requests = [];
    patch($, 'ajax', function(opts) {
      const d = { opts: opts };
      d.promise = new RSVP.Promise(function(resolve) { d.resolve = resolve; });
      requests.push(d);
      return d.promise;
    });
    patch(aiPredictor, 'is_enabled', function() { return true; });
    patch(aiPredictor, '_debounce_ms', 5);
    patch(aiPredictor, '_request_times', []);
    patch(aiPredictor, '_backoff_until', 0);
    aiPredictor.clear_cache();
    patch(wordSuggestions, 'lookup', function() {
      return RSVP.resolve([{ word: 'some', source: 'local' }, { word: 'me', source: 'local' }]);
    });
    patch(wordSuggestions, 'fetch_user_entries', function() { return RSVP.resolve([]); });
    patch(wordSuggestions, 'fallback_url', function() { return RSVP.resolve('data:,'); });
    patch(wordSuggestions, 'log_prediction_telemetry', function() {});

    const state = appState();
    /* The REAL mirror into sentence_parts here, so the later turn's lookup runs too and has to
       share the one AI request. */
    const modern = buildModern(state, true);
    /* The classic controller the Modern route keeps alive beside it, sharing the same state. */
    const classic = BoardIndexController.create({
      appState: state,
      model: EmberObject.create({ locale: 'en', name: 'Quick Core', translations: null }),
      stashes: stubService(),
      persistence: stubService(),
      router: stubService()
    });
    this.controllers.push(modern, classic);

    tap(state, ['i', 'want']);
    await waitUntil(() => requests.length > 0, { timeout: 2000 });
    await settled();
    assert.strictEqual(requests.length, 1, 'guard: one AI request went out for the tap');
    requests[0].resolve({ words: ['to', 'a'] });

    await waitUntil(() => {
      return (modern.get('suggestions.list') || []).some((s) => s.source === 'ai');
    }, { timeout: 2000, timeoutMessage: 'the Modern rail never showed an AI word' });

    const list = modern.get('suggestions.list');
    assert.deepEqual(list.filter((s) => s.source === 'ai').map((s) => s.word), ['to', 'a'], 'the AI words are on the Modern rail');
    assert.ok(list.some((s) => s.word === 'some'), 'alongside the built-in words');
    assert.strictEqual(requests.length, 1, 'and still only one AI request was made');
    aiPredictor.clear_cache();
  });
});

/* Its own module because swallowing the error needs a test context (setupOnerror). */
module('Unit | Controller | user/board-detail one prediction lookup per tap | after an error', function(hooks) {
  setupTest(hooks);
  lookupHarness(hooks);

  test('a lookup that throws does not stop later taps from being looked up', async function(assert) {
    assert.expect(2);
    countLookups(this);
    const state = appState();
    const controller = buildModern(state);
    this.controllers.push(controller);
    const real_context = controller._suggestion_lookup_context;
    let threw = false;
    controller._suggestion_lookup_context = function() { threw = true; throw new Error('boom'); };
    setupOnerror(function() {});
    try {
      tap(state, ['i']);
      await settled();
    } finally {
      resetOnerror();
    }
    assert.true(threw, 'guard: the first run threw');

    controller._suggestion_lookup_context = real_context;
    tap(state, ['i', 'want']);
    await settled();

    assert.strictEqual(this.lookups.length, 1, 'the next tap is still looked up');
  });
});
