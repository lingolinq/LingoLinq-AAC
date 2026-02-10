import Component from '@ember/component';
import { inject as service } from '@ember/service';
import { observer } from '@ember/object';
import { computed } from '@ember/object';
import { htmlSafe } from '@ember/template';
import modal from '../utils/modal';
import i18n from '../utils/i18n';
import LingoLinq from '../app';

/**
 * Badge Awarded modal (Phase 2).
 */
export default Component.extend({
  modal: service('modal'),
  appState: service('app-state'),
  store: service('store'),
  tagName: '',

  init() {
    this._super(...arguments);
    const modalService = this.get('modal');
    const template = 'badge-awarded';
    const options = (modalService && modalService.getSettingsFor && modalService.getSettingsFor(template)) ||
                    (modalService && modalService.settingsFor && modalService.settingsFor[template]) ||
                    this.get('model') || {};
    this.set('model', options);
  },

  didInsertElement() {
    this._super(...arguments);
    this.load_badge();
    if (this.get('model.user_id') && !this.get('model.badge')) {
      this.send('user_badges');
    }
    this.set('user_goals', null);
    this.set('user_badges', null);
    this.set('user_goals_and_badges', false);
    this.set('has_modeling_activities', false);
    if (this.get('model.speak_mode')) {
      const _this = this;
      this.appState.get('referenced_user').load_word_activities().then(function(activities) {
        if (activities && activities.list && activities.list.length > 0) {
          _this.set('has_modeling_activities', true);
        }
      }, function() {});
    }
  },

  load_badge() {
    const _this = this;
    if (_this.get('model.badge.id') && !_this.get('model.badge.completion_settings')) {
      if (!_this.get('model.badge').reload) {
        _this.set('model.badge.loading', true);
        LingoLinq.store.findRecord('badge', _this.get('model.badge.id')).then(function(b) {
          _this.set('model.badge', b);
        }, function() {
          _this.set('model.badge.error', true);
        });
      } else {
        _this.get('model.badge').reload();
      }
    }
    const list = [];
    for (let idx = 0; idx < 80; idx++) {
      list.push({
        style: htmlSafe('top: ' + (Math.random() * 200) + 'px; left: ' + (Math.random() * 100) + '%;')
      });
    }
    this.set('confettis', list);
  },

  user_name: computed('model.badge.user_name', function() {
    if (!this.get('model.badge.user_name')) {
      return i18n.t('the_user', 'the user');
    }
    return this.get('model.badge.user_name');
  }),

  load_user_badges: observer('user_goals_and_badges', function() {
    const _this = this;
    if (_this.get('user_goals_and_badges')) {
      const user_id = _this.get('model.badge.user_id') || _this.get('model.user_id');
      if (!_this.get('user_goals')) {
        _this.set('user_goals', { loading: true });
        _this.get('store').query('goal', { user_id: user_id }).then(function(goals) {
          _this.set('user_goals', goals);
        }, function() {
          _this.set('user_goals', { error: true });
        });
      }
      if (!_this.get('user_badges')) {
        _this.set('user_badges', { loading: true });
        _this.get('store').query('badge', { user_id: user_id, earned: true }).then(function(badges) {
          _this.set('user_badges', badges);
        }, function() {
          _this.set('user_badges', { error: true });
        });
      }
    }
  }),

  actions: {
    close() {
      this.get('modal').close();
    },
    opening() {},
    closing() {},
    user_badges() {
      this.set('user_goals_and_badges', true);
    },
    show_badge(badge_id) {
      if (badge_id) {
        this.set('model.badge', { id: badge_id });
        this.load_badge();
      }
      this.set('user_goals_and_badges', false);
    },
    show_goal(goal_id) {
      const _this = this;
      _this.get('store').query('badge', { user_id: _this.get('model.badge.user_id'), goal_id: goal_id }).then(function(badges) {
        badges = badges.map(function(b) { return b; });
        if (badges.length > 0) {
          _this.set('model.badge', { id: badges[0].get('id') });
          _this.load_badge();
          _this.set('user_goals_and_badges', false);
        }
      });
    },
    new_goal() {
      const _this = this;
      const user_id = _this.get('model.badge.user_id');
      _this.get('store').findRecord('user', user_id).then(function(user) {
        modal.open('new-goal', { user: user });
      });
    },
    modeling_ideas() {
      modal.open('modals/modeling-ideas', { speak_mode: true, users: [this.appState.get('referenced_user')] });
    }
  }
});
