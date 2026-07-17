import Component from '@ember/component';

import { computed, observer } from '@ember/object';

export default Component.extend({
  tagName: 'span',

  willInsertElement: function() {
    var speech = this.get('speech');
    var _this = this;

    if(speech && speech.engine) {
      speech.engine.onresult = function(event) {
        var result = event.results[event.resultIndex];
        if(result && result[0] && result[0].transcript) {
          var text = result[0].transcript.replace(/^\s+/, '');
          if(_this.content) {
            _this.content(text);
          }
        }
      };
      speech.engine.onaudiostart = function(event) {
        if(_this.get('speech')) {
          _this.set('speech.recording', true);
        }
      };
      speech.engine.onerror = function(err) {
        if(_this.error) {
          _this.error(err);
        }
      };
      speech.engine.onend = function(event) {
        if(_this.get('speech') && _this.get('speech.resume')) {
          _this.set('speech.resume', false);
          speech.engine.start();
        }
      };
      speech.engine.onsoundstart = function() {
        console.log('sound!');
      };
      speech.engine.onsoundend = function() {
        console.log('no more sound...');
      };
      speech.engine.start();
      if(this.get('speech')) {
        this.set('speech.almost_recording', true);
        this.set('speech.words', []);
        this.set('speech.level', 0);
      }
      this.start_level_meter();
    }
  },

  // Parallel getUserMedia stream + AnalyserNode so we can show a real audio
  // level. webkitSpeechRecognition does not expose its own stream, so this
  // is a separate but lightweight tap that uses the same already-granted
  // mic permission.
  _meterStream: null,
  _meterCtx: null,
  _meterRaf: null,

  start_level_meter: function() {
    if(!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { return; }
    var Ctx = window.AudioContext || window.webkitAudioContext;
    if(!Ctx) { return; }
    var _this = this;
    navigator.mediaDevices.getUserMedia({audio: true, video: false}).then(function(stream) {
      if(_this.isDestroyed || _this.isDestroying) {
        stream.getTracks().forEach(function(t) { t.stop(); });
        return;
      }
      _this._meterStream = stream;
      var ctx = new Ctx();
      _this._meterCtx = ctx;
      var src = ctx.createMediaStreamSource(stream);
      var analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.6;
      src.connect(analyser);
      var data = new Uint8Array(analyser.frequencyBinCount);
      var tick = function() {
        if(_this.isDestroyed || _this.isDestroying) { return; }
        analyser.getByteFrequencyData(data);
        var sum = 0;
        for(var i = 0; i < data.length; i++) { sum += data[i]; }
        var avg = sum / data.length;            // 0–255
        var level = Math.min(100, Math.round((avg / 80) * 100));
        if(_this.get('speech')) {
          _this.set('speech.level', level);
        }
        _this._meterRaf = requestAnimationFrame(tick);
      };
      _this._meterRaf = requestAnimationFrame(tick);
    }).catch(function() {
      // Mic permission was denied or stream unavailable — silently skip the
      // meter; the main speech_error path already surfaces a message.
    });
  },

  stop_level_meter: function() {
    if(this._meterRaf) {
      cancelAnimationFrame(this._meterRaf);
      this._meterRaf = null;
    }
    if(this._meterStream) {
      this._meterStream.getTracks().forEach(function(t) { t.stop(); });
      this._meterStream = null;
    }
    if(this._meterCtx) {
      try { this._meterCtx.close(); } catch(e) {}
      this._meterCtx = null;
    }
    if(this.get('speech')) {
      this.set('speech.level', 0);
    }
  },

  stop_engine: function() {
    if(this.get('speech') && this.get('speech.engine')) {
      this.set('speech.resume', false);
      this.get('speech.engine').abort();
    }
    if(this.get('speech')) {
      this.set('speech.recording', false);
      this.set('speech.almost_recording', false);
    }
    this.stop_level_meter();
  },
  willDestroyElement: function() {
    this.stop_engine();
  },
  stop_and_resume: observer('speech.stop_and_resume', function() {
    if(this.get('speech.stop_and_resume')) {
      this.set('speech.resume', true);
      this.get('speech.engine').stop();
      this.set('speech.stop_and_resume', false);
    }
  }),
  init() {
    this._super(...arguments);
    var self = this;
    this.ctrlAction = function(actionName) {
      var bound = Array.prototype.slice.call(arguments, 1);
      return function() {
        var args = bound.concat(Array.prototype.slice.call(arguments));
        var evt = args[args.length - 1];
        if (evt && typeof evt.preventDefault === 'function' && (evt.type || evt.target)) {
          if (evt.preventDefault) { evt.preventDefault(); }
          args.pop();
        }
        self.send.apply(self, [actionName].concat(args));
      };
    };
    this.ctrlActionNoBubble = function(actionName) {
      var bound = Array.prototype.slice.call(arguments, 1);
      return function(event) {
        if (event && event.stopPropagation) { event.stopPropagation(); }
        if (event && event.preventDefault) { event.preventDefault(); }
        self.send.apply(self, [actionName].concat(bound));
      };
    };
  },

  actions: {
    stop: function() {
      this.stop_engine();
      if(this.stop) {
        this.stop();
      }
    }
  }
});
