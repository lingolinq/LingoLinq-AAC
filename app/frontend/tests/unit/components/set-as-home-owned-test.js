import { module, test } from 'qunit';
import EmberObject from '@ember/object';
import { setupTest } from '../../helpers';

/* The set-as-home dialog's "is this board theirs?" (components/set-as-home.js#owned_by_user). With
 * nobody picked, the board is checked against YOU. Callers pass that as `null` (Basic's setAsHome,
 * from `setup_user_id`) or leave it `undefined` (board-detail, Board Actions). The check compared the
 * empty value with `sessionUser.user_id`, a property that does not exist; the original controller's
 * `==` made `null == undefined` pass, and the 2026-02-06 component conversion's `===` broke it, so
 * Basic's own boards read "This board is not owned by the user" (found 2026-10-12). */
module('Unit | Component | set-as-home owned_by_user', function(hooks) {
  setupTest(hooks);

  function dialog(owner, boardOwner, userId) {
    var appState = EmberObject.create({
      sessionUser: EmberObject.create({ id: '1_1', user_name: 'example', supervisees: [], managed_orgs: [],
        known_supervisees: [{ id: '1_2', user_name: 'kid' }] })
    });
    var comp = owner.factoryFor('component:set-as-home').create({
      appState: appState,
      stashes: { get: function() { return null; } },
      modal: { getSettingsFor: function() { return null; } },
      model: { board: EmberObject.create({ user_name: boardOwner, key: boardOwner + '/two' }), user_id: userId }
    });
    return comp;
  }

  test('nobody picked: checked against you, whether the caller passed null or nothing', function(assert) {
    var a = dialog(this.owner, 'example', null);
    var b = dialog(this.owner, 'example', undefined);
    assert.true(a.get('owned_by_user'), 'null (Basic)');
    assert.true(b.get('owned_by_user'), 'undefined (board-detail, Board Actions)');
    a.destroy(); b.destroy();
  });

  test("you, by 'self' or by your id", function(assert) {
    var a = dialog(this.owner, 'example', 'self');
    var b = dialog(this.owner, 'example', '1_1');
    assert.true(a.get('owned_by_user'));
    assert.true(b.get('owned_by_user'));
    a.destroy(); b.destroy();
  });

  test("someone else's board is not yours; a supervisee's board is theirs when they are picked", function(assert) {
    var a = dialog(this.owner, 'lingolinq', null);
    var b = dialog(this.owner, 'kid', '1_2');
    var c = dialog(this.owner, 'kid', null);
    assert.false(a.get('owned_by_user'), 'not yours');
    assert.true(b.get('owned_by_user'), "the supervisee's own board, for them");
    assert.false(c.get('owned_by_user'), "the supervisee's board, for you");
    a.destroy(); b.destroy(); c.destroy();
  });
});
