import Component from '@ember/component';
import { inject as service } from '@ember/service';
import { later as runLater } from '@ember/runloop';
import modal from '../utils/modal';
import contentGrabbers from '../utils/content_grabbers';
import capabilities from '../utils/capabilities';
import i18n from '../utils/i18n';

/**
 * Valet Mode Modal Component
 *
 * Converted from modals/valet-mode template/controller to component
 * for the new service-based modal system.
 */
export default Component.extend({
  modal: service('modal'),
  persistence: service('persistence'),
  tagName: '',

  init() {
    this._super(...arguments);
    const modalService = this.get('modal');
    const template = 'modals/valet-mode';
    const options = (modalService && modalService.getSettingsFor && modalService.getSettingsFor(template)) ||
                    (modalService && modalService.settingsFor && modalService.settingsFor[template]) ||
                    this.get('model') || {};
    this.set('model', options);
    const _this = this;
    _this.set('code', { generating: true });
    this.get('persistence').ajax('/api/v1/users/' + this.get('model.user.user_name') + '/valet_credentials', { type: 'GET' }).then(function(cred) {
      if (cred && cred.url) {
        _this.set('code', { ready: true, url: cred.url });
        runLater(function() {
          _this.generate_qr();
        }, 100);
      } else {
        _this.set('code', { error: true });
      }
    }, function() {
      _this.set('code', { error: true });
    });
  },

  generate_qr() {
    if (!this.get('code.url')) { return; }
    if (window.QRCode) {
      const el = document.querySelector('#qr_code');
      if (el) {
        const qr = new window.QRCode(el, { text: this.get('code.url'), width: 400, height: 400 });
        el.setAttribute('title', '');
      }
    }
  },

  actions: {
    close() {
      this.get('modal').close();
    },
    opening() {},
    closing() {},
    copy_link() {
      const url = this.get('code.url');
      if (url && capabilities.sharing && capabilities.sharing.copy_text) {
        capabilities.sharing.copy_text(url);
        this.get('modal').close();
        modal.success(i18n.t('link_copied', "Link copied to the clipboard!"));
      }
    },
    copy_code() {
      const elem = document.querySelector('#qr_code canvas');
      if (!elem) { return; }
      try {
        const data_uri = elem.toDataURL('image/png');
        const file = contentGrabbers.data_uri_to_blob(data_uri);
        if (navigator.clipboard && navigator.clipboard.write && window.ClipboardItem) {
          navigator.clipboard.write([
            new window.ClipboardItem({ 'image/png': file })
          ]).then(() => {
            this.get('modal').close();
            modal.success(i18n.t('code_copied', "QR Code Image copied to the clipboard!"));
          }, () => {
            this.get('modal').close();
            modal.error(i18n.t('code_copy_failed', "QR Code Image failed to copy to the clipboard"));
          });
        }
      } catch (e) { }
    },
    download_code() {
      const elem = document.querySelector('#qr_code canvas');
      if (!elem) { return; }
      try {
        const data_uri = elem.toDataURL('image/png');
        const element = document.createElement('a');
        element.setAttribute('href', data_uri);
        element.setAttribute('download', 'qr_code.png');
        element.style.display = 'none';
        document.body.appendChild(element);
        element.click();
        document.body.removeChild(element);
      } catch (e) { }
    }
  }
});
