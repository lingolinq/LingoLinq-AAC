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
    // Engage the grid fade-in overlay SYNCHRONOUSLY before any render.
    // The grid renders with opacity:0 during the entry churn (cached
    // buttons → _build_from_raw rebuild → process_for_displaying rebuild).
    // Primary clear-signal: the controller's _grid_loading_settle observer
    // watches ordered_buttons and clears grid_loading 150ms after the last
    // replacement. This fallback runLater is a safety net in case the
    // observer never fires (e.g., ordered_buttons doesn't change).
    boardDetailController.set('grid_loading', true);
    runLater(function() {
      if(!boardDetailController.isDestroyed && !boardDetailController.isDestroying) {
        boardDetailController.set('grid_loading', false);
      }
    }, 800);
    scrollAllToTop();
    _this.appState.check_for_needing_purchase().then(function() {
      boardDetailController.set('edit_mode', true);
      boardDetailController.set('board_collapsed', false);
      _this.stashes.persist('current_mode', 'edit');
      // If a modeling session is live (e.g. supervisor speaking-as / modeling-for
      // a supervisee), pause the modeled-event tagging while on the edit page.
      // The session itself stays intact and resumes automatically on resetController.
      if(_this.appState.get('modeling')) {
        _this.appState.set('modeling_paused', true);
      }
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
      // Clear level-paint + preview state on exit so re-entry starts fresh.
      boardDetailController.send('clear_level_paint');
      // If a modeling session was active when the user entered edit, return
      // them to speak mode (not 'default') so `speak_mode` flips true again,
      // `modeling` re-evaluates true, and the active Modeling badge re-appears.
      // The parent route's setupController does NOT re-run on sibling-subroute
      // transitions, so its current_mode='speak' guard wouldn't fire here.
      var sessionActive = !!(this.appState.get('referenced_speak_mode_user') || this.appState.get('speakModeUser') || this.appState.get('modeling_for_self'));
      this.stashes.persist('current_mode', sessionActive ? 'speak' : 'default');
      // Resume modeled-event tagging. Fires for Save and Exit, Discard, and
      // browser-back — all route exits trigger isExiting=true.
      this.appState.set('modeling_paused', false);
    }
  }
});
