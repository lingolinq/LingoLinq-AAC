import Component from '@ember/component';
import { computed } from '@ember/object';
import i18n from '../utils/i18n';

export default Component.extend({
  tagName: '',
  showPassword: false,
  inputType: computed('showPassword', function() {
    return this.get('showPassword') ? 'text' : 'password';
  }),
  toggleAriaLabel: computed('showPassword', function() {
    if(this.get('showPassword')) {
      return i18n.t('hide_password', "Hide password");
    }
    return i18n.t('show_password', "Show password");
  }),
  actions: {
    togglePasswordVisibility: function() {
      this.toggleProperty('showPassword');
    }
  }
});
