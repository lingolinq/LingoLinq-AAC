import Component from '@ember/component';
import { inject as service } from '@ember/service';

export default Component.extend({
  app_state: service('app-state'),
  tagName: '',

  dismiss() {
    this.get('app_state').hide_toast();
  }
});
