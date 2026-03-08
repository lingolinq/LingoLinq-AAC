import Route from '@ember/routing/route';

export default Route.extend({
  setupController: function(controller, model) {
    var parent = this.controllerFor('login');
    this._super(parent, model);
  }
});
