import { module, test } from 'qunit';
import { setupRenderingTest } from 'frontend/tests/helpers';
import { render, click, triggerEvent, triggerKeyEvent } from '@ember/test-helpers';
import { hbs } from 'ember-cli-htmlbars';

/* THE BASIC DASHBOARD'S <=550px SECTION MENU (components/dashboard/section-menu, 2026-11-10). What a
 * person gets: the current section on the toggle, the sections while open, and a menu that closes
 * and puts focus back where they can carry on.
 * OPENED WITHOUT FOCUS on purpose (`triggerEvent`, not `click`): Safari and iOS do not focus a tapped
 * button, and the first version closed only when focus left it, so a tap away there left it open
 * (red-team review 2026-11-10). */
module('Integration | Component | dashboard/section-menu', function(hooks) {
  setupRenderingTest(hooks);

  hooks.afterEach(function() {
    if (this.showMenu) { this.showMenu.remove(); }
  });

  hooks.beforeEach(function() {
    // The test browser is 1440px wide, where `.ch-tabselect` is hidden (it shows at <=550px) and a
    // hidden element cannot take focus; show it, as the narrow layout does (the same approach as
    // classic-rail-dropdown-test.js).
    this.showMenu = document.createElement('style');
    this.showMenu.textContent = '.ch-tabselect { display: block !important; }';
    document.head.appendChild(this.showMenu);
    this.set('items', [
      { id: 'main', label: "Actions" },
      { id: 'supervisees', label: "Communicators" },
      { id: 'boards', label: "Boards" },
      { id: 'updates', label: "Updates (3)" }
    ]);
    this.set('current', 'supervisees');
    this.set('chosen', []);
    this.set('onSelect', (id) => { this.get('chosen').push(id); this.set('current', id); });
  });

  function renderMenu() {
    return render(hbs`<div data-test-outside>outside</div><Dashboard::SectionMenu @items={{this.items}} @currentTab={{this.current}} @onSelect={{this.onSelect}} @menuLabel="Dashboard sections" />`);
  }

  test('closed: the toggle names the menu and the current section, and leaves no options behind', async function(assert) {
    await renderMenu();
    assert.dom('.md-pillnav-dropdown__trigger').hasAttribute('aria-label', "Dashboard sections, Communicators");
    assert.dom('.md-pillnav-dropdown__trigger').hasAttribute('aria-expanded', 'false');
    assert.dom('.md-pillnav-dropdown__trigger').doesNotHaveAttribute('aria-controls', 'nothing to control while closed');
    assert.dom('.md-pillnav-dropdown__trigger').doesNotHaveAttribute('aria-haspopup', 'a list of buttons, not an ARIA menu');
    assert.dom('.md-pillnav-dropdown__option').doesNotExist();
  });

  test('a tap away closes it even though the toggle never had focus', async function(assert) {
    await renderMenu();
    await triggerEvent('.md-pillnav-dropdown__trigger', 'click');
    assert.dom('.md-pillnav-dropdown__option').exists({ count: 4 }, 'open');
    assert.dom('.md-pillnav-dropdown__trigger').hasAttribute('aria-expanded', 'true');
    await triggerEvent('[data-test-outside]', 'click');
    assert.dom('.md-pillnav-dropdown__option').doesNotExist('closed by a click outside');
  });

  test('Escape closes it from anywhere and returns focus to the toggle', async function(assert) {
    await renderMenu();
    await triggerEvent('.md-pillnav-dropdown__trigger', 'click');
    // On the body, where a key press lands when nothing in the menu has focus.
    await triggerKeyEvent(document.body, 'keydown', 'Escape');
    assert.dom('.md-pillnav-dropdown__option').doesNotExist('closed');
    assert.dom('.md-pillnav-dropdown__trigger').isFocused();
  });

  test('choosing a section reports it, closes the menu and keeps focus on the toggle', async function(assert) {
    await renderMenu();
    await triggerEvent('.md-pillnav-dropdown__trigger', 'click');
    assert.dom('.md-pillnav-dropdown__option.is-active').hasText("Communicators", 'the current section is lit');
    assert.dom('.md-pillnav-dropdown__option[aria-current="page"]').hasText("Communicators");
    var boards = Array.from(document.querySelectorAll('.md-pillnav-dropdown__option')).find((b) => b.textContent.trim() === "Boards");
    await click(boards);
    assert.deepEqual(this.get('chosen'), ['boards']);
    assert.dom('.md-pillnav-dropdown__option').doesNotExist('closed');
    assert.dom('.md-pillnav-dropdown__trigger').isFocused('focus is not dropped on the page');
    assert.dom('.md-pillnav-dropdown__label').hasText("Boards");
  });
});
