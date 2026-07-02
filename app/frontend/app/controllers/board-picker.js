import Controller from '@ember/controller';
import { inject as service } from '@ember/service';
import openRecommendedHomeBoard from '../utils/recommended_home_board';

// Standalone home-board picker. `create_new_board` is copied from
// `controllers/setup.js` so this page carries no dependency on the setup wizard;
// the "pick for me" recommendation lives in the shared
// `utils/recommended_home_board` (also used by the home-tour welcome step).
export default Controller.extend({
  router: service('router'),
  appState: service('app-state'),
  persistence: service('persistence'),
  assigning_home_board: false,
  actions: {
    // Open the recommended starter home board's preview — the user reviews it and
    // confirms with "Pick this Board". Shared with the home-tour "start speaking"
    // button (utils/recommended_home_board).
    assign_default_home_board: function() {
      var _this = this;
      this.set('assigning_home_board', true);
      var done = function() { _this.set('assigning_home_board', false); };
      openRecommendedHomeBoard().then(done, done);
    },
    // Purchase check, then route to the modern create-board flow.
    create_new_board: function() {
      var _this = this;
      var go = function() { _this.get('router').transitionTo('create-board-new'); };
      if(_this.appState && _this.appState.check_for_needing_purchase) {
        _this.appState.check_for_needing_purchase().then(go, go);
      } else {
        go();
      }
    }
  }
});
