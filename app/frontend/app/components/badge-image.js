import Component from '@ember/component';
import { inject as service } from '@ember/service';
import modal from '../utils/modal';
import contentGrabbers from '../utils/content_grabbers';
import editManager from '../utils/edit_manager';

/**
 * Badge image picker (OpenSymbols badge maker + upload). Rendered via modal service
 * (modal-container); the legacy outlet path is not used when the modal service exists.
 */
export default Component.extend({
  modalService: service('modal'),
  tagName: '',

  init() {
    this._super(...arguments);
    const svc = this.get('modalService');
    const template = 'badge-image';
    const options =
      (svc && svc.getSettingsFor && svc.getSettingsFor(template)) ||
      (svc && svc.settingsFor && svc.settingsFor[template]) ||
      this.get('model') ||
      {};
    this.set('model', options);
  },

  actions: {
    opening() {
      const _this = this;
      this.get('modalService').setComponent(this);
      this.set('loading', null);
      this.set('custom_badge_status', null);
      contentGrabbers.pictureGrabber.load_badge(this.get('model.badge'));
      contentGrabbers.badge_result = function(success, result) {
        _this.set('custom_badge_status', null);
        if (success) {
          if (result == 'loading') {
            _this.set('custom_badge_status', { loading: true });
          } else {
            _this.set('model.badge.image_url', result.get('url'));
            modal.close('badge-image');
          }
        } else {
          _this.set('custom_badge_status', { error: true });
        }
      };
    },

    closing() {
      contentGrabbers.pictureGrabber.done_with_badge();
    },

    close() {
      modal.close();
    },

    update_badge_image() {
      var _this = this;
      _this.set('loading', true);
      var res = contentGrabbers.pictureGrabber.retrieve_badge().then(function(data) {
        return contentGrabbers.pictureGrabber.save_image(data).then(function(image) {
          _this.set('model.badge.image_url', image.get('url'));
          if (editManager.badgeEditingCallback && editManager.badgeEditingCallback.state) {
            _this.set('model.badge.state', editManager.badgeEditingCallback.state);
          }
          modal.close('badge-image');
        });
      });
      res.then(null, function() {
        // TODO: ...
      });
    },
  },
});
