import { setupRenderingTest } from 'frontend/tests/helpers';
import { render, click, settled } from '@ember/test-helpers';
import { hbs } from 'ember-cli-htmlbars';
import * as QUnit from 'qunit';

/*
 * The sidebar tease is the double-chevron control that re-opens a collapsed sidebar in
 * speak mode. It is rendered by `application.hbs` (and `brief.hbs`) whenever
 * `app_state.sidebar_visible` is false, so it is the ONLY way back once the sidebar has
 * been collapsed.
 *
 * Reported symptom: "the sidebar expander responds to only a first click, then doesn't
 * respond after that." Those are two different controls in the same corner -- collapsing
 * goes through `#sidebar_close` (bound via `ctrlAction`), expanding goes through
 * `#sidebar_tease` (this component). The first click works and the second never does
 * because they are not the same handler.
 *
 * `components/sidebar-tease.hbs` wires `{{on "click" this.toggleSidebar}}`, and `{{on}}`
 * does NOT bind `this`. On a classic `Component.extend({...})` the handler is a plain
 * prototype method, so at click time `this` is the untouchable-this proxy (dev) or the
 * <button> element (prod) -- and `this.get('stashes')` throws before anything is
 * persisted.
 *
 * The state latches, which is what makes this worse than a dead button:
 * `controllers/application.js#stickSidebar` writes `preferences.quick_sidebar = false` and
 * SAVES it to the server, so a communicator who collapses the sidebar cannot get it back
 * on this device or any other.
 *
 * THE CONTRACT: clicking the tease flips `stashes.sidebarEnabled`. Every time, not once.
 */
QUnit.module('Integration | Component | sidebar-tease toggle', function(hooks) {
  setupRenderingTest(hooks);

  function stashes(ctx) { return ctx.owner.lookup('service:stashes'); }

  hooks.beforeEach(function() {
    // Deliberately NOT stubbing app-state here: `sidebar_relegated` and `eval_mode` are
    // computed properties and `set()` on them throws, which would make every test in this
    // module fail in beforeEach -- red for the wrong reason. `@alwaysShow` satisfies the
    // outer gate, and the remaining three gates are falsy on a booted service, which the
    // CONTROL test below proves rather than assumes.
    stashes(this).set('sidebarEnabled', false);
  });

  hooks.afterEach(async function() {
    // `stashes.persist` writes real localStorage and schedules a 500ms debounced
    // db_persist, and `memory_stash` is a module-level singleton re-read by every fresh
    // service. Without this, `sidebarEnabled: true` leaks into other test files and a
    // live timer can be charged to whichever test runs next.
    stashes(this).persist('sidebarEnabled', false);
    await settled();
  });

  QUnit.test('CONTROL: the button renders, so a later failure means the handler, not the gate', async function(assert) {
    await render(hbs`<SidebarTease @alwaysShow={{true}} />`);
    assert.ok(document.querySelector('#sidebar_tease'), 'the tease button is in the DOM');
  });

  QUnit.test('clicking the tease flips sidebarEnabled', async function(assert) {
    await render(hbs`<SidebarTease @alwaysShow={{true}} />`);
    assert.false(stashes(this).get('sidebarEnabled'), 'starts collapsed');

    await click('#sidebar_tease');

    assert.true(stashes(this).get('sidebarEnabled'), 'one click expands it');
  });

  QUnit.test('the tease keeps working after the first click', async function(assert) {
    // This is the reported bug and the only test here that pins TOGGLE semantics: an
    // implementation that writes `true` unconditionally passes the test above and dies
    // on the second assertion here.
    await render(hbs`<SidebarTease @alwaysShow={{true}} />`);

    await click('#sidebar_tease');
    assert.true(stashes(this).get('sidebarEnabled'), 'first click expands');

    await click('#sidebar_tease');
    assert.false(stashes(this).get('sidebarEnabled'), 'second click collapses');

    await click('#sidebar_tease');
    assert.true(stashes(this).get('sidebarEnabled'), 'third click expands again');
  });
});

/*
 * A fourth test was written and deliberately removed. It did:
 *
 *   var detached = component.toggleSidebar;
 *   detached.call(undefined);
 *
 * which is a fair simulation of what {{on}} does, but it asserts that `toggleSidebar` is a
 * callable OWN PROPERTY -- true only if the fix is an init-assigned closure. Under the
 * pattern this repo actually mandates (`actions: {}` + a component-local `ctrlAction`, see
 * learnings-archive/LEARNINGS-2026-01_to_2026-09.md and components/password-field.js),
 * `component.toggleSidebar` is undefined and that test throws.
 *
 * A test that goes green for exactly one candidate fix and hard-fails another is the
 * implementation restated as an assertion, not a contract. The click tests above cover the
 * same mechanism through the real DOM path, which is what actually ships.
 */
