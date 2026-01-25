import Controller from '@ember/controller';
import {set as emberSet } from '@ember/object';
import user from '../models/user';
import app_state from '../utils/app_state';
import i18n from '../utils/i18n';
import modal from '../utils/modal';
import persistence from '../utils/persistence';
import profiles from '../utils/profiles';
import stashes from '../utils/_stashes';
import { computed } from '@ember/object';

export default Controller.extend({
  check_prior: function() {
    var _this = this;
    _this.set('prior_profile', null);
    persistence.ajax('/api/v1/profiles/latest?user_id=' + this.get('user.id') + '&profile_id=' + this.get('profile.template.id'), {type: 'GET'}).then(function(res) {
      if(res[0]) {
        var prior = profiles.process(res[0].profile)
        _this.set('prior_profile', prior);
        prior.set('self_assessment', res[0].author.id == _this.get('user.id'));
        prior.set('assessor', res[0].author);
      }
    }, function(err) { });
  },
  all_answers: computed('profile.questions_layout.@each.answers', 'answer_ts', function() {
    var res = [];
    this.get('profile.questions_layout').forEach(function(q) {
      if(q.answers) {
        res = res.concat(q.answers);
      }
    });
    return res;
  }),
  communicator_type: computed('profile.template.type', function() {
    return (this.get('profile.template.type') || 'communicator') == 'communicator';
  }),
  pending_question_ids: computed('all_answers.@each.selected', 'answer_ts', function() {
    var qs = [];
    (this.get('profile.questions_layout') || []).forEach(function(q) {
      if(q.answers && !q.answer_type.text && !q.question_header) {
        var found = false;
        q.answers.forEach(function(a) { if(a.selected) { found = true; }});
        if(!found) { 
          qs.push(q.id);
        }
      }
    });
    return qs;
  }),
  missing_responses: computed('pending_question_ids', function() {
    return (this.get('pending_question_ids') || []).length;
  }),
  actions: {
    highlight_blank: function(toggle) {
      if(toggle) {
        this.set('do_highlight', !this.get('do_highlight'));
      }
      var qs = this.get('profile.questions_layout');
      var ids = this.get('pending_question_ids');
      var go = this.get('do_highlight');
      qs.forEach(function(question) {
        if(go) {
          emberSet(question, 'unanswered', ids.includes(question.id));
        } else {
          emberSet(question, 'unanswered', false);
        }
      });
    },
    select: function(question, answer) {
      question.answers.forEach(function(a) {
        if(a.id == answer.id && !a.selected) {
          emberSet(a, 'selected', true);
        } else {
          emberSet(a, 'selected', false);
        }
      });
      this.set('answer_ts', (new Date()).getTime());
      this.send('highlight_blank');
    },
    submit: function() {
      stashes.track_daily_event('profile');
      var _this = this;
      var nonce = _this.get('user.external_nonce') || app_state.get('currentUser.external_nonce'); //{id: '111', key: '12345678901234567890123456789012', extra: '12345678901234567890123456789012'};
      if(!nonce) {
        modal.error(i18n.t('error_encrypting_profile', "There was an error preparing profile information for encryption, please re-sync and try again"));
        return;
      }
      this.get('profile').output_json(nonce).then(function(json) {
        json.user_id = _this.get('user.id');
        json.user_name = _this.get('user.user_name');
        json.pending = false;
        // If online, submit and redirect to the results.
        // Otherwise, add it to the log
        var now = (new Date()).getTime();
        stashes.log_event(json, json.user_id, app_state.get('sessionUser.id'));
        profiles.recent = profiles.recent || {};
        profiles.nonces = profiles.nonces || {};
        profiles.nonces[nonce.id] = nonce;
        for(var key in profiles.recent) {
          if(profiles.recent[key] && profiles.recent[key].added < now - (12 * 60 * 60 * 1000)) {
            delete profiles.recent[key];
          }
        }
        profiles.recent[json.guid] = {nonce: nonce, profile: json, added: now};
        if(persistence.get('online')) {
          stashes.push_log();
        }
        // navigate to the results page (should work even if offline and haven't been able to push yet)
        app_state.controller.transitionToRoute('user.log', json.user_name, 'profile-' + json.guid);
    
        // stashes.log({
        //   profile: json
        // });
        // stashes.push_log();
        // TODO: 
      }, function(err) {
        modal.error(i18n.t('error_generating_report'));
      });
    }
  }
});
