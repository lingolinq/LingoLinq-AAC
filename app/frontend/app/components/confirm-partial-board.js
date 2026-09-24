import Component from '@ember/component';
import { inject as service } from '@ember/service';
import { computed } from '@ember/object';
import modal from '../utils/modal';
import i18n from '../utils/i18n';

/* Shown when Save Board is pressed on a board that has SOME words but not enough to fill the
 * grid that was chosen.
 *
 * Two separate things are going on, and the dialog says both:
 *
 *  1. The board is incomplete for its grid size. Saving is fine -- the leftover cells become
 *     blank buttons the board editor can fill in later -- but people routinely pick a grid
 *     before they know how many words they want, and a 6x8 board with 11 words on it is
 *     usually a mistake rather than a plan.
 *
 *  2. Some ROWS or COLUMNS are empty end to end. That is the case worth acting on, because
 *     it is fixable without losing anything: dropping them shrinks the board to the size the
 *     words actually need, and every word keeps its position relative to its neighbours. The
 *     third button only appears when there is something to drop.
 *
 * Resolves with 'save_trimmed' or 'save_as_is'. Cancel closes with no value, which the caller
 * reads as "do not save".
 *
 * Counts are pluralised by picking between two keys rather than through `i18n.t`'s `count`
 * option: that option's pipe-form branch calls `str.sub(...)`, which is Ruby's method name
 * and does not exist on a JS string, so it would throw the moment a locale had a pipe form.
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
    var template = 'confirm-partial-board';
    var options = (modalService && modalService.getSettingsFor && modalService.getSettingsFor(template)) ||
                  (modalService && modalService.settingsFor && modalService.settingsFor[template]) ||
                  this.get('model') || {};
    this.set('model', options);
  },

  /** "6 × 8". Assembled here so the two numbers and the separator can never be split across
   *  translated fragments. */
  grid_label: computed('model.rows', 'model.columns', function() {
    return (this.get('model.rows') || 0) + ' × ' + (this.get('model.columns') || 0);
  }),

  /** The size the board would become if the empty rows and columns were dropped. */
  trim_label: computed('model.trim_rows', 'model.trim_columns', function() {
    return (this.get('model.trim_rows') || 0) + ' × ' + (this.get('model.trim_columns') || 0);
  }),

  /** "2 empty rows and 1 empty column", or just one half when only one kind is empty. */
  empty_summary: computed('model.empty_rows_count', 'model.empty_columns_count', function() {
    var rows = this.get('model.empty_rows_count') || 0;
    var cols = this.get('model.empty_columns_count') || 0;
    var parts = [];
    if(rows === 1) {
      parts.push(i18n.t('partial_board_one_empty_row', "1 empty row"));
    } else if(rows > 1) {
      parts.push(i18n.t('partial_board_many_empty_rows', "%{n} empty rows", { n: rows }));
    }
    if(cols === 1) {
      parts.push(i18n.t('partial_board_one_empty_column', "1 empty column"));
    } else if(cols > 1) {
      parts.push(i18n.t('partial_board_many_empty_columns', "%{n} empty columns", { n: cols }));
    }
    if(parts.length === 2) {
      return i18n.t('partial_board_empty_pair', "%{a} and %{b}", { a: parts[0], b: parts[1] });
    }
    return parts[0] || '';
  }),


  actions: {
    close() {
      this.get('modal').close();
    },
    opening() {},
    closing() {},
    save_trimmed() {
      modal.close('save_trimmed');
    },
    save_as_is() {
      modal.close('save_as_is');
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
