import { module, test } from 'qunit';
import EmberObject from '@ember/object';
import Service from '@ember/service';
import { setupTest } from 'ember-qunit';
import modal from 'frontend/utils/modal';

// Regression for issue #293 (High finding from adversary review): the share
// modal calls board.reload_if_lite() on open, and that refetch can resolve
// concurrently with a share/unshare action's sharing_key set + save on the
// same record. share-board now blocks both actions while
// board.reloading_detail is set so a pending change cannot be silently lost
// in the reload window. modal.notice is stubbed because modal.flash throws
// without a full app setup (utils/modal.js:449).
module('Unit | Component | share-board (issue #293 reload guard)', function(hooks) {
  setupTest(hooks);

  hooks.beforeEach(function() {
    this.owner.register('service:app-state', Service.extend({}));
    this.owner.register('service:modal', Service.extend({}));
    this._original_notice = modal.notice;
    this.notice_count = 0;
    var _this = this;
    modal.notice = function() { _this.notice_count++; };
  });

  hooks.afterEach(function() {
    modal.notice = this._original_notice;
  });

  function buildBoard(attrs) {
    var saved = { count: 0 };
    var board = EmberObject.create(Object.assign({
      reloading_detail: false,
      save: function() { saved.count++; return { then: function() { return this; } }; }
    }, attrs || {}));
    board.__saved = saved;
    return board;
  }

  test('share_with_user is blocked while a lite-refetch is in flight', function(assert) {
    var component = this.owner.factoryFor('component:share-board').create();
    var board = buildBoard({ reloading_detail: true });
    component.set('board', board);
    component.set('share_user_name', 'someuser');

    component.send('share_with_user');
    assert.strictEqual(board.__saved.count, 0, 'no save dispatched while reloading_detail is set');
    assert.strictEqual(board.get('sharing_key'), undefined, 'sharing_key not mutated while locked');
    assert.strictEqual(this.notice_count, 1, 'editor is told to wait');
  });

  test('unshare is blocked while a lite-refetch is in flight', function(assert) {
    var component = this.owner.factoryFor('component:share-board').create();
    var board = buildBoard({ reloading_detail: true });
    component.set('board', board);

    component.send('unshare', 'user_123');
    assert.strictEqual(board.__saved.count, 0, 'no save dispatched while reloading_detail is set');
    assert.strictEqual(board.get('sharing_key'), undefined, 'sharing_key not mutated while locked');
    assert.strictEqual(this.notice_count, 1, 'editor is told to wait');
  });

  test('share_with_user proceeds once the refetch has settled', function(assert) {
    var component = this.owner.factoryFor('component:share-board').create();
    var board = buildBoard({ reloading_detail: false });
    component.set('board', board);
    component.set('share_user_name', 'someuser');

    component.send('share_with_user');
    assert.strictEqual(board.__saved.count, 1, 'save dispatched when not reloading');
    assert.strictEqual(board.get('sharing_key'), 'add_shallow-someuser', 'sharing_key set when unlocked');
    assert.strictEqual(this.notice_count, 0, 'no wait notice when unlocked');
  });
});
