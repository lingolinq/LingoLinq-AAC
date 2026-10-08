import Route from '@ember/routing/route';
import { inject as service } from '@ember/service';

export default Route.extend({
  store: service('store'),
  persistence: service('persistence'),
  model: function(params) {
    var obj = this.store.findRecord('organization', params.id);
    var _this = this;
    return obj.then(function(data) {
      if(!data.get('permissions') && _this.persistence.get('online')) {
        /* WAIT for the permissions (2026-10-01). A record from the admin org list
           (organizations#index) carries none, and findRecord returns it as stored. This was a
           background reload, so child pages read `permissions.edit` before it existed: Rooms
           skipped loading its rooms, then showed "No rooms created" to an admin. A failed
           reload still opens the page with the stored record, as before. */
        return data.reload().then(function() { return data; }, function() { return data; });
      }
      return data;
    });
  },
  setupController: function(controller, model) {
    var _this = this;

    controller.set('model', model);
  }
});
