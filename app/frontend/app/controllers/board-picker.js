import Controller from '@ember/controller';
import { inject as service } from '@ember/service';
import i18n from '../utils/i18n';
import LingoLinq from '../app';
import modal from '../utils/modal';

// Standalone home-board picker. The two actions below are copied from
// `controllers/setup.js` (`assign_default_home_board` / `create_new_board`) so
// this page carries no dependency on the setup wizard. Board selection itself
// is handled inside the reused `board-picker` -> `board-icon` components.
export default Controller.extend({
  router: service('router'),
  appState: service('app-state'),
  persistence: service('persistence'),
  assigning_home_board: false,
  actions: {
    // Find the public "Vocal Flair 84" catalog board by name (works whether the
    // catalog is owned by `lingolinq` in prod or `sampleorganization_user_1` in
    // dev) and open its board-preview modal — the same overlay a board card opens.
    // No assignment happens here; the user reviews the board in the preview.
    assign_default_home_board: function() {
      var _this = this;
      this.set('assigning_home_board', true);
      LingoLinq.store.query('board', { q: 'Vocal Flair 84', public: true, per_page: 10 }).then(function(results) {
        _this.set('assigning_home_board', false);
        var list = (results && results.slice) ? results.slice() : (results || []);
        var pick = function(re) {
          for(var i = 0; i < list.length; i++) {
            if(re.test((list[i].get('key') || ''))) { return list[i]; }
          }
          return null;
        };
        var board = pick(/(^|\/)vocal-flair-84$/) || pick(/vocal-flair-84/) || list[0];
        if(!board) {
          modal.error(i18n.t('home_board_assign_not_found', "We couldn't find the recommended home board. Please pick one below."));
          return;
        }
        board.preview_locale = board.get('localized_locale') || _this.appState.get('label_locale');
        // recommend:true swaps the preview header to the "We recommend this board"
        // suggestion copy (this is the system's recommended home board).
        modal.board_preview(board, board.preview_locale, false, null, { recommend: true });
      }, function() {
        _this.set('assigning_home_board', false);
        modal.error(i18n.t('home_board_assign_not_found', "We couldn't find the recommended home board. Please pick one below."));
      });
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
