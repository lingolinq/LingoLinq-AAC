import { setupTest } from 'frontend/tests/helpers';
import { settled } from '@ember/test-helpers';
import RSVP from 'rsvp';
import contentGrabbers from 'frontend/utils/content_grabbers';
import * as QUnit from 'qunit';
import { first_with_picture } from 'frontend/components/gif';

/*
 * A GIF search that finds nothing used to leave the modal blank: an empty answer still built the
 * three-column grid (components/gif.js searchGifs), and the grid skips results without a picture
 * (components/gif.hbs, `{{#if pic.image_url}}`), so neither case reached the "No results" branch,
 * which only runs when there is no answer at all. `results_empty` is what the template checks to
 * show the no-results message instead.
 */
QUnit.module('Unit | Component | gif no results', function(hooks) {
  setupTest(hooks);

  function gif(owner, results) {
    const comp = owner.factoryFor('component:gif').create();
    comp.set('results', results);
    return comp;
  }

  QUnit.test('a search that found nothing is empty', function(assert) {
    assert.true(gif(this.owner, { list: [], columns: [{ list: [] }, { list: [] }, { list: [] }] }).get('results_empty'));
  });

  QUnit.test('results with no picture to show are empty too', function(assert) {
    assert.true(gif(this.owner, { list: [{ image_url: null }, {}], columns: [] }).get('results_empty'));
  });

  QUnit.test('one result with a picture is not empty', function(assert) {
    assert.false(gif(this.owner, { list: [{}, { image_url: 'https://example.com/a.gif' }], columns: [] }).get('results_empty'));
  });

  QUnit.test('loading, an error, or no search yet is not "no results"', function(assert) {
    assert.false(gif(this.owner, { loading: true }).get('results_empty'), 'loading');
    assert.false(gif(this.owner, { error: true }).get('results_empty'), 'error has its own message');
    assert.false(gif(this.owner, null).get('results_empty'), 'nothing searched yet');
  });

  QUnit.test('"lucky" picks the first result with a picture, or none (then the no-results message shows)', function(assert) {
    var pic = { image_url: 'https://example.com/b.gif' };
    assert.strictEqual(first_with_picture([{}, { image_url: '' }, pic]), pic);
    assert.strictEqual(first_with_picture([{}, {}]), null);
    assert.strictEqual(first_with_picture(null), null);
  });

  QUnit.test('lucky mode is read from the {lucky: true} the button opens it with', async function(assert) {
    var comp = this.owner.factoryFor('component:gif').create();
    var grabber = contentGrabbers.pictureGrabber;
    var own = Object.prototype.hasOwnProperty.call(grabber, 'protected_search');
    var original = grabber.protected_search;
    var pic = { image_url: 'https://example.com/b.gif', height: 1 };
    grabber.protected_search = function() { return RSVP.resolve([{ height: 1 }, pic]); };
    try {
      comp.set('model', { lucky: true });
      comp.set('search', 'hello');
      comp.searchGifs();
      await settled();
    } finally {
      if(own) { grabber.protected_search = original; } else { delete grabber.protected_search; }
    }
    assert.strictEqual(comp.get('selected_gif'), pic);
  });
});
