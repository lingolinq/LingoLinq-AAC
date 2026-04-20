import Component from '@ember/component';
import { inject as service } from '@ember/service';
import { computed, observer } from '@ember/object';
import app_state from '../utils/app_state';
import evaluation from '../utils/eval';
import i18n from '../utils/i18n';

/**
 * Assessment Settings Modal Component
 *
 * Converted from modals/assessment-settings template/controller to component
 * for the new service-based modal system.
 */
export default Component.extend({
  modal: service('modal'),
  appState: service('app-state'),
  store: service('store'),
  tagName: '',

  init() {
    this._super(...arguments);
    const modalService = this.get('modal');
    const template = 'modals/assessment-settings';
    const options = (modalService && modalService.getSettingsFor && modalService.getSettingsFor(template)) ||
                    (modalService && modalService.settingsFor && modalService.settingsFor[template]) ||
                    this.get('model') || {};
    this.set('model', options);
    this.set('settings', null);
    this.set('aborting', false);
  },

  update_user_name: observer('settings.for_user.user_id', function() {
    const user_id = this.get('settings.for_user.user_id');
    if (!user_id) { return; }
    const _this = this;
    if (user_id === 'self' || user_id === this.get('appState.currentUser.id')) {
      this.set('settings.for_user.user_name', this.get('appState.currentUser.user_name'));
    } else {
      const known = this.get('appState.currentUser.known_supervisees') || [];
      let name = null;
      known.forEach(function(u) {
        if (u.id === user_id) { name = u.user_name; }
      });
      if (!name) {
        const store = this.get('store');
        const u = store.peekRecord('user', user_id) || (this.get('appState.quick_users') || {})[user_id];
        if (u) { name = u.user_name; }
      }
      if (name) {
        _this.set('settings.for_user.user_name', name);
      }
    }
  }),

  name_placeholder: computed('settings.user_name', 'settings.for_user.user_name', function() {
    return i18n.t('eval_for', "Eval for ") + (this.get('settings.for_user.user_name') || this.get('settings.user_name') || this.get('appState.currentUser.user_name')) + ' - ' + window.moment().format('MMM Do YYYY');
  }),

  save_option: computed('model.action', function() {
    return this.get('model.action') === 'results';
  }),

  symbol_libraries: computed('appState.currentUser.subscription.extras_enabled', 'appState.currentUser.subscription.lessonpix', function() {
    const res = [
      { name: i18n.t('open_symbols', "OpenSymbols (default)"), id: 'default' },
      { name: i18n.t('photos', "Photos"), id: 'photos' }
    ];
    if (this.get('appState.currentUser.subscription.lessonpix')) {
      res.push({ name: i18n.t('lessonpix_symbols', "LessonPix Symbols"), id: 'lessonpix' });
    }
    if (this.get('appState.currentUser.subscription.extras_enabled')) {
      res.push({ name: i18n.t('pcs_boardmaker', "PCS (BoardMaker) symbols from Tobii-Dynavox"), id: 'pcs' });
      res.push({ name: i18n.t('pcs_hc', "High-Contrast PCS (BoardMaker) symbols from Tobii-Dynavox"), id: 'pcs_hc' });
      res.push({ name: i18n.t('symbolstix_images', "SymbolStix Symbols"), id: 'symbolstix' });
      if (!res.find(r => r.id === 'lessonpix')) {
        res.push({ name: i18n.t('lessonpix_symbols', "LessonPix Symbols"), id: 'lessonpix' });
      }
    }
    return res;
  }),

  // Named to avoid computed-property.override when `symbol_options` is set on the instance
  // (e.g. attrs or legacy patterns); the list is always derived from library + eval words.
  eval_symbol_options: computed('symbol_libraries.[]', 'settings.default_library', function() {
    const library = this.get('settings.default_library') || 'default';
    const words = evaluation.words || [];
    const res = [
      { image_names: ['cat'], label: i18n.t('cat', "Cat") },
      { image_names: ['dog'], label: i18n.t('dog', "Dog") },
      { image_names: ['fish'], label: i18n.t('fish', "Fish") },
      { image_names: ['bird'], label: i18n.t('bird', "Bird") },
      { id: 'animals', image_names: ['cat', 'dog', 'fish', 'bird'], label: i18n.t('animals', "Animals (alternating)") },
      { image_names: ['car'], label: i18n.t('car', "Car") },
      { image_names: ['truck'], label: i18n.t('truck', "Truck") },
      { image_names: ['airplane'], label: i18n.t('airplane', "Airplane") },
      { image_names: ['motorcycle'], label: i18n.t('motorcycle', "Motorcycle") },
      { image_names: ['train'], label: i18n.t('train', "Train") },
      { id: 'vehicles', image_names: ['car', 'truck', 'airplane', 'motorcycle', 'train'], label: i18n.t('vehicles', "Vehicles (alternating)") },
      { image_names: ['sandwich'], label: i18n.t('sandwich', "Sandwich") },
      { image_names: ['burrito'], label: i18n.t('burrito', "Burrito") },
      { image_names: ['spaghetti'], label: i18n.t('spaghetti', "Spaghetti") },
      { image_names: ['hamburger'], label: i18n.t('hamburger', "Hamburger") },
      { image_names: ['taco'], label: i18n.t('taco', "Taco") },
      { id: 'food', image_names: ['sandwich', 'burrito', 'spaghetti', 'hamburger', 'taco'], label: i18n.t('food', "Food (alternating)") },
      { image_names: ['apple'], label: i18n.t('apple', "Apple") },
      { image_names: ['banana'], label: i18n.t('banana', "Banana") },
      { image_names: ['strawberry'], label: i18n.t('strawberry', "Strawberry") },
      { image_names: ['blueberry'], label: i18n.t('blueberry', "Blueberry") },
      { id: 'fruit', image_names: ['apple', 'banana', 'strawberry', 'blueberry'], label: i18n.t('fruit', "Fruit (alternating)") },
      { image_names: ['planet'], label: i18n.t('planet', "Planet") },
      { image_names: ['sun'], label: i18n.t('sun', "Sun") },
      { image_names: ['comet'], label: i18n.t('comet', "Comet") },
      { image_names: ['asteroid'], label: i18n.t('asteroid', "Asteroid") },
      { id: 'space', image_names: ['planet', 'sun', 'comet', 'asteroid'], label: i18n.t('space', "Space (alternating)") }
    ];
    res.forEach(function(r) {
      r.id = r.id || r.image_names[0];
      const list = [];
      (r.image_names || []).forEach(function(name) {
        const wrd = words.find(function(w) { return w.label === name; });
        if (wrd && wrd.urls) {
          list.push(wrd.urls[library] || wrd.urls['default']);
        }
      });
      r.images = list;
    });
    return res;
  }),

  current_option: computed('settings.label', 'eval_symbol_options.[]', function() {
    const option_id = this.get('settings.label');
    const options = this.get('eval_symbol_options') || [];
    let res = options.find(o => o.id === option_id);
    res = res || options[0] || { label: i18n.t('choose_blank', "[Choose]") };
    return res;
  }),

  actions: {
    close() {
      this.get('modal').close();
    },
    opening() {
      this.get('modal').setComponent(this);
      this.set('aborting', false);
      let settings = Object.assign({}, this.get('model.assessment'));
      if (!settings.user_id) {
        settings.user_id = this.get('appState.currentUser.id') || settings.initiator_user_id;
        settings.user_name = this.get('appState.currentUser.name') || settings.initiator_user_name;
      }
      if (!settings.for_user) {
        if (settings.user_id) {
          settings.for_user = {
            user_id: settings.user_id,
            user_name: settings.user_name || this.get('appState.currentUser.user_name')
          };
        } else {
          settings.for_user = {
            user_id: 'self',
            user_name: this.get('appState.currentUser.user_name')
          };
        }
      }
      if (settings.for_user && settings.for_user.user_id === this.get('appState.sessionUser.id')) {
        settings.for_user = Object.assign({}, settings.for_user, { user_id: 'self' });
      }
      settings.prompts_delay = settings.prompts_delay || '';
      if (settings.name === 'Unnamed Eval') {
        settings.name = '';
      }
      this.set('settings', settings);
      const pref = this.get('appState.currentUser.preferences.preferred_symbols');
      if (pref && (evaluation.libraries || []).indexOf(pref) !== -1) {
        this.set('settings.default_library', pref);
      }
    },
    closing() {},
    choose(id) {
      this.set('settings.label', id);
    },
    abort(confirm) {
      if (confirm) {
        if (this.get('appState.speak_mode')) {
          this.get('appState').toggle_speak_mode();
        }
        this.get('appState').return_to_index();
      } else {
        this.set('aborting', true);
      }
    },
    confirm() {
      this.get('modal').close();
      let del = parseInt(this.get('settings.prompts_delay'), 10);
      if (del && del > 0) {
        this.set('settings.prompts_delay', del);
      }
      if (!this.get('settings.name')) {
        this.set('settings.name', this.get('name_placeholder'));
      }
      evaluation.update(this.get('settings'), this.get('model.action') !== 'results');
      if (this.get('model.action') === 'results') {
        evaluation.persist(this.get('settings'));
      }
    }
  }
});
