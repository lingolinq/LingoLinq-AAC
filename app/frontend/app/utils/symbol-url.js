/* Shared OpenSymbols URL rewrites for persistence layers. */
export function rewriteBrokenSymbolUrl(url) {
  if (!url) { return url; }
  /* OpenSymbols removed arasaac/no_2.png (403 + XML); no.png is the live asset. */
  if (/\/libraries\/arasaac\/no_2\.png(\?|$)/i.test(url)) {
    return url.replace(/\/no_2\.png/i, '/no.png');
  }
  return url;
}

export default rewriteBrokenSymbolUrl;
