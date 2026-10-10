import { module, test } from 'qunit';
import RSVP from 'rsvp';
import EmberObject from '@ember/object';
import speecher from 'frontend/utils/speecher';
import { standInGlobals } from 'frontend/tests/helpers/stand-in-globals';
import { recordOwnerGoneSkips } from 'frontend/tests/helpers/owner-gone';

/*
 * When a sound ends, speecher's handler advances the speech queue (speak_end_handler -> next_speak),
 * which plays the next item through whichever app is current. Playback belongs to the app that was
 * live when it started: once that app is gone, a late `ended` (or the status poll) must not advance
 * another app's queue.
 */
function fakeAudio() {
  const listeners = {};
  const el = document.createElement('div');
  el.src = 'http://www.example.com/sound.mp3';
  el.duration = 10;
  el.currentTime = 0;
  el.pause = () => {};
  el.load = () => {};
  el.play = () => { el.played = true; return RSVP.resolve(); };
  el.addEventListener = (type, cb) => { (listeners[type] = listeners[type] || []).push(cb); };
  el.removeEventListener = (type, cb) => { listeners[type] = (listeners[type] || []).filter((f) => f !== cb); };
  el.dispatchEvent = (ev) => { (listeners[ev.type] || []).forEach((cb) => cb(ev)); };
  return el;
}
const waitFor = async (check) => { for (let i = 0; i < 100 && !check(); i++) { await new Promise((r) => setTimeout(r, 10)); } };

module('Unit | Utility | speecher playback after its app is gone', function(hooks) {
  standInGlobals(hooks, { appState: () => EmberObject.create({}) });
  hooks.beforeEach(function() {
    this.ended = [];
    this.savedServices = Object.assign({}, speecher._services);
    speecher._services.app_state = null; // so the playback's owner is this test's stand-in app-state
    this.savedHandler = Object.getOwnPropertyDescriptor(speecher, 'speak_end_handler');
    speecher.speak_end_handler = (id) => { this.ended.push(id); };
  });
  hooks.afterEach(function() {
    if (this.savedHandler) { Object.defineProperty(speecher, 'speak_end_handler', this.savedHandler); } else { delete speecher.speak_end_handler; }
    speecher._services = this.savedServices;
  });

  test('an end event while its app is alive advances the queue (positive control)', async function(assert) {
    assert.expect(1);
    const audio = fakeAudio();
    speecher.play_audio({ audio, speak_id: 1 });
    await waitFor(() => audio.played);
    audio.dispatchEvent(new window.Event('ended'));
    assert.deepEqual(this.ended, [1], 'speak_end_handler ran once');
  });

  test('an end event after its app is gone does not advance another app\'s queue', async function(assert) {
    assert.expect(2);
    const audio = fakeAudio();
    speecher.play_audio({ audio, speak_id: 1 });
    await waitFor(() => audio.played);
    const skips = recordOwnerGoneSkips();
    try {
      this.standIns.appState.destroy(); // sets isDestroying at once
      audio.dispatchEvent(new window.Event('ended'));
      assert.strictEqual(skips.count, 1, 'the guard skipped (and the harness does not report a deliberate skip)');
    } finally {
      skips.restore();
    }
    assert.deepEqual(this.ended, [], 'speak_end_handler did not run');
  });
});
