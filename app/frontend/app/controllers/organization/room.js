import Controller from '@ember/controller';
import i18n from '../../utils/i18n';
import Utils from '../../utils/misc';
import persistence from '../../utils/persistence';
import modal from '../../utils/modal';
import { computed } from '@ember/object';
import EmberObject from '@ember/object';
import { set as emberSet } from '@ember/object';
import capabilities from '../../utils/capabilities';
import app_state from '../../utils/app_state';

export default Controller.extend({
  first_log: computed('model.logs.data', function() {
    return (this.get('model.logs.data') || [])[0];
  }),
  load_stats: function() {
    var _this = this;
    _this.set('log_stats', {loading: true});
    persistence.ajax('/api/v1/units/' + _this.get('model.id') + '/log_stats', {type: 'GET'}).then(function(res) {
      res.loaded = true;
      res.avg_words_per_day = Math.round(10 * res.total_words / Math.max(1, res.total_user_weeks * 7)) / 10;
      res.avg_words_per_session = Math.round(10 * res.total_words / Math.max(1, res.total_sessions)) / 10;
      res.avg_modeling_per_week = Math.round(10 * res.total_models / Math.max(1, res.total_user_weeks * 7)) / 10;
      res.avg_sessions_per_user_week = Math.round(10 * res.total_sessions / Math.max(1, res.total_user_weeks)) / 10;
      _this.set('log_stats', res);
    }, function(err) {
      _this.set('log_stats', {error: true});
    });
  },
  words_cloud: computed('log_stats.word_count', function() {
    var res = EmberObject.create({
      words_by_frequency: []
    });
    var counts = this.get('log_stats.word_count') || [];
    counts.forEach(function(w) {
      res.get('words_by_frequency').pushObject({text: w.word, count: w.cnt});
    });
    return res;
  }),
  modeled_words_cloud: computed('log_stats.modeled_word_counts', 'model.supervisor_weeks', function() {
    var res = EmberObject.create({
      words_by_frequency: []
    });
    var counts = this.get('log_stats.modeled_word_counts') || [];
    var weeks = this.get('model.supervisor_weeks') || {};
    for(var user_id in weeks) {
      for(var ts in weeks[user_id]) {
        if(weeks[user_id][ts]['modeled']) {
          weeks[user_id][ts]['modeled'].forEach(function(w) {
            var wrd = counts.find(function(ww) { return ww.word == w.toLowerCase()});
            if(!wrd) {
              counts.push({word: w, cnt: 1});
            } else {
              wrd.cnt++;
            }
          });
        }
      }
    }
    counts.forEach(function(w) {
      res.get('words_by_frequency').pushObject({text: w.word, count: w.cnt});
    });
    return res;
  }),
  lesson_or_topics: computed('model.lesson', 'model.topics', function() {
    return !!(this.get('model.lesson') || this.get('model.topics.length'));
  }),
  lesson_targets: computed('model.lesson.types', function() {
    var types = (this.get('model.lesson.types') || []).sort().join(',');
    if(types == 'supervisor') {
      return i18n.t('supervisors_lower', "supervisors");
    } else {
      return i18n.t('all_users_lower', "all users");
    }
  }),
  actions: {
    edit_unit: function(opt) {
      var _this = this;
      var opts = {unit: _this.get('model')}
      if(opt == 'curriculum_only') {
        opts.curriculum_only = true;
      }
      modal.open('edit-unit', opts).then(function(res) {
        if(res && res.updated) {
          _this.get('model').load_data(true);
        }
      });
    },
    update_curriculum: function() {
      this.send('edit_unit', 'curriculum_only')
    },
    set_lesson: function() {
      var _this = this;
      modal.open('modals/assign-lesson', {unit: _this.get('model')}).then(function(res) {
        if(res && res.lesson) {
          _this.get('model').reload();
        }
      });
    },
    remove_lesson: function() {
      var _this = this;
      if(_this.get('model.lesson')) {
        modal.open('confirm-delete-unit', {unit: _this.get('model'), lesson: _this.get('model.lesson')}).then(function(res) {
          if(res && res.deleted) {
            _this.get('model').reload();
          }
        });
      }
    },
    launch_lesson: function() {
      if(this.get('model.lesson') && app_state.get('currentUser.user_token')) {
        var lesson = this.get('model.lesson');
        var prefix = location.protocol + "//" + location.host;
        if(capabilities.installed_app && capabilities.api_host) {
          prefix = capabilities.api_host;
        }
        window.open(prefix + '/lessons/' + lesson.id + '/' + lesson.lesson_code + '/' + app_state.get('currentUser.user_token'), '_blank');
      }

    },
    delete_unit: function() {
      var _this = this;
      modal.open('confirm-delete-unit', {unit: _this.get('model')}).then(function(res) {
        if(res && res.deleted) {
          _this.transitionToRoute('organization.rooms', _this.get('organization.id'));
        }
      });
    },
    add_users: function() {
      var unit = this.get('model');
      unit.set('adding_users', !unit.get('adding_users'));
    },
    add_unit_user: function(user_type) {
      var unit = this.get('model');
      var action = 'add_' + user_type;
      var user_name = null;
      if(user_type.match('communicator')) {
        user_name = unit.get('communicator_user_name');
      } else {
        user_name = unit.get('supervisor_user_name');
      }
      if(!user_name) { return; }
      action = action + "-" + user_name;
      unit.set('management_action', action);
      unit.save().then(function() {
        unit.set('communicator_user_name', null);
        unit.set('supervisor_user_name', null);
      }, function() {
        modal.error(i18n.t('error_adding_user', "There was an unexpected error while trying to add the user"));
      });
    },
    refresh: function() {
      this.get('model').load_data(true);
    },
    delete_unit_user: function(unit, user_type, user_id, decision) {
      if(!decision) {
        var _this = this;
        modal.open('modals/confirm-org-action', {action: 'remove_unit_user', unit_user_name: user_id}).then(function(res) {
          if(res.confirmed) {
            _this.send('delete_unit_user', unit, user_type, user_id, true);
          }
        });
        return;
      }
      var unit = this.get('model');
      var action = 'remove_' + user_type + '-' + user_id;
      unit.set('management_action', action);
      unit.save().then(function() {
      }, function() {
        modal.error(i18n.t('error_removing_user', "There was an unexpected error while trying to remove the user"));
      });
    },
    communicator_profile: function(user) {
      var profile_id = this.get('organization.communicator_profile_id');
      modal.open('modals/profiles', {user: user, profile_id: profile_id, type: 'communicator'});
    },
    supervisor_profile: function(user) {
      var profile_id = this.get('organization.supervisor_profile_id');
      modal.open('modals/profiles', {user: user, profile_id: profile_id, type: 'supervisor'});
    },
    communicator_status: function(user) {
      var _this = this;
      modal.open('modals/user-status', {user: user, type: 'communicator', organization: this.get('organization')}).then(function(res) {
        if(res) {
          var ref_user = _this.get('model.communicators').find(function(u) { return u && u.id == user.id;});
          emberSet(ref_user, 'org_status', res.status);
          _this.set('refresh_id', Math.random());  
        }
      });
    },
    set_goal: function(decision) {
      var _this = this;
      if(_this.get('model.goal') && !decision) {
        modal.open('modals/confirm-remove-goal', {source_type: 'unit', source: _this.get('model'), goal: _this.get('model.goal')}).then(function(res) {
          if(res.confirmed) {
            _this.send('set_goal', 'confirm');
          }
        });
        return;
      }
      modal.open('new-goal', {unit: _this.get('model')}).then(function(res) {
        if(!res || !res.get('id')) { return; }
        var unit = _this.get('model');
        unit.set('goal', {id: res.get('id')});
        unit.save().then(function() {
          modal.success(i18n.t('goal_linked', "Goal successfully linked to this room!"));
        }, function(err) {
          modal.error(i18n.t('error_adding_goal', "There was an unexpected error trying to link a new goal for this room"));
        });
      });
    },
    message: function(target) {
      // modal for crafting a message
      // option to include feedback footer for communicators
      // should send a message to the communicator and all non-org supervisors of that communicator
      modal.open('modals/message-unit', {unit: this.get('model'), target: target});
    }
  }
});
