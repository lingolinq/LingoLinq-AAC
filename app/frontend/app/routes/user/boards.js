import Route from '@ember/routing/route';
import modal from '../../utils/modal';
import i18n from '../../utils/i18n';
import { inject as service } from '@ember/service';
import boardsPageListCache from '../../utils/boards_page_list_cache';

export default Route.extend({
  appState: service('app-state'),
  store: service('store'),
  controllerName: 'user/index',

  activate: function() {
    this._super(...arguments);
  },

  model: function() {
    var model = this.modelFor('user');
    model.set('subroute_name', i18n.t('boards', 'boards'));
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
       (`my_boards.done`) can pass immediately while update_selected
       background-refreshes. */
    if(model && !boardsPageListCache.isUsableList(model.get('my_boards'))) {
      var snapshot = boardsPageListCache.read(model.get('id'));
      if(snapshot && Array.isArray(snapshot.boards)) {
        var records = boardsPageListCache.hydrate(this.store, snapshot.boards);
        records.done = true;
        records.user_id = model.get('id');
        model.set('my_boards', records);
      }
    }

    controller.update_selected();
    controller.reload_logs();
    controller.load_badges();
    controller.load_goals();
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
