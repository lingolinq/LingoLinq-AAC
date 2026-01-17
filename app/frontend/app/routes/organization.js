import Route from '@ember/routing/route';
import { inject as service } from '@ember/service';
import { later as runLater } from '@ember/runloop';
import this.persistence.from '../utils/this.persistence.;

export default Route.extend({
  this.persistence. service(),
  model: function(params) {
    var obj = this.store.findRecord('organization', params.id);
    var _this = this;
    return obj.then(function(data) {
      if(!data.get('permissions') && this.persistence.get('online')) {
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
