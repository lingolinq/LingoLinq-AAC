import { module, test } from 'qunit';
import EmberObject from '@ember/object';
import Service from '@ember/service';
import { setupTest } from '../../helpers';
import modal from 'frontend/utils/modal';

/* THE BASIC BOARD PAGE'S "SET AS HOME BOARD" AFTER A "TRY" (requested 2026-09-30). Shown on the
 * board-alt page, in normal mode, for the board the user tried from the board picker. It makes that
 * board the home board of the user the picker was choosing for: the communicator when an SLP
 * opened the picker for them, not the SLP. It uses the same copy-or-reuse as "Pick this Board"
 * (utils/board-copy.js), injected here so the test can observe the call.
 */
module('Unit | Component | basic-try-home-button', function(hooks) {
  setupTest(hooks);
  // The flash messages need an app-level setup a unit test does not have; record them instead.
  var messages, realSuccess, realError;
  hooks.beforeEach(function() {
    messages = [];
    realSuccess = modal.success; realError = modal.error;
    modal.success = function(text) { messages.push(['success', text]); };
    modal.error = function(text) { messages.push(['error', text]); };
  });
  hooks.afterEach(function() { modal.success = realSuccess; modal.error = realError; });

  function setup(context, opts) {
    var o = opts || {};
    var calls = { copy: [], findRecord: [], transitions: [] };
    var slp = EmberObject.create({ id: '1_3', user_name: 'example' });
    var aiden = EmberObject.create({ id: '1_7', user_name: 'aiden_parker' });
    context.owner.unregister('service:app-state');
    context.owner.register('service:app-state', Service.extend({
      currentUser: slp,
      sessionUser: slp,
      speak_mode: !!o.speak,
      edit_mode: !!o.edit,
      label_locale: 'en',
      currentBoardState: { key: o.boardKey || 'public/core-60' },
      basic_try_home: o.marker === undefined ? { key: 'public/core-60', user_id: '1_7', user_name: 'aiden_parker' } : o.marker
    }));
    context.owner.unregister('service:store');
    context.owner.register('service:store', Service.extend({
      findRecord: function(type, id) { calls.findRecord.push(id); return Promise.resolve(id === '1_7' ? aiden : slp); }
    }));
    context.owner.unregister('service:router');
    context.owner.register('service:router', Service.extend({
      transitionTo: function() { calls.transitions.push(Array.prototype.slice.call(arguments)); }
    }));
    var board = EmberObject.create({ key: 'public/core-60' });
    var component = context.owner.factoryFor('component:basic-try-home-button').create({
      board: board,
      copyAsHome: function(b, user, locale) { calls.copy.push({ board: b, user: user, locale: locale }); return Promise.resolve(EmberObject.create({ key: 'aiden_parker/core-60' })); }
    });
    return { component: component, calls: calls, appState: context.owner.lookup('service:app-state'), board: board, aiden: aiden };
  }

  test('shows on the tried board, in normal mode', function(assert) {
    assert.true(setup(this).component.get('shown'));
  });

  test('hidden on another board, in speak mode, in edit mode, or with no try', function(assert) {
    assert.false(setup(this, { boardKey: 'public/other' }).component.get('shown'), 'another board');
    assert.false(setup(this, { speak: true }).component.get('shown'), 'speak mode');
    assert.false(setup(this, { edit: true }).component.get('shown'), 'edit mode');
    assert.false(setup(this, { marker: null }).component.get('shown'), 'no try recorded');
  });

  test("sets the tried board as the COMMUNICATOR's home board, then opens their copy", async function(assert) {
    var t = setup(this);
    await t.component.setAsHome();
    assert.deepEqual(t.calls.findRecord, ['1_7'], 'the communicator the picker was for is loaded');
    assert.strictEqual(t.calls.copy.length, 1, 'copied or reused once');
    assert.strictEqual(t.calls.copy[0].user, t.aiden, 'for the communicator, not the signed-in SLP');
    assert.strictEqual(t.calls.copy[0].board, t.board, 'the board on screen');
    assert.deepEqual(t.calls.transitions, [['board', 'aiden_parker/core-60']], 'then the new home board opens');
    assert.notOk(t.appState.get('basic_try_home'), 'the try marker is cleared');
    assert.strictEqual(messages.length, 1, 'one message');
    assert.strictEqual(messages[0][0], 'success', 'saying it worked');
  });

  test('for your own board it uses the signed-in user with no extra load', async function(assert) {
    var t = setup(this, { marker: { key: 'public/core-60', user_id: '1_3', user_name: 'example' } });
    await t.component.setAsHome();
    assert.deepEqual(t.calls.findRecord, [], 'no load for yourself');
    assert.strictEqual(t.calls.copy[0].user, t.appState.get('currentUser'), 'your own record');
  });
});
