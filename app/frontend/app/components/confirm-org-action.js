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
    var self = this;
    this.ctrlAction = function(actionName) {
      var bound = Array.prototype.slice.call(arguments, 1);
      return function() {
        var args = bound.concat(Array.prototype.slice.call(arguments));
        var evt = args[args.length - 1];
        if (evt && typeof evt.preventDefault === 'function' && (evt.type || evt.target)) {
          if (evt.preventDefault) { evt.preventDefault(); }
          args.pop();
        }
        self.send.apply(self, [actionName].concat(args));
      };
    };
    this.ctrlActionNoBubble = function(actionName) {
      var bound = Array.prototype.slice.call(arguments, 1);
      return function(event) {
        if (event && event.stopPropagation) { event.stopPropagation(); }
        if (event && event.preventDefault) { event.preventDefault(); }
        self.send.apply(self, [actionName].concat(bound));
      };
    };

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
    this.set('offboarding_parent_email', '');
    this.set('birth_month', '');
    this.set('birth_year', '');
    this.set('last_for_supervisor', null);
    this.set('error', null);
  },

  set_home_board: computed('model.action', function() {
    return this.get('model.action') === 'add_home';
  }),

  // Communicator org-remove: collect birth month/year to drive COPPA / AI offboarding.
  show_offboarding_age: computed('model.action', 'model.user_name', function() {
    return this.get('model.action') === 'remove_user' && !!this.get('model.user_name');
  }),

  // Parent email only when manager-attested age is under 13.
  show_offboarding_parent_email: computed('show_offboarding_age', 'offboardingUnder13', function() {
    return !!this.get('show_offboarding_age') && !!this.get('offboardingUnder13');
  }),

  birthMonths: computed(function() {
    return [
      {name: i18n.t('birth_month_placeholder', "Month"), id: ''},
      {name: i18n.t('month_january', "January"), id: '1'},
      {name: i18n.t('month_february', "February"), id: '2'},
      {name: i18n.t('month_march', "March"), id: '3'},
      {name: i18n.t('month_april', "April"), id: '4'},
      {name: i18n.t('month_may', "May"), id: '5'},
      {name: i18n.t('month_june', "June"), id: '6'},
      {name: i18n.t('month_july', "July"), id: '7'},
      {name: i18n.t('month_august', "August"), id: '8'},
      {name: i18n.t('month_september', "September"), id: '9'},
      {name: i18n.t('month_october', "October"), id: '10'},
      {name: i18n.t('month_november', "November"), id: '11'},
      {name: i18n.t('month_december', "December"), id: '12'}
    ];
  }),

  birthYears: computed(function() {
    var currentYear = (new Date()).getFullYear();
    var years = [{name: i18n.t('birth_year_placeholder', "Year"), id: ''}];
    for (var year = currentYear; year >= currentYear - 120; year--) {
      years.push({name: year.toString(), id: year.toString()});
    }
    return years;
  }),

  // Same month/year ambiguity rule as register.js (cutoff month counts as under).
  offboardingUnder13: computed('birth_month', 'birth_year', function() {
    return this._ageUnderThreshold(13) === true;
  }),

  offboardingUnder16: computed('birth_month', 'birth_year', function() {
    return this._ageUnderThreshold(16) === true;
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
      { name: i18n.t('original_symbols', "Default symbols"), id: 'original' },
      { name: i18n.t('use_opensymbols', "Opensymbols.org"), id: 'opensymbols' },
      { name: i18n.t('use_lessonpix', "LessonPix symbol library"), id: 'lessonpix' },
      { name: i18n.t('use_symbolstix', "SymbolStix Symbols"), id: 'symbolstix' },
      { name: i18n.t('use_pcs', "PCS Symbols by Tobii Dynavox"), id: 'pcs' },
      { name: i18n.t('use_twemoji', "Emoji icons (authored by Twitter)"), id: 'twemoji' },
      { name: i18n.t('use_noun-project', "The Noun Project black outlines"), id: 'noun-project' },
      { name: i18n.t('use_arasaac', "ARASAAC free symbols"), id: 'arasaac' },
      { name: i18n.t('use_tawasol', "Tawasol"), id: 'tawasol' }
    ];
  }),

  _ageUnderThreshold: function(ageYears) {
    var month = parseInt(this.get('birth_month'), 10);
    var year = parseInt(this.get('birth_year'), 10);
    if (!month || !year) { return null; }
    var today = new Date();
    var cutoffYear = today.getFullYear() - ageYears;
    var cutoffMonth = today.getMonth() + 1;
    if (year > cutoffYear || (year === cutoffYear && month >= cutoffMonth)) {
      return true;
    }
    return false;
  },

  actions: {
    close() {
      this.get('modal').close();
    },
    opening() {
      this.get('modal').setComponent(this);
      this.set('error', null);
      this.set('confirmed', '');
      this.set('offboarding_parent_email', '');
      this.set('birth_month', '');
      this.set('birth_year', '');
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
        if (this.get('show_offboarding_age')) {
          if (!this.get('birth_month') || !this.get('birth_year')) {
            this.set('error', i18n.t('offboarding_birth_required', "Please enter the communicator's birth month and year before removing them."));
            return;
          }
        }
        var parentEmail = (this.get('offboarding_parent_email') || '').trim();
        this.get('modal').close({
          confirmed: true,
          offboarding_parent_email: this.get('offboardingUnder13') ? (parentEmail || null) : null,
          offboarding_birth_month: this.get('birth_month') || null,
          offboarding_birth_year: this.get('birth_year') || null,
          offboarding_under_13: !!this.get('offboardingUnder13'),
          offboarding_under_16: !!this.get('offboardingUnder16')
        });
      } else {
        const needsConfirm = !this.get('model.user_name') && !this.get('model.unit_user_name') && !this.get('model.lesson_name');
        if (needsConfirm) {
          this.set('error', i18n.t('type_confirmed', "Please type \"confirmed\" to confirm."));
        }
      }
    }
  },

  didInsertElement() {
  this._super(...arguments);
  var self = this;
    this.onClose = function() { self.send('close'); };
    this.onOpening = function() { self.send('opening'); };
    this.onClosing = function() { self.send('closing'); };
},

});
