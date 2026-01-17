import Route from '@ember/routing/route';
import { later as runLater } from '@ember/runloop';
import persistence from '../utils/persistence';

export default Route.extend({
  model: function(params) {
    var obj = this.store.findRecord('organization', params.id);
    var _this = this;
    return obj.then(function(data) {
      if(!data.get('permissions') && persistence.get('online')) {
        runLater(function() {data.reload();});
      }
      return data;
    });
  },
  setupController: function(controller, model) {
    var _this = this;

    controller.set('model', model);
  }
});
