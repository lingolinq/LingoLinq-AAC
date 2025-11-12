import Controller from '@ember/controller';
import persistence from '../../utils/persistence';
import modal from '../../utils/modal';
import i18n from '../../utils/i18n';
import app_state from '../../utils/app_state';
import LingoLinq from '../../app';
import { observer } from '@ember/object';
import stashes from '../../utils/_stashes';

export default Controller.extend({
  load_goals: function() {
    var _this = this;
    _this.set('goals', {loading: true});
    LingoLinq.store.query('goal', {template_header: true}).then(function(data) {
      _this.set('goals', data.map(function(i) { return i; }));
      _this.set('goals.meta', data.meta);
    }, function(err) {
      _this.set('goals', {error: true});
    });
    if(app_state.get('currentUser.permissions.admin_support_actions')) {
      _this.set('global_goals', {loading: true});
      LingoLinq.store.query('goal', {global: true}).then(function(data) {
        _this.set('global_goals', data.map(function(i) { return i; }));
        _this.set('global_goals.meta', data.meta);
      }, function(err) {
        _this.set('global_goals', {error: true});
      });
    } else {
      _this.set('global_goals', null);
    }
  },
  reload_goals: observer('app_state.currentUser.permissions.admin_support_actions', function() {
    var _this = this;
    if(app_state.get('currentUser.permissions.admin_support_actions') && !_this.get('global_goals')) {
      _this.load_goals();
    }
  }),
  actions: {
    new_goal: function() {
      var goal = LingoLinq.store.createRecord('goal');
      goal.set('template_header', true);
      this.set('new_goal', goal);
    },
    save_goal: function() {
      var goal = this.get('new_goal');
      var _this = this;
      _this.set('status', {saving: true});
      stashes.track_daily_event('goals');
      goal.save().then(function(goal) {
        _this.set('new_goal', null);
        _this.set('status', null);
        _this.transitionToRoute('goals.goal', goal.get('id'));
      }, function(err) {
        _this.set('status', {error: true});
      });
    },
    cancel_new: function() {
      this.set('new_goal', null);
    },
    remove_badge: function(badge) {
      this.get('new_goal').remove_badge(badge);
    },
    add_badge_level: function() {
      if(this.get('new_goal')) {
        this.get('new_goal').add_badge_level();
      }
    }
  }
});
