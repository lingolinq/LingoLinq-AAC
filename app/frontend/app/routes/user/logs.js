import Route from '@ember/routing/route';
import { inject as service } from '@ember/service';
import i18n from '../../utils/i18n';
import { markUpdatesRead } from '../../utils/pending_updates';

export default Route.extend({
  app_state: service('app-state'),

  model: function() {
    var user = this.modelFor('user');
    user.set('subroute_name', i18n.t('messages', 'messages'));
    return user;
  },
  resetController: function(controller, isExiting) {
    if(isExiting) {
      controller.reset_params();
    }
  },
  setupController: function(controller, model) {
    controller.set('user', this.modelFor('user'));
    controller.set('model', model);
    controller.send('refresh');

    /* ARRIVING HERE FROM THE UPDATES PILL RETIRES THE BADGE.
       `nav=home` is the marker the Updates pills carry (components/user-pill-nav.hbs and
       components/dashboard/authenticated-view.hbs) and the same one controllers/user.js
       #homeNavContext reads to pick the home nav for this page. It is therefore exactly
       "the user followed Updates to get here".

       Without this the counted badge was permanent outside Classic: the only writer of
       `read_notifications` is `set_index_nav('updates')`, reachable only from the Classic
       Updates tab, so a Card-view user had no way to dismiss it. Marking on arrival rather
       than on click covers all four pill render sites plus a bookmarked URL with one rule.

       Scoped to the signed-in user's OWN log — a supporter reading a communicator's notes
       must never clear that communicator's notification state. */
    var me = this.get('app_state.currentUser');
    if(controller.get('nav') === 'home' && me && model && me.get('id') === model.get('id')) {
      markUpdatesRead(me);
    }
  }
});
