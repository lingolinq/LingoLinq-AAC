import RSVP from 'rsvp';
import LingoLinq from '../app';
import modal from '../utils/modal';
import i18n from '../utils/i18n';
import app_state from '../utils/app_state';
import { computed } from '@ember/object';
import progress_tracker from '../utils/progress_tracker';

export default modal.ModalController.extend({
  opening: function() {
    this.set('existing_user', true);
    this.set('new_user', false);
    this.set('start_code', false);
    var sup = LingoLinq.store.createRecord('user', {
      preferences: {
        registration_type: 'manually-added-supervisor'
      }
    });
    this.set('linking', false);
    this.set('error', null);
    sup.set('watch_user_name_and_cookies', true);
    this.set('model.supervisor', sup);
  },
  supervisor_sponsorships: computed(
    'model.user.subscription.purchased_supporters',
    'model.user.subscription.available_supporters',
    function() {
      return this.get('model.user.subscription.available_supporters') || 0;
    }
  ),
  supervisor_types: computed(function() {
    return [
      {name: i18n.t('choose_access_level', "( Choose Supervisor Access )"), id: ''},
      {name: i18n.t('edit_access', "[Modify] boards and settings, and [View] reports"), id: 'edit'},
      {name: i18n.t('read_only_access', "[View Only] boards, settings, and reports"), id: 'read_only'},
      {name: i18n.t('modeling_access', "[View Only] boards and model"), id: 'modeling_only'},
    ];
  }),
  actions: {
    close: function() {
      modal.close();
    },
    set_user_type: function(type) {
      if(type == 'new') {
        this.set('start_code', false);
        this.set('existing_user', false);
        this.set('new_user', true);
      } else if(type == 'start_code') {
        this.set('start_code', true);
        this.set('existing_user', false);
        this.set('new_user', false);
      } else {
        this.set('start_code', false);
        this.set('existing_user', true);
        this.set('new_user', false);
      }
    },
    add: function() {
      var controller = this;
      if(!controller.get('supervisor_permission') && !controller.get('start_code')) { return; }
      controller.set('linking', true);
      var get_user_name = RSVP.resolve(this.get('supervisor_key'));
      if(this.get('new_user')) {
        var supervisor = this.get('model.supervisor');
        supervisor.set('watch_user_name_and_cookies', false);
        get_user_name = supervisor.save().then(function(user) {
          return user.get('user_name');
        }, function() {
          return RSVP.reject(i18n.t('creating_supervisor_failed', "Failed to create a new user with the given settings"));
        });
      } else if(this.get('start_code')) {
        get_user_name = RSVP.resolve(this.get('start_code_key'));
      }
      get_user_name.then(function(user_name) {
        var user = controller.get('model.user');
        var type = 'add';
        if(controller.get('supervisor_permission') == 'edit') {
          type = 'add_edit';
        } else if(controller.get('supervisor_permission') == 'modeling_only') {
          type = 'add_modeling';
        } else if(controller.get('start_code')) {
          type = 'start';
        }
        if(controller.get('premium_supporter') && controller.get('supervisor_sponsorships')) {
          type = type.replace(/^add/, 'add_premium');
        }
        user.set('supervisor_key', type + "-" + user_name);
        return user.save().then(function(user) {
          var add_done = function() {
            controller.set('linking', false);
            // if(app_state.get('currentUser') && app_state.get('currentUser.id') != user.get('id')) {
              app_state.get('currentUser').reload();
            // }
            modal.close();
          }
          if(user.get('start_progress')) {
            controller.set('linking', {start_code: true});
            progress_tracker.track(user.get('start_progress'), function(event) {
              if(event.status == 'errored' || (event.status == 'finished' && event.result && event.result.translated === false)) {
                user.reload();
                controller.set('linking', false);
                controller.set('error', i18n.t('start_code_failed', "The start code failed to process completely, and may need to be re-tried"));
              } else if(event.status == 'finished') {
                user.reload();
                add_done();
              }
            });  
          } else {
            add_done();
          }
        }, function() {
          controller.set('linking', false);
          controller.set('error', i18n.t('adding_supervisor_failed_explanation', "The user name provided was not valid, or can't be added to this account."));
        });
      }, function(err) {
          controller.set('linking', false);
          controller.set('error', err);
      });
    }
  }
});
