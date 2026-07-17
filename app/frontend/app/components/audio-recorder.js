import Component from '@ember/component';
import { later as runLater } from '@ember/runloop';
import $ from 'jquery';
import contentGrabbers from '../utils/content_grabbers';

import { observer } from '@ember/object';
import { computed } from '@ember/object';

export default Component.extend({
  tagName: 'div',
  willInsertElement: function() {
    var _this = this;
    _this.check_status();
    this.set('model', {});
    contentGrabbers.soundGrabber.setup(null, this);
  },
  willDestroyElement: function() {
    contentGrabbers.soundGrabber.clear_sound_work();
  },
  check_status: observer('sound', 'id', function() {
    var _this = this;
    if(!_this.get('sound')) {
      runLater(function() {
        var fn = _this.get('audio_not_ready');
        if (typeof fn === 'function') { fn(); }
        _this.send('record_sound');
      });
    }
  }),
  update_sound: observer('model.sound', function() {
    if(this.get('model.sound')) {
      this.send('audio_selected', this.get('model.sound'));
    }
  }),
  update_sound_preview: observer('sound_preview', function() {
    if(this.get('sound_preview') && !this.get('sound_preview.transcription') && this.get('text')) {
      this.set('sound_preview.name', this.get('text'));
      this.set('sound_preview.transcription', this.get('text'));
    }
  }),
  show_next_phrase: computed(
    'next_phrase',
    'browse_audio',
    'sound_preview',
    'sound_recording',
    'sound',
    function() {
      return this.get('next_phrase') && !this.get('browse_audio') && !this.get('sound_preview');
    }
  ),
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
    toggle: function() {

    },
    browse_audio: function() {
      contentGrabbers.soundGrabber.browse_audio();
    },
    record_sound: function() {
      contentGrabbers.soundGrabber.record_sound(true);
      runLater(function() {
        $("#recording_status").focus();
      }, 100);
    },
    toggle_recording_sound: function(action) {
      contentGrabbers.soundGrabber.toggle_recording_sound(action);
    },
    audio_selected: function(sound) {
      var fn = this.get('audio_ready');
      if (typeof fn === 'function') { fn(sound); }
      try {
        this.set('sound', sound);
      } catch(e) { }
      contentGrabbers.soundGrabber.clear_sound_work();
    },
    select_sound_preview: function() {
      contentGrabbers.soundGrabber.select_sound_preview();
    },
    clear_sound: function() {
      var fn = this.get('audio_not_ready');
      if (typeof fn === 'function') { fn(); }
    },
    clear_sound_work: function() {
      contentGrabbers.soundGrabber.clear_sound_work();
      this.send('record_sound');
    },
    select_phrase: function(id) {
      var fn = this.get('select_phrase');
      if (typeof fn === 'function') { fn(id); }
    },
    decide_on_recording: function(decision) {
      var fn = this.get('decide_on_recording');
      if (typeof fn === 'function') { fn(decision); }
    }
  }
});