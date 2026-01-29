import Component from '@ember/component';
import { inject as service } from '@ember/service';
import { observer } from '@ember/object';

export default Component.extend({
  tagName: '',

  // Service injections
  appState: service('app-state'),
  modal: service(),

  // State
  page: 1,
  total_pages: 14,
  pages: null,

  init() {
    this._super(...arguments);
    this.set('pages', {});
    this.updatePages();
  },

  updatePages() {
    var page = this.get('page');
    var total = this.get('total_pages');
    this.set('pages', {
      ['page_' + page]: true,
      last_page: page === total,
      first_page: page === 1
    });
  },

  pageObserver: observer('page', function() {
    this.updatePages();
  }),

  actions: {
    opening: function() {
      var user = this.appState.get('currentUser');
      this.appState.set('show_intro', false);
      if (user) {
        user.set('preferences.progress.intro_watched', true);
        user.save().then(null, () => { });
      }
      this.set('page', 1);
      if (window.ga) {
        window.ga('send', 'event', 'Intro', 'start', 'Intro Modal Opened');
      }
    },

    closing: function() {
      // Logic for when modal closes
    },

    next: function() {
      var page = this.get('page') || 1;
      var total = this.get('total_pages');
      page++;
      if (page > total) { page = total; }
      this.set('page', page);
    },

    previous: function() {
      var page = this.get('page') || 1;
      page--;
      if (page < 1) { page = 1; }
      this.set('page', page);
    },

    video: function() {
      if (window.ga) {
        window.ga('send', 'event', 'Intro', 'video', 'Intro Video Opened');
      }
      this.modal.open('inline-video', { video: { type: 'youtube', id: 'TSlGz7g9LIs' }, hide_overlay: true });
    },

    close: function() {
      this.modal.close();
    }
  }
});
