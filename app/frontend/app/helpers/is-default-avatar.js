import { helper } from '@ember/component/helper';

// Detects the legacy default-avatar PNG fallback that the user model
// returns when no real photo has been uploaded (see
// `User.avatar_url_with_fallback` and the `/avatars/avatar-N.png`
// placeholders served from public/avatars/). Used in templates to
// swap the dated silhouette PNG for a modern inline SVG icon while
// still showing real user-uploaded photos when present.
//
// Matches a wide variety of paths to handle production (signed S3
// URLs, asset-fingerprinted paths, CDN prefixes) as well as plain
// paths in dev:
//   /avatars/avatar-6.png
//   ./avatars/avatar-6.png
//   /assets/avatars/avatar-6.png
//   https://bucket.s3.amazonaws.com/avatars/avatar-6.png?token=...
//   /avatars/avatar-6-abc1234.png   (fingerprinted)
export default helper(function([url]) {
  if(!url) { return true; }
  var s = String(url);
  // Any URL that contains "/avatars/avatar-" followed by digits and
  // optionally a fingerprint, then `.png`, is one of our defaults.
  return /(?:^|\/)avatars\/avatar-\d+(?:-[a-f0-9]+)?\.png(?:\?|#|$)/i.test(s);
});
