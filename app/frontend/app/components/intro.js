import Component from '@ember/component';
import { inject as service } from '@ember/service';
import { computed } from '@ember/object';
import modal from '../utils/modal';

/**
 * Intro / Getting Started modal (Phase 2).
 * Converted from intro controller/template.
 */
export default Component.extend({
  modal: service('modal'),
  appState: service('app-state'),
  tagName: '',

  init() {
    this._super(...arguments);
    const appState = this.get('appState');
    const user = appState.get('currentUser');
    appState.set('show_intro', false);
    if (user) {
      user.set('preferences.progress.intro_watched', true);
      user.save().then(null, function() {});
    }
    this.set('page', 1);
    this.set('total_pages', 14);
    if (window.ga) {
      window.ga('send', 'event', 'Intro', 'start', 'Intro Modal Opened');
    }
  },

  pages: computed('page', 'total_pages', function() {
    const page = this.get('page');
    const total = this.get('total_pages');
    const out = {};
    out['page_' + page] = true;
    out.last_page = page === total;
    out.first_page = page === 1;
    return out;
  }),

  actions: {
    close() {
      this.get('modal').close();
    },
    opening() {},
    closing() {},
    next() {
      let page = this.get('page') || 1;
      page++;
      if (page > this.get('total_pages')) {
        page = this.get('total_pages');
      }
      this.set('page', page);
    },
    previous() {
      let page = this.get('page') || 1;
      page--;
      if (page < 1) {
        page = 1;
      }
      this.set('page', page);
    },
    video() {
      if (window.ga) {
        window.ga('send', 'event', 'Intro', 'video', 'Intro Video Opened');
      }
      modal.open('inline-video', { video: { type: 'youtube', id: 'TSlGz7g9LIs' }, hide_overlay: true });
    }
  }
});
