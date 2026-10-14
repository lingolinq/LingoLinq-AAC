import { module, test } from 'qunit';
import EmberObject from '@ember/object';
import { setupTest } from '../../helpers';

/* THE "PLEASE LOG BACK IN" DIALOG OFFERS BASIC ACCESS (decided 2026-10-11). The dialog cannot be
 * dismissed, so a communicator who does not know the password had no way back to speaking until an
 * adult signed in. Basic access (the public boards, no sign-in) is offered in the dialog
 * (`force_logout`) as on the login page, behind the same `emergency_boards` flag;
 * app-state#keeps_force_logout_open lets that route close the dialog. */
module('Unit | Component | login-form basic access', function(hooks) {
  setupTest(hooks);

  function form(owner, attrs) {
    var comp = owner.factoryFor('component:login-form').create(attrs);
    comp.set('app_state', EmberObject.create({ feature_flags: { emergency_boards: attrs.flag } }));
    return comp;
  }

  test('offered in the force-logout dialog when the flag is on', function(assert) {
    assert.true(form(this.owner, { force_logout: true, flag: true }).get('showBasicAccess'));
  });

  test('offered on the login page when the flag is on, as before', function(assert) {
    assert.true(form(this.owner, { flag: true }).get('showBasicAccess'));
  });

  test('not without the flag, and not in the re-authentication prompt', function(assert) {
    assert.false(form(this.owner, { force_logout: true, flag: false }).get('showBasicAccess'));
    assert.false(form(this.owner, { prompt: true, flag: true }).get('showBasicAccess'));
  });
});
