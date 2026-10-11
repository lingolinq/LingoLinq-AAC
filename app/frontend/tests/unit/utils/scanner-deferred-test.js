import { module, test } from 'qunit';
import EmberObject from '@ember/object';
import scanner, { scanner_reset_for, scanner_restart_for } from 'frontend/utils/scanner';
import { recordOwnerGoneSkips } from 'frontend/tests/helpers/owner-gone';

/*
 * The scanner is a module singleton. Its deferred reset (closes the modal highlight, restarts
 * scanning) and deferred restart belong to the app that was scanning when they were scheduled; once
 * that app is gone they must do nothing rather than act on whichever app is current.
 */
module('Unit | Utility | scanner deferred reset and restart', function(hooks) {
  hooks.beforeEach(function() {
    this.calls = { reset: 0, start: 0 };
    this.saved = ['reset', 'start'].map((k) => [k, Object.getOwnPropertyDescriptor(scanner, k)]);
    scanner.reset = () => { this.calls.reset++; };
    scanner.start = () => { this.calls.start++; };
  });
  hooks.afterEach(function() {
    this.saved.forEach(([k, d]) => { if (d) { Object.defineProperty(scanner, k, d); } else { delete scanner[k]; } });
  });

  test('they run for an app that is still alive', function(assert) {
    assert.expect(2);
    const owner = EmberObject.create();
    scanner_reset_for(owner)();
    scanner_restart_for(owner)();
    assert.strictEqual(this.calls.reset, 1, 'the reset ran');
    assert.strictEqual(this.calls.start, 1, 'the restart ran');
  });

  // In production scanner.appState is often unset when a selection is made: the highlight
  // controller passed to scanner.setup has no appState. Nothing captured means no app was torn
  // down, so the restart and reset run, as they always did (2026-10-10 review, switch scanning).
  test('they still run when no app was captured', function(assert) {
    assert.expect(2);
    scanner_reset_for(undefined)();
    scanner_restart_for(null)();
    assert.strictEqual(this.calls.reset, 1, 'the reset ran');
    assert.strictEqual(this.calls.start, 1, 'the restart ran');
  });

  test('they do nothing once the app that scheduled them is gone', function(assert) {
    assert.expect(3);
    const owner = EmberObject.create();
    const reset = scanner_reset_for(owner);
    const restart = scanner_restart_for(owner);
    const skips = recordOwnerGoneSkips(owner);
    try {
      owner.destroy(); // sets isDestroying at once
      reset();
      restart();
      assert.strictEqual(skips.count, 2, 'both guards skipped (and the harness does not report a deliberate skip)');
    } finally {
      skips.restore();
    }
    assert.strictEqual(this.calls.reset, 0, 'no reset in another app');
    assert.strictEqual(this.calls.start, 0, 'no restart in another app');
  });
});
