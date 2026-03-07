/**
 * Eagerly load the stashes service before other services (e.g. persistence, app-state).
 * Ensures stashes is an instance when injected, avoiding "class not instance" errors
 * that occur when init order causes the container to return the wrong type.
 */
export default {
  name: '00-eager-stashes',
  initialize: function(applicationInstance) {
    applicationInstance.lookup('service:stashes');
  }
};
