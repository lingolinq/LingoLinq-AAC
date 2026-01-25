import EmberObject from '@ember/object';
import { set as emberSet, get as emberGet } from '@ember/object';
import modal from '../utils/modal';
import persistence from '../utils/persistence';
import stashes from '../utils/_stashes';
import i18n from '../utils/i18n';
import { htmlSafe } from '@ember/string';
import { computed } from '@ember/object';
import app_state from '../utils/app_state';

export default modal.ModalController.extend({
  text_note: computed('note_type', function() {
    return this.get('note_type') == 'text';
  }),
  video_note: computed('note_type', function() {
    return this.get('note_type') == 'video';
  }),
  opening: function() {
    var type = this.get('model.type');
    var user = this.get('model.user');
    this.set('note_rows', 4);
    this.set('all_note_templates', app_state.get('currentUser.all_note_templates'));
    var _this = this;
    if(user && user.load_active_goals) {
      user.load_active_goals();
    } else if(user) {
      this.store.findRecord('user', user.id).then(function(u) {
        u.load_active_goals();
        _this.set('model', u);
      });
    }
    if(this.get('model.goal')) {
      this.set('goal', this.get('model.goal'));
      this.set('goal_id', this.get('model.goal.id'));
    } else if(this.get('model.goal_id')) {
      this.set('goal_id', this.get('model.goal_id'));
    }
    this.set('prior', this.get('model.prior'));
    if(this.get('model.note_type')) {
      this.set('note_type', this.get('model.note_type'));
    }
    this.set('model', user);
    if(this.get('note_type') === undefined) { this.set('note_type', 'text'); }
    if(this.get('notify') === undefined) { this.set('notify', true); }
  },
  goal_options: computed('model.active_goals', function() {
    var res = [];
    if((this.get('model.active_goals') || []).length > 0 || true) {
      res.push({id: '', name: i18n.t('select_goal', "[ Select to Update Status or Link this Note to a Goal ]")});
      res.push({id: 'status', name: i18n.t('overall_status_for_this_user', "Overall Status for this User")});
      (this.get('model.active_goals') || []).forEach(function(goal) {
        res.push({id: goal.get('id'), name: i18n.t('goal_dash', "Goal - ") + goal.get('summary')});
      });
      res.push({id: '', name: i18n.t('no_goal_link', "Don't Link this Note to a Goal or Status")});
    }
    return res;
  }),
  goal_statuses: computed('goal_id', function() {
    var goal_id = this.get('goal_id');
    var status = goal_id == 'status';
    var res = [];
    res.push({
      id: '1',
      text: htmlSafe(status ? i18n.t('status_going_poorly', "Going<br/>Poorly") : i18n.t('we_didnt_do_it', "We didn't<br/>do it")),
      display_class: 'face sad',
      button_display_class: 'btn btn-default face_button'
    });
    res.push({
      id: '2',
      text: htmlSafe(status ? i18n.t('status_just_ok', "Just<br/>OK") : i18n.t('we_did_it', "We barely<br/>did it")),
      display_class: 'face neutral',
      button_display_class: 'btn btn-default face_button'
    });
    res.push({
      id: '3',
      text: htmlSafe(status ? i18n.t('status_no_complaints', "No<br/>Complaints") : i18n.t('we_did_good', "We did<br/>good!")),
      display_class: 'face happy',
      button_display_class: 'btn btn-default face_button'
    });
    res.push({
      id: '4',
      text: htmlSafe(status ? i18n.t('status_great_progress', "Great<br/>Progress!") : i18n.t('we_did_awesome', "We did<br/>awesome!")),
      display_class: 'face laugh',
      button_display_class: 'btn btn-default face_button'
    });
    return res;
  }),
  no_video_ready: computed('video_id', function() {
    return !this.get('video_id');
  }),
  text_class: computed('text_note', function() {
    var res = "btn ";
    if(this.get('text_note')) {
      res = res + "btn-primary";
    } else {
      res = res + "btn-default";
    }
    return res;
  }),
  video_class: computed('text_note', function() {
    var res = "btn ";
    if(this.get('text_note')) {
      res = res + "btn-default";
    } else {
      res = res + "btn-primary";
    }
    return res;
  }),
  actions: {
    set_type: function(type) {
      this.set('note_type', type);
    },
    video_ready: function(id) {
      this.set('video_id', id);
    },
    video_not_ready: function() {
      this.set('video_id', false);
    },
    video_pending: function() {
      this.set('video_id', false);
    },
    set_status: function(id) {
      if(this.get('goal_status') == id) { id = null; }
      this.set('goal_status', id);
      this.get('goal_statuses').forEach(function(status) {
        if(status.id == id) {
          emberSet(status, 'button_display_class', 'btn btn-primary face_button');
        } else {
          emberSet(status, 'button_display_class', 'btn btn-default face_button');
        }
      });
    },
    pick_template: function(template) {
      this.set('note', template.text);
      this.set('note_rows', 8);
    },
    saveNote: function(type) {
      if(type == 'video' && !this.get('video_id')) { return; }
      var _this = this;
      var note = {
        text: _this.get('note'),
        timestamp: (new Date()).getTime() / 1000
      };
      if(_this.get('prior')) {
        note.prior = _this.get('prior.note.text');
        note.prior_contact = _this.get('prior.contact');
        note.prior_record_code = "LogSession:" + _this.get('prior.id');
      }
      if(_this.get('log')) {
        note.log_events_string = _this.get('log');
      }
      var notify = this.get('notify') ? 'true' : null;
      if(this.get('notify_user')) {
        if(notify == 'true') {
          notify = 'include_user';
        } else {
          notify = 'user_only';
        }
      }
      stashes.track_daily_event('notes');
      var fallback = function() {
        stashes.log_event({
          note: note,
          video_id: _this.get('video_id'),
          goal_id: _this.get('goal_id'),
          goal_status: _this.get('goal_status'),
          notify: notify
        }, this.get('model.id'));
        stashes.push_log(true);
      };
      if(persistence.get('online')) {
        var log = _this.store.createRecord('log', {
          user_id: _this.get('model.id'),
          note: note,
          timestamp: Date.now() / 1000,
          notify: notify,
          goal_id: _this.get('goal_id'),
          goal_status: _this.get('goal_status')
        });
        if(type == 'video') {
          log.set('video_id', _this.get('video_id'));
        }
        log.save().then(function() {
          modal.close(true);
        }, function() { 
          fallback();
        });
      } else {
        fallback();
      }
    }
  }
});
