import Component from '@ember/component';
import { inject as service } from '@ember/service';
import { computed } from '@ember/object';
import LingoLinq from '../../app';
import progress_tracker from '../../utils/progress_tracker';
import app_state from '../../utils/app_state';
import session from '../../utils/session';
import persistence from '../../utils/persistence';
import stashes from '../../utils/_stashes';
import $ from 'jquery';

export default Component.extend({
  tagName: '',
  
  registration_types: LingoLinq.registrationTypes,
  
  triedToSave: false,
  start_code: null,
  registering: null,

  // These should be passed in, but we can default or allow internal state
  // user: null, 

  badEmail: computed('user.email', 'triedToSave', function() {
    var email = this.get('user.email');
    return (this.get('triedToSave') && !email);
  }),

  shortPassword: computed('user.password', 'triedToSave', function() {
    var password = this.get('user.password') || '';
    return this.get('triedToSave') && password.length < 6;
  }),

  noName: computed('user.name', 'user.user_name', 'triedToSave', function() {
    var name = this.get('user.name');
    var user_name = this.get('user.user_name');
    return this.get('triedToSave') && !name && !user_name;
  }),

  noSpacesName: computed('user.user_name', function() {
    return !!(this.get('user.user_name') || '').match(/[\s\.'"]/);
  }),

  actions: {
    authenticateSession() {
      // Use closure action if provided
      var action = this.get('authenticateSession');
      if (action && typeof action === 'function') {
        action();
      }
    },
    intro_video(id) {
        if(window.ga) {
            window.ga('send', 'event', 'Setup', 'video', 'Intro video opened');
        }
        // Use closure action if provided
        var action = this.get('openIntroVideo');
        if (action && typeof action === 'function') {
          action(id);
        }
    },
    set_start_code() {
      this.set('start_code', true);
    },
    saveProfile() {
      var user = this.get('user');
      this.set('triedToSave', true);
      if(!user.get('terms_agree')) { return; }
      if(!this.get('persistence.online')) { return; }
      
      if(this.get('badEmail') || this.get('shortPassword') || this.get('noName') || this.get('noSpacesName')) {
        return;
      }

      this.set('registering', {saving: true});
      var _this = this;
      
      // Save logic is complex and interacts with app_state/session/progress_tracker
      // bubbling it up might be cleaner if we wanted to extract logic, but 
      // since we want to remove controller logic, we keep it here.
      
      user.save().then(function(user) {
        _this.set('start_code', null);
        var meta = _this.get('persistence').meta('user', null);
        _this.set('triedToSave', false);
        user.set('password', null);
        
        var save_done = function() {
          _this.set('registering', null);
          _this.get('app_state').return_to_index();
          if(meta && meta.access_token) {
            _this.get('session').override(meta);
          }
        };

        if(user.get('start_progress')) {
          _this.set('registering', {saving: true, initializing: true})

          progress_tracker.track(user.get('start_progress'), function(event) {
            if(event.status == 'errored' || (event.status == 'finished' && event.result && event.result.translated === false)) {
              _this.set('registering', {error: {progress: true}});
            } else if(event.status == 'finished') {
              save_done();
            }
          });
        } else {
          save_done();
        }
      }, function(err) {
        _this.set('registering', {error: true});
        if(err.errors && err.errors[0] == 'blocked email address') {
          _this.set('registering', {error: {email_blocked: true}});
        } else if(err.errors && err.errors[0] && err.errors[0].start_code_error) {
          _this.set('registering', {error: {start_code: true}});
        }
      });
    }
  }
});
