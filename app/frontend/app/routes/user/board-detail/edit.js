import Route from '@ember/routing/route';
import { later as runLater } from '@ember/runloop';
import { inject as service } from '@ember/service';
import boardDetailCache from '../../../utils/board_detail_cache';

function scrollAllToTop() {
  window.scrollTo(0, 0);
  var content = document.getElementById('content');
  if (content) { content.scrollTop = 0; }
  var main = document.querySelector('.md-board-detail-main');
  if (main) { main.scrollTop = 0; }
  var shell = document.querySelector('.md-shell--board-detail');
  if (shell) { shell.scrollTop = 0; }
}

export default Route.extend({
  appState: service('app-state'),
  stashes: service('stashes'),

  model: function() {
    return this.modelFor('user.board-detail');
  },

  setupController: function(controller, model) {
    controller.set('model', model);
    var _this = this;
    var boardDetailController = this.controllerFor('user.board-detail');

    if(!model) {
      _this.transitionTo('user.board-detail', boardDetailController.get('user.user_name') || 'unknown', boardDetailController.get('boardname') || 'unknown');
      return;
    }
    scrollAllToTop();
    _this.appState.check_for_needing_purchase().then(function() {
      boardDetailController.set('edit_mode', true);
      boardDetailController.set('board_collapsed', false);
      _this.stashes.persist('current_mode', 'edit');
      // Drop the raw cache for this board so any subsequent re-entry
      // refetches fresh server state. Save flow re-populates after the
      // round-trip; this guards the case where edits are abandoned and
      // the next read should still come from the server.
      var key = model && model.get && model.get('key');
      var id = model && model.get && (model.get('id') || model.get('global_id'));
      if(key) { boardDetailCache.invalidate(key); }
      if(id) { boardDetailCache.invalidate(id); }
      runLater(scrollAllToTop, 50);
      runLater(scrollAllToTop, 200);
    }, function() {
      // Purchase required but not completed
    });
  },

  resetController: function(controller, isExiting) {
    if(isExiting) {
      var boardDetailController = this.controllerFor('user.board-detail');
      boardDetailController.set('edit_mode', false);
      boardDetailController.set('paint_mode', null);
      boardDetailController.set('color_picker_button', null);
      this.stashes.persist('current_mode', 'default');
    }
  }
});
