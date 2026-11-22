import { module, test } from 'qunit';
import EmberObject from '@ember/object';
import RSVP from 'rsvp';
import { settled } from '@ember/test-helpers';
import modal from 'frontend/utils/modal';
import {
  begin_pending_media,
  finish_pending_media,
  is_cancelled,
  has_live_media,
  reset_pending_media
} from 'frontend/utils/pending_media';
import {
  save_after_media,
  save_waiting_active,
  reset_save_after_media,
  WAIT_TEMPLATE
} from 'frontend/utils/save_after_media';
import { recordOwnerGoneSkips } from 'frontend/tests/helpers/owner-gone';

/* save_after_media is what both board pages call from saveButtonChanges when a picture or sound
 * is still uploading. The modal is stubbed: `open` hands back a promise this file resolves by
 * hand (the dialog's own result: 'back', 'save_without', or {replaced: true} when another modal
 * takes its place), and `is_open` reports whether the waiting dialog is still the current one. */
module('Unit | Utility | save after media', function(hooks) {
  var descriptors, dialog;

  // modal is a shared util singleton: record each method's exact descriptor and put it back
  // (testing-frontend.md section 5, "Restoring a stub"), never assign the original back.
  var NAMES = ['open', 'close', 'is_open'];
  function replace(name, fn) {
    descriptors[name] = Object.getOwnPropertyDescriptor(modal, name);
    Object.defineProperty(modal, name, {value: fn, writable: true, configurable: true, enumerable: true});
  }

  hooks.beforeEach(function() {
    descriptors = {};
    dialog = {opened: [], closed: 0, current: null, resolve: null};
    replace('open', function(template, options) {
      dialog.opened.push({template: template, options: options});
      dialog.current = template;
      var defer = RSVP.defer();
      dialog.resolve = function(result) { dialog.current = null; defer.resolve(result); };
      return defer.promise;
    });
    replace('close', function() { dialog.closed++; dialog.current = null; });
    replace('is_open', function(template) { return !!template && dialog.current === template; });
  });

  hooks.afterEach(function() {
    reset_save_after_media();
    reset_pending_media();
    NAMES.forEach(function(name) {
      if(descriptors[name]) {
        Object.defineProperty(modal, name, descriptors[name]);
      } else {
        delete modal[name];
      }
    });
  });

  function setup(identityValue) {
    var state = {identity: identityValue || 'board-1|session-1|user-1', saves: 0, failed: 0};
    state.opts = {
      identity: function() { return state.identity; },
      save: function() { state.saves++; },
      failed: function() { state.failed++; }
    };
    return state;
  }

  function upload() {
    var button = EmberObject.create({id: 'test-button'});
    return {button: button, token: begin_pending_media(button, 'pending_image', 'user')};
  }

  test('nothing uploading: the caller saves now and no dialog opens', function(assert) {
    var state = setup();
    assert.false(save_after_media(state.opts));
    assert.strictEqual(dialog.opened.length, 0);
    assert.false(save_waiting_active());
  });

  test('an upload in flight: the dialog opens, then the board saves once it lands', async function(assert) {
    var state = setup();
    var up = upload();
    assert.true(save_after_media(state.opts), 'the caller must not save now');
    assert.strictEqual(dialog.opened[0].template, WAIT_TEMPLATE);
    assert.true(save_waiting_active());
    assert.strictEqual(state.saves, 0);

    finish_pending_media(up.token, 'landed');
    await settled();
    assert.strictEqual(state.saves, 1);
    assert.strictEqual(dialog.closed, 1, 'the waiting dialog is closed before the save runs');
    assert.false(save_waiting_active());
  });

  test('a second Save while waiting does not open a second dialog or save twice', async function(assert) {
    var state = setup();
    var up = upload();
    save_after_media(state.opts);
    assert.true(save_after_media(state.opts));
    assert.strictEqual(dialog.opened.length, 1);
    finish_pending_media(up.token, 'landed');
    await settled();
    assert.strictEqual(state.saves, 1);
  });

  test('a failed upload: no save, the caller is told, the dialog closes', async function(assert) {
    var state = setup();
    var up = upload();
    save_after_media(state.opts);
    finish_pending_media(up.token, 'failed');
    await settled();
    assert.strictEqual(state.saves, 0);
    assert.strictEqual(state.failed, 1);
    assert.strictEqual(dialog.closed, 1);
    assert.false(save_waiting_active());
  });

  test('the board, edit session or person changed while waiting: no save', async function(assert) {
    var state = setup();
    var up = upload();
    save_after_media(state.opts);
    state.identity = 'board-2|session-1|user-1';
    finish_pending_media(up.token, 'landed');
    await settled();
    assert.strictEqual(state.saves, 0);
    assert.strictEqual(state.failed, 0);
    assert.strictEqual(dialog.closed, 1, 'its own dialog is still closed');
    assert.false(save_waiting_active());
  });

  test('Back to editing: no save, and the upload keeps going', async function(assert) {
    var state = setup();
    var up = upload();
    save_after_media(state.opts);
    dialog.resolve('back');
    await settled();
    assert.false(save_waiting_active());
    assert.true(has_live_media(), 'the upload is not cancelled');
    assert.false(is_cancelled(up.token));

    finish_pending_media(up.token, 'landed');
    await settled();
    assert.strictEqual(state.saves, 0, 'landing later does not save by itself');
  });

  test('Save without it: cancels what is still uploading and saves now', async function(assert) {
    var state = setup();
    var up = upload();
    save_after_media(state.opts);
    dialog.resolve('save_without');
    await settled();
    assert.true(is_cancelled(up.token), 'a late picture must not reach the saved board');
    assert.false(has_live_media());
    assert.strictEqual(state.saves, 1);
    assert.false(save_waiting_active());
  });

  test('another modal replacing the dialog cancels the deferred save', async function(assert) {
    var state = setup();
    var up = upload();
    save_after_media(state.opts);
    dialog.resolve({replaced: true});
    await settled();
    assert.false(save_waiting_active());
    finish_pending_media(up.token, 'landed');
    await settled();
    assert.strictEqual(state.saves, 0);
    assert.false(is_cancelled(up.token), 'the upload itself is kept');
  });

  test('a modal the save opens is never closed by the waiter', async function(assert) {
    var state = setup();
    var up = upload();
    state.opts.save = function() {
      state.saves++;
      // copy_on_save: re-entry opens the copy dialog
      modal.open('copy-board', {});
    };
    save_after_media(state.opts);
    finish_pending_media(up.token, 'landed');
    await settled();
    assert.strictEqual(state.saves, 1);
    assert.strictEqual(dialog.current, 'copy-board', 'the copy dialog stays open');
    assert.strictEqual(dialog.closed, 1, 'only the waiting dialog was closed, before the save');
  });

  test('the dialog is told when the first Save click happened', function(assert) {
    var state = setup();
    upload();
    var before = Date.now();
    save_after_media(state.opts);
    var started = dialog.opened[0].options.started_at;
    assert.true(started >= before && started <= Date.now());
  });

  test('the save does not run against an app that was torn down while waiting', async function(assert) {
    var state = setup();
    var up = upload();
    var owner = {isDestroyed: false, isDestroying: false};
    state.opts.owner = owner;
    save_after_media(state.opts);
    owner.isDestroyed = true;
    var skips = recordOwnerGoneSkips(owner);
    try {
      finish_pending_media(up.token, 'landed');
      await settled();
      assert.strictEqual(state.saves, 0);
      assert.strictEqual(skips.count, 1, 'the guard is owner_gone, so the skip is reported');
      assert.false(save_waiting_active());
    } finally {
      skips.restore();
    }
  });
});
