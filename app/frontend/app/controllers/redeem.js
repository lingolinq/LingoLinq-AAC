import Controller from '@ember/controller';
import { inject as service } from '@ember/service';

export default Controller.extend({
  router: service('router'),
  actions: {
    check_code: function() {
      if(this.get('redeem_code')) {
        this.router.transitionTo('redeem_with_code', this.get('redeem_code'));
      }
    }
  }
});
