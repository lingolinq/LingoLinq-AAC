import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  waitsFor,
  runs,
  stub
} from 'frontend/tests/helpers/jasmine';
import { queryLog, db_wait } from 'frontend/tests/helpers/ember_helper';
import RSVP from 'rsvp';
import app_state from '../../utils/app_state';
import boundClasses from '../../utils/bound_classes';
import modal from '../../utils/modal';
import stashes from '../../utils/_stashes';
import editManager from '../../utils/edit_manager';
import contentGrabbers from '../../utils/content_grabbers';
import scanner from '../../utils/scanner';
import session from '../../utils/session';
import capabilities from '../../utils/capabilities';
import utterance from '../../utils/utterance';
import geo from '../../utils/geo';
import speecher from '../../utils/speecher';
import LingoLinq from '../../app';
import lingoLinqExtras from '../../utils/extras';
import $ from 'jquery';

describe('extras', function() {
  describe('track_error', function() {
    it('should call the right method', function() {
      var called = false;
      stub(window, '_trackJs', {
        track: function(message) {
          called = true;
        }
      });
      lingoLinqExtras.track_error('I did something wrong');
      expect(called).toEqual(true);
    });
  });

  describe('realAjax', function() {
    it('should set the correct headers', function() {
      db_wait(function() {
        $.something = 'asdf';
        capabilities.access_token = 'asdfasdf';
        stub(window, 'ApplicationCache', {});
        var called = false;
        stub($, 'realAjax', function(opts) {
          expect(opts.url).toEqual('/api/v1/something/cool');
          expect(opts.headers['X-Has-AppCache']).toEqual("true");
          expect(opts.headers['Authorization']).toEqual('Bearer asdfasdf');
          expect(opts.headers['X-Device-Id']).toNotEqual(undefined);
          expect(opts.headers['X-SILENCE-LOGGER']).toEqual(undefined);
          called = true;
          return RSVP.reject({});
        });
        $.ajax('/api/v1/something/cool', {
        }).then(null, function() { });
        waitsFor(function() { return called; });
        runs();
      });
    });

    it('should set the logging silence header if specified', function() {
      db_wait(function() {
        capabilities.access_token = 'asdfasdf';
        stub(window, 'ApplicationCache', {});
        stub(LingoLinq, 'protected_user', true);
        var called = false;
        stub($, 'realAjax', function(opts) {
          expect(opts.url).toEqual('/api/v1/boards/bob/home');
          expect(opts.headers['X-Has-AppCache']).toEqual("true");
          expect(opts.headers['Authorization']).toEqual('Bearer asdfasdf');
          expect(opts.headers['X-Device-Id']).toNotEqual(undefined);
          expect(opts.headers['X-SILENCE-LOGGER']).toEqual('true');
          called = true;
          return RSVP.reject({});
        });
        $.ajax({url: '/api/v1/boards/bob%2Fhome'}).then(null, function() { });
        waitsFor(function() { return called; });
        runs();
      });
    });
  });

  describe('start_after_device_init', function() {
    afterEach(function() {
      lingoLinqExtras.set('ready', false);
      lingoLinqExtras.set('offline_available', undefined);
    });

    it('should default to an 8s timeout only when browserless or standalone', function() {
      var previous = capabilities.browserless;
      capabilities.browserless = true;
      expect(lingoLinqExtras.init_timeout_ms()).toEqual(8000);
      capabilities.browserless = false;
      expect(lingoLinqExtras.init_timeout_ms()).toEqual(navigator.standalone ? 8000 : 0);
      expect(lingoLinqExtras.init_timeout_ms({timeout_ms: 20})).toEqual(20);
      expect(lingoLinqExtras.init_timeout_ms({timeout_ms: 0})).toEqual(0);
      capabilities.browserless = previous;
    });

    it('should enable extras after a hung init when a timeout is set', function() {
      var enabled = false;
      stub(lingoLinqExtras, 'enable', function() { enabled = true; });
      lingoLinqExtras.start_after_device_init({
        timeout_ms: 20,
        invoke: function() {
          return new RSVP.Promise(function() { /* never settles */ });
        }
      });
      waitsFor(function() { return enabled; });
      runs(function() {
        expect(lingoLinqExtras.get('offline_available')).toEqual(false);
      });
    });

    it('should enable extras once when init resolves before the timeout', function() {
      var count = 0;
      stub(lingoLinqExtras, 'enable', function() { count++; });
      lingoLinqExtras.start_after_device_init({
        timeout_ms: 200,
        invoke: function() {
          return RSVP.resolve({});
        }
      });
      waitsFor(function() { return count > 0; });
      runs(function() {
        expect(count).toEqual(1);
        expect(lingoLinqExtras.get('offline_available')).toNotEqual(false);
      });
    });

    it('should not enable extras when timeout is 0 and init never settles', function() {
      var enabled = false;
      stub(lingoLinqExtras, 'enable', function() { enabled = true; });
      lingoLinqExtras.start_after_device_init({
        timeout_ms: 0,
        invoke: function() {
          return new RSVP.Promise(function() { /* never settles */ });
        }
      });
      var waited = false;
      setTimeout(function() { waited = true; }, 40);
      waitsFor(function() { return waited; });
      runs(function() {
        expect(enabled).toEqual(false);
      });
    });
  });
});

//     track_error: function(message) {
//       if(window._trackJs) {
//         window._trackJs.track(message);
//       }
//     }

//   $.ajax = function(opts) {
//     var _this = this;
//     var args = [];
//     var options = arguments[0];
//     var clean_options = {};
//     if(typeof(arguments[0]) == 'string') {
//       options = arguments[1];
//       options.url = options.url || arguments[0];
//     }
//     if(options.url && options.url.match(/\/api\/v\d+\/boards\/.+%2F.+/)) {
//       options.url = options.url.replace(/%2F/, '/');
//     }
//     ['async', 'cache', 'contentType', 'context', 'crossDomain', 'data', 'dataType', 'error', 'global', 'headers', 'ifModified', 'isLocal', 'mimeType', 'processData', 'success', 'timeout', 'type', 'url'].forEach(function(key) {
//       if(options[key]) {
//         clean_options[key] = options[key];
//       }
//     });
//     args.push(clean_options);
//
//     return RSVP.resolve().then(function() {
//       var prefix = location.protocol + "//" + location.host;
//       if(capabilities.installed_app && capabilities.api_host) {
//         prefix = capabilities.api_host;
//       }
//       if(options.url && options.url.indexOf(prefix) === 0) {
//         options.url = options.url.substring(prefix.length);
//       }
//       if(options.url && options.url.match(/^\//)) {
//         if(options.url && options.url.match(/^\/(api\/v\d+\/|token)/) && capabilities.installed_app && capabilities.api_host) {
//           options.url = capabilities.api_host + options.url;
//         }
//         if(capabilities.access_token) {
//           options.headers = options.headers || {};
//           options.headers['Authorization'] = "Bearer " + capabilities.access_token;
//           options.headers['X-Device-Id'] = device_id;
//           options.headers['X-LingoLinq-Version'] = window.LingoLinq.VERSION;
//         }
//         if(LingoLinq.protected_user || stashes.get('protected_user')) {
//           options.headers = options.headers || {};
//           options.headers['X-SILENCE-LOGGER'] = 'true';
//         }
//         if(LingoLinq.session && LingoLinq.session.get('as_user_id')) {
//           options.headers = options.headers || {};
//           options.headers['X-As-User-Id'] = LingoLinq.session.get('as_user_id');
//         }
//         if(window.ApplicationCache) {
//           options.headers = options.headers || {};
//           options.headers['X-Has-AppCache'] = "true";
//         }
//       }
//
//       var success = options.success;
//       var error = options.error;
//       options.success = null;
//       options.error = null;
//       var res = $.realAjax(options).then(function(data, message, xhr) {
//         if(typeof(data) == 'string') {
//           data = {text: data};
//         }
//         if(data && data.error && data.status && !data.ok) {
//           console.log("ember ajax error: " + data.status + ": " + data.error + " (" + options.url + ")");
//           if(error) {
//             error.call(this, xhr, message, data);
//             // The bowels of ember aren't expecting $.ajax to return a real
//             // promise and so they don't catch the rejection properly, which
//             // potentially causes all sorts of unexpected uncaught errors.
//             // NOTE: this means that any LingoLinq code should not use the error parameter
//             // if it expects to receive a proper promise.
//             // TODO: raise an error somehow if the caller provides an error function
//             // and expects a proper promise in response.
//             return RSVP.resolve(null);
//           } else {
//             var rej = RSVP.reject({
//               stack: data.status + ": " + data.error + " (" + options.url + ")",
//               fakeXHR: fakeXHR(xhr),
//               message: message,
//               result: data
//             });
//             rej.then(null, function() { });
//             return rej;
//            }
//         } else {
//           if(typeof(data) == 'string') {
//           }
//           if(data === '' || data === undefined || data === null) {
//             data = {};
//           }
//           data.meta = (data.meta || {});
//           data.meta.fakeXHR = fakeXHR(xhr);
//           delete data.meta.fakeXHR['responseJSON'];
//           $.ajax.meta_push({url: options.url, method: options.type, meta: data.meta});
//           if(success) {
//             success.call(this, data, message, xhr);
//           }
//           return data;
//         }
//       }, function(xhr, message, result) {
//         if(xhr.responseJSON && xhr.responseJSON.error) {
//           result = xhr.responseJSON.error;
//         }
//         console.log("ember ajax error: " + xhr.status + ": " + result + " (" + options.url + ")");
//         if(error) {
//           error.call(this, xhr, message, result);
//         }
//         var rej = RSVP.reject({
//           fakeXHR: fakeXHR(xhr),
//           message: message,
//           result: result
//         });
//         rej.then(null, function() { });
//         return rej;
//       });
//       res.then(null, function() { });
//       return res;
//     });
//   };
