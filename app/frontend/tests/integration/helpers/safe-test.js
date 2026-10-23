import { module, test } from 'qunit';
import { setupRenderingTest } from 'frontend/tests/helpers';
import { render } from '@ember/test-helpers';
import { hbs } from 'ember-cli-htmlbars';

/* {{safe x "stripped"}} shows a goal description as plain text (templates/goals/index.hbs,
 * components/new-goal.hbs). The server keeps typed markup as entity text (processable.rb
 * process_html), and DOMParser's textContent decodes those entities, so the stripped result must
 * be inserted as text, never as trusted HTML (2026-10-23). */
module('Integration | Helper | safe', function(hooks) {
  setupRenderingTest(hooks);

  test('stripped mode does not turn entity text back into markup', async function(assert) {
    this.set('text', 'before &lt;b id="safe-stripped-xss"&gt;inside&lt;/b&gt; after');
    await render(hbs`<div id="out">{{safe this.text "stripped"}}</div>`);
    assert.dom('#safe-stripped-xss').doesNotExist('decoded entities are not rendered as an element');
    assert.dom('#out').hasText('before <b id="safe-stripped-xss">inside</b> after', 'the decoded text is shown literally');
  });

  test('stripped mode still drops real markup', async function(assert) {
    this.set('text', '<p>Hello <b>world</b></p>');
    await render(hbs`<div id="out">{{safe this.text "stripped"}}</div>`);
    assert.dom('#out b').doesNotExist('no element survives stripping');
    assert.dom('#out').hasText('Hello world');
  });

  test('default mode still renders sanitized HTML', async function(assert) {
    this.set('text', '<p>Hello <b>world</b></p>');
    await render(hbs`<div id="out">{{safe this.text}}</div>`);
    assert.dom('#out b').hasText('world', 'non-stripped mode is unchanged');
  });
});
