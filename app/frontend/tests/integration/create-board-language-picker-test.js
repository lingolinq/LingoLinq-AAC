import { setupRenderingTest } from 'frontend/tests/helpers';
import { render } from '@ember/test-helpers';
import { hbs } from 'ember-cli-htmlbars';
import EmberObject from '@ember/object';
import * as QUnit from 'qunit';

/*
 * With english_first_board_generation on, the Language field used to show only a hint, so
 * anyone whose UI language was English had no way to make a board in another language and
 * the board spoke with an English voice.
 */
QUnit.module('Integration | Component | create-board-new language picker', function(hooks) {
  setupRenderingTest(hooks);

  QUnit.test('offers the Language select with english_first_board_generation on', async function(assert) {
    const appState = this.owner.lookup('service:app-state');
    const prior = appState.get('currentUser');
    appState.set('currentUser', EmberObject.create({ feature_flags: { english_first_board_generation: true } }));
    try {
      await render(hbs`<CreateBoardNew />`);
      assert.dom('.nb-wizard .new-board-field--locale button#locale').exists();
      assert.dom('.nb-wizard .new-board-field--locale .nb-field__hint').exists();
    } finally {
      appState.set('currentUser', prior);
    }
  });
});
