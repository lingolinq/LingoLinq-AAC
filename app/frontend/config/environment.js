/* jshint node: true */

module.exports = function(environment) {
  var ENV = {
    modulePrefix: 'frontend',
    environment: environment,
//    baseURL: '/', // deprecated?
    rootURL: '/',
    locationType: 'auto',
    EmberENV: {
      FEATURES: {
        // Here you can enable experimental features on an ember canary build
        // e.g. EMBER_NATIVE_DECORATOR_SUPPORT: true
      },
      EXTEND_PROTOTYPES: {
        // Prevent Ember Data from overriding Date.parse.
        Date: false
      }
    },

    APP: {
      // Here you can pass flags/options to your application instance
      // when it is created
    }
  };

//   ENV['simple-auth'] = {
//     store: 'simple-auth-session-store:lingolinq-local-storage',
//     session: 'simple-auth-session:lingolinq',
//     authenticator: 'authenticator:lingolinq'
//   }

  if (environment === 'development') {
    // ENV.APP.LOG_RESOLVER = true;
    // ENV.APP.LOG_ACTIVE_GENERATION = true;
    // ENV.APP.LOG_TRANSITIONS = true;
    // ENV.APP.LOG_TRANSITIONS_INTERNAL = true;
    // ENV.APP.LOG_VIEW_LOOKUPS = true;
    
    // Use direct HTTPS API URL in sandbox environment to avoid mixed content errors
    // Set via environment variable or use default sandbox URL
    ENV.API_HOST = process.env.API_HOST || 'https://5000-if22s76ljt6fceg4fip6r-2b54fc91.sandbox.novita.ai';
    
    ENV.contentSecurityPolicy = {
      'default-src': "'none'",
      'script-src': "'self'",
      'font-src': "'self'",
      'connect-src': "'self' https://5000-if22s76ljt6fceg4fip6r-2b54fc91.sandbox.novita.ai https://opensymbols.s3.amazonaws.com",
      'img-src': "'self' data: https: http:",
      'style-src': "'self' 'unsafe-inline' data:",
      'media-src': "'self' data: https: http:",
      'frame-src': "'self'",
      'report-uri': 'null'
    };
  }

  if (environment === 'test') {
    // Testem prefers this...
    // ENV.rootURL = '/';
    ENV.locationType = 'none';

    // keep test console output quieter
    ENV.APP.LOG_ACTIVE_GENERATION = false;
    ENV.APP.LOG_VIEW_LOOKUPS = false;

    ENV.APP.rootElement = '#ember-testing';
    ENV.APP.autoboot = false;
  }

  if (environment === 'production') {

  }

  return ENV;
};
