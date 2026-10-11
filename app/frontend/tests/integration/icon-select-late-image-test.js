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
module('Integration | Component | icon-select image check after the picker is gone', function(hooks) {
  setupRenderingTest(hooks);

  test('an image that fails to load after the picker is destroyed does not touch it', async function(assert) {
    assert.expect(1);
    this.set('show', true);
    this.set('value', null);
    await render(hbs`{{#if this.show}}<IconSelect @selection={{this.value}} @action={{fn (mut this.value)}} />{{/if}}`);
    // Not an image: the browser reports the error asynchronously, after the picker below is destroyed.
    this.set('value', 'data:image/png;base64,bm90LWFuLWltYWdl');
    this.set('show', false);
    await settled();
    await new Promise((resolve) => setTimeout(resolve, 200));
    assert.ok(true, 'no error from the late image callback');
  });
});
