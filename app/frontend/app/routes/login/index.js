import Route from '@ember/routing/route';

export default Route.extend({
  setupController: function(controller, model) {
    var parent = this.controllerFor('login');
    // Pass login_id, login_password, tmp_token from parent to child so the
    // login-form receives them (e.g. from ?auth- or ?model- query params)
    controller.set('login_id', parent.get('login_id'));
    controller.set('login_password', parent.get('login_password'));
    controller.set('tmp_token', parent.get('tmp_token'));
    controller.set('google_link_nonce', parent.get('google_link_nonce'));
    controller.set('google_error', parent.get('google_error'));
    controller.set('google_popout_id', parent.get('google_popout_id'));
    this._super(controller, model);
  }
});
