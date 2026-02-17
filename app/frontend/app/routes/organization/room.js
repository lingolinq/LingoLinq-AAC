import Route from '@ember/routing/route';
import { later as runLater } from '@ember/runloop';
import { inject as service } from '@ember/service';

export default Route.extend({
  store: service('store'),
  persistence: service('persistence'),
  model: function(params) {
    var obj = this.store.findRecord('unit', params.room_id);
    var _this = this;
    return obj.then(function(data) {
      if(!data.get('permissions') && _this.persistence.get('online')) {
        runLater(function() {data.reload();});
      }
      return data;
    });
  },
  setupController: function(controller, model) {
    controller.set('model', model);
    controller.load_stats();
    controller.set('organization', this.modelFor('organization'));
    model.load_data();
    controller.get('organization').load_users();
  }
});
