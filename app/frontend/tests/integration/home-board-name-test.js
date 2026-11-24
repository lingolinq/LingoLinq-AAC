import { module, test } from 'qunit';
import { setupRenderingTest } from 'frontend/tests/helpers';
import { render } from '@ember/test-helpers';
import { hbs } from 'ember-cli-htmlbars';
import Service from '@ember/service';
import EmberObject from '@ember/object';

/* What a menu row's Home Board line SAYS (components/home-board-name.hbs), the text both rails show:
 * the board's name when its record is in the store, the key's slug (without the `username/` half)
 * when it is not. The store is stubbed with no `findRecord`, so nothing is fetched. */
module('Integration | Component | home-board-name', function(hooks) {
  setupRenderingTest(hooks);

  function stubStore(context, boards) {
    context.owner.unregister('service:store');
    context.owner.register('service:store', Service.extend({
      peekRecord(type, id) { return boards.find(function(b) { return b.get('id') === id; }) || null; },
      peekAll() { return boards; }
    }));
  }

  test('it shows the board name when the board is loaded', async function(assert) {
    stubStore(this, [EmberObject.create({ id: '1_9', key: 'someone/vocal-flair-84', name: "Vocal Flair" })]);
    this.set('user', { preferences: { home_board: { id: '1_9', key: 'someone/vocal-flair-84' } } });
    await render(hbs`<span data-test-home-board><HomeBoardName @user={{this.user}} /></span>`);
    assert.dom('[data-test-home-board]').hasText("Vocal Flair");
  });

  test('it shows the key\'s slug while the board is not loaded', async function(assert) {
    stubStore(this, []);
    this.set('user', { preferences: { home_board: { id: '1_9', key: 'someone/vocal-flair-84' } } });
    await render(hbs`<span data-test-home-board><HomeBoardName @user={{this.user}} /></span>`);
    assert.dom('[data-test-home-board]').hasText('vocal-flair-84');
  });
});
