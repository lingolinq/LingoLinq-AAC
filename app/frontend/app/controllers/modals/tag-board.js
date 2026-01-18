import LingoLinq from '../../app';
import modal from '../../utils/modal';
import BoardHierarchy from '../../utils/board_hierarchy';
import i18n from '../../utils/i18n';
import stashes from '../../utils/_stashes';
import app_state from '../../utils/app_state';
import persistence from '../../utils/persistence';
import progress_tracker from '../../utils/progress_tracker';
import { computed } from '@ember/object';
import { inject as service } from '@ember/service';

export default modal.ModalController.extend({
  modal: service(),

  opening: function () {
    this.set('status', null);
    if (!this.get('model.user.board_tags')) {
      this.get('model.user').reload();
    }
  },
  actions: {
    update: function () {
      var downstream = !!this.get('downstream');
      var _this = this;
      _this.set('status', { loading: true });
      _this.get('model.user').tag_board(_this.get('model.board'), this.get('tag'), false, downstream).then(function () {
        _this.set('status', null);
        this.modal.close();
        this.modal.success(i18n.t('categorization_complete', "Board Categorization Complete"));
      }, function () {
        _this.set('status', { error: true });
      });
    }
  }
});
