import { module, test } from 'qunit';
import { isActionVocalization, shouldTranslateVocalization } from 'frontend/utils/special_vocalization';

module('Unit | Utility | special_vocalization', function() {
  test('isActionVocalization is true for colon and plus protocol tokens', function(assert) {
    assert.true(isActionVocalization(':space'));
    assert.true(isActionVocalization(':shift'));
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

  test('shouldTranslateVocalization keeps labels translatable and skips action tokens', function(assert) {
    assert.false(shouldTranslateVocalization(':space', 'space'), 'do not send :space');
    assert.false(shouldTranslateVocalization(':space', ':space'), 'token-as-label still skipped as voc');
    assert.false(shouldTranslateVocalization('hat', 'hat'), 'same-as-label is not a separate voc');
    assert.false(shouldTranslateVocalization(null, 'hat'));
    assert.true(shouldTranslateVocalization('I am happy', 'happy'), 'real speak-text still translates');
  });
});
