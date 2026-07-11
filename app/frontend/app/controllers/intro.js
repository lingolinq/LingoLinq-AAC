import modal from '../utils/modal';
import app_state from '../utils/app_state';
import { observer } from '@ember/object';
import { inject as service } from '@ember/service';
import { alias } from '@ember/object/computed';

export default modal.ModalController.extend({
  appState: service('app-state'),
  // Alias for template compatibility (template uses this.app_state)
  app_state: alias('appState'),
  opening: function() {
    var user = app_state.get('currentUser');
    app_state.set('show_intro', false);
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
  },

  actions: {
    next: function() {
      var page = this.get('page') || 1;
      page++;
      if(app_state.get('currentUser.modeling_only')) {
        
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
      modal.open('inline-video', {video: {type: 'youtube', id: 'TSlGz7g9LIs'}, hide_overlay: true});
    }
  }
});
