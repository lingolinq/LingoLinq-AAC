import { module, test } from 'qunit';
import { breakOnSeparators } from 'frontend/helpers/break-on-separators';

// Guards the username-wrapping fix. Per UAX #14 an underscore is class AL (an
// ordinary letter) and is NOT a line-break opportunity, so `aiden_parker` is one
// unbreakable run — CSS alone cannot wrap it at the separator. This helper supplies
// the break opportunity in the markup with <wbr>; the consuming rules then use
// `overflow-wrap: break-word` (never `anywhere`) so that opportunity is preferred.
//
// The escaping assertions are the important ones: the helper returns a SafeString,
// so a regression there is an XSS hole, not a cosmetic bug.
module('Unit | Helper | break-on-separators', function() {
  var str = function(v) { return v && v.toString ? v.toString() : v; };

  test('inserts a break opportunity after an underscore', function(assert) {
    assert.equal(str(breakOnSeparators('aiden_parker')), 'aiden_<wbr>parker');
  });

  test('handles the other identifier separators', function(assert) {
    assert.equal(str(breakOnSeparators('sam.diaz')), 'sam.<wbr>diaz');
    assert.equal(str(breakOnSeparators('mrs-oconnell')), 'mrs-<wbr>oconnell');
    assert.equal(str(breakOnSeparators('a@b')), 'a@<wbr>b');
  });

  test('treats a RUN of separators as one break point', function(assert) {
    assert.equal(str(breakOnSeparators('foo__bar')), 'foo__<wbr>bar',
      'one <wbr> after the run, not one per character');
  });

  test('leaves a name with no separator untouched', function(assert) {
    assert.equal(str(breakOnSeparators('aidenparkerson')), 'aidenparkerson',
      'no separator -> no marker; CSS break-word is the fallback for these');
  });

  test('passes null/undefined/empty through unchanged', function(assert) {
    assert.equal(breakOnSeparators(null), null);
    assert.equal(breakOnSeparators(undefined), undefined);
    assert.equal(breakOnSeparators(''), '');
  });

  // SECURITY: the return value is rendered unescaped (htmlSafe), so the helper must
  // escape first and add only its own literal <wbr> tags.
  test('escapes HTML before inserting markers', function(assert) {
    var out = str(breakOnSeparators('<img src=x onerror=alert(1)>'));
    assert.notOk(/<img/.test(out), 'the raw tag does not survive');
    assert.ok(out.indexOf('&lt;img') === 0, 'it is escaped instead');
  });

  test('escapes quotes and ampersands', function(assert) {
    assert.equal(str(breakOnSeparators('a&b')), 'a&amp;b');
    assert.equal(str(breakOnSeparators('a"b')), 'a&quot;b');
    assert.equal(str(breakOnSeparators("a'b")), 'a&#39;b');
  });

  // The escaped entities (&amp; &lt; &gt; &quot; &#39;) must share no characters
  // with the separator set, or escaping could manufacture a break inside an entity
  // and corrupt it.
  test('escaping never manufactures a break inside an entity', function(assert) {
    var out = str(breakOnSeparators('a&b<c>d"e'));
    assert.notOk(/&amp<wbr>;/.test(out), 'entity not split');
    assert.notOk(/&[a-z]+<wbr>/.test(out), 'no marker inserted inside an entity');
    assert.equal(out, 'a&amp;b&lt;c&gt;d&quot;e');
  });

  test('does not emit a zero-width space', function(assert) {
    var out = str(breakOnSeparators('aiden_parker'));
    // \u200B written as an escape on purpose — a literal ZWSP here is invisible in
    // the source and trips no-irregular-whitespace.
    assert.notOk(/\u200B/.test(out),
      'U+200B would land in the clipboard and in search; <wbr> does not');
  });
});
