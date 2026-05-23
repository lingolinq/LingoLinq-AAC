import Mixin from '@ember/object/mixin';
import { computed } from '@ember/object';
import { inject as service } from '@ember/service';

// Shared preference-derived CSS classes for board-alt (via controllers/board/index.js)
// and board-detail (controllers/user/board-detail.js). Each class reads from the
// canonical top-level preference keys so the two pages can't drift.
export default Mixin.create({
  appState: service('app-state'),

  _pref_user: computed('appState.referenced_user', 'appState.currentUser', function() {
    return this.get('appState.referenced_user') || this.get('appState.currentUser');
  }),

  symbol_background_class: computed(
    'appState.referenced_user.preferences.symbol_background',
    'appState.currentUser.preferences.symbol_background',
    function() {
      var u = this.get('_pref_user');
      var bg = u && u.get ? u.get('preferences.symbol_background') : null;
      if(!bg) {
        if(this.get('appState.currentUser')) {
          bg = 'white';
        } else {
          bg = (window.user_preferences && window.user_preferences.any_user && window.user_preferences.any_user.symbol_background) || 'white';
        }
      }
      // The "Colored Soft" choice uses the same colored-card background
      // as plain "Colored" (card chrome unchanged) but ALSO adds
      // .fitzgerald-soft, which swaps the --fitzgerald-* CSS custom
      // properties to the soft variants defined in _variables.scss.
      if(bg === 'clear_soft') { return 'symbol_background_clear fitzgerald-soft'; }
      return 'symbol_background_' + bg;
    }
  ),

  high_contrast_class: computed(
    'appState.referenced_user.preferences.high_contrast',
    'appState.currentUser.preferences.high_contrast',
    function() {
      var u = this.get('_pref_user');
      var hc = u && u.get ? u.get('preferences.high_contrast') : false;
      return hc === true ? 'high_contrast' : '';
    }
  )
});
