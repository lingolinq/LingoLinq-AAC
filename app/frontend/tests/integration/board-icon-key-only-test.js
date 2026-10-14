import { setupRenderingTest } from 'frontend/tests/helpers';
import { render } from '@ember/test-helpers';
import { hbs } from 'ember-cli-htmlbars';
import * as QUnit from 'qunit';
import LingoLinq from 'frontend/app';
import RSVP from 'rsvp';

/* A BoardIcon given only `{id, key, name}` whose record never loads (offline and not cached, or a
 * failed fetch): the Modern home Boards card. The tile itself opens the board by key, but its two
 * nested Preview buttons need a record, and with none `board_preview(undefined)` threw. They are not
 * rendered until there is a record to preview. Also pins the wrapper's real accessible name. */
QUnit.module('Integration | board-icon key-only tile', function(hooks) {
  setupRenderingTest(hooks);

  var originalFind;
  var originalPeek;
  hooks.beforeEach(function() {
    originalFind = LingoLinq.store.findRecord;
    originalPeek = LingoLinq.store.peekRecord;
    LingoLinq.store.peekRecord = function() { return null; };
    LingoLinq.store.findRecord = function() { return RSVP.reject({ error: 'not available' }); };
  });
  hooks.afterEach(function() {
    LingoLinq.store.findRecord = originalFind;
    LingoLinq.store.peekRecord = originalPeek;
  });

  QUnit.test('no record: no Preview buttons, and the tile is named', async function(assert) {
    this.set('board', { id: 'example/crisis-vocabulary', key: 'example/crisis-vocabulary', name: 'Crisis Vocabulary' });
    this.set('open', function() {});
    await render(hbs`<BoardIcon @board={{this.board}} @onActionOverride={{this.open}} />`);
    assert.dom('.info').doesNotExist('no bottom Preview button');
    assert.dom('.board-icon__info').doesNotExist('no info chip');
    assert.dom('[role="button"]').hasAttribute('aria-label', 'Crisis Vocabulary', 'the wrapper carries the name');
  });
});
