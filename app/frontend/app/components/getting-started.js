import Component from '@ember/component';
import { inject as service } from '@ember/service';
import { computed } from '@ember/object';
import { htmlSafe } from '@ember/template';
import modal from '../utils/modal';

/**
 * Getting Started modal (Phase 2).
 */
export default Component.extend({
  modal: service('modal'),
  appState: service('app-state'),
  router: service('router'),
  tagName: '',

  init() {
    this._super(...arguments);
    const modalService = this.get('modal');
    const template = 'getting-started';
    let options = (modalService && modalService.getSettingsFor && modalService.getSettingsFor(template)) ||
                  (modalService && modalService.settingsFor && modalService.settingsFor[template]) ||
                  this.get('model') || {};
    if (!options.progress || typeof options.progress !== 'object') {
      options = Object.assign({}, options, { progress: options.progress || {} });
    }
    this.set('model', options);
  },

  /** Current step (1–5) for stage label; same order as checklist */
  currentStep: computed('model.progress', function() {
    const order = ['intro_watched', 'home_board_set', 'app_added', 'preferences_edited', 'profile_edited'];
    const progress = this.get('model.progress') || {};
    if (progress.setup_done) { return 5; }
    for (let i = 0; i < order.length; i++) {
      if (!progress[order[i]]) { return i + 1; }
    }
    return 5;
  }),

  /** Percent complete (0–100) for header progress bar; same options as dashboard */
  progressPercent: computed('model.progress', function() {
    const options = ['intro_watched', 'home_board_set', 'app_added', 'preferences_edited', 'profile_edited'];
    const progress = this.get('model.progress') || {};
    if (progress.setup_done) { return 100; }
    let done = 0;
    options.forEach((opt) => {
      if (progress[opt]) { done++; }
    });
    return options.length ? Math.round((done / options.length) * 100) : 0;
  }),

  progressPercentStyle: computed('progressPercent', function() {
    return htmlSafe('width: ' + this.get('progressPercent') + '%;');
  }),

  actions: {
    close() {
      this.get('modal').close();
    },
    opening() {},
    closing() {},
    intro() {
      if (window.ga) {
        window.ga('send', 'event', 'Setup', 'launch', 'Setup started');
      }
      this.get('appState').set('auto_setup', false);
      this.get('router').transitionTo('setup', { queryParams: { user_id: null } });
      this.get('modal').close();
    },
    app_install() {
      modal.open('add-app');
    },
    setup_done() {
      const user = this.get('appState').get('currentUser');
      user.set('preferences.progress.setup_done', true);
      user.save().then(null, function() {});
      this.get('modal').close();
    }
  }
});
