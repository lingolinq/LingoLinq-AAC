import { module, test } from 'qunit';
import apiErrorMessage from 'frontend/utils/api_error_message';

module('Unit | Utility | api error message', function() {
  test('reads an HTTP error body from fakeXHR.responseJSON', function(assert) {
    var err = { fakeXHR: { status: 400, responseJSON: { error: 'Greeting: %{app_name} is not allowed' } }, message: 'error', result: 'Greeting: %{app_name} is not allowed' };
    assert.strictEqual(apiErrorMessage(err, 'fallback'), 'Greeting: %{app_name} is not allowed');
  });

  test('reads a 200 response that carries an error in result', function(assert) {
    var err = { fakeXHR: { status: 200 }, message: 'success', result: { error: 'Template not found' } };
    assert.strictEqual(apiErrorMessage(err, 'fallback'), 'Template not found');
  });

  test('falls back when no message is present', function(assert) {
    assert.strictEqual(apiErrorMessage({ fakeXHR: { status: 0 }, message: 'error', result: 'timeout' }, 'fallback'), 'fallback');
    assert.strictEqual(apiErrorMessage(null, 'fallback'), 'fallback');
    assert.strictEqual(apiErrorMessage({ fakeXHR: { status: 500, responseJSON: { error: '' } } }, 'fallback'), 'fallback');
  });
});
