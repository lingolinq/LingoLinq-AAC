import Controller from '@ember/controller';
import app_state from '../utils/app_state';
import i18n from '../utils/i18n';
import obf from '../utils/obf';
import emergency from '../utils/obf-emergency';
import persistence from '../utils/persistence';
import LingoLinq from '../app';
import { later as runLater } from '@ember/runloop';
import { computed, observer, set as emberSet } from '@ember/object';

export default Controller.extend({
  preferred_locale: computed('last_locale', function() {
    if(this.get('last_locale')) { return this.get('last_locale'); }
    return navigator.language.toLowerCase().split(/-|_/)[0];
  }),
  locales: computed(function() {
    var res = [];
    var pref = this.get('preferred_locale');
    for(var key in emergency.boards) {
      var starters = (emergency.boards[key] || []).filter(function(b) { return b.starter; });
      var str = i18n.locales_localized[key] || i18n.locales[key] || key;
      var credit = "";
      if(key == 'pl') {
        credit = "Includo AT Poland";
      } else if(key == 'ar') {
        credit = "Maram Al Darwish";
      } else if(key == 'ja') {
        credit = "AAC Club, CSUF";
      } else if(key == 'es') {
        credit = "AAC Club, CSUF";
      } else if(key == 'vi') {
        credit = "AAC Club, CSUF";
      } else if(key == 'ur') {
        credit = "AAC Club, CSUF";
      } else if(key == 'ps') {
        credit = "AAC Club, CSUF";
      } else if(key == 'tl') {
        credit = "AAC Club, CSUF";
      } else if(key != 'en') {
        credit = "Google Translate";
      }
      if(starters.length > 0) {
        res.push({
          locale: key,
          open: pref == key,
          boards: starters,
          tally: i18n.t('n_boards', "board", {count: starters.length}),
          locale_text: str + " (" + key + ")",
          credit: credit,
          icon_class: "glyphicon glyphicon-globe"
        });  
      }
    }
    return res;
  }),
  toggle_locale: observer('preferred_locale', function() {

  }),
  actions: {
    pick: function(board) {
      window.emergency = emergency;
      var list = this.get('locales');
      list.forEach(function(loc) {
        loc.boards.forEach(function(b) {
          console.log(b.id, board.id);
          emberSet(b, 'chosen', (b == board));
        });  
      });
      app_state.home_in_speak_mode({reminded: true, force_board_state: {key: board.path}});
    }
  }
});
