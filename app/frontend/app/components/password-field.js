import Component from '@ember/component';
import { computed } from '@ember/object';
import i18n from '../utils/i18n';

export default Component.extend({
  tagName: '',
  showPassword: false,
  init() {
    this._super(...arguments);
    var self = this;
    this.togglePasswordVisibility = function() {
      self.toggleProperty('showPassword');
    };
  },
  inputType: computed('showPassword', function() {
    return this.get('showPassword') ? 'text' : 'password';
  }),
  toggleAriaLabel: computed('showPassword', function() {
    if(this.get('showPassword')) {
      return i18n.t('hide_password', "Hide password");
    }
    return i18n.t('show_password', "Show password");
  })
});
