import { module, test } from 'qunit';
import EmberObject from '@ember/object';
import word_suggestions from 'frontend/utils/word_suggestions';
import { standInGlobals } from 'frontend/tests/helpers/stand-in-globals';

/*
 * schedule_sync_flush posts the queued word-usage sync after a delay, through whichever app is
 * current. It belongs to the app that scheduled it: once that app is gone it must not post (the queue
 * stays in localStorage for the next flush).
 */
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

module('Unit | Utility | word_suggestions sync flush after its app is gone', function(hooks) {
  standInGlobals(hooks, { appState: () => EmberObject.create({}) });
  hooks.beforeEach(function() {
    this.flushes = 0;
    this.savedFlush = Object.getOwnPropertyDescriptor(word_suggestions, 'flush_sync_queue');
    word_suggestions.flush_sync_queue = () => { this.flushes++; };
    word_suggestions.sync_flush_delay = 10;
  });
  hooks.afterEach(function() {
    delete word_suggestions.sync_flush_delay;
    if (this.savedFlush) { Object.defineProperty(word_suggestions, 'flush_sync_queue', this.savedFlush); } else { delete word_suggestions.flush_sync_queue; }
  });

  test('the flush runs while its app is alive (positive control)', async function(assert) {
    assert.expect(2);
    assert.false(word_suggestions.sync_flush_scheduled(), 'no earlier flush is pending');
    word_suggestions.schedule_sync_flush();
    await wait(60);
    assert.strictEqual(this.flushes, 1, 'flushed once');
  });

  // Earlier tests cancel the flush they schedule (record_selection), so none is pending here; a
  // cancelled flush never runs.
  test('a cancelled flush does not run', async function(assert) {
    assert.expect(3);
    assert.false(word_suggestions.sync_flush_scheduled(), 'no earlier flush is pending');
    word_suggestions.schedule_sync_flush();
    assert.true(word_suggestions.cancel_sync_flush(), 'it was pending and is cancelled');
    await wait(60);
    assert.strictEqual(this.flushes, 0, 'not flushed');
  });

  test('the flush does not run once its app is gone', async function(assert) {
    assert.expect(2);
    assert.false(word_suggestions.sync_flush_scheduled(), 'no earlier flush is pending');
    word_suggestions.schedule_sync_flush();
    this.standIns.appState.destroy(); // sets isDestroying at once
    await wait(60);
    assert.strictEqual(this.flushes, 0, 'no post through another app');
  });
});
