import contentGrabbers from '../../utils/content_grabbers';
import modal from '../../utils/modal';
import capabilities from '../../utils/capabilities';
import persistence from '../../utils/persistence';
import speecher from '../../utils/speecher';
import i18n from '../../utils/i18n';
import { htmlSafe } from '@ember/string';
import { set as emberSet, get as emberGet } from '@ember/object';
import { later as runLater } from '@ember/runloop';
import { inject as service } from '@ember/service';

export default modal.ModalController.extend({
  persistence: service(),
  modal: service(),

  opening: function() {
    var _this = this;
    _this.set('code', {loading: true});
    this.persistence.ajax('/api/v1/users/' + this.get('model.user.user_name') + '/valet_credentials', {type: 'GET'}).then(function(cred) {
      if(cred && cred.url) {
        _this.set('code', {ready: true, url: cred.url});
        _this.generate_qr();
      } else {
        _this.set('code', {error: true});
      }
    }, function(err) {
      _this.set('code', {error: true});
    });
  },
  generate_qr: function() {
    if(!this.get('code.url')) { return; }

    if(window.QRCode) {
      var qr = new window.QRCode(document.querySelector('#qr_code'), {text: this.get('code.url'), width: 400, height: 400});
      document.querySelector('#qr_code').setAttribute('title', '');
    }
    // Canvas render or re-render
  },
  actions: {
    copy_link: function() {
      var url = this.get('code.url');
      if(url) {
        capabilities.sharing.copy_text(url);
        this.modal.close();
        modal.success(i18n.t('link_copied', "Link copied to the clipboard!"));
      }
    },
    copy_code: function() {
      var elem = document.querySelector('#qr_code canvas');
      if(!elem) { return; }
      try {
        var data_uri = elem.toDataURL('image/png');
        var file = contentGrabbers.data_uri_to_blob(data_uri);
        if(navigator.clipboard && navigator.clipboard.write && window.ClipboardItem) {
          navigator.clipboard.write([
            new window.ClipboardItem({"image/png": file})
          ]).then(function() {
            this.modal.close();
            modal.success(i18n.t('code_copied', "QR Code Image copied to the clipboard!"));
          }, function() {
            this.modal.close();
            this.modal.error(i18n.t('code_copy_failed', "QR Code Image failed to copy to the clipboard"));
          });
        }
      } catch(e) { debugger}        
    },
    download_code: function() {
      var elem = document.querySelector('#qr_code canvas');
      if(!elem) { return; }
      try {
        var data_uri = elem.toDataURL('image/png');
        var element = document.createElement('a');
        element.setAttribute('href', data_uri);
        element.setAttribute('download', 'qr_code.png');
      
        element.style.display = 'none';
        document.body.appendChild(element);
      
        element.click();
      
        document.body.removeChild(element);
      } catch(e) { }        
    },
  }
});
