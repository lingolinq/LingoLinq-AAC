import modal from '../utils/modal';
import app_state from '../utils/app_state';
import { observer } from '@ember/object';
import { inject as service } from '@ember/service';

export default modal.ModalController.extend({
  appState: service('app-state'),
  modal: service(),

  opening: function() {
    var user = this.appState.get('currentUser');
    this.appState.set('show_intro', false);
    if(user) {
      user.set('preferences.progress.intro_watched', true);
      user.save().then(null, function() { });
    }
    this.set('page', 1);
    this.set('total_pages', 14);
    if(window.ga) {
      window.ga('send', 'event', 'Intro', 'start', 'Intro Modal Opened');
    }
  },
  set_pages: observer('page', function() {
    var page = this.get('page');
    this.set('pages', {});
    this.set('pages.page_' + page, true);
    this.set('pages.last_page', page == this.get('total_pages'));
    this.set('pages.first_page', page == 1);
  }),
  actions: {
    next: function() {
      var page = this.get('page') || 1;
      page++;
      if(this.appState.get('currentUser.modeling_only')) {
        
      }
      if(page > this.get('total_pages')) { page = this.get('total_pages'); }
      this.set('page', page);
    },
    previous: function() {
      var page = this.get('page') || 1;
      page--;
      if(page < 1) { page = 1; }
      this.set('page', page);
    },
    video: function() {
      if(window.ga) {
        window.ga('send', 'event', 'Intro', 'video', 'Intro Video Opened');
      }
      this.modal.open('inline-video', {video: {type: 'youtube', id: 'TSlGz7g9LIs'}, hide_overlay: true});
    }
  }
});
