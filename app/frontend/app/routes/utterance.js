import Route from '@ember/routing/route';
import { inject as service } from '@ember/service';

export default Route.extend({
  store: service('store'),
  model: function(params) {
    if(params.id == 'not_found') {
      return {error: true, not_found: true};
    } else if(params.id == 'expired') {
      return {error: true, expired: true};
    }
    return this.store.findRecord('utterance', params.id);
  },
});
