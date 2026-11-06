import { module, test } from 'qunit';
import EmberObject from '@ember/object';
import { setupTest } from '../../helpers';

/*
 * Basic and the legacy board page must pick a board's language the way Modern does. A person
 * should never need Switch Languages to hear a board in its own language.
 */
module('Unit | Route | board language rule', function(hooks) {
  setupTest(hooks);

  const KEYS = ['label_locale', 'vocalization_locale', 'override_label_locale', 'override_vocalization_locale'];

  function spanishBoard() {
    // `integration` returns from setupController straight after the language block.
    return EmberObject.extend({
      without_lookups: function(fn) { fn(); },
      prefetch_linked_boards: function() { }
    }).create({ id: '1_7', key: 'owner/mi-tablero', locale: 'es', locales: ['es', 'en'], integration: true, permissions: {} });
  }

  function open(context, routeName, values) {
    const route = context.owner.lookup(routeName);
    KEYS.forEach(function(key) { route.stashes.persist(key, values[key] || null); });
    route.stashes.persist('root_board_state', { id: 'home' });
    try {
      route.setupController(EmberObject.extend({ processButtons: function() { } }).create({ valid_fast_html: true }), spanishBoard());
      return [route.appState.get('label_locale'), route.appState.get('vocalization_locale')];
    } finally {
      KEYS.forEach(function(key) { route.stashes.persist(key, null); });
      route.stashes.persist('root_board_state', null);
    }
  }

  ['route:user/board-alt/index', 'route:board/index'].forEach(function(routeName) {
    test(routeName + ': opens in the board language after Home on an English board', function(assert) {
      assert.deepEqual(open(this, routeName, { label_locale: 'en', vocalization_locale: 'en' }), ['es', 'es']);
    });

    test(routeName + ': honours Switch Languages', function(assert) {
      assert.deepEqual(open(this, routeName, {
        label_locale: 'en', vocalization_locale: 'en', override_label_locale: 'en', override_vocalization_locale: 'en'
      }), ['en', 'en']);
    });
  });
});
