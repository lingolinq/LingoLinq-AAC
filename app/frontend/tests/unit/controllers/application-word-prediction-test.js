import { module, test } from 'qunit';
import Service from '@ember/service';
import EmberObject from '@ember/object';
import RSVP from 'rsvp';
import { setupTest } from '../../helpers';
import { settled } from '@ember/test-helpers';
import modal from 'frontend/utils/modal';

/* The sidebar "Predict" Yes/No toggle (2026-10-13 request). set_word_prediction SETS
   preferences.word_suggestions to a value (not a flip), is a no-op when the value is unchanged (so
   the segmented control never prompts for the already-selected side), gates the change on the ACTIVE
   speak-mode PIN (open_speak_mode_exit_pin), and saves with the preferences.device.updated dirty bit.
   The same action lives on user/board-detail.js for the inline sidebar; this pins the shared logic
   via the application-controller copy that drives the classic sidebar. */
module('Unit | Controller | application: word-prediction sidebar toggle', function(hooks) {
  setupTest(hooks);

  function userStub(on) {
    var saves = [];
    var u = EmberObject.extend({
      save: function() { saves.push(this.get('preferences.word_suggestions')); return RSVP.resolve(); }
    }).create({ preferences: { word_suggestions: on, device: {} } });
    u.saves = saves;
    return u;
  }

  // A user whose preferences carry NO `device` key (new / unconfigured account). set()ing
  // preferences.device.updated on such a record THROWS in Ember unless the container is created
  // first (components/view-switcher.js:186) — this is the shape the device:{} stub above cannot catch.
  function userStubNoDevice(on) {
    var saves = [];
    var u = EmberObject.extend({
      save: function() { saves.push(this.get('preferences.word_suggestions')); return RSVP.resolve(); }
    }).create({ preferences: { word_suggestions: on } });
    u.saves = saves;
    return u;
  }

  // A user whose save() rejects (offline, or a supervisor without write access to the communicator).
  function userStubRejecting(on) {
    var saves = [];
    var u = EmberObject.extend({
      save: function() { saves.push(true); return RSVP.reject({ fakeXHR: { status: 403 } }); }
    }).create({ preferences: { word_suggestions: on, device: {} } });
    u.saves = saves;
    return u;
  }

  function wire(context, user, pinResult) {
    context.owner.unregister('service:app-state');
    context.owner.register('service:app-state', Service.extend({
      referenced_user: user,
      currentUser: user,
      open_speak_mode_exit_pin: function() { return RSVP.resolve(pinResult); }
    }));
    return context.owner.lookup('controller:application');
  }

  test('turns prediction ON when off and the PIN clears, saving with the dirty bit', async function(assert) {
    var user = userStub(false);
    var c = wire(this, user, { correct_pin: true });
    c.send('set_word_prediction', true);
    await settled();
    assert.strictEqual(user.get('preferences.word_suggestions'), true, 'preference set on');
    assert.strictEqual(user.get('preferences.device.updated'), true, 'device dirty bit set');
    assert.strictEqual(user.saves.length, 1, 'saved once');
  });

  test('turns prediction OFF when on and the PIN clears', async function(assert) {
    var user = userStub(true);
    var c = wire(this, user, { correct_pin: true });
    c.send('set_word_prediction', false);
    await settled();
    assert.strictEqual(user.get('preferences.word_suggestions'), false, 'preference set off');
    assert.strictEqual(user.saves.length, 1, 'saved once');
  });

  test('is a no-op when the value is already selected (no prompt, no save)', async function(assert) {
    var user = userStub(true);
    var c = wire(this, user, { correct_pin: false });
    c.send('set_word_prediction', true);
    await settled();
    assert.strictEqual(user.get('preferences.word_suggestions'), true, 'preference unchanged');
    assert.strictEqual(user.saves.length, 0, 'not saved');
  });

  test('does not change the preference when the PIN is cancelled or wrong', async function(assert) {
    var user = userStub(false);
    var c = wire(this, user, { correct_pin: false });
    c.send('set_word_prediction', true);
    await settled();
    assert.strictEqual(user.get('preferences.word_suggestions'), false, 'preference unchanged');
    assert.strictEqual(user.saves.length, 0, 'not saved');
  });

  test('does not throw and persists for a user with no device preferences (new/unconfigured user)', async function(assert) {
    var user = userStubNoDevice(false);
    var c = wire(this, user, { correct_pin: true });
    c.send('set_word_prediction', true);
    await settled();
    assert.true(user.get('preferences.word_suggestions'), 'preference set on');
    assert.true(user.get('preferences.device.updated'), 'device container created + dirty bit set');
    assert.strictEqual(user.saves.length, 1, 'saved once (the device poke did not throw before save)');
  });

  test('reverts the preference and shows an error when the save fails', async function(assert) {
    assert.expect(3);
    var originalError = modal.error;
    var errors = [];
    modal.error = function(msg) { errors.push(msg); };
    try {
      var user = userStubRejecting(false);
      var c = wire(this, user, { correct_pin: true });
      c.send('set_word_prediction', true);
      await settled();
      assert.strictEqual(user.saves.length, 1, 'save was attempted');
      assert.false(user.get('preferences.word_suggestions'), 'preference reverted to the stored value');
      assert.strictEqual(errors.length, 1, 'an error modal was shown');
    } finally {
      modal.error = originalError;
    }
  });
});
