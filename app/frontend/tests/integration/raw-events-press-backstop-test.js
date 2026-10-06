import { setupRenderingTest } from 'frontend/tests/helpers';
import { render } from '@ember/test-helpers';
import { _backburner } from '@ember/runloop';
import { hbs } from 'ember-cli-htmlbars';
import * as QUnit from 'qunit';
import buttonTracker from 'frontend/utils/raw_events';

/*
 * A press outside .advanced_selection stores buttonTracker.triggerEvent and schedules a
 * 5s backstop that clears it if no release ever arrives (raw_events.js touch_start). As a
 * run-loop timer it held every settled() — so every `await click()` in the suite — for 5s.
 * The press is dispatched WITHOUT awaiting: awaiting would let the 5s timer fire first.
 */
QUnit.module('Integration | raw_events press backstop', function(hooks) {
  setupRenderingTest(hooks);

  // Backburner keeps timers as flat 6-slot records: [executeAt, id, target, method, args, stack].
  function longTimerIds() {
    var ids = [], t = _backburner._timers, soon = Date.now() + 3000;
    for (var i = 0; i < t.length; i += 6) { if (t[i] > soon) { ids.push(t[i + 1]); } }
    return ids;
  }

  QUnit.test('a press does not leave a long run-loop timer pending', async function(assert) {
    await render(hbs`<button type="button" id="press-probe">x</button>`);
    assert.ok(Array.isArray(_backburner._timers), 'backburner still keeps timers as a flat array (else this test reads nothing)');
    var before = longTimerIds();
    document.getElementById('press-probe').dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    var added = longTimerIds().filter(function(id) { return before.indexOf(id) == -1; });
    assert.ok(buttonTracker.triggerEvent, 'the press was handled and stored as triggerEvent');
    assert.deepEqual(added, [], 'no run-loop timer due more than 3s out was added by the press');
    document.getElementById('press-probe').dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
  });
});
