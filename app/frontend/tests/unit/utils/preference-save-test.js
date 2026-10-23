import { module, test } from 'qunit';
import RSVP from 'rsvp';
import EmberObject from '@ember/object';
import $ from 'jquery';
import { setupTest } from '../../helpers';
import LingoLinq from 'frontend/app';
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
      store.push({ data: { id: '1_77', type: 'user', attributes: { user_name: 'pkeys', preferences: { word_suggestions: false, ai_features_enabled: true } } } });
      var user = store.peekRecord('user', '1_77');
      user.set('preferences', { word_suggestions: true, ai_features_enabled: true });
      await save_listed_preferences(user, ['word_suggestions']);
      user.set('preferences', { word_suggestions: false, ai_features_enabled: true });
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
    assert.deepEqual(Object.keys(listed.preferences || {}), ['word_suggestions'], 'and sends only that preference');
    assert.false('preference_keys' in plain, 'a plain save names none');
  });

  test('the user serializer sends the list, and only when a save names one', function(assert) {
    var store = this.owner.lookup('service:store');
    var record = store.createRecord('user', { user_name: 'example', preferences: { word_suggestions: true, ai_features_enabled: true, progress: { guided_tours_autoshown: { a: true }, setup_done: true } } });
    var serializer = store.serializerFor('user');
    var plain = record._createSnapshot();
    assert.false('preference_keys' in serializer.serialize(plain, { includeId: true }), 'a plain save sends no list');
    var listed = record._createSnapshot();
    listed.adapterOptions = { preference_keys: ['word_suggestions'] };
    var sent = serializer.serialize(listed, { includeId: true });
    assert.deepEqual(sent.preference_keys, ['word_suggestions']);
    assert.deepEqual(sent.preferences, { word_suggestions: true }, 'the request carries only the listed preference');
    var tour = record._createSnapshot();
    tour.adapterOptions = { preference_keys: ['progress.guided_tours_autoshown'] };
    assert.deepEqual(serializer.serialize(tour, { includeId: true }).preferences, { progress: { guided_tours_autoshown: { a: true } } }, 'one progress map, alone');
    var offline = record._createSnapshot();
    offline.adapterOptions = { preference_keys: ['word_suggestions'] };
    var local = serializer.serialize(offline, { includeId: true, localCopy: true });
    assert.deepEqual(local.preference_keys, ['word_suggestions'], 'and keeps it in the offline local copy');
    assert.true('ai_features_enabled' in (local.preferences || {}), 'whose preferences stay whole (it is the record\'s local copy)');
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

    test('keep_queued_keys reads the waiting copy by the id it is stored under, and fails whole', async function(assert) {
      var storage = window.lingoLinqExtras.storage;
      var original_find = storage.find_all;
      var lookups = [];
      var answer;
      var run = function(reply, record) {
        answer = reply;
        return keep_queued_keys(Object.keys(record)[0], record).then(function() { return record; });
      };
      storage.find_all = function(store, ids) { lookups.push([store, ids]); return answer(); };
      var whole, none, failed, board, board_lookups;
      try {
        whole = await run(function() { return RSVP.resolve([{ data: { id: 'self', raw: { id: 'self', changed: true } } }]); },
          { user: { id: 'self', changed: true, preference_keys: ['word_suggestions'] } });
        none = await run(function() { return RSVP.resolve([]); },
          { user: { id: 'self', changed: true, preference_keys: ['word_suggestions'] } });
        failed = await run(function() { return RSVP.reject({ error: 'database not ready' }); },
          { user: { id: 'self', changed: true, preference_keys: ['word_suggestions'] } });
        board_lookups = lookups.length;
        board = await run(null, { board: { id: '1_1', changed: true } });
      } finally {
        storage.find_all = original_find;
      }
      assert.deepEqual(lookups[0], ['user', ['self']], "the 'self' row itself, by id");
      assert.false('preference_keys' in whole.user, 'a whole save was waiting: replay whole');
      assert.deepEqual(none.user.preference_keys, ['word_suggestions'], 'nothing waiting');
      assert.false('preference_keys' in failed.user, 'an unknown failure keeps the replay whole');
      assert.strictEqual(lookups.length, board_lookups, 'other records are not looked up');
      assert.deepEqual(board, { board: { id: '1_1', changed: true } }, 'and are untouched');
    });

    /* Through the real adapter and local storage (adversary review, 2026-10-22): the session user's offline
       copy is stored under 'self', and an earlier lookup through persistence.find read the real-id row instead,
       so a listed save overwrote a whole save still waiting and the replay dropped its changes. */
    test("two offline saves of the signed-in user: a whole one waiting keeps the replay whole", async function(assert) {
      var store = this.owner.lookup('service:store');
      var persistence = this.owner.lookup('service:persistence');
      var storage = window.lingoLinqExtras.storage;
      var original_online = persistence.get('online');
      var original_real_lookup = queryLog.real_lookup;
      var row = function() {
        return RSVP.resolve(storage.find_all('user', ['self'])).then(function(list) {
          var item = (list || [])[0];
          var r = item ? (item.data || item) : null;
          return r ? (r.raw || r) : null;
        }, function() { return null; });
      };
      queryLog.real_lookup = true;
      persistence.set('online', false);
      var whole, listed;
      try {
        await RSVP.resolve(storage.remove('user', 'self')).then(null, function() { });
        store.push({ data: { id: 'self', type: 'user', attributes: { user_name: 'pkself', preferences: { word_suggestions: false, skin: 'default' } } } });
        var user = store.peekRecord('user', 'self');
        user.set('preferences', { word_suggestions: false, skin: 'dark' });
        await user.save();
        whole = await row();
        user.set('preferences', { word_suggestions: true, skin: 'dark' });
        await save_listed_preferences(user, ['word_suggestions']);
        listed = await row();
      } finally {
        await RSVP.resolve(storage.remove('user', 'self')).then(null, function() { });
        queryLog.real_lookup = original_real_lookup;
        persistence.set('online', original_online);
      }
      assert.true(!!(whole && whole.changed), 'the whole save is waiting under self');
      assert.false('preference_keys' in (whole || {}), 'with no list');
      assert.true(!!(listed && listed.changed), 'the listed save replaced the copy');
      assert.strictEqual((listed && listed.preferences || {}).skin, 'dark', "it carries the whole save's change");
      assert.false('preference_keys' in (listed || {}), 'and no list, so the replay sends it all');
    });

    /* The call site: sync_changed (services/persistence.js) replays each queued copy with record.save(). */
    test('sync_changed replays a queued user copy with its list, and one without as a plain save', async function(assert) {
      var persistence = this.owner.lookup('service:persistence');
      var original_find = LingoLinq.store.findRecord;
      var saves = [];
      function fake(id) {
        return { id: id, get: function(k) { return k === 'id' ? id : null; }, setProperties: function() {}, save: function(options) { saves.push([id, options]); return RSVP.resolve(this); } };
      }
      persistence.find_changed = function() {
        return RSVP.resolve([
          { store: 'user', data: { raw: { user: { id: '1_77', changed: true, preference_keys: ['word_suggestions'] } } } },
          { store: 'user', data: { raw: { user: { id: '1_78', changed: true } } } }
        ]);
      };
      persistence.queue_sync_action = function(action, sync_id, method) { return method(); };
      LingoLinq.store.findRecord = function(type, id) { return RSVP.resolve(fake(id)); };
      try {
        await persistence.sync_changed().then(null, function() { });
      } finally {
        LingoLinq.store.findRecord = original_find;
      }
      saves.sort(function(a, b) { return a[0] < b[0] ? -1 : 1; });
      assert.deepEqual(saves, [['1_77', { adapterOptions: { preference_keys: ['word_suggestions'] } }], ['1_78', undefined]]);
    });

    test('the replay saves with the stored list, or as a plain save', function(assert) {
      assert.deepEqual(replay_save_options({ id: 'self', changed: true, preference_keys: ['word_suggestions'] }), { adapterOptions: { preference_keys: ['word_suggestions'] } });
      assert.strictEqual(replay_save_options({ id: 'self', changed: true }), undefined);
      assert.strictEqual(replay_save_options(null), undefined);
    });
  });
});
