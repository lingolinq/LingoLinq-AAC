/* global require, module */
var EmberApp = require('ember-cli/lib/broccoli/ember-app');

module.exports = function (defaults) {
  var app = new EmberApp(defaults, {
    sourcemaps: {
      enabled: true
    },
    storeConfigInMeta: false,
    //    vendorFiles: {
    //      'handlebars.js': null,
    //      'ember.js': 'bower_components/ember/ember.prod.js',
    //      'ember-data.js': 'bower_components/ember-data/ember-data.prod.js'
    //    },
    fingerprint: {
      enabled: false
    },
    minifyJS: {
      enabled: false
    },
    'ember-cli-babel': {
      includePolyfill: true
    },
    sassOptions: {
      implementation: require('sass')
    }
  });

  // Use `app.import` to add additional libraries to the generated
  // output files.
  //
  // If you need to use different assets in different
  // environments, specify an object as the first parameter. That
  // object's keys should be the environment name and the values
  // should be the asset to use in that environment.
  //
  // If the library that you are including contains AMD or ES6
  // modules that you would like to import into your application
  // please specify an object with the list of modules as keys
  // along with the exports of each module as its value.
  // Import CSS files
  app.import('node_modules/bootstrap/dist/css/bootstrap.min.css');
  app.import('node_modules/jquery-minicolors/jquery.minicolors.css');

  // Import JS files
  app.import('node_modules/indexeddbshim/dist/indexeddbshim.min.js');
  // Import source map to prevent 404 errors
  app.import('node_modules/indexeddbshim/dist/indexeddbshim.min.js.map', {
    destDir: 'assets'
  });
  // Hammer-Time causes a weird bug in Windows Chrome where if you
  // tap a dropdown, when you touch (not mouse) the element within the dropdown, it
  // triggers a click event on the page with the page-level coordinates
  // matching the coordinates of the touch relative to the top left corner of
  // the dropdown list. This typically results in a click on the "home"
  // link in the top right corner of the app.
  //  app.import('bower_components/hammer-time/hammer-time.js');
  app.import('node_modules/davidshimjs-qrcodejs/qrcode.min.js');
  app.import('node_modules/moment/moment.js');
  app.import('node_modules/tinycolor2/tinycolor.js');
  app.import('node_modules/jquery-minicolors/jquery.minicolors.min.js');
  app.import('node_modules/bootstrap/dist/js/bootstrap.min.js');
  app.import('node_modules/recordrtc/RecordRTC.min.js');
  app.import('node_modules/wordcloud/src/wordcloud2.js');
  // Chart.js and chartjs-chart-sankey loaded via CDN in index.html (avoids vendor.js concatenation conflicts)
  app.import('vendor/media_recorder/media_recorder.js');
  app.import('vendor/speak_js/speakClient.js');
  app.import('vendor/speech/speech.js');

  // Load QUnit before vendor.js so window.QUnit is set (test-support expects it before bundled qunit runs)
  app.import('node_modules/qunit/qunit/qunit.js', {
    type: 'vendor',
    outputFile: 'assets/qunit-standalone.js'
  });

  return app.toTree();
};
