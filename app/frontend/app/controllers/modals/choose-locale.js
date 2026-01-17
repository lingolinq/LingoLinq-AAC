import modal from '../../utils/modal';
import i18n from '../../utils/i18n';
import utterance from '../../utils/utterance';
import RSVP from 'rsvp';
import stashes from '../../utils/_stashes';
import { computed } from '@ember/object';
import { inject as service } from '@ember/service';

export default modal.ModalController.extend({
  stashes: service(),

  opening: function() {
    this.set('lang', this.stashes.get('display_lang'));
  },
  locales: computed(function() {
    var list = i18n.locales_translated || ['en'];
    return list.map(function(loc) {
      var auto_translated = loc.match(/\*/);
      var loc = loc.replace(/\*/, '');
      var name = i18n.locales_localized[loc] || i18n.locales[loc] || loc;
      name = name + " (" + loc + ")";
      if(auto_translated) {
        name = name + " (auto-translated)";
      }
      return {
        name: name, 
        id: loc
      };  
    });
  }),
  actions: {
    update: function() {
      this.stashes.persist('display_lang', this.get('lang'));
      setTimeout(function() {
        location.reload();
      }, 1000);
    },
  }
});
