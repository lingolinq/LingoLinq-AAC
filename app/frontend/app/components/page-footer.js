import Component from '@ember/component';
import app_state from '../utils/app_state';
import persistence from '../utils/persistence';

export default Component.extend({
  
  actions: {
    support() {
      this.sendAction('support');
    },
    language() {
      this.sendAction('language');
    }
  }
});
