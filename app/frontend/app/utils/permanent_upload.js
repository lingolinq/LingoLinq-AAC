// Whether a URL is a LingoLinq upload (picture or sound) whose bytes never change (#1221, PR #1268).
//
// An upload is stored once at images|sounds/<id digits>/<global_id>-<sha512 hex> plus a suffix
// (app/models/concerns/uploadable.rb:58-80); transcoding writes a new key ending v<unix time>
// (app/models/concerns/media_object.rb:87), never over the old one. Production serves the key from a CDN and other
// environments from the bucket (lib/uploader.rb fronted_url), virtual-hosted or path-style, so the host is not
// checked: only the path, which must start with the key (after at most one bucket segment). Button-set and
// extra-data files share the host but live under extras.../ and do change, so they never match.
var UPLOAD_PATH = /^\/(?:[^/]+\/)?(?:images|sounds)\/(?:\d\/)+\d+_\d+-[0-9a-f]{128}[^/]*$/;

export function is_permanent_upload_url(url) {
  if(typeof url !== 'string' || !url.match(/^https?:\/\//)) { return false; }
  var path;
  try { path = new URL(url).pathname; } catch(e) { return false; }
  return UPLOAD_PATH.test(path);
}
