import Controller from '@ember/controller';
import { inject as service } from '@ember/service';
import modal from '../utils/modal';
import capabilities from '../utils/capabilities';
import { htmlSafe } from '@ember/template';
import { computed } from '@ember/object';

export default Controller.extend({
  appState: service('app-state'),
  
  display_class: computed('alert_type', function() {
    var res = "alert alert-dismissable ";
    if(this.get('alert_type')) {
      res = res + this.get('alert_type');
    }
    return res;
  }),
  actions: {
    opening: function() {
      var settings = modal.settings_for['flash'];

      this.set('message', settings.text);
      this.set('sticky', settings.sticky);
      this.set('action', settings.action);
      this.set('subscribe', settings.subscribe);
      this.set('redirect', settings.redirect);
      var class_name = 'alert-info';
      if(settings.type == 'warning') { class_name = 'alert-warning'; }
      if(settings.type == 'error') { class_name = 'alert-danger'; }
      if(settings.type == 'success') { class_name = 'alert-success'; }
      if(settings.below_header) { class_name = class_name + ' below_header'; }
      var top = this.appState.get('header_height');
      this.set('extra_styles', htmlSafe(settings.below_header ? 'top: ' + top + 'px;' : ''));
      this.set('alert_type', class_name);
    },
    closing: function() {
    },
    confirm: function(temp_action) {
      if(this.get('redirect')) {
        if(this.get('redirect.subscribe') && !capabilities.installed_app) {
          this.transitionToRoute('user.subscription', this.appState.get('currentUser.user_name'));
        }
      } else if(this.get('action.callback')) {
        this.get('action').callback();
      }
    },
    contact: function() {
      this.transitionToRoute('contact');
    }
  }
});
