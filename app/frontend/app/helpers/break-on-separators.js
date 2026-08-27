import { helper } from '@ember/component/helper';
import { htmlSafe } from '@ember/template';

/**
 * Insert explicit line-break opportunities after the separators in an
 * identifier-ish string (usernames: `aiden_parker`, `mrs-oconnell`, `sam.diaz`).
 *
 * WHY THIS EXISTS: CSS cannot express "break at the underscore". Per the Unicode
 * line-breaking algorithm (UAX #14) `_` is class AL — an ordinary letter — so it
 * is NOT a break opportunity, and neither is `.`, `@` or `+` mid-token. Only
 * hyphens are. So `aiden_parker` is one unbreakable run: it either overflows its
 * box, or — with `overflow-wrap: anywhere` — the browser fills greedily and
 * breaks wherever the line runs out, giving "aiden_parke / r".
 *
 * A `<wbr>` is the standards-defined "you may break here" marker, so adding one
 * after each separator run makes the separator the PREFERRED break point while
 * leaving the string visually identical (it renders nothing, and copying the text
 * yields the original username — unlike a zero-width space, which is a real
 * character that lands in the clipboard and in search).
 *
 * Pair this with `overflow-wrap: break-word` (not `anywhere`) on the consuming
 * rule: the browser then breaks at a `<wbr>` when one fits, and only falls back
 * to mid-token breaking for a genuinely separator-less name (`aidenparkerson`).
 *
 * SAFETY: the value is HTML-escaped BEFORE the markers are inserted, and only the
 * literal `<wbr>` tags are added, so a hostile username cannot inject markup. The
 * escaped entities (`&amp;` `&lt;` `&gt;` `&quot;` `&#39;`) deliberately share no
 * characters with SEPARATORS, so escaping can never manufacture a false break.
 */

// A break may follow a RUN of these, so `foo__bar` breaks once, after `__`.
var SEPARATORS = /([_\-.+@/\\|:]+)/g;

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function breakOnSeparators(value) {
  // Preserve null/undefined/'' untouched so callers render blank, not "null".
  if(value === null || value === undefined || value === '') { return value; }
  return htmlSafe(escapeHtml(value).replace(SEPARATORS, '$1<wbr>'));
}

export default helper(function([value]) {
  return breakOnSeparators(value);
});
