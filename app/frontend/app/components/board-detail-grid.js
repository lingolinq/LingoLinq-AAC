import Component from '@ember/component';
import { inject as service } from '@ember/service';

export default Component.extend({
  tagName: '',
  app_state: service('app-state'),

  actions: {
    select_button(button) {
      var action = this.get('selectButton');
      if(action) { action(button); }
    },

    select_button_key(button, event) {
      var action = this.get('selectButtonKey');
      if(action) { action(button, event); }
    },

    edit_button_settings(button) {
      var action = this.get('editButtonSettings');
      if(action) { action(button); }
    },

    open_color_picker(button) {
      var action = this.get('openColorPicker');
      if(action) { action(button); }
    },

    stash_button(button) {
      var action = this.get('stashButton');
      if(action) { action(button); }
    },

    word_data(button) {
      var action = this.get('wordData');
      if(action) { action(button); }
    },

    clear_button(button) {
      var action = this.get('clearButton');
      if(action) { action(button); }
    },

    toggle_button_menu(button) {
      var action = this.get('toggleButtonMenu');
      if(action) { action(button); }
    },

    close_color_picker() {
      var action = this.get('closeColorPicker');
      if(action) { action(); }
    },

    apply_swatch_color(swatch) {
      var action = this.get('applySwatchColor');
      if(action) { action(swatch); }
    },

    toggle_minicolors() {
      var action = this.get('toggleMinicolors');
      if(action) { action(); }
    },

    apply_custom_color() {
      var action = this.get('applyCustomColor');
      if(action) { action(); }
    },

    button_event(button, event) {
      var action = this.get('buttonEvent');
      if(action) { action(button, event); }
    }
  }
});
