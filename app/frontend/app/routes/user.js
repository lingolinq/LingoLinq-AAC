import Route from '@ember/routing/route';
import { later as runLater } from '@ember/runloop';
import persistence from '../utils/persistence';
import RSVP from 'rsvp';

export default Route.extend({
  model: function(params) {
    // Check for reserved paths that should be handled by Rails routes
    // These paths (like 'jobby' for Resque) would otherwise be caught by the
    // Ember router and cause 404 errors when trying to load them as users
    var reserved_paths = ['jobby'];
    if(reserved_paths.indexOf(params.user_id) >= 0) {
      // Redirect to the Rails route instead of trying to load as a user
      window.location.href = '/' + params.user_id;
      return RSVP.reject({status: 404, reserved_path: true});
    }
    
    var obj = this.store.findRecord('user', params.user_id);
    var _this = this;
    return obj.then(function(data) {
      if(!data.get('really_fresh') && persistence.get('online')) {
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
