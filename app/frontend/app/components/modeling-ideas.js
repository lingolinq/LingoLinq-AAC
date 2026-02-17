import Component from '@ember/component';
import { inject as service } from '@ember/service';
import { computed } from '@ember/object';
import { set as emberSet, get as emberGet } from '@ember/object';
import { later as runLater } from '@ember/runloop';
import { A } from '@ember/array';
import Ember from 'ember';
import modal from '../utils/modal';
import app_state from '../utils/app_state';
import stashes from '../utils/_stashes';
import i18n from '../utils/i18n';

/**
 * Modeling Ideas Modal Component
 *
 * Converted from modals/modeling-ideas template/controller to component.
 */
export default Component.extend({
  modal: service('modal'),
  router: service('router'),
  tagName: '',

  init() {
    this._super(...arguments);
    const modalService = this.get('modal');
    const template = 'modals/modeling-ideas';
    const options = (modalService && modalService.getSettingsFor && modalService.getSettingsFor(template)) ||
                    (modalService && modalService.settingsFor && modalService.settingsFor[template]) ||
                    this.get('model') || {};
    this.set('model', options);
  },

  user_activities: computed('activities', 'model.users', 'force_intro', 'weekhour', function() {
    let res = [];
    let empty_num = 0;
    if (this.get('force_intro') || !app_state.get('currentUser.preferences.progress.modeling_ideas_viewed')) {
      res.push({ intro: true });
      empty_num++;
    }
    const user_ids = (this.get('model.users') || []).map(function(u) { return emberGet(u, 'id'); });
    let middles = [];
    let follow_ups = [];
    const skips = {};
    const lists = [this.get('activities.local_log') || [], this.get('activities.log') || []];
    const attempt_timeout_cutoff = parseInt(window.moment().add(-1, 'week').format('X'), 10);
    const attempt_cooloff = parseInt(window.moment().add(-1, 'day').format('X'), 10);
    lists.forEach(function(list) {
      list.forEach(function(log) {
        if (log.modeling_activity_id) {
          const activity_user_ids = [].concat(log.modeling_user_ids || []).concat(log.related_user_ids || []);
          let all_found = true;
          user_ids.forEach(function(id) { if (activity_user_ids.indexOf(id) === -1) { all_found = false; } });
          if (all_found) {
            if (log.modeling_action === 'dismiss' || log.modeling_action === 'complete') {
              skips[log.modeling_activity_id] = true;
            } else if (log.modeling_action === 'attempt' && log.timestamp < attempt_timeout_cutoff) {
              skips[log.modeling_activity_id] = true;
            } else if ((log.modeling_action === 'attempt' && log.timestamp > attempt_timeout_cutoff) || log.timestamp < attempt_cooloff) {
              follow_ups.push(log);
            }
          }
        }
      });
    });
    follow_ups = A(follow_ups).sortBy('timestamp');
    (this.get('activities.list') || []).forEach(function(a) {
      emberSet(a, 'real', true);
      const types = {};
      types[a.type] = true;
      emberSet(a, 'types', types);
      let valids = 0;
      a.user_ids.forEach(function(id) { if (user_ids.indexOf(id) !== -1) { valids++; } });
      if (valids > 0 && !skips[emberGet(a, 'id')]) {
        if (follow_ups.find(function(log) { return log.modeling_activity_id === emberGet(a, 'id'); })) {
          emberSet(a, 'follow_up', true);
          res.push(a);
          empty_num++;
        } else {
          if (user_ids.length > 1) {
            emberSet(a, 'matching_users', valids);
          }
          middles.push(a);
        }
      }
    });
    if (middles.length > 0 && !app_state.get('currentUser.preferences.progress.modeling_ideas_target_words_reviewed')) {
      res.push({ target_words: true });
      empty_num++;
    }
    const weekhour = this.get('weekhour');
    const units = 3;
    const chunks = Math.max(1, Math.floor(middles.length / units));
    let index = weekhour % chunks;
    const cutoff_chunk = Math.floor(chunks / 2);
    let offset = index * units * 2;
    if (index > 0 && index >= cutoff_chunk) {
      offset = ((index - cutoff_chunk) * units * 2) + units;
    }
    const check_word = app_state.get('speak_mode_modeling_ideas.word');
    let for_word = [];
    if (app_state.get('speak_mode_modeling_ideas.enabled')) {
      for_word = middles.filter(function(a) { return a.word === check_word; });
    }
    middles = for_word.concat(middles.slice(offset, offset + 8)).uniq().slice(0, 8);
    res = res.concat(middles);
    if (res.length === empty_num) {
      let none_premium = true;
      (this.get('model.users') || []).forEach(function(u) { if (emberGet(u, 'premium') || emberGet(u, 'currently_premium')) { none_premium = false; } });
      if (none_premium) {
        res.push({ none_premium: true });
      } else {
        res.push({ empty: true });
      }
    }
    return res;
  }),

  user_words: computed('activities', 'model.users', function() {
    const res = [];
    const text_reasons = {
      fallback: i18n.t('starter_word', "Starter Word"),
      primary_words: i18n.t('goal_target', "Goal Target"),
      primary_modeled_words: i18n.t('goal_target', "Goal Target"),
      secondary_words: i18n.t('goal_target', "Goal Target"),
      secondary_modeled_words: i18n.t('goal_target', "Goal Target"),
      popular_modeled_words: i18n.t('frequently_modeled_words', "Frequently-Modeled"),
      infrequent_core_words: i18n.t('infrequent_core', "Rarely-Used Core"),
      emergent_words: i18n.t('emergent', "Emergent Use"),
      dwindling_words: i18n.t('dwindling', "Dwindling Use"),
      infrequent_home_words: i18n.t('infrequence_home', "Rare but on Home Board")
    };
    const user_ids = (this.get('model.users') || []).map(function(u) { return emberGet(u, 'id'); });
    (this.get('activities.words') || []).forEach(function(w) {
      let valids = 0;
      w.user_ids.forEach(function(id) { if (user_ids.indexOf(id) !== -1) { valids++; } });
      if (valids > 0) {
        if (user_ids.length > 1) {
          emberSet(w, 'matching_users', valids);
        }
        emberSet(w, 'text_reasons', (w.reasons || []).map(function(r) { return text_reasons[r]; }).uniq().compact().join(', '));
        res.push(w);
      }
    });
    return res;
  }),

  show_words_list: computed('current_activity.real', 'current_activity.target_words', function() {
    return !!(this.get('current_activity.real') || this.get('current_activity.target_words'));
  }),

  words_list: computed('user_words', function() {
    return (this.get('user_words') || []).map(function(w) { return w.word; }).join(', ');
  }),

  current_activity: computed('activity_index', 'user_activities', function() {
    const idx = this.get('activity_index') || 0;
    const res = (this.get('user_activities') || [])[idx];
    if (res && emberGet(res, 'image.image_url')) {
      const img = emberGet(res, 'image.image_url');
      emberSet(res, 'image.image_url', Ember.templateHelpers.path('images/blank.gif'));
      runLater(function() {
        emberSet(res, 'image.image_url', img);
      });
    }
    return res;
  }),

  no_next: computed('activity_index', 'user_activities', function() {
    return !((this.get('activity_index') + 1) < this.get('user_activities.length'));
  }),

  no_previous: computed('activity_index', 'user_activities', function() {
    return !!(this.get('activity_index') === 0 || this.get('user_activities.length') === 0 || !this.get('user_activities.length'));
  }),

  feedback_given: computed('current_activity.will_attempt', 'current_activity.dismissed', function() {
    return this.get('current_activity.will_attempt') || this.get('current_activity.dismissed');
  }),

  actions: {
    close() {
      this.get('modal').close();
    },
    opening() {
      this.get('modal').setComponent(this);
      const users = this.get('model.users');
      stashes.track_daily_event('modeling_ideas');
      let any_premium = false;
      (users || []).forEach(function(u) {
        if (emberGet(u, 'premium') || emberGet(u, 'currently_premium')) {
          any_premium = true;
        }
      });
      if (!any_premium) {
        let user_name = null;
        if (users && users.length === 1) { user_name = emberGet(users[0], 'user_name'); }
        modal.open('premium-required', { user_name: user_name, action: 'modeling-ideas' });
        return;
      }
      const user = app_state.get('currentUser');
      const _this = this;
      _this.set('activity_index', 0);
      const today = new Date();
      const now = today.getTime();
      let weekhour = (today.getDay() * 24) + today.getHours();
      const date = new Date(today);
      date.setHours(0, 0, 0, 0);
      date.setDate(date.getDate() + 3 - (date.getDay() + 6) % 7);
      const week1 = new Date(date.getFullYear(), 0, 4);
      const weeknum = 1 + Math.round(((date.getTime() - week1.getTime()) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7);
      weekhour = weekhour + weeknum;
      if (_this.get('last_opening') && (now - _this.get('last_opening') < (5 * 1000 * 60))) {
        _this.set('weekhour', _this.get('last_weekhour') || weekhour);
      } else {
        _this.set('weekhour', weekhour);
      }
      _this.set('last_weekhour', _this.get('weekhour'));
      _this.set('last_opening', now);
      _this.set('show_target_words', false);
      _this.set('force_intro', false);
      if (user) {
        _this.set('activities', { loading: true });
        user.load_word_activities().then(function(activities) {
          _this.set('activities', activities);
        }, function() {
          _this.set('activities', { error: true });
        });
      } else {
        _this.set('activities', { error: true });
      }
    },
    closing() {},
    next() {
      const on_target_words = this.get('current_activity.target_words');
      this.set('activity_index', Math.min(this.get('user_activities.length') - 1, this.get('activity_index') + 1));
      this.set('show_target_words', false);
      const user = app_state.get('currentUser');
      if (user && !user.get('preferences.progress.modeling_ideas_viewed')) {
        const progress = user.get('preferences.progress') || {};
        progress.modeling_ideas_viewed = true;
        user.set('preferences.progress', progress);
        user.save().then(null, function() {});
      } else if (on_target_words && user) {
        const progress = user.get('preferences.progress') || {};
        progress.modeling_ideas_target_words_reviewed = true;
        user.set('preferences.progress', progress);
        user.save().then(null, function() {});
      }
    },
    previous() {
      this.set('activity_index', Math.max(0, this.get('activity_index') - 1));
      this.set('show_target_words', false);
    },
    target_words() {
      this.set('show_target_words', !this.get('show_target_words'));
    },
    show_intro() {
      this.set('force_intro', true);
      this.set('activity_index', 0);
    },
    attempt() {
      app_state.get('currentUser').log_word_activity({
        modeling_activity_id: this.get('current_activity.id'),
        modeling_word: this.get('current_activity.word'),
        modeling_locale: this.get('current_activity.locale'),
        modeling_user_ids: (this.get('model.users') || []).map(function(u) { return emberGet(u, 'id'); }),
        modeling_action: 'attempt'
      });
      this.set('current_activity.follow_up', false);
      this.set('current_activity.will_attempt', true);
      this.set('current_activity.dismissed', false);
      this.set('current_activity.completed', false);
      this.set('current_activity.complete_score', null);
    },
    dismiss() {
      app_state.get('currentUser').log_word_activity({
        modeling_activity_id: this.get('current_activity.id'),
        modeling_word: this.get('current_activity.word'),
        modeling_locale: this.get('current_activity.locale'),
        modeling_user_ids: (this.get('model.users') || []).map(function(u) { return emberGet(u, 'id'); }),
        modeling_action: 'dismiss'
      });
      this.set('current_activity.will_attempt', false);
      this.set('current_activity.dismissed', true);
      this.set('current_activity.completed', false);
      this.set('current_activity.complete_score', null);
    },
    complete(score) {
      app_state.get('currentUser').log_word_activity({
        modeling_activity_id: this.get('current_activity.id'),
        modeling_word: this.get('current_activity.word'),
        modeling_locale: this.get('current_activity.locale'),
        modeling_user_ids: (this.get('model.users') || []).map(function(u) { return emberGet(u, 'id'); }),
        modeling_action: 'complete',
        modeling_action_score: score
      });
      this.set('current_activity.will_attempt', false);
      this.set('current_activity.dismissed', false);
      this.set('current_activity.completed', true);
      const score_hash = {};
      score_hash['score_' + score] = true;
      this.set('current_activity.complete_score', score_hash);
    },
    video(attempting) {
      const url = this.get('current_activity.url');
      const youtube_regex = (/(?:https?:\/\/)?(?:www\.)?youtu(?:be\.com\/watch\?(?:.*?&(?:amp;)?)?v=|\.be\/)([\w \-]+)(?:&(?:amp;)?[\w\?=]*)?/);
      const youtube_match = url && url.match(youtube_regex);
      const youtube_id = youtube_match && youtube_match[1];
      if (youtube_id) {
        if (attempting) {
          this.send('attempt');
        }
        modal.open('inline-video', { video: { type: 'youtube', id: youtube_id } });
      }
    },
    book(attempting) {
      const act = this.get('current_activity');
      if (attempting) {
        this.send('attempt');
      }
      modal.open('inline-book', { url: act.url });
    },
    make_goal() {
      const _this = this;
      modal.open('new-goal', { users: _this.get('model.users') }).then(function(res) {
        if (res && res.get('id') && res.get('set_badges')) {
          const userName = (_this.get('model.users') && _this.get('model.users')[0]) ? emberGet(_this.get('model.users')[0], 'user_name') : null;
          if (userName) {
            _this.get('router').transitionTo('user.goal', userName, res.get('id'));
          }
        } else if (res) {
          modal.success(i18n.t('goal_added', "Goal added! Check back with Modeling Ideas soon to see updated ideas based on the new goal."));
        }
      }, function() {});
    },
    badges() {
      if (this.get('model.users.length') === 1) {
        modal.open('badge-awarded', { speak_mode: true, user_id: emberGet(this.get('model.users')[0], 'id') });
      }
    }
  }
});
