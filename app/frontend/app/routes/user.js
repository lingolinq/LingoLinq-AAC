import Route from '@ember/routing/route';
import { later as runLater } from '@ember/runloop';
import RSVP from 'rsvp';
import { inject as service } from '@ember/service';

export default Route.extend({
  router: service('router'),
  store: service('store'),
  persistence: service('persistence'),
  appState: service('app-state'),
  model: function(params) {
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

    return this.store.queryRecord('user', { path: params.user_id }).then(function(data) {
      // queryRecord just fetched fresh — only refresh if the record is somehow stale
      // (preserves the prior behaviour for non-self users).
      if(!data.get('really_fresh')) { bg_reload(data); }
      return finish(data);
    });
  },
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
    }
  },
  actions: {
    error: function(error, transition) {
      // Handle 404 errors gracefully to prevent console errors
      // Ember Data can structure errors in different ways, so we check multiple formats
      var status = null;
      if(error && error.status) {
        status = error.status;
      } else if(error && error.errors && error.errors[0] && error.errors[0].status) {
        status = error.errors[0].status;
      } else if(error && error.fakeXHR && error.fakeXHR.status) {
        status = error.fakeXHR.status;
      }
      
      if(status == 404 || status == '404') {
        // Check if it's a reserved path (already redirected)
        if(error.reserved_path) {
          return false; // Don't bubble the error
        }
        // Transition to error route for 404s
        this.router.transitionTo('error');
        return false; // Don't bubble the error
      }
      /* 400 is this API's PERMISSION DENIED, not a malformed request:
         application_controller#allowed? renders `api_error 400` (:300) for every
         denial. It reaches here routinely — a supporter following a link to a
         communicator they can only model for is refused `view_detailed`
         (user.rb:70), which gates both the user payload and the board list
         (boards_controller:77). Bubbling it produced an unhandled rejection and
         a blank route rather than a page, so it is routed to the same error
         screen a 404 gets: the outcome for the reader is identical — this page
         cannot be shown for this account. */
      if(status == 400 || status == '400' || status == 403 || status == '403') {
        this.router.transitionTo('error');
        return false;
      }
      // Let other errors bubble up
      return true;
    }
  }
});
