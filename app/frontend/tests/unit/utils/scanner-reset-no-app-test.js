import { module, test } from 'qunit';
import scanner, { scanner_reset_for } from 'frontend/utils/scanner';
import modal from 'frontend/utils/modal';

/*
 * The production state for switch scanning: the highlight controller passed to scanner.setup has no
 * appState, so scanner.appState is unset when a selection schedules the reset (utils/scanner.js, the
 * runLater(scanner_reset_for(...)) after an axes selection). The REAL scanner.reset must still run
 * then: cancel the pending scan step, close the highlight, and ask scanning to start again. Only the
 * parts that touch the DOM are replaced here; scanner.reset itself is not. (What start() then does with
 * appState unset, stop first and resume through check_scanning, is unchanged from develop.)
 */
module('Unit | Utility | scanner reset with no app captured', function(hooks) {
  hooks.beforeEach(function() {
    this.calls = { start: 0, listen: 0, close: 0 };
    this.saved = [[scanner, 'start'], [scanner, 'listen_for_input'], [scanner, 'scan_axes'], [modal, 'close_highlight']]
      .map(([obj, k]) => [obj, k, Object.getOwnPropertyDescriptor(obj, k)]);
    scanner.start = () => { this.calls.start++; };
    scanner.listen_for_input = () => { this.calls.listen++; };
    scanner.scan_axes = () => {};
    modal.close_highlight = () => { this.calls.close++; };
    this.savedAppState = scanner.get('appState');
    this.savedInterval = scanner.interval;
  });
  hooks.afterEach(function() {
    this.saved.forEach(([obj, k, d]) => { if (d) { Object.defineProperty(obj, k, d); } else { delete obj[k]; } });
    scanner.set('appState', this.savedAppState);
    scanner.interval = this.savedInterval;
  });

  test('the real reset runs when scanner.appState is unset', function(assert) {
    assert.expect(4);
    scanner.set('appState', undefined);
    scanner.interval = 'a pending scan step'; // reset cancels it (cancelling an unknown timer is a no-op) and clears it
    scanner_reset_for(scanner.get('appState'))();
    assert.strictEqual(scanner.interval, null, 'the pending scan step was cancelled');
    assert.strictEqual(this.calls.close, 1, 'the highlight was closed');
    assert.strictEqual(this.calls.start, 1, 'scanning was asked to start again');
    assert.strictEqual(this.calls.listen, 1, 'and listens for the switch again');
  });
});
