/**
  @class JasmineAdapter
  @namespace Ember.Test
  v 0.1
*/
Ember.Test.JasmineAdapter = Ember.Test.Adapter.extend({
  asyncRunning: false,

  asyncStart: function() {
    Ember.Test.adapter.asyncRunning = true;
    waitsFor(Ember.Test.adapter.asyncComplete);
  },

  asyncComplete: function() {
    return !Ember.Test.adapter.asyncRunning;
  },

  asyncEnd: function() {
    Ember.Test.adapter.asyncRunning = false;
  },

  exception: function(error) {
    if(error) { debugger; }
    expect(Ember.inspect(error)).toBeFalsy();
  }
});

Ember.Test.adapter = Ember.Test.JasmineAdapter.create();

document.write('<div id="test-app-container" style="position: fixed; bottom: 0; right: 0; width: 400px; height: 400px; background: #fff;"><div id="ember-testing"></div></div>');
LingoLinq.rootElement = '#ember-testing';
LingoLinq.setupForTesting();
LingoLinq.injectTestHelpers();
LingoLinq.testing = true;

var queryLog = [];
queryLog.log = function(event) {
  queryLog.push(event);
};
queryLog.respondAndLog = function(event, defaultResponse) {
  if(!queryLog.fixtures) { return defaultResponse; }
  queryLog.log(event);
  for(var idx = 0; idx < queryLog.fixtures.length; idx++) {
    var fixture = queryLog.fixtures[idx];
    if(fixture.method == event.method && fixture.type == event.type) {
      var found = false;
      if(fixture.method == 'GET' && fixture.id && fixture.id == event.id) {
        found = true;
        // find
      } else if(fixture.method == 'POST' && fixture.compare && fixture.compare(event.object)) {
        found = true;
        // createRecord
      } else if(fixture.method == 'PUT' && fixture.compare && fixture.compare(event.object)) {
        found = true;
        // updateRecord
      } else if(fixture.method == 'GET' && fixture.query && JSON.stringify(fixture.query) == JSON.stringify(event.query)) {
        found = true;
        // findQuery
      }
      if(found) { 
        return fixture.response;
      }
    }
  }
  return defaultResponse;
};
queryLog.defineFixture = function(fixture) {
  queryLog.fixtures = queryLog.fixtures || [];
  queryLog.fixtures.push(fixture);
};

fake_dbman = function() {
  var repo = {};
  var wait_call = function(callback, argument) {
    setTimeout(function() {
      callback && callback(argument);
    }, Math.random() * 20);
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
      console.log("store " + record.id);
      repo[store] = repo[store] || [];
      
      var original_id = record[index_id(store)].replace(new RegExp("^" + store + "::"), '');
      console.log("remove " + original_id);
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
  return result;
};

function fakeAudio() {
  return Ember.Object.extend({
    addEventListener: function() { this.listenersAdded = true; },
    removeEventListener: function() { this.listenersRemoved = true; },
    pause: function() { this.pauseCalled = true; this.playing = false; },
    play: function() { this.playCalled = true; this.playing = true; }
  }).create({currentTime: 123});
};

function fakeRecorder() {
  return Ember.Object.extend({
    stop: function() {
      this.stopped = true;
    },
    start: function() {
      this.started = true;
    }
  }).create();
};

function fakeCanvas() {
  return {
    getContext: function() {
      return {
        drawImage: function() { }
      }
    },
    toDataURL: function() { return 'picture'; }
  };
};

function db_wait(callback) {
  waitsFor(function() { return capabilities.db && capabilities.dbman; });
  var _this = this;
  var ready = false;
  runs(function() {
    capabilities.dbman.clear('deletion', function() {
      ready = true;
    });
  });
  waitsFor(function() { return ready; });
  runs(function() {
    Ember.run(_this, callback);
  });
}
function too_fast() {
  var ready = false;
  setTimeout(function() {
    ready = true;
  }, 1);
  waitsFor(function() {
    return ready;
  });
}
function wait(callback) {
  Ember.run.later(callback, 10);
}

function easyPromise() {
  var res = null, rej = null;
  var promise = new Ember.RSVP.Promise(function(resolve, reject) {
    res = resolve;
    rej = reject;
  });
  promise.resolve = function(data) { 
    Ember.run(function() {
      promise.resolved = true; res(data); 
    });
  };
  // TODO: default handler for reject trigger an exception, which is bad
  promise.reject = function() { 
    Ember.run(function() {
      promise.rejected = true; 
    });
  };
  return promise;
};

LingoLinq.ApplicationAdapter = DS.RESTAdapter.extend(persistence.DSExtend, {
  find: function(store, type, id) {
    if(queryLog.real_lookup) {
      return this._super.apply(this, arguments);
    }
    var nothing = Ember.RSVP.reject('');
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
    var nothing = Ember.RSVP.reject('');
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
    var nothing = Ember.RSVP.reject('');
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
    debugger
  },
  findAll: function() {
    if(queryLog.real_lookup) {
      return this._super.apply(this, arguments);
    }
    debugger
  },
  findQuery: function(store, type, query) {
    if(queryLog.real_lookup) {
      return this._super.apply(this, arguments);
    }
    var res = {};
    res[type.typeKey] = []
    var nothing = Ember.RSVP.resolve(res);
    return queryLog.respondAndLog({
      method: 'GET',
      lookup: 'findQuery',
      store: store,
      type: type,
      query: query
    }, nothing);
  }
});
beforeEach(function() {
  persistence.set('online', true);
  app_state.reset();
  LingoLinq.all_wait = false;
});
afterEach(function() {  
  while(queryLog.length > 0) {
    queryLog.pop();
  }
  queryLog.fixtures = [];
  queryLog.real_lookup = false;
  too_fast();
});

window.raw_it = window.it;
window.it = function(str, callback) {
  if(callback) {
    raw_it(str, function() {
      Ember.run(callback);
    });
  } else {
    raw_it(str);
  }
}

var stubs = [];
function stub(object, method, replacement) {
  stubs = stubs || [];
  var stash = object[method];
  object[method] = replacement;
  //console.log(stubs);
  stubs.push([object, method, stash]);
}

afterEach(function() {
  stubs.reverse().forEach(function(list) {
    list[0][list[1]] = list[2];
  });
  stubs = [];
});

// var realSpeech = speechSynthesis;
// function FakeSpeechSynthesis() {
//     var speech = this;
//     var utterances = [];
//     var currentUtterance = null;
//     function nextUtterance() {
//       currentUtterance = null;
//       if(utterances.length > 0) {
//         if(speech.paused) {
//           speech.speaking = false;
//           speech.pending = true;
//         } else {
//           speech.speaking = true;
//           var utterance = utterances.shift();
//           currentUtterance = utterance;
//           speech.pending = utterances.length > 0;
//           utterance.bind('end', nextUtterance);
//           utterance.beginSpeaking();
//         }
//       } else {
//         speech.speaking = false;
//         speech.pending = false;
//       }
//     }
//   
//     this.speaking = false;
//     this.pending = false;
//     this.paused = false;
//     this.speak = function(utterance) {
//       utterance.trigger('end');
//     };
//     this.cancel = function() {
//     };
//     this.pause = function() {
//     };
//     this.resume = function() {
//     };
//     this.getVoices = function() {
//       return [];
//     };
// }
// var fakeSpeech = new FakeSpeechSynthesis();
