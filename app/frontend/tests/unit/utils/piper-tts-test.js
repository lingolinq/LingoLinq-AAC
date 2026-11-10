import { module, test } from 'qunit';
import RSVP from 'rsvp';
import piper_tts from 'frontend/utils/piper_tts';

/*
 * piper_tts is the engine behind the 'piper:' voices (feature flag piper_voices). Speech must never
 * wait on a download: a voice that is not loaded yet rejects at once (speecher then speaks with the
 * device voice) and starts loading in the background. The loader, player and notifier seams keep
 * these tests off the network, WebAssembly, audio and the modal.
 */
function fakeLoader(log) {
  return {
    load_voice(key, url) {
      log.push(['load', key, url]);
      return RSVP.resolve({
        synthesize(text, opts) {
          log.push(['synthesize', key, text, opts.rate]);
          return RSVP.resolve('wav:' + text);
        },
        release() { log.push(['release', key]); }
      });
    }
  };
}

module('Unit | Utility | piper_tts', function(hooks) {
  hooks.beforeEach(function() {
    this.saved = {
      loader: piper_tts.loader, player: piper_tts.player, notifier: piper_tts.notifier,
      sessions: piper_tts.sessions, session_order: piper_tts.session_order,
      loading: piper_tts.loading, announced: piper_tts.announced
    };
    this.log = [];
    this.notices = [];
    this.played = [];
    piper_tts.sessions = {};
    piper_tts.session_order = [];
    piper_tts.loading = {};
    piper_tts.announced = {};
    piper_tts.loader = fakeLoader(this.log);
    piper_tts.player = {
      play: (wav, opts) => { this.played.push([wav, opts.volume]); return RSVP.resolve(); },
      stop: () => { this.log.push(['stop']); }
    };
    piper_tts.notifier = { notice: (text) => { this.notices.push(text); } };
  });
  hooks.afterEach(function() {
    Object.keys(this.saved).forEach((k) => { piper_tts[k] = this.saved[k]; });
  });

  test('lists each curated voice as a piper: voice kept out of automatic fallbacks', function(assert) {
    const entries = piper_tts.voice_list_entries();
    assert.strictEqual(entries.length, piper_tts.voices().length, 'one entry per curated voice');
    const amy = entries.find((v) => v.voiceURI == 'piper:en_US-amy-medium');
    assert.ok(amy, 'Amy is listed');
    assert.strictEqual(amy.lang, 'en-US');
    assert.true(amy.remote_voice, 'remote_voice keeps it out of find_voice_by_uri fallbacks');
    assert.true(amy.piper_voice, 'marked so speecher can add and remove the set');
    assert.ok(/Amy/.test(amy.name), 'the name says which voice');
    assert.ok(/63/.test(amy.name), 'the name says the download size');
  });

  test('builds the model URL from the voice key', function(assert) {
    assert.strictEqual(piper_tts.key_for('piper:en_US-amy-medium'), 'en_US-amy-medium');
    assert.strictEqual(piper_tts.key_for('extra:acap:Ella'), null, 'other voices are not Piper voices');
    assert.ok(piper_tts.model_url('en_US-amy-medium').match(/\/en\/en_US\/amy\/medium\/en_US-amy-medium\.onnx$/));
  });

  test('a voice that is not loaded yet rejects at once, starts loading and says so once', async function(assert) {
    let rejected = null;
    await piper_tts.speak_text('hello', { voice_id: 'piper:en_US-amy-medium' }).then(null, (err) => { rejected = err; });
    assert.deepEqual(rejected, { error: 'piper voice loading' }, 'rejects so the device voice speaks');
    await piper_tts.loading['en_US-amy-medium'];
    assert.deepEqual(this.log.map((e) => e[0]), ['load'], 'the download started');
    assert.strictEqual(this.notices.length, 1, 'one notice about the download');
    assert.deepEqual(this.played, [], 'nothing played');
  });

  test('a loaded voice synthesizes and plays, with the rate clamped and the volume passed on', async function(assert) {
    await piper_tts.preload('piper:en_US-amy-medium');
    await piper_tts.speak_text('I want more', { voice_id: 'piper:en_US-amy-medium', rate: 5, volume: 0.5 });
    assert.deepEqual(this.log.filter((e) => e[0] == 'synthesize'), [['synthesize', 'en_US-amy-medium', 'I want more', 2]]);
    assert.deepEqual(this.played, [['wav:I want more', 0.5]]);
    assert.strictEqual(this.notices.length, 0, 'no download notice for a loaded voice');
  });

  test('an unknown voice rejects without loading anything', async function(assert) {
    let rejected = null;
    await piper_tts.speak_text('hello', { voice_id: 'piper:xx_XX-nobody-medium' }).then(null, (err) => { rejected = err; });
    assert.deepEqual(rejected, { error: 'piper voice not available' });
    assert.deepEqual(this.log, [], 'no download');
  });

  test('keeps at most two loaded voices and releases the oldest', async function(assert) {
    await piper_tts.preload('piper:en_US-amy-medium');
    await piper_tts.preload('piper:es_MX-claude-high');
    await piper_tts.preload('piper:fr_FR-siwis-medium');
    assert.deepEqual(Object.keys(piper_tts.sessions).sort(), ['es_MX-claude-high', 'fr_FR-siwis-medium']);
    assert.deepEqual(this.log.filter((e) => e[0] == 'release'), [['release', 'en_US-amy-medium']]);
  });

  test('stop_text stops playback', async function(assert) {
    await piper_tts.stop_text();
    assert.deepEqual(this.log, [['stop']]);
  });

  test('pcm_to_wav writes a 16-bit mono WAV', async function(assert) {
    const wav = piper_tts.pcm_to_wav(new Float32Array([0, 0.5, -0.5, 1]), 22050);
    const bytes = new Uint8Array(await wav.arrayBuffer());
    const view = new DataView(bytes.buffer);
    assert.strictEqual(String.fromCharCode(...bytes.slice(0, 4)), 'RIFF');
    assert.strictEqual(String.fromCharCode(...bytes.slice(8, 12)), 'WAVE');
    assert.strictEqual(view.getUint32(24, true), 22050, 'sample rate');
    assert.strictEqual(bytes.length, 44 + 8, 'header plus two bytes per sample');
  });
});
