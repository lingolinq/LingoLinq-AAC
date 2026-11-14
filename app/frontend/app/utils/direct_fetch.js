// Two checks for the direct picture, sound and file requests in store_url_now (services/persistence.js and its
// second copy in utils/persistence.js), which skip the server's proxy (/api/v1/search/proxy) (#1212, PR #1268).

// Production serves uploads from this CDN (UPLOADS_S3_CDN, lib/uploader.rb fronted_url). It answers any origin, so
// the app can ask it directly for pictures and sounds. Staging and dev serve uploads from the bucket host, which
// store_url_now already matches. If the CDN host ever changes, these requests go back through the proxy and still
// work. Button-set files on the same host (type 'json') stay on the proxy: a direct request for one has not been
// tried against production.
var UPLOADS_CDN = /^https:\/\/d34sa6lc5jfe66\.cloudfront\.net\//;

export function on_uploads_cdn(url, type) {
  return (type === 'image' || type === 'sound') && typeof url === 'string' && UPLOADS_CDN.test(url);
}

// A network that filters or signs people in (a school filter, a hotel Wi-Fi page) can answer a direct request with
// status 200 and a web page. Nothing store_url_now asks for is a web page, so such an answer is refused and the
// request falls back to the proxy, which checks the type on the server.
export function is_web_page(content_type) {
  return /^text\/html/i.test(content_type || '');
}
