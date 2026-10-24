import { setupRenderingTest } from 'frontend/tests/helpers';
import { render } from '@ember/test-helpers';
import { hbs } from 'ember-cli-htmlbars';
import { setComponentTemplate } from '@ember/component';
import Component from '@ember/component';
import EmberObject from '@ember/object';
import template from 'frontend/templates/application';
import * as QUnit from 'qunit';

/* The Speak Mode sidebar used to offer Light and Dark as route links
   (sidebar_item--board-alt, keys board_alt_return and board_alt). Those items
   are gone. Board colour stays on board-detail's own toggle. */
QUnit.module('Integration | Speak Mode sidebar has no Light/Dark links', function(hooks) {
  setupRenderingTest(hooks);

  function page(route, key) {
    return EmberObject.create({
      speak_mode: true,
      eval_mode: false,
      sidebar_visible: true,
      current_route: route,
      currentBoardState: EmberObject.create({ id: '1_2', key: key }),
      sidebar_boards: [{ name: 'Home board', key: key, image: '' }],
      index_or_landing_view: false
    });
  }

  async function renderSidebar(owner, assert, route, key) {
    var Shell = setComponentTemplate(template, Component.extend({
      app_state: page(route, key),
      on_board_alt: route === 'user.board-alt.index',
      on_board: route === 'board.index',
      on_board_detail: false,
      footer: false,
      word_prediction_on: false,
      sidebar_style: '',
      ctrlAction: function() { return function() {}; }
    }));
    owner.register('component:speak-sidebar-subject', Shell);
    await render(hbs`<SpeakSidebarSubject />`);
    assert.dom('#sidebar').exists('Speak Mode shows the sidebar');
    assert.dom('#sidebar .sidebar_item--board-alt').doesNotExist();
    assert.dom('#sidebar').doesNotIncludeText('Light');
    assert.dom('#sidebar').doesNotIncludeText('Dark');
  }

  QUnit.test('board-alt has no sidebar Light or Dark item', async function(assert) {
    assert.expect(4);
    await renderSidebar(this.owner, assert, 'user.board-alt.index', 'sarah/home');
  });

  QUnit.test('an obf board has no sidebar Light or Dark item', async function(assert) {
    assert.expect(4);
    await renderSidebar(this.owner, assert, 'board.index', 'obf/stars');
  });
});
