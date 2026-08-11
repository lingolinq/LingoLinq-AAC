import { setupRenderingTest } from 'frontend/tests/helpers';
import { render, click } from '@ember/test-helpers';
import { hbs } from 'ember-cli-htmlbars';
import * as QUnit from 'qunit';
import EmberObject from '@ember/object';

/*
 * Folders accordion on the user boards page (`available-boards-section`).
 *
 * Guards the helper-contract pairing between the template and the component.
 * Every action wrapper in this component (`ctrlAction`, `ctrlActionNoBubble`,
 * `selfActionNoBubble`, `eventAction`, `selfEventAction`) is a FACTORY: it
 * returns the handler, and templates bind it as `{{on "click" (this.x "name")}}`.
 *
 * If `sendAction` is instead written to invoke `send()` immediately, that same
 * binding evaluates at RENDER time — it fires the action during render and
 * hands `{{on}}` an `undefined` handler, so the click is never wired. These
 * tests fail in exactly that case, which the template linter cannot catch
 * (`no-fn-handler-factory` only flags the mirror-image `(fn factory)` misuse,
 * and `sendAction` is not in its name list).
 *
 * See docs/task-management/2026-08-10-recover-stranded-new-work-commit.md.
 */
QUnit.module('Integration | available-boards-section folders accordion', function(hooks) {
  setupRenderingTest(hooks);

  hooks.beforeEach(function() {
    // foldersExpanded is restored from localStorage in init(); clear it so the
    // starting state is deterministic rather than whatever the last run wrote.
    try { window.localStorage.removeItem('ub-boards-folders-expanded'); } catch (e) { /* unavailable */ }

    // Minimum stub to get past the template's render gates: board_list.results
    // truthy, not prior_home_selected, mineFoldersEnabled on. `results` must be
    // NON-EMPTY — Glimmer's {{#if}} treats an empty array as falsy, so `[]`
    // silently skips the whole section.
    var board = EmberObject.create({ key: 'tester/one', name: 'One' });
    this.set('boardsCtrl', EmberObject.create({
      board_list: EmberObject.create({
        results: [EmberObject.create({ board: board })],
        filtered_results: [EmberObject.create({ board: board })]
      }),
      mineFoldersEnabled: true,
      mine_selected: true,
      model: EmberObject.create({ permissions: {} })
    }));
  });

  QUnit.test('renders collapsed — the toggle must not fire during render', async function(assert) {
    assert.timeout(30000);
    await render(hbs`<AvailableBoardsSection @boardsCtrl={{this.boardsCtrl}} />`);

    assert.dom('.ub-boards-page__folders-toggle').exists('folders header toggle renders');
    assert.dom('.ub-boards-page__folders-toggle').hasAttribute('aria-expanded', 'false',
      'starts collapsed — a render-time send() would have flipped it open');
    assert.dom('.ub-boards-page__folders-section').doesNotHaveClass('ub-boards-page__folders-section--open',
      'section does not carry the open modifier on first paint');
  });

  QUnit.test('clicking the Folders header expands the section', async function(assert) {
    assert.timeout(30000);
    await render(hbs`<AvailableBoardsSection @boardsCtrl={{this.boardsCtrl}} />`);

    await click('.ub-boards-page__folders-toggle');

    assert.dom('.ub-boards-page__folders-toggle').hasAttribute('aria-expanded', 'true',
      'header click toggles the accordion open');
    assert.dom('.ub-boards-page__folders-section').hasClass('ub-boards-page__folders-section--open',
      'open modifier applied so the body is revealed');
    assert.dom('#ub-boards-page__folders-body').exists('folders body renders once expanded');
  });

  QUnit.test('clicking the chevron toggles the section too', async function(assert) {
    assert.timeout(30000);
    await render(hbs`<AvailableBoardsSection @boardsCtrl={{this.boardsCtrl}} />`);

    await click('.ub-boards-page__folders-chevron-btn');
    assert.dom('.ub-boards-page__folders-toggle').hasAttribute('aria-expanded', 'true',
      'chevron expands');

    await click('.ub-boards-page__folders-chevron-btn');
    assert.dom('.ub-boards-page__folders-toggle').hasAttribute('aria-expanded', 'false',
      'chevron collapses again');
  });
});
