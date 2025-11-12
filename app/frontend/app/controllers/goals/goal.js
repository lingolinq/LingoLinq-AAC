import Controller from '@ember/controller';
import $ from 'jquery';
import persistence from '../../utils/persistence';
import modal from '../../utils/modal';
import i18n from '../../utils/i18n';
import LingoLinq from '../../app';
import { observer } from '@ember/object';
import { computed } from '@ember/object';
import app_state from '../../utils/app_state';

export default Controller.extend({
  advance_options: [
    {name: i18n.t('never', "Never"), id: "none"},
    {name: i18n.t('on_the_date', "On the Date"), id: "date"},
    {name: i18n.t('after_time', "After Time"), id: "duration"}
  ],
  advance_unit_options: [
    {name: i18n.t('months', "Months"), id: "month"},
    {name: i18n.t('weeks', "Weeks"), id: "week"},
    {name: i18n.t('days', "Days"), id: "day"}
  ],
  load_user_badges: observer('app_state.currentUser.id', 'model.id', 'model.badges', function() {
    var _this = this;
    this.store.query('badge', {user_id: this.get('app_state.currentUser.id'), goal_id: this.get('model.id')}).then(function(badges) {
      _this.set('user_badges', badges.map(function(b) { return b; }));
    }, function(err) {
    });
  }),
  mapped_badges: computed('model.badges', 'user_badges', function() {
    var user_badges = this.get('user_badges');
    if(user_badges) {
      var res = [];
      (this.get('model.badges') || []).forEach(function(badge) {
        var new_badge = $.extend({}, badge);
        new_badge.user_badge = user_badges.find(function(b) { return b.get('level') == badge.level; });
        res.push(new_badge);
      });
      return res;
    } else {
      return this.get('model.badges');
    }
  }),
  assessment_badge_description: computed('model.assessment_badge', function() {
    var ub = LingoLinq.store.createRecord('badge', {
      name: this.get('model.badge_name') || this.get('model.summary'),
      level: 0,
      completion_settings: this.get('model.assessment_badge')
    });
    return ub.get('completion_explanation');
  }),
  load_templates_for_header: observer('model.template_header', function() {
    if(this.get('model.template_header')) {
      this.load_templates();
    }
  }),
  load_templates: function() {
    if(this.get('model.sequence') && this.get('model.related.header.id') && this.get('templates_list_for') != this.get('model.related.header.id')) {
      var _this = this;
      _this.set('status', {loading_templates: true});
      var header_id = _this.get('model.related.header.id');
      _this.store.query('goal', {template_header_id: header_id}).then(function(list) {
        _this.set('status', null);
        var res = [{id: '', name: i18n.t('none_set', "None Set")}];
        list = list.map(function(i) { return i; });
        list.forEach(function(g) {
          if(!g.get('related')) { g.set('related', {}); }
          if(!g.get('related.next') && g.get('next_template_id')) {
            var next = list.find(function(r) { return r.get('id') == g.get('next_template_id'); });
            g.set('related.next', next);
          }
          if(!g.get('related.previous')) {
            var previous = list.find(function(r) { return r.get('next_template_id') == g.get('id'); });
            g.set('related.previous', previous);
          }
          if(!g.get('related.header') && g.get('template_header_id')) {
            var header = list.find(function(r) { return r.get('id') == g.get('template_header_id'); });
            g.set('related.header', header);
          }
        });
        res = res.concat(list.map(function(g) { return {id: g.get('id'), name: g.get('summary')}; }));
        res.push({id: 'new', name: i18n.t('new_template', "New Template")});
        _this.set('templates', list);
        _this.set('template_options', res);
        _this.set('templates_list_for', header_id);
      }, function(err) {
        _this.set('status', {loading_templates_error: true});
      });
    }
  },
  load_templates_when_editing: observer('editing', function() {
    if(this.get('editing')) {
      this.load_templates();
    }
  }),
  actions: {
    save: function() {
      var goal = this.get('model');
      var _this = this;
      _this.set('status', {saving: true});
      goal.update_advancement();
      goal.generate_next_template_if_new().then(function(next_template) {
        if(next_template) {
          goal.set('next_template_id', next_template.get('id'));
        }
        return goal.save();
      }).then(function(g) {
        _this.set('status', null);
        _this.set('editing', false);
        _this.get('templates_list_for', null);
      }, function(err) {
        _this.set('status', {saving_error: true});
      });
    },
    cancel_save: function() {
      this.set('editing', false);
    },
    edit_goal: function() {
      this.set('editing', !this.get('editing'));
    },
    delete_goal: function() {
      var goal = this.get('model');
      goal.deleteRecord();
      var _this = this;
      _this.set('status', {deleting: true});
      goal.save().then(function(r) {
        app_state.return_to_index();
      }, function(err) {
        _this.set('status', {delete_error: true});
      });
    },
    unlink_goal: function() {
      var _this = this;
      modal.open('modals/confirm-remove-goal', {source_type: 'unit', source: {id: _this.get('model.unit_id'), name: _this.get('model.unit_name')}, goal: _this.get('model')}).then(function(res) {
        if(res.confirmed) {
          _this.transitionToRoute('organization.room', _this.get('model.unit_org_id'), _this.get('model.unit_id'));
        }
      });
    },
    remove_badge: function(badge) {
      this.get('model').remove_badge(badge);
    },
    add_badge_level: function() {
      if(this.get('model')) {
        this.get('model').add_badge_level();
      }
    },
    badge_popup: function(badge) {
      var ub = badge.user_badge;
      if(!badge.user_badge) {
        ub = LingoLinq.store.createRecord('badge', {
          name: this.get('model.badge_name') || this.get('model.summary'),
          level: badge.level,
          image_url: badge.image_url,
          sound_url: badge.sound_url,
          completion_settings: badge
        });
      }
      if(ub) {
        modal.open('badge-awarded', {badge: ub, user_id: app_state.get('currentUser.id')});
      }
    }
  }
});
