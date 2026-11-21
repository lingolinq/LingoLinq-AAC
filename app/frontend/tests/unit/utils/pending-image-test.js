import { module, test } from 'qunit';
import EmberObject from '@ember/object';
import { begin_pending_image, finish_pending_image } from 'frontend/utils/pending_image';

module('Unit | Utility | pending image', function() {
  test('pending_image stays set until every operation on the button has finished', function(assert) {
    var button = EmberObject.create({id: 'test-button'});
    var first = begin_pending_image(button);
    var second = begin_pending_image(button);
    assert.true(button.get('pending_image'));

    finish_pending_image(button, first);
    assert.true(button.get('pending_image'), 'one operation is still running');

    finish_pending_image(button, second);
    assert.false(button.get('pending_image'));
  });

  test('finishing the same token twice does not clear another operation', function(assert) {
    var button = EmberObject.create({id: 'test-button'});
    var first = begin_pending_image(button);
    var second = begin_pending_image(button);
    finish_pending_image(button, first);
    finish_pending_image(button, first);
    assert.true(button.get('pending_image'));
    finish_pending_image(button, second);
    assert.false(button.get('pending_image'));
  });

  test('a token only finishes on the button it was begun on', function(assert) {
    var original = EmberObject.create({id: 'test-button'});
    var rebuilt = EmberObject.create({id: 'test-button'});
    var token = begin_pending_image(original);
    var rebuiltToken = begin_pending_image(rebuilt);

    finish_pending_image(rebuilt, token);
    assert.true(rebuilt.get('pending_image'), 'the rebuilt button keeps its own operation');
    assert.true(original.get('pending_image'));

    finish_pending_image(original, token);
    assert.false(original.get('pending_image'));
    finish_pending_image(rebuilt, rebuiltToken);
    assert.false(rebuilt.get('pending_image'));
  });

  test('missing buttons and tokens are ignored', function(assert) {
    assert.strictEqual(begin_pending_image(null), null);
    var button = EmberObject.create({id: 'test-button', pending_image: true});
    finish_pending_image(button, null);
    finish_pending_image(null, {});
    assert.true(button.get('pending_image'), 'an unknown token does not change the flag');
  });

  test('a destroyed button is not written to', function(assert) {
    var button = EmberObject.create({id: 'test-button'});
    var token = begin_pending_image(button);
    button.destroy();
    finish_pending_image(button, token);
    assert.true(button.get('pending_image'), 'left as it was rather than throwing');
  });
});
