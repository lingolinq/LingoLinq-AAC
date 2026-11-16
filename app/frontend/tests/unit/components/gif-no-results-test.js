import { setupTest } from 'frontend/tests/helpers';
import * as QUnit from 'qunit';

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
});
