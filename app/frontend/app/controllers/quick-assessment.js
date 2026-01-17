import modal from '../utils/modal';
import persistence from '../utils/persistence';
import stashes from '../utils/_stashes';
import i18n from '../utils/i18n';
import { computed } from '@ember/object';
import { inject as service } from '@ember/service';

export default modal.ModalController.extend({
  persistence: service(),
  stashes: service(),
  modal: service(),

  opening: function() {
    if(this.get('model.user')) {
      if(this.get('model.user').load_active_goals) {
        this.get('model.user').load_active_goals();
      } else {
        var _this = this;
        this.store.findRecord('user', this.get('model.user.id')).then(function(u) {
          _this.set('model.user', u);
          u.load_active_goals();
        });
      }
    }
    this.reset();
    this.set('goal_id', this.get('model.goal.id'));
    this.set('description', this.get('model.goal.summary'));
  },
  reset: function() {
    this.set('description', '');
    this.set('tallies', []);
    this.set('totals', {
      correct: 0,
      incorrect: 0
    });
  },
  goal_options: computed('model.user.active_goals', function() {
    var res = [];
    if((this.get('model.user.active_goals') || []).length > 0) {
      this.get('model.user.active_goals').forEach(function(goal) {
        res.push({id: goal.get('id'), name: goal.get('summary')});
      });
      res.push({id: '', name: i18n.t('clear_assessment_type', "[ Clear Assessment Type ]")});
    }
    return res;
  }),
  add_tally(correct) {
    var timestamp = Date.now() / 1000;
    var tallies = this.get('tallies');
    tallies.pushObject({
      timestamp: timestamp,
      correct: correct
    });
    if(correct) {
      this.set('totals.correct', this.get('totals.correct') + 1);
    } else {
      this.set('totals.incorrect', this.get('totals.incorrect') + 1);
    }
  },
  actions: {
    plus_minus: function(direction, key) {
      var val = parseInt(this.get(key), 10);
      if(direction == 'plus') {
        val++;
      } else {
        val--;
      }
      val = Math.max(0, val);
      this.set(key, val);
      this.set('totals.modified', true);
    },
    correct: function() {
      this.add_tally(true);
    },
    incorrect: function() {
      this.add_tally(false);
    },
    goal_action: function(id) {
      if(id === '') {
        this.set('goal_id', null);
        this.set('description', '');
      } else {
        var goal = (this.get('model.user.active_goals') || []).find(function(g) { return g.get('id') == id; });
        if(goal) {
          this.set('goal_id', goal.get('id'));
          this.set('description', goal.get('summary'));
        } else {
          this.set('goal_id', null);
          this.set('description', '');
        }
      }
    },
    record_assessment: function() {
      var description = this.get('description') || (window.moment().format('MMMM Do YYYY, h:mm a'));
      var assessment = {
        start_timestamp: null,
        end_timestamp: null,
        description: description,
        tallies: this.get('tallies'),
        totals: this.get('totals')
      };
      stashes.track_daily_event('quick_assessments');
      if(this.persistence.get('online')) {
        var log = this.store.createRecord('log', {
          user_id: this.get('model.user.id'),
          goal_id: this.get('goal_id'),
          assessment: assessment
        });
        var _this = this;
        log.save().then(function() {
          this.modal.close(true);
        }, function() { });
      } else {
        this.stashes.log_event(assessment, this.get('model.user.id'));
        this.stashes.push_log(true);
        this.modal.close();
      }
    }
  }
});
