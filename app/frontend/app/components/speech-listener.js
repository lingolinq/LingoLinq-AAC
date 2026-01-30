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
      }
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
  actions: {
    stop: function() {
      this.stop_engine();
      if(this.stop) {
        this.stop();
      }
    }
  }
});
