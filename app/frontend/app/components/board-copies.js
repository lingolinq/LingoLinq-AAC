import Component from '@ember/component';
import { inject as service } from '@ember/service';
import modal from '../utils/modal';
import i18n from '../utils/i18n';

/**
 * Board Copies modal (Phase 2).
 */
export default Component.extend({
  modal: service('modal'),
  persistence: service('persistence'),
  tagName: '',

  init() {
    this._super(...arguments);
    const modalService = this.get('modal');
    const template = 'board-copies';
    const options = (modalService && modalService.getSettingsFor && modalService.getSettingsFor(template)) ||
                    (modalService && modalService.settingsFor && modalService.settingsFor[template]) ||
                    this.get('model') || {};
    this.set('model', options);
  },

  didInsertElement() {
    this._super(...arguments);
    this.set('loading', true);
    this.set('error', null);
    const _this = this;
    const boardId = this.get('model.board.id');
    this.get('persistence').ajax('/api/v1/boards/' + boardId + '/copies', { type: 'GET' })
      .then(function(data) {
        _this.set('loading', false);
        _this.set('copies', data.board);
      }, function() {
        _this.set('loading', false);
        _this.set('error', i18n.t('copies_loading_error', 'There was an unexpected error trying to load copies of this board'));
      });
  },

  actions: {
    close() {
      this.get('modal').close();
    },
    opening() {},
    closing() {}
  }
});
