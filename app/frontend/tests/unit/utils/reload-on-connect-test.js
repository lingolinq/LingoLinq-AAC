import { module, test } from 'qunit';
import EmberObject from '@ember/object';
import { reload_on_connect } from 'frontend/utils/reload_on_connect';

module('Unit | Utility | reload_on_connect', function() {
  function sent_for(props, online) {
    var sent = [];
    var controller = EmberObject.extend({ send: function(name) { sent.push(name); } }).create(props);
    reload_on_connect(controller, EmberObject.create({online: online}));
    return sent;
  }

  test('a board that failed to load reloads on reconnect', function(assert) {
    assert.deepEqual(sent_for({}, true), ['refreshData']);
    assert.deepEqual(sent_for({}, false), [], 'still offline');
  });

  test('a loaded board stays as it is', function(assert) {
    assert.deepEqual(sent_for({model: {id: '1_7'}}, true), []);
  });

  test('a device copy stays until the next board, so the board never changes mid-sentence', function(assert) {
    assert.deepEqual(sent_for({model: {id: '1_7'}, served_from_device: true}, true), []);
  });
});
