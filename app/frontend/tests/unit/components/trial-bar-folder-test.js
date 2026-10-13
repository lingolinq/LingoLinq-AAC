import { module, test } from 'qunit';
import EmberObject from '@ember/object';
import Service from '@ember/service';
import { setupTest } from '../../helpers';
import modal from 'frontend/utils/modal';

/* THE TRIAL BAR IN A FOLDER (2026-10-13). Since the bar stays on the tried board's folders
 * (controllers/user/board-detail.js#try_origin_board), the board on screen can be a folder. The bar must
 * still name the board being TRIED, and "Use this board" must make THAT board the home board, never the
 * folder that happens to be showing. */
module('Unit | Component | trial-bar in a folder', function(hooks) {
  setupTest(hooks);
  // Its own message stubs, so it never depends on another suite having set up the modal first.
  var realSuccess, realError;
  hooks.beforeEach(function() { realSuccess = modal.success; realError = modal.error; modal.success = function() {}; modal.error = function() {}; });
  hooks.afterEach(function() { modal.success = realSuccess; modal.error = realError; });

  test('names and adopts the tried board, not the folder on screen', async function(assert) {
    var me = EmberObject.create({ id: '1_3', user_name: 'aiden_parker', preferences: { board_view_style: 'modern' } });
    var tried = EmberObject.create({ key: 'lingolinq/vocal-flair-40', name: 'Vocal Flair 40' });
    var folder = EmberObject.create({ key: 'lingolinq/vocal-flair-40-places_2', name: 'places' });
    var copied = [];
    this.owner.unregister('service:app-state');
    this.owner.register('service:app-state', Service.extend({
      currentUser: me, sessionUser: me, effective_view_user: me, label_locale: 'en',
      board_detail_try_origin: { key: 'lingolinq/vocal-flair-40', name: 'Vocal Flair 40', from: 'board_picker', user_id: '1_3', user_name: 'aiden_parker' },
      home_in_speak_mode: function() {}
    }));
    this.owner.unregister('service:store');
    this.owner.register('service:store', Service.extend({
      findRecord: function(type, id) { return Promise.resolve(type === 'board' && id === 'lingolinq/vocal-flair-40' ? tried : me); }
    }));
    var appState = this.owner.lookup('service:app-state');
    var bar = this.owner.factoryFor('component:trial-bar').create({
      board: folder, view: 'modern', mark: appState.get('board_detail_try_origin'),
      preloadImages: function() { return Promise.resolve(); },
      copyAsHome: function(b) { copied.push(b.get('key')); return Promise.resolve(EmberObject.create({ id: '1_99', key: 'aiden_parker/vocal-flair-40' })); },
      saveHome: function(user) { return Promise.resolve(user); },
      stashes: { get: function() { return null; }, persist: function() {} }
    });
    assert.strictEqual(bar.get('boardName'), 'Vocal Flair 40', 'the bar names the tried board');
    await bar.use();
    assert.deepEqual(copied, ['lingolinq/vocal-flair-40'], 'Use adopts the tried board, not "places"');
  });
});
