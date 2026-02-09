import Component from '@ember/component';
import { inject as service } from '@ember/service';
import { computed } from '@ember/object';
import { htmlSafe } from '@ember/template';
import modal from '../utils/modal';
import LingoLinq from '../app';
import editManager from '../utils/edit_manager';
import stashes from '../utils/_stashes';
import Button from '../utils/button';

/**
 * Button Stash modal (Phase 2).
 */
export default Component.extend({
  modal: service('modal'),
  appState: service('app-state'),
  tagName: '',

  init() {
    this._super(...arguments);
    this.set('model', {});
  },

  didInsertElement() {
    this._super(...arguments);
    const time_cutoff = (new Date()).getTime() - (7 * 24 * 60 * 60 * 1000);
    const default_stashed_at = 1449599949597;
    const current_buttons = (stashes.get_object('stashed_buttons', true) || []).reverse().filter(function(b) {
      return (b.stashed_at || default_stashed_at) > time_cutoff;
    });
    const stash = current_buttons.slice(0, 48).map(function(b) {
      delete b.stashed_at;
      const button = Button.create(b);
      button.set('outer_display_class', button.get('outer_display_class') + ' stashed_button');
      button.set('positioning', { height: 100 });
      return button;
    });
    this.set('button_stashes', stash);
  },

  editModeNormalText: computed('appState.edit_mode', function() {
    return this.get('appState.edit_mode');
  }),

  button_symbol_class: computed('appState.button_symbol_class', function() {
    return this.get('appState.button_symbol_class') || 'button_symbol';
  }),

  text_only_button_symbol_class: computed('appState.text_only_button_symbol_class', function() {
    return this.get('appState.text_only_button_symbol_class') || 'button_symbol no_image';
  }),

  outer_button_style: computed('model.id', function() {
    return 'width: 33%; height: 100px; padding: 5px;';
  }),

  inner_button_style: computed('model.id', function() {
    const height = 100 - LingoLinq.borderPad;
    return 'height: ' + height + 'px;';
  }),

  image_style: computed('model.id', function() {
    const height = 100 - LingoLinq.labelHeight - LingoLinq.boxPad;
    return htmlSafe('height: ' + height + 'px;');
  }),

  actions: {
    close() {
      this.get('modal').close();
    },
    opening() {},
    closing() {},
    pickButton(button) {
      editManager.get_ready_to_apply_stashed_button(button);
      this.get('modal').close(true);
    }
  }
});
