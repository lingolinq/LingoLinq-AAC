import { module, test } from 'qunit';
import Service from '@ember/service';
import { setupTest } from '../../helpers';
import { on_board_page, drawer_stage } from 'frontend/components/sync-progress-drawer';

/* THE SYNC DRAWER STAYS OUT OF SPEAK MODE ON A BOARD PAGE (item 8, PR #1268; Traci, 2026-11-11): a running
 * sync and its result show bottom right on every page, except while Speak Mode is on in Basic's board page or
 * Modern's, and come back as soon as Speak Mode ends or the person goes elsewhere.
 */
module('Unit | Component | sync-progress-drawer', function(hooks) {
  setupTest(hooks);

  function build(context, opts) {
    var state = Object.assign({ speak_mode: false, route: 'user.home', copy_status: null, notice_status: 'syncing' }, opts || {});
    context.owner.unregister('service:app-state');
    context.owner.register('service:app-state', Service.extend({ speak_mode: state.speak_mode, toast: null }));
    context.owner.unregister('service:router');
    context.owner.register('service:router', Service.extend({ currentRouteName: state.route }));
    context.owner.unregister('service:copy-progress');
    context.owner.register('service:copy-progress', Service.extend({ status: state.copy_status }));
    context.owner.unregister('service:sync-notice');
    context.owner.register('service:sync-notice', Service.extend({ status: state.notice_status, dismiss: function() { this.set('status', null); } }));
    return context.owner.factoryFor('component:sync-progress-drawer').create();
  }

  test('which pages count as a board page', function(assert) {
    assert.true(on_board_page('user.board-detail.index'));
    assert.true(on_board_page('user.board-detail.edit'));
    assert.true(on_board_page('user.board-alt.index'));
    assert.true(on_board_page('board.index'));
    assert.true(on_board_page('board'));
    assert.false(on_board_page('user.home'));
    assert.false(on_board_page('user.boards'));
    assert.false(on_board_page('board-picker'));
    assert.false(on_board_page(''));
    assert.false(on_board_page(undefined));
  });

  test('shown on an ordinary page while a sync runs', function(assert) {
    assert.true(build(this).get('shown'));
  });

  test('hidden in Speak Mode on a board page, in either view, and back when Speak Mode ends or the page changes', function(assert) {
    var drawer = build(this, { speak_mode: true, route: 'user.board-detail.index' });
    assert.false(drawer.get('shown'), 'Modern board page in Speak Mode');
    var appState = this.owner.lookup('service:app-state');
    var router = this.owner.lookup('service:router');
    router.set('currentRouteName', 'user.board-alt.index');
    assert.false(drawer.get('shown'), 'Basic board page in Speak Mode');
    appState.set('speak_mode', false);
    assert.true(drawer.get('shown'), 'Speak Mode ended');
    appState.set('speak_mode', true);
    router.set('currentRouteName', 'user.home');
    assert.true(drawer.get('shown'), 'left the board page');
  });

  test('a board page outside Speak Mode still shows it', function(assert) {
    assert.true(build(this, { speak_mode: false, route: 'user.board-detail.edit' }).get('shown'));
  });

  test('the copy drawer takes the slot while a copy runs', function(assert) {
    assert.false(build(this, { copy_status: 'copying' }).get('shown'));
  });

  test('nothing to show when no sync has run', function(assert) {
    assert.false(build(this, { notice_status: null }).get('shown'));
  });

  /* The four stages of Traci's sync status design (2026-11-14): saving, waiting for a better connection, all ready,
   * needs attention; and the plain result card when a sync left nothing to group. */
  function summary(missing_folders) {
    return { groups: [
      { key: 'me/core', name: 'Quick Core 60', ready: missing_folders === 0, board_missing: false, folders_missing: new Array(missing_folders).fill('x') },
      { key: 'me/keyboard', name: 'Keyboard', ready: true, board_missing: false, folders_missing: [] }
    ], overall: { saved: 10, total: 10 + missing_folders, missing: missing_folders, pct: 90 } };
  }

  test('which stage the drawer shows', function(assert) {
    assert.strictEqual(drawer_stage('syncing', null, { parked: 0, to_visit: 4 }, null), 'saving');
    assert.strictEqual(drawer_stage('syncing', null, { parked: 2, to_visit: 4 }, null), 'saving', 'parked boards while others still download');
    assert.strictEqual(drawer_stage('syncing', null, { parked: 2, to_visit: 2 }, null), 'waiting');
    assert.strictEqual(drawer_stage('done', 'succeeded', null, summary(0)), 'ready');
    assert.strictEqual(drawer_stage('done', 'finished', null, summary(9)), 'attention');
    assert.strictEqual(drawer_stage('done', 'failed', null, summary(9)), 'result', 'a failed sync keeps its reason');
    assert.strictEqual(drawer_stage('done', 'finished', null, null), 'result', 'an older log with nothing to group');
  });

  function build_with(context, notice, progress, log) {
    context.owner.unregister('service:persistence');
    context.owner.register('service:persistence', Service.extend({ syncing: notice.status === 'syncing', sync_progress: progress, sync_log: log || [] }));
    var drawer = build(context, { notice_status: notice.status });
    context.owner.lookup('service:sync-notice').setProperties({ kind: notice.kind || null, message: 'plain message', detail: null });
    return drawer;
  }

  test('needs attention names the board whose folders did not save', function(assert) {
    var roots = { 'me/core': { root: 'me/core', name: 'Quick Core 60', role: 'home board', key: 'me/core' }, 'me/core-feel': { root: 'me/core', name: 'Feel', key: 'me/core-feel' }, 'me/core-go': { root: 'me/core', name: 'Go', key: 'me/core-go' }, 'me/kb': { root: 'me/kb', name: 'Keyboard', role: 'sidebar board', key: 'me/kb' } };
    var statuses = [{ key: 'me/core', status: 'downloaded' }, { key: 'me/kb', status: 'cached' }, { key: 'me/core-feel', status: 'downloaded' }, { key: 'me/core-go', error: 'failed retrieval' }];
    var drawer = build_with(this, { status: 'done', kind: 'finished' }, null, [{ statuses: statuses, roots: roots }]);
    assert.strictEqual(drawer.get('stage'), 'attention');
    assert.strictEqual(drawer.get('result_title'), '1 of 2 boards are ready offline');
    assert.strictEqual(drawer.get('result_detail'), "1 folder of Quick Core 60 didn't save. It still opens while you're online.");
    assert.strictEqual(drawer.get('tone'), 'attention');
  });

  test('all ready, and the plain card when there is nothing to group', function(assert) {
    var drawer = build_with(this, { status: 'done', kind: 'succeeded' }, null, [{ statuses: [{ key: 'me/a', status: 'cached' }, { key: 'me/b', status: 'downloaded' }], roots: {} }]);
    assert.strictEqual(drawer.get('result_title'), 'All your boards are ready offline');
    assert.strictEqual(drawer.get('result_detail'), '2 boards and folders are saved on this device.');
    var plain = build_with(this, { status: 'done', kind: 'failed' }, null, []);
    assert.strictEqual(plain.get('result_title'), 'plain message', "the sync notice's own message");
  });

  test('Try now wakes the parked boards without cancelling the sync', function(assert) {
    var woke = 0;
    var progress = { parked: 1, to_visit: 1, retry_wakers: [function() { woke++; }] };
    var drawer = build_with(this, { status: 'syncing' }, progress, []);
    assert.strictEqual(drawer.get('stage'), 'waiting');
    assert.strictEqual(drawer.get('waiting_line'), '1 folder is left. It will be tried again automatically.');
    drawer.onTryNow();
    assert.strictEqual(woke, 1);
    assert.notOk(progress.canceled, 'not cancelled');
  });

  test('a saved folder whose pictures or sounds wait is not said to be left', function(assert) {
    var line = function(parked, parked_content) {
      return build_with(this, { status: 'syncing' }, { parked: parked, parked_content: parked_content, to_visit: parked }, []).get('waiting_line');
    }.bind(this);
    assert.strictEqual(line(1, 1), '1 folder is saved, but some of its pictures or sounds are not. They will be tried again automatically.');
    assert.strictEqual(line(3, 3), '3 folders are saved, but some of their pictures or sounds are not. They will be tried again automatically.');
    assert.strictEqual(line(3, 1), '2 folders are left. They will be tried again automatically. 1 folder is saved, but some of its pictures or sounds are not. They will be tried again automatically.', 'both kinds, each said as it is');
    assert.strictEqual(line(2, 0), '2 folders are left. They will be tried again automatically.', 'boards only: as before');
  });
});
