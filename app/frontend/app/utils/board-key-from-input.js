/* Turn a pasted board page URL or owner/key into the board key used by
   `store.query('board', {key: ...})`.

   The destination picker only lists root tiles, so editors need a way to
   link a brand-set sub-board (e.g. lingolinq/vocal-flair-84-questions)
   by pasting its page URL. `find_board` used to strip only the current
   host prefix, so a URL copied from production while editing on localhost
   (or the other way around) never matched. */
export default function boardKeyFromInput(str) {
  var s = (str == null ? '' : String(str)).trim();
  if(!s) { return ''; }
  s = s.replace(/[?#].*$/, '');
  var urlMatch = s.match(/^https?:\/\/[^/]+\/(.+)$/i);
  if(urlMatch) { s = urlMatch[1]; }
  s = s.replace(/^\/+/, '');
  s = s.replace(/^boards\//i, '');
  var parts = s.split('/').filter(Boolean);
  if(parts.length >= 2) {
    return parts[0] + '/' + parts[1];
  }
  return s;
}
