import EmberObject from '@ember/object';
import Component from '@ember/component';
import { inject as service } from '@ember/service';
import { observer } from '@ember/object';
import { computed, get as emberGet } from '@ember/object';
import modal from '../utils/modal';
import i18n from '../utils/i18n';
import LingoLinq from '../app';

/**
 * Copy Board modal (Phase 2).
 */
export default Component.extend({
  modal: service('modal'),
  appState: service('app-state'),
  store: service('store'),
  tagName: '',

  init() {
    this._super(...arguments);
    const modalService = this.get('modal');
    const template = 'copy-board';
    const options = (modalService && modalService.getSettingsFor && modalService.getSettingsFor(template)) ||
                    (modalService && modalService.settingsFor && modalService.settingsFor[template]) ||
                    this.get('model') || {};
    this.set('model', options);
  },

  didInsertElement() {
    this._super(...arguments);
    this.set('model.jump_home', true);
    this.set('model.keep_as_self', false);
    this.set('board_name', this.get('model.board.name'));
    this.set('board_prefix', this.get('model.board.prefix'));
    this.set('current_user', null);
    this.set('sidebar_board', null);
    this.set('in_board_set', null);
    this.set('in_sidebar_set', null);
    this.set('disconnect', null);
    this.set('set_as_home', false);
    this.set('symbol_library', 'original');
    this.set('new_owner', null);
    this.set('show_more_options', false);
    this.set('default_locale', this.get('appState').get('label_locale') || this.get('model.board.locale'));
    this.set('home_board', null);
    const user_name = this.get('model.selected_user_name');
    let supervisees = [];
    if (this.get('appState').get('sessionUser.supervisees.length')) {
      let selected_user_id = null;
      this.get('appState').get('sessionUser.known_supervisees').forEach(function(supervisee) {
        const res = EmberObject.create(supervisee);
        res.set('currently_speaking', this.get('appState').get('currentUser.id') === supervisee.id);
        res.set('disabled', !supervisee.edit_permission);
        if (user_name && supervisee.user_name === user_name && supervisee.edit_permission) {
          selected_user_id = supervisee.id;
        }
        supervisees.push(res);
      }.bind(this));
      this.set('currently_selected_id', selected_user_id);
    } else {
      this.set('currently_selected_id', 'self');
    }
    this.set('model.known_supervisees', supervisees);
  },

  has_supervisees: computed('model.known_supervisees', 'appState.sessionUser.managed_orgs', function() {
    return this.get('model.known_supervisees.length') > 0 || this.get('appState.sessionUser.managed_orgs.length') > 0;
  }),

  linked: computed('model.board.buttons', function() {
    return (this.get('model.board.linked_boards') || []).length > 0;
  }),

  locales: computed(function() {
    const list = i18n.get('translatable_locales');
    const res = [{ name: i18n.t('choose_locale', '[Choose a Language]'), id: '' }];
    for (const key in list) {
      res.push({ name: list[key], id: key });
    }
    res.push({ name: i18n.t('unspecified', 'Unspecified'), id: '' });
    return res;
  }),

  allow_new_user: computed('model.board.copying_state.limited', 'model.board.user_name', 'appState.sessionUser.user_name', function() {
    return this.get('model.board.copying_state.limited') ||
        (this.get('appState').get('sessionUser.user_name') && this.get('appState').get('sessionUser.user_name') === this.get('model.board.user_name'));
  }),

  symbol_libraries: computed('current_user', function() {
    const u = this.get('current_user');
    const list = [];
    list.push({ name: i18n.t('original_symbols', "Use the board's original symbols"), id: 'original' });
    list.push({ name: i18n.t('use_opensymbols', 'Opensymbols.org free symbol libraries'), id: 'opensymbols' });
    if (u && (emberGet(u, 'extras_enabled') || emberGet(u, 'subscription.extras_enabled'))) {
      list.push({ name: i18n.t('use_lessonpix', 'LessonPix symbol library'), id: 'lessonpix' });
      list.push({ name: i18n.t('use_symbolstix', 'SymbolStix Symbols'), id: 'symbolstix' });
      list.push({ name: i18n.t('use_pcs', 'PCS Symbols by Tobii Dynavox'), id: 'pcs' });
    }
    list.push({ name: i18n.t('use_twemoji', 'Emoji icons (authored by Twitter)'), id: 'twemoji' });
    list.push({ name: i18n.t('use_noun-project', 'The Noun Project black outlines'), id: 'noun-project' });
    list.push({ name: i18n.t('use_arasaac', 'ARASAAC free symbols'), id: 'arasaac' });
    list.push({ name: i18n.t('use_tawasol', 'Tawasol symbol library'), id: 'tawasol' });
    return list;
  }),

  user_board: observer('currently_selected_id', 'model.known_supervisees', function() {
    const for_user_id = this.get('currently_selected_id');
    this.set('self_currently_selected', for_user_id === 'self');
    const known = this.get('model.known_supervisees');
    if (known) {
      known.forEach(function(sup) {
        sup.set('currently_selected', for_user_id === sup.id);
      });
    }
    if (for_user_id) {
      const _this = this;
      this.set('loading', true);
      this.set('error', false);
      this.set('current_user', null);
      this.set('in_board_set', null);
      this.set('in_sidebar_set', null);
      this.set('home_board', null);
      const find_user = this.get('store').findRecord('user', for_user_id).then(function(user) {
        if (!user.get('stats')) {
          return user.reload();
        }
        return user;
      });
      find_user.then(function(user) {
        const in_board_set = (user.get('stats.board_set_ids') || []).indexOf(_this.get('model.board.id')) >= 0;
        _this.set('current_user', user);
        _this.set('symbol_library', user.get('preferences.preferred_symbols'));
        setTimeout(function() {
          _this.set('symbol_library', user.get('preferences.preferred_symbols'));
        }, 100);
        _this.set('loading', false);
        _this.set('in_board_set', !!in_board_set);
        const sidebar_keys = (user.get('preferences.sidebar_boards') || []).map(function(b) { return b.key; });
        if (!in_board_set) {
          sidebar_keys.forEach(function(key) {
            if (!key) { return; }
            LingoLinq.store.findRecord('board', key).then(function(board) {
              if (_this.get('current_user') === user) {
                if (board.get('key') === _this.get('model.board.key')) {
                  _this.set('sidebar_board', true);
                  const sidebar_ids = user.get('stats.sidebar_board_ids') || [];
                  user.set('stats.sidebar_board_ids', sidebar_ids.concat([board.get('id')]).uniq());
                }
              }
              LingoLinq.Buttonset.load_button_set(board.get('id')).then(function(bs) {
                const board_ids = bs.board_ids_for(board.get('id'));
                if (_this.get('current_user') === user) {
                  const sidebar_ids = user.get('stats.sidebar_board_ids') || [];
                  user.set('stats.sidebar_board_ids', sidebar_ids.concat(board_ids).uniq());
                  if (board_ids.indexOf(_this.get('model.board.id')) >= 0) {
                    _this.set('in_sidebar_set', true);
                  }
                }
              }, function() {});
            }, function() {});
          });
        }
        _this.set('home_board', user.get('preferences.home_board.id') === _this.get('model.board.id'));
      }, function() {
        _this.set('loading', false);
        _this.set('error', true);
      });
    } else {
      this.set('loading', false);
      this.set('error', false);
      this.set('in_board_set', false);
      this.set('in_sidebar_set', false);
      this.set('home_board', false);
    }
  }),

  actions: {
    close() {
      this.get('modal').close(false);
    },
    opening() {},
    closing() {},
    more_options() {
      this.set('show_more_options', !this.get('show_more_options'));
    },
    updateSymbolLibrary(id) {
      this.set('symbol_library', id);
    },
    updateTranslateLocale(id) {
      this.set('translate_locale', id);
    },
    updateDefaultLocale(id) {
      this.set('default_locale', id);
    },
    updateCurrentlySelectedId(id) {
      this.set('currently_selected_id', id);
    },
    tweakBoard(decision) {
      if (this.get('model.known_supervisees').length > 0) {
        if (!this.get('currently_selected_id')) {
          return;
        }
      }
      let shares = [];
      if (this.get('self_currently_selected')) {
        (this.get('model.known_supervisees') || []).forEach(function(sup) {
          if (sup.share) {
            shares.push(sup);
          }
        });
      }
      let translate_locale = null;
      if (this.get('translate') && this.get('translate_locale')) {
        translate_locale = this.get('translate_locale');
      }
      let name = this.get('board_name');
      if (this.get('board_prefix') && name.indexOf(this.get('board_prefix')) !== 0) {
        name = this.get('board_prefix') + ' ' + name;
      }
      const lib = this.get('symbol_library') || 'original';
      this.get('modal').close({
        action: decision,
        user: this.get('current_user'),
        shares: shares,
        board_name: name,
        board_prefix: this.get('board_prefix'),
        symbol_library: lib,
        disconnect: this.get('disconnect'),
        new_owner: this.get('new_owner'),
        make_public: this.get('public'),
        default_locale: this.get('default_locale'),
        translate_locale: translate_locale
      });
    }
  }
});
