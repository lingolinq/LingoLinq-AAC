import extras from '../utils/extras';
import session from '../utils/session';

export default {
  name: 'defer_readiness',
  initialize: function(app) {
    if(!window.lingolinq_readiness) {
      window.LingoLinqAAC.app = app;
      app.deferReadiness();
    } else {
      session.restore();
    }
    extras.advance('init');
  }
};
