import { module, test } from 'qunit';
import { setupTest } from 'frontend/tests/helpers';
import EmberObject from '@ember/object';
import RSVP from 'rsvp';
import { settled } from '@ember/test-helpers';
import modal from 'frontend/utils/modal';
import editManager from 'frontend/utils/edit_manager';
import {
  begin_pending_media,
  finish_pending_media,
  has_live_media,
  is_cancelled,
  reset_pending_media
} from 'frontend/utils/pending_media';
import { save_waiting_active, reset_save_after_media } from 'frontend/utils/save_after_media';

/* Both board pages call save_after_media from saveButtonChanges before serializing the board
 * (Basic: controllers/board/index.js, Modern: controllers/user/board-detail.js). With a picture
 * or sound still uploading, Save must not reach editManager.process_for_saving; and leaving edit
 * mode (Discard, Cancel, Back) must cancel what is still uploading so it never lands on the board.
 * editManager.process_for_saving and the modal are replaced through their exact descriptors and
 * put back (testing-frontend.md section 5). */
module('Unit | Controller | board Save waits for uploads', function(hooks) {
  setupTest(hooks);

  var descriptors, calls;
  function replace(obj, key, name, fn) {
    descriptors.push({obj: obj, name: name, desc: Object.getOwnPropertyDescriptor(obj, name)});
    Object.defineProperty(obj, name, {value: fn, writable: true, configurable: true, enumerable: true});
  }

  hooks.beforeEach(function() {
    descriptors = [];
    calls = {serialize: 0, opened: []};
    replace(editManager, 'em', 'process_for_saving', function() {
      calls.serialize++;
      // No state: Modern then takes its own early "save failed" return, so a test that reaches
      // here proves the board was serialized without running the rest of the save.
      return null;
    });
    replace(modal, 'modal', 'error', function() { });
    replace(modal, 'modal', 'open', function(template, options) {
      calls.opened.push(template);
      return RSVP.defer().promise;
    });
    replace(modal, 'modal', 'close', function() { });
    replace(modal, 'modal', 'is_open', function() { return false; });
  });

  hooks.afterEach(function() {
    reset_save_after_media();
    reset_pending_media();
    descriptors.reverse().forEach(function(d) {
      if(d.desc) { Object.defineProperty(d.obj, d.name, d.desc); } else { delete d.obj[d.name]; }
    });
  });

  function uploadingButton() {
    var button = EmberObject.create({id: 'test-button', label: 'test'});
    var token = begin_pending_media(button, 'pending_image', 'user');
    return {button: button, token: token};
  }

  function modern(owner) {
    var controller = owner.factoryFor('controller:user/board-detail').create({
      app_state: EmberObject.create({currentUser: EmberObject.create({id: 'test-user'})})
    });
    // contextualized_buttons: read by Modern's shift-label observer when ordered_buttons is set
    // (board-detail.js _apply_shift_to_ordered_buttons); an empty list relabels nothing.
    controller.set('model', EmberObject.create({id: 'test-board', buttons: [], changedAttributes: function() { return {}; }, contextualized_buttons: function() { return []; }}));
    return controller;
  }

  function basic(owner) {
    var appState = EmberObject.create({edit_mode: true, currentUser: EmberObject.create({id: 'test-user'})});
    var controller = owner.factoryFor('controller:board/index').create({appState: appState});
    controller.set('model', EmberObject.create({id: 'test-board', buttons: [], changedAttributes: function() { return {}; }}));
    return {controller: controller, appState: appState};
  }

  test('Modern: Save with an upload in flight waits instead of serializing the board', function(assert) {
    var controller = modern(this.owner);
    var up = uploadingButton();
    controller.set('ordered_buttons', [[up.button]]);
    controller.saveButtonChanges();
    assert.strictEqual(calls.serialize, 0, 'the board is not serialized yet');
    assert.deepEqual(calls.opened, ['save-waiting']);
    assert.true(save_waiting_active());
    controller.destroy();
  });

  test('Modern: an upload on an empty button (no image_id yet) also waits', function(assert) {
    var controller = modern(this.owner);
    var up = uploadingButton();
    assert.strictEqual(up.button.get('image_id'), undefined, 'precondition: the F4 case');
    controller.set('ordered_buttons', [[up.button]]);
    controller.saveButtonChanges();
    assert.strictEqual(calls.serialize, 0);
    controller.destroy();
  });

  test('Modern: leaving edit mode cancels uploads still in flight', function(assert) {
    var controller = modern(this.owner);
    var up = uploadingButton();
    controller.set('edit_mode', true);
    controller.set('edit_mode', false);
    assert.true(is_cancelled(up.token));
    assert.false(has_live_media());
    controller.destroy();
  });

  test('Modern: nothing uploading saves at once', function(assert) {
    var controller = modern(this.owner);
    var button = EmberObject.create({id: 'test-button', label: 'test', pending_image: true});
    controller.set('ordered_buttons', [[button]]);
    controller.saveButtonChanges();
    assert.strictEqual(calls.serialize, 1, 'a flag with no live upload does not hold Save');
    assert.deepEqual(calls.opened.filter(function(t) { return t === 'save-waiting'; }), []);
    controller.destroy();
  });

  test('Basic: Save with an upload in flight waits instead of serializing the board', function(assert) {
    var built = basic(this.owner);
    var up = uploadingButton();
    built.controller.saveButtonChanges();
    assert.strictEqual(calls.serialize, 0);
    assert.deepEqual(calls.opened, ['save-waiting']);
    built.controller.destroy();
  });

  test('Basic: leaving edit mode cancels uploads still in flight', async function(assert) {
    var built = basic(this.owner);
    var up = uploadingButton();
    built.appState.set('edit_mode', false);
    await settled();
    assert.true(is_cancelled(up.token));
    assert.false(has_live_media());
    finish_pending_media(up.token, 'landed');
    built.controller.destroy();
  });
});
