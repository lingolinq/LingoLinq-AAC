import { setupRenderingTest } from 'frontend/tests/helpers';
import { render } from '@ember/test-helpers';
import { hbs } from 'ember-cli-htmlbars';
import * as QUnit from 'qunit';
import EmberObject from '@ember/object';

/*
 * The {{display-name}} helper, rendered.
 *
 * utils/display_name is unit-tested separately; what THIS guards is the part a
 * unit test and a green build both miss — that the helper actually RESOLVES by
 * name in a template. Helper lookup happens at render time, so a renamed or
 * moved module compiles fine and only fails on the page.
 *
 * It matters because most of the call sites pass a `limited_identity` payload
 * (board.shared_users, utterance.user, the org roster, supervisors/supervisees)
 * — a plain object, not an Ember-Data record, so the `display_name` computed on
 * the user model can never run there. If the helper silently failed, every one
 * of those surfaces would go back to printing the server's "No name" sentinel,
 * which is precisely the bug this replaced.
 */
QUnit.module('Integration | {{display-name}} helper', function(hooks) {
  setupRenderingTest(hooks);

  QUnit.test('resolves the server placeholder to the handle on a plain payload', async function(assert) {
    this.set('user', {name: 'No name', user_name: 'ada'});
    await render(hbs`<span id="out">{{display-name this.user}}</span>`);
    assert.strictEqual(this.element.querySelector('#out').textContent.trim(), 'ada');
  });

  QUnit.test('renders a real name unchanged', async function(assert) {
    this.set('user', {name: 'Ada Lovelace', user_name: 'ada'});
    await render(hbs`<span id="out">{{display-name this.user}}</span>`);
    assert.strictEqual(this.element.querySelector('#out').textContent.trim(), 'Ada Lovelace');
  });

  QUnit.test('reads through .get() for an Ember-Data-shaped record', async function(assert) {
    this.set('user', EmberObject.create({name: 'No name', user_name: 'ada'}));
    await render(hbs`<span id="out">{{display-name this.user}}</span>`);
    assert.strictEqual(this.element.querySelector('#out').textContent.trim(), 'ada');
  });

  QUnit.test('renders nothing rather than throwing on a missing user', async function(assert) {
    this.set('user', null);
    await render(hbs`<span id="out">{{display-name this.user}}</span>`);
    assert.strictEqual(this.element.querySelector('#out').textContent.trim(), '');
  });
});
