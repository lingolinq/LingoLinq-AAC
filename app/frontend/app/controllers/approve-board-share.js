import { inject as service } from '@ember/service';
import modal from '../utils/modal';

import persistence from '../utils/persistence';
import app_state from '../utils/app_state';
import i18n from '../utils/i18n';

export default modal.ModalController.extend({
  appState: service('app-state'),
  persistence: service(),
  modal: service(),

  opening: function() {
    this.set('pending', null);
    this.set('error', null);
  },
  approve_or_reject(approve) {
    var _this = this;
    _this.set('pending', true);
    this.persistence.ajax('/api/v1/boards/' + _this.get('model.board.id') + '/share_response', {
      type: 'POST',
      data: {
        approve: approve
      }
    }).then(function(data) {
      _this.get('model.board').reload_including_all_downstream();
      this.appState.get('currentUser').reload();
      this.modal.close('approve-board-share');
      if(approve) {
        modal.success(i18n.t('board_share_approved', "Board share successfully approved"));
      } else {
        modal.success(i18n.t('board_share_rejected', "Board share successfully rejected"));
      }
    }, function() {
      _this.set('pending', false);
      _this.set('error', true);
    });
//    reload_including_all_downstream
  },
  actions: {
    approve: function() {
      this.approve_or_reject(true);
    },
    reject: function() {
      this.approve_or_reject(false);
    }
  }
});
