import Component from '@ember/component';
import { inject as service } from '@ember/service';

export default Component.extend({
  modal: service('modal'),
  openDropdown: null,

  actions: {
    toggleDropdown(key) {
      this.set('openDropdown', this.get('openDropdown') === key ? null : key);
    },
    closeDropdown() {
      this.set('openDropdown', null);
    },
    selectButtonAppearance(value) {
      this.get('setup').send('set_preference', 'device.button_text_position', value);
      this.set('openDropdown', null);
    },
    selectSymbolLibrary(value) {
      this.get('setup').send('set_preference', 'preferred_symbols', value);
      this.set('openDropdown', null);
    },
    selectSkin(value) {
      if (value === 'limit') {
        this.get('modal').open('limit-skin-tones', { setup: this.get('setup') });
        this.set('openDropdown', null);
        return;
      }
      var setup = this.get('setup');
      var user = setup.get('setup_user') || setup.get('fake_user');
      var skinValue = value;
      if (value === 'prefer' && user && user.get('id')) {
        skinValue = 'mix_prefer::' + user.get('id') + '::limit-000000';
      }
      setup.send('set_preference', 'skin', skinValue);
      this.set('openDropdown', null);
    },
    selectUtteranceLayout(value) {
      this.get('setup').send('set_preference', 'device.utterance_text_only', value);
      this.set('openDropdown', null);
    },
    selectSymbolBackground(value) {
      this.get('setup').send('set_preference', 'device.symbol_background', value);
      this.set('openDropdown', null);
    },
    showMoreSymbols() {
      this.get('setup').send('show_more_symbols');
    }
  }
});
