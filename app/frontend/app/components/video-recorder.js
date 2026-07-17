import Component from '@ember/component';
import { later as runLater } from '@ember/runloop';
import contentGrabbers from '../utils/content_grabbers';
import { computed } from '@ember/object';
import { inject as service } from '@ember/service';
import { alias } from '@ember/object/computed';

export default Component.extend({
  appState: service('app-state'),
  // Alias for template compatibility (template uses this.app_state)
  app_state: alias('appState'),
  tagName: 'div',
  willInsertElement: function () {
    var _this = this;
    runLater(function () {
      if (_this.isDestroyed || _this.isDestroying) {
        return;
      }
      if (typeof _this.video_not_ready === 'function') {
        _this.video_not_ready();
      }
      contentGrabbers.videoGrabber.setup(_this);
      _this.set('app_state', _this.appState);
    });
  },
  willDestroyElement: function () {
    contentGrabbers.videoGrabber.clear_video_work();
  },
  time_recording: computed('video_recording.started', 'appState.short_refresh_stamp', function () {
    if (this.get('video_recording.started')) {
      var now = (new Date()).getTime();
      return Math.round((now - this.get('video_recording.started')) / 1000);
    } else {
      return null;
    }
  }),
  video_allowed: computed('user', 'user.currently_premium', function () {
    // must have an active paid subscription to access video logs on your account
    return this.get('user.currently_premium');
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
    setup_recording: function () {
      contentGrabbers.videoGrabber.record_video();
    },
    record: function () {
      contentGrabbers.videoGrabber.toggle_recording_video('start');
    },
    stop: function () {
      contentGrabbers.videoGrabber.toggle_recording_video('stop');
    },
    play: function () {
      contentGrabbers.videoGrabber.play();
    },
    clear: function () {
      contentGrabbers.videoGrabber.clear_video_work();
    },
    swap: function () {
      contentGrabbers.videoGrabber.swap_streams();
    },
    keep: function () {
      contentGrabbers.videoGrabber.select_video_preview();
    }
  }
});
