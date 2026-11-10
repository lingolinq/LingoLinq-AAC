import { module, test } from 'qunit';
import { setupTest } from 'frontend/tests/helpers';
import EmberObject from '@ember/object';

/* board-detail's Light/Dark control calls set_dark_mode. Removing the Speak
   Mode sidebar links must leave this toggle writing preferences.board_dark_mode. */
module('Unit | Controller | board-detail set_dark_mode', function(hooks) {
  setupTest(hooks);

  function controllerWith(owner, stored) {
    var saves = [];
    var user = EmberObject.create({
      preferences: { board_dark_mode: stored, device: {} },
      save: function() {
        saves.push(user.get('preferences.board_dark_mode'));
        return Promise.resolve(user);
      }
    });
    var controller = owner.factoryFor('controller:user/board-detail').create({
      app_state: EmberObject.create({ currentUser: user })
    });
    return { controller: controller, user: user, saves: saves };
  }

  test('set_dark_mode turns the board dark and stores the preference', function(assert) {
    var built = controllerWith(this.owner, false);
    built.controller.send('set_dark_mode', true);
    assert.true(built.controller.get('dark_mode'));
    assert.true(built.user.get('preferences.board_dark_mode'));
    assert.true(built.user.get('preferences.device.updated'));
    assert.deepEqual(built.saves, [true]);
    built.controller.destroy();
  });

  test('set_dark_mode turns the board light and stores the preference', function(assert) {
    var built = controllerWith(this.owner, true);
    built.controller.send('set_dark_mode', false);
    assert.false(built.controller.get('dark_mode'));
    assert.false(built.user.get('preferences.board_dark_mode'));
    assert.deepEqual(built.saves, [false]);
    built.controller.destroy();
  });
});
