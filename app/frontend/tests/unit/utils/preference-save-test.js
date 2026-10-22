import { module, test } from 'qunit';
import RSVP from 'rsvp';
import EmberObject from '@ember/object';
import $ from 'jquery';
import { setupTest } from '../../helpers';
import { queryLog } from 'frontend/tests/helpers/ember_helper';
import { save_listed_preferences, queued_preference_keys, replay_save_options, keep_queued_keys } from 'frontend/utils/preference_save';
import { set_word_prediction } from 'frontend/utils/word_prediction_pref';
import { mark_tour_progress } from 'frontend/utils/tours/tour_progress';
import { mark_tour_offered } from 'frontend/utils/tours/tour_offer';

/* SAVES THAT NAME WHAT THEY CHANGED (Scot's review of #1141, 2026-10-15; issue #1134). A small change
 * (the Prediction toggle, a tour marked as offered, shown or completed) used to save the whole record,
 * and the server wrote every key it was sent, so a device holding an old copy could switch AI consent
 * back on. These saves now name their keys (`preference_keys`), the server applies only those
 * (spec/models/user_preference_keys_spec.rb), and an offline save keeps its list through the replay. */
module('Unit | Utility | saves that name the preference keys they changed', function(hooks) {
  setupTest(hooks);

  function userStub(prefs) {
    var saves = [];
    var u = EmberObject.extend({
      save: function(options) { saves.push(options); return RSVP.resolve(this); }
    }).create({ preferences: prefs });
    u.saves = saves;
    return u;
  }

  test('save_listed_preferences names the keys on this save only', function(assert) {
    var u = userStub({});
    var keys = ['word_suggestions'];
    save_listed_preferences(u, keys);
    keys.push('changed later');
    assert.deepEqual(u.saves, [{ adapterOptions: { preference_keys: ['word_suggestions'] } }]);
  });

  /* Through the real chain (review 2026-10-22): models/base.js#save used to call `this._super()` with no
     arguments, so the adapterOptions never reached Ember Data and no list was sent. A real record, the real
     adapter and the app's $.ajax wrapper; only the network ($.realAjax) is replaced. */
  test('a real save sends preference_keys in the PUT body, and a plain save does not', async function(assert) {
    var store = this.owner.lookup('service:store');
    var persistence = this.owner.lookup('service:persistence');
    var original_online = persistence.get('online');
    var original_real = $.realAjax;
    var bodies = [];
    var original_real_lookup = queryLog.real_lookup;
    queryLog.real_lookup = true; // the test adapter (tests/helpers/ember_helper.js) passes through to the real one
    persistence.set('online', true);
    $.realAjax = function(options) {
      if (options.type === 'PUT' && /\/api\/v1\/users\/1_77/.test(options.url)) { bodies.push(typeof options.data === 'string' ? JSON.parse(options.data) : options.data); }
      return RSVP.resolve({ user: { id: '1_77', user_name: 'pkeys', preferences: { word_suggestions: true } } });
    };
    try {
      store.push({ data: { id: '1_77', type: 'user', attributes: { user_name: 'pkeys', preferences: { word_suggestions: false } } } });
      var user = store.peekRecord('user', '1_77');
      user.set('preferences', { word_suggestions: true });
      await save_listed_preferences(user, ['word_suggestions']);
      user.set('preferences', { word_suggestions: false });
      await user.save();
    } finally {
      $.realAjax = original_real;
      queryLog.real_lookup = original_real_lookup;
      persistence.set('online', original_online);
    }
    var listed = (bodies[0] || {}).user || {};
    var plain = (bodies[1] || {}).user || {};
    assert.strictEqual(bodies.length, 2, 'two PUTs');
    assert.deepEqual(listed.preference_keys, ['word_suggestions'], 'the listed save names its key');
    assert.false('preference_keys' in plain, 'a plain save names none');
  });

  test('the user serializer sends the list, and only when a save names one', function(assert) {
    var store = this.owner.lookup('service:store');
    var record = store.createRecord('user', { user_name: 'example', preferences: { word_suggestions: true } });
    var serializer = store.serializerFor('user');
    var plain = record._createSnapshot();
    assert.false('preference_keys' in serializer.serialize(plain, { includeId: true }), 'a plain save sends no list');
    var listed = record._createSnapshot();
    listed.adapterOptions = { preference_keys: ['word_suggestions'] };
    assert.deepEqual(serializer.serialize(listed, { includeId: true }).preference_keys, ['word_suggestions']);
    var offline = record._createSnapshot();
    offline.adapterOptions = { preference_keys: ['word_suggestions'] };
    assert.deepEqual(serializer.serialize(offline, { includeId: true, localCopy: true }).preference_keys, ['word_suggestions'], 'and keeps it in the offline local copy');
  });

  test('the Prediction toggle saves only word_suggestions', async function(assert) {
    var u = userStub({ word_suggestions: false, device: {} });
    var appState = EmberObject.create({ currentUser: u, open_speak_mode_exit_pin: function() { return RSVP.resolve({ correct_pin: true }); } });
    set_word_prediction(appState, true);
    await RSVP.resolve(); await RSVP.resolve();
    assert.true(u.get('preferences.word_suggestions'));
    assert.deepEqual(u.saves, [{ adapterOptions: { preference_keys: ['word_suggestions'] } }]);
  });

  test('a tour mark saves only its own progress map, from fresh copies', function(assert) {
    var completed = { home_gentle: true };
    var progress = { guided_tours_completed: completed };
    var prefs = { progress: progress, ai_features_enabled: true };
    var u = userStub(prefs);
    assert.true(mark_tour_progress(u, 'guided_tours_completed', 'boards'));
    assert.deepEqual(u.saves, [{ adapterOptions: { preference_keys: ['progress.guided_tours_completed'] } }]);
    assert.deepEqual(u.get('preferences.progress.guided_tours_completed'), { home_gentle: true, boards: true });
    assert.notStrictEqual(u.get('preferences'), prefs, 'a new preferences object, so Ember Data sees the change');
    assert.deepEqual(completed, { home_gentle: true }, 'the old map is not changed in place');
    assert.false(mark_tour_progress(u, 'guided_tours_completed', 'boards'), 'already recorded');
    assert.strictEqual(u.saves.length, 1, 'no second save');
  });

  test('the tour offer saves only the autoshown map', function(assert) {
    var u = userStub({ progress: {} });
    mark_tour_offered(u);
    assert.deepEqual(u.saves, [{ adapterOptions: { preference_keys: ['progress.guided_tours_autoshown'] } }]);
    assert.true(u.get('preferences.progress.guided_tours_autoshown.tour_offer'));
  });

  module('offline', function() {
    test('a queued copy keeps the list when nothing else is waiting', function(assert) {
      assert.deepEqual(queued_preference_keys(null, ['word_suggestions']), ['word_suggestions']);
      assert.deepEqual(queued_preference_keys({ id: 'self', changed: false }, ['word_suggestions']), ['word_suggestions'], 'an already-synced copy is not waiting');
    });

    test('a whole save already waiting keeps the replay whole', function(assert) {
      assert.strictEqual(queued_preference_keys({ id: 'self', changed: true }, ['word_suggestions']), null,
        "otherwise the earlier save's other changes would be cut down to this key");
    });

    test('two listed saves waiting replay both lists', function(assert) {
      assert.deepEqual(queued_preference_keys({ id: 'self', changed: true, preference_keys: ['progress.guided_tours_autoshown'] }, ['word_suggestions', 'progress.guided_tours_autoshown']),
        ['progress.guided_tours_autoshown', 'word_suggestions']);
    });

    test('keep_queued_keys sets the list on the copy it is about to store', async function(assert) {
      var waiting = { id: 'self', changed: true };
      var lookups = [];
      var persistence = { find: function(store, id) { lookups.push([store, id]); return RSVP.resolve(waiting); } };
      var record = { user: { id: 'self', changed: true, preference_keys: ['word_suggestions'] } };
      await keep_queued_keys(persistence, 'user', record);
      assert.deepEqual(lookups, [['user', 'self']], 'the copy waiting for this user is read');
      assert.false('preference_keys' in record.user, 'a whole save was waiting: replay whole');
      waiting = null;
      persistence.find = function() { return RSVP.reject({ error: 'record not found' }); };
      record = { user: { id: 'self', changed: true, preference_keys: ['word_suggestions'] } };
      await keep_queued_keys(persistence, 'user', record);
      assert.deepEqual(record.user.preference_keys, ['word_suggestions'], 'nothing waiting');
      var board = { board: { id: '1_1', changed: true } };
      var board_lookups = 0;
      await keep_queued_keys({ find: function() { board_lookups++; return RSVP.resolve(null); } }, 'board', board);
      assert.strictEqual(board_lookups, 0, 'not looked up');
      assert.deepEqual(board, { board: { id: '1_1', changed: true } }, 'other records untouched');
    });

    test('the replay saves with the stored list, or as a plain save', function(assert) {
      assert.deepEqual(replay_save_options({ id: 'self', changed: true, preference_keys: ['word_suggestions'] }), { adapterOptions: { preference_keys: ['word_suggestions'] } });
      assert.strictEqual(replay_save_options({ id: 'self', changed: true }), undefined);
      assert.strictEqual(replay_save_options(null), undefined);
    });
  });
});
