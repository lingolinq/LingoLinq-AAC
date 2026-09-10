import { module, test } from 'qunit';
import { isActionVocalization, shouldTranslateVocalization, capsLockHighlight, capsLockDisplayLabel } from 'frontend/utils/special_vocalization';

module('Unit | Utility | special_vocalization', function() {
  test('isActionVocalization is true for colon and plus protocol tokens', function(assert) {
    assert.true(isActionVocalization(':space'));
    assert.true(isActionVocalization(':shift'));
    assert.true(isActionVocalization(':caps'));
    assert.true(isActionVocalization(':suggestion'));
    assert.true(isActionVocalization(':complete'));
    assert.true(isActionVocalization(':home'));
    assert.true(isActionVocalization('+q'));
    assert.true(isActionVocalization('+a'));
  });

  test('isActionVocalization is false for ordinary labels and speak text', function(assert) {
    assert.false(isActionVocalization('space'));
    assert.false(isActionVocalization('[ space ]'));
    assert.false(isActionVocalization('hello'));
    assert.false(isActionVocalization(''));
    assert.false(isActionVocalization(null));
  });

  test('capsLockHighlight is true only for the :caps key while caps_lock is on', function(assert) {
    assert.true(capsLockHighlight(':caps', true));
    assert.false(capsLockHighlight(':caps', false), 'off stays unhighlighted');
    assert.false(capsLockHighlight(':caps', null), 'unset stays unhighlighted');
    assert.false(capsLockHighlight(':shift', true), 'shift must not light the caps key');
    assert.false(capsLockHighlight('caps lock', true), 'label text is not the action');
    assert.false(capsLockHighlight('', true));
    assert.false(capsLockHighlight(null, true));
  });

  test('capsLockDisplayLabel uppercases the caps key label only while caps_lock is on', function(assert) {
    assert.strictEqual(capsLockDisplayLabel('caps lock', ':caps', true), 'CAPS LOCK');
    assert.strictEqual(capsLockDisplayLabel('caps', ':caps', true), 'CAPS LOCK');
    assert.strictEqual(capsLockDisplayLabel('caps lock', ':caps', false), 'caps lock');
    assert.strictEqual(capsLockDisplayLabel('caps lock', ':shift', true), 'caps lock');
    assert.strictEqual(capsLockDisplayLabel('q', ':caps', true), 'Q');
    assert.strictEqual(capsLockDisplayLabel('', ':caps', true), '');
  });

  test('shouldTranslateVocalization keeps labels translatable and skips action tokens', function(assert) {
    assert.false(shouldTranslateVocalization(':space', 'space'), 'do not send :space');
    assert.false(shouldTranslateVocalization(':space', ':space'), 'token-as-label still skipped as voc');
    assert.false(shouldTranslateVocalization('hat', 'hat'), 'same-as-label is not a separate voc');
    assert.false(shouldTranslateVocalization(null, 'hat'));
    assert.true(shouldTranslateVocalization('I am happy', 'happy'), 'real speak-text still translates');
  });
});
