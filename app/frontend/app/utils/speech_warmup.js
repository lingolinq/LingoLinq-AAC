// The first word spoken on Android starts late: the device loads a voice the first time it speaks with it. On the
// Android emulator (Chrome 124, Google TTS), the first word after a tap started about 0.9 s after the tap and every
// later word about 0.1 s after (docs/task-management/2026-11-21_android-first-word-delay.md).
//
// speecher.unlock_speech (utils/speecher.js) does not load the voice: it runs on the same tap as the first word, its
// zero-width text fails before it reaches the engine, it names no voice, and it is cancelled at once. A silent
// utterance in the person's own voice, spoken on an earlier touch and left to finish, does load it: the first word
// then started about 0.1 s after the tap. A comma is used so the warm-up stays silent even on an engine that ignores
// volume. The warm-up is not cancelled here: speak_text's stop() cancels it if a word is spoken before it ends.

export var WARMUP_TEXT = ',';

// True for a voice the app speaks itself or through a plugin, not through speechSynthesis (speecher.speak_text).
export function is_custom_voice(voice) {
  return !!(voice && voice.voiceURI && (voice.voiceURI.match(/^(extra|remote|tts|speak_js):/) || voice.remote_voice));
}

// The device voice (from speechSynthesis.getVoices()) that matches one of the app's voice records: the same
// voiceURI, or the same name and language. Undefined when none matches.
export function native_voice_for(native_voices, voice) {
  if(!voice || !native_voices || !native_voices.length) { return undefined; }
  return native_voices.find(function(v) {
    return v.voiceURI === voice.voiceURI || (v.name === voice.name && v.lang === voice.lang);
  });
}

// Speaks the silent warm-up in `native_voice`. Skipped (false) while anything is speaking or queued, so it never
// delays or cuts off a word; true when it was handed to the engine. `on_start` runs when the engine starts it, the
// sign the voice was loaded; a warm-up cancelled before that never calls it.
export function warm_voice(synth, Utterance, native_voice, on_start) {
  if(!synth || !Utterance || !native_voice || synth.speaking || synth.pending) { return false; }
  var u = new Utterance(WARMUP_TEXT);
  u.volume = 0;
  u.voice = native_voice;
  u.lang = native_voice.lang;
  if(on_start && u.addEventListener) { u.addEventListener('start', on_start); }
  synth.speak(u);
  return true;
}
