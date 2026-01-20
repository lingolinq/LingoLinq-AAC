import { getOwner } from '@ember/application';

/**
 * Instance initializer to set window references for services
 * This provides backward compatibility for code that accesses services via window.persistence, etc.
 */
export default {
  name: 'window-services',
  initialize: function(applicationInstance) {
    // Set window.persistence from service
    var persistenceService = applicationInstance.lookup('service:persistence');
    if(persistenceService) {
      window.persistence = persistenceService;
    }
    
    // Set window.app_state from service  
    var appStateService = applicationInstance.lookup('service:app-state');
    if(appStateService) {
      window.app_state = appStateService;
    }
    
    // Set window.stashes from service
    var stashesService = applicationInstance.lookup('service:stashes');
    if(stashesService) {
      window.stashes = stashesService;
    }
  }
};
