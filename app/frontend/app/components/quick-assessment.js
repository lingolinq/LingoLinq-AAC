import Component from '@ember/component';
import { inject as service } from '@ember/service';
import { computed } from '@ember/object';
import modal from '../utils/modal';
import persistence from '../utils/persistence';
import stashes from '../utils/_stashes';
import i18n from '../utils/i18n';

/**
 * Quick Assessment modal (Phase 2).
 */
export default Component.extend({
  modal: service('modal'),
  store: service('store'),
  tagName: '',

  init() {
    this._super(...arguments);
    const modalService = this.get('modal');
    const template = 'quick-assessment';
    const options = (modalService && modalService.getSettingsFor && modalService.getSettingsFor(template)) ||
                    (modalService && modalService.settingsFor && modalService.settingsFor[template]) ||
                    this.get('model') || {};
    this.set('model', options);
  },

  didInsertElement() {
    this._super(...arguments);
    if (this.get('model.user')) {
      if (this.get('model.user').load_active_goals) {
        this.get('model.user').load_active_goals();
      } else {
        const _this = this;
        this.get('store').findRecord('user', this.get('model.user.id')).then(function(u) {
          _this.set('model.user', u);
          u.load_active_goals();
        });
      }
    }
    this.reset();
    this.set('goal_id', this.get('model.goal.id'));
    this.set('description', this.get('model.goal.summary'));
  },

  reset() {
    this.set('description', '');
    this.set('tallies', []);
    this.set('totals', {
      correct: 0,
      incorrect: 0
    });
  },

  goal_options: computed('model.user.active_goals', function() {
    const res = [];
    if ((this.get('model.user.active_goals') || []).length > 0) {
      this.get('model.user.active_goals').forEach(function(goal) {
        res.push({ id: goal.get('id'), name: goal.get('summary') });
      });
      res.push({ id: '', name: i18n.t('clear_assessment_type', "[ Clear Assessment Type ]") });
    }
    return res;
  }),

  add_tally(correct) {
    const timestamp = Date.now() / 1000;
    const tallies = this.get('tallies');
    tallies.pushObject({
      timestamp: timestamp,
      correct: correct
    });
    if (correct) {
      this.set('totals.correct', this.get('totals.correct') + 1);
    } else {
      this.set('totals.incorrect', this.get('totals.incorrect') + 1);
    }
  },

  actions: {
    close() {
      this.get('modal').close();
    },
    opening() {},
    closing() {},
    plus_minus(direction, key) {
      let val = parseInt(this.get(key), 10);
      if (direction === 'plus') {
        val++;
      } else {
        val--;
      }
      val = Math.max(0, val);
      this.set(key, val);
      this.set('totals.modified', true);
    },
    correct() {
      this.add_tally(true);
    },
    incorrect() {
      this.add_tally(false);
    },
    goal_action(id) {
      if (id === '') {
        this.set('goal_id', null);
        this.set('description', '');
      } else {
        const goal = (this.get('model.user.active_goals') || []).find(function(g) {
          return g.get('id') === id;
        });
        if (goal) {
          this.set('goal_id', goal.get('id'));
          this.set('description', goal.get('summary'));
        } else {
          this.set('goal_id', null);
          this.set('description', '');
        }
      }
    },
    record_assessment() {
      const description = this.get('description') || (window.moment && window.moment().format('MMMM Do YYYY, h:mm a'));
      const assessment = {
        start_timestamp: null,
        end_timestamp: null,
        description: description,
        tallies: this.get('tallies'),
        totals: this.get('totals')
      };
      stashes.track_daily_event('quick_assessments');
      if (persistence.get('online')) {
        const log = this.get('store').createRecord('log', {
          user_id: this.get('model.user.id'),
          goal_id: this.get('goal_id'),
          assessment: assessment
        });
        const _this = this;
        log.save().then(function() {
          modal.close(true);
        }, function() {});
      } else {
        stashes.log_event(assessment, this.get('model.user.id'));
        stashes.push_log(true);
        modal.close();
      }
    }
  }
});
