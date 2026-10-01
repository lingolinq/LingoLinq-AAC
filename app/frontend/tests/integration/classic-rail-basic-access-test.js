import { setupRenderingTest } from 'frontend/tests/helpers';
import { render } from '@ember/test-helpers';
import { hbs } from 'ember-cli-htmlbars';
import * as QUnit from 'qunit';

/*
 * Basic Access in the Basic rail (requested 2026-09-30).
 *
 * Basic had no way to reach Basic Access (/offline-boards): the only signed-in entry was a card
 * on Modern's Extras page. Those boards are bundled with the app and work offline, which board
 * search does not, so Basic needs its own way in. The row is one component rendered by both
 * copies of the rail (the home page's inline rail and <Dashboard::ClassicRail />). It shows only
 * under the `emergency_boards` flag, the same gate as Modern's card and the signed-out navbar link.
 */
QUnit.module('Integration | Component | dashboard/classic-rail-basic-access', function(hooks) {
  setupRenderingTest(hooks);

  hooks.beforeEach(function() {
    this.owner.setupRouter();
  });

  QUnit.test('links to Basic Access when the feature is on', async function(assert) {
    await render(hbs`<ul><Dashboard::ClassicRailBasicAccess @show={{true}} /></ul>`);
    assert.dom('li.ch-rail__item a.ch-row').exists({ count: 1 }, 'one rail row');
    assert.dom('li.ch-rail__item a.ch-row').hasAttribute('href', '/offline-boards', 'opens Basic Access');
    assert.dom('.ch-row__title').hasText('Basic Access');
  });

  QUnit.test('renders nothing when the feature is off', async function(assert) {
    await render(hbs`<ul><Dashboard::ClassicRailBasicAccess @show={{false}} /></ul>`);
    assert.dom('li').doesNotExist();
  });
});
