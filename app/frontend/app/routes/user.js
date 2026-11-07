import Route from '@ember/routing/route';
import { later as runLater } from '@ember/runloop';
import RSVP from 'rsvp';
import { inject as service } from '@ember/service';

export default Route.extend({
  router: service('router'),
  store: service('store'),
  persistence: service('persistence'),
  appState: service('app-state'),
  model: function(params, transition) {
    // Check for reserved paths that should be handled by Rails routes
    // These paths (like 'jobby' for Resque, 'cache' for the cache iframe) would
    // otherwise be caught by the Ember router and cause 400/404 when loading as users
    var reserved_paths = ['jobby', 'cache', 'auth'];
    if(reserved_paths.indexOf(params.user_id) >= 0) {
      // Don't try to load these as users (cache = offline endpoint, jobby = Resque).
      // Redirect cache to home so we don't request api/v1/users/cache (400); jobby to /jobby.
      // /auth is not a user profile — redirect to login (avoid /auth -> /auth reload loop).
      var target = params.user_id === 'cache' ? '/' : (params.user_id === 'auth' ? '/login' : '/' + params.user_id);
      window.location.href = target;
      return RSVP.reject({status: 404, reserved_path: true});
    }
    
    // Note: When requesting user 'example', the API may return the current user (id 'self')
    // instead of the 'example' user, causing an Ember Data warning. This is a backend
    // behavior (possibly due to permissions or routing) and the warning is informational.
    // The functionality works correctly - see PHASE2_STATUS.md for more details.
    // Use queryRecord with 'path' to allow the adapter to construct the correct URL
    // while checking for a single record response, avoiding ID mismatch warnings
    // when 'example' redirects to '1_1'
    var _this = this;
    var online = function() {
      return !!(_this && _this.persistence && typeof _this.persistence.get === 'function' && _this.persistence.get('online'));
    };
    var bg_reload = function(data) {
      if(online()) { runLater(function() { var p = data.reload(); if(p && p.catch) { p.catch(function() { }); } }); }
    };
    var finish = function(data) { data.set('subroute_name', ''); return data; };

    // Cache-first for the CURRENT user's own pages. The `user` route is the parent of
    // ~20 child routes (home/boards/reports/extras AND edit/preferences/subscription/
    // goals/logs/history/…). When navigating to one of your OWN pages, resolve the
    // transition INSTANTLY from the already-loaded currentUser instead of blocking on
    // queryRecord's network round-trip (which visibly stalls navigation, esp. on a
    // slow API), then ALWAYS background-refresh the record so children that don't
    // reload in setupController still self-heal — the instant nav comes from returning
    // the cached record, not from skipping the fetch. Everyone else (supervisees not
    // in the store, other users, the 'example' → self redirect) still uses queryRecord.
    var current = this.appState && this.appState.get('currentUser');
    if(current && (current.get('user_name') === params.user_id || current.get('id') === params.user_id)) {
      bg_reload(current);
      return finish(current);
    }

    var query_server = function(query) {
      return _this.store.queryRecord('user', Object.assign({ path: params.user_id }, query)).then(function(data) {
        // queryRecord just fetched fresh — only refresh if the record is somehow stale
        // (preserves the prior behaviour for non-self users).
        if(!data.get('really_fresh')) { bg_reload(data); }
        return finish(data);
      });
    };

    // OFFLINE COLD BOOT (the offline app shell, lib/offline_shell.rb, opens the app with no network).
    // `currentUser` is still null here on a cold boot: it is set from setupController, which Ember
    // runs after every model hook (utils/session_user_wait.js). queryRecord goes to the network only
    // (adapters/user.js -> adapters/application.js $.ajax), so offline it can only fail. For the
    // signed-in user's own page, use the user record read from the device instead: the read
    // global_transition already started (services/app-state.js `session_user_promise`), or a local
    // read of our own when none is in flight. Ownership is checked against the session BEFORE
    // waiting, so signed-out visitors and other users' pages go straight to the server, as before.
    // The record is used only when it is that user's (a device read can return another account) and it
    // says this device is trusted: a shared device's record is the last person's, and offline the server
    // cannot end their session (utils/offline_shell.js device_trust). Only where the offline shell is on,
    // so the kill switch turns this off too and the native apps, which never set it, are unchanged.
    // Online, nothing here runs.
    var session = this.session;
    var own_page = !!(session && session.get('access_token') && params.user_id &&
      (params.user_id === session.get('user_name') || params.user_id === session.get('user_id')));
    if(!online() && own_page && this.offline_shell_on()) {
      var pending = (this.appState && this.appState.get('session_user_promise')) || this.store.findRecord('user', 'self');
      return wait_for_session_user(this.appState, { promise: pending, timeout: this.offline_session_wait_ms }).then(function(user) {
        if(user && (user.get('user_name') === params.user_id || user.get('id') === params.user_id) &&
            offline_shell.device_trust(user) === 'trusted') {
          return finish(user);
        }
        return query_server();
      });
    }

    // A board page with no server (#1213). See _board_page_owner.
    var boardname = board_target(transition);
    this._end_stand_in();
    if(boardname && session && session.get('access_token')) {
      return this._board_page_owner(params.user_id, boardname, own_page, query_server, finish);
    }

    return query_server();
  },
  // The owner for a board page: the server if it answers in one bounded try, else what the device has.
  // Only here does a failed lookup change anything, and it would otherwise be the error page, so it runs
  // wherever that is true, native apps included. A refusal from the server stays a refusal.
  _board_page_owner: function(user_id, boardname, own_page, query_server, finish) {
    var _this = this;
    var from_device = function() {
      return _this._device_owner(user_id, boardname, own_page).then(function(owner) {
        return owner ? finish(owner) : query_server();
      });
    };
    if(!this.persistence.get('online')) { return from_device(); }
    return query_server({ one_try: this.owner_wait_ms }).then(null, function(err) {
      if(!no_server_answer(err)) { return RSVP.reject(err); }
      return from_device();
    });
  },
  owner_wait_ms: 8000,
  // A real record first: supervisees are saved on the device, and speak-as needs theirs. A stand-in only
  // when this owner's board is on the device. On your own page the record says who was last signed in,
  // so it needs a trusted device (utils/offline_shell.js device_trust).
  _device_owner: function(user_id, boardname, own_page) {
    var _this = this;
    var named = function(user) { return user && user.get('user_name') === user_id; };
    var loaded = this.store.peekAll('user').find(named);
    var stored = loaded ? RSVP.resolve(loaded) : this.persistence.find('user', user_id).then(function(raw) {
      return _this.store.push(_this.store.normalize('user', raw));
    }, function() { return null; });
    return within(stored, this.offline_session_wait_ms).then(function(user) {
      if(own_page && offline_shell.device_trust(user) !== 'trusted') { return null; }
      if(named(user)) { return user; }
      if(own_page) { return null; }
      return within(_this.persistence.find('board', user_id + '/' + boardname), _this.offline_session_wait_ms).then(function(board) {
        if(!board || !board.key || board.key.split('/')[0] !== user_id) { return null; }
        _this._watch_stand_in();
        return owner_stand_in(user_id);
      });
    }).then(null, function() { return null; });
  },
  // A stand-in serves board pages only, and Ember keeps a parent's model while its params are the same,
  // so moving to the owner's other pages must look them up properly. Watched only while one is in use.
  _watch_stand_in: function() {
    var _this = this;
    this.set('owner_stand_in', true);
    if(this._stand_in_watch) { return; }
    this._stand_in_watch = function(transition) {
      if(_this.isDestroyed || _this.isDestroying) { return; }
      var name = transition && transition.to && transition.to.name;
      if(name && name.indexOf('user.') === 0 && !is_board_page(name)) {
        _this._end_stand_in();
        _this.refresh();
      }
    };
    this.router.on('routeDidChange', this._stand_in_watch);
  },
  _end_stand_in: function() {
    this.set('owner_stand_in', false);
    if(this._stand_in_watch) { this.router.off('routeDidChange', this._stand_in_watch); }
    this._stand_in_watch = null;
  },
  // How long an offline cold boot waits for the device read above. Offline the fallback can only
  // fail, so a long wait costs nothing but the signed-in user's own pages.
  offline_session_wait_ms: 10000,
  // The page's offline shell setting (layouts/application.html.erb sets window.offline_shell_enabled).
  offline_shell_on: function() {
    return offline_shell.setting(typeof window === 'undefined' ? null : window) === 'on';
  },
  session: service('session'),
  /* Publish "whose account is this page" so app-level chrome (the supervising
     context pill) can name it. Set on the PARENT `:user_id` route rather than in
     each of the ~20 child routes — one set/clear pair covers every child, and
     resetController on exit is exactly when the context stops applying. */
  setupController: function(controller, model) {
    this._super.apply(this, arguments);
    this.appState.set('page_user', model);
  },
  resetController: function(controller, isExiting) {
    this._super.apply(this, arguments);
    if(isExiting) {
      this.appState.set('page_user', null);
      this._end_stand_in();
    }
  },
  actions: {
    error: function(error, transition) {
      if(error && error.reserved_path) {
        return false; // the model hook already redirected; nothing to show
      }
      /* WHILE THE SESSION IS ENDING the force-logout dialog is the page. The teardown clears the
         token, so requests still in flight answer 400 "Not authorized" as anonymous; bubbling those
         would render "Failed to load" in place of the sign-in prompt. Only while that dialog is OPEN:
         after an in-app logout it is closed but logout_under_way() stays true until the next sign-in,
         and a signed-out visitor still needs the error page. (With no modal route there is no dialog:
         session#force_logout marks that logout `logout_without_dialog` until it lands.) The dead-session response itself is held
         back too, for speak mode, where utils/extras.js deliberately does not log out mid-sentence. */
      if((this.session.logout_under_way() && (modal.is_open('force-logout') || this.session.get('logout_without_dialog'))) || this.session.dead_session_response(error && (error.fakeXHR || (error._result && error._result.fakeXHR)))) {
        return false;
      }
      /* 404, and 400/403 (this API's PERMISSION DENIED: application_controller#allowed? answers
         every denial with 400, e.g. a supporter refused `view_detailed` on a communicator,
         user.rb:70) BUBBLE, like every other error: the application route's action clears board
         state and Ember renders templates/error.hbs, "this page cannot be shown for this account".
         They used to `transitionTo('error')` and `return false`, but there is no transitionable
         `error` route (Ember's generated one needs an `:error` segment), so nothing rendered and
         the navigation silently did nothing. */
      return true;
    }
  }
});

// Imported last so the `.eslint-todo` rows above keep their lines (as dashboard/authenticated-view.js does).
import modal from '../utils/modal';
import { wait_for_session_user } from '../utils/session_user_wait';
import offline_shell from '../utils/offline_shell';
import { board_target, is_board_page, no_server_answer, owner_stand_in } from '../utils/board_owner';
import { within } from '../utils/board_device_copy';
