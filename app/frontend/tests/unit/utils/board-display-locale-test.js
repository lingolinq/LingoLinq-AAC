import { module, test } from 'qunit';
import EmberObject from '@ember/object';
import {
  available_board_langs,
  resolve_board_display_locale
} from 'frontend/utils/board_display_locale';

module('Unit | Utility | board_display_locale', function() {
  test('includes model locale and raw translated_locales', function(assert) {
    var model = EmberObject.create({ locale: 'es', locales: [] });
    var raw = { locale: 'es', translated_locales: ['es'] };
    assert.deepEqual(available_board_langs(model, raw), ['es']);
  });

  test('keeps Switch Languages locale when the board lang list is empty', function(assert) {
    assert.strictEqual(resolve_board_display_locale({
      boardDefault: 'en',
      boardLangs: [],
      override: 'es',
      preferred: 'es'
    }), 'es');
  });

  test('uses the board default when the board is known not to have the override', function(assert) {
    assert.strictEqual(resolve_board_display_locale({
      boardDefault: 'en',
      boardLangs: ['en'],
      override: 'es',
      preferred: 'es'
    }), 'en');
  });

  test('keeps Spanish when Quick Core lists en and es', function(assert) {
    assert.strictEqual(resolve_board_display_locale({
      boardDefault: 'en',
      boardLangs: ['en', 'es'],
      override: 'es',
      preferred: 'es'
    }), 'es');
  });

  test('without Switch Languages, follows the board default', function(assert) {
    assert.strictEqual(resolve_board_display_locale({
      boardDefault: 'en',
      boardLangs: ['en', 'es'],
      override: null,
      preferred: 'es'
    }), 'en');
  });
});
