import Component from '@ember/component';
import { inject as service } from '@ember/service';

export default Component.extend({
  tagName: '', // No wrapper element

  // Service injections
  appState: service('app-state'),
  router: service(),
  modal: service(),

  actions: {
    confirm: function() {
      var user = this.appState.get('currentUser');
      if (user) {
        user.set('terms_agree', true);
        user.save().then(() => {
          this.modal.close();
          this.appState.set('auto_setup', true);
          if (!user.get('preferences.progress.intro_watched')) {
            this.router.transitionTo('setup', { queryParams: { user_id: null, page: null } });
          }
        }, () => {
          this.set('agree_error', true);
        });
      } else {
        this.modal.close();
      }
    },
    
    close: function() {
      this.modal.close();
    },

    // Handle opening/closing events from modal-dialog if needed
    opening: function() {
      // Logic for when modal opens
    },
    closing: function() {
      // Logic for when modal closes
    }
  }
});
