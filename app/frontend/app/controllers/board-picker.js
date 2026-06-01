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
    // dev) and set it as this user's home board, then return to the dashboard.
    assign_default_home_board: function() {
      var _this = this;
      var user = this.get('setup_user');
      if(!user || !user.save) {
        modal.error(i18n.t('set_as_home_failed', "Home board update failed unexpectedly"));
        return;
      }
      this.set('assigning_home_board', true);
      LingoLinq.store.query('board', { q: 'Vocal Flair 84', public: true, per_page: 10 }).then(function(results) {
        var list = (results && results.toArray) ? results.toArray() : (results || []);
        var pick = function(re) {
          for(var i = 0; i < list.length; i++) {
            if(re.test((list[i].get('key') || ''))) { return list[i]; }
          }
          return null;
        };
        var board = pick(/(^|\/)vocal-flair-84$/) || pick(/vocal-flair-84/) || list[0];
        if(!board) {
          _this.set('assigning_home_board', false);
          modal.error(i18n.t('home_board_assign_not_found', "We couldn't find the recommended home board. Please pick one below."));
          return;
        }
        user.set('preferences.home_board', {
          id: board.get('id'),
          key: board.get('key'),
          locale: _this.appState.get('label_locale')
        });
        user.save().then(function() {
          if(_this.get('persistence') && _this.get('persistence').get('online') && _this.get('persistence').get('auto_sync')) {
            _this.get('persistence').sync('self', null, null, 'home_board_changed').then(null, function() { });
          }
          _this.appState.return_to_index();
        }, function() {
          _this.set('assigning_home_board', false);
          modal.error(i18n.t('set_as_home_failed', "Home board update failed unexpectedly"));
        });
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
