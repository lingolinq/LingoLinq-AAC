describe("coughDropExtras", function() {
  beforeEach(function() {
    Ember.testing = true;
    LingoLinq.reset();
  });
  
  describe("setup", function() {
  });
// 
// (function() {
//   var extras = Ember.Object.extend({
//     setup: function(controller) {
//       this.controller = controller;
//     },
  describe("tts", function() {
    describe("speak", function() {
    });
    describe("event", function() {
    });
    describe("voices", function() {
    });
    describe("deferreds", function() {
    });
  });
//     // Chrome just added TTS support natively. Huzzah! This is still a useful  
//     // workflow though for other extensions (i.e. PhoneGap)
//     tts: {
//       speak: function(utterance) {
//         extras.tts.currentUtterance = utterance;
//         window.postMessage({
//           type: 'coughDropExtras',
//           method: 'tts',
//           options: {
//             text: utterance.text,
//             rate: utterance.rate,
//             volume: utterance.volume,
//             voiceURI: utterance.voice.voiceURI,
//             pitch: utterance.pitch
//           }
//         }, '*');
//       },
//       event: function(data) {
//         if(extras.tts.currentUtterance) {
//           extras.tts.currentUtterance.charIndex = event.data.charIndex;
//           extras.tts.currentUtterance.trigger(event.data.event_type);
//         }
//       },
//       voices: function() {
//         if(extras.tts.voices_defer) {
//           extras.tts.voices_defer.reject({error: 'interrupted'});
//         }
//         extras.tts.voices_defer = Ember.RSVP.defer();
//         window.postMessage({type: 'coughDropExtras', method: 'tts_get_voices'}, '*');
//         return extras.tts.voices_defer.promise;
//       }
//     },
  describe("eye_gaze", function() {
    describe("enable", function() {
    });
    describe("events", function() {
    });
  });
//     eye_gaze: function(options) {
//       window.postMessage({type: 'coughDropExtras', method: 'eye_gaze', options: {enable: true}}, '*');
//     },
  describe("storage", function() {
    describe("find", function() {
    });
    describe("find_changed", function() {
    });
    describe("store", function() {
    });
    describe("deferreds", function() {
    });
  });
//     storage: {
//       defers: {},
//       find: function(store, key) {
//         var defer = Ember.RSVP.defer();
//         defer.store = store;
//         defer.key = key;
//         var defer_key = "defer_" + (new Date()).getTime().toString() + "_" + Math.random().toString();
//         extras.storage.defers[defer_key] = defer;
//         window.postMessage({type: 'coughDropExtras', method: 'storage_find', options: {id: defer_key, store: store, key: key}}, '*');
//         return defer.promise;
//       },
//       find_changed: function() {
//         var defer = Ember.RSVP.defer();
//         var defer_key = "defer_" + (new Date()).getTime().toString() + "_" + Math.random().toString();
//         extras.storage.defers[defer_key] = defer;
//         window.postMessage({type: 'coughDropExtras', method: 'storage_find_changed', options: {id: defer_key}}, '*');
//         return defer.promise;
//       },
//       store: function(store, obj, key) {
//         var defer = Ember.RSVP.defer();
//         defer.store = store;
//         defer.key = key;
//         var defer_key = "defer_" + (new Date()).getTime().toString() + "_" + Math.random().toString();
//         extras.storage.defers[defer_key] = defer;
//         window.postMessage({type: 'coughDropExtras', method: 'storage_store', options: {id: defer_key, store: store, record: obj}}, '*');
//         return defer.promise;
//       }
//     }
  describe("initialization", function() {
  });
  
  describe("events", function() {
  });
});
//   }).create();
//   
//   window.coughDropExtras = extras;
//   window.addEventListener('message', function(event) {
//     if(event.source != window) { return; }
//     if(event.data && event.data.type == 'coughDropExtras' && event.data.ready) {
//       console.debug("COUGHDROP: extras extension found");
//       window.coughDropExtras.ready = true;
//       window.coughDropExtras.set('ready', true);
//       if(window.speechSynthesis) {
//         console.debug("COUGHDROP: tts enabled");
//       }
//       extras.eye_gaze({enable: true});
//       if(speechSynthesis.voiceList) {
//         extras.tts.voices().then(function(voices) {
//           speechSynthesis.voiceList = voices.concat(speechSynthesis.voiceList);
//           if(window.speecher) {
//             window.speecher.checkReadiness();
//           }
//           console.debug("COUGHDROP: tts voices added");
//         });
//       }
//     } else if(event.data && event.data.type == 'tts_event') {
//       extras.tts.event(event.data);
//     } else if(event.data && event.data.type == 'tts_voices') {
//       if(extras.tts.voices_defer) {
//         extras.tts.voices_defer.resolve(event.data.voices);
//         extras.tts.voices_defer = null;
//       }
//     } else if(event.data && event.data.type == 'eye_gaze_event') {
//       if(event.data.event_type == 'tracker') {
//         extras.controller.set('eye_gaze_state', event.data.track_type);
//       } else if(event.data.event_type == 'tracker_disabled') {
//         extras.controller.set('eye_gaze_state', null);
//       }
//       console.log(event.data);
//     } else if(event.data && event.data.type == 'storage_result') {
//       var defer = extras.storage.defers[event.data.id];
//       if(defer) {
//         delete extras.storage.defers[event.data.id];
//         if(event.data.result_type == 'success') {
//           Ember.run(function() {
//             defer.resolve(event.data.result);
//           });
//         } else {
//           Ember.run(function() {
//             defer.reject(event.data.result);
//           });
//         }
//       }
//     }
//   });
// })();