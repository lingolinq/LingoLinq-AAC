import { setupRenderingTest } from 'frontend/tests/helpers';
import { render, click, triggerKeyEvent } from '@ember/test-helpers';
import { hbs } from 'ember-cli-htmlbars';
import * as QUnit from 'qunit';
import EmberObject from '@ember/object';

/* BASIC LEFT MENU AS A DROPDOWN AT 900px AND BELOW (requested 2026-10-12, all three Basic menus:
 * the home page's, Dashboard::ClassicRail and Dashboard::ClassicAccountRail). One shared piece,
 * Dashboard::ClassicRailDropdown: a trigger, and the menu's own rows wrapped once. Above 900px the
 * CSS hides the trigger and the wrapper is `display: contents`, so the menu is unchanged there;
 * this tests the behaviour the narrow layout relies on. Closes the ways a menu closes: choosing
 * something in it, clicking away, or Escape (focus back on the trigger). */
QUnit.module('Integration | Component | dashboard/classic-rail-dropdown', function(hooks) {
  setupRenderingTest(hooks);

  hooks.beforeEach(async function() {
    this.set('user', EmberObject.create({ user_name: 'example', avatar_url_with_fallback: '/images/avatars/avatar-0.png' }));
    // The test browser is 1440px wide, where the CSS hides the trigger (it exists for <=900px) and a
    // hidden element cannot take focus; show it, as the narrow layout does.
    await render(hbs`
      <style>.ch-rail__menu-trigger { display: flex !important; }</style>
      <div id="outside">outside</div>
      <Dashboard::ClassicRailDropdown @user={{this.user}}>
        <a href="#" id="row-link">A row</a>
      </Dashboard::ClassicRailDropdown>
    `);
  });

  QUnit.test('the trigger names the user and opens and closes the rows', async function(assert) {
    var trigger = this.element.querySelector('.ch-rail__menu-trigger');
    var rows = this.element.querySelector('.ch-rail__rows');
    assert.dom(trigger).includesText('example');
    assert.dom(trigger).hasAttribute('aria-expanded', 'false');
    assert.strictEqual(trigger.getAttribute('aria-controls'), rows.id, 'the trigger controls the rows');
    assert.dom(rows).doesNotHaveClass('is-open');
    await click(trigger);
    assert.dom(trigger).hasAttribute('aria-expanded', 'true');
    assert.dom(rows).hasClass('is-open');
    await click(trigger);
    assert.dom(rows).doesNotHaveClass('is-open', 'the trigger closes it again');
  });

  QUnit.test('the trigger names the page it is the menu for', async function(assert) {
    // Requested 2026-10-12: "instead of Menu, say what page it is for -> on home page it would be
    // Home Page Menu". "Menu" alone only when a page gives no name.
    assert.dom('.ch-rail__menu-sub').hasText('Menu', 'no page name given');
    this.set('page', 'Home Page');
    await render(hbs`<Dashboard::ClassicRailDropdown @user={{this.user}} @pageLabel={{this.page}}>x</Dashboard::ClassicRailDropdown>`);
    assert.dom('.ch-rail__menu-sub').hasText('Home Page Menu');
  });

  QUnit.test('choosing a row closes it', async function(assert) {
    await click('.ch-rail__menu-trigger');
    await click('#row-link');
    assert.dom('.ch-rail__rows').doesNotHaveClass('is-open');
  });

  QUnit.test('clicking away closes it', async function(assert) {
    await click('.ch-rail__menu-trigger');
    await click('#outside');
    assert.dom('.ch-rail__rows').doesNotHaveClass('is-open');
  });

  QUnit.test('Escape closes it and puts focus back on the trigger', async function(assert) {
    await click('.ch-rail__menu-trigger');
    await triggerKeyEvent('#row-link', 'keydown', 'Escape'); // from inside the menu, as a keyboard user would
    assert.dom('.ch-rail__rows').doesNotHaveClass('is-open');
    assert.dom('.ch-rail__menu-trigger').isFocused();
  });
});
