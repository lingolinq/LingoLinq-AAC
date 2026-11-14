import { module, test } from 'qunit';
import RSVP from 'rsvp';
import EmberObject from '@ember/object';
import { settled } from '@ember/test-helpers';
import speecher from 'frontend/utils/speecher';
import piper_tts from 'frontend/utils/piper_tts';
import capabilities from 'frontend/utils/capabilities';
import { standInGlobals } from 'frontend/tests/helpers/stand-in-globals';

/*
 * Piper voices (feature flag piper_voices) join speecher's voice list only while the signed-in
 * user has the flag, which arrives with the user after the first list is built at boot. A
 * 'piper:' voice speaks through piper_tts, and when Piper cannot speak yet the device voice speaks
 * instead: speech is never dropped.
 */
const DEVICE = [{ voiceURI: 'Google US English', name: 'Google US English', lang: 'en-US' }];
const PIPER_URI = 'piper:en_US-amy-medium';

function own(obj, key) { return Object.getOwnPropertyDescriptor(obj, key); }
function put(obj, key, desc) { if (desc) { Object.defineProperty(obj, key, desc); } else { delete obj[key]; } }

module('Unit | Utility | speecher Piper voices', function(hooks) {
  standInGlobals(hooks, { appState: () => EmberObject.create({ feature_flags: {}, vocalization_locale: null }) });
  hooks.beforeEach(function() {
    this.saved = {
      speecher: ['appState', 'scope', 'voiceURI', '_built_voices', '_device_voice_count', '_device_voice_key', 'reapply_user_voice'].map((k) => [k, own(speecher, k)]),
      voices: speecher.get('voices'),
      piper: { loader: piper_tts.loader, player: piper_tts.player, notifier: piper_tts.notifier, sessions: piper_tts.sessions, session_order: piper_tts.session_order, loading: piper_tts.loading, announced: piper_tts.announced },
      tts_speak: own(capabilities.tts, 'speak_text')
    };
    speecher.appState = this.standIns.appState;
    speecher._built_voices = null;
    this.reapplied = 0;
    speecher.reapply_user_voice = () => { this.reapplied++; };
    this.played = [];
    this.spoken = [];
    piper_tts.sessions = {};
    piper_tts.session_order = [];
    piper_tts.loading = {};
    piper_tts.announced = {};
    piper_tts.notifier = { notice() {} };
    piper_tts.loader = { load_voice: () => RSVP.resolve({ synthesize: (text) => RSVP.resolve('wav:' + text) }) };
    piper_tts.player = { play: (wav) => { this.played.push(wav); return RSVP.resolve(); }, stop() {} };
    this.addonCalls = 0;
    capabilities.tts.speak_text = () => { this.addonCalls++; return RSVP.reject({ error: 'not here' }); };
    const spoken = this.spoken;
    speecher.scope = {
      speechSynthesis: {
        speak(u) { spoken.push(u.text); u.onend && u.onend(); (u._listeners || {}).end && u._listeners.end.forEach((f) => f()); },
        cancel() {},
        getVoices() { return []; }
      },
      SpeechSynthesisUtterance: function() {
        this._listeners = {};
        this.addEventListener = (type, fn) => { (this._listeners[type] = this._listeners[type] || []).push(fn); };
      }
    };
  });
  hooks.afterEach(async function() {
    await settled();
    put(capabilities.tts, 'speak_text', this.saved.tts_speak);
    Object.keys(this.saved.piper).forEach((k) => { piper_tts[k] = this.saved.piper[k]; });
    speecher.set('voices', this.saved.voices);
    this.saved.speecher.forEach(([k, desc]) => put(speecher, k, desc));
  });

  test('flag off: no Piper voices are listed', function(assert) {
    this.standIns.appState.set('feature_flags', { piper_voices: false });
    const list = speecher.with_piper_voices(DEVICE.slice());
    assert.deepEqual(list.map((v) => v.voiceURI), ['Google US English']);
  });

  test('flag on: Piper voices follow the device voices', function(assert) {
    this.standIns.appState.set('feature_flags', { piper_voices: true });
    const list = speecher.with_piper_voices(DEVICE.slice());
    assert.strictEqual(list[0].voiceURI, 'Google US English', 'device voice stays first');
    assert.ok(list.some((v) => v.voiceURI == PIPER_URI), 'Amy is listed');
    assert.strictEqual(list.length, 1 + piper_tts.voices().length);
  });

  test('turning the flag on after boot adds the voices and finds the saved voice again', function(assert) {
    this.standIns.appState.set('feature_flags', {});
    speecher.store_voice_list(speecher.with_piper_voices(DEVICE.slice()), 1);
    assert.notOk(speecher.get('voices').some((v) => v.piper_voice), 'none at boot');
    this.standIns.appState.set('feature_flags', { piper_voices: true });
    speecher.apply_piper_voices();
    assert.ok(speecher.get('voices').some((v) => v.voiceURI == PIPER_URI), 'added once the user has the flag');
    assert.strictEqual(this.reapplied, 1, 'the saved voice is looked up again');
    speecher.apply_piper_voices();
    assert.strictEqual(this.reapplied, 1, 'no change, no second lookup');
    this.standIns.appState.set('feature_flags', {});
    speecher.apply_piper_voices();
    assert.notOk(speecher.get('voices').some((v) => v.piper_voice), 'removed when the flag goes off');
    assert.strictEqual(speecher.get('voices')[0].voiceURI, 'Google US English', 'device voice kept');
  });

  test('a loaded Piper voice speaks through Piper, not the add-on voice bridge', async function(assert) {
    this.standIns.appState.set('feature_flags', { piper_voices: true });
    speecher.store_voice_list(speecher.with_piper_voices(DEVICE.slice()), 1);
    await piper_tts.preload(PIPER_URI);
    let done = false;
    speecher.speak_raw_text('I want more', 'c1', { voiceURI: PIPER_URI, interrupt: false }, () => { done = true; });
    await settled();
    assert.true(done, 'callback ran when playback finished');
    assert.deepEqual(this.played, ['wav:I want more'], 'Piper played it');
    assert.strictEqual(this.addonCalls, 0, 'capabilities.tts was not used');
    assert.deepEqual(this.spoken, [], 'the device voice did not also speak');
  });

  test('a Piper voice that is still downloading falls back to the device voice', async function(assert) {
    this.standIns.appState.set('feature_flags', { piper_voices: true });
    speecher.store_voice_list(speecher.with_piper_voices(DEVICE.slice()), 1);
    let done = false;
    speecher.speak_raw_text('I want more', 'c1', { voiceURI: PIPER_URI, interrupt: false }, () => { done = true; });
    await settled();
    assert.deepEqual(this.spoken, ['I want more'], 'the device voice spoke');
    assert.true(done, 'callback ran');
    assert.deepEqual(this.played, [], 'Piper did not play');
    await piper_tts.loading['en_US-amy-medium'];
    assert.ok(piper_tts.sessions['en_US-amy-medium'], 'the download was started for next time');
  });
});
