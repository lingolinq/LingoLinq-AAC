import { module, test } from 'qunit';
import RSVP from 'rsvp';
import { setupTest } from 'frontend/tests/helpers';
import capabilities from 'frontend/utils/capabilities';
import modal from 'frontend/utils/modal';

/*
 * The full_screen action warns when fullscreen fails, which is only known ~500 ms later. A controller
 * torn down by then must not raise that warning in whichever app's modal is current.
 */
module('Unit | Controller | application full_screen after teardown', function(hooks) {
  setupTest(hooks);

  hooks.beforeEach(function() {
    this.warnings = 0;
    this.saved = [[capabilities, 'fullscreen'], [modal, 'warning']].map(([obj, k]) => [obj, k, Object.getOwnPropertyDescriptor(obj, k)]);
    capabilities.fullscreen = () => new RSVP.Promise((resolve, reject) => { setTimeout(reject, 20); });
    modal.warning = () => { this.warnings++; };
  });
  hooks.afterEach(function() {
    this.saved.forEach(([obj, k, d]) => { if (d) { Object.defineProperty(obj, k, d); } else { delete obj[k]; } });
  });

  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  test('a failed fullscreen warns while the controller is alive (positive control)', async function(assert) {
    assert.expect(1);
    const controller = this.owner.lookup('controller:application');
    controller.actions.full_screen.call(controller);
    await wait(60);
    assert.strictEqual(this.warnings, 1, 'warned once');
  });

  test('a failed fullscreen does not warn once the controller is gone', async function(assert) {
    assert.expect(1);
    const controller = this.owner.lookup('controller:application');
    controller.actions.full_screen.call(controller);
    controller.destroy(); // sets isDestroying at once
    await wait(60);
    assert.strictEqual(this.warnings, 0, 'no warning raised into another app');
  });
});
