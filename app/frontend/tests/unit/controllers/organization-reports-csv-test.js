import { module, test } from 'qunit';
import { setupTest } from '../../helpers';

/*
 * Org user-report CSV (KAN-124 / GitHub #383).
 *
 * download_list used to do columns.join(',') with no quoting and no formula
 * guard. A referrer/ad_referrer (or any other user-supplied column) of =1+1
 * is a live Excel formula; a name with a comma and a quote shifts columns.
 * The decoded data:text/csv body is the user-visible file.
 *
 * Exact-body assertions so a partial encoder (quote only some columns, prefix
 * only '=', skip String() on numbers, stringify null as "null") cannot pass.
 *
 * Mutation that must go red: restore columns.join(',') in
 * controllers/organization/reports.js download_list (both the list and stats
 * rows).
 *
 * click is a no-op on HTMLAnchorElement: the production action always
 * element.click()s a data: URI, which hangs headless Chrome on a download.
 */
module('Unit | Controller | organization/reports CSV download', function(hooks) {
  setupTest(hooks);

  var origClick;
  var origCreateElement;

  hooks.beforeEach(function() {
    origClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function() { };
    origCreateElement = document.createElement;
  });

  hooks.afterEach(function() {
    HTMLAnchorElement.prototype.click = origClick;
    document.createElement = origCreateElement;
  });

  function captureDownload(controller) {
    var captured = null;
    document.createElement = function(name) {
      var el = origCreateElement.call(document, name);
      if(name === 'a') { captured = el; }
      return el;
    };
    controller.send('download_list');
    return captured;
  }

  function csvBody(el) {
    var prefix = 'data:text/csv;charset=utf-8,';
    var href = el && el.getAttribute && el.getAttribute('href');
    if(typeof href !== 'string' || href.indexOf(prefix) !== 0) {
      return '';
    }
    return decodeURIComponent(href.slice(prefix.length));
  }

  test('quotes commas, quotes and newlines, and prefixes a formula guard on =1+1', function(assert) {
    var controller = this.owner.lookup('controller:organization/reports');
    controller.set('results', {
      list: [{
        name: 'a\nb,"c',
        user_name: '+1',
        email: null,
        joined: '2026-01-01T00:00:00Z',
        registration_type: 'communicator',
        referrer: '=1+1',
        ad_referrer: '=HYPERLINK("http://evil.example")'
      }]
    });

    var el = captureDownload(controller);
    var csv = csvBody(el);
    var expected = '"a\nb,""c","\'+1","","2026-01-01T00:00:00Z","communicator","\'=1+1","\'=HYPERLINK(""http://evil.example"")"';

    assert.ok(el, 'download link was created');
    assert.strictEqual(el.getAttribute('download'), 'users.csv');
    assert.strictEqual(csv, expected);
  });

  test('stats.csv uses the same quoting and formula guard, including numeric values', function(assert) {
    var controller = this.owner.lookup('controller:organization/reports');
    controller.set('results', {
      list: null,
      stats: [
        {key: '=1+1', value: 12},
        {key: 'hello,"x', value: 3}
      ]
    });

    var el = captureDownload(controller);
    var csv = csvBody(el);
    var expected = '"\'=1+1","12"\n"hello,""x","3"';

    assert.ok(el, 'download link was created');
    assert.strictEqual(el.getAttribute('download'), 'stats.csv');
    assert.strictEqual(csv, expected);
  });
});
