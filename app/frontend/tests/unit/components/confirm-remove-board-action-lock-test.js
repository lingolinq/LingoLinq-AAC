import { module, test } from 'qunit';
import Service from '@ember/service';
import { setupTest } from 'ember-qunit';
import RSVP from 'rsvp';
import persistence from 'frontend/utils/persistence';
import modal from 'frontend/utils/modal';
import actionLock from 'frontend/utils/action-lock';

module('Unit | Component | confirm remove board action lock', function(hooks) {
  setupTest(hooks);

  var originalAjax;
  var originalClose;
  var originalWarning;

  hooks.beforeEach(function() {
    actionLock.reset();
    originalAjax = persistence.ajax;
    originalClose = modal.close;
    originalWarning = modal.warning;
  });

  hooks.afterEach(function() {
    persistence.ajax = originalAjax;
    modal.close = originalClose;
    modal.warning = originalWarning;
    actionLock.reset();
  });

  test('remove action only submits once while the request is in progress', function(assert) {
    var done = assert.async();
    var ajaxCalls = 0;
    var warnings = 0;
    var resolveAjax;
    var board = {
      removed: false,
      get: function(key) {
        if(key === 'id') { return 'board-1'; }
      },
      set: function(key, value) {
        this[key] = value;
      }
    };
    var user = {
      get: function(key) {
        if(key === 'id') { return 'user-1'; }
      }
    };
    var model = {
      action: 'delete',
      board: board,
      user: user
    };

    this.owner.register('service:modal', Service.extend({
      getSettingsFor: function() {
        return model;
      }
    }));

    persistence.ajax = function() {
      ajaxCalls++;
      return new RSVP.Promise(function(resolve) {
        resolveAjax = resolve;
      });
    };
    modal.close = function() {};
    modal.warning = function() {
      warnings++;
    };

    var component = this.owner.factoryFor('component:confirm-remove-board').create();
    component.send('remove');
    component.send('remove');

    assert.equal(ajaxCalls, 1, 'only one remove request is submitted');
    assert.equal(warnings, 1, 'duplicate click shows an in-progress warning');

    resolveAjax();
    RSVP.resolve().then(function() {
      assert.equal(board.removed, true, 'successful request still completes normally');
      done();
    });
  });
});
