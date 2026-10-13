import { module, test } from 'qunit';
import Service from '@ember/service';
import EmberObject from '@ember/object';
import { setupTest } from '../../helpers';

/* The View menu's Compressed View switch. It is offered only with the `compressed_view`
 * flag, writes the SESSION user's own preference (the record `sync_density_scope` in
 * services/app-state.js watches), and leaves the menu open, because a switch that closes
 * its menu hides the result of the flip it just made.
 *
 * app-state is stubbed and re-registered per test: a bare `register` over an existing
 * service is ignored (see view-switcher-availability-test.js#stubAppState). */
module('Unit | Component | view-switcher compressed view', function(hooks) {
  setupTest(hooks);

  function setup(context, flags, prefs) {
    var saves = [];
    var user = EmberObject.create({
      preferences: prefs,
      save: function() { saves.push(this.get('preferences.compressed_view')); return Promise.resolve(); }
    });
    context.owner.unregister('service:app-state');
    context.owner.register('service:app-state', Service.extend({
      currentUser: user, sessionUser: user, speak_mode: false, edit_mode: false,
      feature_flags: flags
    }));
    var switcher = context.owner.factoryFor('component:view-switcher').create();
    return { user: user, saves: saves, switcher: switcher };
  }

  test('is offered only with the compressed_view flag', function(assert) {
    assert.false(setup(this, {}, {}).switcher.get('compressedAvailable'), 'no flag, no switch');
    assert.true(setup(this, { compressed_view: true }, {}).switcher.get('compressedAvailable'), 'flag on, switch shown');
  });

  test('reads only an exact true as on', function(assert) {
    assert.false(setup(this, { compressed_view: true }, {}).switcher.get('isCompressed'), 'absent');
    assert.false(setup(this, { compressed_view: true }, { compressed_view: 'true' }).switcher.get('isCompressed'), 'string');
    assert.true(setup(this, { compressed_view: true }, { compressed_view: true }).switcher.get('isCompressed'), 'true');
  });

  test('toggling writes the session user preference, saves, and keeps the menu open', function(assert) {
    var s = setup(this, { compressed_view: true }, {});
    s.switcher.set('menu_open', true);
    s.switcher.send('toggle_compressed');
    assert.true(s.user.get('preferences.compressed_view'), 'turned on');
    assert.true(s.user.get('preferences.device.updated'), 'record marked dirty so the save is not skipped');
    assert.deepEqual(s.saves, [true], 'saved once, with the new value');
    assert.true(s.switcher.get('menu_open'), 'the menu stays open');
    s.switcher.send('toggle_compressed');
    assert.false(s.user.get('preferences.compressed_view'), 'turned back off');
    assert.deepEqual(s.saves, [true, false], 'saved again');
  });

  test('does nothing without the flag', function(assert) {
    var s = setup(this, {}, {});
    s.switcher.send('toggle_compressed');
    assert.strictEqual(s.user.get('preferences.compressed_view'), undefined, 'no write');
    assert.deepEqual(s.saves, [], 'no save');
  });
});
