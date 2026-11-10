import { setupRenderingTest } from 'frontend/tests/helpers';
import { render, settled } from '@ember/test-helpers';
import { hbs } from 'ember-cli-htmlbars';
import { module, test } from 'qunit';

/*
 * icon-select checks a new selection by loading it in an Image; the onload/onerror callback runs
 * later. When the picker is gone by then (a modal closed, a test ended) the callback must not touch it:
 * `set` on a destroyed component throws in development and test builds, and in CI that error landed as
 * a global failure in whichever test was running (build-and-test at 721ac33f0, "IconSelect: clicking a
 * thumbnail with a bare {{mut}}").
 */

const LOADS = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
const FAILS = 'data:image/png;base64,bm90LWFuLWltYWdl'; // not an image

// Resolves once the browser has answered a load of `url` (load or error). The component's own Image for
// the same url was started first, so its callback has run by then; one more tick lets it finish.
function imageAnswered(url) {
  return new Promise((resolve) => {
    const probe = new Image();
    probe.onload = probe.onerror = () => setTimeout(resolve, 0);
    probe.src = url;
  });
}

module('Integration | Component | icon-select image check after the picker is gone', function(hooks) {
  setupRenderingTest(hooks);

  async function selectThenDestroy(context, url) {
    context.set('show', true);
    context.set('value', null);
    await render(hbs`{{#if this.show}}<IconSelect @selection={{this.value}} @action={{fn (mut this.value)}} />{{/if}}`);
    context.set('value', url); // starts the component's image check
    context.set('show', false); // destroys the picker before the browser answers
    await settled();
    await imageAnswered(url);
  }

  test('an image that fails to load after the picker is destroyed does not touch it', async function(assert) {
    assert.expect(1);
    await selectThenDestroy(this, FAILS);
    assert.ok(true, 'no error from the late onerror callback');
  });

  test('an image that loads after the picker is destroyed does not touch it', async function(assert) {
    assert.expect(1);
    await selectThenDestroy(this, LOADS);
    assert.ok(true, 'no error from the late onload callback');
  });
});
