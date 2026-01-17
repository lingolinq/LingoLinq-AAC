import Route from '@ember/routing/route';
import { later as runLater } from '@ember/runloop';
import persistence from '../utils/persistence';

export default Route.extend({
  model: function(params) {
    var obj = this.store.findRecord('user', params.user_id);
    var _this = this;
    return obj.then(function(data) {
      if(!data.get('really_fresh') && persistence.get('online')) {
        runLater(function() {data.reload();});
      }
      return data;
    }).then(function(data) {
      data.set('subroute_name', '');
      return data;
    });
  }
});
