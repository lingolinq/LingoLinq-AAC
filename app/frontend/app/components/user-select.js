import Component from '@ember/component';
import EmberObject from '@ember/object';
import i18n from '../utils/i18n';
import { set as emberSet, get as emberGet } from '@ember/object';
import { observer } from '@ember/object';
import { computed } from '@ember/object';
import LingoLinq from '../app';
import RSVP from 'rsvp';
import Utils from '../utils/misc';
import { inject as service } from '@ember/service';

export default Component.extend({
  appState: service('app-state'),
  persistence: service('persistence'),
  tagName: 'span',
  action: function() { return this; },
  didInsertElement: function() {
    var supervisees = [];
    var _this = this;
    var has_supervisees = this.appState.get('sessionUser.known_supervisees') || this.appState.get('sessionUser.managed_orgs.length') > 0;
    var show_options = has_supervisees || this.appState.get('sessionUser.communicator_in_supporter_view');
    _this.set('has_extra_users', this.appState.get('sessionUser.managed_orgs.length') > 0);
    _this.set('extra_users', null);
    _this.set('extra_user', null);
    if(!this.get('users') && show_options) {
      (this.appState.get('sessionUser.known_supervisees') || []).forEach(function(supervisee) {
        var sup = {
          name: supervisee.user_name,
          image: supervisee.local_avatar_url || supervisee.avatar_url,
          disabled: !_this.get('allow_all') && !supervisee.edit_permission,
          id: supervisee.id
        };
        supervisees.push(sup);
        if(LingoLinq.remote_url(supervisee.avatar_url) && !supervisee.local_avatar_url) {
          _this.persistence.find_url(supervisee.avatar_url, 'image').then(function(url) {
            emberSet(supervisee, 'local_avatar_url', url);
            emberSet(sup, 'image', url);
          }, function(err) { });
        }
      });
      if(supervisees.length > 0 || _this.get('has_extra_users') || this.appState.get('sessionUser.communicator_in_supporter_view')) {
        supervisees.unshift({
          name: i18n.t('me', "me"),
          id: 'self',
          disabled: this.get('skip_me'),
          self: true,
          image: this.appState.get('sessionUser.avatar_url_with_fallback')
        });
      }
      if(!this.get('buttons') && !this.get('selection')) {
        var action = this.get('action');
        if (action && typeof action === 'function') {
          action('self');
        } else if (action && typeof action === 'string') {
          // Fallback for string-based actions (legacy support)
          if (this.action) {
            this.action('self');
          }
        }
      }
    }
    if(this.get('has_extra_users')) {
      this.load_extra_users();
    }
    if(!this.appState.get('sessionUser.supervisees') || supervisees.length === 0) {
      if(!this.appState.get('sessionUser.communicator_in_supporter_view')) {
        var action = this.get('action');
        if (action && typeof action === 'function') {
          action('self');
        } else if (action && typeof action === 'string') {
          // Fallback for string-based actions (legacy support)
          if (this.action) {
            this.action('self');
          }
        }
      }
    }
    this.set('users', this.get('users') || supervisees);
  },
  users_with_extras: computed('users', 'extra_users', 'extra_users.loading', 'extra_users.error', 'extra_users.length', function() {
    var _this = this;
    var res = [].concat(this.get('users') || []);
    if(this.get('extra_users.loading')) {
      res.push({
        name: i18n.t('loading_more_users', "Loading More Users..."),
        disabled: true,
        id: 'loading'
      });
    } else if(this.get('extra_users.error')) {
      res.push({
        name: i18n.t('error_loading_more_users', "Failed to Load More Users"),
        disabled: true,
        id: 'error'
      });
    } else if(this.get('extra_users.length') > 0) {
      res.push({
        name: "----------",
        disabled: true,
        id: 'divider'
      });
      (this.get('extra_users') || []).forEach(function(u) {
        res.push({
          name: u.user_name,
          image: u.local_avatar_url || u.avatar_url,
          disabled: !_this.get('allow_all') && !u.edit_permission,
          id: u.id
        })
      });  
    }
    return res;
  }),
  load_extra_users: function() {
    var _this = this;
    _this.set('extra_users', {loading: true});
    var list = [];
    var promises = [];
    (this.appState.get('sessionUser.managed_orgs') || []).forEach(function(org) {
      promises.push(Utils.all_pages('/api/v1/organizations/' + org.id + '/users', {result_type: 'user', type: 'GET', data: {}}).then(function(data) {
        list = list.concat(data.filter(function(u) { return !u.org_pending; }));
      }));
    });
    RSVP.all_wait(promises).then(function() {
      _this.set('extra_users', list.sort(function(a, b) { return a.user_name.localeCompare(b.user_name)}));
    }, function(err) {
      _this.set('extra_users', { error: true});
    })
  },
  include_me: observer('skip_me', function() {
    var self = (this.get('users') || []).find(function(u) { return u.id == 'self'; });
    if(self) {
      emberSet(self, 'disabled', !!this.get('skip_me'));
    }
  }),
  for_user_image: computed('users', 'selection', function() {
    var res = null;
    var user_id = this.get('selection');
    (this.get('users') || []).forEach(function(sup) {
      if(sup.id == user_id) {
        res = sup.image;
      }
    });
    return res;
  }),
  actions: {
    select: function(id) {
      var found = false;
      this.set('extra_user', null);
      (this.get('users') || []).forEach(function(sup) {
        if(sup.id == id) {
          emberSet(sup, 'currently_selected', true);
          found = true;
        } else {
          emberSet(sup, 'currently_selected', false);
        }
      });
      if(found) {
        // NOTE: user-select needs to handle when set id is from the extras list
        if (this.action) {
          this.action(id);
        }
      }
    },
    set_extra_user: function(user) {
      var found = false;
      if(!user.edit_permission) { return; }
      (this.get('users') || []).forEach(function(sup) {
        emberSet(sup, 'currently_selected', false);
      });
      var us = this.appState.get('quick_users') || {};
      us[user.id] = user;
      this.appState.set('quick_users', us);
      this.set('extra_user', user);
      var action = this.get('action');
      if (action && typeof action === 'function') {
        action(user.id);
      } else if (action && typeof action === 'string') {
        // Fallback for string-based actions (legacy support)
        if (this.action) {
          this.action(user.id);
        }
      }
    }
  }
});
