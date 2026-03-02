/* global QUnit */
import Test from 'ember-testing';
import EmberObject from '@ember/object';
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
  stub
} from './jasmine';
import app_state from '../../utils/app_state';
import capabilities from '../../utils/capabilities';
import persistence from '../../utils/persistence';
import lingoLinqExtras from '../../utils/extras';
import stashes from '../../utils/_stashes';
import session from '../../utils/session';
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
    waitsFor(function() { return testAdapter.asyncComplete(); });
  },

  asyncComplete: function() {
    return !testAdapter.asyncRunning;
  },

  asyncEnd: function() {
    testAdapter.asyncRunning = false;
  },

  exception: function(error) {
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
    event.simple_type = event.type.modelName || event.type.toString().split(/:/)[1];
  }
  queryLog.push(event);
};
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
      } else if(fixture.method == 'GET' && fixture.query && JSON.stringify(fixture.query) == JSON.stringify(event.query)) {
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
        return fixture.response;
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
    }
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
    var res = {};
    res[type.typeKey] = [];
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
beforeEach(function() {
  if (!LingoLinq.session) {
    LingoLinq.session = EmberObject.create({});
  }
  stub(LingoLinq.session, 'reload', function() {
    LingoLinq.session.reloaded = true;
  });
  LingoLinq.ignore_filesystem = true;
  capabilities.dbman = capabilities.dbman || capabilities.original_dbman;
  window.cough_drop_readiness = false;
  // TODO: https://alexlafroscia.com/ember-upgrade-to-new-qunit-api/
  // App = startApp();
  // App.rootElement = '#ember-testing';
  persistence.set('online', true);
  persistence.storing_urls = null;
  persistence.url_cache = null;
  persistence.url_uncache = null;
  persistence.known_missing = null;
  persistence.sync_actions = null;
  stashes.set('online', true);
  if (this.owner) {
    LingoLinq.store = this.owner.lookup('service:store');
    LingoLinq.appState = this.owner.lookup('service:app-state');
    // Prime ContentGrabbers so window.cg is set before tests that need it run
    this.owner.lookup('service:content-grabbers');
    var owner = this.owner;
    var moduleName = (typeof QUnit !== 'undefined' && QUnit.config && QUnit.config.currentModule) ? QUnit.config.currentModule.name : null;
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
  if (app_state.reset) {
    app_state.reset();
  }
  LingoLinq.all_wait = false;
});

afterEach(function() {
  capabilities.setup_database.already_tried = false;
  capabilities.setup_database.already_tried_deleting = false;
  capabilities.setup_database.already_tried_deleting_all = false;
  capabilities.dbman = capabilities.dbman || capabilities.original_dbman;
  app_state.set('label_locale', null);
  app_state.set('vocalization_locale', null);
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

afterEach(function() {
  stub.stubs.reverse().forEach(function(list) {
    emberSet(list[0], list[1], list[2]);
  });
  stub.stubs = [];
});

export { queryLog, fakeAudio, fakeRecorder, fakeMediaRecorder, fakeCanvas, easyPromise, db_wait, fake_dbman, queue_promise, result_wrap };
