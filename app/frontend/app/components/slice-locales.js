import Component from '@ember/component';
import { inject as service } from '@ember/service';
import { computed } from '@ember/object';
import BoardHierarchy from '../utils/board_hierarchy';
import i18n from '../utils/i18n';
import app_state from '../utils/app_state';
import persistence from '../utils/persistence';
import progress_tracker from '../utils/progress_tracker';

/**
 * Slice Locales Modal Component
 *
 * Converted from modals/slice-locales template/controller to component
 * for the new service-based modal system.
 */
export default Component.extend({
  modal: service('modal'),
  tagName: '',

  init() {
    this._super(...arguments);
    const modalService = this.get('modal');
    const template = 'modals/slice-locales';
    const options = (modalService && modalService.getSettingsFor && modalService.getSettingsFor(template)) ||
                    (modalService && modalService.settingsFor && modalService.settingsFor[template]) ||
                    this.get('model') || {};
    this.set('model', options);
    this.set('hierarchy', null);
    this.set('status', null);
  },

  langs: computed('model.board.locales', function() {
    const res = [];
    (this.get('model.board.locales') || []).forEach(function(loc) {
      res.push({ loc: loc, keep: true, str: i18n.locales_localized[loc] || i18n.locales[loc] });
    });
    return res;
  }),

  actions: {
    close() {
      this.get('modal').close();
    },
    opening() {
      this.get('modal').setComponent(this);
      this.set('hierarchy', { loading: true });
      this.set('status', null);
      const board = this.get('model.board');
      if (!board) {
        this.set('hierarchy', { error: true });
        return;
      }
      const _this = this;
      BoardHierarchy.load_with_button_set(board, {
        deselect_on_different: true,
        prevent_keyboard: true,
        prevent_different: true
      }).then(function(hierarchy) {
        _this.set('hierarchy', hierarchy);
      }, function() {
        _this.set('hierarchy', { error: true });
      });
    },
    closing() {},
    nothing() {},
    confirm() {
      const _this = this;
      let board_ids_to_include = null;
      const hierarchy = this.get('hierarchy');
      if (hierarchy && hierarchy.selected_board_ids) {
        board_ids_to_include = hierarchy.selected_board_ids();
      }
      const locales = [];
      this.get('langs').forEach(function(lang) {
        if (lang.keep) { locales.push(lang.loc); }
      });
      if (locales.length === 0) { return; }
      this.set('status', { loading: true });
      persistence.ajax('/api/v1/boards/' + this.get('model.board.id') + '/slice_locales', {
        type: 'POST',
        data: {
          locales: locales,
          ids_to_update: board_ids_to_include
        }
      }).then(function(res) {
        progress_tracker.track(res.progress, function(event) {
          if (event.status === 'errored') {
            _this.set('status', { error: true });
          } else if (event.status === 'finished') {
            _this.set('status', { finished: true });
            _this.get('model.board').reload(true).then(function() {
              app_state.set('board_reload_key', Math.random() + '-' + (new Date()).getTime());
              _this.get('modal').close();
            }, function() {});
          }
        });
      }, function() {
        _this.set('status', { error: true });
      });
    }
  }
});
