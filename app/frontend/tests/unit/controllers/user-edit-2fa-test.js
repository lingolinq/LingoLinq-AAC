import { module, test } from 'qunit';
import EmberObject from '@ember/object';
import Service from '@ember/service';
import RSVP from 'rsvp';
import { settled } from '@ember/test-helpers';
import { setupTest } from 'frontend/tests/helpers';
import { standInGlobals } from 'frontend/tests/helpers/stand-in-globals';

/*
 * controllers/user/edit.js, two-factor section.
 * - own_account_2fa: the page shows the person's own account and they are not acting as another user.
 *   While acting as another user, appState.sessionUser is that user, so the session's as_user_id
 *   (sent as X-As-User-Id, utils/extras.js) decides it.
 * - update_2fa: the page's copy of state_2fa follows the server's answer
 *   (`state` in POST /api/v1/users/:id/2fa).
 */
module('Unit | Controller | user/edit | two-factor', function(hooks) {
  setupTest(hooks);
  standInGlobals(hooks, {
    persistence: () => EmberObject.create({ online: true, ajax() { return RSVP.resolve({}); } })
  });

  function record(id, extra) {
    return EmberObject.create(Object.assign({ id: id, global_id: id, check_integrations() {} }, extra || {}));
  }

  function controller_for(context, opts) {
    context.owner.unregister('service:app-state');
    context.owner.register('service:app-state', Service.extend({ sessionUser: opts.sessionUser }));
    context.owner.unregister('service:session');
    context.owner.register('service:session', Service.extend({ as_user_id: opts.as_user_id || null }));
    const controller = context.owner.lookup('controller:user/edit');
    controller.set('model', opts.model);
    return controller;
  }

  test('own_account_2fa is true on the person\'s own account', function(assert) {
    const controller = controller_for(this, { sessionUser: record('1_3'), model: record('1_3') });
    assert.true(controller.get('own_account_2fa'));
  });

  test('own_account_2fa matches the session user held under the id "self"', function(assert) {
    const me = EmberObject.create({ id: 'self', global_id: '1_3' });
    const controller = controller_for(this, { sessionUser: me, model: record('1_3') });
    assert.true(controller.get('own_account_2fa'));
  });

  test('own_account_2fa is false on another account', function(assert) {
    const controller = controller_for(this, { sessionUser: record('1_3'), model: record('1_9') });
    assert.false(controller.get('own_account_2fa'));
  });

  test('own_account_2fa is false while acting as another user', function(assert) {
    const controller = controller_for(this, { sessionUser: record('1_9'), model: record('1_9'), as_user_id: '1_9' });
    assert.false(controller.get('own_account_2fa'));
  });

  test('own_account_2fa is false before the session user has loaded', function(assert) {
    const controller = controller_for(this, { sessionUser: null, model: record('1_3') });
    assert.false(controller.get('own_account_2fa'));
  });

  test('a confirmed code shows 2FA as on without a reload', async function(assert) {
    const model = record('1_3', { state_2fa: { required: false } });
    const controller = controller_for(this, { sessionUser: record('1_3'), model: model });
    this.standIns.persistence.set('ajax', () => RSVP.resolve({ updated: true, state: { required: true, verified: true } }));
    controller.send('update_2fa', 'confirm');
    await settled();
    assert.deepEqual(model.get('state_2fa'), { required: true, verified: true });
    assert.true(controller.get('status_2fa.success'));
  });

  test('turning 2FA off shows it as off without a reload', async function(assert) {
    const model = record('1_9', { state_2fa: { required: true, verified: true } });
    const controller = controller_for(this, { sessionUser: record('1_3'), model: model });
    this.standIns.persistence.set('ajax', () => RSVP.resolve({ updated: true, state: { required: false } }));
    controller.send('update_2fa', 'disable');
    await settled();
    assert.deepEqual(model.get('state_2fa'), { required: false });
    assert.true(controller.get('status_2fa.success'));
  });

  test('a reset keeps the new state and shows the code to scan', async function(assert) {
    const model = record('1_3', { state_2fa: { required: true, verified: true } });
    const controller = controller_for(this, { sessionUser: record('1_3'), model: model });
    this.standIns.persistence.set('ajax', () => RSVP.resolve({ updated: true, state: { required: true, verified: false }, uri: 'otpauth://totp/test' }));
    controller.send('update_2fa', 'reset');
    await settled();
    assert.deepEqual(model.get('state_2fa'), { required: true, verified: false });
    assert.strictEqual(controller.get('status_2fa.uri'), 'otpauth://totp/test');
  });

  test('a refused request leaves the state as it was', async function(assert) {
    const model = record('1_3', { state_2fa: { required: true, verified: true } });
    const controller = controller_for(this, { sessionUser: record('1_3'), model: model });
    this.standIns.persistence.set('ajax', () => RSVP.reject({ error: 'refused' }));
    controller.send('update_2fa', 'disable');
    await settled();
    assert.deepEqual(model.get('state_2fa'), { required: true, verified: true });
    assert.true(controller.get('status_2fa.error'));
  });
});
