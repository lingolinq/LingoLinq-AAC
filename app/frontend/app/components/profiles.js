import Component from '@ember/component';
import { inject as service } from '@ember/service';
import { computed } from '@ember/object';
import { htmlSafe } from '@ember/template';
import $ from 'jquery';
import modal from '../utils/modal';
import LingoLinq from '../app';

export default Component.extend({
  modal: service('modal'),
  persistence: service('persistence'),
  router: service('router'),
  tagName: '',

  init() {
    this._super(...arguments);
    const modalService = this.get('modal');
    const template = 'modals/profiles';
    const options = (modalService && modalService.getSettingsFor && modalService.getSettingsFor(template)) ||
                    (modalService && modalService.settingsFor && modalService.settingsFor[template]) ||
                    this.get('model') || {};
    this.set('model', options);
    this.runOpening();
  },

  runOpening() {
    const _this = this;
    $('body .tooltip').remove();
    _this.set('lookup_state', null);
    _this.set('browse_state', null);
    if (_this.get('model.profile_id')) {
      _this.set('profile', { loading: true });
      const load_template = function(profile_results) {
        LingoLinq.store.findRecord('profile', _this.get('model.profile_id')).then(function(pt) {
          const template = pt.get('template');
          if (profile_results) {
            template.name = profile_results.name;
            template.description = profile_results.description || template.description;
            template.date = profile_results.date;
            template.log_id = profile_results.log_id;
            template.author = profile_results.author;
            template.started = profile_results.started;
          }
          _this.set('profile', template);
        }, function() {
          if (profile_results) {
            _this.set('profile', profile_results);
          } else if (_this.get('model.profile_id') === 'default') {
            _this.set('profile', { name: 'Default Profile' });
          } else {
            _this.set('profile', { error: true });
          }
        });
      };
      this.get('persistence').ajax('/api/v1/profiles/latest?user_id=' + _this.get('model.user.id') + '&profile_id=' + _this.get('model.profile_id'), { type: 'GET' }).then(function(list) {
        if (list[0]) {
          const prof = list[0].profile;
          prof.log_id = list[0].log_id;
          prof.author = list[0].author;
          if (prof.summary_color) {
            const rgb = prof.summary_color.map(function(c) { return parseInt(c, 10); }).join(',');
            prof.circle_style = htmlSafe('border-color: rgb(' + rgb + '); box-shadow: inset 0 0 5px rgb(' + rgb + ')');
          }
          if (prof.started) {
            prof.date = window.moment(prof.started * 1000);
          }
          const priors = [];
          list.slice(1).forEach(function(prior) {
            if (prior.profile && prior.profile.started) {
              priors.push({ date: window.moment(prior.profile.started * 1000) });
            }
          });
          prof.priors = priors;
          if (!prof.template_id) {
            load_template(prof);
          } else {
            _this.set('profile', prof);
          }
        } else {
          load_template();
        }
      }, function() {
        load_template();
      });
    } else {
      this.load_profiles();
    }
  },

  load_profiles() {
    const _this = this;
    _this.set('profiles', { loading: true });
    this.get('persistence').ajax('/api/v1/profiles/latest?user_id=' + _this.get('model.user.id') + '&include_suggestions=1', { type: 'GET' }).then(function(list) {
      const res = [];
      const ids = {};
      list.forEach(function(item) {
        if (ids[item.profile.id]) { return; }
        ids[item.profile.id] = true;
        const prof = item.profile;
        prof.button_class = 'btn btn-lg btn-default';
        if (prof.summary_color) {
          const rgb = prof.summary_color.map(function(c) { return parseInt(c, 10); }).join(',');
          prof.circle_style = htmlSafe('border-color: rgb(' + rgb + '); box-shadow: inset 0 0 5px rgb(' + rgb + ')');
        }
        if (item.started) {
          prof.date = window.moment(item.started);
          if (item.expected === 'due_soon') {
            prof.button_class = 'btn btn-lg btn-warning';
          } else if (item.expected === 'overdue') {
            prof.button_class = 'btn btn-lg btn-danger';
          }
        } else {
          prof.button_class = 'btn btn-lg btn-danger';
        }
        prof.log_id = item.log_id;
        prof.author = item.author;
        res.push(prof);
      });
      _this.set('profiles', res);
    }, function() {
      _this.set('profiles', { error: true });
    });
  },

  any_recorded: computed('profiles', function() {
    let any = false;
    (this.get('profiles') || []).forEach(function(prof) {
      if (prof.log_id) { any = true; }
    });
    return any;
  }),

  repeat_button_class: computed('profile', function() {
    if (this.get('profile.name')) {
      if (this.get('profile.started')) {
        const now = window.moment();
        const started = window.moment(this.get('profile.started') * 1000);
        if (started < now.add(-12, 'month')) {
          return 'btn btn-lg btn-danger';
        } else if (started < now.add(-10, 'month')) {
          return 'btn btn-lg btn-warning';
        }
        return 'btn btn-lg btn-default';
      } else {
        return 'btn btn-lg btn-danger';
      }
    } else {
      return 'btn btn-lg btn-default';
    }
  }),

  actions: {
    close() {
      this.get('modal').close();
    },
    opening() {},
    closing() {},
    clear_profile() {
      this.set('model.profile_id', null);
      this.load_profiles();
    },
    review_profile(log_id) {
      if (log_id) {
        $('html,body').scrollTop(0);
        this.get('router').transitionTo('user.log', this.get('model.user.user_name'), log_id);
      }
    },
    run_profile(profile_id) {
      $('html,body').scrollTop(0);
      this.get('router').transitionTo('profile', this.get('model.user.user_name'), profile_id);
    },
    browse() {
      const _this = this;
      _this.set('lookup_state', null);
      _this.set('browse_state', { loading: true });
      this.get('persistence').ajax('/api/v1/profiles/?user_id=' + _this.get('model.user.id'), { type: 'GET' }).then(function(list) {
        _this.set('browse_state', { list: list.map(function(p) { return p.profile; }) });
      }, function() {
        _this.set('browse_state', { error: true });
      });
    },
    lookup() {
      const id = this.get('find_profile_id');
      if (id) {
        const _this = this;
        _this.set('lookup_state', { loading: true });
        _this.set('browse_state', null);
        LingoLinq.store.findRecord('profile', _this.get('find_profile_id')).then(function(pt) {
          _this.set('lookup_state', null);
          _this.get('router').transitionTo('profile', _this.get('model.user.user_name'), pt.id);
        }, function(err) {
          if (err && err.error && err.error.error === 'Record not found') {
            _this.set('lookup_state', { not_found: true });
          } else {
            _this.set('lookup_state', { error: true });
          }
        });
      }
    }
  }
});
