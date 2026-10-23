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
    this.attempt = null;
    capabilities.fullscreen = () => { this.attempt = new RSVP.Promise((resolve, reject) => { setTimeout(reject, 20); }); return this.attempt; };
    modal.warning = () => { this.warnings++; };
  });
  hooks.afterEach(function() {
    this.saved.forEach(([obj, k, d]) => { if (d) { Object.defineProperty(obj, k, d); } else { delete obj[k]; } });
  });

  // Waits for the fullscreen attempt to fail, then one more tick so the action's failure handler has run:
  // the negative case asserts after the warning WOULD have been raised, not merely after a fixed delay.
  async function attemptAnswered(context) {
    await context.attempt.then(null, () => {});
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  test('a failed fullscreen warns while the controller is alive (positive control)', async function(assert) {
    assert.expect(1);
    const controller = this.owner.lookup('controller:application');
    controller.actions.full_screen.call(controller);
    await attemptAnswered(this);
    assert.strictEqual(this.warnings, 1, 'warned once');
  });

  test('a failed fullscreen does not warn once the controller is gone', async function(assert) {
    assert.expect(1);
    const controller = this.owner.lookup('controller:application');
    controller.actions.full_screen.call(controller);
    controller.destroy(); // sets isDestroying at once
    await attemptAnswered(this);
    assert.strictEqual(this.warnings, 0, 'no warning raised into another app');
  });
});
