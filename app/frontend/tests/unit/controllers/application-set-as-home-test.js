import { module, test } from 'qunit';
import EmberObject from '@ember/object';
import Service from '@ember/service';
import RSVP from 'rsvp';
import { setupTest } from '../../helpers';
import modal from 'frontend/utils/modal';

/* "Set as Home" on a board page (Basic header, More and phone menus) -> controllers/application.js
 * #setAsHome. It is meant to set YOUR OWN board directly and ask (the set-as-home dialog) only when
 * the board is someone else's, the user supervises others, or a symbol set other than the default is
 * chosen. The owner was read as `key.split('/')[1]` -- the board's SLUG, not its owner -- since 2018,
 * so every board looked like someone else's and the dialog always opened (found 2026-10-12). */
module('Unit | Controller | application setAsHome', function(hooks) {
  setupTest(hooks);
  var original = {};
  hooks.beforeEach(function() { original.open = modal.open; original.success = modal.success; original.error = modal.error; });
  hooks.afterEach(function() { modal.open = original.open; modal.success = original.success; modal.error = original.error; });

  function setup(context, boardKey, userAttrs) {
    var saves = [];
    var user = EmberObject.create(Object.assign({
      user_name: 'example',
      preferences: { preferred_symbols: 'original' },
      save: function() { saves.push(this.get('preferences.home_board.key')); return RSVP.resolve(this); }
    }, userAttrs || {}));
    context.owner.unregister('service:app-state');
    context.owner.register('service:app-state', Service.extend({
      currentUser: user,
      check_for_needing_purchase: function() { return RSVP.resolve(); },
      assert_source: function() { return RSVP.resolve(); },
      get_history_label_locale: function() { return null; }
    }));
    // A stand-in for the board page's controller (application.js injects it as `board`).
    var boardModel = EmberObject.create({ key: boardKey, id: '1_9' });
    context.owner.unregister('controller:board/index');
    context.owner.register('controller:board/index', EmberObject.extend({ model: boardModel }));
    var controller = context.owner.lookup('controller:application');
    var opened = [];
    modal.open = function(template) { opened.push(template); return RSVP.resolve(); };
    var flashes = [];
    modal.success = function(text) { flashes.push(text); };
    modal.error = function() {};
    return { controller: controller, saves: saves, opened: opened, flashes: flashes };
  }
  function settle() { return new RSVP.Promise(function(r) { setTimeout(r, 0); }); }

  test('your own board is set directly, without the dialog', async function(assert) {
    var t = setup(this, 'example/two');
    t.controller.send('setAsHome');
    await settle(); await settle();
    assert.deepEqual(t.opened, [], 'no dialog');
    assert.deepEqual(t.saves, ['example/two'], 'set as home');
  });

  test('setting it says so, even with auto-sync off or offline', async function(assert) {
    // The message used to show only when the device was online with auto-sync on (done() in
    // setAsHome); otherwise the home board changed with no word at all (requested 2026-10-12).
    var t = setup(this, 'example/two');
    t.controller.set('persistence', EmberObject.create({ online: true, auto_sync: false }));
    t.controller.send('setAsHome');
    await settle(); await settle();
    assert.deepEqual(t.flashes, ["Great! This is now the user's home board!"]);
  });

  test("someone else's board still asks first", async function(assert) {
    var t = setup(this, 'lingolinq/quick-core-24');
    t.controller.send('setAsHome');
    await settle(); await settle();
    assert.deepEqual(t.opened, ['set-as-home']);
    assert.deepEqual(t.saves, []);
  });

  test('a supervisor, or a non-default symbol set, still asks even for their own board', async function(assert) {
    var t = setup(this, 'example/two', { supervisees: [{ id: '1_2' }] });
    t.controller.send('setAsHome');
    await settle(); await settle();
    assert.deepEqual(t.opened, ['set-as-home'], 'supervisor');
    var t2 = setup(this, 'example/two', { preferences: { preferred_symbols: 'pcs' } });
    t2.controller.send('setAsHome');
    await settle(); await settle();
    assert.deepEqual(t2.opened, ['set-as-home'], 'symbols');
  });
});
