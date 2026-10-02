import Route from '@ember/routing/route';
import RSVP from 'rsvp';
import modal from '../../utils/modal';
import i18n from '../../utils/i18n';
import { inject as service } from '@ember/service';
import boardsPageListCache from '../../utils/boards_page_list_cache';
import { send_basic_viewer_to_landing, is_basic_viewer, is_own_page } from '../../utils/basic_landing';
import { wait_for_session_user } from '../../utils/session_user_wait';

export default Route.extend({
  appState: service('app-state'),
  store: service('store'),
  router: service('router'),
  controllerName: 'user/index',

  activate: function() {
    this._super(...arguments);
    boardsPageListCache.setBoardsPageActive(true);
  },
  deactivate: function() {
    boardsPageListCache.setBoardsPageActive(false);
    this._super(...arguments);
  },

  /* Basic has no boards library page: its home page's Boards tab is the equivalent, for the
     viewer's OWN boards only (that tab lists them). Anyone else's library goes to their account
     page instead (below). On a cold load `currentUser` is not assigned yet, so this waits (briefly, bounded) for the
     session user record already in flight, as routes/board.js does, before deciding. */
  afterModel: function(model) {
    var _this = this;
    return wait_for_session_user(this.get('appState')).then(function(sessionUser) {
      var me = _this.get('appState.currentUser') || sessionUser;
      // By user_name as well as id (utils/basic_landing.js#is_own_page, shared with the View menu).
      var own = is_own_page(model, me);
      if(own && send_basic_viewer_to_landing(_this.get('appState'), _this.get('router'), 'user.boards', me)) {
        return RSVP.reject();
      }
      /* SOMEONE ELSE'S LIBRARY, in Basic (2026-09-30): that user's account page, which lists the
         same boards (<BoardsBrowser>, templates/user/index.hbs) under the Basic account rail
         (templates/user.hbs, controllers/user.js#showClassicAccountRail). Reached by a supervisor
         from the board header's My Boards while speaking as a communicator
         (controllers/application.js#openMyBoards reads `referenced_user`), a bookmark or Back. */
      if(!own && model && model.get('user_name') && is_basic_viewer(_this.get('appState'), me)) {
        _this.get('router').transitionTo('user.index', model.get('user_name'));
        return RSVP.reject();
      }
    });
  },

  model: function() {
    var model = this.modelFor('user');
    model.set('subroute_name', i18n.t('boards', "boards"));
    return model;
  },
  setupController: function(controller, model) {
    /* Parent `user` route already resolves currentUser cache-first and
       background-reloads. An eager model.reload() here raced the Mine-list
       query and did not help the overlay gate. Only refresh when stale. */
    if(model && !model.get('really_fresh')) {
      var reloadPromise = model.reload();
      if(reloadPromise && reloadPromise.catch) {
        reloadPromise.catch(function() { });
      }
    }
    controller.set('model', model);
    controller.set('parent_object', null);
    controller.set('password', null);
    controller.set('new_user_name', null);
    controller.set('filterString', '');
    controller.set('filterStringDebounced', '');

    /* Hard-refresh hydrate: if Mine list is not already usable in memory,
       restore a short-lived localStorage snapshot so the overlay gate
       (`mineListPaintReady`) can pass immediately while update_selected
       background-refreshes. */
    if(model && !boardsPageListCache.isUsableList(model.get('my_boards'))) {
      var snapshot = boardsPageListCache.read(model.get('id'));
      if(snapshot && Array.isArray(snapshot.boards)) {
        var records = boardsPageListCache.hydrate(this.store, snapshot.boards);
        records.done = true;
        records.paint_ready = true;
        records.user_id = model.get('id');
        model.set('my_boards', records);
      }
    }

    controller.update_selected();
  },
  actions: {
    recordNote: function(type) {
      var _this = this;
      var user = this.modelFor('user');
      this.appState.check_for_needing_purchase().then(function() {
        modal.open('record-note', {note_type: type, user: user}).then(function() {
          _this.get('controller').reload_logs();
        });
      });
    }
  }
});
