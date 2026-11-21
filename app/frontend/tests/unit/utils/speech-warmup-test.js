import { module, test } from 'qunit';
import { WARMUP_TEXT, is_custom_voice, native_voice_for, warm_voice } from 'frontend/utils/speech_warmup';

/* THE FIRST WORD SPOKEN ON ANDROID STARTS LATE
 * (docs/task-management/2026-11-21_android-first-word-delay.md).
 *
 * Android loads a voice the first time it speaks with it (about 0.9 s on the emulator). A silent utterance in the
 * person's voice, spoken on an earlier touch and not cancelled, loads it ahead of the first word. */
module('Unit | Utility | speech warmup', function() {
  function fakeSynth(extra) {
    var synth = Object.assign({ spoken: [], speaking: false, pending: false }, extra || {});
    synth.speak = function(u) { synth.spoken.push(u); };
    return synth;
  }
  function Utterance(text) { this.text = text; this.volume = 1; }
  var aussie = { voiceURI: 'English Australia', name: 'English Australia', lang: 'en-AU' };

  test('a comma at volume 0 in the given voice is handed to the engine, and not cancelled', function(assert) {
    var synth = fakeSynth();
    synth.cancel = function() { assert.ok(false, 'cancel must not be called'); };
    assert.true(warm_voice(synth, Utterance, aussie));
    assert.strictEqual(synth.spoken.length, 1);
    var u = synth.spoken[0];
    assert.strictEqual(u.text, ',');
    assert.strictEqual(WARMUP_TEXT, ',', 'punctuation, so it is silent even where volume is ignored');
    assert.strictEqual(u.volume, 0);
    assert.strictEqual(u.voice, aussie);
    assert.strictEqual(u.lang, 'en-AU');
  });

  test('nothing is spoken while a word is speaking or queued', function(assert) {
    var speaking = fakeSynth({ speaking: true });
    assert.false(warm_voice(speaking, Utterance, aussie));
    assert.strictEqual(speaking.spoken.length, 0);
    var queued = fakeSynth({ pending: true });
    assert.false(warm_voice(queued, Utterance, aussie));
    assert.strictEqual(queued.spoken.length, 0);
  });

  test('nothing is spoken without an engine, an utterance class or a voice', function(assert) {
    assert.false(warm_voice(null, Utterance, aussie));
    assert.false(warm_voice(fakeSynth(), null, aussie));
    var synth = fakeSynth();
    assert.false(warm_voice(synth, Utterance, null));
    assert.strictEqual(synth.spoken.length, 0);
  });

  test('the device voice is found by voiceURI, or by name and language', function(assert) {
    var natives = [{ voiceURI: 'x', name: 'Other', lang: 'en-US' }, aussie];
    assert.strictEqual(native_voice_for(natives, { voiceURI: 'English Australia' }), aussie);
    assert.strictEqual(native_voice_for(natives, { voiceURI: 'renamed', name: 'English Australia', lang: 'en-AU' }), aussie);
    assert.strictEqual(native_voice_for(natives, { voiceURI: 'renamed', name: 'English Australia', lang: 'en-GB' }), undefined);
    assert.strictEqual(native_voice_for([], aussie), undefined);
    assert.strictEqual(native_voice_for(natives, null), undefined);
  });

  test('custom voices are the ones speechSynthesis does not speak', function(assert) {
    assert.true(is_custom_voice({ voiceURI: 'tts:abc' }));
    assert.true(is_custom_voice({ voiceURI: 'extra:abc' }));
    assert.true(is_custom_voice({ voiceURI: 'remote:abc' }));
    assert.true(is_custom_voice({ voiceURI: 'speak_js:en' }));
    assert.true(is_custom_voice({ voiceURI: 'English Australia', remote_voice: true }));
    assert.false(is_custom_voice(aussie));
    assert.false(is_custom_voice({ voiceURI: '', remote_voice: true }), 'as before: no voiceURI is not custom');
    assert.false(is_custom_voice(null));
  });
});
