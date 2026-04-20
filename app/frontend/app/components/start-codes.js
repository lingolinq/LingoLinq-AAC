import Component from '@ember/component';
import { inject as service } from '@ember/service';
import { computed } from '@ember/object';
import { set as emberSet, get as emberGet } from '@ember/object';
import LingoLinq from '../app';
import i18n from '../utils/i18n';
import modalUtil from '../utils/modal';
import capabilities from '../utils/capabilities';

/**
 * Start Codes Modal Component
 *
 * Converted from modals/start-codes template/controller to component
 * for the new service-based modal system.
 */
export default Component.extend({
  modal: service('modal'),
  appState: service('app-state'),
  persistence: service('persistence'),
  tagName: '',

  init() {
    this._super(...arguments);
    const modalService = this.get('modal');
    const template = 'modals/start-codes';
    const options = (modalService && modalService.getSettingsFor && modalService.getSettingsFor(template)) ||
                    (modalService && modalService.settingsFor && modalService.settingsFor[template]) ||
                    this.get('model') || {};
    this.set('model', options);
    this.set('status', null);
    this.set('new_start_code', null);
    this.set('link_code', null);
    this.set('shallow_clone', null);
    this.set('code', null);
    this.set('locale', null);
    this.set('symbol_library', null);
    this.set('premium', null);
    this.set('premium_symbols', null);
    this.set('supervisors', null);
    this.set('home_board_key', null);
    this.set('user_type', null);
    this.set('downstream', null);
  },

  org_or_user: computed('model.user', 'model.org', function() {
    return this.get('model.user') || this.get('model.org');
  }),

  invalid_code: computed('code', function() {
    const code = this.get('code');
    return code && (code.length <= 6 || !code.match(/^[8a-zA-Z]/));
  }),

  sorted_start_codes: computed('org_or_user.start_codes.[]', 'org_or_user.start_codes.@each.disabled', function() {
    const list = this.get('org_or_user.start_codes') || [];
    return list.slice().sort(function(a, b) {
      if (a.disabled && !b.disabled) { return 1; }
      if (!a.disabled && b.disabled) { return -1; }
      return 0;
    });
  }),

  locales: computed(function() {
    const list = i18n.get('locales');
    const res = [];
    res.push({ name: i18n.t('dont_set_language', "Don't Set a Language"), id: 'none' });
    for (const key in list) {
      res.push({ name: list[key], id: key });
    }
    res.push({ name: i18n.t('unspecified', "Unspecified"), id: '' });
    return res;
  }),

  symbol_libraries: computed(function() {
    const list = [];
    list.push({ name: i18n.t('dont_set_preferred_symbols', "Don't Set Preferred Symbols"), id: '' });
    list.push({ name: i18n.t('use_opensymbols', "Opensymbols.org"), id: 'opensymbols' });
    list.push({ name: i18n.t('use_lessonpix_with_addon', "LessonPix symbol library (requires paid add-on)"), id: 'lessonpix' });
    list.push({ name: i18n.t('use_symbolstix_with_addon', "SymbolStix Symbols (requires paid add-on)"), id: 'symbolstix' });
    list.push({ name: i18n.t('use_pcs_with_addon', "PCS Symbols by Tobii Dynavox (requires paid add-on)"), id: 'pcs' });
    list.push({ name: i18n.t('use_twemoji', "Emoji icons (authored by Twitter)"), id: 'twemoji' });
    list.push({ name: i18n.t('use_noun-project', "Noun Project black outlines"), id: 'noun-project' });
    list.push({ name: i18n.t('use_arasaac', "ARASAAC free symbols"), id: 'arasaac' });
    list.push({ name: i18n.t('use_tawasol', "Tawasol"), id: 'tawasol' });
    return list;
  }),

  user_types: computed(function() {
    return [
      { name: i18n.t('communicator', "Communicator"), id: 'communicator' },
      { name: i18n.t('supporter', "Supporter"), id: 'supporter' }
    ];
  }),

  actions: {
    close() {
      this.get('modal').close();
    },
    opening() {
      this.get('modal').setComponent(this);
      this.set('status', null);
      this.set('new_start_code', null);
      this.set('link_code', null);
      this.set('shallow_clone', null);
      const list = this.get('org_or_user.start_codes') || [];
      list.forEach(function(code) {
        emberSet(code, 'to_delete', false);
        emberSet(code, 'status', null);
      });
    },
    closing() {},
    new() {
      this.set('new_start_code', !this.get('new_start_code'));
    },
    delete(code, check) {
      if (check) {
        emberSet(code, 'to_delete', !emberGet(code, 'to_delete'));
      } else if (emberGet(code, 'to_delete')) {
        const _this = this;
        let path = '/api/v1/users/' + _this.get('model.user.id') + '/start_code';
        if (_this.get('model.org')) {
          path = '/api/v1/organizations/' + _this.get('model.org.id') + '/start_code';
        }
        emberSet(code, 'status', { deleting: true });
        this.persistence.ajax(path, {
          type: 'POST',
          data: { code: code.code, delete: true }
        }).then(function() {
          emberSet(code, 'status', null);
          emberSet(code, 'disabled', true);
          _this.get('org_or_user').reload();
        }, function() {
          emberSet(code, 'status', { error: true });
        });
      }
    },
    copy(code) {
      capabilities.sharing.copy_text(code);
      modalUtil.success(i18n.t('code_copied_to_clipboard', "Code Copied to Clipboard!"));
    },
    back() {
      this.set('link_code', null);
    },
    copy_link() {
      capabilities.sharing.copy_text(this.get('link_code.url'));
      modalUtil.success(i18n.t('link_copied_to_clipboard', "Link Copied to the Clipboard!"));
    },
    copy_code() {
      const elem = document.querySelector('#qr_code img');
      if (elem) {
        elem.alt = this.get('link_code.url');
        capabilities.sharing.copy_elem(elem, this.get('link_code.url'));
        modalUtil.success(i18n.t('qr_code_copied_to_clipboard', "QR Code Copied to Clipboard!"));
      } else {
        modalUtil.error(i18n.t('copy_failed_try_manual', "Failed to Copy Image, please try copying manually"));
      }
    },
    code_link(code) {
      let prefix = location.protocol + '//' + location.host;
      if (capabilities.installed_app && capabilities.api_host) {
        prefix = capabilities.api_host;
      }
      emberSet(code, 'url', prefix + '/register?code=' + encodeURIComponent(code.code) + '&v=' + code.v);
      this.set('link_code', code);
    },
    generate() {
      const _this = this;
      if (this.get('invalid_code')) { return; }
      const ovr = {};
      if (this.get('code')) {
        ovr.proposed_code = this.get('code');
      }
      if (this.get('locale') && this.get('locale') !== 'none') {
        ovr.locale = this.get('locale');
      }
      if (this.get('shallow_clone')) {
        ovr.shallow_clone = true;
      }
      if (this.get('symbol_library')) {
        ovr.symbol_library = this.get('symbol_library');
      }
      if (this.get('premium')) {
        ovr.premium = true;
        if (this.get('premium_symbols')) {
          ovr.premium_symbols = true;
        }
      }
      if (this.get('supervisors')) {
        ovr.supervisors = [];
        this.get('supervisors').split(/\s*,\s*/).forEach(function(s) {
          if (s) { ovr.supervisors.push(s); }
        });
      }
      if (this.get('home_board_key')) {
        ovr.home_board_key = this.get('home_board_key');
      }
      let path = '/api/v1/users/' + this.get('model.user.id') + '/start_code';
      if (this.get('model.org')) {
        path = '/api/v1/organizations/' + this.get('model.org.id') + '/start_code';
        if (this.get('user_type') === 'supporter') {
          ovr.user_type = 'supporter';
        }
      }
      if (this.get('model.user') || this.get('model.org')) {
        this.set('status', { generating: true });
        this.persistence.ajax(path, { type: 'POST', data: { overrides: ovr } }).then(function() {
          _this.set('status', null);
          _this.set('new_start_code', null);
          _this.get('org_or_user').reload();
        }, function(err) {
          _this.set('status', {
            error: true,
            taken: err.result && err.result === 'code is taken',
            invalid_home: err.result && err.result === 'invalid home board'
          });
        });
      }
    }
  }
});
