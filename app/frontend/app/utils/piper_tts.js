/**
Piper text-to-speech in the browser (feature flag `piper_voices`, off by default).

Piper (https://github.com/rhasspy/piper, MIT) voices run on the device: text is turned into
phonemes by espeak-ng compiled to WebAssembly, then a Piper ONNX model turns the phonemes into
audio with onnxruntime-web. No text a user speaks leaves the device. What is downloaded is the
engine (once, from jsDelivr, which the CSP already allows) and each voice model (63 to 115 MB,
once per voice, kept in Cache Storage so it keeps working offline).

speecher.js lists these voices with voiceURI 'piper:<key>' and speaks them through
speak_text() below, the same contract capabilities.tts offers for add-on voices: the promise
resolves when the audio has finished (or was stopped) and rejects when Piper cannot speak, and
speecher then falls back to the device voice. A voice whose model is not downloaded yet rejects
at once and starts the download, so speech is never held up waiting for it.

Before production, MODEL_BASE should point at our own storage rather than Hugging Face.
**/

import RSVP from 'rsvp';
import i18n from './i18n';

var ORT_BASE = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.18.0/dist/';
var PHONEMIZE_BASE = 'https://cdn.jsdelivr.net/npm/@diffusionstudio/piper-wasm@1.0.0/build/piper_phonemize';
// Pinned to one commit of rhasspy/piper-voices so a voice file cannot change under us
var MODEL_BASE = 'https://huggingface.co/rhasspy/piper-voices/resolve/cf910fb59f1d79ab3b625a63993a108751c6c25d/';
var CACHE_NAME = 'lingolinq-piper-voices-v1';
var MAX_SESSIONS = 2;

// Curated single-speaker voices: the languages US districts ask for most, each checked by ear
// and by a speech-to-text round trip (docs/task-management/2026-11-09_piper-voices.md).
var VOICES = [
  {key: 'en_US-amy-medium', name: 'Amy', lang: 'en-US', size: 63},
  {key: 'en_US-ryan-medium', name: 'Ryan', lang: 'en-US', size: 63},
  {key: 'es_MX-claude-high', name: 'Claude', lang: 'es-MX', size: 63},
  {key: 'fr_FR-siwis-medium', name: 'Siwis', lang: 'fr-FR', size: 63},
  {key: 'pt_BR-faber-medium', name: 'Faber', lang: 'pt-BR', size: 63},
  {key: 'de_DE-thorsten-medium', name: 'Thorsten', lang: 'de-DE', size: 63},
  {key: 'ru_RU-irina-medium', name: 'Irina', lang: 'ru-RU', size: 63},
  {key: 'uk_UA-tetiana-high', name: 'Tetiana', lang: 'uk-UA', size: 114},
  {key: 'ar_JO-kareem-medium', name: 'Kareem', lang: 'ar-JO', size: 63},
  {key: 'zh_CN-huayan-medium', name: 'Huayan', lang: 'zh-CN', size: 63},
  {key: 'vi_VN-vais1000-medium', name: 'Vais1000', lang: 'vi-VN', size: 63},
  {key: 'hi_IN-priyamvada-medium', name: 'Priyamvada', lang: 'hi-IN', size: 64},
  {key: 'sw_CD-lanfrica-medium', name: 'Lanfrica', lang: 'sw-CD', size: 63}
];

var piper_tts = {
  // test seams: replaced in tests so no network, WebAssembly, audio or modal is touched
  loader: null,
  player: null,
  notifier: null,
  sessions: {},
  session_order: [],
  loading: {},
  announced: {},
  current_audio: null,
  current_done: null,

  supported: function() {
    return typeof window !== 'undefined' && typeof window.WebAssembly === 'object' &&
      typeof window.fetch === 'function' && typeof window.Audio === 'function';
  },
  voices: function() {
    return VOICES.slice();
  },
  key_for: function(voice_id) {
    var match = (voice_id || '').toString().match(/^piper:(.+)$/);
    return match ? match[1] : null;
  },
  find: function(key) {
    return VOICES.find(function(v) { return v.key == key; }) || null;
  },
  model_url: function(key) {
    // en_US-amy-medium -> en/en_US/amy/medium/en_US-amy-medium.onnx
    var parts = key.split('-');
    return MODEL_BASE + parts[0].split('_')[0] + '/' + parts[0] + '/' + parts[1] + '/' + parts[2] + '/' + key + '.onnx';
  },
  // The entries speecher adds to its voice list. remote_voice keeps them out of the automatic
  // locale fallbacks (speecher.find_voice_by_uri), so a voice is only used, and only
  // downloaded, when someone picks it.
  voice_list_entries: function() {
    if(!piper_tts.supported()) { return []; }
    return VOICES.map(function(v) {
      return {
        name: i18n.t('piper_voice_name', "%{name} (Open Voice, %{size} MB download)", {name: v.name, size: v.size}),
        lang: v.lang,
        voiceURI: 'piper:' + v.key,
        remote_voice: true,
        piper_voice: true
      };
    });
  },
  // Starts loading a voice so it is ready before it is first needed. Never rejects.
  preload: function(voice_id) {
    var key = piper_tts.key_for(voice_id);
    if(!key || !piper_tts.find(key) || !piper_tts.supported()) { return RSVP.resolve(false); }
    return piper_tts.session_for(key).then(function() { return true; }, function() { return false; });
  },
  session_for: function(key) {
    if(piper_tts.sessions[key]) {
      piper_tts.touch(key);
      return RSVP.resolve(piper_tts.sessions[key]);
    }
    if(!piper_tts.loading[key]) {
      var loader = piper_tts.loader || default_loader;
      piper_tts.loading[key] = RSVP.resolve(loader.load_voice(key, piper_tts.model_url(key))).then(function(session) {
        piper_tts.sessions[key] = session;
        delete piper_tts.loading[key];
        piper_tts.touch(key);
        return session;
      }, function(err) {
        delete piper_tts.loading[key];
        throw err;
      });
    }
    return piper_tts.loading[key];
  },
  touch: function(key) {
    piper_tts.session_order = piper_tts.session_order.filter(function(k) { return k != key; });
    piper_tts.session_order.push(key);
    // Each loaded model holds tens of MB; keep only the most recently used ones
    while(piper_tts.session_order.length > MAX_SESSIONS) {
      var old = piper_tts.session_order.shift();
      var session = piper_tts.sessions[old];
      delete piper_tts.sessions[old];
      if(session && session.release) { session.release(); }
    }
  },
  // Same shape as capabilities.tts.speak_text: opts.voice_id is 'piper:<key>'.
  speak_text: function(text, opts) {
    opts = opts || {};
    var key = piper_tts.key_for(opts.voice_id);
    var voice = key && piper_tts.find(key);
    if(!voice || !piper_tts.supported()) {
      return RSVP.reject({error: 'piper voice not available'});
    }
    if(!piper_tts.sessions[key]) {
      // Not downloaded yet: say so once, start the download, and let the device voice speak.
      var notifier = piper_tts.notifier || window.modal;
      if(!piper_tts.announced[key] && notifier && notifier.notice) {
        piper_tts.announced[key] = true;
        notifier.notice(i18n.t('piper_voice_downloading', "Downloading the %{name} voice (%{size} MB). Your device voice will speak until it is ready.", {name: voice.name, size: voice.size}));
      }
      piper_tts.preload(opts.voice_id);
      return RSVP.reject({error: 'piper voice loading'});
    }
    var rate = parseFloat(opts.rate) || 1.0;
    rate = Math.min(Math.max(rate, 0.5), 2.0);
    return piper_tts.session_for(key).then(function(session) {
      return session.synthesize(text.toString(), {rate: rate});
    }).then(function(wav) {
      var player = piper_tts.player || default_player;
      piper_tts.stop();
      return player.play(wav, {volume: parseFloat(opts.volume)});
    });
  },
  stop_text: function() {
    piper_tts.stop();
    return RSVP.resolve();
  },
  stop: function() {
    var player = piper_tts.player || default_player;
    if(player.stop) { player.stop(); }
  }
};

var script_promises = {};
function load_script(url, global_name) {
  if(window[global_name]) { return RSVP.resolve(window[global_name]); }
  if(!script_promises[url]) {
    script_promises[url] = new RSVP.Promise(function(resolve, reject) {
      var script = document.createElement('script');
      script.src = url;
      script.async = true;
      script.crossOrigin = 'anonymous';
      script.onload = function() {
        if(window[global_name]) { resolve(window[global_name]); } else { reject({error: 'missing ' + global_name}); }
      };
      script.onerror = function() {
        delete script_promises[url];
        reject({error: 'failed to load ' + url});
      };
      document.head.appendChild(script);
    });
  }
  return script_promises[url];
}

// Model files are cached by URL so a voice keeps working offline after its first download.
function fetch_model(url) {
  var from_network = function() {
    return window.fetch(url).then(function(res) {
      if(!res.ok) { throw {error: 'model download failed', status: res.status}; }
      return res;
    });
  };
  if(!window.caches || !window.caches.open) {
    return RSVP.resolve(from_network()).then(function(res) { return res.arrayBuffer(); });
  }
  return RSVP.resolve(window.caches.open(CACHE_NAME)).then(function(cache) {
    return cache.match(url).then(function(hit) {
      if(hit) { return hit; }
      return from_network().then(function(res) {
        return cache.put(url, res.clone()).then(function() { return res; }, function() { return res; });
      });
    });
  }, function() {
    return from_network();
  }).then(function(res) { return res.arrayBuffer(); });
}

// espeak-ng phonemizer: one fresh module per call (the program exits after main), collecting
// every line it prints, one per sentence.
function phonemize(create, text, espeak_voice) {
  var lines = [];
  return RSVP.resolve(create({
    print: function(data) { lines.push(data); },
    printErr: function() { },
    locateFile: function(url) {
      if(url.match(/\.wasm$/)) { return PHONEMIZE_BASE + '.wasm'; }
      if(url.match(/\.data$/)) { return PHONEMIZE_BASE + '.data'; }
      return url;
    }
  })).then(function(module) {
    module.callMain(['-l', espeak_voice, '--input', JSON.stringify([{text: text}]), '--espeak_data', '/espeak-ng-data']);
    var ids = [];
    lines.forEach(function(line) {
      try {
        ids = ids.concat(JSON.parse(line).phoneme_ids || []);
      } catch(e) { }
    });
    if(ids.length === 0) { throw {error: 'no phonemes'}; }
    return ids;
  });
}

function pcm_to_wav(pcm, sample_rate) {
  var buffer = new ArrayBuffer(44 + (pcm.length * 2));
  var view = new DataView(buffer);
  var write = function(offset, str) {
    for(var idx = 0; idx < str.length; idx++) { view.setUint8(offset + idx, str.charCodeAt(idx)); }
  };
  write(0, 'RIFF');
  view.setUint32(4, 36 + (pcm.length * 2), true);
  write(8, 'WAVE');
  write(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sample_rate, true);
  view.setUint32(28, sample_rate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  write(36, 'data');
  view.setUint32(40, pcm.length * 2, true);
  for(var idx = 0; idx < pcm.length; idx++) {
    var sample = Math.max(-1, Math.min(1, pcm[idx]));
    view.setInt16(44 + (idx * 2), sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
  }
  return new Blob([buffer], {type: 'audio/wav'});
}

var default_loader = {
  load_voice: function(key, model_url) {
    var ort = null;
    var create = null;
    var config = null;
    return load_script(ORT_BASE + 'ort.wasm.min.js', 'ort').then(function(res) {
      ort = res;
      ort.env.wasm.wasmPaths = ORT_BASE;
      // Threaded WebAssembly needs cross-origin isolation, which the app does not have
      ort.env.wasm.numThreads = 1;
      return load_script(PHONEMIZE_BASE + '.js', 'createPiperPhonemize');
    }).then(function(res) {
      create = res;
      return RSVP.resolve(window.fetch(model_url + '.json')).then(function(r) {
        if(!r.ok) { throw {error: 'voice config download failed'}; }
        return r.json();
      });
    }).then(function(res) {
      config = res;
      return fetch_model(model_url);
    }).then(function(model) {
      return ort.InferenceSession.create(model, {executionProviders: ['wasm']});
    }).then(function(session) {
      return {
        synthesize: function(text, opts) {
          return phonemize(create, text, config.espeak.voice).then(function(ids) {
            var inference = config.inference || {};
            var feeds = {
              input: new ort.Tensor('int64', ids, [1, ids.length]),
              input_lengths: new ort.Tensor('int64', [ids.length]),
              scales: new ort.Tensor('float32', [inference.noise_scale || 0.667, (inference.length_scale || 1.0) / (opts.rate || 1.0), inference.noise_w || 0.8])
            };
            if(Object.keys(config.speaker_id_map || {}).length > 0) {
              feeds.sid = new ort.Tensor('int64', [0]);
            }
            return session.run(feeds);
          }).then(function(output) {
            return pcm_to_wav(output.output.data, config.audio.sample_rate);
          });
        },
        release: function() {
          if(session.release) { session.release(); }
        }
      };
    });
  }
};

var default_player = {
  play: function(wav, opts) {
    var url = URL.createObjectURL(wav);
    var audio = new window.Audio(url);
    if(!isNaN(opts.volume)) { audio.volume = Math.min(Math.max(opts.volume, 0), 1); }
    return new RSVP.Promise(function(resolve, reject) {
      var finish = function() {
        if(piper_tts.current_audio === audio) { piper_tts.current_audio = null; piper_tts.current_done = null; }
        URL.revokeObjectURL(url);
        resolve();
      };
      piper_tts.current_audio = audio;
      piper_tts.current_done = finish;
      audio.addEventListener('ended', finish);
      audio.addEventListener('error', function() {
        URL.revokeObjectURL(url);
        reject({error: 'piper playback failed'});
      });
      RSVP.resolve(audio.play()).then(null, function() {
        URL.revokeObjectURL(url);
        reject({error: 'piper playback blocked'});
      });
    });
  },
  stop: function() {
    var audio = piper_tts.current_audio;
    var done = piper_tts.current_done;
    if(audio) {
      audio.pause();
      if(done) { done(); }
    }
  }
};

piper_tts.pcm_to_wav = pcm_to_wav;
piper_tts.default_loader = default_loader;

export default piper_tts;
