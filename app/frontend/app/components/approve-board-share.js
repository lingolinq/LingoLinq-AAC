import Component from '@ember/component';
import { inject as service } from '@ember/service';
import modal from '../utils/modal';
import persistence from '../utils/persistence';
import app_state from '../utils/app_state';
import i18n from '../utils/i18n';

/**
 * Approve Board Share modal (Phase 2).
 */
export default Component.extend({
  modal: service('modal'),
  tagName: '',

  init() {
    this._super(...arguments);
    const modalService = this.get('modal');
    const template = 'approve-board-share';
    const options = (modalService && modalService.getSettingsFor && modalService.getSettingsFor(template)) ||
                    (modalService && modalService.settingsFor && modalService.settingsFor[template]) ||
                    this.get('model') || {};
    this.set('model', options);
  },

  didInsertElement() {
    this._super(...arguments);
    this.set('pending', null);
    this.set('error', null);
  },

  approve_or_reject(approve) {
    const _this = this;
    _this.set('pending', true);
    persistence.ajax('/api/v1/boards/' + _this.get('model.board.id') + '/share_response', {
      type: 'POST',
      data: { approve: approve }
    }).then(function() {
      _this.get('model.board').reload_including_all_downstream();
      app_state.get('currentUser').reload();
      modal.close('approve-board-share');
      if (approve) {
        modal.success(i18n.t('board_share_approved', "Board share successfully approved"));
      } else {
        modal.success(i18n.t('board_share_rejected', "Board share successfully rejected"));
      }
    }, function() {
      _this.set('pending', false);
      _this.set('error', true);
    });
  },

  actions: {
    close() {
      this.get('modal').close();
    },
    opening() {},
    closing() {},
    approve() {
      this.approve_or_reject(true);
    },
    reject() {
      this.approve_or_reject(false);
    }
  }
});
