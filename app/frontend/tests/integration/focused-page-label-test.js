import { setupRenderingTest } from 'frontend/tests/helpers';
import { render } from '@ember/test-helpers';
import { hbs } from 'ember-cli-htmlbars';
import Service from '@ember/service';
import * as QUnit from 'qunit';

/*
 * A page title for Focused, where some pages' heroes are hidden (requested 2026-10-01 for the Basic
 * Access page: "we need a page title for the offline boards - that has our two-toned icon and
 * header (like that on the rooms page)"). It renders the Rooms page's `md-compact-head` label --
 * the caller's icon, then the title -- and nothing in Gentle, where the hero is the title.
 */
QUnit.module('Integration | Component | focused-page-label', function(hooks) {
  setupRenderingTest(hooks);

  function layout(context, value) {
    context.owner.unregister('service:app-state');
    context.owner.register('service:app-state', Service.extend({ effectiveLayout: value }));
  }

  QUnit.test('in Focused: the icon, then the title, as the Rooms page label', async function(assert) {
    layout(this, 'focused');
    await render(hbs`<FocusedPageLabel @title="Basic Access"><svg class="test-icon"></svg></FocusedPageLabel>`);
    assert.dom('.md-compact-head').exists();
    assert.dom('.md-compact-head > svg.test-icon').exists('the caller\'s icon, first');
    assert.dom('.md-compact-head .md-compact-head__title').hasText('Basic Access');
  });

  QUnit.test('nothing in Gentle, which keeps the page hero', async function(assert) {
    layout(this, 'gentle');
    await render(hbs`<FocusedPageLabel @title="Basic Access"><svg class="test-icon"></svg></FocusedPageLabel>`);
    assert.dom('.md-compact-head').doesNotExist();
  });
});
