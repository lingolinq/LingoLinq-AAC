import { module, test } from 'qunit';
import { setupRenderingTest } from 'frontend/tests/helpers';
import { render, settled } from '@ember/test-helpers';
import { hbs } from 'ember-cli-htmlbars';
import EmberObject from '@ember/object';
import Service from '@ember/service';

/* The board header (templates/application.hbs) gates its home buttons on {{basic-try-home ...}}
 * combined with the app's own `or`/`not`/`and` helpers. This renders the header's exact grey-button
 * condition and checks it follows the try marker as it changes (2026-10-01). */
module('Integration | Helper | basic-try-home', function(hooks) {
  setupRenderingTest(hooks);

  test('the grey "Set as Home" gate follows the try marker', async function(assert) {
    // A stub: the real service replaces `currentUser` from the session as the app boots.
    this.owner.unregister('service:app-state');
    this.owner.register('service:app-state', Service.extend({
      currentUser: EmberObject.create({ id: '1_3', user_name: 'slp_ana', preferences: { home_board: { key: 'slp_ana/home' } } }),
      currentBoardState: { key: 'public/core-60' },
      basic_try_home: null
    }));
    var appState = this.owner.lookup('service:app-state');
    this.set('app_state', appState);
    await render(hbs`{{#unless (basic-try-home "other")}}{{#if (or (basic-try-home "self") (not this.app_state.currentUser.preferences.home_board))}}GREY{{/if}}{{/unless}}{{#if (basic-try-home "other")}}BLUE{{/if}}`);
    assert.dom(this.element).hasText('', 'not a try, user has a home board: no button');

    appState.set('basic_try_home', { key: 'public/core-60', user_id: '1_3', user_name: 'slp_ana' });
    await settled();
    assert.dom(this.element).hasText('GREY', 'a try for yourself: grey, even with a home board');

    appState.set('basic_try_home', { key: 'public/core-60', user_id: '1_7', user_name: 'aiden_parker' });
    await settled();
    assert.dom(this.element).hasText('BLUE', 'a try for someone else: only the blue one');
  });
});
