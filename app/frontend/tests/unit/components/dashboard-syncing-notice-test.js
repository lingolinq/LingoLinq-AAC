import { module, test } from 'qunit';
import { setupTest } from '../../helpers';
import EmberObject from '@ember/object';
import lingoLinqExtras from 'frontend/utils/extras';
import { stub, restoreStubs } from 'frontend/tests/helpers/jasmine';

/* THE MODERN HOME PAGE SAYS A SYNC IS RUNNING, AND HOW FAR IT HAS GOT (item 8, PR #1268).
 * components/dashboard/authenticated-view.js#syncing_notice and #sync_progress_line; Basic's home card
 * (classic-view extends this component) and the rail share the line.
 */
module('Unit | Component | dashboard syncing notice', function(hooks) {
  setupTest(hooks);

  hooks.beforeEach(function() {
    this.persistence = this.owner.lookup('service:persistence');
    this.saved = { ready: lingoLinqExtras.get('ready'), syncing: this.persistence.get('syncing'), progress: this.persistence.get('sync_progress') };
    lingoLinqExtras.set('ready', true);
  });

  hooks.afterEach(function() {
    this.persistence.set('syncing', this.saved.syncing);
    this.persistence.set('sync_progress', this.saved.progress);
    lingoLinqExtras.set('ready', this.saved.ready);
  });

  function home(context) {
    return context.owner.factoryFor('component:dashboard/authenticated-view').create();
  }

  test('shows while a sync runs, with the boards saved so far', function(assert) {
    this.persistence.set('syncing', true);
    this.persistence.set('sync_progress', { root_user: '1_1', visited: 12, to_visit: 30, total: 42, errored: 0 });
    var page = home(this);
    assert.true(page.get('syncing_notice'));
    assert.strictEqual(page.get('sync_progress_line'), 'Saved so far: 12 boards.');
    this.persistence.set('sync_progress.visited', 13);
    assert.strictEqual(page.get('sync_progress_line'), 'Saved so far: 13 boards.', 'follows the count');
  });

  test('hidden on an external device, and when the open database is another user\'s', function(assert) {
    assert.expect(2);
    this.persistence.set('syncing', true);
    var appState = this.owner.lookup('service:app-state');
    var page = home(this);
    var priorUser = appState.get('currentUser');
    try {
      appState.set('currentUser', EmberObject.create({ external_device: true }));
      assert.false(page.get('syncing_notice'), 'an external device syncs nothing here');
      appState.set('currentUser', priorUser);
      stub(this.persistence, 'local_db_is_current_user', function() { return false; });
      assert.false(page.get('syncing_notice'), 'another user\'s database');
    } finally {
      appState.set('currentUser', priorUser);
      restoreStubs();
    }
  });

  test('hidden when no sync is running', function(assert) {
    this.persistence.set('syncing', false);
    assert.false(home(this).get('syncing_notice'));
  });

  test('before the sync has counted anything, the line says it is starting', function(assert) {
    this.persistence.set('syncing', true);
    this.persistence.set('sync_progress', null);
    assert.strictEqual(home(this).get('sync_progress_line'), 'initializing...');
  });
});
