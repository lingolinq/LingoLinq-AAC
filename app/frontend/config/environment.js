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
      // Use an explicit root so we never use body (avoids "same root element (body) multiple times")
      rootElement: '#ember-application-root'
    },
    // S3 bucket for static assets (language/ngrams, etc). Set via STATIC_S3_BUCKET at build time, or defaults by environment.
    staticS3Bucket: process.env.STATIC_S3_BUCKET || (environment === 'production' ? 'lingolinq-prod-static' : 'lingolinq-dev-static')
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
    ENV.contentSecurityPolicy = {
      'default-src': "'none'",
      'script-src': "'self'",
      'font-src': "'self'",
      'connect-src': "'self'",
      'img-src': "'self' data:",
      'style-src': "'self' 'unsafe-inline' data:",
      'media-src': "'self' data:",
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
