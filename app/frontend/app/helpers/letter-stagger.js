import { helper } from '@ember/component/helper';
import { htmlSafe } from '@ember/template';

/**
 * Render a TRANSLATED string as per-character spans with a staggered
 * animation-delay, for the `.ub-letter` typewriter effect.
 *
 * WHY THIS EXISTS: the two sites using that effect (the Boards hero's
 * "Communicate" and the Create Board "Generate with AI" button) hardcoded one
 * `<span class="ub-letter">` per ENGLISH letter, translating only the parent's
 * `aria-label`. So in all twelve non-English locales the visible text was English
 * while the accessible name was translated — sighted and screen-reader users read
 * different labels, and the string was effectively untranslated.
 *
 * CURSIVE AND COMBINING SCRIPTS ARE NOT SPLIT. `.ub-letter` is
 * `display: inline-block`, and boxing each character forces Arabic letters into
 * their ISOLATED forms — the joining that makes the word legible is lost, so the
 * text is not merely styled differently, it is hard to read. Devanagari conjuncts
 * and Thai/Lao/Khmer combining marks break the same way. For any string
 * containing such a script the whole thing is emitted as ONE span with no
 * animation (`--plain`), which is the deliberate choice: correct text beats an
 * entrance effect.
 *
 * Detection is on the STRING's own code points, not the active locale — a
 * translation may contain any script regardless of which file it came from, and a
 * locale may legitimately hold Latin text.
 *
 * SAFETY: every character is HTML-escaped before any markup is added, following
 * helpers/break-on-separators.js. Only literal `<span>` tags and a numeric
 * animation-delay are inserted, so a hostile translation cannot inject markup.
 */

/* Scripts where per-character boxing is destructive, as \u ranges:
     0590-08FF  Hebrew, Arabic, Syriac, Thaana, Arabic Extended (cursive joining
                and combining points)
     0900-0DFF  Devanagari through Sinhala (conjuncts, matras)
     0E00-109F  Thai, Lao, Tibetan, Myanmar (marks above/below)
     FB1D-FDFF  Hebrew + Arabic Presentation Forms-A
     FE70-FEFF  Arabic Presentation Forms-B */
var NO_SPLIT_SCRIPTS = /[\u0590-\u08FF\u0900-\u0DFF\u0E00-\u109F\uFB1D-\uFDFF\uFE70-\uFEFF]/;

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/* Grapheme clusters, not UTF-16 code units: `'x'.split('')` severs surrogate pairs
   and separates combining marks from their base, so an emoji or an accented
   character would render as two broken boxes. */
function graphemes(str) {
  try {
    if(typeof Intl !== 'undefined' && Intl.Segmenter) {
      var seg = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
      return Array.from(seg.segment(str), function(s) { return s.segment; });
    }
  } catch(e) { /* fall through to the code-point split */ }
  return Array.from(str);
}

export function letterStagger(value, opts) {
  if(value === null || value === undefined || value === '') { return value; }
  var str = String(value);
  var o = opts || {};
  var start = (o.start === undefined || o.start === null) ? 0 : parseFloat(o.start);
  var step = (o.step === undefined || o.step === null) ? 0.06 : parseFloat(o.step);
  if(isNaN(start)) { start = 0; }
  if(isNaN(step)) { step = 0.06; }

  if(NO_SPLIT_SCRIPTS.test(str)) {
    return htmlSafe('<span class="ub-letter ub-letter--plain" aria-hidden="true">' + escapeHtml(str) + '</span>');
  }

  var out = graphemes(str).map(function(ch, i) {
    var delay = (start + (i * step)).toFixed(2);
    /* Whitespace keeps the cadence contiguous across word boundaries and needs a
       non-collapsing width, matching the markup this replaces. */
    if(/^\s+$/.test(ch)) {
      return '<span class="ub-letter ub-letter--space" style="animation-delay:' + delay + 's" aria-hidden="true">&nbsp;</span>';
    }
    return '<span class="ub-letter" style="animation-delay:' + delay + 's" aria-hidden="true">' + escapeHtml(ch) + '</span>';
  }).join('');
  return htmlSafe(out);
}

export default helper(function([value], named) {
  return letterStagger(value, named);
});
