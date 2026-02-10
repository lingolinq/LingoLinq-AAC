import Component from '@ember/component';
import { inject as service } from '@ember/service';
import { set as emberSet, get as emberGet } from '@ember/object';
import { observer, computed } from '@ember/object';
import modal from '../utils/modal';
import i18n from '../utils/i18n';
import RSVP from 'rsvp';
import stashes from '../utils/_stashes';

/**
 * New Goal modal (Phase 2).
 */
export default Component.extend({
  modal: service('modal'),
  store: service('store'),
  tagName: '',

  init() {
    this._super(...arguments);
    const modalService = this.get('modal');
    const template = 'new-goal';
    const options = (modalService && modalService.getSettingsFor && modalService.getSettingsFor(template)) ||
                    (modalService && modalService.settingsFor && modalService.settingsFor[template]) ||
                    this.get('model') || {};
    this.set('model', options);
  },

  didInsertElement() {
    this._super(...arguments);
    this.set('goal', this.get('model.goal') || this.get('store').createRecord('goal'));
    if (!this.get('goal.id') && window.moment) {
      this.set('goal.expires', window.moment().add(2, 'month').format('YYYY-MM-DD'));
    }
    this.set('error', false);
    this.set('saving', false);
    this.set('browse_goals', false);
    this.set('selected_goal', null);
    if (this.get('model.browse')) {
      this.set('browse_goals', true);
      this.set('selected_goal', null);
      this.load_goals();
    }
    if (this.get('model.users.length') === 1) {
      this.set('model.user', this.get('model.users')[0]);
      this.set('model.users', null);
    }
    if (this.get('model.users')) {
      this.get('model.users').forEach(function(u) {
        emberSet(u, 'not_premium', !emberGet(u, 'premium') && !emberGet(u, 'currently_premium'));
      });
      this.set('goal.simple_type', 'words');
    } else if (!this.get('model.user.goal')) {
      this.set('goal.primary', true);
    }
  },

  simple_types: [
    { name: i18n.t('select_simple_goal_type', "[ Select a Goal Type ]"), id: '' },
    { name: i18n.t('use_for_communication', "Increase Communication Attempts"), id: 'buttons' },
    { name: i18n.t('use_target_words', "Try to Use a List of Target Words"), id: 'words' },
    { name: i18n.t('modeling_for_communication', "Work on Modeling for the Communicator"), id: 'modeling' },
    { name: i18n.t('custom_goal', "I Will Define My Own Goal"), id: 'custom' }
  ],

  goal_type: computed('goal.simple_type', function() {
    const type = this.get('goal.simple_type');
    if (!type) { return null; }
    const res = {};
    res[type] = true;
    if (type === 'buttons' || type === 'modeling') {
      res.instance_count = true;
    }
    if (type === 'words' || type === 'modeling') {
      res.strings_list = true;
    }
    return res;
  }),

  single_user: computed('model.user', 'model.users', 'model.users.@each.add_goal', function() {
    return !!this.get('model.user') || (this.get('model.users') || []).filter(function(u) {
      return !!emberGet(u, 'add_goal');
    }).length === 1;
  }),

  has_simple_content: computed(
    'goal.simple_type',
    'goal.strings_list',
    'goal.instance_count',
    function() {
      if (this.get('goal.simple_type') === 'words') {
        return (this.get('goal.strings_list') || '').length > 0;
      } else if (this.get('goal.simple_type') === 'buttons') {
        return parseInt(this.get('goal.instance_count'), 10) > 0;
      } else if (this.get('goal.simple_type') === 'modeling') {
        return (this.get('goal.strings_list') || '').length > 0 || parseInt(this.get('goal.instance_count'), 10) > 0;
      }
      return true;
    }
  ),

  goal_simple_action: computed('goal.simple_type', function() {
    const type = this.get('goal.simple_type');
    if (type === 'buttons') { return i18n.t('button_hits', "button hits"); }
    if (type === 'words') { return i18n.t('word_usages', "times used"); }
    if (type === 'modeling') { return i18n.t('modeling_hits', "modeling hits"); }
    return i18n.t('events', "events");
  }),

  set_defaults_by_simple_type: observer(
    'goal.simple_type',
    'goal.strings_list',
    'goal.summary',
    'goal.instance_count',
    function(obj, change) {
      if (change === 'goal.summary' && !this.get('ignore_summary_change')) {
        this.set('custom_summary', true);
      }
      if (change === 'goal.simple_type') { this.set('custom_summary', false); }
      if (this.get('custom_summary')) { return; }
      this.set('ignore_summary_change', true);
      if (this.get('goal.simple_type') === 'buttons') {
        const instance_count = this.get('goal.instance_count');
        const extra = instance_count ? (' ' + instance_count + ' buttons per day!') : '';
        this.set('goal.summary', 'Keep Talking!' + extra);
      } else if (this.get('goal.simple_type') === 'words') {
        const words = this.get('goal.strings_list') || '[words]';
        this.set('goal.summary', 'Look for times to say: ' + words);
      } else if (this.get('goal.simple_type') === 'modeling') {
        const words = this.get('goal.strings_list');
        if (words) {
          this.set('goal.summary', 'Try to model: ' + words);
        } else {
          const instance_count = this.get('goal.instance_count');
          const extra = instance_count ? (' ' + instance_count + ' buttons per day!') : '';
          this.set('goal.summary', 'More Modeling!' + extra);
        }
      }
      this.set('ignore_summary_change', false);
    }
  ),

  save_disabled: computed('pending_save', 'browse_goals', 'selected_goal', 'saving', function() {
    return this.get('pending_save') || (this.get('browse_goals') && !this.get('selected_goal')) || this.get('saving');
  }),

  pending_save: computed('video_pending', function() {
    return !!this.get('video_pending');
  }),

  load_goals() {
    const _this = this;
    _this.set('goals', { loading: true });
    this.get('store').query('goal', { template_header: true }).then(function(data) {
      _this.set('goals', data.map(function(i) { return i; }));
      _this.set('goals.meta', data.meta);
    }, function() {
      _this.set('goals', { error: true });
    });
  },

  actions: {
    close() {
      this.get('modal').close();
    },
    opening() {},
    closing() {},
    updateGoalSimpleType(value) {
      this.set('goal.simple_type', value);
    },
    save_goal() {
      const _this = this;
      let goal = this.get('goal');
      let users = [];
      if (this.get('model.user')) {
        users = [this.get('model.user')];
      }
      if (this.get('model.users')) {
        users = this.get('model.users').filter(function(u) { return emberGet(u, 'add_goal'); });
      }
      if (this.get('selected_goal')) {
        goal = this.get('store').createRecord('goal');
        goal.set('template_id', this.get('selected_goal.id'));
        goal.set('primary', this.get('selected_goal.user_primary'));
        if (!goal.get('template_id')) {
          goal.set('expires', this.get('goal.expires'));
        }
      }
      if (goal.get('simple_type') && goal.get('simple_type') !== 'custom') {
        const type = goal.get('simple_type');
        if (type === 'buttons') {
          if (!goal.get('description')) {
            goal.set('description', i18n.t('buttons_explainer', "Consistent usage is important! Communication isn't something that just happens in one location, and for communicators to get proficient using their device they need to have it out and available throughout the day, in different locations and situations."));
          }
          if (goal.get('instance_count')) {
            const count = parseInt(goal.get('instance_count'), 10) || 3;
            goal.set('assessment_badge', {
              assessment: true,
              instance_count: count.toString(),
              simple_type: 'buttons_per_day'
            });
          }
        } else if (type === 'words') {
          const strings = goal.get('strings_list');
          if (!goal.get('description')) {
            goal.set('description', i18n.t('words_explainer', "Right now you have a goal to focus on the following: " + strings + ". Try to think of different ways to use these words, and different situations where they might come up. There are lots of activities that can be targeted toward specific words of phrases if you get creative. Don't forget to model these words as well so you can show the communicator examples of how they could use the words on their device!"));
          }
          if (goal.get('instance_count') && strings) {
            const count = parseInt(goal.get('instance_count'), 10) || 3;
            goal.set('assessment_badge', {
              assessment: true,
              words_list: strings,
              watch_total: count.toString(),
              simple_type: 'words_per_day'
            });
          }
          goal.set('ref_data', { words_list: strings });
        } else if (type === 'modeling') {
          const strings = goal.get('strings_list');
          if (!goal.get('description')) {
            goal.set('description', i18n.t('modeling_explainer', "Modeling is the process of showing a communicator how they could say things user their communication device. Just like with spoken communication, it often takes a lot of modeled communication before a communicator gets comfortable on their own, so look for many opportunities to model in different environments and times of day."));
          }
          if (goal.get('instance_count')) {
            const count = parseInt(goal.get('instance_count'), 10) || 3;
            goal.set('assessment_badge', {
              assessment: true,
              instance_count: count.toString(),
              modeled_words_list: strings,
              watch_total: count.toString(),
              simple_type: 'modeling_per_day'
            });
          }
          goal.set('ref_data', { modeled_words_list: strings });
        }
      }
      goal.set('active', true);
      if (goal.get('expires')) {
        goal.set('expires', window.moment(goal.get('expires'))._d);
      }
      stashes.track_daily_event('goals');
      const promises = [];
      users.forEach(function(u) {
        const g = _this.get('store').createRecord('goal', goal.toJSON());
        g.set('user_id', emberGet(u, 'id'));
        promises.push(g.save());
      });
      if (_this.get('model.unit')) {
        goal.set('unit_id', _this.get('model.unit.id'));
        promises.push(goal.save());
      }
      goal.set('user_id', this.get('model.user.id'));
      _this.set('saving', true);
      _this.set('error', false);
      RSVP.all_wait(promises).then(function() {
        _this.set('saving', false);
        modal.close(goal);
      }, function() {
        _this.set('saving', false);
        _this.set('error', true);
      });
    },
    video_ready(id) {
      this.set('video_pending', false);
      if (this.get('goal')) {
        this.set('goal.video_id', id);
      }
    },
    video_not_ready() {
      this.set('video_pending', false);
      if (this.get('goal')) {
        this.set('goal.video_id', null);
      }
    },
    video_pending() {
      this.set('video_pending', true);
      if (this.get('goal')) {
        this.set('goal.video_id', null);
      }
    },
    browse_goals() {
      this.set('browse_goals', !this.get('browse_goals'));
      this.set('selected_goal', null);
      this.load_goals();
    },
    select_goal(goal) {
      this.set('selected_goal', goal);
    },
    clear_selected_goal() {
      this.set('selected_goal', null);
    },
    reset_video() {
      this.set('model.video', null);
    },
    clear_expires() {
      this.set('goal.expires', null);
    },
    more_goals() {
      if (this.get('goals.meta')) {
        const _this = this;
        _this.set('goals.loading', true);
        _this.set('goals.error', true);
        this.get('store').query('goal', {
          template_header: true,
          per_page: this.get('goals.meta.per_page'),
          offset: this.get('goals.meta.next_offset')
        }).then(function(list) {
          let goals = _this.get('goals') || [];
          goals = goals.concat(list.map(function(i) { return i; }));
          _this.set('goals', goals);
          _this.set('goals.meta', list.meta);
          _this.set('goals.loading', false);
        }, function() {
          _this.set('goals.loading', false);
          _this.set('goals.error', true);
        });
      }
    }
  }
});
