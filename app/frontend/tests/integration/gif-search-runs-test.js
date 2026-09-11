import { setupRenderingTest } from 'frontend/tests/helpers';
import { render, settled } from '@ember/test-helpers';
import { hbs } from 'ember-cli-htmlbars';
import * as QUnit from 'qunit';
import stashes from 'frontend/utils/_stashes';
import contentGrabbers from 'frontend/utils/content_grabbers';
import RSVP from 'rsvp';

/*
 * End-to-end for the GIF modal's search: does opening() actually RUN, seed
 * `search` from the speak bar, and populate `results.columns`?
 *
 * The earlier unit test only proved onOpening is ASSIGNED during init. That is
 * necessary but not sufficient -- ModalDialog still has to invoke it. This pins
 * the observable outcome instead.
 */
QUnit.module('Integration | gif search runs', function(hooks) {
  setupRenderingTest(hooks);

  QUnit.test('opening() seeds the term from the speak bar and fills results', async function(assert) {
    stashes.set('working_vocalization', [{ label: 'happy' }, { label: 'dog' }]);
    // utils/content_grabbers is a Proxy over `window.cg`, which is assigned at
    // module scope in services/content-grabbers.js. A rendering test does not pull
    // that module in on its own, so look the service up first -- otherwise every
    // property reads undefined and the failure is the harness, not the product.
    this.owner.lookup('service:content-grabbers');
    const calls = [];
    const grabber = contentGrabbers.pictureGrabber;
    assert.ok(grabber, 'pictureGrabber resolves through the proxy once the service exists');
    const orig = grabber.protected_search;
    grabber.protected_search = function(str) {
      calls.push(str);
      return RSVP.resolve([
        { image_url: 'a.gif', height: 10 },
        { image_url: 'b.gif', height: 10 },
        { image_url: 'c.gif', height: 10 }
      ]);
    };
    try {
      await render(hbs`<Gif />`);
      await settled();
      assert.deepEqual(calls, ['happy dog'], 'protected_search was called with the speak-bar text');
      const imgs = document.querySelectorAll('.la-gif-modal__thumb');
      assert.strictEqual(imgs.length, 3, 'three result thumbnails rendered');
    } finally {
      grabber.protected_search = orig;
      stashes.set('working_vocalization', []);
    }
  });
});
