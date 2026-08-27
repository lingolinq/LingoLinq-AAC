import { setupTest } from 'frontend/tests/helpers';
import RSVP from 'rsvp';
import persistence from 'frontend/utils/persistence';
import LingoLinq from 'frontend/app';
import * as QUnit from 'qunit';

/*
 * Translate Boards review modal (components/button-set) must translate the
 * visible label ("space") and must not enqueue / save action vocalizations
 * (":space"). Saving a translated token as the vocalization breaks keyboard
 * space / shift / letter keys.
 */
QUnit.module('Unit | Component | button-set action vocalizations', function(hooks) {
  setupTest(hooks);

  QUnit.test('_build_save_translations_map keeps the label and drops :space', function(assert) {
    var c = this.owner.factoryFor('component:button-set').create();
    c.set('model', {
      board: { id: '1_1', global_id: '1_1', name: 'Keyboard' },
      button_set: {
        buttons: [
          { id: 1, board_id: '1_1', label: 'space', vocalization: ':space' },
          { id: 2, board_id: '1_1', label: 'hat', vocalization: 'I wear a hat' }
        ]
      }
    });
    c.set('translations', {
      space: 'espacio',
      ':space': 'espacio',
      hat: 'sombrero',
      'I wear a hat': 'me pongo un sombrero'
    });

    var map = c._build_save_translations_map();
    assert.strictEqual(map.space, 'espacio', 'label still translates');
    assert.strictEqual(map[':space'], undefined, 'action token is not saved');
    assert.strictEqual(map.hat, 'sombrero');
    assert.strictEqual(map['I wear a hat'], 'me pongo un sombrero', 'ordinary speak-text still translates');
    c.destroy();
  });

  QUnit.test('skips load_buttons when the hierarchy already supplied labeled buttons', function(assert) {
    var c = this.owner.factoryFor('component:button-set').create();
    var loadCalled = false;
    c.set('model', {
      locale: 'es',
      old_board_ids_to_translate: ['1_1', '1_2'],
      board: { id: '1_1', global_id: '1_1', name: 'Quick Core 24', locale: 'en' },
      button_set: {
        buttons: [
          { id: 1, board_id: '1_1', label: 'I' },
          { id: 2, board_id: '1_2', label: 'want' }
        ],
        load_buttons: function() {
          loadCalled = true;
          return RSVP.reject({ error: 'root url not available' });
        }
      }
    });
    assert.true(c._button_set_has_labels());
    return c._prep_buttons_for_translate().then(function() {
      assert.false(loadCalled, 'must not force-reload; that wipe is what shows "Linked board labels could not be loaded"');
      c.destroy();
    });
  });

  QUnit.test('falls back to root board buttons when the button set has no labels', function(assert) {
    var c = this.owner.factoryFor('component:button-set').create();
    c.set('model', {
      locale: 'es',
      old_board_ids_to_translate: ['1_1', '1_2'],
      new_board_ids_to_translate: ['1_1', '1_2'],
      board: {
        id: '1_1',
        global_id: '1_1',
        key: 'lingolinq/quick-core-24',
        name: 'Quick Core 24',
        locale: 'en',
        buttons: [
          { id: 1, label: 'I' },
          { id: 2, label: 'want' }
        ]
      },
      button_set: { buttons: [] }
    });
    c._startTranslating = function() {};
    c.set('root_only_fallback', true);
    var words = c._buttons_for_translate();
    assert.deepEqual(words.map(function(b) { return b.label; }), ['I', 'want']);
    assert.deepEqual(c._board_ids_for_save(), ['1_1']);
    c.destroy();
  });

  QUnit.test('still calls load_buttons without force when no labels exist', function(assert) {
    var c = this.owner.factoryFor('component:button-set').create();
    var loadForce = 'unset';
    var origStore = LingoLinq.store;
    LingoLinq.store = {
      peekRecord: function() { return null; },
      findRecord: function() { return RSVP.reject({ error: 'missing' }); }
    };
    c.set('model', {
      locale: 'es',
      old_board_ids_to_translate: ['1_1', '1_2'],
      board: { id: '1_1', global_id: '1_1', name: 'Quick Core 24', locale: 'en' },
      button_set: {
        buttons: [],
        load_buttons: function(force) {
          loadForce = force;
          return RSVP.reject({ error: 'root url not available' });
        }
      }
    });
    assert.false(c._button_set_has_labels());
    assert.true(c._selection_includes_linked_boards());
    var origOnline = persistence.get('online');
    persistence.set('online', true);
    return c._prep_buttons_for_translate().then(function() {
      persistence.set('online', origOnline);
      LingoLinq.store = origStore;
      assert.strictEqual(loadForce, undefined, 'does not pass force=true');
      c.destroy();
    }, function() {
      persistence.set('online', origOnline);
      LingoLinq.store = origStore;
      assert.ok(false, 'prep should keep going after load_buttons fails');
      c.destroy();
    });
  });

  QUnit.test('loads labeled buttons from selected linked boards when the button set is empty', function(assert) {
    var c = this.owner.factoryFor('component:button-set').create();
    var origStore = LingoLinq.store;
    LingoLinq.store = {
      peekRecord: function() { return null; },
      findRecord: function(type, id) {
        assert.strictEqual(type, 'board');
        if (id === '1_2') {
          return RSVP.resolve({
            global_id: '1_2',
            id: '1_2',
            key: 'lingolinq/want',
            buttons: [{ id: 9, label: 'want more', vocalization: 'I want more' }]
          });
        }
        return RSVP.reject({ error: 'missing' });
      }
    };
    c.set('model', {
      locale: 'es',
      old_board_ids_to_translate: ['1_1', '1_2'],
      new_board_ids_to_translate: ['1_1', '1_2'],
      board: {
        id: '1_1',
        global_id: '1_1',
        key: 'lingolinq/quick-core-24',
        name: 'Quick Core 24',
        locale: 'en',
        buttons: [{ id: 1, label: 'I' }]
      },
      button_set: { buttons: [] }
    });
    return c._prep_buttons_for_translate().then(function() {
      LingoLinq.store = origStore;
      var words = c._buttons_for_translate();
      assert.deepEqual(words.map(function(b) { return b.label; }).sort(), ['I', 'want more']);
      assert.true(c._has_linked_translate_labels());
      assert.deepEqual(c._board_ids_for_save(), ['1_1', '1_2']);
      c.destroy();
    }, function() {
      LingoLinq.store = origStore;
      assert.ok(false, 'linked board fetch should resolve');
      c.destroy();
    });
  });
});
