import Component from '@ember/component';
import { inject as service } from '@ember/service';
import { computed } from '@ember/object';
import modal from '../utils/modal';
import persistence from '../utils/persistence';

/**
 * Confirm Remove Board modal (Phase 2).
 */
export default Component.extend({
  modal: service('modal'),
  tagName: '',

  init() {
    this._super(...arguments);
    const modalService = this.get('modal');
    const template = 'confirm-remove-board';
    const options = (modalService && modalService.getSettingsFor && modalService.getSettingsFor(template)) ||
                    (modalService && modalService.settingsFor && modalService.settingsFor[template]) ||
                    this.get('model') || {};
    this.set('model', options);
  },

  didInsertElement() {
    this._super(...arguments);
    this.set('loading', false);
    this.set('error', false);
  },

  delete_action: computed('model.action', function() {
    return this.get('model.action') === 'delete';
  }),

  unlink_action: computed('model.action', function() {
    return this.get('model.action') === 'unlink';
  }),

  untag_action: computed('model.action', function() {
    return this.get('model.action') === 'untag';
  }),

  unstar_action: computed('model.action', function() {
    return this.get('model.action') === 'unstar';
  }),

  actions: {
    close() {
      this.get('modal').close();
    },
    opening() {},
    closing() {},
    remove() {
      const board = this.get('model.board');
      const user = this.get('model.user');
      const _this = this;
      _this.set('loading', true);
      _this.set('error', false);
      persistence.ajax('/api/v1/boards/unlink', {
        type: 'POST',
        data: {
          board_id: board.get('id'),
          user_id: user.get('id'),
          tag: this.get('model.tag'),
          type: this.get('model.action')
        }
      }).then(function() {
        _this.set('loading', false);
        _this.set('error', false);
        board.set('removed', true);
        modal.close({ update: true });
      }, function() {
        _this.set('loading', false);
        _this.set('error', true);
      });
    }
  }
});
