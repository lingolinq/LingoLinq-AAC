import extras from '../utils/extras';
import session from '../utils/session';

export default {
  name: 'defer_readiness',
  initialize: function(app) {
    if(!window.cough_drop_readiness) {
      window.LingoLinq.app = app;
      app.deferReadiness();
    } else {
      session.restore();
    }
    extras.advance('init');
  }
};
