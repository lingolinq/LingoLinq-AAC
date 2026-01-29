import Component from '@ember/component';
import { inject as service } from '@ember/service';
import { computed } from '@ember/object';
import i18n from '../../utils/i18n';

export default Component.extend({
  tagName: '',

  // Service injections
  stashes: service(),
  modal: service(),

  // State
  lang: null,

  init() {
    this._super(...arguments);
    this.set('lang', this.stashes.get('display_lang'));
  },

  locales: computed(function() {
    var list = i18n.locales_translated || ['en'];
    return list.map(function(locStr) {
      var auto_translated = locStr.match(/\*/);
      var loc = locStr.replace(/\*/, '');
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

    close: function() {
      this.modal.close();
    }
  }
});
