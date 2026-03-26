import Component from '@ember/component';
import { inject as service } from '@ember/service';
import i18n from '../utils/i18n';
import modal from '../utils/modal';

export default Component.extend({
  modal: service('modal'),
  tagName: '',
  folderName: '',
  status: null,

  init() {
    this._super(...arguments);
    const modalService = this.get('modal');
    const template = 'new-board-folder';
    const options = (modalService && modalService.getSettingsFor && modalService.getSettingsFor(template)) ||
                    (modalService && modalService.settingsFor && modalService.settingsFor[template]) ||
                    this.get('model') || {};
    this.set('model', options);
  },

  actions: {
    close() {
      this.get('modal').close();
    },
    opening() {
      this.set('folderName', '');
      this.set('status', null);
    },
    submit() {
      var name = (this.get('folderName') || '').trim();
      if (!name.length) {
        this.set('status', { error: true });
        return;
      }
      var user = this.get('model.user');
      if (!user || !user.ensureBoardTag) {
        this.set('status', { error: true });
        return;
      }
      var _this = this;
      this.set('status', { loading: true });
      user.ensureBoardTag(name).then(function() {
        _this.set('status', null);
        _this.get('modal').close(true);
        modal.success(i18n.t('folder_created', "Folder created"));
      }, function() {
        _this.set('status', { error: true, loading: false });
      });
    }
  }
});
