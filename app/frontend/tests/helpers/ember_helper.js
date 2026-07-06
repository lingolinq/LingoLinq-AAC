import * as QUnit from 'qunit';
import Test from 'ember-testing';
import EmberObject from '@ember/object';
import { setOwner } from '@ember/application';
import RSVP from 'rsvp';
import LingoLinq from '../../app';
import {
  context,
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  waitsFor,
  runs,
  stub,
  restoreStubs,
  currentAssert
} from './jasmine';
import app_state from '../../utils/app_state';
import capabilities from '../../utils/capabilities';
import persistence from '../../utils/persistence';
import lingoLinqExtras from '../../utils/extras';
import stashes from '../../utils/_stashes';
import { primeAllServices, stashesTarget, appStateTarget, persistenceTarget } from './service-stub';
import modal from '../../utils/modal';
import utterance from '../../utils/utterance';
import Button from '../../utils/button';
import speecher from '../../utils/speecher';
import boundClasses from '../../utils/bound_classes';
import buttonTracker from '../../utils/raw_events';
import ApplicationAdapter from 'frontend/adapters/application';
// import startApp from '../helpers/start-app';
import { run as emberRun, later as runLater } from '@ember/runloop';
import $ from 'jquery';
import TestAdapter from '@ember/test/adapter';
import { inspect } from '@ember/debug';
import { set as emberSet, get as emberGet } from '@ember/object';

window.user_preferences = {"device":{"voice":{"pitch":1,"volume":1},"button_spacing":"small","button_border":"small","button_text":"medium","vocalization_height":"small"},"any_user":{"activation_location":"end","auto_home_return":true,"vocalize_buttons":true,"confirm_external_links":true,"clear_on_vocalize":true,"sharing":true,"board_jump_delay":500},"authenticated_user":{"long_press_edit":true,"require_speak_mode_pin":false,"logging":false,"geo_logging":false,"role":"communicator","auto_open_speak_mode":true}};

/**
  @class JasmineAdapter
  @namespace Test
  v 0.1
*/
var JasmineAdapter = TestAdapter.extend({
  asyncRunning: false,

  asyncStart: function() {
    testAdapter.asyncRunning = true;
  },

  asyncComplete: function() {
    return !testAdapter.asyncRunning;
  },

  asyncEnd: function() {
    testAdapter.asyncRunning = false;
  },

  exception: function(error) {
    if (!currentAssert()) {
      console.warn('JasmineAdapter.exception after test ended:', inspect(error));
      return;
    }
    if(error) { debugger; }
    expect(inspect(error)).toBeFalsy();
  }
});

var testAdapter = JasmineAdapter.create();
Test.adapter = testAdapter;

LingoLinq.testing = true;

var queryLog = [];
queryLog.log = function(event) {
  if(event && event.type) {
    event.simple_type = event.type.modelName || event.type.typeKey || event.type.toString().split(/:/)[1];
  }
  queryLog.push(event);
};
function queryFixtureMatches(fixtureQuery, eventQuery) {
  if (!fixtureQuery) {
    return false;
  }
  eventQuery = eventQuery || {};
  for (var key in fixtureQuery) {
    if (Object.prototype.hasOwnProperty.call(fixtureQuery, key) &&
      JSON.stringify(fixtureQuery[key]) !== JSON.stringify(eventQuery[key])) {
      return false;
    }
  }
  return true;
}
queryLog.respondAndLog = function(event, defaultResponse) {
  if(!queryLog.fixtures) { return defaultResponse; }
  queryLog.log(event);
  for(var idx = 0; idx < queryLog.fixtures.length; idx++) {
    var fixture = queryLog.fixtures[idx];
    if(fixture.method == event.method && fixture.type == event.type.modelName) {
      var found = false;
      if(fixture.method == 'GET' && fixture.id && fixture.id == event.id) {
        found = true;
        // find
      } else if(fixture.method == 'POST' && fixture.compare && fixture.compare(event.object.record)) {
        found = true;
        // createRecord
      } else if(fixture.method == 'PUT' && fixture.compare && fixture.compare(event.object.record)) {
        found = true;
        // updateRecord
      } else if(fixture.method == 'GET' && fixture.query && queryFixtureMatches(fixture.query, event.query)) {
        found = true;
        // findQuery
      }
      if(found) {
        if(fixture.response._result && fixture.response._result.meta) {
          lingoLinqExtras.meta_push({
            method: event.method,
            model: event.type.modelName,
            id: event.id,
            meta: fixture.response._result.meta
          });
        }
        return fixture.response.then(function(payload) {
          return JSON.parse(JSON.stringify(payload));
        });
      }
    }
  }
  return defaultResponse;
};
queryLog.defineFixture = function(fixture) {
  fixture.ref_id = Math.random().toString();
  queryLog.fixtures = queryLog.fixtures || [];
  queryLog.fixtures.push(fixture);
};

var fake_dbman = function() {
  var repo = {};
  var wait_call = function(callback, argument) {
    setTimeout(function() {
      if(callback) {
        callback(argument);
      }
    }, Math.random() * 10);
  };
  var index_id = function(store) {
    if(store == 'settings' || store == 'deletion') {
      return 'storageId';
    } else {
      return 'id';
    }
  };
  var result = {};
  for(var key in capabilities.dbman) {
    result[key] = capabilities.dbman[key];
  }
  var replace = {
    not_ready: function(method, options) {
      return false;
    },
    find_one_internal: function(store, key, success, error) {
      repo[store] = repo[store] || [];

      for(var idx = repo[store].length - 1; idx >= 0; idx--) {
        var record = repo[store][idx];
        if(record[index_id(store)] == key) {
          var new_record = {};
          for(var k in record) {
            new_record[k] = record[k];
          }
          return wait_call(success, new_record);
        }
      }
      wait_call(error, {error: "no record found"});
    },
    store_internal: function(store, record, success, error) {
      repo[store] = repo[store] || [];

      var original_id = record[index_id(store)].replace(new RegExp("^" + store + "::"), '');
      result.remove(store, original_id, function() {
        var new_record = {};
        for(var k in record) {
          new_record[k] = record[k];
        }

        repo[store].push(new_record);
        wait_call(success, record);
      }, function() {
        error({error: 'pre-remove failed'});
      });
    },
    remove_internal: function(store, key, success, error) {
      repo[store] = repo[store] || [];
      var new_list = [];
      repo[store].forEach(function(record) {
        if(record[index_id(store)] == key) {
        } else {
          new_list.push(record);
        }
      });
      repo[store] = new_list;
      wait_call(success, {id: key});
    },
    clear: function(store, success, error) {
      repo[store] = [];
      wait_call(success, {store: store});
    },
    find_all_internal: function(store, index, key, success, error) {
      var list = [];
      repo[store] = repo[store] || [];
      repo[store].forEach(function(record) {
        if(!index || record[index] == key) {
          var new_record = {};
          for(var k in record) {
            new_record[k] = record[k];
          }
          list.push({
            store: store,
            data: new_record
          });
        }
      });
      wait_call(success, list);
    }
  };
  for(var key in replace) {
    result[key] = replace[key];
  }
  result.repo = repo;
  window.db = result.repo;
  return result;
};

function fakeAudio() {
  var listeners = {};
  var triggers = [];
  return EmberObject.extend({
    addEventListener: function(event, callback) {
      this.listenersAdded = true;
      listeners[event] = listeners[event] || [];
      listeners[event].push(callback);
    },
    removeEventListener: function(event, callback) {
      this.listenersRemoved = true;
      listeners[event] = (listeners[event] || []).filter(function(f) { return f != callback; });
    },
    trigger: function(event) {
      triggers.push(event);
      (listeners[event] || []).forEach(function(c) {
        c();
      });
    },
    pause: function() { this.pauseCalled = true; this.playing = false; },
    play: function() {
      this.playCalled = true;
      this.playing = true;
      var _this = this;
      setTimeout(function() {
        _this.trigger('ended');
      }, Math.random() * 100);
      return RSVP.resolve();
    },
    cloneNode: function() {
      return fakeAudio();
    },
    load: function() { }
  }).create({currentTime: 123});
}

function fakeRecorder() {
  return EmberObject.extend({
    stop: function() {
      this.stopped = true;
    },
    start: function() {
      this.started = true;
    }
  }).create();
}
function fakeMediaRecorder(stream, options) {
  return EmberObject.extend({
    addEventListener: function(type, callback) {
      this.listeners = this.listeners || {};
      this.listeners[type] = this.listeners[type] || [];
      this.listeners[type].push(callback);
    },
    trigger: function(type, event) {
      ((this.listeners || {})[type] || []).forEach(function(l) {
        l(event);
      });
    }
  }).create({stream: stream, options: options});
}

function fakeCanvas() {
  return {
    getContext: function() {
      return {
        drawImage: function() { }
      };
    },
    toDataURL: function() { return 'picture'; }
  };
}

function stubNavigatorGetUserMedia(options) {
  options = options || {};
  var mediaCallback = options.callback || null;
  var stream = options.stream || {
    getTracks: function() { return []; },
    getAudioTracks: function() { return []; },
    getVideoTracks: function() { return []; }
  };
  var invokeLegacy = function(constraints, success, error) {
    mediaCallback = success;
    if (options.onLegacyCall) {
      options.onLegacyCall(constraints, success, error);
    }
    if (success) {
      success(stream);
    }
  };
  stub(navigator, 'getUserMedia', function(constraints, success, error) {
    invokeLegacy(constraints, success, error);
  });
  if (!navigator.mediaDevices) {
    navigator.mediaDevices = {};
  }
  stub(navigator.mediaDevices, 'getUserMedia', function(constraints) {
    return new RSVP.Promise(function(resolve, reject) {
      invokeLegacy(constraints, resolve, reject);
    });
  });
  return {
    get mediaCallback() { return mediaCallback; },
    set mediaCallback(fn) { mediaCallback = fn; },
    stream: stream
  };
}

function db_wait(callback) {
  waitsFor(function() { return capabilities.db && capabilities.dbman; });
  var _this = this;
  var ready = false;
  runs(function() {
    capabilities.dbman.clear('deletion', function() {
      ready = true;
    });
  });
  waitsFor(function() { return ready && lingoLinqExtras.ready; });
  runs(function() {
    emberRun(_this, callback);
  });
}

function queue_promise(promise) {
  var finished = false;
  var defer = RSVP.defer();
  promise.then(function(res) {
    defer.resolve(res);
    finished = true;
  }, function(err) {
    defer.reject(err);
    finished = true;
  });
  waitsFor(function() { return finished; });
  runs(function() {
  });
  return defer.promise;
}
function wait(callback) {
  runLater(callback, 10);
}

function easyPromise() {
  var res = null, rej = null;
  var promise = new RSVP.Promise(function(resolve, reject) {
    res = resolve;
    rej = reject;
  });
  promise.resolve = function(data) {
    emberRun(function() {
      promise.resolved = true; res(data);
    });
  };
  // TODO: default handler for reject trigger an exception, which is bad
  promise.reject = function() {
    emberRun(function() {
      promise.rejected = true;
    });
  };
  return promise;
}

function result_wrap(data) {
  if(data.map) { return data; }
  var res = {};
  res.meta = data.meta;
  res.list = data.content.mapBy('record');
  res.length = data.length;
  res.forEach = function(cb) {
    res.list.forEach(function(i) {
      cb(i);
    });
  };
  res.map = function(cb) {
    return res.list.map(function(i) { return cb(i); });
  };
  res.slice = function() {
    return Array.prototype.slice.apply(res.list, arguments);
  };

  return res;
}

ApplicationAdapter.reopen({
  ajax: function(url, type, options) {
    options = options || {};
    options.type = type;
    options.url = url;
    return $.ajax(options);
  },
//   findRecord: function(store, type, id, snapshot) {
//     return this._super.apply(this, arguments);
//   },
  findRecord: function(store, type, id) {
    if(queryLog.real_lookup) {
      return this._super.apply(this, arguments);
    }
    var nothing = RSVP.reject('');
    return queryLog.respondAndLog({
      method: 'GET',
      lookup: 'find',
      store: store,
      type: type,
      id: id
    }, nothing);
  },
  createRecord: function(store, type, obj) {
    if(queryLog.real_lookup) {
      return this._super.apply(this, arguments);
    }
    var nothing = RSVP.reject('');
    return queryLog.respondAndLog({
      method: 'POST',
      lookup: 'create',
      store: store,
      type: type,
      object: obj
    }, nothing);
  },
  updateRecord: function(store, type, obj) {
    if(queryLog.real_lookup) {
      return this._super.apply(this, arguments);
    }
    var nothing = RSVP.reject('');
    return queryLog.respondAndLog({
      method: 'PUT',
      lookup: 'update',
      store: store,
      type: type,
      object: obj
    }, nothing);
  },
  deleteRecord: function() {
    if(queryLog.real_lookup) {
      return this._super.apply(this, arguments);
    }
    debugger;
  },
  findAll: function() {
    if(queryLog.real_lookup) {
      return this._super.apply(this, arguments);
    }
    debugger;
  },
  query: function(store, type, query) {
    if(queryLog.real_lookup) {
      return this._super.apply(this, arguments);
    }
    var modelName = type.modelName || type.typeKey;
    var res = {};
    res[modelName] = [];
    var nothing = RSVP.resolve(res);
    return queryLog.respondAndLog({
      method: 'GET',
      lookup: 'query',
      store: store,
      type: type,
      query: query
    }, nothing);
  }
});

var App;

function serviceForTest(owner, serviceName, moduleFallback) {
  if (owner) {
    try {
      return owner.lookup('service:' + serviceName);
    } catch (e) {
      return null;
    }
  }
  var target = moduleFallback;
  if (typeof window !== 'undefined') {
    if (serviceName === 'persistence' && window.persistence) {
      target = window.persistence;
    } else if (serviceName === 'stashes' && window.stashes) {
      target = window.stashes;
    }
  }
  if (!target || target.isDestroyed) {
    return null;
  }
  return target;
}

function resetPersistenceForTest(owner) {
  var target = serviceForTest(owner, 'persistence', persistence);
  if (!target) {
    return;
  }
  target.set('online', true);
  target.storing_urls = null;
  target.url_cache = null;
  target.url_uncache = null;
  target.known_missing = null;
  target.sync_actions = null;
}

function resetStashesForTest(owner) {
  var target = serviceForTest(owner, 'stashes', stashes);
  if (!target) {
    return;
  }
  target.set('online', true);
}

beforeEach(function() {
  // Jasmine afterEach hooks run via delayed runs() AFTER ember-qunit teardown,
  // so restore/clear stubs here while the owner is still live.
  restoreStubs();

  LingoLinq.ignore_filesystem = true;
  capabilities.dbman = capabilities.dbman || capabilities.original_dbman;
  window.cough_drop_readiness = false;
  // TODO: https://alexlafroscia.com/ember-upgrade-to-new-qunit-api/
  // App = startApp();
  // App.rootElement = '#ember-testing';
  if (this.owner) {
    LingoLinq.testOwner = this.owner;
    primeAllServices(this.owner);
    if (LingoLinq.Buttonset && LingoLinq.Buttonset.clear_button_set_cache) {
      LingoLinq.Buttonset.clear_button_set_cache();
    }
    if (LingoLinq.Buttonset) {
      LingoLinq.Buttonset.pending_promises = {};
    }
    var persistenceAjaxTarget = persistenceTarget();
    var priorPersistenceAjax = persistenceAjaxTarget && persistenceAjaxTarget.ajax;
    stub(persistence, 'ajax', function(url, opts) {
      if (typeof url !== 'string') {
        if (priorPersistenceAjax) {
          return priorPersistenceAjax.apply(persistenceAjaxTarget, arguments);
        }
      }
      return RSVP.reject({ error: 'offline in test' });
    });
    stub(persistence, 'find_url', function(url, type) {
      if (LingoLinq.allow_real_find_url) {
        var findUrlTarget = persistenceTarget();
        if (findUrlTarget) {
          var proto = findUrlTarget.constructor && findUrlTarget.constructor.prototype;
          if (proto && typeof proto.find_url === 'function') {
            return proto.find_url.call(findUrlTarget, url, type);
          }
        }
      }
      return RSVP.resolve(null);
    });
    if (LingoLinq.appState && typeof LingoLinq.appState.set === 'function') {
      try {
        patchAppStateUserReload(LingoLinq.appState);
      } catch (e) { /* service mid-teardown */ }
    }
    var moduleName = (typeof QUnit !== 'undefined' && QUnit.config && QUnit.config.currentModule) ? QUnit.config.currentModule.name : null;
    if (!isModalTestModule(moduleName) && this.owner) {
      stubModalSafe(this.owner);
    }
    var owner = this.owner;
    this.subject = function(componentNameOrAttrs, attrs) {
      var componentName;
      var actualAttrs;
      if (typeof componentNameOrAttrs === 'string') {
        componentName = componentNameOrAttrs;
        actualAttrs = attrs || {};
      } else {
        componentName = moduleName;
        actualAttrs = componentNameOrAttrs || {};
      }
      if (!componentName) {
        throw new Error('subject: No component name. Pass it explicitly: this.subject("component-name")');
      }
      var factory = owner.factoryFor('component:' + componentName);
      if (!factory) {
        throw new Error('subject: Component "component:' + componentName + '" not found. Try this.subject("' + componentName + '") or check the component is registered.');
      }
      return factory.create(actualAttrs);
    };
  }
  resetPersistenceForTest(this.owner);
  resetStashesForTest(this.owner);
  if (this.owner) {
    LingoLinq.store = this.owner.lookup('service:store');
    LingoLinq.appState = this.owner.lookup('service:app-state');
    LingoLinq.session = this.owner.lookup('service:session');
    stub(LingoLinq.session, 'reload', function() {
      LingoLinq.session.reloaded = true;
    });
    // Prime ContentGrabbers so window.cg is set before tests that need it run
    this.owner.lookup('service:content-grabbers');
  } else if (!LingoLinq.session || LingoLinq.session.isDestroyed) {
    LingoLinq.session = EmberObject.create({});
    stub(LingoLinq.session, 'reload', function() {
      LingoLinq.session.reloaded = true;
    });
  }
  if (app_state.reset) {
    app_state.reset();
  }
  LingoLinq.all_wait = false;
  var modalTests = isModalTestModule((typeof QUnit !== 'undefined' && QUnit.config && QUnit.config.currentModule) ? QUnit.config.currentModule.name : null);
  var utteranceTests = isUtteranceTestModule((typeof QUnit !== 'undefined' && QUnit.config && QUnit.config.currentModule) ? QUnit.config.currentModule.name : null);
  if (modalTests) {
    setupModalTestHarness();
  } else {
    modal.last_promise = null;
    var modalRoute = EmberObject.create({
      controllerFor: function() {
        return EmberObject.create({});
      },
      render: function() { },
      disconnectOutlet: function() { }
    });
    if (this.owner) {
      setOwner(modalRoute, this.owner);
    }
    modal.setup(modalRoute);
  }
  if (utteranceTests) {
    setupUtteranceTestHarness();
  }
  boundClasses.setup(true);
});

afterEach(function() {
  var moduleName = (typeof QUnit !== 'undefined' && QUnit.config && QUnit.config.currentModule) ? QUnit.config.currentModule.name : null;
  if (isModalTestModule(moduleName)) {
    teardownModalTestHarness();
  }
  if (isUtteranceTestModule(moduleName)) {
    teardownUtteranceTestHarness();
  }
  capabilities.setup_database.already_tried = false;
  capabilities.setup_database.already_tried_deleting = false;
  capabilities.setup_database.already_tried_deleting_all = false;
  capabilities.dbman = capabilities.dbman || capabilities.original_dbman;
  if (app_state && !app_state.isDestroyed && typeof app_state.set === 'function') {
    app_state.set('label_locale', null);
    app_state.set('vocalization_locale', null);
  }
  while(queryLog.length > 0) {
    queryLog.pop();
  }
  queryLog.fixtures = [];
  queryLog.real_lookup = false;
  $.ajax.metas = [];
  buttonTracker.scanning_enabled = false;
  // Previously: waitsFor/runs delayed LingoLinq.app.destroy. We no longer destroy
  // (all tests share the app). Run sync to avoid hangs from the waitsFor/runs pattern.
});

// PuppeteerChrome exposes window.localStorage as a getter-only property.
// Tests that need isolation must replace it via defineProperty, not assignment.
function replaceLocalStorage() {
  var store = {};
  var fake = {
    getItem: function(k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
    setItem: function(k, v) { store[k] = String(v); },
    removeItem: function(k) { delete store[k]; },
    clear: function() { store = {}; },
    key: function(i) { return Object.keys(store)[i] || null; },
    get length() { return Object.keys(store).length; }
  };
  var previous = Object.getOwnPropertyDescriptor(window, 'localStorage');
  Object.defineProperty(window, 'localStorage', { configurable: true, value: fake });
  return function restoreLocalStorage() {
    if (previous) {
      Object.defineProperty(window, 'localStorage', previous);
    } else {
      delete window.localStorage;
    }
  };
}

function asStoreRecordArray(items) {
  items = items || [];
  return {
    forEach: function(cb) {
      items.forEach(cb);
    },
    map: function(cb) {
      return items.map(cb);
    },
    find: function(cb) {
      for (var i = 0; i < items.length; i++) {
        if (cb(items[i], i)) {
          return items[i];
        }
      }
      return undefined;
    },
    filter: function(cb) {
      return asStoreRecordArray(items.filter(cb));
    },
    length: items.length
  };
}

function asEmberArray(items) {
  var arr = (items || []).slice();
  arr.pushObject = function(o) {
    this.push(o);
    return o;
  };
  arr.slice = function() {
    return asEmberArray(Array.prototype.slice.apply(this, arguments));
  };
  arr.mapBy = function(key) {
    return asEmberArray(this.map(function(i) {
      if (i && typeof i.get === 'function') {
        return i.get(key);
      }
      return i ? i[key] : undefined;
    }));
  };
  arr.findBy = function(key, val) {
    for (var idx = 0; idx < this.length; idx++) {
      var i = this[idx];
      var candidate = (i && typeof i.get === 'function') ? i.get(key) : i[key];
      if (candidate === val) {
        return i;
      }
    }
    return undefined;
  };
  arr.uniq = function() {
    return asEmberArray(this.filter(function(item, index) {
      return this.indexOf(item) === index;
    }, this));
  };
  arr.toArray = function() {
    return this.slice();
  };
  return arr;
}

function fakeBlob(parts, options) {
  if (typeof Blob !== 'undefined') {
    return new Blob(parts, options);
  }
  return {
    type: (options && options.type) || '',
    size: (parts || []).reduce(function(n, part) {
      if (typeof part === 'string') {
        return n + part.length;
      }
      return n + (part && part.length ? part.length : 0);
    }, 0)
  };
}

function stubComputed(object, key, value) {
  Object.defineProperty(object, key, {
    configurable: true,
    enumerable: true,
    get: function() {
      return value;
    }
  });
}

function ensureUserReload(user) {
  if (user && typeof user.reload !== 'function' && typeof user.get === 'function') {
    user.reload = function() {
      return RSVP.resolve(user);
    };
  }
  return user;
}

var USER_RELOAD_PATCH_KEYS = {
  currentUser: true,
  referenced_user: true,
  referenced_speak_mode_user: true,
  speakModeUser: true,
  sessionUser: true
};

function patchAppStateUserReload(appStateSvc) {
  if (!appStateSvc || appStateSvc._testUserReloadPatch || typeof appStateSvc.set !== 'function') {
    return;
  }
  var origSet = appStateSvc.set.bind(appStateSvc);
  appStateSvc.set = function(key, value) {
    if (USER_RELOAD_PATCH_KEYS[key]) {
      ensureUserReload(value);
    }
    return origSet(key, value);
  };
  appStateSvc._testUserReloadPatch = true;
  Object.keys(USER_RELOAD_PATCH_KEYS).forEach(function(key) {
    ensureUserReload(appStateSvc.get(key));
  });
}

function userRecordStub(owner, attrs) {
  var store = (owner && owner.lookup('service:store')) || LingoLinq.store;
  if (!store || typeof store.createRecord !== 'function') {
    return EmberObject.create(Object.assign({ id: 'test-user' }, attrs || {}));
  }
  var user = store.createRecord('user', Object.assign({
    id: 'test-user-' + String(Date.now())
  }, attrs || {}));
  return ensureUserReload(user);
}

function isModalTestModule(moduleName) {
  if (moduleName === 'modal') {
    return true;
  }
  if (typeof QUnit === 'undefined' || !QUnit.config) {
    return false;
  }
  var current = QUnit.config.current;
  if (current && current.module && current.module.name === 'modal') {
    return true;
  }
  var testName = current && current.testName;
  return !!(testName && /^modal(\s|-)/.test(testName));
}

function unstubModalHarnessMethods() {
  var methods = ['open', 'notice', 'flash', 'warning', 'error', 'success', '_getService', '_getAppState'];
  if (!stub.stubs) {
    return;
  }
  stub.stubs.slice().reverse().forEach(function(entry) {
    if (entry[0] !== modal || methods.indexOf(entry[1]) < 0) {
      return;
    }
    var obj = entry[0];
    var method = entry[1];
    var stash = entry[2];
    if (!obj || obj.isDestroyed) {
      return;
    }
    try {
      if (typeof emberSet === 'function' && typeof emberGet === 'function') {
        emberSet(obj, method, stash);
      } else {
        obj[method] = stash;
      }
    } catch (e) {
      try { obj[method] = stash; } catch (e2) { /* mid-teardown */ }
    }
    var idx = stub.stubs.indexOf(entry);
    if (idx >= 0) {
      stub.stubs.splice(idx, 1);
    }
  });
}

function setupModalTestHarness() {
  unstubModalHarnessMethods();
  modal.last_promise = null;
  modal.last_template = null;
  modal._component_based_template = null;
  modal.resume_scanning = false;
  stub(modal, '_getService', function() { return null; });
  stub(modal, '_getAppState', function() { return null; });
  if (!LingoLinq._modalTestRoute) {
    LingoLinq._modalTestRoute = EmberObject.extend({
      render: function() {
        this.lastRender = arguments;
      },
      disconnectOutlet: function() {
        this.lastDisconnect = arguments;
      }
    }).create();
  }
  LingoLinq._modalTestRoute.lastRender = null;
  modal.setup(LingoLinq._modalTestRoute);
}

function teardownModalTestHarness() {
  modal.last_promise = null;
  modal.last_template = null;
  modal._component_based_template = null;
  modal.resume_scanning = false;
  try {
    modal.close(true);
  } catch (e) { /* mid-teardown */ }
}

function isUtteranceTestModule(moduleName) {
  if (moduleName === 'utterance') {
    return true;
  }
  if (typeof QUnit === 'undefined' || !QUnit.config) {
    return false;
  }
  var current = QUnit.config.current;
  if (current && current.module && current.module.name === 'utterance') {
    return true;
  }
  var testName = current && current.testName;
  return !!(testName && /^utterance(\s|-)/.test(testName));
}

function setupUtteranceTestHarness() {
  var stashesSvc = stashesTarget();
  var appStateSvc = appStateTarget();
  var persistenceSvc = persistenceTarget();
  if (!LingoLinq._utteranceTestController) {
    LingoLinq._utteranceTestController = EmberObject.extend({
      vocalize: function() {
        this.vocalized = true;
      }
    }).create();
  } else {
    LingoLinq._utteranceTestController.set('vocalized', false);
  }
  if (stashesSvc && stashesSvc.persist) {
    stashesSvc.persist('working_vocalization', []);
    stashesSvc.persist('ghost_utterance', false);
  }
  if (appStateSvc && appStateSvc.set) {
    appStateSvc.set('button_list', []);
    appStateSvc.set('insertion', null);
    appStateSvc.set('shift', null);
    appStateSvc.set('inflection_shift', null);
    appStateSvc.set('clearable_history', 0);
    appStateSvc.set('sessionUser', EmberObject.create({
      preference: EmberObject.create({ auto_capitalize: false })
    }));
  }
  Button.load_actions();
  utterance.scope = window;
  utterance.setup(LingoLinq._utteranceTestController, appStateSvc, persistenceSvc, stashesSvc);
  utterance.set('rawButtonList', []);
  utterance.set('hint_button', null);
  utterance.set('list_vocalized', false);
  utterance.set('clear_on_vocalize', true);
}

function teardownUtteranceTestHarness() {
  utterance.scope = window;
  try {
    if (speecher && typeof speecher.stop === 'function') {
      speecher.stop('all');
    }
  } catch (e) { /* mid-teardown */ }
}

function stubModalSafe(owner) {
  stub(modal, 'open', function() { return RSVP.resolve(); });
  stub(modal, 'notice', function() { return RSVP.resolve(); });
  stub(modal, 'flash', function() { });
  stub(modal, 'warning', function() { });
  stub(modal, 'error', function() { });
  stub(modal, 'success', function() { });
  if (owner) {
    try {
      var modalSvc = owner.lookup('service:modal');
      if (modalSvc && !modalSvc.isDestroyed) {
        stub(modalSvc, 'open', function() { return RSVP.resolve(); });
        stub(modalSvc, 'notice', function() { return RSVP.resolve(); });
        stub(modalSvc, 'flash', function() { });
        stub(modalSvc, 'warning', function() { });
        stub(modalSvc, 'error', function() { });
        stub(modalSvc, 'success', function() { });
      }
      var appStateSvc = owner.lookup('service:app-state');
      if (appStateSvc && !appStateSvc.isDestroyed) {
        stub(appStateSvc, 'show_toast', function() { });
      }
    } catch (e) { /* owner mid-teardown */ }
  }
}

function boardModelStub(attrs) {
  return EmberObject.create(Object.assign({
    contextualized_buttons: function() {
      return this.get('buttons') || [];
    },
    variant_image_urls: function() {
      return {};
    },
    add_classes: function() {},
    set_fast_html: function() {},
    render_fast_html: function() {
      return {};
    },
    clear_real_time_changes: function() { },
    load_word_suggestions: function() {
      return RSVP.resolve();
    }
  }, attrs || {}));
}

export { queryLog, fakeAudio, fakeRecorder, fakeMediaRecorder, fakeCanvas, fakeBlob, easyPromise, db_wait, fake_dbman, queue_promise, result_wrap, replaceLocalStorage, asStoreRecordArray, asEmberArray, stubComputed, boardModelStub, userRecordStub, stubModalSafe, setupModalTestHarness, teardownModalTestHarness, setupUtteranceTestHarness, teardownUtteranceTestHarness, ensureUserReload, persistenceTarget, stubNavigatorGetUserMedia };
