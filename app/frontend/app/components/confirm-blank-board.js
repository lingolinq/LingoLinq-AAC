import Component from '@ember/component';
import { inject as service } from '@ember/service';
import { computed } from '@ember/object';
import modal from '../utils/modal';

/* Shown when Save Board is pressed on a board whose grid has NO labels at all.
 *
 * A blank board is a legitimate thing to make -- some people lay the grid out first and fill
 * it in with the board editor afterwards, and an AAC user's board is often built over several
 * sessions. So this is a confirm, never a block. What it exists to catch is the other case:
 * someone who typed labels into the field, never pressed Enter to commit them, and is about
 * to save a board that looks finished on their screen and arrives empty.
 *
 * Resolves the modal promise with 'save_blank' on confirm. Cancel closes with no value, which
 * `create-board-new`'s guard reads as "do not save" -- so the X, the Cancel button and an
 * outside click all land on the same answer.
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
    var template = 'confirm-blank-board';
    var options = (modalService && modalService.getSettingsFor && modalService.getSettingsFor(template)) ||
                  (modalService && modalService.settingsFor && modalService.settingsFor[template]) ||
                  this.get('model') || {};
    this.set('model', options);
  },

  /** "3 × 4" for the message. Built here rather than in the template so the numbers cannot
   *  be split across two translated fragments. */
  grid_label: computed('model.rows', 'model.columns', function() {
    return (this.get('model.rows') || 0) + ' × ' + (this.get('model.columns') || 0);
  }),


  actions: {
    close() {
      this.get('modal').close();
    },
    opening() {},
    closing() {},
    confirm() {
      modal.close('save_blank');
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
