import Controller from '@ember/controller';
import persistence from '../../utils/persistence';
import modal from '../../utils/modal';
import i18n from '../../utils/i18n';
import { computed } from '@ember/object';
import Utils from '../../utils/misc';
import lessons from '../../routes/organization/lessons';
import { htmlSafe } from '@ember/string';
import app_state from '../../utils/app_state';
import capabilities from '../../utils/capabilities';

export default Controller.extend({
  load_lessons: function() {
    var _this = this;
    _this.set('lessons', {loading: true});
    _this.store.query('lesson', {organization_id: _this.get('model.id'), history_check: true}).then(function(list) {
      _this.set('lessons', list);
    }, function(err) {
      _this.set('lessons', {error: true});
    });
  },
  user_lessons: computed('lessons', function() {
    var list = [];
    this.get('lessons').forEach(function(lesson) {
      if(lesson.get('target_types').indexOf('user') != -1) {
        list.push(lesson);
      }
    });
    return list;
  }),
  users_with_lessons: computed('users', 'lessons', function() {
    if(!this.get('users.length') || !this.get('lessons.length')) { return ;}
    var users = [];
    var user_lessons = this.get('user_lessons');
    this.get('users').forEach(function(user) {
      var list = [];
      user_lessons.forEach(function(lesson) {
        var comp = lesson.completed_users[user.id];
        var rating = comp && comp.rating;
        list.push({
          id: lesson.id,
          completed: !!comp,
          rating: comp && comp.rating,
          display_class: htmlSafe('face ' + (rating == 3 ? 'laugh' : (rating == 2 ? 'neutral' : 'sad')))
        });
      })
      users.push({
        user: user,
        lessons: list
      })
    });
    return users;
  }),
  supervisor_lessons: computed('lessons', function() {
    var list = [];
    this.get('lessons').forEach(function(lesson) {
      if(lesson.get('target_types').indexOf('supervisor') != -1) {
        list.push(lesson);
      }
    });
    return list;
  }),
  supervisors_with_lessons: computed('supervisors', 'lessons', function() {
    if(!this.get('supervisors.length') || !this.get('lessons.length')) { return ;}
    var users = [];
    var user_lessons = this.get('supervisor_lessons');
    this.get('supervisors').forEach(function(user) {
      var list = [];
      user_lessons.forEach(function(lesson) {
        var comp = lesson.completed_users[user.id];
        var rating = comp && comp.rating;
        list.push({
          id: lesson.id,
          completed: !!comp,
          rating: comp && comp.rating,
          display_class: htmlSafe('face ' + (rating == 3 ? 'laugh' : (rating == 2 ? 'neutral' : 'sad')))
        });
      })
      users.push({
        user: user,
        lessons: list
      })
    });
    return users;
  }),
  manager_lessons: computed('lessons', function() {
    var list = [];
    this.get('lessons').forEach(function(lesson) {
      if(lesson.get('target_types').indexOf('manager') != -1) {
        list.push(lesson);
      }
    });
    return list;

  }),
  managers_with_lessons: computed('managers', 'lessons', function() {
    if(!this.get('managers.length') || !this.get('lessons.length')) { return ;}
    var users = [];
    var user_lessons = this.get('manager_lessons');
    this.get('managers').forEach(function(user) {
      var list = [];
      user_lessons.forEach(function(lesson) {
        var comp = lesson.completed_users[user.id];
        var rating = comp && comp.rating;
        list.push({
          id: lesson.id,
          completed: !!comp,
          rating: comp && comp.rating,
          display_class: htmlSafe('face ' + (rating == 3 ? 'laugh' : (rating == 2 ? 'neutral' : 'sad')))
        });
      })
      users.push({
        user: user,
        lessons: list
      })
    });
    return users;
  }),
  load_users: function() {
    var _this = this;
    Utils.all_pages('/api/v1/organizations/' + _this.get('model.id') + '/users', {result_type: 'user', type: 'GET', data: {}}).then(function(data) {
      _this.set('users', data);
    });
    Utils.all_pages('/api/v1/organizations/' + _this.get('model.id') + '/supervisors', {result_type: 'user', type: 'GET', data: {}}).then(function(data) {
      _this.set('supervisors', data);
    });
    Utils.all_pages('/api/v1/organizations/' + _this.get('model.id') + '/managers', {result_type: 'user', type: 'GET', data: {}}).then(function(data) {
      _this.set('managers', data);
    });

  },
  actions: {
    add: function() {
      var _this = this;
      modal.open('modals/assign-lesson', {org: _this.get('model')}).then(function(res) {
        if(res && res.lesson) {
          _this.load_lessons();
        }
      });
    },
    edit: function(lesson) {
      var _this = this;
      modal.open('modals/assign-lesson', {org: _this.get('model'), lesson: lesson}).then(function(res) {
        if(res && res.lesson) {
          _this.load_lessons();
        }
      });
    },
    launch: function(lesson) {
      if(lesson && app_state.get('currentUser.user_token')) {
        var prefix = location.protocol + "//" + location.host;
        if(capabilities.installed_app && capabilities.api_host) {
          prefix = capabilities.api_host;
        }
        window.open(prefix + '/lessons/' + lesson.id + '/' + lesson.lesson_code + '/' + app_state.get('currentUser.user_token'), '_blank');
      }
    },
    delete: function(lesson) {
      var _this = this;
      modal.open('modals/confirm-org-action', {action: 'remove_lesson', org: _this.get('model'), lesson_name: lesson.title}).then(function(res) {
        if(res && res.confirmed) {
          persistence.ajax('/api/v1/lessons/' + lesson.id + '/unassign', {type: 'POST', data: {organization_id: _this.get('model.id')}}).then(function() {
            _this.load_lessons();
          }, function(err) {
            modal.error(i18n.t('error_removing_lesson', "There was an unxpected error when removing the lesson"));
          })
        }
      });
    }
  }
});
