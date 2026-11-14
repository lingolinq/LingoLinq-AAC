import { module, test } from 'qunit';
import EmberObject from '@ember/object';
import Service from '@ember/service';
import { settled } from '@ember/test-helpers';
import { setupTest } from 'frontend/tests/helpers';
import { standInGlobals } from 'frontend/tests/helpers/stand-in-globals';
import Inbox from 'frontend/components/inbox';
import AssessmentSettings from 'frontend/components/assessment-settings';

/* The session user can be held by a record keyed 'self' (network load) and by one keyed by the real
 * global id ('1_3'), so comparisons and stored ids must use backend ids. Section 24 of
 * docs/task-management/2026-11-10_offline-followup-proposals.md. */
function self_record() {
  return EmberObject.create({ id: 'self', global_id: '1_3', user_name: 'test-me' });
}
function other_record() {
  return EmberObject.create({ id: '1_9', global_id: '1_9', user_name: 'test-other' });
}

module('Unit | backend id | focus words, inbox, eval settings, board ideas', function(hooks) {
  setupTest(hooks);
  standInGlobals(hooks, {
    stashes: () => EmberObject.create({
      logged: [],
      persisted: {},
      last_focus_words: null,
      log_event(obj, user_id) { this.logged.push({ obj: obj, user_id: user_id }); return obj; },
      push_log() {},
      persist(key, value) { this.persisted[key] = value; }
    }),
    appState: () => EmberObject.create({ sessionUser: self_record(), referenced_user: self_record(), quick_users: {} }),
    store: () => ({ peekRecord() { return null; } })
  });
  hooks.beforeEach(function() {
    this.owner.register('service:modal', Service.extend({}));
    this.owner.register('service:router', Service.extend({}));
    this.owner.register('service:app-state', Service.extend({}));
  });

  function focus_words(owner) {
    return owner.factoryFor('component:focus-words').create({ model: { user: { focus_words: {} } } });
  }
  function recent_titles(comp) {
    return comp.get('recent_list').filter((r) => r.tmp).map((r) => r.title);
  }

  test('focus-words: the last-set stash is written with the backend id', function(assert) {
    const comp = focus_words(this.owner);
    comp.set('words', 'go, stop');
    comp.set('title', 'Set');
    comp.stash_set();
    assert.strictEqual(this.standIns.stashes.persisted.last_focus_words.user_id, '1_3');
  });

  test('focus-words: a stash under the real id or an older self stash is offered; another person\'s is not', function(assert) {
    this.standIns.stashes.set('last_focus_words', { user_id: '1_3', words: 'a', title: 'real' });
    assert.deepEqual(recent_titles(focus_words(this.owner)), ['real']);
    this.standIns.stashes.set('last_focus_words', { user_id: 'self', words: 'b', title: 'older' });
    assert.deepEqual(recent_titles(focus_words(this.owner)), ['older']);
    this.standIns.stashes.set('last_focus_words', { user_id: '1_9', words: 'c', title: 'theirs' });
    assert.deepEqual(recent_titles(focus_words(this.owner)), []);
  });

  test('inbox: clearing an alert logs the backend id in the event and the alert', function(assert) {
    const alert = EmberObject.create({ id: 'al1' });
    const ctx = EmberObject.create({ alerts: [alert], update_inbox() {} });
    Inbox.proto().actions.clear.call(ctx, alert);
    const logged = this.standIns.stashes.logged[0];
    assert.strictEqual(logged.user_id, '1_3');
    assert.strictEqual(logged.obj.alert.user_id, '1_3');
  });

  test('inbox: alerts for another referenced person keep that person\'s id', function(assert) {
    this.standIns.appState.set('referenced_user', other_record());
    const alert = EmberObject.create({ id: 'al1' });
    const ctx = EmberObject.create({ alerts: [alert], update_inbox() {} });
    Inbox.proto().actions.clear.call(ctx, alert);
    const logged = this.standIns.stashes.logged[0];
    assert.strictEqual(logged.user_id, '1_9');
    assert.strictEqual(logged.obj.alert.user_id, '1_9');
  });

  test('assessment-settings: an eval target holding the session user\'s real id is normalised to self', function(assert) {
    function open_with(for_user) {
      const ctx = EmberObject.create({
        modal: { setComponent() {} },
        appState: EmberObject.create({ sessionUser: self_record(), currentUser: self_record() }),
        model: { assessment: { user_id: for_user.user_id, for_user: for_user } }
      });
      AssessmentSettings.proto().actions.opening.call(ctx);
      return ctx.get('settings.for_user.user_id');
    }
    assert.strictEqual(open_with({ user_id: '1_3', user_name: 'test-me' }), 'self');
    assert.strictEqual(open_with({ user_id: '1_9', user_name: 'test-other' }), '1_9');
  });

  test('button-suggestions: self finds the session user when no record is keyed self', async function(assert) {
    const comp = this.owner.factoryFor('component:button-suggestions').create({ for_user_id: 'self' });
    comp.update_user();
    assert.strictEqual(comp.get('user.global_id'), '1_3');
    comp.set('for_user_id', '1_9');
    comp.update_user();
    assert.strictEqual(comp.get('user'), null, 'an unknown other person is not replaced by the session user');
    await settled();
  });
});
