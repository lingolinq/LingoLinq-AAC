import { module, test } from 'qunit';
import EmberObject from '@ember/object';
import LingoLinq from 'frontend/app';
import Button from 'frontend/utils/button';
import modal from 'frontend/utils/modal';
import speecher from 'frontend/utils/speecher';
import { standInGlobals } from 'frontend/tests/helpers/stand-in-globals';
import { recordOwnerGoneSkips } from 'frontend/tests/helpers/owner-gone';

/*
 * The :timer(Ns) button action ticks every 500 ms and, when the time is up and speak mode is on,
 * beeps and opens the timer modal. It belongs to the app whose button started it: once that app is
 * gone it must stop, not poll (and open a modal in) whichever app is current.
 */
// Other background work also reads speak_mode, so the signal is the modal the leaked tick opens.
function appStateFake() {
  return EmberObject.create({ speak_mode: true });
}

const waitFor = async (check, ms) => { const end = Date.now() + ms; while (!check() && Date.now() < end) { await new Promise((r) => setTimeout(r, 20)); } };

module('Unit | Utility | button timer action', function(hooks) {
  standInGlobals(hooks, { appState: appStateFake });

  test('a timer started for an app that is gone does not act on the next one', async function(assert) {
    assert.expect(2);
    // Replace by exact descriptor and put back exactly (these may be inherited).
    const replaced = [[modal, 'success'], [modal, 'open'], [speecher, 'beep']].map(([obj, k]) => [obj, k, Object.getOwnPropertyDescriptor(obj, k)]);
    let opened = 0;
    modal.success = function() {};
    modal.open = function() { opened++; };
    speecher.beep = function() {};
    const skips = recordOwnerGoneSkips();
    try {
      Button.load_actions();
      const timer = LingoLinq.special_actions.find((a) => a.action === ':timer');
      timer.trigger([':timer(1s)', '1']);

      const next = appStateFake();
      this.standIns.appState.destroy();
      LingoLinq.appState = next; // the stand-in hooks put the original back afterwards
      if (window.LingoLinq) { window.LingoLinq.appState = next; }

      await new Promise((resolve) => setTimeout(resolve, 1700));
      assert.strictEqual(opened, 0, 'no timer modal opened in the next app');
      assert.strictEqual(skips.count, 1, 'the guard skipped (and the harness does not report a deliberate skip)');
    } finally {
      skips.restore();
      replaced.forEach(([obj, k, d]) => { if (d) { Object.defineProperty(obj, k, d); } else { delete obj[k]; } });
    }
  });

  test('a timer whose app is still current opens the timer modal and beeps twice (positive control)', async function(assert) {
    assert.expect(2);
    const replaced = [[modal, 'success'], [modal, 'open'], [speecher, 'beep']].map(([obj, k]) => [obj, k, Object.getOwnPropertyDescriptor(obj, k)]);
    let opened = 0;
    let beeps = 0;
    modal.success = function() {};
    modal.open = function() { opened++; };
    speecher.beep = function() { beeps++; };
    try {
      Button.load_actions();
      LingoLinq.special_actions.find((a) => a.action === ':timer').trigger([':timer(1s)', '1']);
      // wait for the reminder beep too (1.5 s after the first), so none of this test's work outlives it
      await waitFor(() => beeps >= 2, 4000);
      assert.strictEqual(opened, 1, 'the timer modal opened once the time was up');
      assert.strictEqual(beeps, 2, 'it beeped, then beeped again as a reminder');
    } finally {
      replaced.forEach(([obj, k, d]) => { if (d) { Object.defineProperty(obj, k, d); } else { delete obj[k]; } });
    }
  });

  test('the reminder beep does not sound once its app is gone', async function(assert) {
    assert.expect(3);
    const replaced = [[modal, 'success'], [modal, 'open'], [speecher, 'beep']].map(([obj, k]) => [obj, k, Object.getOwnPropertyDescriptor(obj, k)]);
    let opened = 0;
    let beeps = 0;
    modal.success = function() {};
    modal.open = function() { opened++; };
    speecher.beep = function() { beeps++; };
    const skips = recordOwnerGoneSkips();
    try {
      Button.load_actions();
      LingoLinq.special_actions.find((a) => a.action === ':timer').trigger([':timer(1s)', '1']);
      await waitFor(() => opened >= 1, 2500);
      assert.strictEqual(beeps, 1, 'the time-up beep sounded while the app was alive');
      this.standIns.appState.destroy();
      await new Promise((resolve) => setTimeout(resolve, 1700));
      assert.strictEqual(beeps, 1, 'no reminder beep after the app is gone');
      assert.strictEqual(skips.count, 1, 'the guard skipped (and the harness does not report a deliberate skip)');
    } finally {
      skips.restore();
      replaced.forEach(([obj, k, d]) => { if (d) { Object.defineProperty(obj, k, d); } else { delete obj[k]; } });
    }
  });
});
