import { module, test } from 'qunit';
import Service from '@ember/service';
import EmberObject from '@ember/object';
import { setupTest } from '../../helpers';
import { settled } from '@ember/test-helpers';

/* Boards card previews are cached ACROSS navigation (stale-while-revalidate, 2026-10-13). The
   dashboard component is rebuilt on every home/extras/index arrival, so without this the Boards div
   re-fetched from scratch and showed a loading state for several seconds. A second instance for the
   same user seeds its previews from the module cache synchronously (boardsLoading stays false before
   its own fetch resolves), and the background fetch still runs and overwrites with the fresh result. */
module('Unit | Component | dashboard preview-boards cache', function(hooks) {
  setupTest(hooks);

  function board(id) { return EmberObject.create({ id: id, key: 'u/' + id }); }

  function mk(context, userId, queryResult) {
    context.owner.unregister('service:app-state');
    context.owner.register('service:app-state', Service.extend({
      currentUser: EmberObject.create({ id: userId, user_name: 'u', preferences: {}, supervisees: [] }),
      feature_flags: {}
    }));
    context.owner.unregister('service:store');
    context.owner.register('service:store', Service.extend({
      query: function() { return Promise.resolve(queryResult.slice()); },
      peekAll: function() { return []; }, peekRecord: function() { return null; }
    }));
    context.owner.unregister('service:persistence');
    context.owner.register('service:persistence', Service.extend({
      meta: function() { return { more: false }; },
      get: function() { return true; }
    }));
    return context.owner.factoryFor('component:dashboard/authenticated-view').create();
  }

  test('a second instance seeds previews from the cache (no loading flash), then revalidates', async function(assert) {
    // Unique id so the module-scoped cache cannot collide with other tests or reruns.
    var uid = 'cache_user_' + Math.random().toString(36).slice(2);

    var first = mk(this, uid, [board('1'), board('2')]);
    first._loadPreviewBoards();
    await settled();
    assert.strictEqual((first.get('_fetchedPreviewBoards') || []).length, 2, 'first instance fetched and populated the cache');

    // Second instance for the SAME user — a return to the dashboard. Its fetch returns a THIRD board.
    var second = mk(this, uid, [board('1'), board('2'), board('3')]);
    second._loadPreviewBoards();
    assert.strictEqual((second.get('_fetchedPreviewBoards') || []).length, 2, 'seeded from the cache synchronously, before its own fetch resolves');
    assert.strictEqual(second.get('boardsLoading'), false, 'no loading flash on return');
    await settled();
    assert.strictEqual((second.get('_fetchedPreviewBoards') || []).length, 3, 'then revalidated to the fresh result');
  });

  test('a different user does not see another user\'s cached previews', async function(assert) {
    var uidA = 'cache_user_' + Math.random().toString(36).slice(2);
    var uidB = 'cache_user_' + Math.random().toString(36).slice(2);
    var a = mk(this, uidA, [board('1'), board('2')]);
    a._loadPreviewBoards();
    await settled();

    var b = mk(this, uidB, [board('9')]);
    b._loadPreviewBoards();
    assert.strictEqual(b.get('_fetchedPreviewBoards') || null, null, 'no cross-user seed (B has no cache yet)');
    await settled();
    assert.strictEqual((b.get('_fetchedPreviewBoards') || []).length, 1, 'B gets its own result');
  });
});
