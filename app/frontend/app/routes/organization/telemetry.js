import Route from '@ember/routing/route';

export default Route.extend({
  setupController(controller) {
    var org = this.modelFor('organization');
    org.load_users();
    this._super(...arguments);
    controller.set('model', org);
    controller.refreshTelemetry();
  }
});
