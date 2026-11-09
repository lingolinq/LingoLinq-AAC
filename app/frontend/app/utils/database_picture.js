// Pictures and sounds kept in the database when the device has no file storage (#1221, PR #1268).
//
// With no file storage (iPad Safari and the Home Screen app, or after a quota error) store_url_now keeps a picture in
// its dataCache row as a data: URI (services/persistence.js, the no-file store branch). A row that holds the picture
// itself can be reused instead of downloaded and written again: if the row exists, its write landed. A row in the
// installed app WITH file storage only points to a file that may be missing, so it is not covered here.

// Which requests may be answered from such a row: pictures and sounds, but not protected images (the server can
// answer those with a fallback picture) and not language files.
export function picture_kept_in_database(url, type) {
  if(type != 'image' && type != 'sound') { return false; }
  if(typeof url !== 'string' || url.match(/api\/v\d+\/users\/.+\/protected_image/) || url.match(/api\/v\d+\/lang/)) { return false; }
  return true;
}

// Whether a found row holds a usable copy: the picture data itself, of the requested kind, and not out of date
// (find marks rows saved over a week ago that the last sync did not list as important; services/persistence.js find).
export function usable_database_copy(url, type, row) {
  if(!picture_kept_in_database(url, type) || !row || row.outdated) { return false; }
  if(typeof row.data_uri !== 'string' || !row.data_uri.match(/^data:/)) { return false; }
  var kind = type == 'sound' ? /^audio\// : /^image\//;
  return kind.test(row.content_type || '');
}
