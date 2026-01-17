import { inject as service } from '@ember/service';
import modal from '../utils/modal';

import contentGrabbers from '../utils/content_grabbers';
import app_state from '../utils/app_state';
import i18n from '../utils/i18n';
import persistence from '../utils/persistence';
import editManager from '../utils/edit_manager';
import LingoLinq from '../app';

export default modal.ModalController.extend({
  modal: service(),

  opening: function() {
    this.set('loading', null);
    this.set('custom_badge_status', null);
    var _this = this;
    contentGrabbers.pictureGrabber.load_badge(this.get('model.badge'));
    contentGrabbers.badge_result = function(success, result) {
      _this.set('custom_badge_status', null);
      if(success) {
        if(result == 'loading') {
          _this.set('custom_badge_status', {loading: true});
        } else {
          _this.set('model.badge.image_url', result.get('url'));
          this.modal.close('badge-image');
        }
      } else {
        _this.set('custom_badge_status', {error: true});
      }
    };
  },
  closing: function() {
    contentGrabbers.pictureGrabber.done_with_badge();
  },
  actions: {
    update_badge_image: function() {
      var _this = this;
      _this.set('loading', true);
      var res = contentGrabbers.pictureGrabber.retrieve_badge().then(function(data) {
        return contentGrabbers.pictureGrabber.save_image(data).then(function(image) {
          _this.set('model.badge.image_url', image.get('url'));
          if(editManager.badgeEditingCallback && editManager.badgeEditingCallback.state) {
            _this.set('model.badge.state', editManager.badgeEditingCallback.state);
          }
          this.modal.close('badge-image');
        });
      });
      res.then(null, function() {
        // TODO: ...
      });
    }
  }
});

