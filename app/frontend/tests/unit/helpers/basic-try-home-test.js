import { module, test } from 'qunit';
import EmberObject from '@ember/object';
import Service from '@ember/service';
import { setupTest } from '../../helpers';
import { basic_try_target } from 'frontend/utils/board_picker_landing';

/* ONE HOME BUTTON PER SITUATION AFTER A BASIC "TRY" (requested 2026-10-01). After "Try this
 * Board" the board header showed the legacy grey "Set as Home" (when the user had no home board)
 * beside the blue "Set as Home Board [for X]" (components/basic-try-home-button.js).
 *   - a try for SOMEONE ELSE (an SLP choosing for a communicator): only the blue button, which
 *     names them; the grey one, and the board menu's home item, would set the SLP's own home.
 *   - a try for YOURSELF: only the grey button, even if you already have a home board.
 * `basic_try_target` answers which case the board on screen is in; the `basic-try-home` helper
 * hands that to templates/application.hbs.
 */
module('Unit | Helper | basic-try-home', function(hooks) {
  setupTest(hooks);

  var me = EmberObject.create({ id: '1_3', user_name: 'slp_ana' });

  function appState(mark, key) {
    return EmberObject.create({ currentUser: me, currentBoardState: { key: key || 'public/core-60' }, basic_try_home: mark });
  }

  test('basic_try_target: other, self, or none', function(assert) {
    assert.strictEqual(basic_try_target(appState({ key: 'public/core-60', user_id: '1_7', user_name: 'aiden_parker' })), 'other', 'tried for a communicator');
    assert.strictEqual(basic_try_target(appState({ key: 'public/core-60', user_id: '1_3', user_name: 'slp_ana' })), 'self', 'tried for yourself');
    assert.strictEqual(basic_try_target(appState({ key: 'public/core-60' })), 'self', 'no user recorded = yourself');
    assert.strictEqual(basic_try_target(appState({ key: 'public/core-60', user_id: '1_7' }, 'public/other')), null, 'another board');
    assert.strictEqual(basic_try_target(appState(null)), null, 'no try');
  });

  test('the helper answers for the board on screen', function(assert) {
    this.owner.unregister('service:app-state');
    this.owner.register('service:app-state', Service.extend({
      currentUser: me, currentBoardState: { key: 'public/core-60' },
      basic_try_home: { key: 'public/core-60', user_id: '1_7', user_name: 'aiden_parker' }
    }));
    var helper = this.owner.factoryFor('helper:basic-try-home').create();
    assert.true(helper.compute(['other']), 'a try for someone else');
    assert.false(helper.compute(['self']), 'not a try for yourself');
  });
});
