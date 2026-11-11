import { module, test } from 'qunit';
import Service from '@ember/service';
import { setupTest } from '../../helpers';
import { on_board_page } from 'frontend/components/sync-progress-drawer';

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
});
