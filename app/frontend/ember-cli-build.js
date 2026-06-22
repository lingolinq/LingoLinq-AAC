/* global require, module */
var EmberApp = require('ember-cli/lib/broccoli/ember-app');

module.exports = function (defaults) {
  var app = new EmberApp(defaults, {
    sourcemaps: {
      enabled: true
    },
    storeConfigInMeta: false,
    fingerprint: {
      enabled: false
    },
    minifyJS: {
      enabled: false
    },
    minifyCSS: {
      enabled: false
    },
    'ember-cli-babel': {
      includePolyfill: true
    },
    sassOptions: {
      implementation: require('sass')
    },
    autoImport: {
      webpack: {
        externals: { jquery: 'jQuery' },
        optimization: {
          splitChunks: false,
          runtimeChunk: false
        },
        output: {
          filename: 'auto-import-[name].js',
          chunkFilename: 'auto-import-[name].js'
        }
      }
    }
  });

  app.import('node_modules/bootstrap/dist/css/bootstrap.min.css');
  app.import('node_modules/jquery-minicolors/jquery.minicolors.css');
  app.import('node_modules/shepherd.js/dist/css/shepherd.css');

  app.import('node_modules/indexeddbshim/dist/indexeddbshim.min.js');
  app.import('node_modules/indexeddbshim/dist/indexeddbshim.min.js.map', {
    destDir: 'assets'
  });
  app.import('node_modules/davidshimjs-qrcodejs/qrcode.min.js');
  app.import('node_modules/moment/moment.js');
  app.import('node_modules/tinycolor2/tinycolor.js');
  app.import('node_modules/jquery-minicolors/jquery.minicolors.min.js');
  app.import('node_modules/bootstrap/dist/js/bootstrap.min.js');
  app.import('node_modules/recordrtc/RecordRTC.min.js');
  app.import('node_modules/wordcloud/src/wordcloud2.js');
  app.import('vendor/media_recorder/media_recorder.js');
  app.import('vendor/speak_js/speakClient.js');
  app.import('vendor/speech/speech.js');

  app.import('node_modules/qunit/qunit/qunit.js', {
    type: 'vendor',
    outputFile: 'assets/qunit-standalone.js'
  });

  return app.toTree();
};
