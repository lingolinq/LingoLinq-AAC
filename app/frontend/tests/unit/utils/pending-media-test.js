import { module, test } from 'qunit';
import EmberObject from '@ember/object';
import { settled } from '@ember/test-helpers';
import {
  begin_pending_media,
  finish_pending_media,
  cancel_pending_media,
  is_cancelled,
  has_live_media,
  when_media_settled,
  reset_pending_media
} from 'frontend/utils/pending_media';
import { begin_pending_image, finish_pending_image } from 'frontend/utils/pending_image';

var NONE = {landed: 0, failed: 0, superseded: 0, cancelled: 0};
function counts(values) { return Object.assign({}, NONE, values); }

module('Unit | Utility | pending media', function(hooks) {
  hooks.afterEach(function() {
    reset_pending_media();
  });

  test('a picture token and a sound token on one button keep their own flags', function(assert) {
    var button = EmberObject.create({id: 'test-button'});
    var picture = begin_pending_media(button, 'pending_image', 'user');
    var sound = begin_pending_media(button, 'pending_sound', 'user');
    assert.true(button.get('pending_image'));
    assert.true(button.get('pending_sound'));

    finish_pending_media(picture, 'landed');
    assert.false(button.get('pending_image'));
    assert.true(button.get('pending_sound'), 'finishing the picture leaves the sound pending');

    finish_pending_media(sound, 'landed');
    assert.false(button.get('pending_sound'));
  });

  test('the picture API from #1346 shares the registry', function(assert) {
    var button = EmberObject.create({id: 'test-button'});
    var token = begin_pending_image(button);
    assert.true(has_live_media());
    finish_pending_image(button, token);
    assert.false(button.get('pending_image'));
    assert.false(has_live_media());
  });

  test('a flag set directly, with no live operation, never holds Save', function(assert) {
    EmberObject.create({id: 'test-flagged', pending_image: true, pending_sound: true});
    assert.false(has_live_media());
  });

  test('the waiter resolves with every outcome once the last operation ends', async function(assert) {
    var first = EmberObject.create({id: 'test-first'});
    var second = EmberObject.create({id: 'test-second'});
    var a = begin_pending_media(first, 'pending_image', 'user');
    var b = begin_pending_media(second, 'pending_sound', 'user');
    var result = null;
    when_media_settled().then(function(res) { result = res; });

    finish_pending_media(a, 'landed');
    await settled();
    assert.strictEqual(result, null, 'still waiting for the sound');

    finish_pending_media(b, 'failed');
    await settled();
    assert.deepEqual(result, counts({landed: 1, failed: 1}));
  });

  test('an automatic lookup that fails does not count as a failure', async function(assert) {
    var button = EmberObject.create({id: 'test-button'});
    var lookup = begin_pending_media(button, 'pending_image', 'auto');
    var result = null;
    when_media_settled().then(function(res) { result = res; });
    finish_pending_media(lookup, 'failed');
    await settled();
    assert.deepEqual(result, NONE, 'a silent lookup error must not block the save');
  });

  test('the waiter resolves at once when nothing is live', async function(assert) {
    var result = null;
    when_media_settled().then(function(res) { result = res; });
    await settled();
    assert.deepEqual(result, NONE);
  });

  test('an operation begun while waiting is waited for too', async function(assert) {
    var button = EmberObject.create({id: 'test-button'});
    var first = begin_pending_media(button, 'pending_image', 'user');
    var result = null;
    when_media_settled().then(function(res) { result = res; });
    var second = begin_pending_media(button, 'pending_image', 'auto');
    finish_pending_media(first, 'landed');
    await settled();
    assert.strictEqual(result, null);
    finish_pending_media(second, 'superseded');
    await settled();
    assert.deepEqual(result, counts({landed: 1, superseded: 1}));
  });

  test('an operation on a button object that was replaced is still waited for', async function(assert) {
    var original = EmberObject.create({id: 'test-button'});
    var token = begin_pending_media(original, 'pending_image', 'user');
    // undo/redo rebuilds the grid with new objects; the old one is no longer on the board
    EmberObject.create({id: 'test-button'});
    assert.true(has_live_media());
    var result = null;
    when_media_settled().then(function(res) { result = res; });
    await settled();
    assert.strictEqual(result, null);
    finish_pending_media(token, 'landed');
    await settled();
    assert.deepEqual(result, counts({landed: 1}));
  });

  test('cancelling ends every live operation, clears the flags and marks the tokens', async function(assert) {
    var first = EmberObject.create({id: 'test-first'});
    var second = EmberObject.create({id: 'test-second'});
    var a = begin_pending_media(first, 'pending_image', 'user');
    var b = begin_pending_media(second, 'pending_sound', 'auto');
    var result = null;
    when_media_settled().then(function(res) { result = res; });

    cancel_pending_media();
    assert.false(first.get('pending_image'));
    assert.false(second.get('pending_sound'));
    assert.true(is_cancelled(a), 'the apply step can tell it must write nothing');
    assert.true(is_cancelled(b));
    assert.false(has_live_media());
    await settled();
    assert.deepEqual(result, counts({cancelled: 2}));

    finish_pending_media(a, 'landed');
    assert.true(is_cancelled(a), 'a late finish does not un-cancel');
    assert.false(is_cancelled(null));
    assert.false(is_cancelled({}));
  });

  test('a landed or superseded operation is not cancelled', function(assert) {
    var button = EmberObject.create({id: 'test-button'});
    var a = begin_pending_media(button, 'pending_image', 'user');
    finish_pending_media(a, 'landed');
    cancel_pending_media();
    assert.false(is_cancelled(a), 'cancel touches live operations only');
  });

  test('finishing a token twice counts it once', async function(assert) {
    var button = EmberObject.create({id: 'test-button'});
    var token = begin_pending_media(button, 'pending_image', 'user');
    var result = null;
    when_media_settled().then(function(res) { result = res; });
    finish_pending_media(token, 'failed');
    finish_pending_media(token, 'landed');
    await settled();
    assert.deepEqual(result, counts({failed: 1}));
  });
});
