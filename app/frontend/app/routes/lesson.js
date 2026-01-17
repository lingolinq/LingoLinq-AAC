import Route from '@ember/routing/route';
import { inject as service } from '@ember/service';
import app_state from '../utils/app_state';

export default Route.extend({
  title: "Inflections",
  model: function(params) {
    this.set('user_token', params.user_token);
    this.set('lesson_code', params.lesson_code);
    var uid = params.user_token && params.user_token.split(/-/)[0]
    return this.store.findRecord('lesson', params.lesson_id + ":" + params.lesson_code + ":" + params.user_token);
  },
  setupController: function(controller, model) {
    controller.set('model', model);
    controller.set('user_token', this.get('user_token'));
    controller.set('lesson_code', this.get('lesson_code'));
    controller.setup_tracking();
  }
});
