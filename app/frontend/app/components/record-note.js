import Component from '@ember/component';
import { inject as service } from '@ember/service';
import { computed } from '@ember/object';
import { htmlSafe } from '@ember/template';
import modal from '../utils/modal';
import stashes from '../utils/_stashes';
import i18n from '../utils/i18n';

/**
 * Record Note modal (Phase 2).
 */
export default Component.extend({
  modal: service('modal'),
  appState: service('app-state'),
  store: service('store'),
  persistence: service('persistence'),
  tagName: '',

  init() {
    this._super(...arguments);
    const modalService = this.get('modal');
    const template = 'record-note';
    const options = (modalService && modalService.getSettingsFor && modalService.getSettingsFor(template)) ||
                    (modalService && modalService.settingsFor && modalService.settingsFor[template]) ||
                    this.get('model') || {};
    this.set('model', options);
  },

  didInsertElement() {
    this._super(...arguments);
    const options = this.get('model');
    const type = options.type;
    let user = options.user;
    this.set('note_rows', 4);
    this.set('all_note_templates', this.get('appState').get('currentUser.all_note_templates'));
    const _this = this;
    if (user && user.load_active_goals) {
      user.load_active_goals();
    } else if (user) {
      this.get('store').findRecord('user', user.id).then(function(u) {
        u.load_active_goals();
        _this.set('model', u);
      });
    }
    if (options.goal) {
      this.set('goal', options.goal);
      this.set('goal_id', options.goal.id);
    } else if (options.goal_id) {
      this.set('goal_id', options.goal_id);
    }
    this.set('prior', options.prior);
    if (options.note_type) {
      this.set('note_type', options.note_type);
    }
    if (user) {
      this.set('model', user);
    }
    if (this.get('note_type') === undefined) { this.set('note_type', 'text'); }
    if (this.get('notify') === undefined) { this.set('notify', true); }
    if (options && options.notify !== undefined) { this.set('notify', options.notify); }
    if (options && options.log) { this.set('log', options.log); }
  },

  text_note: computed('note_type', function() {
    return this.get('note_type') === 'text';
  }),

  video_note: computed('note_type', function() {
    return this.get('note_type') === 'video';
  }),

  goal_options: computed('model.active_goals', function() {
    const res = [];
    if ((this.get('model.active_goals') || []).length > 0 || true) {
      res.push({ id: '', name: i18n.t('select_goal', '[ Select to Update Status or Link this Note to a Goal ]') });
      res.push({ id: 'status', name: i18n.t('overall_status_for_this_user', 'Overall Status for this User') });
      (this.get('model.active_goals') || []).forEach(function(goal) {
        res.push({ id: goal.get('id'), name: i18n.t('goal_dash', 'Goal - ') + goal.get('summary') });
      });
      res.push({ id: '', name: i18n.t('no_goal_link', "Don't Link this Note to a Goal or Status") });
    }
    return res;
  }),

  goal_statuses: computed('goal_id', 'goal_status', function() {
    const goal_id = this.get('goal_id');
    const goal_status = this.get('goal_status');
    const status = goal_id === 'status';
    const base = [
      { id: '1', text: htmlSafe(status ? i18n.t('status_going_poorly', "Going<br/>Poorly") : i18n.t('we_didnt_do_it', "We didn't<br/>do it")), display_class: 'face sad' },
      { id: '2', text: htmlSafe(status ? i18n.t('status_just_ok', "Just<br/>OK") : i18n.t('we_did_it', "We barely<br/>did it")), display_class: 'face neutral' },
      { id: '3', text: htmlSafe(status ? i18n.t('status_no_complaints', "No<br/>Complaints") : i18n.t('we_did_good', "We did<br/>good!")), display_class: 'face happy' },
      { id: '4', text: htmlSafe(status ? i18n.t('status_great_progress', "Great<br/>Progress!") : i18n.t('we_did_awesome', "We did<br/>awesome!")), display_class: 'face laugh' }
    ];
    return base.map(function(s) {
      return {
        id: s.id,
        text: s.text,
        display_class: s.display_class,
        button_display_class: s.id === goal_status ? 'btn btn-primary face_button' : 'btn btn-default face_button'
      };
    });
  }),

  no_video_ready: computed('video_id', function() {
    return !this.get('video_id');
  }),

  text_class: computed('text_note', function() {
    return this.get('text_note') ? 'btn btn-primary' : 'btn btn-default';
  }),

  video_class: computed('text_note', function() {
    return this.get('text_note') ? 'btn btn-default' : 'btn btn-primary';
  }),

  actions: {
    close() {
      this.get('modal').close();
    },
    opening() {},
    closing() {},
    updateGoalId(id) {
      this.set('goal_id', id);
    },
    set_type(type) {
      this.set('note_type', type);
    },
    video_ready(id) {
      this.set('video_id', id);
    },
    video_not_ready() {
      this.set('video_id', false);
    },
    video_pending() {
      this.set('video_id', false);
    },
    set_status(id) {
      if (this.get('goal_status') === id) { id = null; }
      this.set('goal_status', id);
    },
    pick_template(template) {
      this.set('note', template.text);
      this.set('note_rows', 8);
    },
    saveNote(type) {
      if (type === 'video' && !this.get('video_id')) { return; }
      const _this = this;
      const note = {
        text: _this.get('note'),
        timestamp: (new Date()).getTime() / 1000
      };
      if (_this.get('prior')) {
        note.prior = _this.get('prior.note.text');
        note.prior_contact = _this.get('prior.contact');
        note.prior_record_code = 'LogSession:' + _this.get('prior.id');
      }
      if (_this.get('log')) {
        note.log_events_string = _this.get('log');
      }
      let notify = this.get('notify') ? 'true' : null;
      if (this.get('notify_user')) {
        notify = notify === 'true' ? 'include_user' : 'user_only';
      }
      stashes.track_daily_event('notes');
      const fallback = function() {
        stashes.log_event({
          note: note,
          video_id: _this.get('video_id'),
          goal_id: _this.get('goal_id'),
          goal_status: _this.get('goal_status'),
          notify: notify
        }, _this.get('model.id'));
        stashes.push_log(true);
        _this.get('modal').close(true);
      };
      if (this.get('persistence').get('online')) {
        const log = _this.get('store').createRecord('log', {
          user_id: _this.get('model.id'),
          note: note,
          timestamp: Date.now() / 1000,
          notify: notify,
          goal_id: _this.get('goal_id'),
          goal_status: _this.get('goal_status')
        });
        if (type === 'video') {
          log.set('video_id', _this.get('video_id'));
        }
        log.save().then(() => {
          _this.get('modal').close(true);
        }, function() {
          fallback();
        });
      } else {
        fallback();
      }
    }
  }
});
