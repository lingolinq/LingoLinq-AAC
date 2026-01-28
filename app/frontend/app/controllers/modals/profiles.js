// needs: user.id, user.user_name
// show profile templates tied to user's orgs or preferences
// retrieve a list of latest profiles (for profile_id, if defined)
// option to browse/search other profiles

import modal from '../../utils/modal';
import stashes from '../../utils/_stashes';
import app_state from '../../utils/app_state';
import utterance from '../../utils/utterance';
import i18n from '../../utils/i18n';
import LingoLinq from '../../app';
import { set as emberSet } from '@ember/object';
import { observer } from '@ember/object';
import { computed } from '@ember/object';
import $ from 'jquery';
import persistence from '../../utils/persistence';
import { htmlSafe } from '@ember/template';

export default modal.ModalController.extend({
  opening: function() {
    $("body .tooltip").remove();
    var _this = this;
    _this.set('lookup_state', null);
    _this.set('browse_state', null);
    if(_this.get('model.profile_id')) {
      _this.set('profile', {loading: true});
      
      // LingoLinq.store.findRecord('profile', _this.get('model.profile_id')).then(function(pt) {
      //   _this.set('profile', pt);
      // }, function(err) {
      //   _this.set('profile', {error: true});
      // });
      var load_template = function(profile_results) {
        LingoLinq.store.findRecord('profile', _this.get('model.profile_id')).then(function(pt) {
          var template = pt.get('template');
          if(profile_results) {
            template.name = profile_results.name;
            template.description = profile_results.description || template.description;
            template.date = profile_results.date;
            template.log_id = profile_results.log_id;
            template.author = profile_results.author;
            template.started = profile_results.started;  
          }
          _this.set('profile', template);
        }, function(err) {
          if(profile_results) {
            _this.set('profile', profile_results);
          } else if(_this.get('model.profile_id') == 'default') {
            profile_results = {name: 'Default Profile'};
            _this.set('profile', profile_results);
          } else {
            _this.set('profile', {error: true});
          }
        });
      };
      persistence.ajax('/api/v1/profiles/latest?user_id=' + _this.get('model.user.id') + '&profile_id=' + _this.get('model.profile_id'), {type: 'GET'}).then(function(list) {
        if(list[0]) {
          var prof = list[0].profile;
          prof.log_id = list[0].log_id;
          prof.author = list[0].author;
          if(prof.summary_color) {
            var rgb = prof.summary_color.map(function(c) { return parseInt(c, 10); }).join(',');
            prof.circle_style = htmlSafe("border-color: rgb(" + rgb + "); box-shadow: inset 0 0 5px rgb(" + rgb + ")");
          }
          if(prof.started) {
            prof.date = window.moment(prof.started * 1000);
          }
          var priors = [];
          list.slice(1).forEach(function(prior) {
            if(prior.profile && prior.profile.started) {
              priors.push({
                date: window.moment(prior.profile.started * 1000)
              });  
            }
          });
          prof.priors = priors;
          if(!prof.template_id) {
            load_template(prof);
          } else {
            _this.set('profile', prof);
          }
        } else {
          load_template();
        }
      }, function(err) {
        load_template();
      });
    } else {
      this.load_profiles();
    }
  },
  load_profiles: function() {
    var _this = this;
    _this.set('profiles', {loading: true});
    persistence.ajax('/api/v1/profiles/latest?user_id=' + _this.get('model.user.id') + '&include_suggestions=1', {type: 'GET'}).then(function(list) {
      var res = [];
      var ids = {};
      list.forEach(function(item) {
        if(ids[item.profile.id]) { return; }
        ids[item.profile.id] = true;
        var prof = item.profile;
        prof.button_class = 'btn btn-lg btn-default';
        if(prof.summary_color) {
          var rgb = prof.summary_color.map(function(c) { return parseInt(c, 10); }).join(',');
          prof.circle_style = htmlSafe("border-color: rgb(" + rgb + "); box-shadow: inset 0 0 5px rgb(" + rgb + ")");
        }
        if(item.started) {
          prof.date = window.moment(item.started);
          if(item.expected == 'due_soon') {
            prof.button_class = 'btn btn-lg btn-warning';
          } else if(item.expected == 'overdue') {
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
    }, function(err) {
      _this.set('profiles', {error: true});
    });
  },
  any_recorded: computed('profiles', function() {
    var any = false;
    (this.get('profiles') || []).forEach(function(prof) {
      if(prof.log_id) { any = true; }
    });
    return any;
  }),
  repeat_button_class: computed('profile', function() {
    if(this.get('profile.name')) {
      if(this.get('profile.started')) {
        var now = window.moment();
        var started = window.moment(this.get('profile.started') * 1000);
        if(started < now.add(-12, 'month')) {
          return 'btn btn-lg btn-danger';
        } else if(started < now.add(-10, 'month')) {
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
    clear_profile: function() {
      this.set('model.profile_id', null);
      this.load_profiles();
    },
    review_profile: function(log_id) {
      if(log_id) {
        $("html,body").scrollTop(0);
        this.transitionToRoute('user.log', this.get('model.user.user_name'), log_id);
      }
    },
    run_profile: function(profile_id) {
      $("html,body").scrollTop(0);
      this.transitionToRoute('profile', this.get('model.user.user_name'), profile_id);
    },
    browse: function() {
      var _this = this;
      _this.set('lookup_state', null);
      _this.set('browse_state', {loading: true});
      persistence.ajax('/api/v1/profiles/?user_id=' + _this.get('model.user.id'), {type: 'GET'}).then(function(list) {
        _this.set('browse_state', {list: list.map(function(p) { return p.profile; })});
      }, function(err) {
        _this.set('browse_state', {error: true});
      });
    },
    lookup: function() {
      var id = this.get('find_profile_id');
      if(id) {
        var _this = this;
        _this.set('lookup_state', {loading: true});
        _this.set('browse_state', null);
        LingoLinq.store.findRecord('profile', _this.get('find_profile_id')).then(function(pt) {
          _this.set('lookup_state', null);
          _this.transitionToRoute('profile', _this.get('model.user.user_name'), pt.id);
        }, function(err) {
          if(err && err.error && err.error.error == "Record not found") {
            _this.set('lookup_state', {not_found: true});
          } else {
            _this.set('lookup_state', {error: true});
          }
        });

      }
    }
  }
});
