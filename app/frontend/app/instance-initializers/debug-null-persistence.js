/**
 * ONE-OFF DEBUG: Finds code that reads .persistence from null.
 * Wraps Ember.onerror and window.onerror to log [DEBUG null.persistence] and
 * full stack when the error message matches (e.g. "Cannot read properties of
 * null (reading 'persistence')"). The actual bug is fixed at call sites (e.g.
 * board.js using _this.persistence). Remove this file after confirming the
 * error is gone.
 */
import Ember from 'ember';

export default {
  name: 'debug-null-persistence',
  initialize: function(app) {
    function isPersistenceNullError(msg) {
      return msg && /persistence/.test(msg) && (/(null|undefined).*persistence|reading 'persistence'/.test(msg));
    }
    function logPersistenceNullError(msg, error) {
      var stack = (error && error.stack) ? error.stack : String(error);
      console.error('[DEBUG null.persistence] Caught error (direct property access). Message:', msg);
      console.error('[DEBUG null.persistence] Stack:', stack);
    }

    // Ember catches run-loop errors first; hook in so we see the tag
    if (typeof Ember !== 'undefined' && Ember.onerror) {
      var prevEmberOnerror = Ember.onerror;
      Ember.onerror = function(error) {
        var msg = (error && error.message) || String(error);
        if (isPersistenceNullError(msg)) {
          logPersistenceNullError(msg, error);
        }
        return prevEmberOnerror ? prevEmberOnerror.call(this, error) : false;
      };
    }

    if (typeof window !== 'undefined') {
      var prevOnError = window.onerror;
      window.onerror = function(msg, url, line, col, error) {
        if (isPersistenceNullError(msg)) {
          logPersistenceNullError(msg, error);
        }
        if (prevOnError) { return prevOnError.apply(this, arguments); }
        return false;
      };
    }
  }
};
