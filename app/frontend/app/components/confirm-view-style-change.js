import Component from '@ember/component';
import { inject as service } from '@ember/service';
import modal from '../utils/modal';

/* Shown when someone is about to change the view for a user who is NOT themselves — a
 * supervisor modelling for a communicator, or working on that communicator's pages.
 *
 * This exists because the write is not local and not temporary. `board_view_style` is a
 * stored preference on the COMMUNICATOR's record, so a supervisor flipping the view mid
 * session changes that person's default everywhere, on every device, until somebody changes
 * it back. Nothing about the control itself says so, which is exactly the gap this closes.
 *
 * Deliberately a confirm rather than a silent block: doing it on purpose is legitimate — an
 * SLP may be setting the view up FOR the communicator. The modal only has to make sure it is
 * never done by accident, and to say out loud that a temporary change has to be undone.
 */
export default Component.extend({
  modal: service('modal'),
  tagName: '',

  init() {
    this._super(...arguments);
    var self = this;
    this.ctrlAction = function(actionName) {
      var bound = Array.prototype.slice.call(arguments, 1);
      return function() {
        var args = bound.concat(Array.prototype.slice.call(arguments));
        var evt = args[args.length - 1];
        if (evt && typeof evt.preventDefault === 'function' && (evt.type || evt.target)) {
          if (evt.preventDefault) { evt.preventDefault(); }
          args.pop();
        }
        self.send.apply(self, [actionName].concat(args));
      };
    };

    var modalService = this.get('modal');
    var template = 'confirm-view-style-change';
    var options = (modalService && modalService.getSettingsFor && modalService.getSettingsFor(template)) ||
                  (modalService && modalService.settingsFor && modalService.settingsFor[template]) ||
                  this.get('model') || {};
    this.set('model', options);
  },

  actions: {
    close() {
      /* Closing WITHOUT the confirm value is what the caller reads as "cancel", so the
         dismiss X, the Cancel button and an outside click all land on the same answer and
         the preference is left alone. */
      this.get('modal').close();
    },
    opening() {},
    closing() {},
    confirm() {
      modal.close('change_view');
    }
  },

  didInsertElement() {
    this._super(...arguments);
    var self = this;
    this.onClose = function() { self.send('close'); };
    this.onOpening = function() { self.send('opening'); };
    this.onClosing = function() { self.send('closing'); };
  }
});
