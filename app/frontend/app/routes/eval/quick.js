import Route from '@ember/routing/route';
import RSVP from 'rsvp';
import { inject as service } from '@ember/service';
import LingoLinq from '../../app';
import EvalSession from '../../utils/eval_session';
import i18n from '../../utils/i18n';

export default Route.extend({
  title: i18n.t('quick_screen_eval_title', "Quick Screen"),
  appState: service('app-state'),
  router: service('router'),

  beforeModel(/* transition */) {
    // Defense-in-depth: entry links and the API already gate quick_screen_eval, but
    // guard the route too so a direct URL does not render the eval shell before the
    // API rejects it. Redirect home when the flag is off for this user.
    if(!this.appState.get('feature_flags.quick_screen_eval')) {
      this.router.transitionTo('index');
    }
  },

  model(params) {
    if (params.user_id) {
      return LingoLinq.store.findRecord('user', params.user_id).then(function(user) {
        return { user: user, session: EvalSession.create() };
      });
    }
    return RSVP.resolve({ user: null, session: EvalSession.create() });
  },

  setupController(controller, model) {
    this._super(controller, model);
    controller.set('user', model.user);
    controller.set('session', model.session);
  }
});
