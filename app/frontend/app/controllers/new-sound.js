import modal from '../utils/modal';
import i18n from '../utils/i18n';
import contentGrabbers from '../utils/content_grabbers';
import { computed } from '@ember/object';
import { inject as service } from '@ember/service';

export default modal.ModalController.extend({
  modal: service(),

  opening: function() {
    contentGrabbers.soundGrabber.setup(null, this);
  },
  closing: function() {
    contentGrabbers.soundGrabber.clear();
  },
  recorder_unavailable: computed(function() {
    return !contentGrabbers.soundGrabber.recorder_available();
  }),
  actions: {
    nothing: function() {
      // I had some forms that were being used mainly for layout and I couldn't
      // figure out other than this how to get them to stop submitting when the
      // enter key was hit in some text fields. Weird thing was it wasn't all text
      // fields..
    },
    clear_sound_work: function() {
      contentGrabbers.soundGrabber.clear_sound_work();
    },
    clear_sound: function() {
      this.set('model.sound', null);
    },
    record_sound: function() {
      contentGrabbers.soundGrabber.record_sound();
    },
    toggle_recording_sound: function(action) {
      contentGrabbers.soundGrabber.toggle_recording_sound(action);
    },
    select_sound_preview: function() {
      var _this = this;
      contentGrabbers.soundGrabber.select_sound_preview().then(function(res) {
        _this.send('clear_sound');
        _this.send('clear_sound_work');
        this.modal.close(res);
      }, function() {

      });
    },
    find_url: function() {
      this.set('sound_preview', {
        name: i18n.t('web_sound', 'web sound'),
        url: this.get('url')
      });
    },
    close: function() {
      this.send('clear_sound');
      this.send('clear_sound_work');
      this.set('model.sound_id', null);
      this.modal.close();
    }
  }
});
