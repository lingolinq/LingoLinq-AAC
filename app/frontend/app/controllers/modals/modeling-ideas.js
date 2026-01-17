import Ember from 'ember';
import modal from '../../utils/modal';
import app_state from '../../utils/app_state';
import stashes from '../../utils/_stashes';
import i18n from '../../utils/i18n';
import { set as emberSet, get as emberGet } from '@ember/object';
import { later as runLater } from '@ember/runloop';
import { computed } from '@ember/object';
import { inject as service } from '@ember/service';

export default modal.ModalController.extend({
  appState: service('app-state'),
  modal: service(),

  opening: function() {
    var users = this.get('model.users');

    stashes.track_daily_event('modeling_ideas');
    var any_premium = false;
    (users || []).forEach(function(u) {
      if(emberGet(u, 'premium') || emberGet(u, 'currently_premium')) {
        any_premium = true;
      }
    });
    if(!any_premium) {
      var user_name = null;
      if(users && users.length == 1) { user_name = emberGet(users[0], 'user_name'); }
      this.modal.open('premium-required', {user_name: user_name, action: 'modeling-ideas'});
      return;
    }

    var user = this.appState.get('currentUser');
    var _this = this;
    _this.set('activity_index', 0);

    var today = (new Date());
    var now = today.getTime();
    var weekhour = ((new Date()).getDay() * 24) + (new Date()).getHours();

    var date = today;
    date.setHours(0, 0, 0, 0);
    // Thursday in current week decides the year.
    date.setDate(date.getDate() + 3 - (date.getDay() + 6) % 7);
    // January 4 is always in week 1.
    var week1 = new Date(date.getFullYear(), 0, 4);
    // Adjust to Thursday in week 1 and count number of weeks from date to week1.
    var weeknum = 1 + Math.round(((date.getTime() - week1.getTime()) / 86400000
                          - 3 + (week1.getDay() + 6) % 7) / 7);

    // We increment weekhour by week number to prevent getting the same suggestions
    // Every week at the same time of the week.
    weekhour = weekhour + weeknum;

    // If opened less than five minutes since last time, keep the previous weekhour
    // Otherwise just use the current weekhour, whatever it may be
    if(_this.get('last_opening') && (now - _this.get('last_opening') < (5 * 1000 * 60))) {
      _this.set('weekhour', _this.get('last_weekhour') || weekhour);
    } else {
      _this.set('weekhour', weekhour);
    }
    _this.set('last_weekhour', _this.get('weekhour'));
    _this.set('last_opening', now);


    _this.set('show_target_words', false);
    _this.set('force_intro', false);
    if(user) {
      _this.set('activities', {loading: true});
      user.load_word_activities().then(function(activities) {
        _this.set('activities', activities);
      }, function(err) {
        _this.set('activities', {error: true});
      });
    } else {
      _this.set('activities', {error: true});
    }
  },
  user_activities: computed('activities', 'model.users', 'force_intro', function() {
    var res = [];

    var empty_num = 0;
    if(this.get('force_intro') || !this.appState.get('currentUser.preferences.progress.modeling_ideas_viewed')) {
      res.push({intro: true});
      empty_num++;
    }

    var user_ids = (this.get('model.users') || []).mapBy('id');
    var middles = [];
    var follow_ups = [];
    var skips = {};
    // For logs: skip if it's been dismissed, or if it's been attempted less than two weeks ago, 
    // or if it's been completed -- but only if true for the all of the current user_ids.
    var lists = [this.get('activities.local_log') || [], this.get('activities.log') || []];
    var attempt_timeout_cutoff = parseInt(window.moment().add(-1, 'week').format('X'), 10);
    var attempt_cooloff = parseInt(window.moment().add(-1, 'day').format('X'), 10);
    lists.forEach(function(list) {
      list.forEach(function(log) {
        if(log.modeling_activity_id) {
          var activity_user_ids = [].concat(log.modeling_user_ids || []).concat(log.related_user_ids || []);
          console.log("marked for",log.modeling_activity_id, activity_user_ids);
          var all_found = true;
          user_ids.forEach(function(id) { if(activity_user_ids.indexOf(id) == -1) { all_found = false; } });
          if(all_found) {
            if(log.modeling_action == 'dismiss' || log.modeling_action == 'complete') {
              skips[log.modeling_activity_id] = true;
            } else if(log.modeling_action == 'attempt' && log.timestamp < attempt_timeout_cutoff) {
              skips[log.modeling_activity_id] = true;
            } else if(log.modeling_action == 'attempt' && log.timestamp > attempt_timeout_cutoff || log.timestamp < attempt_cooloff) {
              follow_ups.push(log);
            }
          }
        }  
      });
    })
    follow_ups = follow_ups.sortBy('timestamp');
    var found = null;
    (this.get('activities.list') || []).forEach(function(a) {
      emberSet(a, 'real', true);
      var types = {};
      types[a.type] = true;
      emberSet(a, 'types', types);
      var valids = 0;
      a.user_ids.forEach(function(id) { if(user_ids.indexOf(id) !== -1) { valids++; } });
      if(valids > 0 && !skips[emberGet(a, 'id')]) {
        if(follow_ups.find(function(log) { return log.modeling_activity_id == emberGet(a, 'id') })) {
          emberSet(a, 'follow_up', true);
          res.push(a)
          empty_num++;
        } else {
          if(user_ids.length > 1) {
            emberSet(a, 'matching_users', valids);
          }
          middles.push(a);
        }
      }
    });
    if(middles.length > 0 && !this.appState.get('currentUser.preferences.progress.modeling_ideas_target_words_reviewed')) {
      res.push({target_words: true});
      empty_num++;
    }

    var weekhour = this.get('weekhour');
    var units = 3;
    var chunks = Math.max(1, Math.floor(middles.length / units));
    // with 25 records:
    // total chunks: 8
    // 0 => 0-4, 1 => 6-10, 2 => 12-16, 3 => 18-22, 4 => 3-7, 5 => 9-13, 6 => 15-19, 7 => 21-25
    // with 2 records:
    // total chunks: 1
    // 0 => 0-2
    // with 27 records:
    // total chunks: 9
    // 0 => 0-4, 1 => 6-10, 2 => 12-16, 3 => 18-22, 4 => 24-27, 5 => 3-7, 6 => 9-13, 7 => 15-19, 8 => 21-25
    var index = weekhour % chunks;
    var cutoff_chunk = Math.floor(chunks / 2);
    var offset = index * units * 2
    if(index > 0 && index >= cutoff_chunk) {
      offset = ((index - cutoff_chunk) * units * 2) + units;
    }
    var check_word = this.appState.get('speak_mode_modeling_ideas.word');
    var for_word = [];
    if(this.appState.get('speak_mode_modeling_ideas.enabled')) {
      for_word = middles.filter(function(a) { return a.word == check_word; });
    }
    middles = for_word.concat(middles.slice(offset, offset + 8)).uniq().slice(0, 8);
    res = res.concat(middles);

    if(res.length == empty_num) {
      var none_premium = true;
      (this.get('model.users') || []).forEach(function(u) { if(emberGet(u, 'premium') || emberGet(u, 'currently_premium')) { none_premium = false; } });
      if(none_premium) {
        res.push({none_premium: true});
      } else {
        res.push({empty: true});
      }
    }
    return res;
  }),
  user_words: computed('activities', 'model.users', function() {
    var res = [];
    var text_reasons = {
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
    var user_ids = (this.get('model.users') || []).mapBy('id');
    (this.get('activities.words') || []).forEach(function(w) {
      var valids = 0;
      w.user_ids.forEach(function(id) { if(user_ids.indexOf(id) !== -1) { valids++; } });
      if(valids > 0) {
        if(user_ids.length > 1) {
          emberSet(w, 'matching_users', valids);
        }
        emberSet(w, 'text_reasons', w.reasons.map(function(r) { return text_reasons[r]; }).uniq().compact().join(', '));
        res.push(w);
      }
    });
    return res;
  }),
  show_words_list: computed('current_activity.real', 'current_activity.target_words', function() {
    return !!(this.get('current_activity.real') || this.get('current_activity.target_words'));
  }),
  words_list: computed('user_words', function() {
    return (this.get('user_words') || []).mapBy('word').join(', ');
  }),
  current_activity: computed('activity_index', 'user_activities', function() {
    var idx = this.get('activity_index') || 0;
    var res = (this.get('user_activities') || [])[idx];
    if(res && emberGet(res, 'image.image_url')) {
      var img = emberGet(res, 'image.image_url');
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
    return !!(this.get('activity_index') == 0 || this.get('user_activities.length') == 0 || !this.get('user_activities.length'));
  }),
  feedback_given: computed(
    'current_activity.will_attempt',
    'current_activity.dismissed',
    function() {
      return this.get('current_activity.will_attempt') || this.get('current_activity.dismissed');
    }
  ),
  actions: {
    next: function() {
      var on_target_words = this.get('current_activity.target_words');
      this.set('activity_index', Math.min(this.get('user_activities.length') - 1, this.get('activity_index') + 1));
      this.set('show_target_words', false);

      var user = this.appState.get('currentUser');
      if(user && !user.get('preferences.progress.modeling_ideas_viewed')) {
        var progress = user.get('preferences.progress') || {};

        progress.modeling_ideas_viewed = true;
        user.set('preferences.progress', progress);
        user.save().then(null, function() { });
      } else if(on_target_words) {
        var progress = user.get('preferences.progress') || {};

        progress.modeling_ideas_target_words_reviewed = true;
        user.set('preferences.progress', progress);
        user.save().then(null, function() { });
      }
    },
    previous: function() {
      this.set('activity_index', Math.max(0, this.get('activity_index') - 1))
      this.set('show_target_words', false);
    },
    target_words: function() {
      this.set('show_target_words', !this.get('show_target_words'));
    },
    show_intro: function() {
      this.set('force_intro', true);
      this.set('activity_index', 0);
    },
    attempt: function() {
      this.appState.get('currentUser').log_word_activity({
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
    dismiss: function() {
      this.appState.get('currentUser').log_word_activity({
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
    complete: function(score) {
      this.appState.get('currentUser').log_word_activity({
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
      var score_hash = {}; score_hash['score_' + score] = true;
      this.set('current_activity.complete_score', score_hash);
    },
    video: function(attempting) {
      var url = this.get('current_activity.url');

      var youtube_regex = (/(?:https?:\/\/)?(?:www\.)?youtu(?:be\.com\/watch\?(?:.*?&(?:amp;)?)?v=|\.be\/)([\w \-]+)(?:&(?:amp;)?[\w\?=]*)?/);
      var youtube_match = url && url.match(youtube_regex);
      var youtube_id = youtube_match && youtube_match[1];

      if(youtube_id) {
        if(attempting) {
          this.send('attempt');
        }
        this.modal.open('inline-video', {video: {type: 'youtube', id: youtube_id}});
      }
    },
    book: function(attempting) {
      var act = this.get('current_activity');
      if(attempting) {
        this.send('attempt');
      }
      this.modal.open('inline-book', {url: act.url});
    },
    make_goal: function() {
      var _this = this;
      this.modal.open('new-goal', {users: _this.get('model.users') }).then(function(res) {
        if(res && res.get('id') && res.get('set_badges')) {
          _this.transitionToRoute('user.goal', _this.get('model.user_name'), res.get('id'));
        } else if(res) {
          modal.success(i18n.t('goal_added', "Goal added! Check back with Modeling Ideas soon to see updated ideas based on the new goal."));
        }
      }, function() { });
    },
    badges: function() {
      if(this.get('model.users.length') == 1) {
        this.modal.open('badge-awarded', {speak_mode: true, user_id: emberGet(this.get('model.users')[0], 'id')});
      }
      
    }
  }
});
