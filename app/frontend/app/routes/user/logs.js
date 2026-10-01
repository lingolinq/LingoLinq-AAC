import Route from '@ember/routing/route';
import { inject as service } from '@ember/service';
import i18n from '../../utils/i18n';
import { markUpdatesRead } from '../../utils/pending_updates';
import { basic_landing_for, is_basic_viewer, query_string_for } from '../../utils/basic_landing';
import { wait_for_session_user } from '../../utils/session_user_wait';

export default Route.extend({
  app_state: service('app-state'),
  router: service('router'),

  /* MODERN'S UPDATES ADDRESS IN BASIC (2026-09-30, requested: "we should be routing to the logs
     page but ensure that their messages are not marked as read"). `?type=note&nav=home` is
     Modern's Updates (components/user-pill-nav.hbs); for a Basic viewer on their own log it
     becomes Basic's own Logs page, the landing utils/basic_landing.js names for it: the same
     page without the messages filter and the Updates marker.
     THE TRANSITION IN FLIGHT IS ABORTED FIRST. A replace to this same route with other params,
     made while this transition is in flight, is merged into it rather than replacing it, and
     the in-flight transition then re-applies its own `type=note` to the controller after
     setupController (traced in the browser, 2026-09-30). That one filtered load is what marks
     the newest message read (controllers/user/logs.js#refresh saves `last_message_read`), and
     setupController below would mark updates read for `nav=home`. Aborting first makes the
     replace a fresh transition, so this page is never set up with either param.
     On a cold load `currentUser` is not assigned yet, so this waits for the session user, as
     routes/user/boards.js does. Only the viewer's OWN log. */
  afterModel: function(model, transition) {
    var _this = this;
    var landing = basic_landing_for('user.logs', query_string_for(transition));
    if(!landing || !landing.query_params) { return; }
    return wait_for_session_user(this.get('app_state')).then(function(sessionUser) {
      var me = _this.get('app_state.currentUser') || sessionUser;
      var own = !!(model && me && (model.get('id') === me.get('id') || model.get('user_name') === me.get('user_name')));
      if(own && is_basic_viewer(_this.get('app_state'), me)) {
        transition.abort();
        _this.get('router').replaceWith('user.logs', model.get('user_name'), { queryParams: landing.query_params });
      }
    });
  },

  model: function() {
    var user = this.modelFor('user');
    user.set('subroute_name', i18n.t('messages', "messages"));
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
