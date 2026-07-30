import { module, test } from 'qunit';
import { setupTest } from '../../helpers';
import EmberObject from '@ember/object';

module('Unit | Controller | user/board-detail save image persist', function(hooks) {
  setupTest(hooks);

  hooks.beforeEach(function() {
    this.controller = this.owner.factoryFor('controller:user/board-detail').create();
    // Isolate the save-path contract: processButtons → _build_from_raw(_last_raw)
    // restores model.buttons from _last_raw. Stub the rebuild to only that assignment
    // so we don't need a full Board model (contextualized_buttons, Button.create, etc.).
    var ctrl = this.controller;
    ctrl._build_from_raw = function(raw) {
      var board = this.get('model');
      if(board && board.set && raw && raw.buttons !== undefined) {
        board.set('buttons', raw.buttons);
      }
    };
  });

  hooks.afterEach(function() {
    if(this.controller) {
      this.controller.destroy();
      this.controller = null;
    }
  });

  test('processButtons without syncing _last_raw clobbers a newly assigned image_id', function(assert) {
    var stale = [{ id: 1, label: 'cannonball' }];
    var saved = [{ id: 1, label: 'cannonball', image_id: 'img_new' }];
    var board = EmberObject.create({ buttons: stale.slice() });
    this.controller.set('model', board);
    this.controller._last_raw = { buttons: stale };

    board.set('buttons', saved);
    // Intentionally do NOT sync _last_raw — this is the pre-fix save path.
    this.controller.processButtons();

    assert.notOk(
      board.get('buttons')[0].image_id,
      'documents the bug: processButtons restores stale _last_raw.buttons and drops image_id'
    );
  });

  test('syncing _last_raw before processButtons preserves newly assigned image_id', function(assert) {
    var stale = [{ id: 1, label: 'cannonball' }];
    var saved = [{ id: 1, label: 'cannonball', image_id: 'img_new' }];
    var board = EmberObject.create({ buttons: stale.slice() });
    this.controller.set('model', board);
    this.controller._last_raw = { buttons: stale };

    board.set('buttons', saved);
    // Fixed save path: sync serialized payload into _last_raw before rebuild.
    this.controller._last_raw.buttons = saved;
    this.controller.processButtons();

    assert.equal(
      board.get('buttons')[0].image_id,
      'img_new',
      'save payload image_id survives processButtons when _last_raw was synced'
    );
  });
});
