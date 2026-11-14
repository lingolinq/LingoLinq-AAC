import { module, test } from 'qunit';
import { setupRenderingTest } from '../../helpers';
import { render } from '@ember/test-helpers';
import { hbs } from 'ember-cli-htmlbars';
import { LIKED_BOARDS_KEPT } from 'frontend/utils/like_limit';

/* The offline-scope strings say how many liked boards are kept (pass 2 of the final review of #1268). */
module('Integration | Helper | liked-boards-kept', function(hooks) {
  setupRenderingTest(hooks);

  test('renders the number of liked boards a sync keeps', async function(assert) {
    await render(hbs`<p data-test-kept>{{t "up to %{limit} liked boards" key="liked_boards_kept_probe" limit=(liked-boards-kept)}}</p>`);
    assert.dom('[data-test-kept]').hasText('up to ' + LIKED_BOARDS_KEPT + ' liked boards');
  });
});
