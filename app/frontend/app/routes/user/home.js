import IndexRoute from '../index';
import session from '../../utils/session';
import RSVP from 'rsvp';
import { inject as service } from '@ember/service';

/**
 * Authenticated dashboard at /:user_name/home — same UI as index (Dashboard::AuthenticatedView)
 * via index template + index controller; URL matches reports pattern (e.g. /user/stats).
 */
export default IndexRoute.extend({
  router: service('router'),
  controllerName: 'index',
  templateName: 'index',

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
    var check = function(selfUser) {
      if (!selfUser || !selfUser.get('user_name') || !user.get('user_name')) {
        _this.transitionTo('index');
        return RSVP.reject();
      }
      if (selfUser.get('user_name') !== user.get('user_name')) {
        _this.router.replaceWith('user.home', selfUser.get('user_name'));
        return RSVP.reject();
      }
    };
    // The `user/self` record was just loaded by the index route's model
    // (board-detail "Exit Speak Mode" -> transitionTo('index') ->
    // redirect here). A second network `findRecord` here is a redundant
    // blocking round-trip that, on slow/deployed connections, is a big
    // chunk of the multi-second "Loading Home Page..." stall (the exit
    // overlay is held until this whole redirect chain settles). Reuse
    // the cached record synchronously when present; only hit the network
    // if it somehow isn't loaded yet (e.g. a direct deep-link to
    // /:user/home that didn't pass through the index route).
    var cached = this.store.peekRecord('user', 'self');
    if (cached) {
      return check(cached);
    }
    return this.store.findRecord('user', 'self').then(check);
  }
});
