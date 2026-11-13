import { module, test } from 'qunit';
import EmberObject from '@ember/object';
import Service from '@ember/service';
import RSVP from 'rsvp';
import { settled } from '@ember/test-helpers';
import { setupTest } from 'frontend/tests/helpers';
import { standInGlobals } from 'frontend/tests/helpers/stand-in-globals';
import { stub, restoreStubs } from 'frontend/tests/helpers/jasmine';
import modal from 'frontend/utils/modal';
import RecordNote from 'frontend/components/record-note';
import QuickAssessment from 'frontend/components/quick-assessment';
import NewGoal from 'frontend/components/new-goal';
import SaveSnapshot from 'frontend/components/save-snapshot';
import AddTool from 'frontend/components/add-tool';
import ModelingIdeas from 'frontend/components/modeling-ideas';

/* The session user can be held by an Ember Data record keyed 'self' (network load; the real id is in
 * `_actual_id`, serializers/application.js). The server rewrites a top-level `user_id=self`, but not one
 * nested in a body (log[user_id], goal[user_id], snapshot[user_id], integration[user_id],
 * events[].user_id, recipient_global_ids), where 'self' 404s or the event is dropped
 * (LogSession.process_as_follow_on). Each payload below must carry the backend id. Section 24 of
 * docs/task-management/2026-11-10_offline-followup-proposals.md. */
function self_record() {
  return EmberObject.create({ id: 'self', global_id: '1_3', user_name: 'test-me' });
}
function other_record() {
  return EmberObject.create({ id: '1_9', global_id: '1_9', user_name: 'test-other' });
}
function pending() {
  return new RSVP.Promise(function() {});
}
function capturing_store(made) {
  return {
    createRecord(type, attrs) {
      const rec = EmberObject.create(Object.assign({ _type: type }, attrs || {}));
      rec.save = pending;
      made.push(rec);
      return rec;
    }
  };
}

module('Unit | backend id | log, goal, snapshot and integration payloads', function(hooks) {
  setupTest(hooks);
  standInGlobals(hooks, {
    stashes: () => EmberObject.create({
      logged: [],
      log_event(obj, user_id) { this.logged.push({ obj: obj, user_id: user_id }); return obj; },
      push_log() {},
      track_daily_event() {},
      persist() {}
    }),
    persistence: () => EmberObject.create({ online: false }),
    appState: () => EmberObject.create({ sessionUser: self_record() }),
    store: () => ({ made: [], createRecord(type, attrs) { const r = EmberObject.create(attrs || {}); this.made.push(r); return r; } })
  });
  hooks.afterEach(function() { restoreStubs(); });

  test('record-note: the online log[user_id] is the backend id, not self', function(assert) {
    const made = [];
    const ctx = EmberObject.create({ note: 'hi', model: self_record(), notify: false,
      persistence: EmberObject.create({ online: true }), store: capturing_store(made), modal: { close() {} } });
    RecordNote.proto().actions.saveNote.call(ctx, 'text');
    assert.strictEqual(made[0].get('user_id'), '1_3');
  });

  test('record-note: the offline note event carries the backend id; another person keeps theirs', function(assert) {
    const ctx = EmberObject.create({ note: 'hi', model: self_record(), notify: false,
      persistence: EmberObject.create({ online: false }), store: capturing_store([]), modal: { close() {} } });
    RecordNote.proto().actions.saveNote.call(ctx, 'text');
    ctx.set('model', other_record());
    RecordNote.proto().actions.saveNote.call(ctx, 'text');
    assert.deepEqual(this.standIns.stashes.logged.map((l) => l.user_id), ['1_3', '1_9']);
  });

  test('quick-assessment: log[user_id] online and the offline event both use the backend id', function(assert) {
    stub(modal, 'close', function() {});
    stub(modal, 'error', function() {});
    const made = [];
    const ctx = EmberObject.create({ description: 'x', tallies: {}, totals: {}, model: { user: self_record() }, store: capturing_store(made) });
    this.standIns.persistence.set('online', true);
    QuickAssessment.proto().actions.record_assessment.call(ctx);
    assert.strictEqual(made[0].get('user_id'), '1_3', 'online');
    this.standIns.persistence.set('online', false);
    QuickAssessment.proto().actions.record_assessment.call(ctx);
    ctx.set('model', { user: other_record() });
    QuickAssessment.proto().actions.record_assessment.call(ctx);
    assert.deepEqual(this.standIns.stashes.logged.map((l) => l.user_id), ['1_3', '1_9'], 'offline');
  });

  test('new-goal: each goal[user_id] is the backend id; a supervisee keeps theirs', function(assert) {
    const made = [];
    const ctx = EmberObject.create({
      goal: EmberObject.create({}),
      model: { users: [Object.assign(self_record(), { add_goal: true }), { id: '1_9', add_goal: true }] },
      store: capturing_store(made),
      serializedGoalAttributesForNewSave() { return { summary: 'g' }; }
    });
    NewGoal.proto().actions.save_goal.call(ctx);
    assert.deepEqual(made.map((g) => g.get('user_id')), ['1_3', '1_9']);
  });

  test('new-goal: the single-user goal is saved under the backend id', function(assert) {
    const made = [];
    const ctx = EmberObject.create({ goal: EmberObject.create({}), model: { user: self_record() }, store: capturing_store(made),
      serializedGoalAttributesForNewSave() { return {}; } });
    NewGoal.proto().actions.save_goal.call(ctx);
    assert.strictEqual(made[0].get('user_id'), '1_3');
    assert.strictEqual(ctx.get('goal.user_id'), '1_3');
  });

  test('save-snapshot: snapshot[user_id] is the backend id; another person keeps theirs', function(assert) {
    const ctx = EmberObject.create({ model: { user: self_record(), usage_stats: {} }, default_snapshot_name: 'n', load_snapshots() {} });
    SaveSnapshot.proto().opening.call(ctx);
    assert.strictEqual(ctx.get('snapshot.user_id'), '1_3');
    ctx.set('model', { user: other_record(), usage_stats: {} });
    SaveSnapshot.proto().opening.call(ctx);
    assert.strictEqual(ctx.get('snapshot.user_id'), '1_9');
  });

  test('add-tool: integration[user_id] is the backend id; another person keeps theirs', function(assert) {
    const made = [];
    const ctx = EmberObject.create({ selected_tool: EmberObject.create({ integration_key: 'k' }), user_parameters: [],
      model: { user: self_record() }, store: capturing_store(made) });
    AddTool.proto().actions.install.call(ctx);
    ctx.set('model', { user: other_record() });
    AddTool.proto().actions.install.call(ctx);
    assert.deepEqual(made.map((i) => i.get('user_id')), ['1_3', '1_9']);
  });

  test('import-board-recipients: the session user row sends the backend id as a recipient', async function(assert) {
    assert.expect(1);
    this.owner.register('service:modal', Service.extend({ getSettingsFor() { return {}; } }));
    const me = self_record();
    me.set('known_supervisees', [{ id: '1_9', user_name: 'test-other', edit_permission: true }]);
    // Its own app state, so no app-wide observer runs against this module's stand-in globals.
    const Fake = this.owner.factoryFor('component:import-board-recipients').class.extend({ appState: EmberObject.create({ sessionUser: me }) });
    this.owner.register('component:import-board-recipients-under-test', Fake);
    const comp = this.owner.factoryFor('component:import-board-recipients-under-test').create();
    assert.deepEqual(comp.get('recipient_rows').map((r) => r.get('global_id')), ['1_3', '1_9']);
    await settled();
  });
});

module('Unit | backend id | modeling ideas', function(hooks) {
  setupTest(hooks);
  standInGlobals(hooks, {
    appState: () => EmberObject.create({
      sessionUser: self_record(),
      currentUser: EmberObject.create({
        logged: [],
        log_word_activity(opts) { this.logged.push(opts); },
        preferences: { progress: { modeling_ideas_viewed: true, modeling_ideas_target_words_reviewed: true } }
      })
    })
  });
  hooks.beforeEach(function() {
    this.owner.register('service:modal', Service.extend({}));
    this.owner.register('service:router', Service.extend({}));
  });

  function activity(id, user_ids) {
    return { id: id, user_ids: user_ids, type: 'emergent_words', word: 'go' };
  }
  function ids_of(comp) {
    return comp.get('user_activities').filter((a) => a.id).map((a) => a.id);
  }

  test('user_activities: the session user\'s self-keyed record matches activities for its backend id', function(assert) {
    const comp = this.owner.factoryFor('component:modeling-ideas').create({ weekhour: 0,
      model: { users: [self_record()] }, activities: { list: [activity('a1', ['1_3'])] } });
    assert.deepEqual(ids_of(comp), ['a1']);
  });

  test('user_activities: another person still matches only their own activities', function(assert) {
    const comp = this.owner.factoryFor('component:modeling-ideas').create({ weekhour: 0,
      model: { users: [other_record()] }, activities: { list: [activity('a1', ['1_3']), activity('a2', ['1_9'])] } });
    assert.deepEqual(ids_of(comp), ['a2']);
  });

  test('user_activities: a dismissal logged earlier under self still skips the activity', function(assert) {
    const comp = this.owner.factoryFor('component:modeling-ideas').create({ weekhour: 0,
      model: { users: [self_record()] },
      activities: { list: [activity('a1', ['1_3'])], local_log: [{ modeling_activity_id: 'a1', modeling_user_ids: ['self'], modeling_action: 'dismiss', timestamp: 1 }] } });
    assert.deepEqual(ids_of(comp), []);
  });

  test('user_words: words for the backend id are matched for the self-keyed record', function(assert) {
    const comp = this.owner.factoryFor('component:modeling-ideas').create({
      model: { users: [self_record()] }, activities: { words: [{ word: 'go', reasons: ['fallback'], user_ids: ['1_3'] }] } });
    assert.strictEqual((comp.get('user_words') || []).length, 1);
  });

  test('attempt, dismiss and complete log modeling_user_ids as backend ids', function(assert) {
    const ctx = EmberObject.create({ model: { users: [self_record(), other_record()] }, current_activity: EmberObject.create({ id: 'a1', word: 'go' }) });
    const actions = ModelingIdeas.proto().actions;
    actions.attempt.call(ctx);
    actions.dismiss.call(ctx);
    actions.complete.call(ctx, 2);
    const logged = this.standIns.appState.get('currentUser.logged');
    assert.deepEqual(logged.map((l) => l.modeling_user_ids), [['1_3', '1_9'], ['1_3', '1_9'], ['1_3', '1_9']]);
  });
});
