import LingoLinq from '../app';
import app_state from '../utils/app_state';
import contentGrabbers from '../utils/content_grabbers';
import modal from '../utils/modal';

export default modal.ModalController.extend({
  opening: function() {
    this.set('status', null);
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
