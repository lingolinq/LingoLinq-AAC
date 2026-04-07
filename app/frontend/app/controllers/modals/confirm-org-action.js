import modal from '../../utils/modal';
import i18n from '../../utils/i18n';
import persistence from '../../utils/persistence';
import session from '../../utils/session';
import { later as runLater } from '@ember/runloop';
import { computed, observer } from '@ember/object';

export default modal.ModalController.extend({
  opening: function() {
  },
  set_home_board: computed('model.action', function() {
    return this.get('model.action') == 'add_home';
  }),
  set_default_home_board_template: observer('model.action', 'model.org', 'home_board_template', 'model.for_supervisor', function() {
    var change_anyway = this.get('last_for_supervisor') != this.get('model.for_supervisor');
    if(!this.get('home_board_template') || change_anyway) {
      if(this.get('model.for_supervisor')) {
        this.set('home_board_template', 'none');
        this.set('last_for_supervisor', true);
      } else if(this.get('board_options')) {
        this.set('home_board_template', this.get('board_options')[0].id);
        this.set('last_for_supervisor', false);
      }
    }
  }),
  board_options: computed('model.action', 'model.org', function() {
    if(this.get('model.action') != 'add_home') { 
      return null;
    }
    var res = [];
    (this.get('model.org.home_board_keys') || []).forEach(function(key) {
      res.push({
        name: i18n.t('copy_of_key', "Copy of %{key}", {key: key}),
        id: key
      })
    });
    res.push({
      name: i18n.t('no_board_now', "[ Don't Set a Home Board Now ]"),
      id: 'none'
    })
    return res;
  }),
  board_will_copy: computed('board_options', 'home_board_template', function() {
    var template = this.get('home_board_template');
    return this.get('board_options') && template && template != 'none';
  }),
  premium_symbol_library: computed('preferred_symbols', function() {
    return ['lessonpix', 'pcs', 'symbolstix'].indexOf(this.get('preferred_symbols')) != -1;
  }),
  symbols_list: computed(function() {
    var list = [
      {name: i18n.t('original_symbols', "Use the board's original symbols"), id: 'original'},
      {name: i18n.t('use_opensymbols', "Opensymbols.org free symbol libraries"), id: 'opensymbols'},

      {name: i18n.t('use_lessonpix', "LessonPix symbol library"), id: 'lessonpix'},
      {name: i18n.t('use_symbolstix', "SymbolStix Symbols"), id: 'symbolstix'},
      {name: i18n.t('use_pcs', "PCS Symbols by Tobii Dynavox"), id: 'pcs'},

      {name: i18n.t('use_twemoji', "Emoji icons (authored by Twitter)"), id: 'twemoji'},
      {name: i18n.t('use_noun-project', "The Noun Project black outlines"), id: 'noun-project'},
      {name: i18n.t('use_arasaac', "ARASAAC free symbols"), id: 'arasaac'},
      {name: i18n.t('use_tawasol', "Tawasol symbol library"), id: 'tawasol'},
    ];
    return list;
  }),
  actions: {
    confirm: function() {
      if(this.get('set_home_board')) {
        // Only add premium symbols on an existing user if copying board is selected and symbol-adding is checked
        var add = this.get('add_symbols') && this.get('model.org.extras_available') && this.get('board_will_copy');
        modal.close({confirmed: true, extras: add, home: this.get('home_board_template'), symbols: this.get('preferred_symbols')});
      } else if(this.get('confirmed') == 'confirmed' || this.get('model.user_name') || this.get('model.unit_user_name') || this.get('model.lesson_name')) {
        modal.close({confirmed: true});
      }
    }
  }
});
