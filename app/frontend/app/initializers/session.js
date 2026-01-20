import persistence from '../utils/persistence';
import stashes from '../utils/_stashes';
import lingoLinqExtras from '../utils/extras';
import app_state from '../utils/app_state';
import session from '../utils/session';
import capabilities from '../utils/capabilities';

export default {
  name: 'session',
  initialize: function(app) {
    window.LingoLinq.app = app;
    session.setup(app);
    // Legacy setup - COMMENTED OUT: Services are now auto-registered by Ember as modern services
    // Modern services: app/services/persistence.js, app/services/stashes.js, app/services/app-state.js
    // Window references are set in app/instance-initializers/window-services.js for backward compatibility
    // High-priority files have been migrated to use @service injection
    // TODO: Remove these once all files are migrated
    // persistence.setup(app);
    // stashes.connect(app);
    // lingoLinqExtras.setup(app);
    // app_state.setup(app);
    lingoLinqExtras.setup(app);
  }
};
