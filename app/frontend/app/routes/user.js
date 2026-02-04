import Route from '@ember/routing/route';
import { later as runLater } from '@ember/runloop';
import RSVP from 'rsvp';
import { inject as service } from '@ember/service';

export default Route.extend({
  store: service('store'),
  persistence: service('persistence'),
  model: function(params) {
    // Check for reserved paths that should be handled by Rails routes
    // These paths (like 'jobby' for Resque, 'cache' for the cache iframe) would
    // otherwise be caught by the Ember router and cause 400/404 when loading as users
    var reserved_paths = ['jobby', 'cache'];
    if(reserved_paths.indexOf(params.user_id) >= 0) {
      // Don't try to load these as users (cache = offline endpoint, jobby = Resque).
      // Redirect cache to home so we don't request api/v1/users/cache (400); jobby to /jobby.
      var target = params.user_id === 'cache' ? '/' : '/' + params.user_id;
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
    var obj = this.store.queryRecord('user', { path: params.user_id });
    var _this = this;
    return obj.then(function(data) {
      if(!data.get('really_fresh') && _this && _this.persistence && typeof _this.persistence.get === 'function' && _this.persistence.get('online')) {
        runLater(function() {data.reload();});
      }
      return data;
    }).then(function(data) {
      data.set('subroute_name', '');
      return data;
    });
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
        this.transitionTo('error');
        return false; // Don't bubble the error
      }
      // Let other errors bubble up
      return true;
    }
  }
});
