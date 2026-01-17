import { inject as service } from '@ember/service';
import modal from '../utils/modal';

import LingoLinq from '../app';
import app_state from '../utils/app_state';
import contentGrabbers from '../utils/content_grabbers';

export default modal.ModalController.extend({
  modal: service(),

  opening: function() {
    this.set('status', null);
  },
  actions: {
    close: function() {
      this.modal.close(false);
    },
    play_sound: function() {
      contentGrabbers.soundGrabber.play_audio(this.get('model.sound'));
    },
    save: function() {
      var _this = this;
      var sound = _this.get('model.sound');
      _this.set('status', {saving: true});
      sound.save().then(function() {
        this.modal.close({updated: true});
        _this.set('status', null);
      }, function() {
        _this.set('status', {error: true});
      });
    }
  }
});
