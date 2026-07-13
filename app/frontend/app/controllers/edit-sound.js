import LingoLinq from '../app';
import app_state from '../utils/app_state';
import contentGrabbers from '../utils/content_grabbers';
import modal from '../utils/modal';

export default modal.ModalController.extend({
  opening: function() {
    this.set('status', null);
  },
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
    close: function() {
      modal.close(false);
    },
    play_sound: function() {
      contentGrabbers.soundGrabber.play_audio(this.get('model.sound'));
    },
    save: function() {
      var _this = this;
      var sound = _this.get('model.sound');
      _this.set('status', {saving: true});
      sound.save().then(function() {
        modal.close({updated: true});
        _this.set('status', null);
      }, function() {
        _this.set('status', {error: true});
      });
    }
  }
});
