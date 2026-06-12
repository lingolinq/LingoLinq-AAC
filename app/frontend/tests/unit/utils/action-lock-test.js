import { module, test } from 'qunit';
import RSVP from 'rsvp';
import actionLock from 'frontend/utils/action-lock';
import modal from 'frontend/utils/modal';

module('Unit | Utility | action lock', function(hooks) {
  var originalWarning;
  var warnings;

  hooks.beforeEach(function() {
    actionLock.reset();
    warnings = [];
    originalWarning = modal.warning;
    modal.warning = function(text) {
      warnings.push(text);
    };
  });

  hooks.afterEach(function() {
    modal.warning = originalWarning;
    actionLock.reset();
  });

  test('it blocks duplicate calls until the action resolves', function(assert) {
    var done = assert.async();
    var release;
    var calls = 0;
    var promise = new RSVP.Promise(function(resolve) {
      release = resolve;
    });

    var first = actionLock.run('save:test', function() {
      calls++;
      return promise;
    });
    var duplicate = actionLock.run('save:test', function() {
      calls++;
      return RSVP.resolve();
    });

    assert.equal(calls, 1, 'only the first action runs');
    assert.equal(duplicate, false, 'duplicate action is blocked');
    assert.equal(warnings.length, 1, 'duplicate action warns once');

    release();
    first.then(function() {
      assert.equal(actionLock.isLocked('save:test'), false, 'lock clears after promise resolution');
      done();
    });
  });

  test('it clears locks after promise rejection', function(assert) {
    var done = assert.async();
    var rejectAction;
    var promise = new RSVP.Promise(function(resolve, reject) {
      rejectAction = reject;
    });

    var first = actionLock.run('delete:test', function() {
      return promise;
    });

    assert.equal(actionLock.isLocked('delete:test'), true, 'action starts locked');
    rejectAction();
    first.then(null, function() {
      assert.equal(actionLock.isLocked('delete:test'), false, 'lock clears after promise rejection');
      done();
    });
  });

  test('it throttles duplicate warnings and supports timeout cleanup', function(assert) {
    var done = assert.async();

    actionLock.run('launch:test', function() {
      return true;
    }, {timeout: 5});
    actionLock.run('launch:test', function() {
      return true;
    }, {warningInterval: 1000});
    actionLock.run('launch:test', function() {
      return true;
    }, {warningInterval: 1000});

    assert.equal(warnings.length, 1, 'repeated duplicate warnings are throttled');

    setTimeout(function() {
      assert.equal(actionLock.isLocked('launch:test'), false, 'timeout clears fire-and-forget locks');
      done();
    }, 25);
  });
});
