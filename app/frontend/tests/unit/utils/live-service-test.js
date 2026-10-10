import { module, test } from 'qunit';
import EmberObject from '@ember/object';
import { live_service, owner_gone } from 'frontend/utils/live_service';

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
});
