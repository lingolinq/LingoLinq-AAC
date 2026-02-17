import Component from '@ember/component';
import { inject as service } from '@ember/service';
import { computed } from '@ember/object';
import i18n from '../utils/i18n';

/**
 * Confirm Org Action Modal Component
 *
 * Converted from modals/confirm-org-action template/controller to component
 * for the new service-based modal system.
 */
export default Component.extend({
  modal: service('modal'),
  tagName: '',

  init() {
    this._super(...arguments);
    const modalService = this.get('modal');
    const template = 'modals/confirm-org-action';
    const options = (modalService && modalService.getSettingsFor && modalService.getSettingsFor(template)) ||
                    (modalService && modalService.settingsFor && modalService.settingsFor[template]) ||
                    this.get('model') || {};
    this.set('model', options);
    this.set('home_board_template', null);
    this.set('preferred_symbols', 'original');
    this.set('add_symbols', false);
    this.set('confirmed', '');
    this.set('last_for_supervisor', null);
    this.set('error', null);
  },

  set_home_board: computed('model.action', function() {
    return this.get('model.action') === 'add_home';
  }),

  board_options: computed('model.action', 'model.org', function() {
    if (this.get('model.action') !== 'add_home') {
      return null;
    }
    const res = [];
    (this.get('model.org.home_board_keys') || []).forEach(function(key) {
      res.push({
        name: i18n.t('copy_of_key', "Copy of %{key}", { key: key }),
        id: key
      });
    });
    res.push({
      name: i18n.t('no_board_now', "[ Don't Set a Home Board Now ]"),
      id: 'none'
    });
    return res;
  }),

  board_will_copy: computed('board_options', 'home_board_template', function() {
    const template = this.get('home_board_template');
    return this.get('board_options') && template && template !== 'none';
  }),

  premium_symbol_library: computed('preferred_symbols', function() {
    return ['lessonpix', 'pcs', 'symbolstix'].indexOf(this.get('preferred_symbols')) !== -1;
  }),

  symbols_list: computed(function() {
    return [
      { name: i18n.t('original_symbols', "Use the board's original symbols"), id: 'original' },
      { name: i18n.t('use_opensymbols', "Opensymbols.org free symbol libraries"), id: 'opensymbols' },
      { name: i18n.t('use_lessonpix', "LessonPix symbol library"), id: 'lessonpix' },
      { name: i18n.t('use_symbolstix', "SymbolStix Symbols"), id: 'symbolstix' },
      { name: i18n.t('use_pcs', "PCS Symbols by Tobii Dynavox"), id: 'pcs' },
      { name: i18n.t('use_twemoji', "Emoji icons (authored by Twitter)"), id: 'twemoji' },
      { name: i18n.t('use_noun-project', "The Noun Project black outlines"), id: 'noun-project' },
      { name: i18n.t('use_arasaac', "ARASAAC free symbols"), id: 'arasaac' },
      { name: i18n.t('use_tawasol', "Tawasol symbol library"), id: 'tawasol' }
    ];
  }),

  actions: {
    close() {
      this.get('modal').close();
    },
    opening() {
      this.get('modal').setComponent(this);
      this.set('error', null);
      this.set('confirmed', '');
      const forSupervisor = this.get('model.for_supervisor');
      const change_anyway = this.get('last_for_supervisor') !== forSupervisor;
      if (!this.get('home_board_template') || change_anyway) {
        if (forSupervisor) {
          this.set('home_board_template', 'none');
          this.set('last_for_supervisor', true);
        } else {
          const opts = this.get('board_options');
          if (opts && opts.length) {
            this.set('home_board_template', opts[0].id);
            this.set('last_for_supervisor', false);
          }
        }
      }
    },
    closing() {},
    confirm() {
      if (this.get('set_home_board')) {
        const add = this.get('add_symbols') && this.get('model.org.extras_available') && this.get('board_will_copy');
        this.get('modal').close({ confirmed: true, extras: add, home: this.get('home_board_template'), symbols: this.get('preferred_symbols') });
      } else if (this.get('confirmed') === 'confirmed' || this.get('model.user_name') || this.get('model.unit_user_name') || this.get('model.lesson_name')) {
        this.get('modal').close({ confirmed: true });
      } else {
        const needsConfirm = !this.get('model.user_name') && !this.get('model.unit_user_name') && !this.get('model.lesson_name');
        if (needsConfirm) {
          this.set('error', i18n.t('type_confirmed', "Please type \"confirmed\" to confirm."));
        }
      }
    }
  }
});
