import { later as runLater } from '@ember/runloop';
import modal from '../utils/modal';
import app_state from '../utils/app_state';
import editManager from '../utils/edit_manager';
import persistence from '../utils/persistence';
import stashes from '../utils/_stashes';
import i18n from '../utils/i18n';
import LingoLinq from '../app';
import { computed, observer, get as emberGet } from '@ember/object';

export default modal.ModalController.extend({
  opening: function() {
    this.set('has_supervisees', app_state.get('sessionUser.supervisees.length') > 0 || app_state.get('sessionUser.managed_orgs.length') > 0);
    this.set('currently_selected_id', this.get('model.user_id'));
    this.set('symbol_library', 'original');
    this.set('app_state', app_state);
    this.set('status', null);
    this.set('board_level', stashes.get('board_level'));
  },
  selected_user: computed('has_supervisees', 'currently_selected_id', function() {
    var _this = this;
    var id = _this.get('currently_selected_id');
    if(!id) { return null; }
    if(this.get('has_supervisees')) {
      if(id == 'self' || id == app_state.get('sessionUser.id')) {
        return app_state.get('sessionUser');
      }
      var u = (app_state.get('sessionUser.known_supervisees') || []).find(function(usr) { return usr.id == id; });
      u = u || LingoLinq.store.peekRecord('user', id);
      u = u || (app_state.get('quick_users') || {})[id];
      return u;
    } else {
      return app_state.get('sessionUser');
    }
  }),
  set_library_for_user: observer('selected_user', function() {
    var u = this.get('selected_user');
    var _this = this;
    if(u) {
      var lib = emberGet(u, 'preferences.preferred_symbols') || emberGet(u, 'preferred_symbols');
      if(['pcs', 'symbolstix', 'lessonpix'].indexOf(lib) != -1) {
        if(!emberGet(u, 'extras_enabled') && !emberGet(u, 'subscription.extras_enabled')) {
          lib = 'original';
        }
      }
      _this.set('symbol_library', lib || 'original');
      setTimeout(function() {
        _this.set('symbol_library', lib || 'original');
      }, 100);
    }
  }),
  symbol_libraries: computed('selected_user', function() {
    var u = this.get('selected_user');
    var list = [];
    list.push({name: i18n.t('original_symbols', "Use the board's original symbols"), id: 'original'});
    list.push({name: i18n.t('use_opensymbols', "Opensymbols.org free symbol libraries"), id: 'opensymbols'});

    if(u && (emberGet(u, 'extras_enabled') || emberGet(u, 'subscription.extras_enabled'))) {
      list.push({name: i18n.t('use_lessonpix', "LessonPix symbol library"), id: 'lessonpix'});
      list.push({name: i18n.t('use_symbolstix', "SymbolStix Symbols"), id: 'symbolstix'});
      list.push({name: i18n.t('use_pcs', "PCS Symbols by Tobii Dynavox"), id: 'pcs'});  
    }

    list.push({name: i18n.t('use_twemoji', "Emoji icons (authored by Twitter)"), id: 'twemoji'});
    list.push({name: i18n.t('use_noun-project', "The Noun Project black outlines"), id: 'noun-project'});
    list.push({name: i18n.t('use_arasaac', "ARASAAC free symbols"), id: 'arasaac'});
    list.push({name: i18n.t('use_tawasol', "Tawasol symbol library"), id: 'tawasol'});
    return list;
  }),
  owned_by_user: computed('currently_selected_id', 'model.board.user_name', function() {
    var board_user_name = this.get('model.board.user_name');
    var user_name = 'nobody';
    var current_id = this.get('currently_selected_id');
    if(current_id == 'self') {
      user_name = app_state.get('sessionUser.user_name');
    } else if(current_id == app_state.get('sessionUser.user_id')) {
      user_name = app_state.get('sessionUser.user_name');
    } else {
      (app_state.get('sessionUser.known_supervisees') || []).forEach(function(sup) {
        if(sup.id == current_id) {
          user_name = sup.user_name;
        }
      });
    }
    return user_name == board_user_name;
  }),
  multiple_users: computed('has_supervisees', function() {
    return !!this.get('has_supervisees');
  }),
  board_levels: computed(function() {
    return [
      {name: i18n.t('unspecified_2', "[ Use the Default ]"), id: ''},
      {name: i18n.t('level_1_2', "Level 1 (most simple)"), id: '1'},
      {name: i18n.t('level_2_2', "Level 2"), id: '2'},
      {name: i18n.t('level_3_2', "Level 3"), id: '3'},
      {name: i18n.t('level_4_2', "Level 4"), id: '4'},
      {name: i18n.t('level_5_2', "Level 5"), id: '5'},
      {name: i18n.t('level_6_2', "Level 6"), id: '6'},
      {name: i18n.t('level_7_2', "Level 7"), id: '7'},
      {name: i18n.t('level_8_2', "Level 8"), id: '8'},
      {name: i18n.t('level_9_2', "Level 9"), id: '9'},
      {name: i18n.t('level_10_2', "Level 10 (all buttons and links)"), id: '10'},
    ];
  }),
  pending: computed('status.updating', 'status.copying', function() {
    return this.get('status.updating') || this.get('status.copying');
  }),
  pending_or_copy_only: computed('pending', 'symbol_library', function() {
    return this.get('pending') || this.get('symbol_library') != 'original';
  }),
  actions: {
    copy_as_home: function() {
      var _this = this;
      var for_user_id = this.get('currently_selected_id') || 'self';
      _this.set('status', {copying: true});
      var library = this.get('symbol_library') || 'original';
      var board = _this.get('model.board');
      LingoLinq.store.findRecord('user', for_user_id).then(function(user) {
        editManager.copy_board(board, 'links_copy_as_home', user, false, library).then(function() {
          _this.send('done');
        }, function() {
          _this.set('status', {errored: true});
        });
      }, function() {
        _this.set('status', {errored: true});
      });
    },
    done: function() {
      var _this = this;
      _this.set('status', null);
      modal.close({updated: true});
    },
    set_as_home: function(for_user_id) {
      var for_user_id = this.get('currently_selected_id') || 'self';
      var _this = this;
      var board = this.get('model.board');
      _this.set('status', {updating: true});
      var level = parseInt(this.get('board_level'), 10);
      if(!level || level < 1 || level > 10) { level = null; }

      LingoLinq.store.findRecord('user', for_user_id).then(function(user) {
        user.set('preferences.home_board', {
          level: level,
          locale: app_state.get('label_locale'),
          id: board.get('id'),
          key: board.get('key')
        });
        user.save().then(function() {
          _this.send('done');
        }, function() {
          _this.set('status', {errored: true});
        });
      }, function() {
        _this.set('status', {errored: true});
      });
    }
  }
});
