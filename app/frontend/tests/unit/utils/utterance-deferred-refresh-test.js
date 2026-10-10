import { module, test } from 'qunit';
import EmberObject from '@ember/object';
import LingoLinq from 'frontend/app';
import utterance from 'frontend/utils/utterance';
import { standInGlobals } from 'frontend/tests/helpers/stand-in-globals';
import { recordOwnerGoneSkips } from 'frontend/tests/helpers/owner-gone';

/*
 * set_button_list schedules a suggestions refresh 100 ms later. It belongs to the app that was
 * current when it was scheduled: if that app is gone by then, it must not refresh whichever app is
 * current instead (in CI an earlier test's refresh landed on a later test's app-state).
 */
function fakeAppState() {
  return EmberObject.create({
    refreshed: 0,
    refresh_suggestions() { this.set('refreshed', this.get('refreshed') + 1); }
  });
}

module('Unit | Utility | utterance deferred suggestions refresh', function(hooks) {
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  standInGlobals(hooks, {
    appState: fakeAppState,
    stashes: () => EmberObject.create({ persist() {}, persist_object() {} })
  });
  hooks.beforeEach(function() {
    this.savedRaw = utterance.get('rawButtonList');
    this.savedScheduled = utterance.suggestion_refresh_scheduled;
    utterance.suggestion_refresh_scheduled = false;
  });
  // afterEach hooks run in reverse registration order, so this runs while the stand-ins are still in
  // place. Restoring rawButtonList re-runs set_button_list, which schedules a refresh owned by this
  // test's app: wait for it here, or it fires in the next test against whatever app is current then.
  hooks.afterEach(async function() {
    utterance.set('rawButtonList', this.savedRaw);
    if (utterance.suggestion_refresh_scheduled) { await wait(150); }
    utterance.suggestion_refresh_scheduled = this.savedScheduled;
  });

  test('the refresh runs for the app it was scheduled for', async function(assert) {
    assert.expect(1);
    utterance.set('rawButtonList', []);
    utterance.set_button_list();
    await wait(150);
    assert.strictEqual(this.standIns.appState.get('refreshed'), 1, 'refreshed once');
  });

  test('a refresh scheduled for an app that is gone does not refresh the next one', async function(assert) {
    assert.expect(3);
    utterance.set('rawButtonList', []);
    utterance.set_button_list();
    const next = fakeAppState();
    const skips = recordOwnerGoneSkips(this.standIns.appState);
    try {
      this.standIns.appState.destroy();
      LingoLinq.appState = next; // the stand-in hooks put the original back afterwards
      if (window.LingoLinq) { window.LingoLinq.appState = next; }
      await wait(150);
      assert.strictEqual(skips.count, 1, 'the guard skipped (and the harness does not report a deliberate skip)');
    } finally {
      skips.restore();
    }
    assert.strictEqual(next.get('refreshed'), 0, 'the next app is not refreshed by the old one\'s timer');
    assert.false(utterance.suggestion_refresh_scheduled, 'the scheduling flag is cleared either way');
  });
});
