import { module, test } from 'qunit';
import EmberObject from '@ember/object';
import Service from '@ember/service';
import { setupTest } from '../../helpers';
import modal from 'frontend/utils/modal';

/* THE BASIC "SET AS HOME BOARD FOR <A>" FINISHES LIKE THE PICKER (2026-10-02, adversarial review,
 * requested: "fix 1"). After the copy, the board picker preloads the new home board's images before
 * opening it (components/board-preview-overlay.js _finishPickForHome) and syncs when online with
 * auto-sync on (controllers/board-picker.js _afterHomeBoardAssigned). The Basic button did neither,
 * so the opened board could arrive without its pictures cached.
 */
module('Unit | Component | basic-try-home-button finish', function(hooks) {
  setupTest(hooks);
  var realSuccess, realError;
  hooks.beforeEach(function() {
    realSuccess = modal.success; realError = modal.error;
    modal.success = function() {}; modal.error = function() {};
  });
  hooks.afterEach(function() { modal.success = realSuccess; modal.error = realError; });

  function setup(context, online) {
    var log = [];
    var slp = EmberObject.create({ id: '1_3', user_name: 'example' });
    var aiden = EmberObject.create({ id: '1_7', user_name: 'aiden_parker' });
    var home = EmberObject.create({ key: 'aiden_parker/core-60' });
    context.owner.unregister('service:app-state');
    context.owner.register('service:app-state', Service.extend({
      currentUser: slp, sessionUser: slp, label_locale: 'en',
      currentBoardState: { key: 'public/core-60' },
      basic_try_home: { key: 'public/core-60', user_id: '1_7', user_name: 'aiden_parker' }
    }));
    context.owner.unregister('service:store');
    context.owner.register('service:store', Service.extend({ findRecord: function() { return Promise.resolve(aiden); } }));
    context.owner.unregister('service:router');
    context.owner.register('service:router', Service.extend({ transitionTo: function(r, k) { log.push('open ' + k); } }));
    context.owner.unregister('service:persistence');
    context.owner.register('service:persistence', Service.extend({
      online: online, auto_sync: true,
      sync: function(who, a, b, reason) { log.push('sync ' + who + ' ' + reason); return Promise.resolve(); }
    }));
    var component = context.owner.factoryFor('component:basic-try-home-button').create({
      board: EmberObject.create({ key: 'public/core-60' }),
      copyAsHome: function() { return Promise.resolve(home); },
      preloadImages: function(b) { log.push('preload ' + b.get('key')); return Promise.resolve(); }
    });
    return { component: component, log: log };
  }

  test('online: preloads the new home board, syncs, then opens it', async function(assert) {
    assert.expect(1);
    var s = setup(this, true);
    await s.component.setAsHome();
    assert.deepEqual(s.log, ['preload aiden_parker/core-60', 'sync self home_board_changed', 'open aiden_parker/core-60']);
  });

  test('offline: preloads and opens, no sync', async function(assert) {
    assert.expect(1);
    var s = setup(this, false);
    await s.component.setAsHome();
    assert.deepEqual(s.log, ['preload aiden_parker/core-60', 'open aiden_parker/core-60']);
  });
});
