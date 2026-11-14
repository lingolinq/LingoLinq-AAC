import { module, test } from 'qunit';
import EmberObject from '@ember/object';
import { setupTest } from '../../helpers';
import LingoLinq from 'frontend/app';

/* AFTER SAVING YOUR OWN SETTINGS, currentUser STAYS THE LIVE RECORD (section 24 of
 * docs/task-management/2026-11-10_offline-followup-proposals.md). A save returns the record it was called on; when
 * that is the same person as currentUser under the OTHER record ('self' vs the real id), assigning it would split
 * currentUser from sessionUser, so the live record is reloaded instead. The same record is re-pointed as before, and
 * a genuinely different person is left alone. The actions are called on stand-in contexts so the test reaches the
 * save handler without booting each controller. */
module('Unit | Controller | re-point currentUser after a save, backend ids', function(hooks) {
  setupTest(hooks);
  var priorAppState;
  hooks.beforeEach(function() { priorAppState = LingoLinq.appState; });
  hooks.afterEach(function() { LingoLinq.appState = priorAppState; });

  function live(id) {
    var rec = EmberObject.create({ id: id, global_id: '1_3', reloads: 0 });
    rec.reload = function() { rec.set('reloads', rec.get('reloads') + 1); return Promise.resolve(rec); };
    return rec;
  }
  // The record the page saved; `saved` is what its save resolves with, `done` settles after the handler ran.
  function page(id, gid) {
    var rec = EmberObject.create({ id: id, global_id: gid, preferences: { device: {}, progress: {} } });
    rec.save = function() { rec.done = Promise.resolve(rec); return rec.done; };
    return rec;
  }
  function action(context, name, act) {
    return context.owner.factoryFor('controller:' + name).class.proto().actions[act];
  }
  function stats_ctx(model) {
    return EmberObject.create({ model: model, load_charts: function() {} });
  }

  test('stats: saving the real-id record while currentUser is keyed self reloads the live record', async function(assert) {
    var me = live('self');
    LingoLinq.appState = EmberObject.create({ currentUser: me, sessionUser: me });
    var model = page('1_3', '1_3');
    action(this, 'user/stats', 'enable_geo_logging').call(stats_ctx(model));
    await model.done.then(function() {});
    assert.strictEqual(LingoLinq.appState.get('currentUser'), me, 'still the live record');
    assert.strictEqual(me.get('reloads'), 1);
  });

  test('stats: saving the live record itself re-points as before, without a reload', async function(assert) {
    var me = live('self');
    LingoLinq.appState = EmberObject.create({ currentUser: me, sessionUser: me });
    me.set('preferences', { device: {}, progress: {} });
    me.save = function() { me.done = Promise.resolve(me); return me.done; };
    action(this, 'user/stats', 'enable_geo_logging').call(stats_ctx(me));
    await me.done.then(function() {});
    assert.strictEqual(LingoLinq.appState.get('currentUser'), me);
    assert.strictEqual(me.get('reloads'), 0);
  });

  test('stats: saving a genuinely different person leaves currentUser alone', async function(assert) {
    var me = live('self');
    LingoLinq.appState = EmberObject.create({ currentUser: me, sessionUser: me });
    var model = page('1_7', '1_7');
    action(this, 'user/stats', 'enable_geo_logging').call(stats_ctx(model));
    await model.done.then(function() {});
    assert.strictEqual(LingoLinq.appState.get('currentUser'), me);
    assert.strictEqual(me.get('reloads'), 0);
  });

  test('preferences: saving the real-id record while currentUser is keyed self reloads the live record', async function(assert) {
    var me = live('self');
    LingoLinq.appState = EmberObject.create({ currentUser: me, sessionUser: me });
    var model = page('1_3', '1_3');
    var ctx = EmberObject.create({
      model: model,
      pending_preferences: { device: { voice: { pitch: '1', volume: '1' } } },
      original_preferences: { device: { voice: {} } },
      logging_pin: '1234',
      substitution_string: '',
      active_sidebar_options: [],
      euAiConsentRequired: false,
      check_core_words: function() {}
    });
    action(this, 'user/preferences', 'savePreferences').call(ctx, true);
    await model.done.then(function() {});
    assert.strictEqual(LingoLinq.appState.get('currentUser'), me, 'still the live record');
    assert.strictEqual(me.get('reloads'), 1);
  });

  function display_ctx(model, state) {
    return EmberObject.create({
      app_state: state,
      pending_display_prefs: { a: 2 },
      original_display_prefs: { a: 1 },
      _pref_user_for_display: function() { return model; },
      send: function() {}
    });
  }

  test('board-detail: saving display preferences on the real-id record while currentUser is keyed self reloads it', async function(assert) {
    var me = live('self');
    var state = EmberObject.create({ currentUser: me, sessionUser: me });
    var model = page('1_3', '1_3');
    action(this, 'user/board-detail', 'save_display_preferences').call(display_ctx(model, state));
    await model.done.then(function() {});
    assert.strictEqual(state.get('currentUser'), me, 'still the live record');
    assert.strictEqual(me.get('reloads'), 1);
  });

  test('board-detail: a genuinely different person leaves currentUser alone', async function(assert) {
    var me = live('self');
    var state = EmberObject.create({ currentUser: me, sessionUser: me });
    var model = page('1_7', '1_7');
    action(this, 'user/board-detail', 'save_display_preferences').call(display_ctx(model, state));
    await model.done.then(function() {});
    assert.strictEqual(state.get('currentUser'), me);
    assert.strictEqual(me.get('reloads'), 0);
  });
});
