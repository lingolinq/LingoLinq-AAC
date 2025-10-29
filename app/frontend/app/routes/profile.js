import Route from '@ember/routing/route';
import app_state from '../utils/app_state';
import profiles from '../utils/profiles';
import i18n from '../utils/i18n';
import LingoLinqAAC from '../app';
import RSVP from 'rsvp';

export default Route.extend({
  title: "Communicator Profile",
  model: function(params) {
    let store = this.store || window.LingoLinqAAC.store;
    // look up profile by id, get user as well
    return store.findRecord('user', params.user_id).then(function(user) {
      return profiles.template(params.profile_id).then(function(profile) {
        return {
          user: user,
          profile: profile
        }
      })
    });
  },
  setupController: function(controller, model) {
    controller.set('user', model.user);
    controller.set('profile', model.profile);
    controller.check_prior();
  }
});
