import Controller from '@ember/controller';
import { inject as service } from '@ember/service';
import RSVP from 'rsvp';
import modal from '../../utils/modal';
import LingoLinq from '../../app';
import app_state from '../../utils/app_state';
import Utils from '../../utils/misc';
import { observer } from '@ember/object';
import { computed } from '@ember/object';

export default Controller.extend({
  modal: service(),

  load_goals: function() {
    var controller = this;
    controller.set('goals', {loading: true});
    Utils.all_pages('goal', {user_id: this.get('model.id')}, function() { }).then(function(list) {
      controller.set('goals', {list: list});
    }, function() {
      controller.set('goals', {error: true});
    });
  },
  load_badges: function() {
    var _this = this;
    this.set('badges', {loading: true});
    Utils.all_pages('badge', {user_id: this.get('model.id')}, function() { }).then(function(badges) {
      _this.set('badges', {list: badges});
    }, function(err) {
      _this.set('badges', {error: true});
    });
  },
  map_badges_to_goals: observer('goals.list', 'badges.list', function() {
    if(this.get('goals.list.length') !== undefined && this.get('badges.list.length') !== undefined) {
      var _this = this;
      this.get('goals.list').forEach(function(goal) {
        var badge = _this.get('badges.list').find(function(b) { return b.goal_id == goal.get('id') && b.get('earned'); });
        badge = badge || _this.get('badges.list').find(function(b) { return b.get('goal_id') == goal.get('id'); });
        goal.set('current_badge', badge);
      });
      this.set('badges_loaded', true);
    }
  }),
  any_goal: computed('primary_goal', 'secondary_goals', 'past_goals', function() {
    return this.get('primary_goal') || this.get('secondary_goals').length > 0 || this.get('past_goals').length > 0;
  }),
  primary_goal: computed('goals.list', function() {
    return (this.get('goals.list') || []).find(function(g) { return g.get('active') && g.get('primary'); });
  }),
  secondary_goals: computed('primary_goal.id', 'goals.list', function() {
    var pg_id = this.get('primary_goal.id');
    return (this.get('goals.list') || []).filter(function(g) { return g.get('active') && g.get('id') != pg_id; });
  }),
  past_goals: computed('goals.list', function() {
    return (this.get('goals.list') || []).filter(function(g) { return !g.get('active'); });
  }),
  actions: {
    add_goal: function() {
      var _this = this;
      this.modal.open('new-goal', {user: this.get('model') }).then(function(res) {
        if(res && res.get('id') && res.get('set_badges')) {
          _this.transitionToRoute('user.goal', _this.get('model.user_name'), res.get('id'));
        } else if(res) {
          _this.load_goals();
        }
      }, function() { });
    },
    new_note: function(goal) {
      var _this = this;
      this.modal.open('record-note', {note_type: 'text', user: this.get('model'), goal: goal}).then(function(res) {
      }, function() { });
    },
    quick_assessment: function(goal) {
      var _this = this;
      this.modal.open('quick-assessment', {user: this.get('model'), goal: goal}).then(function(res) {
      }, function() { });
    },
    update: function(goal, attribute, action) {
      var done = RSVP.resolve();
      if(attribute == 'primary') {
        goal.set('primary', action == 'on');
        done = goal.save();
      } else if(attribute == 'active') {
        goal.set('active', action == 'on');
        done = goal.save();
      }
      var _this = this;
      done.then(function() {
        _this.load_goals();
      }, function() { });
    },
    delete: function(goal) {
      var _this = this;
      this.modal.open('confirm-delete-goal', {user: this.get('model'), goal: goal}).then(function(res) {
        if(res.updated) {
          _this.load_goals();
        }
      });
    },
    find_goal: function() {
      var _this = this;
      this.modal.open('new-goal', {browse: true, user: this.get('model') }).then(function(res) {
        if(res) {
          _this.load_goals();
        }
      }, function() { });
    }
  }
});
