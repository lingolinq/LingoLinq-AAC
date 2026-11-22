// The SVG filters that app.scss applies to AAC symbols with `filter: url(#...)`:
// - ll-symbol-white-backing: the Colored-mode cream backing (app.scss, `.symbol_background_clear ... img.symbol`, Basic
//   and Modern grids and the sentence bar).
// - ll-symbol-white-matte: the older white-matte knockout, kept for any style that still names it.
//
// They used to live only in app/index.html, which `ember serve` and the mobile builds use. Every deployed web page is
// served by Rails from app/views/boards/index.html.erb, which never had them, so on the web Chrome and Safari skipped
// the missing filter (no cream backing) and Firefox drew no symbol at all
// (docs/task-management/2026-11-21_firefox-symbol-filter.md). Inserting them from the app, once, puts them in every
// shell from one source.
//
// Original notes from app/index.html: the white-matte filter knocks out near-pure-white pixels (imported PNG mattes)
// via alpha only, so symbol RGB stays intact, unlike mix-blend-mode multiply which tints art with the button color.

export var SYMBOL_FILTERS_ID = 'll-symbol-filters';

export var SYMBOL_FILTERS_SVG = `<svg aria-hidden="true" focusable="false" width="0" height="0" style="position:absolute;overflow:hidden">
  <defs>
    <filter id="ll-symbol-white-matte" color-interpolation-filters="sRGB">
      <feColorMatrix in="SourceGraphic" type="matrix" result="matteMask" values="
        1 0 0 0 0
        0 1 0 0 0
        0 0 1 0 0
        -1 -1 -1 0 3"/>
      <feComponentTransfer in="matteMask" result="alphaMask">
        <feFuncA type="linear" slope="8" intercept="-0.96"/>
      </feComponentTransfer>
      <feComposite in="SourceGraphic" in2="alphaMask" operator="in"/>
    </filter>
    <!-- AAC symbol backing (Colored mode). These symbols carry their OWN baked
         white halo/background; the old matte filter knocked it out (causing the
         card color to bleed through). This filter instead PRESERVES that white
         but RECOLORS it to a subtle off-white (#f0ebdf) so symbols read softer
         on colored cards, then backs any semi-transparent edges with the same
         off-white. The feComponentTransfer tables are ~identity below 0.9 and
         pull only near-white toward the cream target per channel
         (R 240/255≈0.941, G 235/255≈0.922, B 223/255≈0.875), so colored art is
         essentially untouched and alpha is preserved (transparent stays
         transparent). CAVEAT: this tints ALL near-white pixels, so genuinely
         white parts of the ARTWORK (milk, highlights) also go cream — subtle,
         but it can't tell background-white from art-white. -->
    <filter id="ll-symbol-white-backing" color-interpolation-filters="sRGB" x="0%" y="0%" width="100%" height="100%">
      <feComponentTransfer in="SourceGraphic" result="tinted">
        <feFuncR type="table" tableValues="0 0.1 0.2 0.3 0.4 0.5 0.6 0.7 0.8 0.9 0.941"/>
        <feFuncG type="table" tableValues="0 0.1 0.2 0.3 0.4 0.5 0.6 0.7 0.8 0.9 0.922"/>
        <feFuncB type="table" tableValues="0 0.1 0.2 0.3 0.4 0.5 0.6 0.7 0.8 0.9 0.875"/>
      </feComponentTransfer>
      <feFlood flood-color="#f0ebdf" result="creamFill"/>
      <feComposite in="creamFill" in2="SourceAlpha" operator="in" result="creamBacking"/>
      <feMerge>
        <feMergeNode in="creamBacking"/>
        <feMergeNode in="tinted"/>
      </feMerge>
    </filter>
  </defs>
</svg>`;

// Adds the filters to `doc`'s body unless they are already there. Returns the <svg> element, or null without a body.
export function install_symbol_filters(doc) {
  doc = doc || (typeof document !== 'undefined' ? document : null);
  if(!doc || !doc.body) { return null; }
  var existing = doc.getElementById(SYMBOL_FILTERS_ID);
  if(existing) { return existing; }
  var holder = doc.createElement('div');
  holder.innerHTML = SYMBOL_FILTERS_SVG;
  var svg = holder.firstElementChild;
  svg.setAttribute('id', SYMBOL_FILTERS_ID);
  doc.body.appendChild(svg);
  return svg;
}
