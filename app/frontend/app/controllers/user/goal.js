import Controller from '@ember/controller';
import { inject as service } from '@ember/service';
import $ from 'jquery';
import modal from '../../utils/modal';
import LingoLinq from '../../app';
import app_state from '../../utils/app_state';
import { htmlSafe } from '@ember/string';
import { observer } from '@ember/object';
import { computed } from '@ember/object';

export default Controller.extend({
  modal: service(),

  load_logs: function() {
    var _this = this;
    var user_id = this.get('user.id');
    // Skip if user_id is 'cache' or starts with 'cache:' (from boards cache endpoint)
    if(!user_id || user_id == 'cache' || user_id.toString().match(/^cache:/)) {
      return;
    }
    _this.set('more_available', false);
    this.store.query('log', {user_id: user_id, goal_id: this.get('model.id')}).then(function(list) {
      _this.set('logs', list.map(function(i) { return i; }));

      var meta = $.extend({}, list.meta);
      _this.set('meta', meta);
      _this.set('more_available', !!meta.next_url);
    }, function(err) {
    });
  },
  messages_only: computed(function() {
    return true;
  }),
  save_disabled: computed('pending_save', 'saving', function() {
    return this.get('pending_save') || this.get('saving');
  }),
  pending_save: computed('video_pending', function() {
    return !!this.get('video_pending');
  }),
  load_user_badges: observer('user.id', 'model.id', 'model.badges', function() {
    var _this = this;
    this.store.query('badge', {user_id: this.get('user.id'), goal_id: this.get('model.id')}).then(function(badges) {
      _this.set('user_badges', badges.map(function(i) { return i; }));
    }, function(err) {
    });

  }),
  mapped_badges: computed('model.badges', 'user_badges', function() {
    var user_badges = this.get('user_badges');
    if(user_badges) {
      var res = [];
      (this.get('model.badges') || []).forEach(function(badge) {
        var new_badge = $.extend({}, badge);
        new_badge.user_badge = user_badges.find(function(b) { return b.get('level') == badge.level; });
        res.push(new_badge);
      });
      return res;
    } else {
      return this.get('model.badges');
    }
  }),
  assessment_badge_description: computed('model.assessment_badge', function() {
    var ub = LingoLinq.store.createRecord('badge', {
      name: this.get('model.badge_name') || this.get('model.summary'),
      level: 0,
      completion_settings: this.get('model.assessment_badge')
    });
    return ub.get('completion_explanation');
  }),
  weighted_average_status_face_class: computed('model.stats.weighted_average_status', function() {
    var status = this.get('model.stats.weighted_average_status') || 0;
    var res = "face";
    if(status >= 3.5) {
    } else if(status >= 2.5) {
      res = res + " happy";
    } else if(status >= 1.5) {
      res = res + " neutral";
    } else if(status >= 0.5) {
      res = res + " sad";
    } else {
      res = res + " sad";
    }
    return htmlSafe(res);
  }),
  actions: {
    more_results: function() {
      var _this = this;
      if(this.get('more_available')) {
        var meta = this.get('meta');
        var args = {user_id: this.get('user.id'), goal_id: this.get('model.id'), per_page: meta.per_page, offset: (meta.offset + meta.per_page)};
        var find = this.store.query('log', args);
        find.then(function(list) {
          _this.set('logs', _this.get('logs').concat(list.map(function(i) { return i; })));
          var meta = $.extend({}, list.meta);
          _this.set('meta', meta);
          _this.set('more_available', !!meta.next_url);
        }, function() { });
      }
    },
    new_note: function(goal) {
      var _this = this;
      this.modal.open('record-note', {note_type: 'text', user: this.get('user'), goal: this.get('model')}).then(function(res) {
        _this.load_logs();
      }, function() { });
    },
    quick_assessment: function(goal) {
      var _this = this;
      this.modal.open('quick-assessment', {user: this.get('user'), goal: this.get('model')}).then(function(res) {
        _this.load_logs();
      }, function() { });
    },
    edit_goal: function() {
      this.set('editing', true);
    },
    cancel_edit: function() {
      this.set('editing', false);
    },
    save_goal: function() {
      var _this = this;
      var goal = this.get('model');
      if(this.get('selected_goal')) {
        goal = this.store.createRecord('goal');
      }
      _this.set('saving', true);
      _this.set('error', false);
      goal.save().then(function() {
        _this.set('saving', false);
        _this.set('editing', false);
      }, function() {
        _this.set('saving', false);
        _this.set('error', true);
      });
    },
    video_ready: function(id) {
      this.set('video_pending', false);
      if(this.get('model')) {
        this.set('model.video_id', id);
      }
    },
    video_not_ready: function() {
      this.set('video_pending', false);
      if(this.get('model')) {
        this.set('model.video_id', null);
      }
    },
    video_pending: function() {
      this.set('video_pending', true);
      if(this.get('model')) {
        this.set('model.video_id', null);
      }
    },
    remove_badge: function(badge) {
      this.get('model').remove_badge(badge);
    },
    add_badge_level: function() {
      if(this.get('model')) {
        this.get('model').add_badge_level();
      }
    },
    badge_popup: function(badge) {
      var ub = badge.user_badge;
      if(!badge.user_badge) {
        ub = LingoLinq.store.createRecord('badge', {
          name: this.get('model.badge_name') || this.get('model.summary'),
          level: badge.level,
          image_url: badge.image_url,
          sound_url: badge.sound_url,
          completion_settings: badge
        });
      }
      if(ub) {
        this.modal.open('badge-awarded', {badge: ub, user_id: this.get('user.id')});
      }
    }
  }
});


