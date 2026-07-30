import { module, test } from 'qunit';
import { setupTest } from '../../helpers';
import EmberObject from '@ember/object';

module('Unit | Controller | user/board-detail save image persist', function(hooks) {
  setupTest(hooks);

  hooks.beforeEach(function() {
    this.controller = this.owner.factoryFor('controller:user/board-detail').create();
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
    var grid = { rows: 1, columns: 1, order: [[1]] };
    var board = EmberObject.create({
      buttons: stale.slice(),
      grid: grid,
      image_urls: {},
      locale: 'en'
    });
    this.controller.set('model', board);
    this.controller.set('edit_mode', true);
    this.controller._last_raw = {
      id: '1_1',
      key: 'user/board',
      buttons: stale,
      grid: grid,
      image_urls: {},
      locale: 'en'
    };

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
    var grid = { rows: 1, columns: 1, order: [[1]] };
    var board = EmberObject.create({
      buttons: stale.slice(),
      grid: grid,
      image_urls: {},
      locale: 'en'
    });
    this.controller.set('model', board);
    this.controller.set('edit_mode', true);
    this.controller._last_raw = {
      id: '1_1',
      key: 'user/board',
      buttons: stale,
      grid: grid,
      image_urls: {},
      locale: 'en'
    };

    board.set('buttons', saved);
    board.set('image_urls', { img_new: 'https://cdn.example.com/cannonball.png' });
    // Fixed save path: sync serialized payload into _last_raw before rebuild.
    this.controller._last_raw.buttons = saved;
    this.controller._last_raw.grid = grid;
    this.controller._last_raw.image_urls = { img_new: 'https://cdn.example.com/cannonball.png' };
    this.controller.processButtons();

    assert.equal(
      board.get('buttons')[0].image_id,
      'img_new',
      'save payload image_id survives processButtons when _last_raw was synced'
    );
  });
});
