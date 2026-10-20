import { module, test } from 'qunit';
import EmberObject from '@ember/object';
import Service from '@ember/service';
import i18n from 'frontend/utils/i18n';
import { setupTest } from '../../helpers';

/* The tile's accessible name (components/board-icon.hbs, the role="button" wrapper's aria-label).
 * An aria-label on the wrapper replaces its contents for assistive technology, so the home glyph's
 * own label inside it is never announced: the name itself has to say "Home Board". */
module('Unit | Component | board-icon accessible name', function(hooks) {
  setupTest(hooks);

  hooks.beforeEach(function() {
    this.owner.register('service:app-state', Service.extend({}));
    this.owner.register('service:router', Service.extend({}));
  });

  function build(owner, attrs) {
    return owner.factoryFor('component:board-icon').create(Object.assign({
      board_record: EmberObject.create({ key: 'someone/my-board', id: '1_1', name: 'My Board' })
    }, attrs || {}));
  }

  test('the home board says so', function(assert) {
    var comp = build(this.owner, { flag_home: true });
    assert.strictEqual(comp.get('tile_aria_name'), 'My Board, ' + i18n.t('home_board', "Home Board"));
  });

  test('any other board is just its name', function(assert) {
    assert.strictEqual(build(this.owner, {}).get('tile_aria_name'), 'My Board');
  });

  test('no record (it never loaded): the tile shows and announces the name it was given', function(assert) {
    // The Modern home Boards card passes `{id, key, name}`. Without a name the tile renders empty, so
    // a click lands on the empty wrapper instead of the button and the board cannot be opened.
    var comp = build(this.owner, { board_record: null });
    comp.board = { id: 'example/crisis-vocabulary', key: 'example/crisis-vocabulary', name: 'Crisis Vocabulary' };
    assert.strictEqual(comp.get('tile_display_name'), 'Crisis Vocabulary', 'visible name');
    assert.strictEqual(comp.get('tile_aria_name'), 'Crisis Vocabulary', 'accessible name');
  });
});
