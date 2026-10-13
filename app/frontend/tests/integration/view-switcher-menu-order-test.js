import { setupRenderingTest } from 'frontend/tests/helpers';
import { render } from '@ember/test-helpers';
import { hbs } from 'ember-cli-htmlbars';
import Service from '@ember/service';
import * as QUnit from 'qunit';

/*
 * The View menu's two groups each lead with the option the app steers people to:
 * Layout leads with Modern (badged "Recommended"), Style leads with Focused (badged
 * "Default", because User#generate_defaults seeds `dashboard_layout = 'focused'` under
 * `new_record?` — app/models/user.rb).
 *
 * Order is pinned as a TEST rather than left to review because it is invisible to every
 * other check in the repo: both orders render, both lint clean, and both pass the
 * existing view-switcher-availability-test. The only thing that catches an accidental
 * swap — a copy/paste during an unrelated edit to these near-identical <li> blocks — is
 * an assertion on the sequence.
 *
 * The badge is asserted to sit INSIDE the Focused item rather than merely existing on the
 * page, since the same `ll-viewswitch__item-tag` class is also Modern's "Recommended"
 * pill; a document-wide query would pass with the badge on the wrong row.
 *
 * `aria-checked` is asserted alongside, because reordering is exactly the edit that can
 * leave a stale `{{if}}`/`{{unless}}` pairing behind and make the menu tick the option the
 * user is NOT on. The stub user has no `dashboard_layout` and no `board_view_style`, i.e.
 * the absent-preference case, so the expected ticks are Gentle and Modern.
 */
QUnit.module('Integration | view-switcher menu order', function(hooks) {
  setupRenderingTest(hooks);

  hooks.beforeEach(function() {
    // Unregister first: a bare `register` over an already-registered service is silently
    // ignored, which would leave every gate reading `undefined` and the menu unrendered.
    // Same reason view-switcher-availability-test.js#stubAppState unregisters.
    this.owner.unregister('service:app-state');
    this.owner.register('service:app-state', Service.extend({
      currentUser: { id: 'u1' },
      // `available` needs these false, or the whole menu is withheld.
      speak_mode: false,
      edit_mode: false,
      // Plain objects with a `get`: `isClassic` runs the real `is_classic(user)` and
      // `isFocused` does a `.get()` through the service path.
      effective_view_user: { get: function() { return null; } },
      sessionUser: { get: function() { return null; } }
    }));
  });

  function labels(selector) {
    return Array.prototype.map.call(
      document.querySelectorAll(selector),
      function(el) { return el.textContent.trim(); }
    );
  }

  QUnit.test('each group leads with the option carrying its badge', async function(assert) {
    assert.expect(5);
    await render(hbs`<ViewSwitcher />`);

    var items = document.querySelectorAll('.ll-viewswitch__item');
    assert.strictEqual(items.length, 4, 'both axes render both of their options');

    var names = labels('.ll-viewswitch__item-label');
    // The badge text is nested inside the label span, so the badged rows are matched by
    // their leading text rather than by equality.
    assert.strictEqual(names[0].indexOf('Modern View'), 0, 'Layout leads with Modern View');
    assert.strictEqual(names[1], 'Basic View', 'Basic View follows it');
    assert.strictEqual(names[2].indexOf('Focused Style'), 0, 'Style leads with Focused Style');
    assert.strictEqual(names[3], 'Gentle Style', 'Gentle Style follows it');
  });

  QUnit.test('the Default badge belongs to Focused, and Recommended to Modern', async function(assert) {
    assert.expect(2);
    await render(hbs`<ViewSwitcher />`);

    var items = document.querySelectorAll('.ll-viewswitch__item');
    // `?.` so a missing pill fails on the text rather than throwing, which reports the
    // actual problem instead of an unrelated TypeError.
    var modernTag = items[0].querySelector('.ll-viewswitch__item-tag')?.textContent.trim();
    var focusedTag = items[2].querySelector('.ll-viewswitch__item-tag')?.textContent.trim();

    assert.strictEqual(modernTag, 'Recommended', 'the Recommended pill sits on Modern View');
    assert.strictEqual(focusedTag, 'Default', 'the Default pill sits on Focused Style');
  });

  QUnit.test('reordering did not detach aria-checked from the active option', async function(assert) {
    assert.expect(4);
    await render(hbs`<ViewSwitcher />`);

    var items = document.querySelectorAll('.ll-viewswitch__item');
    // No stored board_view_style => modern; no stored dashboard_layout => gentle.
    assert.strictEqual(items[0].getAttribute('aria-checked'), 'true', 'Modern is ticked');
    assert.strictEqual(items[1].getAttribute('aria-checked'), 'false', 'Basic is not');
    assert.strictEqual(items[2].getAttribute('aria-checked'), 'false', 'Focused is not ticked');
    assert.strictEqual(items[3].getAttribute('aria-checked'), 'true', 'Gentle is');
  });
});
