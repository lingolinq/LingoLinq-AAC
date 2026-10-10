import { module, test } from 'qunit';
import EmberObject from '@ember/object';
import { live_service, owner_gone, set_owner_gone_listener } from 'frontend/utils/live_service';
import { recordOwnerGoneSkips } from 'frontend/tests/helpers/owner-gone';

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
    assert.expect(5);
    const owner = EmberObject.create();
    assert.false(owner_gone(owner), 'a live owner is not gone');
    assert.false(owner_gone(undefined), 'nothing captured is not gone');
    assert.false(owner_gone(null), 'nothing captured is not gone');
    owner.destroy();
    const skips = recordOwnerGoneSkips(owner);
    try {
      assert.true(owner_gone(owner), 'a destroyed owner is gone');
      assert.strictEqual(skips.count, 1, 'the skip is counted here, not reported by the harness');
    } finally {
      skips.restore();
    }
  });

  test('a recorder counts only its own owner and passes other skips on to the harness listener', function(assert) {
    assert.expect(3);
    const heard = [];
    const harness = set_owner_gone_listener((owner) => heard.push(owner));
    const mine = EmberObject.create();
    const earlier = EmberObject.create();
    const skips = recordOwnerGoneSkips(mine);
    try {
      mine.destroy();
      earlier.destroy();
      owner_gone(mine);
      owner_gone(earlier);
      assert.strictEqual(skips.count, 1, 'only the skip for its own owner is counted');
      assert.deepEqual(heard, [earlier], 'the other skip reaches the listener that was installed before');
    } finally {
      skips.restore();
      set_owner_gone_listener(harness);
    }
    assert.strictEqual(heard.length, 1, 'nothing else was reported');
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
