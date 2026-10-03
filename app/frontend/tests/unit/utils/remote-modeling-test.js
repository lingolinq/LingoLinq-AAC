import { module, test } from 'qunit';
import EmberObject from '@ember/object';
import { remoteModelingState, openRemoteModeling } from 'frontend/utils/remote_modeling';
import modal from 'frontend/utils/modal';

/* REMOTE MODELING ACCESS (2026-10-02): one reading of who may connect, shared by every entry point.
 * A supporter who cannot connect yet sees the option with a "Limited" badge, and the click opens
 * the window that says what would make it work.
 */
module('Unit | Utility | remote_modeling', function() {
  var user = function(attrs) { return EmberObject.create(Object.assign({ id: '1_7', user_name: 'aiden' }, attrs || {})); };
  var supporter = EmberObject.create({ id: '1_2', user_name: 'sarah' });
  var ready = { premium: true, remote_modeling: true, modeling_only: false, edit_permission: true };

  test('available: premium, full supervision, and turned on', function(assert) {
    assert.expect(2);
    assert.strictEqual(remoteModelingState(user(ready), supporter), 'available', 'a caseload supervisee');
    assert.strictEqual(remoteModelingState(user({ currently_premium: true, preferences: { remote_modeling: true }, permissions: { supervise: true, edit: true } }), supporter), 'available', 'a full user record');
  });

  test('each limited state, in order', function(assert) {
    assert.expect(6);
    assert.strictEqual(remoteModelingState(user(Object.assign({}, ready, { premium: false })), supporter), 'needs_premium');
    assert.strictEqual(remoteModelingState(user(ready), EmberObject.create({ modeling_only: true })), 'supporter_upgrade');
    assert.strictEqual(remoteModelingState(user(Object.assign({}, ready, { modeling_only: true })), supporter), 'modeling_access');
    assert.strictEqual(remoteModelingState(user({ premium: true, preferences: { remote_modeling: true }, permissions: { model: true } }), supporter), 'modeling_access', 'a full record without supervise');
    assert.strictEqual(remoteModelingState(user(Object.assign({}, ready, { remote_modeling: false })), supporter), 'not_enabled');
    assert.strictEqual(remoteModelingState(user(Object.assign({}, ready, { premium: false, remote_modeling: false })), supporter), 'needs_premium', 'the upgrade is named first');
  });

  test('each state opens the window that explains it', function(assert) {
    assert.expect(5);
    var opened = [];
    var original = modal.open;
    modal.open = function(template, opts) { opened.push([template, opts]); };
    try {
      openRemoteModeling(user(ready), supporter);
      assert.deepEqual(opened.pop(), ['modals/remote-model', { user_id: '1_7' }], 'available: the connection window');
      openRemoteModeling(user(Object.assign({}, ready, { premium: false })), supporter);
      var p = opened.pop();
      assert.deepEqual([p[0], p[1].user_name, p[1].reason], ['premium-required', 'aiden', 'not_currently_premium'], 'not premium: the upgrade window for the communicator');
      openRemoteModeling(user(ready), EmberObject.create({ user_name: 'free_slp', modeling_only: true }));
      p = opened.pop();
      assert.deepEqual([p[0], p[1].user_name, p[1].remind_to_upgrade, p[1].limited_supervisor], ['premium-required', 'free_slp', true, true], 'modeling-only account: the supporter upgrade window');
      openRemoteModeling(user(Object.assign({}, ready, { remote_modeling: false })), supporter);
      assert.deepEqual(opened.pop(), ['modals/remote-model', { user_id: '1_7', limited: 'not_enabled', can_edit_settings: true }], 'not turned on: the explanation, with a settings link for an editor');
      openRemoteModeling(user(Object.assign({}, ready, { modeling_only: true, edit_permission: false })), supporter);
      assert.deepEqual(opened.pop(), ['modals/remote-model', { user_id: '1_7', limited: 'modeling_access', can_edit_settings: false }], 'modeling-only link: the explanation');
    } finally {
      modal.open = original;
    }
  });
});
