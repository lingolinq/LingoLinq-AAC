import Controller from '@ember/controller';
import EmberObject from '@ember/object';
import { set as emberSet, get as emberGet } from '@ember/object';
import { later as runLater, cancel as runCancel } from '@ember/runloop';
import $ from 'jquery';
import speecher from '../utils/speecher';
import modal from '../utils/modal';
import lingoLinqExtras from '../utils/extras';
import app_state from '../utils/app_state';
import stashes from '../utils/_stashes';
import capabilities from '../utils/capabilities';
import i18n from '../utils/i18n';
import contentGrabbers from '../utils/content_grabbers';
import LingoLinq from '../app';
import { computed } from '@ember/object';

export default Controller.extend({
  tests: [
    {key: 'javascript', name: i18n.t('javascript', "JavaScript"), description: i18n.t('javscript_info', "This page wouldn't even load without a relatively-modern JavaScript engine.")},
    {key: 'local_storage', name: i18n.t('local_storage', "localStorage"), description: i18n.t('local_storage_info', "localStorage is used instead of cookies to remember whether a user is already logged in, what board they were on, etc.")},
    {key: 'speech_synthesis', name: i18n.t('speech_synthesis', "Speech Synthesis"), description: i18n.t('speech_synthesis_info', "Most modern web browsers implement a Speech Synthesis engine that can be used to turn text into speech."), tests: ['1', '2', '3']},
    {key: 'speech_synthesis_voices', name: i18n.t('speech_synthesis_voices', "Speech Synthesis Voices"), description: i18n.t('speech_synthesis_info2', "If your device supports Speech Synthesis, it should have one or more voices installed by default. Sometimes voices can get \"lost\" and stop appearing on the device.")},
    {key: 'file_uploads', name: i18n.t('file_uploads', "File Uploads"), description: i18n.t('file_uploads_info', "Not all browsers support the modern file uploading features that %app_name% uses. If your device doesn't, most modern desktop browsers should upload just fine.")},
    {key: 'file_storage', name: i18n.t('file_storage', "File Storage"), description: i18n.t('file_storage_info', "Devices and some browsers allow you to store files for offline use. If this feature is not available, some files can be stored in the database but you may run into storage errors.")},
    {key: 'indexed_db', name: i18n.t('indexed_db', "IndexedDB"), description: i18n.t('indexed_db_info', "IndexedDB is a storage tool used to download boards and board contents so that %app_name% can still work even without an Internet connection. If the device's memory gets full sometimes these databases will be automatically (and unexpectedly) deleted.")},
    {key: 'sqlite', name: i18n.t('sqlite', "SQLite"), description: i18n.t('sqlite_info', "SQLite is another storage tool used to download boards and board contents so that %app_name% can still work even without an Internet connection. SQLite databases aren't available on as many devices, but won't get deleted without permission.")},
    {key: 'media_recording', name: i18n.t('media_recording', "Media Recording"), description: i18n.t('media_recording_info', "Media Recording allows you to take pictures and record audio using your device's webcam. Some mobile devices use their own built-in media recording tools instead of %app_name%'s recorders.")},
    {key: 'xhr_cors', name: i18n.t('xhr_cors', "XHR/CORS"), description: i18n.t('xhr_cors_info', "In order to work offline, %app_name% needs to download images from multiple web sites. XHR/CORS is not required for this to work, but it makes the download process more efficient.")},
    {key: 'canvas', name: i18n.t('canvas', "HTML5 Canvas"), description: i18n.t('canvas_info', "%app_name% lets you crop and colorize images to better match your board requirements, and it uses something called the Canvas element to make that happen.")},
    {key: 'audio_playback', name: i18n.t('audio_playback', "Audio Playback"), description: i18n.t('audio_playback_info', "If you record your own sounds you'll want to be able to play them back, but not all browsers support audio playback, or don't always support the file types %app_name% uses."), tests: ['1', '2', '3']},
    {key: 'drag_and_drop', name: i18n.t('drag_and_drop', "Drag and Drop"), description: i18n.t('drag_and_drop_info', "It doesn't make sense on a mobile device, but on a desktop browser dragging and dropping images and sounds onto buttons while editing can save a lot of time.")},
    {key: 'file_reader', name: i18n.t('file_reader', "FileReader"), description: i18n.t('file_reader_info', "The FileReader tool is a required component if you're uploading images or audio from your computer to use in LingoLinq.")},
    {key: 'geolocation', name: i18n.t('geolocation', "Geolocation"), description: i18n.t('geolocation_info', "%app_name% optionally uses geolocation to track usage and build reports that can compare communication across multiple locations.")},
    {key: 'speech_to_text', name: i18n.t('speech_to_text', "Speech to Text"), description: i18n.t('speech_to_text_info', "Some browsers allow you speak and have your words converted to text. This can make it easier to do things like make a list of buttons to add to a newly-created board.")},
    {key: 'online', name: i18n.t('online', "Online/Offline Status"), description: i18n.t('online_info', "Some browsers allow checking for online/offline status. %app_name% can use this to function more effectively offline, and to automatically sync changes and logs when an Internet connection is re-established.")},
    {key: 'wakelock', name: i18n.t('wakelock', "Wakelock"), description: i18n.t('wakelock_info', "Some mobile devices allow %app_name% to prevent the screen from turning off due to inactivity. %app_name% only keeps the screen on when in Speak Mode or when actively syncing boards.")},
    {key: 'fullscreen', name: i18n.t('fullscreen', "Full Screen Mode"), description: i18n.t('fullscreen_info', "On some devices %app_name% can activate full screen mode when in Speak Mode to hide any navigation and status buttons from view.")},
  ],
  run_javascript_test: function(test) {
    emberSet(test, 'results', {passed: true});
  },
  run_speech_synthesis_test: function(test) {
    if(speecher.scope.speechSynthesis) {
      if(window.speechSynthesis && !window.speechSynthesis.polyfill) {
        emberSet(test, 'results', {passed: true});
      } else if(speecher.scope.speechSynthesis.cloud_only) {
        emberSet(test, 'results', {passed: false, reason: "A cloud-based fallback may work when your device is online"});
      } else {
        emberSet(test, 'results', {partially_passed: true, reason: "Supported through an extension, but quality will be limited"});
      }
    } else {
      emberSet(test, 'results', {passed: false, reason: "No speech synthesis found"});
    }
  },
  error_count: computed('load_stamp', 'app_state.medium_refresh_stamp', function() {
    return (LingoLinq.errors || []).length;
  }),
  run_speech_synthesis_voices_test: function(test) {
    if(speecher.scope.speechSynthesis) {
      if(speecher.scope.speechSynthesis.getVoices) {
        var voices = speecher.scope.speechSynthesis.getVoices() || [];
        if(voices.length > 0) {
          var voice_names = [];
          for(var idx = 0; idx < voices.length; idx++) {
            voice_names.push((voices[idx].name || voices[idx].voiceURI || "unnamed voice") + "(" + voices[idx].lang + ")");
          }
          var voice_string = voice_names.join("\n");
          emberSet(test, 'results', {passed: true, content: voice_string});
        } else {
          emberSet(test, 'results', {passed: false, reason: "No voices found"});
        }
      } else {
        emberSet(test, 'results', {passed: false, reason: "No getVoices method found"});
      }
    } else {
      emberSet(test, 'results', {passed: false, reason: "No speech synthesis found"});
    }
  },
  run_local_storage_test: function(test) {
    var _this = this;
    // localStorage
    try {
      localStorage.setItem('cough_drop_test', 'ok');
      if(localStorage['cough_drop_test'] == 'ok') {
        localStorage.removeItem('cough_drop_test');
        if(localStorage['cough_drop_test'] === undefined) {
          emberSet(test, 'results', {passed: true});
        } else {
          emberSet(test, 'results', {passed: false, reason: "removeItem failed"});
        }
      } else {
          emberSet(test, 'results', {passed: false, reason: "setItem failed"});
      }
    } catch(e) {
      emberSet(test, 'results', {passed: false, reason: e.toString()});
    }
  },
  run_indexed_db_test: function(test) {
    if(window.indexedDB && window.indexedDB == window.shimIndexedDB) {
      emberSet(test, 'results', {partially_passed: true, reason: "IndexedDB Shim used to add support"});
    } else if(window.indexedDB) {
      emberSet(test, 'results', {passed: true});
    } else {
      emberSet(test, 'results', {passed: false});
    }
  },
  run_sqlite_test: function(test) {
    if(capabilities.dbman.sqlite) {
      emberSet(test, 'results', {passed: true});
    } else {
      emberSet(test, 'results', {passed: false});
    }
  },
  run_media_recording_test: function(test) {
    // media recording
    var captures = contentGrabbers.capture_types();
    if(navigator.getUserMedia || (captures.image && captures.audio)) {
      emberSet(test, 'results', {passed: true});
    } else {
      emberSet(test, 'results', {passed: false});
    }
  },
  run_xhr_cors_test: function(test) {
    // xhr/cors
    var _this = this;
    var url = "https://opensymbols.s3.amazonaws.com/libraries/arasaac/parrot.png?xhcr=1";
    var xhr = new XMLHttpRequest();
    xhr.addEventListener('load', function(r) {
      if(xhr.status == 200) {
        contentGrabbers.read_file(xhr.response).then(function(s) {
          emberSet(test, 'results', {passed: true});
        }, function() {
          emberSet(test, 'results', {passed: false, reason: "file reading failed"});
        });
      } else {
        emberSet(test, 'results', {passed: false, reason: "CORS request failed"});
      }
    });
    xhr.addEventListener('error', function() {
      emberSet(test, 'results', {passed: false, reason: "URL lookup failed"});
    });
    xhr.addEventListener('abort', function() {
      emberSet(test, 'results', {passed: false, reason: "URL lookup aborted"});
    });
    // Adding the query parameter because I suspect that if a URL has already
    // been retrieved by the browser, it's not sending CORS headers on the
    // follow-up request, maybe?
    xhr.open('GET', url + "?cr=1");
    xhr.responseType = 'blob';
    xhr.send(null);
  },
  run_file_uploads_test: function(test) {
    emberSet(test, 'results', {passed: !!(window.Blob && window.Uint8Array) });
  },
  run_file_storage_test: function(test) {
    capabilities.storage.status().then(function(res) {
      if(res.available) {
        if(res.requires_confirmation) {
          emberSet(test, 'results', {partially_passed: true, reason: "Requires user permission"});
        } else {
          emberSet(test, 'results', {passed: true});
        }
      } else {
        emberSet(test, 'results', {passed: false});
      }
    }, function(err) {
      emberSet(test, 'results', {passed: false});
    });
  },
  run_canvas_test: function(test) {
    var red_dot = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAUAAAAFCAYAAACNbyblAAAAHElEQVQI12P4//8/w38GIAXDIBKE0DHxgljNBAAO9TXL0Y4OHwAAAABJRU5ErkJggg==";
    var svg = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='10' height='10'><linearGradient id='gradient'><stop offset='10%' stop-color='#F00'/><stop offset='90%' stop-color='#fcc'/> </linearGradient><rect fill='url(#gradient)' x='0' y='0' width='100%' height='100%'/></svg>";
    var $canvas = $("<canvas/>");
    var canvas = $canvas[0];
    if(canvas && canvas.getContext) {
      canvas.width = 10;
      canvas.height = 10;
      var context = canvas.getContext('2d');
      var red_image = new Image();
      red_image.src = red_dot;
      var svg_image = new Image();
      svg_image.src = svg;

      runLater(function() {
        if(red_image.complete) {
          if(svg_image.complete) {
            context.clearRect(0, 0, canvas.width, canvas.height);
            context.drawImage(red_image, 0, 0, canvas.width, canvas.height);
            var data = context.getImageData(0, 0, canvas.width, canvas.height).data;
            var r = 5;
            var c = 5;
            var idx = (r*canvas.width+c)*4;
            if(data[idx] === 255 && data[idx + 1] === 0 && data[idx + 2] === 0 && data[0] === 0 && data[1] === 0 && data[2] === 0) {
              context.clearRect(0, 0, canvas.width, canvas.height);
              try {
                context.drawImage(svg_image, 0, 0, canvas.width, canvas.height);
                var data = context.getImageData(0, 0, canvas.width, canvas.height).data;
                var r = 9;
                var c = 9;
                var idx = (r*canvas.width+c)*4;
                if(data[0] === 255 && data[1] === 0 && data[2] === 0 && data[idx] === 255 && data[idx + 1] === 204 && data[idx + 2] === 204) {
                  emberSet(test, 'results', {passed: true});
                } else {
                  emberSet(test, 'results', {passed: false, reason: "SVG rendering on Canvas failed"});
                }
              } catch(e) {
                emberSet(test, 'results', {passed: false, reason: "SVG rendering on Canvas failed unexpectedly."});
              }
            } else {
              emberSet(test, 'results', {passed: false, reason: "PNG rendering on Canvas failed"});
            }
          } else {
            emberSet(test, 'results', {passd: false, reason: "SVG images not supported"});
          }
        } else {
          emberSet(test, 'results', {passed: false, reason: "Data-URIs not supported"});
        }
      }, 100);

    } else {
      emberSet(test, 'results', {passed: false, reason: "Canvas element not enabled"});
    }
    // include data-uri test
  },
  run_audio_playback_test: function(test) {
    var dones = [];

    var audio = document.createElement('audio');
    audio.style.display = "none";
    audio.src = "https://opensymbols.s3.amazonaws.com/blank.mp3";
    audio.onended = function() {
      dones[0] = true;
    };
    audio.onerror = function() {
      dones[0] = {passed: false, reason: "Audio file could not be played."};
    };
    document.body.appendChild(audio);
    audio.load();
    audio.play();

    var uri_audio = document.createElement('audio');
    uri_audio.style.display = 'none';
    uri_audio.src = "data:audio/mpeg;base64,SUQzAwAAAAABBFRJVDIAAAAZAAAAU2lsZW50IE1QMyAxMHRoLW9mLWEtc2VjVFBFMQAAAA8AAAB3d3cueGFtdWVsLmNvbUNPTU0AAAArAAAAWFhYAEZyb20gaHR0cDovL3d3dy54YW11ZWwuY29tL2JsYW5rLW1wM3MvVENPTgAAAAkAAABTeW50aHBvcP/6kMBfqwAAAAABpBgAAAAAADSDgAAATEFNRTMuOTNVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVMQU1FMy45M1VVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVf/6ksDmn8UDwAABpAAAAAAAADSAAAAAVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVTEFNRTMuOTNVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVX/+pLA+t7/g8AAAaQAAAAAAAA0gAAAAFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVUxBTUUzLjkzVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV//qSwPre/4PAAAGkAAAAAAAANIAAAABVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVMQU1FMy45M1VVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVf/6ksD63v+DwAABpAAAAAAAADSAAAAAVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVTEFNRTMuOTNVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVX/+pLA+t7/g8AAAaQAAAAAAAA0gAAAAFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV";
    uri_audio.onended = function() {
      dones[1] = true;
    };
    uri_audio.onerror = function() {
      dones[1] = {passed: false, reason: "Data-URI file could not be processed, audio files will not play on your device when you are offline."};
    };
    uri_audio.load();
    uri_audio.play();

    var wav_audio = {};
    if(window.Audio) {
      wav_audio = new Audio();
      wav_audio.src = "data:audio/x-wav;base64,UklGRjIAAABXQVZFZm10IBIAAAABAAEAQB8AAEAfAAABAAgAAABmYWN0BAAAAAAAAABkYXRhAAAAAA==";
      wav_audio.onerror = function(err) {
        dones[2] = {partially_passed: true, reason: "Data-URI WAV file couldn't be processed, not all audio files will play on your device."};
      };
      wav_audio.onended = function() {
        if(!wav_audio.errored) {
          dones[2] = true;
        }
      };
      wav_audio.load();
      wav_audio.play();
    } else {
      dones[2] = {passed: false, reason: "Audio class not found"};
    }
    var done_check = function() {
      if(dones[0] && dones[1] && dones[2]) {
        if(dones[0] !== true) {
          emberSet(test, 'results', dones[0]);
        } else if(dones[1] !== true) {
          emberSet(test, 'results', dones[1]);
        } else if(dones[2] !== true) {
          emberSet(test, 'results', dones[2]);
        } else {
          emberSet(test, 'results', {passed: true});
        }
      } else {
        runLater(done_check, 100);
      }
    };
    runLater(done_check, 100);
  },
  run_drag_and_drop_test: function(test) {
    emberSet(test, 'results', {passed: !!(window.DataTransfer) });
  },
  run_speech_to_text_test: function(test) {
    emberSet(test, 'results', {passed: !!(window.webkitSpeechRecognition) });
  },
  run_file_reader_test: function(test) {
    emberSet(test, 'results', {passed: !!(window.FileReader) });
  },
  run_wakelock_test: function(test) {
    if(window.chrome && window.chrome.power && window.chrome.power.requestKeepAwake) {
      emberSet(test, 'results', {passed: true});
    } else {
      emberSet(test, 'results', {passed: false});
    }
  },
  run_fullscreen_test: function(test) {
    if(capabilities.fullscreen_capable()) {
      emberSet(test, 'results', {passed: true});
    } else {
      emberSet(test, 'results', {passed: false});
    }
  },
  run_geolocation_test: function(test) {
    if(navigator.geolocation && navigator.geolocation.clearWatch && navigator.geolocation.watchPosition) {
      emberSet(test, 'results', {passed: true});
    } else {
      emberSet(test, 'results', {passed: false});
    }
  },
  run_online_test: function(test) {
    if(navigator.onLine === true || navigator.onLine === false) {
      emberSet(test, 'results', {passed: true});
    } else {
      emberSet(test, 'results', {passed: false});
    }
  },
  has_debugging: computed(function() {
    return capabilities.debugging.available();
  }),
  check_persistence_data: function() {
    var _this = this;
    _this.set('storage', {pending: true});
    var storageTimeout = runLater(function() {
      if(_this.get('storage.pending')) {
        _this.set('storage', {size: -1});
      }
    }, 8000);
    capabilities.storage.all_files().then(function(res) {
      runCancel(storageTimeout);
      _this.set('storage', {size: Math.round((res.size || 0) * 10 / 1024 / 1024) / 10});
    }, function(err) {
      runCancel(storageTimeout);
      _this.set('storage', {size: -1});
    });

    _this.set('local_storage', false);
    try {
      localStorage.setItem('cough_drop_test2', 'nah');
      if(localStorage['cough_drop_test2'] == 'nah') {
        localStorage.removeItem('cough_drop_test2');
        _this.set('local_storage', true);
      }
    } catch(e) { }

    _this.set('db', null);
    if(capabilities.db) {
      if(capabilities.dbman.sqlite) {
        _this.set('db', {type: 'SQLite'});
      } else if(capabilities.idb) {
        _this.set('db', {type: 'IndexedDB'});
      }
    }

    if(lingoLinqExtras.storage) {
      var user_name = app_state.get('currentUser.user_name');
      lingoLinqExtras.storage.find_all('board').then(function(list) {
        _this.set('local_boards', list.filter(function(d) { return d.data && d.data.raw && d.data.raw.user_name == user_name; }).length);
      }, function(err) {
        _this.set('local_boards', null);
      })
    }
  },
  actions: {
    reload: function() {
      location.reload();
    },
    show_errors: function() {
      if(this.get('errors')) {
        this.set('errors', null);
        } else {
        this.set('errors', LingoLinq.errors || []);
      }
    },
    show_debugging: function() {
      if(capabilities.debugging.available()) {
        capabilities.debugging.show();
      }
    },
    push_to_cloud: function() {
      modal.open('modals/push_to_cloud', {type: 'board'});
    },
    clear_file_storage: function() {
      var _this = this;
      _this.set('should_reload', true);
      capabilities.storage.clear().then(function() {
        _this.check_persistence_data();
      }, function() {
        _this.check_persistence_data();
      });
    },
    clear_databases: function() {
      var _this = this;
      _this.set('should_reload', true);
      capabilities.delete_database().then(function() {
        _this.check_persistence_data();
      }, function() {
        _this.check_persistence_data();
      });
    },
    clear_local_storage: function() {
      var _this = this;
      _this.set('should_reload', true);
      stashes.flush();
    },
    run_default_tests: function() {
      this.set('testing', true);
      var _this = this;
      this.tests.forEach(function(test) {
        runLater(function() {
          _this['run_' + test.key + '_test'](test);
          runLater(function() {
            if(!emberGet(test, 'results')) {
              emberSet(test, 'results', {passed: false, reason: "Test failed to complete."});
            }
          }, 5000);
        });
      });
      this.check_persistence_data();
    },
    test_feature: function(feature, num) {
      if(feature == 'speech_synthesis') {
        if(num == '1') {
          modal.notice(i18n.t('speech_test_1', "You should hear \"this is test number one\" being spoken by the speech synthesis engine."));
          speecher.speak_text("this is test number one");
          return;
        } else if(num == '2') {
          modal.notice(i18n.t('speech_test_2', "You should hear \"this is test number two\" being spoken by the speech synthesis engine."));
          var utterance = new speecher.scope.SpeechSynthesisUtterance();
          utterance.text = "this is test number two";
          utterance.rate = speecher.rate || 1.0;
          utterance.volume = speecher.volume || 1.0;
          utterance.pitch = speecher.pitch || 1.0;
          var voices = speecher.get('voices');
          if(voices.length > 0) {
            utterance.voiceURI = voices[0].voiceURI;
            utterance.voice = voices[0];
          }
          speecher.scope.speechSynthesis.speak(utterance);
          return;
        } else if(num == '3') {
          modal.notice(i18n.t('speech_test_3', "You should hear \"this is test number three\" being spoken by the speech synthesis engine."));
          if(window.originalSpeechSynthesis) {
            var utterance = new window.originalSpeechSynthesisUtterance();
            utterance.text = "this is test number three";
            window.originalSpeechSynthesis.speak(utterance);
          }
          return;
        }
      } else if(feature == 'audio_playback') {
        if(num == '1') {
          modal.notice(i18n.t('audio_test_1', "You should hear a beeping sound"));
          speecher.beep();
          return;
        } else if(num == '2') {
          modal.notice(i18n.t('audio_test_2', "You should hear a beeping sound"));
          var audio = document.createElement('audio');
          audio.style.display = "none";
          audio.src = "https://opensymbols.s3.amazonaws.com/beep.mp3";
          var played = false;
          audio.onplay = function() {
            played = true;
          };
          document.body.appendChild(audio);
          audio.load();
          audio.play();
          var check_played = function() {
            if(!played) {
              check_played.count = check_played.count || 0;
              check_played.count++;
              if(check_played.count < 20) {
                runLater(check_played, 300);
              } else {
                modal.error(i18n.t('audio_never_played', "Oops! The audio element never triggered a play event."));
              }
            }
          };
          runLater(check_played, 300);
          return;
        } else if(num == '3') {
          var wav_audio = {};
          if(window.Audio) {
            wav_audio = new Audio();
            wav_audio.src = "data:audio/x-wav;base64,UklGRjIAAABXQVZFZm10IBIAAAABAAEAQB8AAEAfAAABAAgAAABmYWN0BAAAAAAAAABkYXRhAAAAAA==";
            wav_audio.onerror = function(err) {
              wav_audio.errored = true;
              modal.error(i18n.t('audio_test_3_error', "Oops, that one didn't work. Your device might not be able to play back all audio types."));
            };
            wav_audio.onended = function() {
              if(!wav_audio.errored) {
                modal.notice(i18n.t('audio_test_3_success', "You should hear a beeping sound"));
                speecher.beep();
              }
            };
            wav_audio.load();
            wav_audio.play();
          } else {
            modal.error(i18n.t('audio_class_missing', "Audio class not found"));
          }
          return;
        }
      }
      modal.error(i18n.t('no_feature_found', "No test was run, something appears to be wrong with this test."));
    }
  }
});
