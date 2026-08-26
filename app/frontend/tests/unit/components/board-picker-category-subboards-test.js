import { module, test } from 'qunit';
import { run } from '@ember/runloop';
import EmberObject from '@ember/object';
import { setupTest } from 'frontend/tests/helpers';

/*
 * Tagged category tabs (Keyboards, etc.) must keep explicitly opted-in
 * brand-set sub-boards. Mine / All Available still drop them so the grid
 * stays root tiles only.
 */
module('Unit | board-picker category tagged sub-boards', function(hooks) {
  setupTest(hooks);

  hooks.afterEach(function() {
    if (this.component && !this.component.isDestroyed) {
      // eslint-disable-next-line ember/no-runloop
      run(() => this.component.destroy());
    }
    this.component = null;
  });

  function makeBoard(props) {
    return EmberObject.create(props);
  }

  function build(owner) {
    var c = owner.factoryFor('component:board-picker').create({
      searchAtTop: true
    });
    c._subjectBoardUserId = function() { return 'u1'; };
    c._scheduleExplainOverflowCheck = function() {};
    return c;
  }

  test('category lists keep a vocal-flair keyboard that Mine would drop', function(assert) {
    var c = build(this.owner);
    this.component = c;

    var root = makeBoard({
      id: '1',
      name: 'Vocal Flair 112',
      key: 'lingolinq/vocal-flair-112'
    });
    var keyboard = makeBoard({
      id: '2',
      name: 'Vocal Flair 112 - Keyboard',
      key: 'lingolinq/vocal-flair-112-keyboard'
    });
    var standalone = makeBoard({
      id: '3',
      name: 'Keyboard Plus',
      key: 'lingolinq/keyboard-with-categories'
    });

    var categoryList = c._preparePickerBoardList([root, keyboard, standalone], {
      keepCategoryTagged: true
    });
    var keys = categoryList.map(function(b) { return b.get('key'); });
    assert.true(keys.includes('lingolinq/vocal-flair-112'), 'brand root stays');
    assert.true(keys.includes('lingolinq/vocal-flair-112-keyboard'),
      'tagged keyboard sub-board stays in the category list');
    assert.true(keys.includes('lingolinq/keyboard-with-categories'), 'non-brand keyboard stays');

    var availableList = c._preparePickerBoardList([root, keyboard, standalone]);
    var availableKeys = availableList.map(function(b) { return b.get('key'); });
    assert.true(availableKeys.includes('lingolinq/vocal-flair-112'));
    assert.false(availableKeys.includes('lingolinq/vocal-flair-112-keyboard'),
      'All Available still drops brand-set sub-boards');
    assert.true(availableKeys.includes('lingolinq/keyboard-with-categories'));
  });
});
