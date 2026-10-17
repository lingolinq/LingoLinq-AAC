import { module, test } from 'qunit';
import capabilities from 'frontend/utils/capabilities';

/*
 * capabilities.sensor_listen starts repeating intervals and window listeners. The app calls it once
 * at load; anything else that calls it (tests) must be able to stop exactly what that call started,
 * or its intervals keep ticking (and writing capabilities / stashes) for the rest of the page.
 */
module('Unit | Utility | capabilities sensor_listen stop', function() {
  test('the returned stop clears the intervals and listeners that call added', function(assert) {
    assert.expect(4);
    // Record each property exactly as it is (some are own properties of window, some inherited from
    // EventTarget.prototype) so the finally block can put window back exactly.
    const KEYS = ['setInterval', 'clearInterval', 'addEventListener', 'removeEventListener'];
    const saved = KEYS.map((k) => [k, Object.getOwnPropertyDescriptor(window, k)]);
    const realSetInterval = window.setInterval;
    const realClearInterval = window.clearInterval;
    const realAdd = window.addEventListener;
    const realRemove = window.removeEventListener;
    const started = [];
    const cleared = [];
    const added = [];
    const removed = [];
    let stopSensors = null;
    try {
      window.setInterval = function() { const id = realSetInterval.apply(window, arguments); started.push(id); return id; };
      window.clearInterval = function(id) { cleared.push(id); return realClearInterval.call(window, id); };
      window.addEventListener = function(type, fn) { added.push([type, fn]); return realAdd.apply(window, arguments); };
      window.removeEventListener = function(type, fn) { removed.push([type, fn]); return realRemove.apply(window, arguments); };
      stopSensors = capabilities.sensor_listen();
      assert.strictEqual(typeof stopSensors, 'function', 'sensor_listen returns a stop function');
      assert.true(started.length > 0, 'it started at least one interval');
      stopSensors();
      assert.deepEqual(started.filter((id) => !cleared.includes(id)), [], 'every interval it started is cleared');
      const ownListeners = added.filter(([type]) => type === 'deviceorientation' || type === 'devicelight');
      assert.deepEqual(ownListeners.filter(([type, fn]) => !removed.some(([t, f]) => t === type && f === fn)), [], 'its window listeners are removed');
    } finally {
      saved.forEach(([k, d]) => { if (d) { Object.defineProperty(window, k, d); } else { delete window[k]; } });
      started.forEach((id) => realClearInterval.call(window, id));
    }
  });
});
