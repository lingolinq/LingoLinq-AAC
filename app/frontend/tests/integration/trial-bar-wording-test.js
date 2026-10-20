import { setupRenderingTest } from 'frontend/tests/helpers';
import { render } from '@ember/test-helpers';
import { hbs } from 'ember-cli-htmlbars';
import EmberObject from '@ember/object';
import * as QUnit from 'qunit';

/* THE TRIAL BAR READS "Trying Vocal Flair 40 · Use this board · Try another · Close" (requested 2026-10-13). */
QUnit.module('Integration | trial-bar wording', function(hooks) {
  setupRenderingTest(hooks);

  QUnit.test('Trying <board>, Use this board, Try another, Close', async function(assert) {
    var me = EmberObject.create({ id: '1_3', user_name: 'aiden', preferences: { board_view_style: 'modern' } });
    this.owner.lookup('service:app-state').set('currentUser', me);
    this.set('board', EmberObject.create({ key: 'lingolinq/vocal-flair-40', name: 'Vocal Flair 40' }));
    this.set('mark', { key: 'lingolinq/vocal-flair-40', name: 'Vocal Flair 40', user_id: '1_3' });
    await render(hbs`<TrialBar @board={{this.board}} @view="modern" @mark={{this.mark}} />`);
    var text = this.element.querySelector('.ll-trial-bar').innerText.replace(/\s+/g, ' ').trim();
    assert.strictEqual(text, 'Trying Vocal Flair 40 Use this board Try another Close');
    assert.dom('.ll-trial-bar__exit').hasText('Try another');
    assert.dom('.ll-trial-bar__close').hasText('Close');
  });
});
