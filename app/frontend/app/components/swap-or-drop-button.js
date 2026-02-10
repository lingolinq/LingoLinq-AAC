import Component from '@ember/component';
import { inject as service } from '@ember/service';
import { computed } from '@ember/object';
import modal from '../utils/modal';
import editManager from '../utils/edit_manager';
import i18n from '../utils/i18n';

/**
 * Swap or Drop Button modal (Phase 2).
 */
export default Component.extend({
  modal: service('modal'),
  tagName: '',

  init() {
    this._super(...arguments);
    const modalService = this.get('modal');
    const template = 'swap-or-drop-button';
    const options = (modalService && modalService.getSettingsFor && modalService.getSettingsFor(template)) ||
                    (modalService && modalService.settingsFor && modalService.settingsFor[template]) ||
                    this.get('model') || {};
    this.set('model', options);
  },

  didInsertElement() {
    this._super(...arguments);
    this.set('status', null);
  },

  pending: computed('status.message', 'status.need_decision', function() {
    return !!(this.get('status.message') || this.get('status.need_decision'));
  }),

  actions: {
    close() {
      this.get('modal').close();
    },
    opening() {},
    closing() {},
    swap_buttons() {
      const a = this.get('model.button.id');
      const b = this.get('model.folder.id');
      editManager.switch_buttons(a, b, 'swap');
      modal.close(true);
    },
    move_button(decision) {
      const a = this.get('model.button.id');
      const b = this.get('model.folder.id');
      this.set('status', { message: i18n.t('moving_button', 'Moving button...') });
      const _this = this;
      editManager.move_button(a, b, decision).then(function(res) {
        _this.set('status', null);
        modal.close(true);
        if (res.visible) {
          modal.success(i18n.t('button_moved', "Button successfully added to the board!"));
        } else {
          editManager.stash_button(res.button);
          modal.warning(i18n.t('button_moved_to_stash', "There wasn't room for the button on the board, so it's been added to the stash instead."));
        }
      }, function(err) {
        if (err.error === 'view only' && !decision) {
          _this.set('status', { need_decision: true });
          return;
        }
        let message = i18n.t('button_move_failed', "Button failed to be saved to the new board, please try again.");
        if (err.error === 'not authorized') {
          message = i18n.t('button_move_unauthorized', "Button failed to be saved, you do not have permission to modify the specified board.");
        }
        if (modal.is_open('swap-or-drop-button')) {
          _this.set('status', { error: message });
        } else {
          modal.error(message);
        }
      });
    }
  }
});
