/* global require, module */
var EmberApp = require('ember-cli/lib/broccoli/ember-app');

module.exports = function (defaults) {
  var app = new EmberApp(defaults, {
    babel: {
      plugins: [
        ['@babel/plugin-transform-class-properties', { loose: true }],
        ['@babel/plugin-transform-private-methods', { loose: true }],
        ['@babel/plugin-transform-private-property-in-object', { loose: true }]
      ]
    },
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
      includePolyfill: true,
      enableTypeScriptTransform: true
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
    },
    emberData: {
      deprecations: {
        // App store is explicit (app/services/store.js); no custom Store subclass.
        DEPRECATE_STORE_EXTENDS_EMBER_OBJECT: false
      }
    }
  });

  // ember-cli-babel 8 no longer honors includePolyfill; ember-fetch (and other
  // vendor deps) still emit regeneratorRuntime for generators/async.
  app.import('node_modules/regenerator-runtime/runtime.js', { prepend: true });

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

  return app.toTree();
};
