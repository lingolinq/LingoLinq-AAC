import { setupRenderingTest } from 'frontend/tests/helpers';
import { render, click } from '@ember/test-helpers';
import { hbs } from 'ember-cli-htmlbars';
import * as QUnit from 'qunit';

/*
 * Does `@action={{mut this.value}}` still reach a component that INVOKES it?
 *
 * Several components take an `@action` and call it as a function to hand a value back:
 *
 *   var callback = this.get('action');
 *   callback(url);                       // icon-select
 *
 * Under Ember 3.x a bare `{{mut}}` passed a callable cell, so that worked. It is called from
 * ~103 call sites in this app. `icon-select` was found throwing
 * "callback is not a function" at runtime on every thumbnail click, which says the cell is no
 * longer callable — but `bound-select` (100 of those call sites) guards with
 * `typeof callback === 'function'`, so it CANNOT throw, and whether the value still reaches
 * the parent there is a different question with a different answer.
 *
 * These tests settle both, because "it doesn't throw" and "it works" are not the same claim
 * and the guard makes them look identical from the outside.
 */
QUnit.module('Integration | mut as an invoked @action', function(hooks) {
  setupRenderingTest(hooks);

  QUnit.test('a bare {{mut}} is NOT callable, so an invoking component cannot hand the value back', async function(assert) {
    var called = null;
    this.set('value', 'before');
    this.set('probe', function(cb) { called = typeof cb; });
    await render(hbs`
      <button type="button" id="probe-bare" {{on "click" (fn this.probe (mut this.value))}}></button>
    `);
    await click('#probe-bare');
    assert.notStrictEqual(called, 'function',
      'a bare {{mut}} arrives as something other than a function (got: ' + called + ')');
  });

  QUnit.test('{{fn (mut …)}} IS callable and writes through to the parent', async function(assert) {
    var received = null;
    this.set('value', 'before');
    this.set('probe', function(cb) { received = typeof cb; if (typeof cb === 'function') { cb('after'); } });
    await render(hbs`
      <button type="button" id="probe-fn" {{on "click" (fn this.probe (fn (mut this.value)))}}></button>
    `);
    await click('#probe-fn');
    assert.strictEqual(received, 'function', '{{fn (mut …)}} arrives as a function');
    assert.strictEqual(this.get('value'), 'after', 'and calling it updates the parent value');
  });

  QUnit.test('BoundSelect: does choosing an option reach the parent with a bare {{mut}}?', async function(assert) {
    this.set('value', null);
    this.set('content', [{ id: 'a', name: 'Alpha' }, { id: 'b', name: 'Beta' }]);
    await render(hbs`
      <BoundSelect @select_id="probe_sel" @content={{this.content}} @selection={{this.value}} @action={{mut this.value}} />
    `);
    /* Real selectors from bound-select.hbs — the first attempt guessed `.md-select__*`
       and errored, which reads like a broken component rather than a broken test. */
    var trigger = document.querySelector('.bound-select__trigger');
    assert.ok(trigger, 'the select rendered a trigger');
    await click(trigger);
    var option = [...document.querySelectorAll('.bound-select__option')]
      .find(function(o) { return /Beta/.test(o.textContent || ''); });
    assert.ok(option, 'the options opened');
    await click(option);
    /* Asserted explicitly so the answer is VISIBLE either way: a passing `assert.ok(true, …)`
       never prints its message, so the first version of this test established nothing. If
       BoundSelect's `typeof callback === 'function'` guard means the value never leaves the
       component, this fails and names what it actually got. */
    assert.strictEqual(this.get('value'), 'b',
      'choosing "Beta" writes its id back to the parent through @action={{mut}}');
  });

  /* ── The three remaining bare-{{mut}} call sites, one test each ──────────────────
     They are NOT the same case, which is the whole point of testing rather than
     pattern-matching on the argument:
       ModernSelect  (templates/search.hbs:32)              — structurally identical to
                                                              BoundSelect: guards the call AND
                                                              does `set('selection', id)`.
       IconSelect    (components/generate-board.hbs:79)     — calls `callback(url)` UNGUARDED,
                                                              and its own write goes to
                                                              `_selection`, which nothing renders.
       UserSelect    (components/assessment-settings.hbs:14) — guards the call, but its `select`
                                                              action never sets `selection`, and
                                                              it also forwards the same cell down
                                                              to a nested BoundSelect. */

  QUnit.test('ModernSelect: choosing an option with a bare {{mut}}', async function(assert) {
    this.set('value', null);
    this.set('content', [{ id: 'a', name: 'Alpha' }, { id: 'b', name: 'Beta' }]);
    await render(hbs`
      <ModernSelect @selectId="probe_modern" @content={{this.content}} @selection={{this.value}} @action={{mut this.value}} />
    `);
    var trigger = document.querySelector('#probe_modern, .modern-select__trigger, [class*="trigger"]');
    assert.ok(trigger, 'trigger rendered');
    await click(trigger);
    var option = [...document.querySelectorAll('[class*="option"], [role="option"]')]
      .find(function(o) { return /Beta/.test(o.textContent || ''); });
    assert.ok(option, 'options opened');
    await click(option);
    assert.strictEqual(this.get('value'), 'b',
      'ModernSelect writes the chosen id back to the parent');
  });

  QUnit.test('IconSelect: clicking a thumbnail with a bare {{mut}}', async function(assert) {
    this.set('value', null);
    /* `extra_urls` feeds `included_icon_urls`, so the picker renders a thumbnail without
       depending on the global icon list being populated in the test app. */
    this.set('extra', ['https://example.test/icon-one.png']);
    await render(hbs`
      <IconSelect @selection={{this.value}} @extra_urls={{this.extra}} @action={{mut this.value}} />
    `);
    var img = document.querySelector('.icon_urls img');
    assert.ok(img, 'a thumbnail rendered');
    /* Assert against the url ACTUALLY clicked, not a hardcoded one: `.icon_urls img` matches
       the global `iconUrls` list first, and `extra_urls` renders after it — the first version
       of this test expected its own extra url and failed against a perfectly correct
       mulberry/house.svg, which reads like the component is broken when it is not. */
    var clicked = img.getAttribute('src');
    await click(img);
    /* Passes with a BARE {{mut}} now that pick() writes through `selection` before calling
       the action, and guards the call — the same shape bound-select and modern-select always
       had. Before that it threw "callback is not a function" here. The call sites were also
       moved to `fn (mut …)`, so this is belt AND braces: either alone is sufficient. */
    assert.strictEqual(this.get('value'), clicked,
      'IconSelect writes the picked url back to the parent even with a bare {{mut}}');
  });

  QUnit.test('UserSelect: choosing a user with a bare {{mut}} (no @buttons — the real call site)', async function(assert) {
    this.set('value', null);
    /* `@users` provided, so the component skips its supervisee lookup and the `action('self')`
       defaulting branch — this isolates the CARD-CLICK path (`select`), which is the one that
       never sets its own `selection`. */
    this.set('users', [
      { id: 'u1', user_name: 'one', name: 'One' },
      { id: 'u2', user_name: 'two', name: 'Two' }
    ]);
    await render(hbs`
      <UserSelect @select_id="probe_user" @users={{this.users}} @selection={{this.value}} @action={{mut this.value}} />
    `);
    /* NO `@buttons`, matching the only bare-{{mut}} call site (assessment-settings.hbs:14).
       user-select.hbs is `{{#if this.buttons}}` card-grid `{{else}}` BoundSelect — so the
       real configuration renders a NESTED BoundSelect and forwards the same cell down to it.
       The first version of this test clicked for a card, which that branch never renders, and
       failed on "a user card rendered" — a test-setup miss that looked like a component bug.
       What matters here is whether the write-through survives TWO levels of one-way binding:
       parent -> UserSelect(@selection) -> BoundSelect(@selection). */
    var trigger = document.querySelector('.bound-select__trigger');
    assert.ok(trigger, 'the nested BoundSelect rendered');
    await click(trigger);
    var option = [...document.querySelectorAll('.bound-select__option')]
      .find(function(o) { return /two/i.test(o.textContent || ''); });
    assert.ok(option, 'its options opened');
    await click(option);
    assert.strictEqual(this.get('value'), 'u2',
      'UserSelect forwards the choice back to the parent through the nested BoundSelect');
  });
});
