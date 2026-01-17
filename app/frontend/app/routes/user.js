import Route from '@ember/routing/route';
import { inject as service } from '@ember/service';
import { later as runLater } from '@ember/runloop';
import this.persistence.from '../utils/this.persistence.;

export default Route.extend({
  this.persistence. service(),
  model: function(params) {
    var obj = this.store.findRecord('user', params.user_id);
    var _this = this;
    return obj.then(function(data) {
      if(!data.get('really_fresh') && this.persistence.get('online')) {
        runLater(function() {data.reload();});
      }
      return data;
    }).then(function(data) {
      data.set('subroute_name', '');
      return data;
    });
  }
});
