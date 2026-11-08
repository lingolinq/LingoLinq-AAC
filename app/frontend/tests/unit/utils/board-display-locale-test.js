import { module, test } from 'qunit';
import EmberObject from '@ember/object';
import {
  available_board_langs,
  board_default_locale,
  resolve_board_display_locale,
  session_board_locale,
  board_language_for_session
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

  function stashesWith(values) {
    return { get: function(key) { return values[key] || null; } };
  }

  test('session_board_locale: a board with English stored keeps its language after Home on an English board', function(assert) {
    const stashes = stashesWith({ label_locale: 'en', vocalization_locale: 'en' });
    assert.strictEqual(session_board_locale(stashes, 'label_locale', 'es', ['es', 'en']), 'es');
    assert.strictEqual(session_board_locale(stashes, 'vocalization_locale', 'es', ['es', 'en']), 'es');
  });

  test('session_board_locale: Switch Languages wins on a board that has that language', function(assert) {
    const stashes = stashesWith({ label_locale: 'en', override_label_locale: 'en', override_vocalization_locale: 'en' });
    assert.strictEqual(session_board_locale(stashes, 'label_locale', 'es', ['es', 'en']), 'en');
  });

  test('session_board_locale: Switch Languages falls back to the board when it lacks that language', function(assert) {
    const stashes = stashesWith({ override_label_locale: 'en', override_vocalization_locale: 'en' });
    assert.strictEqual(session_board_locale(stashes, 'label_locale', 'es', ['es']), 'es');
  });

  test('session_board_locale: speak language can differ from label language under Switch Languages', function(assert) {
    const stashes = stashesWith({ override_label_locale: 'es', override_vocalization_locale: 'en' });
    assert.strictEqual(session_board_locale(stashes, 'label_locale', 'fr', ['fr', 'es', 'en']), 'es');
    assert.strictEqual(session_board_locale(stashes, 'vocalization_locale', 'fr', ['fr', 'es', 'en']), 'en');
  });

  test('session_board_locale: a board with no language stays unset so readers use their own fallback', function(assert) {
    const stashes = stashesWith({ label_locale: 'es' });
    assert.strictEqual(session_board_locale(stashes, 'label_locale', undefined, []), undefined);
  });

  function boardIn(locale, locales) {
    return { get: function(key) { return key === 'locale' ? locale : locales; } };
  }

  test('board_language_for_session: a language left over from another board does not apply', function(assert) {
    const stashes = stashesWith({ label_locale: 'es' });
    assert.strictEqual(board_language_for_session(stashes, boardIn('en', ['en'])), 'en');
    assert.strictEqual(board_language_for_session(stashes, boardIn('en', ['en', 'es'])), 'en');
  });

  test('board_language_for_session: Switch Languages applies where the board has that language', function(assert) {
    const stashes = stashesWith({ label_locale: 'es', override_label_locale: 'es' });
    assert.strictEqual(board_language_for_session(stashes, boardIn('en', ['en', 'es'])), 'es');
    assert.strictEqual(board_language_for_session(stashes, boardIn('en', ['en'])), 'en');
  });

  test('board_language_for_session: a language the board only has as a regional variant stays on the board language', function(assert) {
    const stashes = stashesWith({ label_locale: 'es', override_label_locale: 'es' });
    assert.strictEqual(board_language_for_session(stashes, boardIn('en', ['en', 'es_US'])), 'en');
  });

  test('board_default_locale: a keyboard board with English is English for a user with no language', function(assert) {
    assert.strictEqual(board_default_locale('es', 'example/keyboard', null, ['es', 'en']), 'en');
    assert.strictEqual(board_default_locale('es', 'example/keyboard', 'es', ['es', 'en']), 'es');
    assert.strictEqual(board_default_locale('es', 'example/keyboard', null, ['es']), 'es');
    assert.strictEqual(board_default_locale('es', 'example/mi-tablero', null, ['es', 'en']), 'es');
    assert.strictEqual(board_default_locale(undefined, 'obf/stars-1', null, []), undefined);
  });
});
