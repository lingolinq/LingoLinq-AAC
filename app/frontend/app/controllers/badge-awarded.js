import LingoLinq from '../app';
import modal from '../utils/modal';
import app_state from '../utils/app_state';
import i18n from '../utils/i18n';
import editManager from '../utils/edit_manager';
import { htmlSafe } from '@ember/string';
import { observer } from '@ember/object';
import { computed } from '@ember/object';
import { inject as service } from '@ember/service';

export default modal.ModalController.extend({
  appState: service('app-state'),
  modal: service(),

  opening: function() {
    this.load_badge();
    if(this.get('model.user_id') && !this.get('model.badge')) {
      this.send('user_badges');
    }
    this.set('user_goals', null);
    this.set('user_badges', null);
    this.set('user_goals_and_badges', false);
    this.set('has_modeling_activities', false);
    if(this.get('model.speak_mode')) {
      var _this = this;
      this.appState.get('referenced_user').load_word_activities().then(function(activities) {
        if(activities && activities.list && activities.list.length > 0) {
          _this.set('has_modeling_activities', true);
        }
      }, function() { });
    }
  },
  load_badge: function() {
    var _this = this;
    if(_this.get('model.badge.id') && !_this.get('model.badge.completion_settings')) {
      if(!_this.get('model.badge').reload) {
        _this.set('model.badge.loading', true);
        LingoLinq.store.findRecord('badge', _this.get('model.badge.id')).then(function(b) {
          _this.set('model.badge', b);
        }, function(err) {
          _this.set('model.badge.error', true);
        });
      } else {
        _this.get('model.badge').reload();
      }
    }
    var list = [];
    for(var idx = 0; idx < 80; idx++) {
      list.push({
        style: htmlSafe("top: " + (Math.random() * 200) + "px; left: " + (Math.random() *100) + "%;"),
      });
    }
    this.set('confettis', list);
  },
  user_name: computed('model.badge.user_name', function() {
    if(!this.get('model.badge.user_name')) {
      return i18n.t('the_user', "the user");
    } else {
      return this.get('model.badge.user_name');
    }
  }),
  load_user_badges: observer('user_goals_and_badges', function() {
    var _this = this;
    if(_this.get('user_goals_and_badges')) {
      var user_id = _this.get('model.badge.user_id') || _this.get('model.user_id');
      if(!_this.get('user_goals')) {
        _this.set('user_goals', {loading: true});
        _this.store.query('goal', {user_id: user_id}).then(function(goals) {
          _this.set('user_goals', goals);
        }, function(err) {
          _this.set('user_goals', {error: true});
        });
      }
      if(!_this.get('user_badges')) {
        _this.set('user_badges', {loading: true});
        _this.store.query('badge', {user_id: user_id, earned: true}).then(function(badges) {
          _this.set('user_badges', badges);
        }, function(err) {
          _this.set('user_badges', {error: true});
        });
      }
    }
  }),
  actions: {
    user_badges: function() {
      this.set('user_goals_and_badges', true);
    },
    show_badge: function(badge_id) {
      if(badge_id) {
        this.set('model.badge', {id: badge_id})
        this.load_badge();
      }
      this.set('user_goals_and_badges', false);
    },
    show_goal: function(goal_id) {
      var _this = this;
      _this.store.query('badge', {user_id: _this.get('model.badge.user_id'), goal_id: goal_id}).then(function(badges) {
        badges = badges.map(function(b) { return b; });
        if(badges.length > 0) {
          _this.set('model.badge', {id: badges[0].get('id')});
          _this.load_badge();
          _this.set('user_goals_and_badges', false);
        }
      });
    },
    new_goal: function() {
      var _this = this;
      var user_id = _this.get('model.badge.user_id');
      _this.store.findRecord('user', user_id).then(function(user) {
        this.modal.open('new-goal', {user: user});
      });
    },
    modeling_ideas: function() {
      this.modal.open('modals/modeling-ideas', {speak_mode: true, users: [this.appState.get('referenced_user')]});
    }
  }
});
