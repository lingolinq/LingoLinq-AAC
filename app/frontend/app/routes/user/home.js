import IndexRoute from '../index';
import session from '../../utils/session';
import RSVP from 'rsvp';

/**
 * Authenticated dashboard at /:user_name/home — same UI as index (Dashboard::AuthenticatedView)
 * via index template + index controller; URL matches reports pattern (e.g. /user/stats).
 */
export default IndexRoute.extend({
  controllerName: 'index',

  activate: function() {
    this._super(...arguments);
  },

  model: function() {
    return this.modelFor('user');
  },

  afterModel: function(user) {
    var _this = this;
    if (!session.get('access_token')) {
      this.transitionTo('index');
      return RSVP.reject();
    }
    return this.store.findRecord('user', 'self').then(function(selfUser) {
      if (!selfUser.get('user_name') || !user.get('user_name')) {
        _this.transitionTo('index');
        return RSVP.reject();
      }
      if (selfUser.get('user_name') !== user.get('user_name')) {
        _this.replaceWith('user.home', selfUser.get('user_name'));
        return RSVP.reject();
      }
    });
  },

  renderTemplate: function() {
    this.render('index');
  }
});
