import persistence from '../utils/persistence';
import stashes from '../utils/_stashes';
import lingoLinqExtras from '../utils/extras';
import app_state from '../utils/app_state';
import session from '../utils/session';
import capabilities from '../utils/capabilities';

export default {
  name: 'session',
  initialize: function(applicationInstance) {
    // Preserve legacy app reference
    if (applicationInstance.application) {
      window.LingoLinq.app = applicationInstance.application;
    }
    
    // Ensure session service is created (runs its init())
    var sessionService = applicationInstance.lookup('service:session');
    
    // Call restore after service is initialized (moved from extras.js to prevent undefined error)
    if(sessionService && typeof sessionService.restore === 'function') {
      sessionService.restore();
      // Pre-fetch isAuthenticated to prevent flash of unauthenticated content?
      // sessionService.get('isAuthenticated'); 
    }
    
    // Setup extras - ensure it receives the object expecting .register()
    // appInstance has .register() in most versions, but let's be safe
    lingoLinqExtras.setup(applicationInstance);
  }
};
