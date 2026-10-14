import { module, test } from 'qunit';
import EmberObject from '@ember/object';
import Service from '@ember/service';
import { setupTest } from '../../helpers';

/* THE SUPERVISION PAGE SHOWS THE USER IN ITS URL (2026-10-01; adversarial review H2).
 * templates/user/supervision.hbs mounts <SupervisionSettings @model={{this.model}} @standalone={{true}} />
 * with the route's user record. The component's non-inline init read the MODAL's stored settings
 * first: services/modal.js#getSettingsFor returns {} when nothing is stored, and {} is truthy, so
 * the route model was never read. The page was built on an empty object, or, once the supervision
 * modal had been opened for another user in the session (settings are never cleared), it showed
 * and acted on that user.
 */
module('Unit | Component | supervision-settings standalone', function(hooks) {
  setupTest(hooks);

  function user(name, calls) {
    return EmberObject.create({ id: name, user_name: name, reload: function() { calls.push(['reload', name, this.get('load_all_connections')]); return Promise.resolve(this); } });
  }

  function setup(context, stored) {
    context.owner.unregister('service:modal');
    context.owner.register('service:modal', Service.extend({
      settingsFor: stored ? { 'supervision-settings': stored } : {},
      getSettingsFor: function(t) { return this.settingsFor[t] || {}; }
    }));
  }

  test('standalone, with the modal earlier opened for someone else: the page user, not theirs', function(assert) {
    var calls = [];
    setup(this, { user: user('aiden_parker', calls) });
    var me = user('example', calls);
    var c = this.owner.factoryFor('component:supervision-settings').create({ model: me, standalone: true });
    assert.strictEqual(c.get('model'), me, 'the route user');
    assert.deepEqual(calls.map(function(c) { return c[1]; }), ['example'], 'reloaded once, the page user');
    assert.true(c.get('model.load_all_connections'), 'with all connections (models/user.js#load_more_supervision observes this)');
  });

  test('standalone, with nothing stored: still the page user, not an empty object', function(assert) {
    var calls = [];
    setup(this, null);
    var me = user('example', calls);
    var c = this.owner.factoryFor('component:supervision-settings').create({ model: me, standalone: true });
    assert.strictEqual(c.get('model'), me);
  });

  test('as a modal (not standalone): still takes the user the modal was opened with', function(assert) {
    var calls = [];
    var other = user('aiden_parker', calls);
    setup(this, { user: other });
    var c = this.owner.factoryFor('component:supervision-settings').create({});
    assert.strictEqual(c.get('model'), other, 'unchanged modal behaviour');
  });
});
