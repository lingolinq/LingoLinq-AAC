import editManager from '../utils/edit_manager';
import modal from '../utils/modal';
import i18n from '../utils/i18n';
import { computed } from '@ember/object';
import { inject as service } from '@ember/service';

export default modal.ModalController.extend({
  modal: service(),

  opening: function () {
    this.set('status', null);
  },
  pending: computed('status.message', 'status.need_decision', function () {
    return !!(this.get('status.message') || this.get('status.need_decision'));
  }),
  actions: {
    swap_buttons: function () {
      var a = this.get('model.button.id');
      var b = this.get('model.folder.id');
      editManager.switch_buttons(a, b, 'swap');
      this.modal.close(true);
    },
    move_button: function (decision) {
      var a = this.get('model.button.id');
      var b = this.get('model.folder.id');
      var button = this.get('model.button');
      this.set('status', { message: i18n.t('moving_button', 'Moving button...') });
      var _this = this;
      editManager.move_button(a, b, decision).then(function (res) {
        _this.set('status', null);
        this.modal.close(true);
        if (res.visible) {
          this.modal.success(i18n.t('button_moved', "Button successfully added to the board!"));
        } else {
          editManager.stash_button(res.button);
          this.modal.warning(i18n.t('button_moved_to_stash', "There wasn't room for the button on the board, so it's been added to the stash instead."));
        }
      }, function (err) {
        if (err.error == 'view only' && !decision) {
          _this.set('status', { need_decision: true });
          return;
        }
        var message = i18n.t('button_move_failed', "Button failed to be saved to the new board, please try again.");
        if (err.error == 'not authorized') {
          message = i18n.t('button_move_unauthorized', "Button failed to be saved, you do not have permission to modify the specified board.");
        }
        if (this.modal.is_open('swap-or-drop-button')) {
          _this.set('status', { error: message });
        } else {
          this.modal.error(message);
        }
      });
    }
  }
});
