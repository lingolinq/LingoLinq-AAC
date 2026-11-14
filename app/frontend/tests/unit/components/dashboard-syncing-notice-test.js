import { module, test } from 'qunit';
import { setupTest } from '../../helpers';
import lingoLinqExtras from 'frontend/utils/extras';

/* THE HOME CARD'S SYNC LINE (item 8, PR #1268): components/dashboard/authenticated-view.js#sync_progress_line,
 * shared by Basic's home card (classic-view extends this component) and the rail. The running sync itself is
 * shown by the app-wide drawer (components/sync-progress-drawer.js), tested on its own.
 */
module('Unit | Component | dashboard sync progress line', function(hooks) {
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

  test('the home card\'s line follows the sync\'s count', function(assert) {
    this.persistence.set('syncing', true);
    this.persistence.set('sync_progress', { root_user: '1_1', visited: 12, to_visit: 30, total: 42, errored: 0 });
    var page = home(this);
    assert.strictEqual(page.get('sync_progress_line'), 'Saved so far: 12 boards.');
    this.persistence.set('sync_progress.visited', 13);
    assert.strictEqual(page.get('sync_progress_line'), 'Saved so far: 13 boards.', 'follows the count');
  });

  test('before the sync has counted anything, the line says it is starting', function(assert) {
    this.persistence.set('syncing', true);
    this.persistence.set('sync_progress', null);
    assert.strictEqual(home(this).get('sync_progress_line'), 'initializing...');
  });
});
