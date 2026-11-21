import { module, test } from 'qunit';
import { install_symbol_filters, SYMBOL_FILTERS_ID } from 'frontend/utils/symbol_filters';
import symbolFiltersInitializer from 'frontend/initializers/symbol-filters';

/* FIREFOX DREW NO SYMBOLS IN COLORED MODE ON THE DEPLOYED WEB APP
 * (docs/task-management/2026-11-21_firefox-symbol-filter.md).
 *
 * app.scss gives Colored-mode symbols `filter: url(#ll-symbol-white-backing)`. The filter lived only in
 * app/index.html; Rails serves app/views/boards/index.html.erb, which never had it, and Firefox does not draw an
 * element whose filter points at a missing element. The app now inserts the filters itself. */
module('Unit | Utility | symbol filters', function() {
  function freshDoc() { return document.implementation.createHTMLDocument('symbol filters'); }

  test('adds both filters to a page that has none', function(assert) {
    var doc = freshDoc();
    assert.strictEqual(doc.getElementById('ll-symbol-white-backing'), null);
    var svg = install_symbol_filters(doc);
    assert.strictEqual(svg.parentNode, doc.body);
    assert.strictEqual(svg.namespaceURI, 'http://www.w3.org/2000/svg', 'parsed as SVG, not as unknown HTML');
    var backing = doc.getElementById('ll-symbol-white-backing');
    assert.ok(backing, 'the Colored-mode backing filter app.scss names');
    assert.strictEqual(backing.tagName.toLowerCase(), 'filter');
    assert.strictEqual(backing.namespaceURI, 'http://www.w3.org/2000/svg');
    assert.deepEqual(Array.from(backing.children).map((c) => c.tagName), ['feComponentTransfer', 'feFlood', 'feComposite', 'feMerge']);
    assert.strictEqual(backing.querySelector('feFlood').getAttribute('flood-color'), '#f0ebdf', 'the cream colour');
    assert.ok(doc.getElementById('ll-symbol-white-matte'), 'the older matte filter is kept');
  });

  test('stays out of layout and away from assistive technology', function(assert) {
    var svg = install_symbol_filters(freshDoc());
    assert.strictEqual(svg.getAttribute('aria-hidden'), 'true');
    assert.strictEqual(svg.getAttribute('width'), '0');
    assert.strictEqual(svg.getAttribute('height'), '0');
    assert.ok(/position:\s*absolute/.test(svg.getAttribute('style')));
  });

  test('a second call adds nothing', function(assert) {
    var doc = freshDoc();
    var first = install_symbol_filters(doc);
    var second = install_symbol_filters(doc);
    assert.strictEqual(second, first);
    assert.strictEqual(doc.querySelectorAll('#ll-symbol-white-backing').length, 1);
    assert.strictEqual(doc.querySelectorAll('#' + SYMBOL_FILTERS_ID).length, 1);
  });

  test('the app initializer installs them in the page', function(assert) {
    assert.expect(3);
    // tests/test-helper.js installs them for every test; take that copy out to start from a page without them, and put
    // it back afterwards so the page is as the next test expects
    var original = document.getElementById(SYMBOL_FILTERS_ID);
    if(original) { original.remove(); }
    try {
      assert.strictEqual(document.getElementById('ll-symbol-white-backing'), null, 'no copy in the test page HTML');
      symbolFiltersInitializer.initialize();
      assert.ok(document.getElementById('ll-symbol-white-backing'));
      assert.strictEqual(symbolFiltersInitializer.name, 'symbol-filters');
    } finally {
      var added = document.getElementById(SYMBOL_FILTERS_ID);
      if(added) { added.remove(); }
      if(original) { document.body.appendChild(original); }
    }
  });
});
