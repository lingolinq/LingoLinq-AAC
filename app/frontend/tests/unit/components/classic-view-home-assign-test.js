import { module, test } from 'qunit';
import EmberObject from '@ember/object';
import Service from '@ember/service';
import { setupTest } from '../../helpers';

/* The Basic home page's Boards view mode (requested 2026-10-12). Kept apart from Modern's Boards
 * page mode (components/available-boards-section.js): different names, its own state, its own
 * template wiring. Covered here: the label, the toggle, Cancel, leaving the Boards view, and that
 * a tile click is only redirected while the mode is on. */
module('Unit | Component | classic-view home assign', function(hooks) {
  setupTest(hooks);

  function setup(context, homeKey) {
    context.owner.unregister('service:app-state');
    context.owner.register('service:app-state', Service.extend({
      currentUser: EmberObject.create({ id: 'self', user_name: 'example', preferences: { home_board: homeKey ? { key: homeKey } : null } })
    }));
    context.owner.unregister('service:persistence');
    context.owner.register('service:persistence', Service.extend({ online: false }));
    var model = EmberObject.create({ id: '1_1', supporter_role: false, load_word_activities: function() {} });
    return context.owner.factoryFor('component:dashboard/classic-view').create({ model: model });
  }

  test('label follows whether they have a home board', function(assert) {
    var a = setup(this, null);
    var b = setup(this, 'example/communikate-home');
    assert.strictEqual(a.get('basicSetHomeLabel'), 'Assign Home Board');
    assert.strictEqual(b.get('basicSetHomeLabel'), 'Change Home Board');
    a.destroy(); b.destroy();
  });

  test('the button toggles the mode; the tooltip Cancel ends it', function(assert) {
    var c = setup(this, 'example/communikate-home');
    assert.false(c.get('basicAssigningHome'));
    assert.strictEqual(c.get('basicTileAction'), null, 'tiles keep their normal click');
    c.send('toggleBasicHomeAssign');
    assert.true(c.get('basicAssigningHome'));
    assert.strictEqual(typeof c.get('basicTileAction'), 'function', 'tiles assign while on');
    c.send('cancelBasicHomeAssign');
    assert.false(c.get('basicAssigningHome'));
    assert.strictEqual(c.get('basicTileAction'), null);
    c.destroy();
  });

  test('leaving the Boards view ends the mode', function(assert) {
    // Switching Suggested / Mine / Community / Recent keeps it: checked in the browser, since those
    // subtabs drive the board-list queries this unit test does not stand up.
    var c = setup(this, 'example/communikate-home');
    c.set('index_nav_state', 'boards'); // what set_index_nav writes (authenticated-view.js)
    c.send('toggleBasicHomeAssign');
    assert.true(c.get('basicAssigningHome'));
    c.set('index_nav_state', 'main');
    assert.false(c.get('basicAssigningHome'), 'another view ends it');
    c.destroy();
  });

  test("Modern's Boards page names are not used here", function(assert) {
    var c = setup(this, null);
    assert.strictEqual(c.get('assigningHome'), undefined);
    assert.strictEqual((c.actions || {}).toggleSetHomeMode, undefined);
    c.destroy();
  });
});
