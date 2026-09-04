import { module, test } from 'qunit';
import { letterStagger } from 'frontend/helpers/letter-stagger';

function html(v) { return (v && v.toString) ? v.toString() : v; }
function count(str, re) { return (str.match(re) || []).length; }

module('Unit | Helper | letter-stagger', function() {
  test('splits Latin text into one span per character', function(assert) {
    assert.expect(3);
    var out = html(letterStagger('AI', {}));
    assert.strictEqual(count(out, /class="ub-letter"/g), 2, 'one span per letter');
    assert.notStrictEqual(out.indexOf('>A<'), -1, 'first character preserved');
    assert.notStrictEqual(out.indexOf('>I<'), -1, 'second character preserved');
  });

  test('staggers the delay from start by step', function(assert) {
    assert.expect(3);
    var out = html(letterStagger('abc', { start: 0.25, step: 0.06 }));
    assert.notStrictEqual(out.indexOf('animation-delay:0.25s'), -1, 'first uses start');
    assert.notStrictEqual(out.indexOf('animation-delay:0.31s'), -1, 'second is start+step');
    assert.notStrictEqual(out.indexOf('animation-delay:0.37s'), -1, 'third is start+2*step');
  });

  test('whitespace keeps the cadence and a non-collapsing width', function(assert) {
    assert.expect(2);
    var out = html(letterStagger('a b', {}));
    assert.notStrictEqual(out.indexOf('ub-letter--space'), -1, 'space gets its modifier');
    assert.notStrictEqual(out.indexOf('&nbsp;'), -1, 'space renders a non-breaking space');
  });

  test('does NOT split Arabic — boxing each letter breaks cursive joining', function(assert) {
    assert.expect(3);
    var out = html(letterStagger('إنشاء', {}));
    assert.notStrictEqual(out.indexOf('ub-letter--plain'), -1, 'emitted as one plain span');
    assert.strictEqual(count(out, /class="ub-letter"/g), 0, 'no per-character spans');
    assert.strictEqual(out.indexOf('animation-delay'), -1, 'no animation');
  });

  test('does NOT split Devanagari or Thai — conjuncts and combining marks', function(assert) {
    assert.expect(2);
    assert.notStrictEqual(html(letterStagger('एआई', {})).indexOf('ub-letter--plain'), -1, 'Devanagari is plain');
    assert.notStrictEqual(html(letterStagger('สร้าง', {})).indexOf('ub-letter--plain'), -1, 'Thai is plain');
  });

  test('CJK is safe to split — no contextual joining', function(assert) {
    assert.expect(2);
    var out = html(letterStagger('作成', {}));
    assert.strictEqual(out.indexOf('ub-letter--plain'), -1, 'not treated as unsplittable');
    assert.strictEqual(count(out, /class="ub-letter"/g), 2, 'one span per character');
  });

  test('escapes HTML in the translated string', function(assert) {
    assert.expect(2);
    var out = html(letterStagger('<b>', {}));
    assert.notStrictEqual(out.indexOf('&lt;'), -1, 'angle brackets escaped');
    assert.strictEqual(out.indexOf('<b>'), -1, 'no raw markup emitted');
  });

  test('keeps combining marks with their base character', function(assert) {
    assert.expect(1);
    var out = html(letterStagger('é', {}));
    assert.strictEqual(count(out, /class="ub-letter"/g), 1, 'e + combining acute is ONE grapheme');
  });

  test('passes through empty and nullish values', function(assert) {
    assert.expect(3);
    assert.strictEqual(letterStagger('', {}), '');
    assert.strictEqual(letterStagger(null, {}), null);
    assert.strictEqual(letterStagger(undefined, {}), undefined);
  });
});
