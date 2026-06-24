import Component from '@ember/component';
import { inject as service } from '@ember/service';
import { computed } from '@ember/object';
import modal from '../utils/modal';
import BoardHierarchy from '../utils/board_hierarchy';
import i18n from '../utils/i18n';
import editManager from '../utils/edit_manager';

/**
 * Board Details modal (Phase 2).
 */
export default Component.extend({
  modal: service('modal'),
  appState: service('app-state'),
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
    this.ctrlActionNoBubble = function(actionName) {
      var bound = Array.prototype.slice.call(arguments, 1);
      return function(event) {
        if (event && event.stopPropagation) { event.stopPropagation(); }
        if (event && event.preventDefault) { event.preventDefault(); }
        self.send.apply(self, [actionName].concat(bound));
      };
    };

    const modalService = this.get('modal');
    const template = 'board-details';
    const options = (modalService && modalService.getSettingsFor && modalService.getSettingsFor(template)) ||
                    (modalService && modalService.settingsFor && modalService.settingsFor[template]) ||
                    this.get('model') || {};
    this.set('model', options.board || options);
    this.set('edit_mode', !!options.edit_mode);
  },

  didInsertElement() {
    this._super(...arguments);
    this.set('hierarchy', { loading: true });
    const model = this.get('model');
    // A board first materialized from a #tree/#bulk lite prefetch omits
    // parent_board_id/parent_board_key, so the "Copied From" link is dropped
    // (issue #293). Refetch so it repopulates when present.
    if (model && model.reload_if_lite) { model.reload_if_lite(); }
    BoardHierarchy.load_with_button_set(model).then((hierarchy) => {
      this.set('hierarchy', hierarchy);
    }, () => {
      this.set('hierarchy', { error: true });
    });
  },

  images_with_license: computed('model.buttons', 'model.grid', function() {
    return this.get('model.local_images_with_license');
  }),

  sounds_with_license: computed('model.buttons', 'model.grid', function() {
    return this.get('model.local_sounds_with_license');
  }),

  language: computed('model.locale', function() {
    return i18n.readable_language(this.get('model.locale'));
  }),

  multiple_locales: computed('model.locales', function() {
    return (this.get('model.locales') || []).length > 1;
  }),

  languages: computed('model.locales', function() {
    return (this.get('model.locales') || []).map(function(l) { return i18n.readable_language(l); }).join(', ');
  }),

  actions: {
    close() {
      this.get('modal').close();
    },
    opening() {},
    closing() {},
    show_licenses() {
      this.set('showing_licenses', true);
    },
    boardStats() {
      modal.open('board-stats', { board: this.get('model') });
    },
    renameBoard() {
      modal.open('rename-board', { board: this.get('model') });
    },
    edit_board_details() {
      modal.open('edit-board-details', { board: this.get('model') });
    },
    delete(decision) {
      modal.open('confirm-delete-board', { board: this.get('model'), redirect: true });
    },
    button_set_words() {
      modal.open('button-set', { board: this.get('model'), button_set: this.get('model.button_set') });
    },
    translate() {
      modal.open('translation-select', { board: this.get('model'), button_set: this.get('model.button_set') });
    },
    swap_images() {
      modal.open('swap-images', { board: this.get('model'), button_set: this.get('model.button_set') });
    },
    privacy() {
      modal.open('modals/board-privacy', { board: this.get('model'), button_set: this.get('model.button_set') });
    },
    categorize() {
      modal.open('modals/tag-board', { board: this.get('model'), user: this.get('appState').get('currentUser') });
    },
    batch_recording() {
      const _this = this;
      modal.open('batch-recording', { user: this.get('appState').get('currentUser'), board: this.get('model') }).then(function() {
        _this.get('model').reload().then(function() {
          _this.get('model').load_button_set(true);
          editManager.process_for_displaying();
        });
      });
    }
  }
});
