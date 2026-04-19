import Route from '@ember/routing/route';

export default Route.extend({
  setupController: function(controller, model) {
    var parent = this.controllerFor('login');
    // Pass login_id, login_password, tmp_token from parent to child so the
    // login-form receives them (e.g. from ?auth- or ?model- query params)
    controller.set('login_id', parent.get('login_id'));
    controller.set('login_password', parent.get('login_password'));
    controller.set('tmp_token', parent.get('tmp_token'));
    this._super(controller, model);
  }
});
