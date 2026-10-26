import Route from '@ember/routing/route';
import i18n from '../../utils/i18n';
import { resolve } from 'rsvp';
import { later } from '@ember/runloop';
import { inject as service } from '@ember/service';

export default Route.extend({
  store: service('store'),
  model: function(params) {
    var user = this.modelFor('user');
    user.set('subroute_name', i18n.t('goals', "goals"));
    return this.store.findRecord('goal', params.goal_id, this.persistence.get('online') ? {reload: true} : {});
  },
  setupController: function(controller, model) {
    var wait = resolve();
    if(!model.get('permissions')) {
      wait = model.reload();
    }
    controller.set('user', this.modelFor('user'));
    controller.set('model', model);
    controller.load_logs();
    wait.then(function() {
      if(model.get('set_badges')) {
        model.set('badges_enabled', true);
        model.set('set_badges', false);
        controller.set('badges_only', true);
        controller.send('edit_goal');
        later(function() {
          model.add_badge_level(true);
        });
      } else {
        controller.set('badges_only', false);
        controller.send('cancel_edit');
      }
    });
  },
  // model() fetches the goal again while online: only the goal's own request returns stats
  // grouped at the viewer's midnight (adapters/goal.js, #1196), and a goal the goals list
  // loaded holds the stored UTC grouping, which findRecord would hand straight back.
  persistence: service('persistence')
});
