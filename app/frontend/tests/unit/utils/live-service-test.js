import { module, test } from 'qunit';
import EmberObject from '@ember/object';
import { live_service, owner_gone, set_owner_gone_listener } from 'frontend/utils/live_service';

/*
 * owner_gone(owner) is the test the deferred-work guards use. It is true only when an owner was
 * captured and has since been torn down. Nothing captured is not "gone": the work runs, as it did
 * before the guards existed (production never tears its app-state down).
 */
module('Unit | Utility | live_service', function() {
  test('live_service passes a live value through and drops a destroyed one', function(assert) {
    const svc = EmberObject.create();
    assert.strictEqual(live_service(svc), svc);
    assert.strictEqual(live_service(undefined), undefined);
    svc.destroy();
    assert.strictEqual(live_service(svc), null);
  });

  test('owner_gone is true only for a captured owner that was torn down', function(assert) {
    const owner = EmberObject.create();
    assert.false(owner_gone(owner), 'a live owner is not gone');
    assert.false(owner_gone(undefined), 'nothing captured is not gone');
    assert.false(owner_gone(null), 'nothing captured is not gone');
    owner.destroy();
    assert.true(owner_gone(owner), 'a destroyed owner is gone');
  });

  test('the harness listener hears only a torn-down owner', function(assert) {
    assert.expect(2);
    const heard = [];
    const previous = set_owner_gone_listener(() => heard.push(1));
    try {
      const owner = EmberObject.create();
      owner_gone(owner);
      owner_gone(undefined);
      assert.strictEqual(heard.length, 0, 'a live or missing owner is not reported');
      owner.destroy();
      owner_gone(owner);
      assert.strictEqual(heard.length, 1, 'a torn-down owner is reported');
    } finally {
      set_owner_gone_listener(previous); // the harness listener stays in place for later tests
    }
  });

  test('tests/test-helper.js installs the harness listener, so a skip is reported', function(assert) {
    assert.expect(1);
    const harness = set_owner_gone_listener(null);
    set_owner_gone_listener(harness);
    assert.strictEqual(typeof harness, 'function', 'a listener is installed for the whole run');
  });
});
