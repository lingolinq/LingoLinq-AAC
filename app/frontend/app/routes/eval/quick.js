import Route from '@ember/routing/route';
import RSVP from 'rsvp';
import LingoLinq from '../../app';
import EvalSession from '../../utils/eval_session';
import i18n from '../../utils/i18n';

export default Route.extend({
  title: i18n.t('quick_screen_eval_title', "Quick Screen"),

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
