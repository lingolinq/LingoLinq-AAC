/*jshint -W079 */
// Must use the same QUnit instance as ember-qunit/test-helper so jasmine-style tests register
// and run. window.QUnit (qunit-standalone.js) can be a different instance than the 'qunit' module.
import * as QUnit from 'qunit';
import { setupRenderingTest, setupTest, setupApplicationTest } from 'ember-qunit';
import EmberObject from '@ember/object';
import { run as emberRun } from '@ember/runloop';
import { set as emberSet, get as emberGet } from '@ember/object';

var names = [];
var all_befores = [[]];
var all_afters = [[]];
var all_tests = [];
var current_test_id = 0;
var current_afters = [];
var waiting = {};

var assert = null;
function test_wrap(name, instance, befores, afters, lookup) {
  var pre = [];
  var post = [];
  all_befores.forEach(function(list) {
    list.forEach(function(callback) {
      pre.push(callback);
    });
  });
  all_afters.forEach(function(list) {
    list.forEach(function(callback) {
      post.push(callback);
    });
  });
  current_afters = post;
  QUnit.test(name, async function(current_assert) {
    var _this = this;
    assert = current_assert;
    emberRun(function() {
      pre.forEach(function(callback) {
        // try {
          callback.call(_this);
        // } catch(e) {
        //   console.error(e);
        // }
      });

      var this_arg = _this;

      if (lookup) {
        this_arg = lookup;
      }

      current_test_id++;
      // try {
        instance.call(this_arg);
      // } catch(e) {
      //   console.error(e);
      // }

      waitsFor(function() { return (waiting[current_test_id] || 0) <= 1; });
      runs(function() {
        current_afters = [];
        post.forEach(function(callback) {
          callback.call(_this);
        });
      });
    });
  });
}

var container_lookup = null;
var describe = function(name, lookup, callback) {
  if(!callback) {
    callback = lookup;
  } else {
    if(names.length === 0) { container_lookup = lookup; }
  }
  var add_test = function() {
    names.push(name);
    all_tests.push([]);
    all_befores.push([]);
    all_afters.unshift([]);
    callback();
    all_tests[all_tests.length - 1].forEach(function(args) {
      if(args[1]) {
        test_wrap(names.join(" ") + " - " + args[0], args[1], all_befores, all_afters, container_lookup);
      } else {
        console.debug('PENDING TEST: ' + names.join(" ") + " - " + args[0]);
      }
    });
    names.pop();
    all_befores.pop();
    all_afters.shift();
    all_tests.pop();
  }
  if(names.length === 0) {
    QUnit.module(name, function(hooks) {
      setupTest(hooks);
      add_test();
    });
  } else {
    add_test();
  }
};
var context = describe;
var it = function(rule, testing) {
  all_tests[all_tests.length - 1].push([rule, testing]);
};
var expect = function(data) {
  var expectation = {};
  expectation.toEqual = function(arg) {
    if((data === undefined && arg === null) || (data === null && arg === undefined)) {
      assert.ok(true, 'both empty values');
    } else if((typeof data === 'object') || (typeof arg === 'object')) {
      assert.deepEqual(data, arg);
    } else {
      if(!assert) { console.error('not run as part of a test'); }
      assert.equal(data, arg);
    }
  };
  expectation.toBeFalsy = function() {
    var falsy = !!data;
    assert.ok(falsy === false, data + ' should be falsey');
  };

  expectation.toNotEqual = function(arg) {
    if((data === undefined && arg === null) || (data === null && arg === undefined)) {
      assert.ok(false, data + " should not equal " + arg);
    } else if((typeof data === 'object') || (typeof arg === 'object')) {
      assert.notDeepEqual(data, arg);
    } else {
      assert.notEqual(data, arg);
    }
  };
  expectation.toBeGreaterThan = function(arg) {
    assert.ok(data > arg, data + ' should be greater than ' + arg);
  };
  expectation.toBeLessThan = function(arg) {
    assert.ok(data < arg, data + ' should be less than ' + arg);
  };
  expectation.toMatch = function(regex) {
    if(typeof regex == 'string') {
      regex = new RegExp(regex);
    }
    assert.ok(data && data.match(regex), data + ' should match ' + regex.toString());
  };
  expectation.toThrow = function(message) {
    var error = null;
    try {
      data();
    } catch(e) {
      error = e;
    }
    if(error) {
      if(message) {
        assert.equal(message, error.message || error);
      } else {
        assert.ok(true);
      }
    } else {
      assert.ok(false, 'expected error, none was raised');
    }
  };
  expectation.not = {
    toEqual: expectation.toNotEqual,
    toThrow: function() {
      var error = null;
      try {
        data();
      } catch(e) {
        error = e;
      }
      if(error) {
        assert.ok(false, 'expected no error, got ' + error.message);
      } else {
        assert.ok(true);
      }
    }
  };

  return expectation;
};

var lastWaitsFor = null;
var waitsFor = function(callback) {
  lastWaitsFor = callback;
};

var runs = function(callback) {
  callback = callback || function() { assert.ok(true); };
  var id = current_test_id;
  var wait = lastWaitsFor;
  var attempts = 0;
  waiting[current_test_id] = waiting[current_test_id] || 0;
  waiting[current_test_id]++;
  var async_done = assert.async();
  var done = function() {
    if(id == current_test_id) {
      waiting[current_test_id]--;
      async_done();
    }
  };
  var try_again = function() {
    if(wait()) {
      emberRun(callback);
      done();
    } else if(id == current_test_id) {
      attempts++;
      if(attempts >= 55) {
        assert.ok(false, 'condition failed for more than 5000ms');
        done();
      } else {
        var delay = 1;
        if(attempts  < 10) { delay = 10; }
        else if(attempts > 3) { delay = 100; }
        setTimeout(try_again, delay);
      }
    }
  };
  try_again();
};

var beforeEach = function(callback) {
  all_befores[all_befores.length - 1].push(callback);
};
var afterEach = function(callback) {
  all_afters[all_afters.length - 1].push(callback);
};

var stub = function(object, method, replacement) {
  stub.stubs = stub.stubs || [];
  var stash = object[method];
  emberSet(object, method, replacement);
  //console.log(stubs);
  stub.stubs.push([object, method, stash]);
};
stub.stubs = [];


export {context, describe, it, expect, beforeEach, afterEach, waitsFor, runs, stub};
