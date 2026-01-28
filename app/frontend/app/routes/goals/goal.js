import Route from '@ember/routing/route';
import { later as runLater } from '@ember/runloop';
import { inject as service } from '@ember/service';

export default Route.extend({
  store: service('store'),
  persistence: service('persistence'),
  model: function(params) {
    var _this = this;
    var obj = this.store.findRecord('goal', params.goal_id);
    return obj.then(function(data) {
      if(!data.get('permissions') && _this.persistence.get('online')) {
        runLater(function() {
          data.rollbackAttributes();
          data.reload();
        });
      }
      return data;
    });
  },
  setupController: function(controller, model) {
    var _this = this;
    controller.set('model', model);
    controller.set('status', null);
  }
});
