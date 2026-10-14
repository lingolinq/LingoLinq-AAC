import { module, test } from 'qunit';
import EmberObject from '@ember/object';
import Service from '@ember/service';
import { setupTest } from '../../helpers';

/* THE ACCOUNT PAGE'S SUBTITLE NAMES WHOSE ACCOUNT IT IS (2026-10-01, requested: fix the wrong
 * account subtitle). "View your account details" showed on someone else's account too (a supervisor
 * viewing a communicator); the title was fixed on 2026-09-30, the subtitle was missed.
 * `isSelf` decides it, against the SESSION user (never `currentUser`, which is the communicator
 * while modeling), by id or user_name (a cold load's session record has id 'self').
 */
module('Unit | Controller | user/index isSelf', function(hooks) {
  setupTest(hooks);

  function controller(context, me, page) {
    context.owner.unregister('service:app-state');
    context.owner.register('service:app-state', Service.extend({ sessionUser: me }));
    // Created with its model, not `set` afterwards: setting it fires the controller's own
    // `check_daily_use` observer, whose request settles after the test has torn down.
    return context.owner.factoryFor('controller:user/index').create({ model: page });
  }

  test('your own account', function(assert) {
    var me = EmberObject.create({ id: '1_3', user_name: 'slp_ana' });
    assert.true(controller(this, me, EmberObject.create({ id: '1_3', user_name: 'slp_ana' })).get('isSelf'));
  });

  test('your own account on a cold load, where the session record\'s id is "self"', function(assert) {
    var me = EmberObject.create({ id: 'self', user_name: 'slp_ana' });
    assert.true(controller(this, me, EmberObject.create({ id: '1_3', user_name: 'slp_ana' })).get('isSelf'));
  });

  test('someone else\'s account', function(assert) {
    var me = EmberObject.create({ id: '1_3', user_name: 'slp_ana' });
    assert.false(controller(this, me, EmberObject.create({ id: '1_7', user_name: 'aiden_parker' })).get('isSelf'));
  });

  test('no session user yet', function(assert) {
    assert.false(controller(this, null, EmberObject.create({ id: '1_7', user_name: 'aiden_parker' })).get('isSelf'));
  });
});
