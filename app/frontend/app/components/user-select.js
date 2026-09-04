import Component from '@ember/component';
import EmberObject from '@ember/object';
import { inject as service } from '@ember/service';
import { set as emberSet, get as emberGet } from '@ember/object';
import { observer } from '@ember/object';
import { computed } from '@ember/object';
import i18n from '../utils/i18n';
import LingoLinq from '../app';
import RSVP from 'rsvp';
import Utils from '../utils/misc';

export default Component.extend({
  tagName: 'span',
  appState: service('app-state'),
  persistence: service('persistence'),
  action: function() { return this; },
  /* The roster options, built from the session user's supervisees. Extracted from
     didInsertElement so it can be rebuilt when the roster arrives — that method also
     fires `action('self')` and loads org users, which must NOT re-run. */
  _supervisee_options: function() {
    var _this = this;
    var appState = this.get('appState');
    var supervisees = [];
    (appState.get('sessionUser.known_supervisees') || []).forEach(function(supervisee) {
      var sup = {
        name: supervisee.user_name,
        image: supervisee.local_avatar_url || supervisee.avatar_url,
        disabled: !_this.get('allow_all') && !supervisee.edit_permission,
        id: supervisee.id
      };
      supervisees.push(sup);
      if(LingoLinq.remote_url(supervisee.avatar_url) && !supervisee.local_avatar_url) {
        _this.get('persistence').find_url(supervisee.avatar_url, 'image').then(function(url) {
          emberSet(supervisee, 'local_avatar_url', url);
          emberSet(sup, 'image', url);
        }, function(err) { });
      }
    });
    if(supervisees.length > 0 || _this.get('has_extra_users') || appState.get('sessionUser.communicator_in_supporter_view')) {
      supervisees.unshift({
        name: i18n.t('me', "me"),
        id: 'self',
        disabled: _this.get('skip_me'),
        self: true,
        image: appState.get('sessionUser.avatar_url_with_fallback')
      });
    }
    return supervisees;
  },

  /* `lib/json_api/user.rb` embeds only the first 10 supervisees; the rest need
     `load_all_connections`. Only the stats route set it, so the SAME dialog listed 10
     or all 30 depending on whether the supporter had visited Reports first — and before
     that visit, communicator #22 was simply unreachable with no error. Requesting it
     here makes every consumer behave identically. */
  _ensure_full_roster: function() {
    var session_user = this.get('appState.sessionUser');
    if(!session_user || !session_user.set) { return; }
    if((session_user.get('supervisees.length') || 0) < 10) { return; }
    if(!session_user.get('load_all_connections')) {
      session_user.set('load_all_connections', true);
    }
  },

  /* The load above is asynchronous and this component builds its list once, so without
     a rebuild the late pages never appear — the original bug, just later. Guarded on
     `_built_users` so a caller-supplied `users` is never overwritten. */
  _rebuild_users_on_roster_change: observer('appState.sessionUser.known_supervisees.[]', function() {
    if(this.isDestroyed || this.isDestroying) { return; }
    if(!this.get('_built_users')) { return; }
    this.set('users', this._supervisee_options());
  }),

  didInsertElement: function() {
    var supervisees = [];
    var _this = this;
    var appState = this.get('appState');
    this._ensure_full_roster();
    var has_supervisees = appState.get('sessionUser.known_supervisees') || appState.get('sessionUser.managed_orgs.length') > 0;
    var show_options = has_supervisees || appState.get('sessionUser.communicator_in_supporter_view');
    _this.set('has_extra_users', appState.get('sessionUser.managed_orgs.length') > 0);
    _this.set('extra_users', null);
    _this.set('extra_user', null);
    if(!this.get('users') && show_options) {
      supervisees = this._supervisee_options();
      if(!this.get('buttons') && !this.get('selection')) {
        var actionFn = this.get('action');
        if (actionFn && typeof actionFn === 'function') {
          actionFn('self');
        }
      }
    }
    if(this.get('has_extra_users')) {
      this.load_extra_users();
    }
    if(!appState.get('sessionUser.supervisees') || supervisees.length === 0) {
      if(!appState.get('sessionUser.communicator_in_supporter_view')) {
        var actionFn = this.get('action');
        if (actionFn && typeof actionFn === 'function') {
          actionFn('self');
        }
      }
    }
    var provided_users = this.get('users');
    this.set('users', provided_users || supervisees);
    this.set('_built_users', !provided_users);
    // Reflect a pre-set `selection` (e.g. copy-board defaulting to "me") onto the
    // per-user `currently_selected` flag the buttons template highlights on — the
    // `select` action only sets that flag on click, so without this an initial
    // selection rendered with no button highlighted.
    this._apply_external_selection();
  },

  // Keep the highlighted button in sync with an externally-provided `selection`
  // (initial value or a later programmatic change). No-op when nothing is passed.
  _apply_external_selection: function() {
    // The `selection` observer can fire during teardown if a bound parent prop
    // changes as the modal closes — bail so we don't iterate on a destroyed view.
    if(this.isDestroyed || this.isDestroying) { return; }
    var sel = this.get('selection');
    if(sel == null) { return; }
    (this.get('users') || []).forEach(function(sup) {
      emberSet(sup, 'currently_selected', sup.id == sel);
    });
  },
  // Only watch `selection` — the initial reflect after `users` is built is done
  // by the explicit call in didInsertElement, so watching `users` here would just
  // double-fire the loop on first render.
  _sync_external_selection: observer('selection', function() {
    this._apply_external_selection();
  }),
  users_with_extras: computed('users', 'extra_users', 'extra_users.loading', 'extra_users.length', function() {
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
    (this.get('appState').get('sessionUser.managed_orgs') || []).forEach(function(org) {
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
  // Gate the "Other User" dropdown on actual data, not just on whether
  // the user has any managed orgs. Without this, screens where the
  // managed org is empty render an empty drop-up that confuses users.
  // Show while loading / error so the user gets feedback; hide once
  // we know the list is empty.
  should_show_extras: computed('has_extra_users', 'extra_users.loading', 'extra_users.error', 'extra_users.length', function() {
    if(!this.get('has_extra_users')) { return false; }
    var ex = this.get('extra_users');
    if(!ex) { return true; }
    if(ex.loading || ex.error) { return true; }
    return (ex.length || 0) > 0;
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
        var actionFn = this.get('action');
        if (actionFn && typeof actionFn === 'function') {
          actionFn(id);
        }
      }
    },
    set_extra_user: function(user) {
      var found = false;
      if(!user.edit_permission) { return; }
      (this.get('users') || []).forEach(function(sup) {
        emberSet(sup, 'currently_selected', false);
      });
      var us = this.get('appState').get('quick_users') || {};
      us[user.id] = user;
      this.get('appState').set('quick_users', us);
      this.set('extra_user', user);
      var actionFn = this.get('action');
      if (actionFn && typeof actionFn === 'function') {
        actionFn(user.id);
      }
    }
  },

  init() {
    this._super(...arguments);
var self = this;
this.ctrlAction = function(actionName) {
  var bound = Array.prototype.slice.call(arguments, 1);
  return function() {
    var args = bound.concat(Array.prototype.slice.call(arguments));
    var evt = args[args.length - 1];
    if (evt && typeof evt.preventDefault === 'function' && (evt.type || evt.target)) {
      if (evt.preventDefault) { evt.preventDefault(); }
      args.pop();
    }
    self.send.apply(self, [actionName].concat(args));
  };
};
this.ctrlActionNoBubble = function(actionName) {
  var bound = Array.prototype.slice.call(arguments, 1);
  return function(event) {
    if (event && event.stopPropagation) { event.stopPropagation(); }
    if (event && event.preventDefault) { event.preventDefault(); }
    self.send.apply(self, [actionName].concat(bound));
  };
};
this.ctrlActionEventValue = function(actionName, targetProp) {
  return function(event) {
    var value = event && event.target ? event.target[targetProp] : undefined;
    self.send(actionName, value);
  };
};
  },

});
