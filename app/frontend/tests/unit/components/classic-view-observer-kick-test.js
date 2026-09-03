import { module, test } from 'qunit';
import EmberObject from '@ember/object';
import Service from '@ember/service';
import { setupTest } from '../../helpers';

/* The classic home page reuses Dashboard::AuthenticatedView's data hooks, several of
 * which are OBSERVERS. Observers do not run for a value that was already set when the
 * component was created, and `@model` is passed as an argument at creation time
 * (index.hbs), so nothing ever changes for them to observe.
 *
 * The modern dashboard never noticed: its template reads none of what those observers
 * produce. The classic template does — so each one the classic page depends on has to
 * be kicked once on insert, or the panel it feeds renders permanently empty.
 *
 * `reload_logs` (authenticated-view.js:617) is the one this file pins. It is the sole
 * writer of `logs`, which the classic Updates tab renders, and it also populates
 * `current_user_badges` from a second query — and because `current_user_badges` is a
 * dependent key of `update_current_badges` (:659-666), kicking reload_logs drives the
 * supervisee badge decoration too. That chain is why only one kick is added rather
 * than two.
 */
module('Unit | Component | classic-view observer kick', function(hooks) {
  setupTest(hooks);

  function setup(context, options) {
    var opts = options || {};
    var queries = [];
    context.owner.unregister('service:app-state');
    context.owner.register('service:app-state', Service.extend({
      currentUser: EmberObject.create({ preferences: {} })
    }));
    context.owner.unregister('service:persistence');
    context.owner.register('service:persistence', Service.extend({ online: opts.online !== false }));
    context.owner.unregister('service:store');
    context.owner.register('service:store', Service.extend({
      query: function(type, args) {
        queries.push({ type: type, args: args });
        return Promise.resolve([]);
      }
    }));

    var model = EmberObject.create({
      id: opts.modelId || '123',
      supporter_role: false,
      load_word_activities: function() { this.word_activities_loaded = true; }
    });
    var component = context.owner.factoryFor('component:dashboard/classic-view').create({ model: model });
    return { component: component, model: model, queries: queries };
  }

  test('inserting the classic view kicks reload_logs, so the Updates tab has data to render', function(assert) {
    var t = setup(this, {});
    assert.strictEqual(t.component.get('logs'), undefined, 'nothing has loaded before insert');

    t.component.didInsertElement();

    assert.ok(t.component.get('logs'), 'logs is populated (at minimum the loading marker)');
    assert.true(
      t.queries.some(function(q) { return q.type === 'log'; }),
      'a log query was actually issued'
    );
  });

  test('the same kick populates badges, which the Communicators tab renders', function(assert) {
    var t = setup(this, {});
    t.component.didInsertElement();
    assert.true(
      t.queries.some(function(q) { return q.type === 'badge'; }),
      'a badge query was issued, which feeds current_user_badges -> update_current_badges'
    );
  });

  // reload_logs guards on these itself; the kick must not bypass the guards.
  //
  // Scoped to log/badge deliberately: didInsertElement also kicks `update_selected`,
  // which issues its own `board` query, so asserting "no queries at all" would be
  // asserting something these guards were never meant to control.
  function logOrBadgeQueries(t) {
    return t.queries.filter(function(q) { return q.type === 'log' || q.type === 'badge'; });
  }

  test('offline does not fetch logs or badges', function(assert) {
    var t = setup(this, { online: false });
    t.component.didInsertElement();
    assert.deepEqual(logOrBadgeQueries(t), [], 'nothing is fetched while offline');
  });

  test('a cache-sentinel model id does not fetch logs or badges', function(assert) {
    var t = setup(this, { modelId: 'cache' });
    t.component.didInsertElement();
    assert.deepEqual(logOrBadgeQueries(t), [], 'the boards-cache sentinel is not a real user');
  });
});
